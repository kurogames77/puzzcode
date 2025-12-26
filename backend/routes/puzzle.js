const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const path = require('path');
const { difficultyFromBeta, difficultyToBeta } = require('../config/difficulty');
const { ENABLE_RULE_OVERRIDES, EXPERIMENT_PURE_DDA, ENABLE_WARM_ALGO_SERVICE, ENABLE_SUMMARY_CACHE } = require('../config/featureFlags');
const logger = require('../utils/logger');
const { validatePuzzleAttempt } = require('../validation/puzzleAttemptSchema');
const { callPuzzleAdjust } = require('../services/algorithmClient');
const { callPuzzleAdjustFallback } = require('../services/pythonFallback');
const { evaluateDifficultyRules } = require('../services/difficultyRules');
const { getLessonSummary, primeLessonSummary } = require('../services/performanceSummary');
const { error, ok } = require('../utils/http');
const {
  calculateExpGain,
  normalizeExp,
  getRankFromExp,
  getSuccessLevel,
  getFailLevel,
  checkAchievements,
  updateStreaks
} = require('../services/expRankService');
const { safeRollback, safeRollbackToSavepoint } = require('../utils/errorHandler');

const HINT_EXP_COST = 100;

/**
 * POST /api/puzzle/attempt
 * Records a puzzle attempt and runs the adaptive difficulty algorithm
 */
router.post('/attempt', authenticateToken, requireStudent, rateLimit, async (req, res) => {
  const client = await pool.connect();
  try {
    logger.log('puzzle_attempt_received', {
      userId: req.user?.id,
      levelId: req.body?.levelId,
      lessonId: req.body?.lessonId,
      success: req.body?.success,
      rawBody: req.body,
      timestamp: new Date().toISOString()
    });
    
    await client.query('BEGIN');
    
    // Schema validation with Zod
    const validation = validatePuzzleAttempt(req.body);
    if (!validation.valid) {
      const errorDetails = {
        userId: req.user?.id,
        errors: validation.errors,
        body: req.body,
        bodyKeys: Object.keys(req.body || {}),
        bodyType: typeof req.body,
        bodyStringified: JSON.stringify(req.body)
      };
      logger.warn('puzzle_attempt_validation_failed', errorDetails);
      console.error('❌ VALIDATION FAILED - Full details:', errorDetails);
      await client.query('ROLLBACK');
      return error(res, 400, 'Invalid payload', { 
        errors: validation.errors,
        receivedBody: req.body,
        bodyKeys: Object.keys(req.body || {})
      });
    }
    
    logger.log('puzzle_attempt_validation_passed', {
      userId: req.user?.id,
      levelId: validation.data.levelId,
      lessonId: validation.data.lessonId,
      success: validation.data.success
    });
    const { levelId, lessonId, success, attemptTime, codeSubmitted, expectedOutput, actualOutput, attemptId } = validation.data;
    const userId = req.user.id;

    // Generate attempt_id if not provided (for idempotency and tracking)
    // Use crypto.randomUUID() for UUID generation, fallback to timestamp-based ID
    const generatedAttemptId = attemptId || (() => {
      try {
        const crypto = require('crypto');
        return crypto.randomUUID();
      } catch (e) {
        // Fallback: timestamp + random string
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      }
    })();

    // Optional: idempotency check if attemptId provided and column exists (no-op if not)
    if (generatedAttemptId) {
      try {
        const idem = await client.query(
          'SELECT id FROM puzzle_attempt WHERE attempt_id = $1 AND user_id = $2 LIMIT 1',
          [generatedAttemptId, userId]
        );
        if (idem.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(200).json({ success: true, duplicate: true });
        }
      } catch (e) {
        // If the column doesn't exist, proceed without idempotency
      }
    }

    // Get level information (including beta value)
    const levelResult = await client.query(
      'SELECT id, lesson_id, difficulty, level_number, beta FROM levels WHERE id = $1',
      [levelId]
    );

    if (levelResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return error(res, 404, 'Level not found');
    }

    const level = levelResult.rows[0];
    const resolvedLessonId = lessonId || level.lesson_id;
    const currentLevelNumber = level.level_number;
    
    // Get lesson difficulty for rule evaluation
    let lessonDifficulty = null;
    if (resolvedLessonId) {
      const lessonResult = await client.query(
        'SELECT difficulty FROM lessons WHERE id = $1',
        [resolvedLessonId]
      );
      if (lessonResult.rows.length > 0) {
        lessonDifficulty = lessonResult.rows[0].difficulty;
      }
    }

    // Get or create student progress for this level (lock row for update)
    let progressResult = await client.query(
      `SELECT * FROM student_progress 
       WHERE user_id = $1 AND level_id = $2
       FOR UPDATE`,
      [userId, levelId]
    );

    let progress;
    if (progressResult.rows.length === 0) {
      // Create new progress record with default values
      // prev_theta is NULL initially (no previous value)
      const insertResult = await client.query(
        `INSERT INTO student_progress 
         (user_id, level_id, lesson_id, theta, prev_theta, beta, prev_beta, success_count, fail_count, total_attempts, sessions_played)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [userId, levelId, resolvedLessonId, 0.0, null, 0.5, null, 0, 0, 0, 1]
      );
      progress = insertResult.rows[0];
    } else {
      progress = progressResult.rows[0];
    }

    // Get student statistics for rank, achievements, EXP, and streaks
    const statsResult = await client.query(
      `SELECT rank_name, rank_index, completed_achievements, total_success_count, total_fail_count, 
              exp, normalized_exp, current_streak, longest_streak 
       FROM student_statistics WHERE user_id = $1`,
      [userId]
    );
    const stats = statsResult.rows[0] || {
      rank_name: 'novice',
      rank_index: 0,
      completed_achievements: 0,
      total_success_count: 0,
      total_fail_count: 0,
      exp: 0,
      normalized_exp: 0.0,
      current_streak: 0,
      longest_streak: 0
    };

    // Update success/fail counts
    const newSuccessCount = success ? progress.success_count + 1 : progress.success_count;
    const newFailCount = success ? progress.fail_count : progress.fail_count + 1;
    const newTotalAttempts = progress.total_attempts + 1;

    // Get beta value from level (admin-defined) or use default mapping from config
    const currentBeta = level.beta || progress.beta || difficultyToBeta[level.difficulty] || 0.5;
    
    // Calculate actual success rate for performance evaluation
    const actualSuccessRate = newTotalAttempts > 0 ? newSuccessCount / newTotalAttempts : 0.5;
    const targetSuccessRate = 0.7;
    const errorsThresholdMet = success && newFailCount >= 5;
    const belowTargetPerformance = actualSuccessRate < targetSuccessRate;
    
    // Get lesson summary for rule evaluation (cached)
    const summaryHistory = ENABLE_SUMMARY_CACHE
      ? await getLessonSummary(client, { userId, lessonId: resolvedLessonId })
      : { attempts: [], failCounts: {} };
    
    logger.log('performance_eval', {
      userId,
      lessonId: resolvedLessonId,
      levelId,
      currentLevelNumber,
      currentDifficulty: level.difficulty,
      success: newSuccessCount,
      fail: newFailCount,
      total: newTotalAttempts,
      actualSuccessRate,
      targetSuccessRate,
      errorsThresholdMet,
      belowTargetPerformance,
    });

    // Call Python algorithm: prefer warm service, fallback to child_process
    const algorithmInput = {
      user_id: userId,
      level_id: levelId,
      theta: progress.theta || 0.0,
      beta_old: currentBeta,
      rank_name: stats.rank_name || 'novice',
      completed_achievements: stats.completed_achievements || 0,
      success_count: newSuccessCount,
      fail_count: newFailCount,
      target_performance: 0.7,
      adjustment_rate: 0.1,
      auto_sync: true,
    };

    let algorithmResult;
    let algorithmSource = 'none';
    try {
      if (ENABLE_WARM_ALGO_SERVICE) {
        algorithmResult = await callPuzzleAdjust(algorithmInput);
        algorithmSource = 'warm_service';
      } else {
        throw new Error('Warm service disabled');
      }
    } catch (algoError) {
      logger.warn('algorithm_service_fallback', {
        userId,
        levelId,
        error: algoError.message,
        code: algoError.code,
      });
      try {
        algorithmResult = await callPuzzleAdjustFallback(algorithmInput);
        algorithmSource = 'python_fallback';
      } catch (fallbackErr) {
        logger.error('algorithm_fallback_failed', {
          userId,
          levelId,
          error: fallbackErr.message,
        });
        // Graceful degradation: use defaults
        algorithmResult = {
          summary: {
            New_Beta: currentBeta,
            Next_Puzzle_Difficulty: level.difficulty,
            Student_Skill: progress.theta || 0.0,
          },
          IRT_Result: {
            adjusted_theta: progress.theta || 0.0,
            probability: 0.5,
          },
        };
        algorithmSource = 'defaults';
      }
    }

    const summary = algorithmResult.summary || {};
    const irtResult = algorithmResult.IRT_Result || {};
    const ddaResult = algorithmResult.DDA_Result || {};

    // Get adjusted beta from DDA algorithm
    const algorithmBeta = ddaResult.beta_new || summary.New_Beta || currentBeta;
    
    logger.log('algorithm_suggested', {
      userId,
      levelId,
      betaSuggested: algorithmBeta,
      betaCurrent: currentBeta,
      source: algorithmSource,
    });

    // Evaluate difficulty rules (centralized)
    // If EXPERIMENT_PURE_DDA is enabled, skip rules entirely
    const ruleResult = EXPERIMENT_PURE_DDA
      ? { beta: algorithmBeta, difficulty: difficultyFromBeta(algorithmBeta), audit: [{ rule: 'pure_dda', applied: false }] }
      : evaluateDifficultyRules({
          algorithmBeta,
          currentBeta,
          levelId,
          currentLevelNumber,
          levelDifficulty: level.difficulty,
          lessonDifficulty,
          success,
          attemptTime,
          newFailCount,
          enableRules: ENABLE_RULE_OVERRIDES,
          summary: summaryHistory,
        });

    const newBeta = ruleResult.beta;
    const newDifficultyLabel = ruleResult.difficulty;
    const ruleAudit = ruleResult.audit || [];

    // Log rule evaluation with reasons
    const appliedRule = ruleAudit.find((r) => r.applied) || ruleAudit[0];
    logger.log('difficulty_rule_evaluated', {
      userId,
      levelId,
      lessonId: resolvedLessonId,
      lessonDifficulty,
      algorithmBeta,
      currentBeta,
      newBeta,
      oldDifficulty: level.difficulty,
      newDifficulty: newDifficultyLabel,
      rule: appliedRule?.rule || 'none',
      ruleApplied: appliedRule?.applied || false,
      audit: ruleAudit,
    });

    // Prime cache with current attempt (for next request)
    if (ENABLE_SUMMARY_CACHE && resolvedLessonId) {
      primeLessonSummary({
        userId,
        lessonId: resolvedLessonId,
        failCounts: { [levelId]: newFailCount },
        attempts: [{
          levelId,
          levelNumber: currentLevelNumber,
          success,
          difficulty: level.difficulty,
          attemptTime,
          createdAt: new Date().toISOString(),
        }],
      });
    }

    // Update student progress with algorithm results
    // Algorithm suggests a difficulty change - find the corresponding level variant
    // For next puzzle assignment: use adjusted difficulty for the next level
    const adjustedTheta = irtResult.adjusted_theta ?? progress.theta ?? 0.0;
    // Capture theta_before: the theta value BEFORE this attempt's update
    // Use nullish coalescing to properly handle 0 values (0 is a valid theta)
    const thetaBefore = progress.theta ?? 0.0;
    let nextLevelId = levelId;
    let nextLevelNumber = currentLevelNumber;
    let nextDifficulty = newDifficultyLabel;
    let difficultySwitched = false;

    // Determine next level based on level progression
    // If student completed current level, move to next level with adjusted difficulty
    // Example: Level 1 Medium → Level 2 Easy (if student struggled)
    if (success && newTotalAttempts > 0) {
      // Student completed the puzzle - determine next level
      const nextLevelNum = currentLevelNumber + 1;
      
      // Find the next level with the adjusted difficulty
      const nextLevelResult = await client.query(
        'SELECT id, level_number FROM levels WHERE lesson_id = $1 AND level_number = $2 AND difficulty = $3',
        [resolvedLessonId, nextLevelNum, newDifficultyLabel]
      );
      
      if (nextLevelResult.rows.length > 0) {
        // Found next level with adjusted difficulty
        nextLevelId = nextLevelResult.rows[0].id;
        nextLevelNumber = nextLevelResult.rows[0].level_number;
        difficultySwitched = true;
        if (errorsThresholdMet) {
          logger.log('next_level_assigned', {
            userId,
            levelId: nextLevelId,
            levelNumber: nextLevelNumber,
            difficulty: newDifficultyLabel,
            reason: 'struggled_but_completed',
            errors: newFailCount,
          });
        } else {
          logger.log('next_level_assigned', {
            userId,
            levelId: nextLevelId,
            levelNumber: nextLevelNumber,
            difficulty: newDifficultyLabel,
            reason: 'performance_based',
          });
        }
      } else {
        // Next level with this difficulty doesn't exist - find closest match
        let orderByClause;
        if (newDifficultyLabel === 'Easy') {
          orderByClause = `ORDER BY CASE difficulty WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Hard' THEN 3 END`;
        } else if (newDifficultyLabel === 'Hard') {
          orderByClause = `ORDER BY CASE difficulty WHEN 'Hard' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Easy' THEN 3 END`;
        } else {
          orderByClause = `ORDER BY CASE difficulty WHEN 'Medium' THEN 1 WHEN 'Easy' THEN 2 WHEN 'Hard' THEN 3 END`;
        }
        
        const anyNextLevelResult = await client.query(
          `SELECT id, level_number, difficulty FROM levels WHERE lesson_id = $1 AND level_number = $2 ${orderByClause} LIMIT 1`,
          [resolvedLessonId, nextLevelNum]
        );
        
        if (anyNextLevelResult.rows.length > 0) {
          nextLevelId = anyNextLevelResult.rows[0].id;
          nextLevelNumber = anyNextLevelResult.rows[0].level_number;
          nextDifficulty = anyNextLevelResult.rows[0].difficulty;
          logger.warn('next_level_fallback', {
            userId,
            requested: newDifficultyLabel,
            actual: nextDifficulty,
            levelNumber: nextLevelNumber,
          });
        }
      }
    } else if (newDifficultyLabel !== level.difficulty) {
      // Difficulty changed but student hasn't completed - find variant of current level
      const variantLevelResult = await client.query(
        'SELECT id FROM levels WHERE lesson_id = $1 AND level_number = $2 AND difficulty = $3',
        [resolvedLessonId, currentLevelNumber, newDifficultyLabel]
      );
      
      if (variantLevelResult.rows.length > 0) {
        nextLevelId = variantLevelResult.rows[0].id;
        difficultySwitched = true;
        
        // Update or create student progress for the new level variant
        const nextProgressCheck = await client.query(
          'SELECT id FROM student_progress WHERE user_id = $1 AND level_id = $2',
          [userId, nextLevelId]
        );
        
        if (nextProgressCheck.rows.length === 0) {
          await client.query(
            `INSERT INTO student_progress 
             (user_id, level_id, lesson_id, theta, beta, prev_theta, prev_beta, 
              success_count, fail_count, total_attempts, preferred_difficulty)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              userId,
              nextLevelId,
              resolvedLessonId,
              adjustedTheta,
              newBeta,
              progress.theta,
              currentBeta,
              0,
              0,
              0,
              newDifficultyLabel
            ]
          );
        } else {
          await client.query(
            `UPDATE student_progress SET
              theta = $1,
              prev_theta = $2,
              beta = $3,
              prev_beta = $4,
              preferred_difficulty = $5,
              updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $6 AND level_id = $7`,
            [
              adjustedTheta,
              progress.theta,
              newBeta,
              currentBeta,
              newDifficultyLabel,
              userId,
              nextLevelId
            ]
          );
        }
      }
    }
    
    // Update preferred_difficulty for the lesson
    await client.query(
      `UPDATE student_progress 
       SET preferred_difficulty = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND lesson_id = $3`,
      [newDifficultyLabel, userId, resolvedLessonId]
    );
    
    // Calculate best_completion_time and average_completion_time from successful attempts
    // Only update if attemptTime is provided and the attempt was successful
    let bestCompletionTime = progress.best_completion_time;
    let averageCompletionTime = progress.average_completion_time;
    
    if (success && attemptTime != null && attemptTime > 0) {
      // Get all successful attempt times for this level
      const timeResult = await client.query(
        `SELECT attempt_time FROM puzzle_attempt 
         WHERE user_id = $1 AND level_id = $2 AND success = true AND attempt_time IS NOT NULL AND attempt_time > 0
         ORDER BY attempt_time ASC`,
        [userId, levelId]
      );
      
      const successfulTimes = timeResult.rows.map((row) => Number(row.attempt_time));

      // Include the current attempt since it hasn't been inserted yet
      successfulTimes.push(Number(attemptTime));
      
      if (successfulTimes.length > 0) {
        // Best completion time is the minimum (fastest) time
        bestCompletionTime = Math.min(...successfulTimes);
        
        // Average completion time is the mean of all successful times
        const sum = successfulTimes.reduce((acc, time) => acc + time, 0);
        averageCompletionTime = sum / successfulTimes.length;
      }
    }
    
    // Update student progress with algorithm results
    await client.query(
      `UPDATE student_progress SET
        theta = $1,
        prev_theta = $2,
        beta = $3,
        prev_beta = $4,
        success_count = $5,
        fail_count = $6,
        total_attempts = $7,
        last_attempt_at = CURRENT_TIMESTAMP,
        best_completion_time = $8,
        average_completion_time = $9,
        adjusted_theta = $10,
        confidence_index = $11,
        success_rate = $12,
        fail_rate = $13,
        updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $14 AND level_id = $15`,
      [
        adjustedTheta,
        progress.theta ?? null, // prev_theta: store the old theta value (or null if it was null)
        newBeta,
        currentBeta ?? null, // prev_beta: store the old beta value
        newSuccessCount,
        newFailCount,
        newTotalAttempts,
        bestCompletionTime, // Update best completion time
        averageCompletionTime, // Update average completion time
        adjustedTheta,
        irtResult.confidence_index || null,
        summary.Actual_Success_Rate || (newSuccessCount / Math.max(1, newTotalAttempts)),
        summary.Actual_Fail_Rate || (newFailCount / Math.max(1, newTotalAttempts)),
        userId,
        levelId
      ]
    );

    // Record level completion for reliable progress tracking
    if (success) {
      await client.query(
        `INSERT INTO lesson_level_completions (user_id, lesson_id, level_id, level_number, difficulty)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, level_id)
         DO UPDATE SET
           level_number = EXCLUDED.level_number,
           difficulty = EXCLUDED.difficulty,
           completed_at = CURRENT_TIMESTAMP`,
        [
          userId,
          resolvedLessonId,
          levelId,
          currentLevelNumber,
          level.difficulty
        ]
      );
      
      // Update the course's student count
      // Count distinct students who have completed at least one level in this course
      const courseUpdateResult = await client.query(
        `UPDATE courses 
         SET students = (
           SELECT COUNT(DISTINCT llc.user_id)
           FROM lesson_level_completions llc
           JOIN lessons l ON l.id = llc.lesson_id
           WHERE l.course_id = (
             SELECT course_id FROM lessons WHERE id = $1
           )
         ),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT course_id FROM lessons WHERE id = $1
         )`,
        [resolvedLessonId]
      );
    }

    // Record the attempt in puzzle_attempt table
    // Capture theta_at_attempt BEFORE the algorithm update (the current progress.theta value)
    // Use nullish coalescing to properly handle 0 values
    const thetaAtAttempt = progress.theta ?? 0.0;
    
    // Try to insert with attempt_id first (preferred method)
    let inserted = false;
    try {
      await client.query(
        `INSERT INTO puzzle_attempt 
         (user_id, level_id, lesson_id, success, attempt_time, code_submitted, expected_output, actual_output, theta_at_attempt, beta_at_attempt, difficulty_label, attempt_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          userId,
          levelId,
          resolvedLessonId,
          success,
          attemptTime || null,
          codeSubmitted || null, // Will be null if frontend doesn't send it
          expectedOutput || null,
          actualOutput || null,
          thetaAtAttempt, // Theta value BEFORE this attempt's update
          currentBeta,
          level.difficulty,
          generatedAttemptId // Always include attempt_id (generated if not provided)
        ]
      );
      inserted = true;
    } catch (e) {
      // If attempt_id column doesn't exist, try without it
      if (e.message && e.message.includes('attempt_id')) {
        try {
          await client.query(
            `INSERT INTO puzzle_attempt 
             (user_id, level_id, lesson_id, success, attempt_time, code_submitted, expected_output, actual_output, theta_at_attempt, beta_at_attempt, difficulty_label)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              userId,
              levelId,
              resolvedLessonId,
              success,
              attemptTime || null,
              codeSubmitted || null,
              expectedOutput || null,
              actualOutput || null,
              thetaAtAttempt,
              currentBeta,
              level.difficulty
            ]
          );
          inserted = true;
        } catch (e2) {
          logger.error('puzzle_attempt_insert_failed', {
            userId,
            levelId,
            error: e2.message,
          });
          throw e2;
        }
      } else {
        logger.error('puzzle_attempt_insert_failed', {
          userId,
          levelId,
          error: e.message,
        });
        throw e;
      }
    }

    // Calculate EXP gain
    // Lesson levels always give 20 EXP per level when successful
    const LESSON_EXP_PER_LEVEL = 20;
    const expGain = resolvedLessonId 
      ? (success ? LESSON_EXP_PER_LEVEL : 0) // 20 EXP for success, nothing for failure
      : calculateExpGain(success, level.difficulty, stats.current_streak || 0); // Use normal calculation for non-lesson puzzles
    const newExp = Math.min((stats.exp || 0) + expGain, 10000); // Cap at MAX_EXP
    const newNormalizedExp = normalizeExp(newExp);
    
    // Update streaks
    const { currentStreak, longestStreak } = updateStreaks(
      stats.current_streak || 0,
      stats.longest_streak || 0,
      success
    );
    
    // Get new rank from EXP (using JavaScript implementation - matches Python logic)
    const rankData = getRankFromExp(newExp);
    let newRankName = rankData.rankName;
    let newRankIndex = rankData.rankIndex;
    
    // Get success/fail levels for statistics (using JavaScript implementation - matches Python logic)
    const newTotalSuccess = (stats.total_success_count || 0) + (success ? 1 : 0);
    const newTotalFail = (stats.total_fail_count || 0) + (success ? 0 : 1);
    const successLevel = getSuccessLevel(newTotalSuccess);
    const failLevel = getFailLevel(newTotalFail);
    
    // Check and award achievements (before updating stats)
    const newAchievements = await checkAchievements(
      client,
      userId,
      {
        ...stats,
        exp: newExp, // Use new EXP (before achievement rewards) for threshold checks
        total_success_count: (stats.total_success_count || 0) + (success ? 1 : 0),
        current_streak: currentStreak,
        rank_name: newRankName
      },
      success
    );
    
    // Calculate total achievement EXP reward
    const achievementExpReward = newAchievements.reduce((sum, ach) => sum + (ach.expReward || 0), 0);
    const finalExp = Math.min(newExp + achievementExpReward, 10000);
    const finalNormalizedExp = normalizeExp(finalExp);
    
    // Recalculate rank if achievement gave EXP
    if (achievementExpReward > 0) {
      const updatedRankData = getRankFromExp(finalExp);
      newRankName = updatedRankData.rankName;
      newRankIndex = updatedRankData.rankIndex;
    }
    
    // Update student statistics with all new values
    await client.query(
      `UPDATE student_statistics SET
        total_success_count = COALESCE(total_success_count, 0) + $1,
        total_fail_count = COALESCE(total_fail_count, 0) + $2,
        exp = $3,
        normalized_exp = $4,
        rank_name = $5,
        rank_index = $6,
        completed_achievements = (SELECT COUNT(*) FROM achievements WHERE user_id = $7),
        success_level = $8,
        fail_level = $9,
        current_streak = $10,
        longest_streak = $11,
        last_activity_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $7`,
      [
        success ? 1 : 0,
        success ? 0 : 1,
        finalExp,
        finalNormalizedExp,
        newRankName,
        newRankIndex,
        userId,
        successLevel,
        failLevel,
        currentStreak,
        longestStreak
      ]
    );

    // Log to adaptive_log table
    const performanceGap = actualSuccessRate - targetSuccessRate;
    const difficultyIncreased = newBeta > currentBeta;
    const difficultyDecreased = newBeta < currentBeta;
    await client.query(
      `INSERT INTO adaptive_log (
        user_id, level_id, lesson_id,
        success_count, fail_count, total_attempts, attempt_time,
        theta_before, theta_after, probability,
        beta_before, beta_after, difficulty_before, difficulty_after,
        actual_success_rate, target_success_rate, performance_gap,
        confidence_index, adjustment_applied, momentum, behavior_weight,
        errors_threshold_met, below_target_performance, difficulty_increased, difficulty_decreased,
        next_level_id, next_level_number, next_difficulty
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
      [
        userId,
        levelId,
        resolvedLessonId,
        newSuccessCount,
        newFailCount,
        newTotalAttempts,
        attemptTime || null,
        thetaBefore,
        adjustedTheta,
        irtResult.probability || null,
        currentBeta,
        newBeta,
        level.difficulty,
        newDifficultyLabel,
        actualSuccessRate,
        targetSuccessRate,
        performanceGap,
        irtResult.confidence_index || null,
        ddaResult.adjustment_applied || (newBeta - currentBeta),
        ddaResult.momentum || null,
        ddaResult.behavior_weight || null,
        errorsThresholdMet,
        belowTargetPerformance,
        difficultyIncreased,
        difficultyDecreased,
        nextLevelId !== levelId ? nextLevelId : null,
        nextLevelNumber !== currentLevelNumber ? nextLevelNumber : null,
        nextDifficulty
      ]
    );

    // Log to difficulty_audit table if difficulty changed (append-only audit)
    if (level.difficulty !== newDifficultyLabel || Math.abs(currentBeta - newBeta) > 0.01) {
      const auditSavepoint = 'difficulty_audit_sp';
      try {
        await client.query(`SAVEPOINT ${auditSavepoint}`);
        // Extract consecutive successes from summary history for audit
        const recentSuccesses = summaryHistory?.attempts?.filter(a => a.success) || [];
        const consecutiveCount = recentSuccesses.length >= 5 ? recentSuccesses.length : null;
        
        await client.query(
          `SELECT log_difficulty_change(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
          )`,
          [
            userId,
            levelId,
            resolvedLessonId,
            currentBeta,
            newBeta,
            level.difficulty,
            newDifficultyLabel,
            appliedRule?.rule || null,
            appliedRule?.applied || false,
            algorithmBeta,
            errorsThresholdMet,
            attemptTime != null && attemptTime >= 60, // time_threshold_met
            consecutiveCount,
            null, // performance_criteria_met (would need to compute from summary)
            newSuccessCount,
            newFailCount,
            newTotalAttempts,
            attemptTime,
            actualSuccessRate,
            targetSuccessRate,
            lessonDifficulty,
            currentLevelNumber
          ]
        );
        await client.query(`RELEASE SAVEPOINT ${auditSavepoint}`);
      } catch (auditError) {
        await safeRollbackToSavepoint(client, auditSavepoint, auditError);
        // Log but don't fail the transaction if audit table doesn't exist yet
        logger.warn('difficulty_audit_failed', {
          userId,
          levelId,
          error: auditError.message,
        });
      }
    }

    const sessionSavepoint = 'user_session_sp';
    try {
      await client.query(`SAVEPOINT ${sessionSavepoint}`);
      const sessionUpdate = await client.query(
        `WITH active_session AS (
           SELECT id
           FROM user_sessions
           WHERE user_id = $1 AND session_end IS NULL
           ORDER BY session_start DESC
           LIMIT 1
         )
         UPDATE user_sessions
         SET puzzles_attempted = puzzles_attempted + 1,
             puzzles_completed = puzzles_completed + CASE WHEN $2 THEN 1 ELSE 0 END
         WHERE id IN (SELECT id FROM active_session)
         RETURNING id`,
        [userId, success]
      );

      let rowsAffected = sessionUpdate.rowCount;

      if (rowsAffected === 0) {
        const fallbackUpdate = await client.query(
          `WITH latest_session AS (
             SELECT id
             FROM user_sessions
             WHERE user_id = $1
             ORDER BY session_start DESC
             LIMIT 1
           )
           UPDATE user_sessions
           SET puzzles_attempted = puzzles_attempted + 1,
               puzzles_completed = puzzles_completed + CASE WHEN $2 THEN 1 ELSE 0 END
           WHERE id IN (SELECT id FROM latest_session)
           RETURNING id`,
          [userId, success]
        );
        rowsAffected = fallbackUpdate.rowCount;
      }

      if (rowsAffected === 0) {
        await client.query(
          `INSERT INTO user_sessions (user_id, puzzles_attempted, puzzles_completed)
           VALUES ($1, 1, CASE WHEN $2 THEN 1 ELSE 0 END)`
          ,
          [userId, success]
        );
      }
    } catch (sessionUpdateError) {
      await safeRollbackToSavepoint(client, sessionSavepoint, sessionUpdateError);
      logger.warn('user_session_update_failed', {
        userId,
        levelId,
        error: sessionUpdateError.message,
      });
    }

    await client.query('COMMIT');
    
    logger.log('puzzle_attempt_committed', {
      userId,
      levelId,
      lessonId: resolvedLessonId,
      success,
      newSuccessCount,
      newFailCount,
      newTotalAttempts
    });
    
    // Verify data was saved (query after commit to confirm)
    const verifyProgress = await client.query(
      'SELECT success_count, fail_count, total_attempts FROM student_progress WHERE user_id = $1 AND level_id = $2',
      [userId, levelId]
     );
     const verifyAttempt = await client.query(
       'SELECT id, success FROM puzzle_attempt WHERE user_id = $1 AND level_id = $2 ORDER BY created_at DESC LIMIT 1',
       [userId, levelId]
     );
     
     logger.log('puzzle_attempt_verified', {
       userId,
       levelId,
       progressSaved: verifyProgress.rows[0] || null,
       attemptSaved: verifyAttempt.rows[0] || null,
       expectedSuccessCount: newSuccessCount
     });

    // Return result to frontend
    // Get updated stats for response
    const updatedStatsResult = await client.query(
      `SELECT exp, normalized_exp, rank_name, rank_index, current_streak, longest_streak, completed_achievements
       FROM student_statistics WHERE user_id = $1`,
      [userId]
    );
    const updatedStats = updatedStatsResult.rows[0] || {};
    
    return ok(res, {
      result: {
        levelId: difficultySwitched ? nextLevelId : levelId,
        currentLevelId: levelId,
        newDifficulty: newDifficultyLabel,
        oldDifficulty: level.difficulty,
        difficultySwitched: difficultySwitched,
        newBeta: newBeta,
        studentSkill: adjustedTheta,
        predictedSuccess: irtResult.probability || 0.5,
        algorithmSummary: summary,
        exp: {
          gained: expGain + (newAchievements.reduce((sum, ach) => sum + (ach.expReward || 0), 0)),
          total: updatedStats.exp || 0,
          normalized: updatedStats.normalized_exp || 0,
          achievementReward: newAchievements.reduce((sum, ach) => sum + (ach.expReward || 0), 0)
        },
        rank: {
          name: updatedStats.rank_name || 'novice',
          index: updatedStats.rank_index || 0
        },
        streaks: {
          current: updatedStats.current_streak || 0,
          longest: updatedStats.longest_streak || 0
        },
        achievements: {
          unlocked: newAchievements,
          total: updatedStats.completed_achievements || 0
        },
        message: difficultySwitched 
          ? `Difficulty adjusted: ${level.difficulty} → ${newDifficultyLabel}` 
          : `Difficulty remains: ${level.difficulty}`
      }
    });

  } catch (error) {
    await safeRollback(client, error);
    logger.error('puzzle_attempt_error', {
      userId: req.user?.id,
      levelId: req.body?.levelId,
      error: error.message,
      stack: error.stack,
    });
    return error(res, 500, 'Failed to process puzzle attempt', { message: error.message }, error);
  } finally {
    client.release();
  }
});

/**
 * GET /api/puzzle/progress/:levelId
 * Get student progress for a specific level
 */
router.get('/progress/:levelId', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { levelId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM student_progress 
       WHERE user_id = $1 AND level_id = $2`,
      [userId, levelId]
    );

    if (result.rows.length === 0) {
      return ok(res, { progress: null });
    }

    return ok(res, { progress: result.rows[0] });
  } catch (error) {
    logger.error('fetch_progress_error', {
      userId: req.user?.id,
      levelId: req.params?.levelId,
      error: error.message,
    });
    return error(res, 500, 'Failed to fetch progress');
  }
});

/**
 * GET /api/puzzle/preferred-difficulty/:lessonId
 * Get student's preferred difficulty for a lesson (set by algorithm)
 * Only returns preferred difficulty if student has actual progress in the lesson
 */
router.get('/preferred-difficulty/:lessonId', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user.id;

    // Only return preferred_difficulty if student has made progress (completed at least one level)
    // This prevents applying difficulty adjustments from previous sessions when starting fresh
    const result = await pool.query(
      `SELECT sp.preferred_difficulty, COUNT(DISTINCT sp.level_id) as levels_attempted
       FROM student_progress sp
       WHERE sp.user_id = $1 AND sp.lesson_id = $2 
         AND sp.preferred_difficulty IS NOT NULL
         AND (sp.success_count > 0 OR sp.fail_count > 0 OR sp.total_attempts > 0)
       GROUP BY sp.preferred_difficulty
       LIMIT 1`,
      [userId, lessonId]
    );

    // Only return preferred difficulty if student has actually attempted levels in this lesson
    const preferredDifficulty = result.rows.length > 0 && parseInt(result.rows[0].levels_attempted) > 0
      ? result.rows[0].preferred_difficulty 
      : null;

    return ok(res, { preferredDifficulty });
  } catch (error) {
    logger.error('fetch_preferred_difficulty_error', {
      userId: req.user?.id,
      lessonId: req.params?.lessonId,
      error: error.message,
    });
    return error(res, 500, 'Failed to fetch preferred difficulty');
  }
});

/**
 * POST /api/puzzle/hint
 * Deduct EXP when a student requests a hint
 */
router.post('/hint', authenticateToken, requireStudent, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    let statsResult = await client.query(
      'SELECT exp FROM student_statistics WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (statsResult.rows.length === 0) {
      await client.query(
        `INSERT INTO student_statistics (user_id, exp, normalized_exp, rank_name, rank_index, current_streak, longest_streak, total_success_count, total_fail_count)
         VALUES ($1, 0, 0, 'novice', 0, 0, 0, 0, 0)`,
        [userId]
      );
      statsResult = await client.query(
        'SELECT exp FROM student_statistics WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
    }

    const currentExp = statsResult.rows[0]?.exp || 0;
    if (currentExp < HINT_EXP_COST) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Not enough EXP to view a hint. You need ${HINT_EXP_COST} EXP.`
      });
    }

    const updatedExp = currentExp - HINT_EXP_COST;
    const normalizedExp = normalizeExp(updatedExp);
    const rankData = getRankFromExp(updatedExp);

    await client.query(
      `UPDATE student_statistics
       SET exp = $1,
           normalized_exp = $2,
           rank_name = $3,
           rank_index = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $5`,
      [updatedExp, normalizedExp, rankData.rankName, rankData.rankIndex, userId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      remainingExp: updatedExp,
      cost: HINT_EXP_COST
    });
  } catch (error) {
    await safeRollback(client, error);
    logger.error('hint_purchase_failed', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });
    return error(res, 500, 'Failed to process hint request', null, error);
  } finally {
    client.release();
  }
});

module.exports = router;
