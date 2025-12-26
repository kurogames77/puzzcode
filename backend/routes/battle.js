const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const logger = require('../utils/logger');
const { error, ok } = require('../utils/http');
const {
  calculateExpGain,
  getRankFromExp
} = require('../services/expRankService');
const { findMatches } = require('../services/matchmakingService');
const { getRandomProblem } = require('../data/battleProblems');
const csharpBeginnerLevels = require('../data/csharpBeginnerLevels');

const CHALLENGE_LANGUAGE = 'python';
const CHALLENGE_LEVEL_NUMBER = 10;
const CHALLENGE_DIFFICULTY = 'Easy';

// Get Socket.IO instance from server
let io = null;
function setSocketIO(socketIO) {
  io = socketIO;
}

// Export setSocketIO function
function setSocketIOForBattle(socketIO) {
  setSocketIO(socketIO);
}

function getRandomCSharpBeginnerPuzzle() {
  if (!Array.isArray(csharpBeginnerLevels) || csharpBeginnerLevels.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * csharpBeginnerLevels.length);
  const level = csharpBeginnerLevels[randomIndex];
  if (!level) {
    return null;
  }

  return {
    id: level.id,
    title: level.title || 'C# Beginner Puzzle',
    description: level.description || '',
    difficulty: level.difficulty || 'Easy',
    lessonId: null,
    levelId: level.id,
    levelNumber: level.levelNumber || randomIndex + 1,
    initialCode: level.initialCode,
    expectedOutput: level.expectedOutput,
    examples: Array.isArray(level.examples) ? level.examples : [],
    constraints: Array.isArray(level.constraints) ? level.constraints : []
  };
}

/**
 * Get player data with theta and beta for matchmaking
 * @param {string} userId - User ID
 * @returns {Promise<object>} Player data with theta, beta, and stats
 */
async function getPlayerDataForMatchmaking(userId) {
  // Get average theta and beta from student_progress (weighted by attempts)
  const progressResult = await pool.query(
    `SELECT 
      COALESCE(AVG(CASE WHEN total_attempts > 0 THEN theta ELSE NULL END), 0.0) as avg_theta,
      COALESCE(AVG(CASE WHEN total_attempts > 0 THEN beta ELSE NULL END), 0.5) as avg_beta,
      COALESCE(MAX(adjusted_theta), 0.0) as latest_adjusted_theta,
      COALESCE(MAX(beta), 0.5) as latest_beta,
      SUM(success_count) as total_success,
      SUM(fail_count) as total_fail
    FROM student_progress
    WHERE user_id = $1 AND total_attempts > 0`,
    [userId]
  );

  // Get statistics
  const statsResult = await pool.query(
    `SELECT 
      exp, rank_name, rank_index,
      total_success_count, total_fail_count,
      completed_achievements
    FROM student_statistics
    WHERE user_id = $1`,
    [userId]
  );

  const stats = statsResult.rows[0] || {
    exp: 0,
    rank_name: 'novice',
    rank_index: 0,
    total_success_count: 0,
    total_fail_count: 0,
    completed_achievements: 0
  };

  const progress = progressResult.rows[0] || {
    avg_theta: 0.0,
    avg_beta: 0.5,
    latest_adjusted_theta: 0.0,
    latest_beta: 0.5,
    total_success: 0,
    total_fail: 0
  };

  // Use latest adjusted_theta if available, otherwise use average
  const theta = progress.latest_adjusted_theta || progress.avg_theta || 0.0;
  const beta = progress.latest_beta || progress.avg_beta || 0.5;

  return {
    user_id: userId,
    theta: parseFloat(theta),
    beta: parseFloat(beta),
    rank_name: stats.rank_name || 'novice',
    rank_index: typeof stats.rank_index === 'number'
      ? stats.rank_index
      : parseInt(stats.rank_index, 10) || 0,
    completed_achievements: stats.completed_achievements || 0,
    success_count: parseInt(stats.total_success_count) || parseInt(progress.total_success) || 0,
    fail_count: parseInt(stats.total_fail_count) || parseInt(progress.total_fail) || 0
  };
}

/**
 * Generate basic initial code structure for a problem
 * @param {object} problem - Problem object
 * @param {string} language - Programming language
 * @returns {string} Basic initial code
 */
function generateBasicInitialCode(problem, language) {
  // Extract keywords from problem title/description to generate more relevant code
  const title = (problem.title || '').toLowerCase();
  const description = (problem.description || '').toLowerCase();
  
  // Detect problem type from keywords
  const isArrayProblem = title.includes('array') || title.includes('subarray') || description.includes('array');
  const isStringProblem = title.includes('string') || description.includes('string');
  const isNumberProblem = title.includes('sum') || title.includes('number') || title.includes('integer');
  const needsLoop = description.includes('each') || description.includes('iterate') || description.includes('for');
  const needsCondition = description.includes('if') || description.includes('check') || description.includes('condition');
  
  // Generate code structure based on language and problem type
  const langCode = {
    python: (() => {
      const lines = ['def solution():'];
      if (isArrayProblem) {
        lines.push('    nums = []  # array');
        if (needsLoop) {
          lines.push('    for num in nums:  # iterate');
        }
      } else if (isStringProblem) {
        lines.push('    s = ""  # string');
      } else if (isNumberProblem) {
        lines.push('    result = 0  # integer');
      }
      if (needsCondition) {
        lines.push('    if condition:  # check');
      }
      lines.push('    # Your code here');
      lines.push('    pass');
      lines.push('    return result');
      return lines;
    })(),
    javascript: (() => {
      const lines = ['function solution() {'];
      if (isArrayProblem) {
        lines.push('    const nums = [];  // array');
        if (needsLoop) {
          lines.push('    for (let i = 0; i < nums.length; i++) {  // iterate');
          lines.push('    }');
        }
      } else if (isStringProblem) {
        lines.push('    let s = "";  // string');
      } else if (isNumberProblem) {
        lines.push('    let result = 0;  // number');
      }
      if (needsCondition) {
        lines.push('    if (condition) {  // check');
        lines.push('    }');
      }
      lines.push('    // Your code here');
      lines.push('    return result;');
      lines.push('}');
      return lines;
    })(),
    csharp: (() => {
      const lines = ['public class Solution {', '    public int Solution() {'];
      if (isArrayProblem) {
        lines.push('        int[] nums = new int[] {};  // array');
        if (needsLoop) {
          lines.push('        foreach (int num in nums) {  // iterate');
          lines.push('        }');
        }
      } else if (isStringProblem) {
        lines.push('        string s = "";  // string');
      } else if (isNumberProblem) {
        lines.push('        int result = 0;  // integer');
      }
      if (needsCondition) {
        lines.push('        if (condition) {  // check');
        lines.push('        }');
      }
      lines.push('        // Your code here');
      lines.push('        return result;');
      lines.push('    }', '}');
      return lines;
    })(),
    cpp: (() => {
      const lines = ['#include <iostream>', '#include <vector>', 'using namespace std;', '', 'int solution() {'];
      if (isArrayProblem) {
        lines.push('    vector<int> nums;  // array');
        if (needsLoop) {
          lines.push('    for (int i = 0; i < nums.size(); i++) {  // iterate');
          lines.push('    }');
        }
      } else if (isStringProblem) {
        lines.push('    string s = "";  // string');
      } else if (isNumberProblem) {
        lines.push('    int result = 0;  // integer');
      }
      if (needsCondition) {
        lines.push('    if (condition) {  // check');
        lines.push('    }');
      }
      lines.push('    // Your code here');
      lines.push('    return result;');
      lines.push('}');
      return lines;
    })(),
    php: (() => {
      const lines = ['<?php', 'function solution() {'];
      if (isArrayProblem) {
        lines.push('    $nums = [];  // array');
        if (needsLoop) {
          lines.push('    foreach ($nums as $num) {  // iterate');
          lines.push('    }');
        }
      } else if (isStringProblem) {
        lines.push('    $s = "";  // string');
      } else if (isNumberProblem) {
        lines.push('    $result = 0;  // integer');
      }
      if (needsCondition) {
        lines.push('    if ($condition) {  // check');
        lines.push('    }');
      }
      lines.push('    // Your code here');
      lines.push('    return $result;');
      lines.push('}');
      return lines;
    })(),
    mysql: [
      'SELECT *',
      'FROM table_name',
      'WHERE condition;  -- condition',
      '-- Your query here'
    ]
  };
  
  const defaultCode = langCode[language] || langCode.python;
  return defaultCode.join('\n');
}

/**
 * Resolve a battle problem for the given language and student stats.
 * Falls back to curated battle problems and always ensures initialCode exists.
 * @param {string} language
 * @param {object} stats
 * @returns {Promise<object|null>}
 */
async function resolveBattleProblem(language, stats = {}) {
  let problem = await getRandomPuzzleFromLessons(language, {
    rank_index: stats.rank_index,
    total_success_count: stats.total_success_count,
    total_fail_count: stats.total_fail_count
  });

  if (!problem) {
    const difficulty = stats.rank_index < 3 ? 'Easy' : stats.rank_index < 6 ? 'Medium' : 'Hard';
    problem = getRandomProblem(language, difficulty);
  }

  if (!problem) {
    return null;
  }

  if (!problem.initialCode) {
    problem.initialCode = generateBasicInitialCode(problem, language);
  }

  return problem;
}

/**
 * Get a random puzzle from lessons database based on student's rank and performance
 * @param {string} language - Language name (Python, JavaScript, C#, C++, PHP, MySQL)
 * @param {Object} studentStats - Student statistics (rank_index, total_success_count, total_fail_count)
 * @returns {Promise<Object|null>} Random level/puzzle or null if none found
 */
async function getRandomPuzzleFromLessons(language, studentStats = {}) {
  const lowerLanguage = (language || '').toLowerCase();
  const getFallbackPuzzle = () => {
    if (lowerLanguage === 'csharp' || lowerLanguage === 'c#' || lowerLanguage === 'cs') {
      return getRandomCSharpBeginnerPuzzle();
    }
    return null;
  };

  try {

    // Map language codes to course names
    const languageMap = {
      'python': 'Python',
      'javascript': 'JavaScript',
      'js': 'JavaScript',
      'csharp': 'C#',
      'cpp': 'C++',
      'c++': 'C++',
      'php': 'PHP',
      'mysql': 'MySQL'
    };
    
    const courseName = languageMap[lowerLanguage] || language;
    
    // Find course by name
    const courseResult = await pool.query(
      `SELECT id FROM courses WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [courseName]
    );
    
    if (courseResult.rows.length === 0) {
      return getFallbackPuzzle();
    }
    
    const courseId = courseResult.rows[0].id;
    
    // Determine difficulty based on rank_index and performance
    // Rank mapping:
    // rank_index 0-2 (novice, apprentice, bronze_coder) -> Easy
    // rank_index 3-5 (silver_coder, gold_developer, platinum_engineer) -> Medium
    // rank_index 6-9 (diamond_hacker, master_coder, grandmaster_dev, code_overlord) -> Hard
    const rankIndex = studentStats.rank_index || 0;
    let targetDifficulty = 'Easy';
    
    if (rankIndex >= 6) {
      targetDifficulty = 'Hard';
    } else if (rankIndex >= 3) {
      targetDifficulty = 'Medium';
    }
    
    // Adjust difficulty based on performance (success rate)
    const totalAttempts = (studentStats.total_success_count || 0) + (studentStats.total_fail_count || 0);
    if (totalAttempts > 0) {
      const successRate = (studentStats.total_success_count || 0) / totalAttempts;
      
      // If success rate is very high (>80%), consider increasing difficulty
      if (successRate > 0.8 && targetDifficulty === 'Easy') {
        targetDifficulty = 'Medium';
      } else if (successRate > 0.8 && targetDifficulty === 'Medium') {
        targetDifficulty = 'Hard';
      }
      // If success rate is very low (<30%), consider decreasing difficulty
      else if (successRate < 0.3 && targetDifficulty === 'Hard') {
        targetDifficulty = 'Medium';
      } else if (successRate < 0.3 && targetDifficulty === 'Medium') {
        targetDifficulty = 'Easy';
      }
    }
    
    // Get random level from lessons filtered by difficulty and course
    // Try to get a level with the target difficulty first
    let levelsResult = await pool.query(
      `SELECT 
        lev.id,
        lev.level_number,
        lev.title,
        lev.description,
        lev.difficulty,
        lev.initial_code,
        lev.expected_output,
        l.id as lesson_id,
        l.title as lesson_title
      FROM levels lev
      JOIN lessons l ON l.id = lev.lesson_id
      WHERE l.course_id = $1 AND lev.difficulty = $2
      ORDER BY RANDOM()
      LIMIT 1`,
      [courseId, targetDifficulty]
    );
    
    // If no level found with target difficulty, try other difficulties
    if (levelsResult.rows.length === 0) {
      // Try Medium if target was Hard or Easy
      if (targetDifficulty !== 'Medium') {
        levelsResult = await pool.query(
          `SELECT 
            lev.id,
            lev.level_number,
            lev.title,
            lev.description,
            lev.difficulty,
            lev.initial_code,
            lev.expected_output,
            l.id as lesson_id,
            l.title as lesson_title
          FROM levels lev
          JOIN lessons l ON l.id = lev.lesson_id
          WHERE l.course_id = $1 AND lev.difficulty = 'Medium'
          ORDER BY RANDOM()
          LIMIT 1`,
          [courseId]
        );
      }
      
      // If still no level, get any level from the course
      if (levelsResult.rows.length === 0) {
        levelsResult = await pool.query(
          `SELECT 
            lev.id,
            lev.level_number,
            lev.title,
            lev.description,
            lev.difficulty,
            lev.initial_code,
            lev.expected_output,
            l.id as lesson_id,
            l.title as lesson_title
          FROM levels lev
          JOIN lessons l ON l.id = lev.lesson_id
          WHERE l.course_id = $1
          ORDER BY RANDOM()
          LIMIT 1`,
          [courseId]
        );
      }
    }
    
    if (levelsResult.rows.length === 0) {
      return getFallbackPuzzle();
    }
    
    const level = levelsResult.rows[0];
    
    // Format as battle problem
    return {
      id: `lesson_${level.id}`,
      title: level.title || `Level ${level.level_number}`,
      description: level.description || '',
      difficulty: level.difficulty || targetDifficulty,
      lessonId: level.lesson_id,
      levelId: level.id,
      levelNumber: level.level_number,
      initialCode: level.initial_code,
      expectedOutput: level.expected_output,
      examples: [],
      constraints: []
    };
  } catch (error) {
    console.error('Error getting random puzzle from lessons:', error);
    const fallback = getFallbackPuzzle();
    if (fallback) {
      return fallback;
    }
    return null;
  }
}

async function getPythonBeginnerLevel10Puzzle() {
  try {
    const courseResult = await pool.query(
      `SELECT id
       FROM courses
       WHERE LOWER(name) = 'python'
       LIMIT 1`
    );

    if (courseResult.rows.length === 0) {
      return null;
    }

    const courseId = courseResult.rows[0].id;
    const levelResult = await pool.query(
      `SELECT 
        lev.id,
        lev.level_number,
        lev.title,
        lev.description,
        lev.difficulty,
        lev.initial_code,
        lev.expected_output,
        l.id as lesson_id,
        l.title as lesson_title
       FROM levels lev
       JOIN lessons l ON l.id = lev.lesson_id
       WHERE l.course_id = $1
         AND lev.level_number = $2
         AND LOWER(lev.difficulty) = LOWER($3)
       ORDER BY lev.updated_at DESC NULLS LAST, lev.id DESC
       LIMIT 1`,
      [courseId, CHALLENGE_LEVEL_NUMBER, CHALLENGE_DIFFICULTY]
    );

    if (levelResult.rows.length === 0) {
      return null;
    }

    const level = levelResult.rows[0];
    return {
      id: `lesson_${level.id}`,
      title: level.title || `Level ${level.level_number}`,
      description: level.description || '',
      difficulty: level.difficulty || CHALLENGE_DIFFICULTY,
      lessonId: level.lesson_id,
      levelId: level.id,
      levelNumber: level.level_number,
      initialCode: level.initial_code,
      expectedOutput: level.expected_output,
      examples: [],
      constraints: []
    };
  } catch (error) {
    logger.error('python_beginner_level_10_error', { error: error.message });
    return null;
  }
}

/**
 * POST /api/battle/create
 * Create a new battle match
 */
router.post('/create', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      matchType = 'ranked',
      timeLimit = 1800,
      language = 'python',
      tempAccess = false
    } = req.body; // Default 30 minutes, python
    const isTempAccess = Boolean(tempAccess);

    // Get user statistics for matchmaking (create if doesn't exist)
    let statsResult = await pool.query(
      `SELECT 
        exp, rank_name, rank_index,
        total_success_count, total_fail_count,
        completed_achievements
      FROM student_statistics
      WHERE user_id = $1`,
      [userId]
    );

    // If no stats exist, create them
    if (statsResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO student_statistics (user_id, exp, rank_name, rank_index)
         VALUES ($1, 0, 'novice', 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      
      // Fetch again
      statsResult = await pool.query(
        `SELECT 
          exp, rank_name, rank_index,
          total_success_count, total_fail_count,
          completed_achievements
        FROM student_statistics
        WHERE user_id = $1`,
        [userId]
      );
    }

    const stats = statsResult.rows[0] || {
      exp: 0,
      rank_name: 'novice',
      rank_index: 0,
      total_success_count: 0,
      total_fail_count: 0,
      completed_achievements: 0
    };

    if (isTempAccess) {
      const tempProblem = await resolveBattleProblem(language, stats);
      if (!tempProblem) {
        return error(res, 500, 'No problems available for selected language', { language });
      }

      return ok(res, {
        matchId: 'temp-battle-match',
        problem: tempProblem,
        problemId: tempProblem.id,
        language,
        timeLimit,
        expDeducted: 0,
        remainingExp: stats.exp
      });
    }

    // Check if user has enough EXP (100 EXP wager)
    if (stats.exp < 100) {
      return error(res, 400, 'Insufficient EXP. You need at least 100 EXP to start a match.', { 
        currentExp: stats.exp,
        requiredExp: 100 
      });
    }

    // Deduct 100 EXP as wager
    const newExp = Math.max(0, stats.exp - 100);
    
    // Recalculate rank from new EXP (rank can decrease if EXP goes below threshold)
    const { getRankFromExp, normalizeExp } = require('../services/expRankService');
    const rankData = getRankFromExp(newExp);
    const normalizedExp = normalizeExp(newExp);
    
    const updateResult = await pool.query(
      `UPDATE student_statistics
       SET exp = $1,
           normalized_exp = $2,
           rank_name = $3,
           rank_index = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $5`,
      [newExp, normalizedExp, rankData.rankName, rankData.rankIndex, userId]
    );
    
    if (updateResult.rowCount === 0) {
      return error(res, 500, 'Failed to update EXP. Please try again.', { 
        message: 'No rows updated in student_statistics' 
      });
    }

    // Create match (store problem as JSON in a comment field or create a separate table)
    // For now, we'll store problem_id and language, and regenerate problem on retrieval
    // Use 'pending' status (allowed values: 'pending', 'active', 'completed', 'cancelled')
    const matchResult = await pool.query(
      `INSERT INTO multiplayer_matches (match_type, status)
       VALUES ($1, 'pending')
       RETURNING id, created_at`,
      [matchType]
    );

    const matchId = matchResult.rows[0].id;

    // Add user as participant
    await pool.query(
      `INSERT INTO multiplayer_match_participants (
        match_id, user_id, rank_name, success_count, fail_count, completed_achievements
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        matchId,
        userId,
        stats.rank_name,
        stats.total_success_count,
        stats.total_fail_count,
        stats.completed_achievements
      ]
    );

    const problem = await resolveBattleProblem(language, stats);
    if (!problem) {
      return error(res, 500, 'No problems available for selected language', { language });
    }

    // Store problem_id in match (we'll add a column for this later, for now return it)
    // In production, you'd want to add problem_id and language columns to multiplayer_matches table
    return ok(res, {
      matchId,
      problem,
      problemId: problem.id,
      language,
      timeLimit,
      startedAt: matchResult.rows[0].created_at,
      expDeducted: 100,
      remainingExp: newExp
    });

  } catch (err) {
    logger.error('create_battle_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    // Return more detailed error message
    return error(res, 500, `Failed to create battle: ${err.message}`, { 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

/**
 * GET /api/battle/available-opponents
 * Get list of available opponents (online flag derived from sessions)
 */
router.get('/available-opponents', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const opponentsResult = await pool.query(
      `SELECT
        u.id as user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.school_id,
        u.avatar_url,
        COALESCE(ss.rank_name, 'novice') as rank_name,
        COALESCE(ss.rank_index, 0) as rank_index,
        COALESCE(ss.exp, 0) as exp,
        -- A player is considered online if they have an active session
        -- (session_end is NULL) AND the session was recently active (within last 10 minutes)
        -- Extended to 10 minutes to account for slower heartbeat updates
        -- Also check for WebSocket connections via a separate check
        EXISTS (
          SELECT 1
          FROM user_sessions us
          WHERE us.user_id = u.id
            AND us.session_end IS NULL
            AND us.session_start > NOW() - INTERVAL '10 minutes'
        ) as is_online,
        (
          SELECT COUNT(*) 
          FROM multiplayer_match_participants mmp
          WHERE mmp.user_id = u.id AND mmp.is_winner = true
        ) as wins,
        (
          SELECT COUNT(*) 
          FROM multiplayer_match_participants mmp
          WHERE mmp.user_id = u.id
        ) as total_matches
      FROM users u
      LEFT JOIN student_statistics ss ON ss.user_id = u.id
      WHERE u.user_type = 'student'
        AND u.id != $1
        AND u.is_active = true
      ORDER BY 
        -- Online players first (is_online DESC puts true before false)
        is_online DESC,
        -- Then by EXP (highest first)
        ss.exp DESC NULLS LAST,
        -- Finally by creation date (newest first)
        u.created_at DESC
      LIMIT 20`,
      [userId]
    );

    const opponents = opponentsResult.rows.map(row => {
      const wins = parseInt(row.wins || 0, 10);
      const totalMatches = parseInt(row.total_matches || 0, 10);
      const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
      const rankIndex = parseInt(row.rank_index || 0, 10);
      let skill = 'Beginner';
      if (rankIndex >= 8) skill = 'Expert';
      else if (rankIndex >= 5) skill = 'Advanced';
      else if (rankIndex >= 2) skill = 'Intermediate';
      
      return {
        id: row.user_id,
        userId: row.user_id,
        username: row.username,
        schoolId: row.school_id || row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        avatar: row.avatar_url || '',
        rank: row.rank_name,
        rankIndex,
        exp: parseInt(row.exp || 0, 10),
        winRate,
        skill,
        isOnline: Boolean(row.is_online)
      };
    });

    return ok(res, {
      opponents,
      count: opponents.length
    });
  } catch (err) {
    logger.error('get_available_opponents_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to fetch available opponents', { message: err.message });
  }
});

/**
 * GET /api/battle/recent-ranked
 * Get recent ranked multiplayer matches for the current user
 * This is used to power the "Recent Ranked Matches" section in the
 * Multiplayer Battle dashboard.
 * NOTE: Must come before /:matchId route to avoid "recent-ranked" being parsed as a UUID
 */
router.get('/recent-ranked', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
         m.id as match_id,
         m.status,
         m.created_at,
         m.started_at,
         m.completed_at,
         self_p.is_winner as self_is_winner,
         self_p.exp_gained as self_exp_gained,
         self_p.exp_lost as self_exp_lost,
         ARRAY_AGG(
           CASE 
             WHEN u.id != $1 THEN
               COALESCE(
                 NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
                 u.username
               )
             ELSE NULL
           END
         ) FILTER (WHERE u.id != $1) as opponent_names
       FROM multiplayer_matches m
       JOIN multiplayer_match_participants self_p 
         ON self_p.match_id = m.id AND self_p.user_id = $1
       JOIN multiplayer_match_participants all_p 
         ON all_p.match_id = m.id
       JOIN users u ON u.id = all_p.user_id
       WHERE m.match_type = 'ranked'
       GROUP BY 
         m.id,
         m.status,
         m.created_at,
         m.started_at,
         m.completed_at,
         self_p.is_winner,
         self_p.exp_gained,
         self_p.exp_lost
       ORDER BY COALESCE(m.completed_at, m.started_at, m.created_at) DESC
       LIMIT 10`,
      [userId]
    );

    const matches = result.rows.map(row => {
      const matchDate = row.completed_at || row.started_at || row.created_at;
      const opponents = (row.opponent_names || []).filter(Boolean);

      // Use EXP gained/lost as a simple proxy for rating change
      const ratingChange = Number(row.self_exp_gained || 0) - Number(row.self_exp_lost || 0);

      return {
        matchId: row.match_id,
        opponents,
        result: row.self_is_winner ? 'Win' : 'Loss',
        date: matchDate,
        ratingChange,
      };
    });

    return ok(res, {
      matches,
      count: matches.length,
    });
  } catch (err) {
    logger.error('recent_ranked_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack,
    });
    return error(res, 500, 'Failed to load recent ranked matches', { message: err.message });
  }
});

/**
 * GET /api/battle/:matchId
 * Get battle match details
 */
router.get('/:matchId', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;
    const { language: languageParam, problemId: problemIdParam } = req.query; // Get from query params

    // Get match details
    const matchResult = await pool.query(
      `SELECT 
        m.id, m.match_type, m.status, m.started_at, m.completed_at,
        m.duration_seconds, m.cluster_id, m.match_score
      FROM multiplayer_matches m
      WHERE m.id = $1`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      return error(res, 404, 'Match not found');
    }

    const match = matchResult.rows[0];

    // Check if user is a participant
    const participantResult = await pool.query(
      `SELECT * FROM multiplayer_match_participants
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );

    if (participantResult.rows.length === 0) {
      return error(res, 403, 'You are not a participant in this match');
    }

    // Get all participants
    const participantsResult = await pool.query(
      `SELECT 
        mp.*,
        u.username, u.first_name, u.last_name, u.avatar_url,
        u.school_id
      FROM multiplayer_match_participants mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.match_id = $1
      ORDER BY mp.joined_at`,
      [matchId]
    );

    const participants = participantsResult.rows.map(p => ({
      userId: p.user_id,
      username: p.username,
      name: p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username,
      avatar: p.avatar_url,
      schoolId: p.school_id,
      isWinner: p.is_winner,
      completedCode: p.completed_code,
      completionTime: p.completion_time,
      expGained: p.exp_gained || 0,
      expLost: p.exp_lost || 0
    }));

    // Determine problem metadata:
    // 1) prefer explicit query params,
    // 2) otherwise rely on stored challenge data (if available),
    // 3) default to python/random fallback.
    let resolvedProblemId = problemIdParam;
    let resolvedLanguage = languageParam;

    if ((!resolvedProblemId || !resolvedLanguage) && match.match_type === 'challenge') {
      const challengeMeta = await pool.query(
        `SELECT problem_id, language
         FROM battle_challenges
         WHERE match_id = $1
         ORDER BY responded_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [matchId]
      );
      if (challengeMeta.rows.length > 0) {
        const row = challengeMeta.rows[0];
        if (!resolvedProblemId && row.problem_id) {
          resolvedProblemId = row.problem_id;
        }
        if (!resolvedLanguage && row.language) {
          resolvedLanguage = row.language;
        }
      }
    }

    const language = (resolvedLanguage || 'python').toLowerCase();
    let problem = null;
    
    if (resolvedProblemId) {
      // Check if it's a lesson level (starts with "lesson_")
      if (resolvedProblemId.startsWith('lesson_')) {
        const levelId = resolvedProblemId.replace('lesson_', '');
        // Get level from database
        const levelResult = await pool.query(
          `SELECT 
            lev.id,
            lev.level_number,
            lev.title,
            lev.description,
            lev.difficulty,
            lev.initial_code,
            lev.expected_output,
            l.id as lesson_id,
            l.title as lesson_title
          FROM levels lev
          JOIN lessons l ON l.id = lev.lesson_id
          WHERE lev.id = $1`,
          [levelId]
        );
        
        if (levelResult.rows.length > 0) {
          const level = levelResult.rows[0];
          problem = {
            id: `lesson_${level.id}`,
            title: level.title || `Level ${level.level_number}`,
            description: level.description || '',
            difficulty: level.difficulty || 'Medium',
            lessonId: level.lesson_id,
            levelId: level.id,
            levelNumber: level.level_number,
            initialCode: level.initial_code,
            expectedOutput: level.expected_output,
            examples: [],
            constraints: []
          };
        }
      } else {
        // Try to find the specific problem by ID from battleProblems
        const { getProblemsByLanguage } = require('../data/battleProblems');
        const languageProblems = getProblemsByLanguage(language);
        problem = languageProblems.find(p => p.id === resolvedProblemId);
        
        // Ensure battleProblems have initialCode
        if (problem && !problem.initialCode) {
          problem.initialCode = generateBasicInitialCode(problem, language);
        }
      }
    }
    
    // If not found, get a random problem (but this should match the original)
    if (!problem) {
      const difficulty = 'Medium'; // Default
      problem = getRandomProblem(language, difficulty) || {
        id: 'two_sum',
        title: 'Two Sum',
        description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
        difficulty: 'Medium',
        examples: [
          {
            input: 'nums = [2,7,11,15], target = 9',
            output: '[0,1]',
            explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].'
          }
        ]
      };
      
      // Ensure fallback problem has initialCode
      if (problem && !problem.initialCode) {
        problem.initialCode = generateBasicInitialCode(problem, language);
      }
    }
    
    // Ensure problem always has initialCode
    if (problem && !problem.initialCode) {
      problem.initialCode = generateBasicInitialCode(problem, language);
    }

    return ok(res, {
      match: {
        id: match.id,
        type: match.match_type,
        status: match.status,
        startedAt: match.started_at,
        completedAt: match.completed_at,
        durationSeconds: match.duration_seconds
      },
      problem,
      participants,
      currentUser: participants.find(p => p.userId === userId)
    });

  } catch (err) {
    logger.error('get_battle_error', {
      userId: req.user?.id,
      matchId: req.params.matchId,
      error: err.message
    });
    return error(res, 500, 'Failed to get battle details', { message: err.message });
  }
});

/**
 * POST /api/battle/:matchId/submit
 * Submit solution for battle
 */
router.post('/:matchId/submit', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;
    const { code, language = 'python' } = req.body;

    if (!code) {
      return error(res, 400, 'Code is required');
    }

    // Get match
    const matchResult = await pool.query(
      `SELECT status, started_at, match_type, completed_at, duration_seconds
       FROM multiplayer_matches
       WHERE id = $1`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      return error(res, 404, 'Match not found');
    }

    const match = matchResult.rows[0];
    const isChallengeMatch = match.match_type === 'challenge';

    // Check if user is participant (needed for both active and completed matches)
    const participantResult = await pool.query(
      `SELECT *
       FROM multiplayer_match_participants
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );

    if (participantResult.rows.length === 0) {
      return error(res, 403, 'You are not a participant in this match');
    }

    const existingParticipant = participantResult.rows[0];

    // If match already finished, respond idempotently instead of erroring
    if (match.status !== 'active') {
      const alreadyWinner = existingParticipant.is_winner === true;
      const completionTime =
        existingParticipant.completion_time ||
        (match.duration_seconds != null ? match.duration_seconds : 0);

      return ok(res, {
        success: alreadyWinner,
        completionTime,
        isWinner: alreadyWinner,
        expGained: alreadyWinner ? existingParticipant.exp_gained || 0 : 0,
        expLost: !alreadyWinner ? existingParticipant.exp_lost || 0 : 0,
        message: alreadyWinner
          ? 'Match already completed. You already won this battle.'
          : 'Match already completed.'
      });
    }

    // Calculate completion time
    const startedAt = new Date(match.started_at);
    const completedAt = new Date();
    const completionTime = Math.floor((completedAt - startedAt) / 1000);

    // Get problem details for validation
    let expectedSolution = null;
    let problemLanguage = language;
    
    try {
      // Get problem_id from battle_challenges or multiplayer_matches
      const problemQuery = await pool.query(
        `SELECT problem_id, language
         FROM battle_challenges
         WHERE match_id = $1
         ORDER BY responded_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [matchId]
      );
      
      let resolvedProblemId = null;
      if (problemQuery.rows.length > 0) {
        resolvedProblemId = problemQuery.rows[0].problem_id;
        if (problemQuery.rows[0].language) {
          problemLanguage = problemQuery.rows[0].language;
        }
      } else {
        // Try to get from multiplayer_matches if available
        const matchProblemQuery = await pool.query(
          `SELECT problem_id FROM multiplayer_matches WHERE id = $1`,
          [matchId]
        );
        if (matchProblemQuery.rows.length > 0 && matchProblemQuery.rows[0].problem_id) {
          resolvedProblemId = matchProblemQuery.rows[0].problem_id;
        }
      }
      
      // If we have a problem_id, fetch the expected solution
      if (resolvedProblemId) {
        // Check if it's a lesson level (starts with "lesson_")
        if (resolvedProblemId.startsWith('lesson_')) {
          const levelId = resolvedProblemId.replace('lesson_', '');
          const levelResult = await pool.query(
            `SELECT initial_code, expected_output
             FROM levels
             WHERE id = $1`,
            [levelId]
          );
          
          if (levelResult.rows.length > 0) {
            const level = levelResult.rows[0];
            // For puzzle-based battles, use initial_code as the expected solution
            // The expected_output is the runtime output, but we validate against initial_code structure
            expectedSolution = level.initial_code || level.expected_output;
          }
        }
      }
    } catch (problemError) {
      logger.warn('failed_to_fetch_problem_for_validation', {
        matchId,
        error: problemError.message
      });
      // Continue with validation even if problem fetch fails
    }

    // Normalize code for comparison (similar to frontend JigsawCodePuzzle validation)
    const normalizeCodeLine = (line) => {
      if (!line) return '';
      // Remove comments, normalize whitespace, trim
      return line
        .replace(/#.*$/, '') // Remove Python comments
        .replace(/\/\/.*$/, '') // Remove JS/C# comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    };

    const normalizeCode = (codeStr) => {
      if (!codeStr) return '';
      return codeStr
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => normalizeCodeLine(line))
        .filter(line => line.length > 0)
        .join('\n');
    };

    // Validate the submitted code against expected solution
    let isCorrect = false;
    try {
      if (!code || code.trim().length === 0) {
        isCorrect = false;
      } else if (expectedSolution) {
        // For puzzle-based battles: compare normalized code to expected solution
        // This matches the frontend validation logic in JigsawCodePuzzle
        const normalizedSubmitted = normalizeCode(code);
        const normalizedExpected = normalizeCode(expectedSolution);
        
        // Split into lines for comparison
        const submittedLines = normalizedSubmitted.split('\n').filter(l => l.trim());
        const expectedLines = normalizedExpected.split('\n').filter(l => l.trim());
        
        // For puzzle battles, order and structure matter
        // Check if line count matches first
        if (submittedLines.length === expectedLines.length) {
          let matches = true;
          for (let i = 0; i < expectedLines.length; i++) {
            const expectedLine = expectedLines[i].toLowerCase();
            const submittedLine = submittedLines[i].toLowerCase();
            
            // Compare normalized lines (case-insensitive)
            if (expectedLine !== submittedLine) {
              matches = false;
              break;
            }
          }
          isCorrect = matches;
        } else {
          // If line count doesn't match exactly, the solution is incorrect
          // (Puzzle solutions require exact structure)
          isCorrect = false;
        }
        
        // Log validation result for debugging
        logger.log('puzzle_validation_result', {
          matchId,
          userId,
          hasExpectedSolution: !!expectedSolution,
          submittedLines: submittedLines.length,
          expectedLines: expectedLines.length,
          isCorrect
        });
      } else {
        // Fallback validation: require meaningful code (prevents empty submissions)
        // This is less strict but prevents auto-wins
        const codeTrimmed = code.trim();
        const codeLower = codeTrimmed.toLowerCase();
        
        // Require minimum length and some code structure
        isCorrect = codeTrimmed.length > 10 && (
          codeLower.includes('def ') ||
          codeLower.includes('function ') ||
          codeLower.includes('class ') ||
          codeLower.includes('print') ||
          codeLower.includes('return') ||
          codeLower.includes('=') ||
          codeLower.includes('(')
        );
        
        logger.log('fallback_validation_result', {
          matchId,
          userId,
          codeLength: codeTrimmed.length,
          isCorrect
        });
      }
    } catch (e) {
      logger.error('code_validation_error', {
        matchId,
        userId,
        error: e.message,
        stack: e.stack
      });
      isCorrect = false;
    }

    // Update participant
    await pool.query(
      `UPDATE multiplayer_match_participants
       SET completed_code = $1, code_submitted = $2, completion_time = $3
       WHERE match_id = $4 AND user_id = $5`,
      [isCorrect, code, completionTime, matchId, userId]
    );

    // If correct, mark as winner and update match status
    if (isCorrect) {
      await pool.query(
        `UPDATE multiplayer_match_participants
         SET is_winner = true
         WHERE match_id = $1 AND user_id = $2`,
        [matchId, userId]
      );

      // End the match
      await pool.query(
        `UPDATE multiplayer_matches
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, duration_seconds = $1
         WHERE id = $2`,
        [completionTime, matchId]
      );

      // Calculate EXP gains/losses
      const allParticipants = await pool.query(
        `SELECT user_id, is_winner FROM multiplayer_match_participants WHERE match_id = $1`,
        [matchId]
      );

      let expGain = 0;
      let expLoss = 0;

      if (isChallengeMatch) {
        // 1v1 Direct Challenge: use the agreed EXP wager
        // Winner gets 2x wager, loser loses 1x wager
        let wager = 100;
        try {
          const wagerResult = await pool.query(
            `SELECT COALESCE(exp_wager, 100) AS exp_wager
             FROM battle_challenges
             WHERE match_id = $1
             ORDER BY responded_at DESC NULLS LAST, created_at DESC
             LIMIT 1`,
            [matchId]
          );
          if (wagerResult.rows.length > 0) {
            wager = parseInt(wagerResult.rows[0].exp_wager || 100, 10);
          }
        } catch (wagerErr) {
          logger.warn('challenge_wager_lookup_failed', {
            matchId,
            error: wagerErr.message
          });
        }

        expGain = wager * 2; // e.g. wager 100 → winner +200
        expLoss = wager;     // e.g. wager 100 → loser -100
      } else {
        // Ranked / non-challenge matches:
        // Scale rewards by number of participants (existing behaviour)
        const participantCount = allParticipants.rows.length;
        const baseWinExp = 200; // Base EXP for winning
        expGain = baseWinExp + (participantCount - 1) * 50; // Bonus for more players
        expLoss = 50; // EXP loss for losing
      }

      for (const participant of allParticipants.rows) {
        if (participant.is_winner) {
          await pool.query(
            `UPDATE multiplayer_match_participants
             SET exp_gained = $1
             WHERE match_id = $2 AND user_id = $3`,
            [expGain, matchId, participant.user_id]
          );

          // Get current EXP to calculate new rank
          const winnerStats = await pool.query(
            `SELECT exp FROM student_statistics WHERE user_id = $1`,
            [participant.user_id]
          );
          const winnerCurrentExp = winnerStats.rows[0]?.exp || 0;
          const winnerNewExp = Math.min(10000, winnerCurrentExp + expGain);
          
          // Recalculate rank from new EXP
          const { getRankFromExp, normalizeExp } = require('../services/expRankService');
          const winnerRankData = getRankFromExp(winnerNewExp);
          const winnerNormalizedExp = normalizeExp(winnerNewExp);

          // Update user's EXP and rank
          await pool.query(
            `UPDATE student_statistics
             SET exp = $1,
                 normalized_exp = $2,
                 rank_name = $3,
                 rank_index = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $5`,
            [winnerNewExp, winnerNormalizedExp, winnerRankData.rankName, winnerRankData.rankIndex, participant.user_id]
          );
        } else {
          await pool.query(
            `UPDATE multiplayer_match_participants
             SET exp_lost = $1
             WHERE match_id = $2 AND user_id = $3`,
            [expLoss, matchId, participant.user_id]
          );

          // Get current EXP to calculate new rank
          const currentStats = await pool.query(
            `SELECT exp FROM student_statistics WHERE user_id = $1`,
            [participant.user_id]
          );
          const currentExp = currentStats.rows[0]?.exp || 0;
          const newExp = Math.max(0, currentExp - expLoss);
          
          // Recalculate rank from new EXP (rank can decrease if EXP goes down)
          const { getRankFromExp, normalizeExp } = require('../services/expRankService');
          const rankData = getRankFromExp(newExp);
          const normalizedExp = normalizeExp(newExp);

          // Update user's EXP and rank (rank can decrease)
          await pool.query(
            `UPDATE student_statistics
             SET exp = $1,
                 normalized_exp = $2,
                 rank_name = $3,
                 rank_index = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $5`,
            [newExp, normalizedExp, rankData.rankName, rankData.rankIndex, participant.user_id]
          );
        }
      }

      // Notify all connected battle clients immediately via WebSocket (no delay)
      if (io) {
        const winnerIds = allParticipants.rows
          .filter(p => p.is_winner)
          .map(p => p.user_id);

        io.to(`battle:${matchId}`).emit('battle_completed', {
          matchId,
          status: 'completed',
          winners: winnerIds,
          timestamp: Date.now()
        });
      }
    }

    // Get EXP information for the current user (use the same calculation as database updates)
    let expGained = 0;
    let expLost = 0;
    
    if (isChallengeMatch) {
      // For challenge matches, use the wager-based calculation
      let wager = 100;
      try {
        const wagerResult = await pool.query(
          `SELECT COALESCE(exp_wager, 100) AS exp_wager
           FROM battle_challenges
           WHERE match_id = $1
           ORDER BY responded_at DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [matchId]
        );
        if (wagerResult.rows.length > 0) {
          wager = parseInt(wagerResult.rows[0].exp_wager || 100, 10);
        }
      } catch (wagerErr) {
        logger.warn('challenge_wager_lookup_failed_response', {
          matchId,
          error: wagerErr.message
        });
      }
      
      if (isCorrect) {
        expGained = wager * 2; // Winner gets 2x wager
      } else {
        expLost = wager; // Loser loses 1x wager
      }
    } else {
      // For ranked/non-challenge matches, use the participant-based calculation
      if (isCorrect) {
        const participantCount = allParticipants.rows.length;
        const baseWinExp = 200;
        expGained = baseWinExp + (participantCount - 1) * 50;
      } else {
        expLost = 50;
      }
    }

    return ok(res, {
      success: isCorrect,
      completionTime,
      isWinner: isCorrect,
      expGained: isCorrect ? expGained : 0,
      expLost: isCorrect ? 0 : expLost,
      message: isCorrect ? 'Congratulations! You solved it first!' : 'Solution submitted. Waiting for results...'
    });

  } catch (err) {
    logger.error('submit_battle_error', {
      userId: req.user?.id,
      matchId: req.params.matchId,
      error: err.message
    });
    return error(res, 500, 'Failed to submit solution', { message: err.message });
  }
});

/**
 * POST /api/battle/:matchId/exit
 * Exit/forfeit a battle. The remaining player wins and the match ends.
 */
router.post('/:matchId/exit', authenticateToken, requireStudent, async (req, res) => {
  const client = await pool.connect();

  try {
    const { matchId } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Check if user is participant
    const participantResult = await client.query(
      `SELECT * FROM multiplayer_match_participants
       WHERE match_id = $1 AND user_id = $2
       FOR UPDATE`,
      [matchId, userId]
    );

    if (participantResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return error(res, 403, 'You are not a participant in this match');
    }

    // Get match info (for duration and match type) and lock it
    const matchResult = await client.query(
      `SELECT status, started_at, match_type FROM multiplayer_matches WHERE id = $1 FOR UPDATE`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return error(res, 404, 'Match not found');
    }

    const match = matchResult.rows[0];
    const isChallengeMatch = match.match_type === 'challenge';

    // Determine remaining opponents (potential winners) - get this early for immediate notification
    const opponentsResult = await client.query(
      `SELECT user_id FROM multiplayer_match_participants
       WHERE match_id = $1 AND user_id != $2`,
      [matchId, userId]
    );
    let winnerIds = opponentsResult.rows.map(r => r.user_id);

    // Calculate EXP reward for winners (challenge matches use wager, ranked use base amount)
    let winExp = 150; // Default for ranked matches
    if (isChallengeMatch) {
      try {
        const wagerResult = await client.query(
          `SELECT COALESCE(exp_wager, 100) AS exp_wager
           FROM battle_challenges
           WHERE match_id = $1
           ORDER BY responded_at DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [matchId]
        );
        if (wagerResult.rows.length > 0) {
          const wager = parseInt(wagerResult.rows[0].exp_wager || 100, 10);
          winExp = wager * 2; // Winner gets 2x wager (same as normal win)
        }
      } catch (wagerErr) {
        logger.warn('challenge_wager_lookup_failed_exit', {
          matchId,
          error: wagerErr.message
        });
        // Default to 200 (100 * 2) for challenge matches if lookup fails
        winExp = 200;
      }
    }

    // NOTIFY OTHER PLAYERS IMMEDIATELY via WebSocket (before database operations)
    // This ensures instant notification without waiting for DB commit
    // ALWAYS send to user rooms (PRIMARY method), and also to battle room if it exists
    if (io && match.status !== 'completed' && winnerIds.length > 0) {
      const exitNotification = {
        matchId,
        exitedUserId: userId,
        exitedUsername: req.user.username,
        winnerIds,
        matchStatus: 'completed',
        message: 'Your opponent has left the battle. You win by forfeit!',
        timestamp: Date.now(),
        expGained: winExp
      };

      const battleUpdate = {
        type: 'opponent_exited',
        payload: {
          matchId,
          exitedUserId: userId,
          matchStatus: 'completed',
          winners: winnerIds,
          timestamp: Date.now()
        }
      };

      const completionEvent = {
        matchId,
        status: 'completed',
        winners: winnerIds,
        exitedUserId: userId,
        timestamp: Date.now()
      };

      // ALWAYS send to each winner's personal user room FIRST (PRIMARY method)
      // This ensures notification even if they haven't joined the battle room yet
      // or if the battle room is empty
      for (const winnerId of winnerIds) {
        io.to(`user:${winnerId}`).emit('opponent_exited', exitNotification);
        io.to(`user:${winnerId}`).emit('battle_update', battleUpdate);
        io.to(`user:${winnerId}`).emit('battle_completed', completionEvent);
        logger.info('sent_exit_notification_to_user_room_http', {
          matchId,
          winnerId,
          exitedUserId: userId
        });
      }

      // ALSO send to battle room (if players are in the room) as backup
      const room = io.sockets.adapter.rooms.get(`battle:${matchId}`);
      if (room && room.size > 0) {
        logger.info('broadcasting_exit_notification_http', {
          matchId,
          exitedUserId: userId,
          roomSize: room.size,
          winnerIds
        });

        io.to(`battle:${matchId}`).emit('opponent_exited', exitNotification);
        io.to(`battle:${matchId}`).emit('battle_update', battleUpdate);
        io.to(`battle:${matchId}`).emit('battle_completed', completionEvent);
      } else {
        logger.warn('no_room_for_exit_notification_http', {
          matchId,
          roomExists: !!room,
          roomSize: room ? room.size : 0,
          sentToUserRooms: winnerIds.length,
          note: 'Notifications sent to user rooms only'
        });
      }
    } else if (!io) {
      logger.error('io_not_available_for_exit_notification', {
        matchId,
        userId,
        winnerIds
      });
    }

    // Mark exiting player as forfeited (not winner)
    await client.query(
      `UPDATE multiplayer_match_participants
       SET completed_code = false, is_winner = false
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );

    // Apply EXP penalty (100 EXP for exiting)
    const expLoss = 100;
    await client.query(
      `UPDATE multiplayer_match_participants
       SET exp_lost = $1
       WHERE match_id = $2 AND user_id = $3`,
      [expLoss, matchId, userId]
    );

    // Get current EXP to calculate new rank for exiting player
    const exitStats = await client.query(
      `SELECT exp FROM student_statistics WHERE user_id = $1`,
      [userId]
    );
    const exitCurrentExp = exitStats.rows[0]?.exp || 0;
    const exitNewExp = Math.max(0, exitCurrentExp - expLoss);
    
    // Recalculate rank from new EXP (rank can decrease)
    const { getRankFromExp, normalizeExp } = require('../services/expRankService');
    const exitRankData = getRankFromExp(exitNewExp);
    const exitNormalizedExp = normalizeExp(exitNewExp);

    await client.query(
      `UPDATE student_statistics
       SET exp = $1,
           normalized_exp = $2,
           rank_name = $3,
           rank_index = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $5`,
      [exitNewExp, exitNormalizedExp, exitRankData.rankName, exitRankData.rankIndex, userId]
    );

    // Only proceed to award win if match is not already completed and there is at least one opponent
    if (match.status !== 'completed' && winnerIds.length > 0) {
      // Use calculated winExp (already computed above based on match type and wager)

      for (const winnerId of winnerIds) {
        // Update participant as winner
        await client.query(
          `UPDATE multiplayer_match_participants
           SET is_winner = true,
               completed_code = true,
               exp_gained = $1
           WHERE match_id = $2 AND user_id = $3`,
          [winExp, matchId, winnerId]
        );

        // Update winner's EXP and rank
        const winnerStats = await client.query(
          `SELECT exp FROM student_statistics WHERE user_id = $1`,
          [winnerId]
        );
        const winnerCurrentExp = winnerStats.rows[0]?.exp || 0;
        const winnerNewExp = Math.min(10000, winnerCurrentExp + winExp);
        const winnerRankData = getRankFromExp(winnerNewExp);
        const winnerNormalizedExp = normalizeExp(winnerNewExp);

        await client.query(
          `UPDATE student_statistics
           SET exp = $1,
               normalized_exp = $2,
               rank_name = $3,
               rank_index = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $5`,
          [winnerNewExp, winnerNormalizedExp, winnerRankData.rankName, winnerRankData.rankIndex, winnerId]
        );
      }

      // Mark match as completed
      const completedAt = new Date();
      let durationSeconds = null;
      if (match.started_at) {
        const startedAt = new Date(match.started_at);
        durationSeconds = Math.max(0, Math.floor((completedAt - startedAt) / 1000));
      }

      await client.query(
        `UPDATE multiplayer_matches
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             duration_seconds = COALESCE($2, duration_seconds)
         WHERE id = $1`,
        [matchId, durationSeconds]
      );

      // Final state update (redundant notification to ensure delivery)
      if (io) {
        const room = io.sockets.adapter.rooms.get(`battle:${matchId}`);
        if (room) {
          io.to(`battle:${matchId}`).emit('battle_completed', {
            matchId,
            status: 'completed',
            winners: winnerIds,
            timestamp: Date.now()
          });
        }
      }
    }

    await client.query('COMMIT');
    client.release();

    return ok(res, {
      message: 'You have exited the battle',
      expLost: expLoss,
      winners: winnerIds
    });

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    client.release();

    logger.error('exit_battle_error', {
      userId: req.user?.id,
      matchId: req.params.matchId,
      error: err.message
    });
    return error(res, 500, 'Failed to exit battle', { message: err.message });
  }
});

/**
 * POST /api/battle/:matchId/ready
 * Mark player as ready
 */
router.post('/:matchId/ready', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;

    // Check if user is participant
    const participantResult = await pool.query(
      `SELECT * FROM multiplayer_match_participants
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );

    if (participantResult.rows.length === 0) {
      return error(res, 403, 'You are not a participant in this match');
    }

    // Update participant as ready (we'll use a JSON field or add a column)
    // For now, we'll track ready status in a comment or use status field
    // Since we don't have is_ready column, we'll use a workaround with joined_at timestamp
    // Actually, let's check match status first
    const matchResult = await pool.query(
      `SELECT status, started_at FROM multiplayer_matches WHERE id = $1`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      return error(res, 404, 'Match not found');
    }

    const match = matchResult.rows[0];

    // If match is pending, update to active when all are ready
    if (match.status === 'pending') {
      // Check all participants
      const allParticipants = await pool.query(
        `SELECT user_id, joined_at FROM multiplayer_match_participants WHERE match_id = $1`,
        [matchId]
      );

      // For simplicity, we'll start the match when ready is called
      // In a real system, you'd track ready status per participant
      // For now, we'll just update the match status to active
      await pool.query(
        `UPDATE multiplayer_matches
         SET status = 'active', started_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [matchId]
      );
    }

    return ok(res, {
      message: 'You are ready!',
      matchStatus: 'active'
    });

  } catch (err) {
    logger.error('ready_battle_error', {
      userId: req.user?.id,
      matchId: req.params.matchId,
      error: err.message
    });
    return error(res, 500, 'Failed to mark as ready', { message: err.message });
  }
});

/**
 * POST /api/battle/:matchId/kick-unready
 * Kick unready players after 2 minutes (called by a background job or client)
 */
router.post('/:matchId/kick-unready', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;

    // Check if user is participant and has permission (or use admin check)
    const matchResult = await pool.query(
      `SELECT status, created_at FROM multiplayer_matches WHERE id = $1`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      return error(res, 404, 'Match not found');
    }

    const match = matchResult.rows[0];

    // Only kick if match is still pending and 2 minutes have passed
    if (match.status === 'pending') {
      const matchAge = Math.floor((new Date() - new Date(match.created_at)) / 1000);
      
      if (matchAge >= 120) { // 2 minutes
        // Get all participants who haven't marked ready
        // For now, we'll kick all participants who haven't started (simplified)
        // In production, you'd track ready status properly
        
        // Get participants
        const participants = await pool.query(
          `SELECT user_id FROM multiplayer_match_participants WHERE match_id = $1`,
          [matchId]
        );

        // Kick all participants (lose 100 EXP each)
        const { getRankFromExp, normalizeExp } = require('../services/expRankService');
        for (const participant of participants.rows) {
          // Get current EXP to calculate new rank
          const kickStats = await pool.query(
            `SELECT exp FROM student_statistics WHERE user_id = $1`,
            [participant.user_id]
          );
          const kickCurrentExp = kickStats.rows[0]?.exp || 0;
          const kickNewExp = Math.max(0, kickCurrentExp - 100);
          
          // Recalculate rank from new EXP (rank can decrease)
          const kickRankData = getRankFromExp(kickNewExp);
          const kickNormalizedExp = normalizeExp(kickNewExp);

          // Update user's EXP and rank (rank can decrease)
          await pool.query(
            `UPDATE student_statistics
             SET exp = $1,
                 normalized_exp = $2,
                 rank_name = $3,
                 rank_index = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $5`,
            [kickNewExp, kickNormalizedExp, kickRankData.rankName, kickRankData.rankIndex, participant.user_id]
          );
        }

        // Cancel the match
        await pool.query(
          `UPDATE multiplayer_matches
           SET status = 'cancelled'
           WHERE id = $1`,
          [matchId]
        );

        return ok(res, {
          message: 'Unready players have been kicked',
          kickedCount: participants.rows.length
        });
      }
    }

    return ok(res, {
      message: 'No action needed'
    });

  } catch (err) {
    logger.error('kick_unready_error', {
      userId: req.user?.id,
      matchId: req.params.matchId,
      error: err.message
    });
    return error(res, 500, 'Failed to kick unready players', { message: err.message });
  }
});

/**
 * POST /api/battle/matchmaking/queue
 * Add player to matchmaking queue and find matches using algorithms
 */
router.post('/matchmaking/queue', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;
    // For ranked matchmaking: minimum 3 players, maximum 5 players
    const { matchType = 'ranked', language = 'python', matchSize = 3 } = req.body;
    const minMatchSize = 3; // Minimum players for ranked match
    const maxMatchSize = 5; // Maximum players for ranked match

    // Check if user has enough EXP (100 EXP wager) - but don't deduct yet
    const statsCheck = await pool.query(
      `SELECT exp FROM student_statistics WHERE user_id = $1`,
      [userId]
    );
    const currentExp = statsCheck.rows[0]?.exp || 0;
    if (currentExp < 100) {
      return error(res, 400, 'Insufficient EXP. You need at least 100 EXP to join matchmaking.', {
        currentExp,
        requiredExp: 100
      });
    }

    // First, check if user already has a pending/active match (they might have been matched)
    const existingMatchCheck = await pool.query(
      `SELECT 
        m.id, m.status, m.match_type,
        COUNT(DISTINCT mmp.user_id) as participant_count
      FROM multiplayer_matches m
      JOIN multiplayer_match_participants mmp ON m.id = mmp.match_id
      WHERE mmp.user_id = $1 
        AND m.status IN ('pending', 'active')
        AND m.created_at > NOW() - INTERVAL '10 minutes'
      GROUP BY m.id, m.status, m.match_type
      ORDER BY m.created_at DESC
      LIMIT 1`,
      [userId]
    );

    if (existingMatchCheck.rows.length > 0) {
      const existingMatch = existingMatchCheck.rows[0];
      const participantCount = parseInt(existingMatch.participant_count);
      
      // If match has enough participants (at least minMatchSize), return it
      if (participantCount >= minMatchSize) {
        return ok(res, {
          status: 'matched',
          matchId: existingMatch.id,
          message: 'Match found!',
          participants: participantCount
        });
      }
      // Otherwise, continue to matchmaking (they're still waiting)
    }

    // Get current player data
    let currentPlayer;
    try {
      currentPlayer = await getPlayerDataForMatchmaking(userId);
    } catch (playerDataError) {
      logger.error('getPlayerDataForMatchmaking_error', {
        userId,
        error: playerDataError.message,
        stack: playerDataError.stack
      });
      throw new Error(`Failed to get player data: ${playerDataError.message}`);
    }

    // Get other players in queue (pending matches or recent queue entries)
    // Match players by same language but prioritize identical/adjacent ranks
    const currentPlayerRankIndex = typeof currentPlayer.rank_index === 'number'
      ? currentPlayer.rank_index
      : parseInt(currentPlayer.rank_index, 10) || 0;
    
    let queueResult;
    try {
      // CRITICAL: Only get ONLINE players (active session within last 5 minutes)
      // This ensures we only match players who are actually available
      queueResult = await pool.query(
        `SELECT DISTINCT
          mmp.user_id,
          m.id as match_id,
          mmp.rank_name,
          COALESCE(ss.rank_index, 0) as rank_index
        FROM multiplayer_match_participants mmp
        JOIN multiplayer_matches m ON m.id = mmp.match_id
        LEFT JOIN student_statistics ss ON ss.user_id = mmp.user_id
        INNER JOIN user_sessions us ON us.user_id = mmp.user_id
        WHERE m.status = 'pending'
          AND mmp.user_id != $1
          AND m.created_at > NOW() - INTERVAL '5 minutes'
          AND us.session_end IS NULL
          AND us.session_start > NOW() - INTERVAL '5 minutes'
        ORDER BY m.created_at DESC
        LIMIT 20`,
        [userId]
      );
    } catch (queueError) {
      logger.error('queue_query_error', {
        userId,
        error: queueError.message,
        stack: queueError.stack
      });
      // If queue query fails, continue with just current player
      queueResult = { rows: [] };
    }

    // Get player data for all queued players
    let queuedPlayers = [];
    try {
      const queuedPlayerData = await Promise.all(
        queueResult.rows.map((row, index) => 
          getPlayerDataForMatchmaking(row.user_id).then(player => ({
            ...player,
            rank_index: typeof player.rank_index === 'number'
              ? player.rank_index
              : parseInt(row.rank_index, 10) || 0,
            _queueOrder: index
          }))
        )
      );

      queuedPlayers = queuedPlayerData;
    } catch (queuedPlayersError) {
      logger.error('queued_players_data_error', {
        userId,
        error: queuedPlayersError.message,
        stack: queuedPlayersError.stack
      });
      // If getting queued players fails, continue with just current player
      queuedPlayers = [];
    }

    const sameRankPlayers = [];
    const adjacentRankPlayers = [];
    const closeRankPlayers = [];
    const fallbackRankPlayers = [];

    for (const player of queuedPlayers) {
      const playerRankIndex = typeof player.rank_index === 'number'
        ? player.rank_index
        : parseInt(player.rank_index, 10) || 0;
      const rankGap = Math.abs(playerRankIndex - currentPlayerRankIndex);

      if (rankGap === 0) {
        sameRankPlayers.push(player);
      } else if (rankGap === 1) {
        adjacentRankPlayers.push(player);
      } else if (rankGap === 2) {
        closeRankPlayers.push(player);
      } else {
        fallbackRankPlayers.push(player);
      }
    }

    const normalizedMatchSize = Math.max(
      minMatchSize,
      Math.min(matchSize, maxMatchSize)
    );
    const minOpponentsNeeded = minMatchSize - 1;
    const maxOpponentsWanted = normalizedMatchSize - 1;
    const prioritizedOpponents = [];

    const addFromBucket = (bucket) => {
      for (const candidate of bucket) {
        if (prioritizedOpponents.length >= maxOpponentsWanted) {
          break;
        }
        prioritizedOpponents.push(candidate);
      }
    };

    addFromBucket(sameRankPlayers);

    if (prioritizedOpponents.length < minOpponentsNeeded) {
      addFromBucket(adjacentRankPlayers);
    }
    if (prioritizedOpponents.length < minOpponentsNeeded) {
      addFromBucket(closeRankPlayers);
    }
    if (prioritizedOpponents.length < minOpponentsNeeded) {
      addFromBucket(fallbackRankPlayers);
    }

    // For ranked matchmaking, need at least minMatchSize players (current + opponents)
    if ((prioritizedOpponents.length + 1) < minMatchSize) {
      // Not enough players in queue, create a pending match for current player
      // Store language preference in a comment or metadata field
      // For now, we'll add it to the match_type or create a separate approach
      // Since we can't modify schema easily, we'll store it in match_type as JSON or use a workaround
      // Actually, let's check if there's a way to store it - for now, we'll use a workaround
      // by checking WebSocket queue for language matching
      
      const matchResult = await pool.query(
        `INSERT INTO multiplayer_matches (match_type, status)
         VALUES ($1, 'pending')
         RETURNING id, created_at`,
        [matchType]
      );

      const matchId = matchResult.rows[0].id;

      // Add current player as participant with theta/beta
      await pool.query(
        `INSERT INTO multiplayer_match_participants (
          match_id, user_id, theta, beta, rank_name, 
          success_count, fail_count, completed_achievements
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          matchId,
          currentPlayer.user_id,
          currentPlayer.theta,
          currentPlayer.beta,
          currentPlayer.rank_name,
          currentPlayer.success_count,
          currentPlayer.fail_count,
          currentPlayer.completed_achievements
        ]
      );

      return ok(res, {
        status: 'queued',
        matchId,
        message: 'Added to matchmaking queue. Waiting for opponents...',
        playersInQueue: prioritizedOpponents.length + 1
      });
    }

    // Use matchmaking algorithm with K-means clustering and skill-based matching
    // Select up to normalized match size players for the match
    const playersToMatch = [currentPlayer, ...prioritizedOpponents];
    const actualMatchSize = Math.min(playersToMatch.length, normalizedMatchSize);
    
    try {
      const matches = await findMatches(playersToMatch, {
        matchSize: actualMatchSize, // Use actual match size (3-5 players)
        allowCrossCluster: true,
        minMatchScore: 0.5,
        kClusters: 3 // Use K-means clustering
      });

      if (matches && matches.length > 0) {
        // Find match that includes current player
        const playerMatch = matches.find(m => 
          m.players.some(p => p.user_id === userId)
        );

        if (playerMatch) {
          const matchedPlayerIds = playerMatch.players.map(p => p.user_id);
          
          // Create match with matched players
          const matchResult = await pool.query(
            `INSERT INTO multiplayer_matches (
              match_type, status, cluster_id, match_score
            ) VALUES ($1, 'pending', $2, $3)
            RETURNING id, created_at`,
            [
              matchType,
              playerMatch.cluster !== undefined ? playerMatch.cluster : null,
              playerMatch.match_score || null
            ]
          );

          const matchId = matchResult.rows[0].id;

          // Deduct EXP from all matched players (100 EXP wager)
          const { getRankFromExp, normalizeExp } = require('../services/expRankService');
          for (const player of playerMatch.players) {
            // Get current EXP
            const playerStats = await pool.query(
              `SELECT exp FROM student_statistics WHERE user_id = $1`,
              [player.user_id]
            );
            const playerExp = playerStats.rows[0]?.exp || 0;
            const newExp = Math.max(0, playerExp - 100);
            
            // Recalculate rank
            const rankData = getRankFromExp(newExp);
            const normalizedExp = normalizeExp(newExp);
            
            // Update EXP and rank
            await pool.query(
              `UPDATE student_statistics
               SET exp = $1,
                   normalized_exp = $2,
                   rank_name = $3,
                   rank_index = $4,
                   updated_at = CURRENT_TIMESTAMP
               WHERE user_id = $5`,
              [newExp, normalizedExp, rankData.rankName, rankData.rankIndex, player.user_id]
            );
            
            // Add as participant
            await pool.query(
              `INSERT INTO multiplayer_match_participants (
                match_id, user_id, theta, beta, rank_name,
                success_count, fail_count, completed_achievements
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                matchId,
                player.user_id,
                player.theta,
                player.beta,
                player.rank_name,
                player.success_count,
                player.fail_count,
                player.completed_achievements
              ]
            );
          }

          // Update old pending matches to cancelled if players were matched
          await pool.query(
            `UPDATE multiplayer_matches
             SET status = 'cancelled'
             WHERE id IN (
               SELECT DISTINCT m.id
               FROM multiplayer_matches m
               JOIN multiplayer_match_participants mmp ON m.id = mmp.match_id
               WHERE m.status = 'pending'
                 AND mmp.user_id = ANY($1::uuid[])
                 AND m.id != $2
             )`,
            [matchedPlayerIds, matchId]
          );

          return ok(res, {
            status: 'matched',
            matchId,
            matchScore: playerMatch.match_score,
            cluster: playerMatch.cluster,
            opponents: playerMatch.players
              .filter(p => p.user_id !== userId)
              .map(p => ({ userId: p.user_id, rank: p.rank_name })),
            message: `Matched with ${playerMatch.players.length - 1} opponent(s)!`
          });
        }
      }

      // No good match found, add to queue
      const matchResult = await pool.query(
        `INSERT INTO multiplayer_matches (match_type, status)
         VALUES ($1, 'pending')
         RETURNING id, created_at`,
        [matchType]
      );

      const matchId = matchResult.rows[0].id;

      await pool.query(
        `INSERT INTO multiplayer_match_participants (
          match_id, user_id, theta, beta, rank_name,
          success_count, fail_count, completed_achievements
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          matchId,
          currentPlayer.user_id,
          currentPlayer.theta,
          currentPlayer.beta,
          currentPlayer.rank_name,
          currentPlayer.success_count,
          currentPlayer.fail_count,
          currentPlayer.completed_achievements
        ]
      );

      return ok(res, {
        status: 'queued',
        matchId,
        message: 'Added to matchmaking queue. Waiting for better matches...',
        playersInQueue: allPlayers.length
      });

    } catch (matchmakingError) {
      logger.error('matchmaking_algorithm_error', {
        userId,
        error: matchmakingError.message,
        stack: matchmakingError.stack
      });

      // Fallback: create pending match without algorithm
      const matchResult = await pool.query(
        `INSERT INTO multiplayer_matches (match_type, status)
         VALUES ($1, 'pending')
         RETURNING id, created_at`,
        [matchType]
      );

      const matchId = matchResult.rows[0].id;

      await pool.query(
        `INSERT INTO multiplayer_match_participants (
          match_id, user_id, theta, beta, rank_name,
          success_count, fail_count, completed_achievements
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          matchId,
          currentPlayer.user_id,
          currentPlayer.theta,
          currentPlayer.beta,
          currentPlayer.rank_name,
          currentPlayer.success_count,
          currentPlayer.fail_count,
          currentPlayer.completed_achievements
        ]
      );

      return ok(res, {
        status: 'queued',
        matchId,
        message: 'Added to matchmaking queue (fallback mode)',
        warning: 'Matchmaking algorithm unavailable, using basic queue'
      });
    }

  } catch (err) {
    logger.error('matchmaking_queue_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    // Return more detailed error information
    const errorDetails = {
      message: err.message,
      name: err.name,
      code: err.code
    };
    // Include additional context for common errors
    if (err.code === 'ECONNREFUSED' || err.message?.includes('connect')) {
      errorDetails.hint = 'Database connection failed. Please check if the database is running.';
    } else if (err.message?.includes('relation') || err.message?.includes('does not exist')) {
      errorDetails.hint = 'Database table or column missing. Please check database schema.';
    } else if (err.message?.includes('Python') || err.message?.includes('spawn')) {
      errorDetails.hint = 'Python script execution failed. Please check if Python is installed and dependencies are available.';
    }
    return error(res, 500, 'Failed to join matchmaking queue', errorDetails);
  }
});

/**
 * GET /api/battle/matchmaking/status/:matchId
 * Get matchmaking status for a match
 */
router.get('/matchmaking/status/:matchId', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;

    const matchResult = await pool.query(
      `SELECT 
        m.id, m.status, m.match_type, m.cluster_id, m.match_score,
        m.created_at, m.started_at,
        COUNT(DISTINCT mmp.user_id) as participant_count
      FROM multiplayer_matches m
      LEFT JOIN multiplayer_match_participants mmp ON m.id = mmp.match_id
      WHERE m.id = $1
      GROUP BY m.id, m.status, m.match_type, m.cluster_id, m.match_score, m.created_at, m.started_at`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      return error(res, 404, 'Match not found');
    }

    const match = matchResult.rows[0];

    // Check if user is a participant
    const participantResult = await pool.query(
      `SELECT user_id FROM multiplayer_match_participants
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );

    if (participantResult.rows.length === 0) {
      return error(res, 403, 'You are not a participant in this match');
    }

    // Get all participants
    const participantsResult = await pool.query(
      `SELECT 
        mmp.user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.avatar_url,
        mmp.rank_name,
        mmp.theta,
        mmp.beta
      FROM multiplayer_match_participants mmp
      JOIN users u ON u.id = mmp.user_id
      WHERE mmp.match_id = $1`,
      [matchId]
    );

    return ok(res, {
      matchId: match.id,
      status: match.status,
      matchType: match.match_type,
      clusterId: match.cluster_id,
      matchScore: match.match_score,
      participantCount: parseInt(match.participant_count),
      participants: participantsResult.rows.map(p => ({
        userId: p.user_id,
        username: p.username,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username,
        avatar: p.avatar_url,
        rank: p.rank_name,
        theta: p.theta,
        beta: p.beta
      })),
      createdAt: match.created_at,
      startedAt: match.started_at
    });

  } catch (err) {
    logger.error('matchmaking_status_error', {
      userId: req.user?.id,
      matchId: req.params.matchId,
      error: err.message
    });
    return error(res, 500, 'Failed to get matchmaking status', { message: err.message });
  }
});

/**
 * GET /api/battle/matchmaking/debug
 * Debug endpoint to see all players in matchmaking queue
 */
router.get('/matchmaking/debug', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { getQueueDetails, getQueueStatus } = require('../services/websocketMatchmaking');
    const queueStatus = getQueueStatus();
    const queueDetails = getQueueDetails();
    
    // Get player details for each queued player
    const playerDetails = await Promise.all(
      queueDetails.map(async (q) => {
        try {
          const playerData = await require('../services/websocketMatchmaking').getPlayerDataForMatchmaking(q.userId);
          const userResult = await pool.query(
            `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url
             FROM users u WHERE u.id = $1`,
            [q.userId]
          );
          return {
            ...q,
            rank: playerData.rank_name,
            username: userResult.rows[0]?.username || 'Unknown',
            name: `${userResult.rows[0]?.first_name || ''} ${userResult.rows[0]?.last_name || ''}`.trim() || userResult.rows[0]?.username || 'Unknown'
          };
        } catch (err) {
          return { ...q, error: err.message };
        }
      })
    );
    
    return ok(res, {
      queueSize: queueStatus.queueSize,
      activeMatches: queueStatus.activeMatches,
      players: playerDetails
    });
  } catch (err) {
    logger.error('matchmaking_debug_error', {
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to get matchmaking debug info', { message: err.message });
  }
});

/**
 * ============================================================
 * DIRECT 1v1 CHALLENGES
 * ============================================================
 */

/**
 * POST /api/battle/challenge
 * Create a direct challenge from current user to another player
 */
router.post('/challenge', authenticateToken, requireStudent, async (req, res) => {
  try {
    const fromUserId = req.user.id;
    const { opponentId, language, expWager = 100 } = req.body || {};

    if (!opponentId) {
      return error(res, 400, 'opponentId is required');
    }

    if (opponentId === fromUserId) {
      return error(res, 400, 'You cannot challenge yourself');
    }

    // Ensure opponent exists and is an active student
    const opponentResult = await pool.query(
      `SELECT id, username, first_name, last_name, school_id, avatar_url
       FROM users
       WHERE id = $1 AND user_type = 'student' AND is_active = TRUE`,
      [opponentId]
    );

    if (opponentResult.rows.length === 0) {
      return error(res, 404, 'Opponent not found or not an active student');
    }

    // Optionally prevent spamming: keep only newest pending challenge between same pair
    await pool.query(
      `UPDATE battle_challenges
       SET status = 'expired', responded_at = CURRENT_TIMESTAMP
       WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`,
      [fromUserId, opponentId]
    );

    const challengeLanguage = language || CHALLENGE_LANGUAGE;
    const wagerAmount = parseInt(expWager, 10) || 100;

    // Check if exp_wager column exists, if not, add it dynamically (for backward compatibility)
    let insertQuery = `INSERT INTO battle_challenges (from_user_id, to_user_id, language`;
    let values = [fromUserId, opponentId, challengeLanguage];
    let valuePlaceholders = ['$1', '$2', '$3'];
    let placeholderIndex = 4;

    // Try to add exp_wager if column exists
    try {
      const columnCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'battle_challenges' AND column_name = 'exp_wager'`
      );
      if (columnCheck.rows.length > 0) {
        insertQuery += `, exp_wager`;
        values.push(wagerAmount);
        valuePlaceholders.push(`$${placeholderIndex}`);
        placeholderIndex++;
      }
    } catch (colErr) {
      // Column doesn't exist, continue without it
      logger.warn('exp_wager column not found in battle_challenges', { error: colErr.message });
    }

    insertQuery += `) VALUES (${valuePlaceholders.join(', ')}) RETURNING id, created_at`;

    const insertResult = await pool.query(insertQuery, values);

    const challenge = insertResult.rows[0];

    // Notify opponent via WebSocket if available
    if (io) {
      io.to(`user:${opponentId}`).emit('challenge_received', {
        challengeId: challenge.id,
        fromUserId,
        fromUsername: req.user.username,
        language: challengeLanguage,
        expWager: wagerAmount
      });
    }

    return ok(res, {
      challengeId: challenge.id,
      createdAt: challenge.created_at,
      language: challengeLanguage,
      expWager: wagerAmount
    });
  } catch (err) {
    logger.error('create_challenge_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to create challenge', { message: err.message });
  }
});

/**
 * GET /api/battle/challenges/incoming
 * Get pending challenges for the current user
 */
router.get('/challenges/incoming', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
         bc.id,
         bc.language,
         bc.created_at,
         COALESCE(bc.exp_wager, 100) as exp_wager,
         u.id as from_user_id,
         u.username as from_username,
         u.first_name as from_first_name,
         u.last_name as from_last_name,
         u.school_id as from_school_id,
         u.avatar_url as from_avatar_url
       FROM battle_challenges bc
       JOIN users u ON u.id = bc.from_user_id
       WHERE bc.to_user_id = $1
         AND bc.status = 'pending'
       ORDER BY bc.created_at DESC
       LIMIT 5`,
      [userId]
    );

    const challenges = result.rows.map(row => ({
      id: row.id,
      language: row.language,
      expWager: parseInt(row.exp_wager || 100, 10),
      createdAt: row.created_at,
      fromUser: {
        id: row.from_user_id,
        username: row.from_username,
        firstName: row.from_first_name,
        lastName: row.from_last_name,
        schoolId: row.from_school_id,
        avatarUrl: row.from_avatar_url
      }
    }));

    return ok(res, {
      challenges,
      count: challenges.length
    });
  } catch (err) {
    logger.error('get_incoming_challenges_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to get incoming challenges', { message: err.message });
  }
});

/**
 * POST /api/battle/challenges/:id/respond
 * Accept or decline a direct challenge
 */
router.post('/challenges/:id/respond', authenticateToken, requireStudent, async (req, res) => {
  const client = await pool.connect();

  try {
    const challengeId = req.params.id;
    const userId = req.user.id;
    const { action } = req.body || {};

    if (!['accept', 'decline'].includes(action)) {
      client.release();
      return error(res, 400, 'Invalid action. Must be accept or decline.');
    }

    await client.query('BEGIN');

    const challengeResult = await client.query(
      `SELECT *
       FROM battle_challenges
       WHERE id = $1
       FOR UPDATE`,
      [challengeId]
    );

    if (challengeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return error(res, 404, 'Challenge not found');
    }

    const challenge = challengeResult.rows[0];

    if (challenge.to_user_id !== userId) {
      await client.query('ROLLBACK');
      client.release();
      return error(res, 403, 'You are not the recipient of this challenge');
    }

    if (challenge.status !== 'pending') {
      await client.query('ROLLBACK');
      client.release();
      return error(res, 400, `Challenge is already ${challenge.status}`);
    }

    if (action === 'decline') {
      await client.query(
        `UPDATE battle_challenges
         SET status = 'declined',
             responded_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [challengeId]
      );

      // Notify challenger via WebSocket that challenge was declined
      if (io) {
        const challengerId = challenge.from_user_id;
        const recipientName = req.user.firstName && req.user.lastName
          ? `${req.user.firstName} ${req.user.lastName}`
          : req.user.username || 'Opponent';
        
        io.to(`user:${challengerId}`).emit('challenge_declined', {
          challengeId,
          declinedBy: recipientName,
          declinedById: userId,
          message: `${recipientName} declined your challenge`
        });
      }

      await client.query('COMMIT');
      client.release();

      return ok(res, {
        challengeId,
        status: 'declined'
      });
    }

    // Accept: create an active match for both players
    const fromUserId = challenge.from_user_id;
    const toUserId = challenge.to_user_id;
    // Use the language from the challenge (selected when challenge was created)
    const enforcedLanguage = challenge.language || CHALLENGE_LANGUAGE;

    // Fetch stats for both players (for rank_name, etc.)
    const statsResult = await client.query(
      `SELECT 
         user_id,
         COALESCE(rank_name, 'novice') as rank_name,
         COALESCE(total_success_count, 0) as total_success_count,
         COALESCE(total_fail_count, 0) as total_fail_count,
         COALESCE(completed_achievements, 0) as completed_achievements
       FROM student_statistics
       WHERE user_id = ANY($1::uuid[])`,
      [[fromUserId, toUserId]]
    );

    const statsByUser = new Map();
    for (const row of statsResult.rows) {
      statsByUser.set(row.user_id, row);
    }

    const fromStats = statsByUser.get(fromUserId) || {
      rank_name: 'novice',
      total_success_count: 0,
      total_fail_count: 0,
      completed_achievements: 0
    };

    const toStats = statsByUser.get(toUserId) || {
      rank_name: 'novice',
      total_success_count: 0,
      total_fail_count: 0,
      completed_achievements: 0
    };

    // Create match
    const matchResult = await client.query(
      `INSERT INTO multiplayer_matches (match_type, status, started_at)
       VALUES ('challenge', 'active', CURRENT_TIMESTAMP)
       RETURNING id, started_at`,
      []
    );

    const matchId = matchResult.rows[0].id;
    const startedAt = matchResult.rows[0].started_at;

    // Add both participants
    await client.query(
      `INSERT INTO multiplayer_match_participants (
         match_id, user_id, rank_name, success_count, fail_count, completed_achievements
       ) VALUES 
         ($1, $2, $3, $4, $5, $6),
         ($1, $7, $8, $9, $10, $11)`,
      [
        matchId,
        fromUserId,
        fromStats.rank_name,
        fromStats.total_success_count,
        fromStats.total_fail_count,
        fromStats.completed_achievements,
        toUserId,
        toStats.rank_name,
        toStats.total_success_count,
        toStats.total_fail_count,
        toStats.completed_achievements
      ]
    );

    // Generate a battle problem using recipient's stats (any player's stats is fine)
    // Use random puzzle based on selected language instead of fixed level 10
    const statsForProblem = {
      rank_index: 0,
      total_success_count: toStats.total_success_count,
      total_fail_count: toStats.total_fail_count
    };

    // Get random puzzle for the selected language
    let problem = await resolveBattleProblem(enforcedLanguage, statsForProblem);
    if (!problem) {
      // Fallback to Python level 10 if resolveBattleProblem fails
      logger.warn('resolveBattleProblem_failed_fallback', { challengeId, language: enforcedLanguage });
      if (enforcedLanguage.toLowerCase() === 'python') {
        problem = await getPythonBeginnerLevel10Puzzle();
      }
    }
    if (!problem) {
      await client.query('ROLLBACK');
      client.release();
      return error(res, 500, 'No problems available for selected language', { language: enforcedLanguage });
    }

    await client.query(
      `UPDATE battle_challenges
       SET status = 'accepted',
           responded_at = CURRENT_TIMESTAMP,
           match_id = $2,
           problem_id = $3,
           language = $4
       WHERE id = $1`,
      [challengeId, matchId, problem.id, enforcedLanguage]
    );

    await client.query('COMMIT');
    client.release();

    return ok(res, {
      challengeId,
      status: 'accepted',
      matchId,
      language: enforcedLanguage,
      problemId: problem.id,
      startedAt
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    client.release();

    logger.error('respond_challenge_error', {
      userId: req.user?.id,
      challengeId: req.params?.id,
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to respond to challenge', { message: err.message });
  }
});

/**
 * GET /api/battle/challenges/outgoing
 * Get latest accepted challenges sent by the current user
 * (used so the challenger can auto-join when opponent accepts)
 */
router.get('/challenges/outgoing', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
         bc.id,
         bc.language,
         bc.match_id,
         bc.problem_id,
         bc.status,
         bc.created_at,
         bc.responded_at,
         u.id as to_user_id,
         u.username as to_username,
         u.first_name as to_first_name,
         u.last_name as to_last_name,
         u.school_id as to_school_id,
         u.avatar_url as to_avatar_url
       FROM battle_challenges bc
       JOIN users u ON u.id = bc.to_user_id
       JOIN multiplayer_matches m ON m.id = bc.match_id
       WHERE bc.from_user_id = $1
         AND bc.status = 'accepted'
         AND bc.match_id IS NOT NULL
         AND m.status IN ('pending', 'active')
         AND (m.completed_at IS NULL OR m.completed_at > NOW() - INTERVAL '1 minute')
       ORDER BY bc.responded_at DESC NULLS LAST, bc.created_at DESC
       LIMIT 3`,
      [userId]
    );

    const challenges = result.rows.map(row => ({
      id: row.id,
      language: row.language,
      status: row.status,
      matchId: row.match_id,
      problemId: row.problem_id,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
      toUser: {
        id: row.to_user_id,
        username: row.to_username,
        firstName: row.to_first_name,
        lastName: row.to_last_name,
        schoolId: row.to_school_id,
        avatarUrl: row.to_avatar_url
      }
    }));

    return ok(res, {
      challenges,
      count: challenges.length
    });
  } catch (err) {
    logger.error('get_outgoing_challenges_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to get outgoing challenges', { message: err.message });
  }
});

/**
 * GET /api/battle/challenges/recent
 * Get recent direct 1v1 challenges for the current user (sent or received).
 * Includes pending and completed challenges so the student always sees history.
 * Note: uses a two-segment path so it doesn't conflict with /battle/:matchId.
 */
router.get('/challenges/recent', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
         bc.id as challenge_id,
         bc.status as challenge_status,
         bc.created_at,
         bc.responded_at,
         m.id as match_id,
         m.status as match_status,
         m.started_at,
         m.completed_at,
         self_p.is_winner as self_is_winner,
         opp_p.is_winner as opp_is_winner,
         opp.username as opponent_username,
         opp.first_name as opponent_first_name,
         opp.last_name as opponent_last_name
       FROM battle_challenges bc
       LEFT JOIN multiplayer_matches m ON m.id = bc.match_id
       LEFT JOIN multiplayer_match_participants self_p
         ON self_p.match_id = m.id AND self_p.user_id = $1
       LEFT JOIN multiplayer_match_participants opp_p
         ON opp_p.match_id = m.id AND opp_p.user_id != $1
       LEFT JOIN users opp 
         ON opp.id = CASE 
                       WHEN bc.from_user_id = $1 THEN bc.to_user_id
                       ELSE bc.from_user_id
                     END
       WHERE bc.from_user_id = $1 OR bc.to_user_id = $1
       ORDER BY COALESCE(bc.responded_at, m.completed_at, m.started_at, bc.created_at) DESC
       LIMIT 10`,
      [userId]
    );

    const matches = result.rows.map(row => {
      const opponentName =
        (row.opponent_first_name && row.opponent_last_name)
          ? `${row.opponent_first_name} ${row.opponent_last_name}`
          : row.opponent_username;

      const date =
        row.responded_at ||
        row.completed_at ||
        row.started_at ||
        row.created_at;

      // Derive a simple result status for the UI
      let resultLabel = 'Pending';
      if (row.self_is_winner) {
        resultLabel = 'Win';
      } else if (row.match_status === 'completed' || row.opp_is_winner) {
        resultLabel = 'Loss';
      } else if (row.challenge_status === 'declined' || row.challenge_status === 'expired') {
        resultLabel = 'Cancelled';
      }

      return {
        matchId: row.match_id,
        challengeId: row.challenge_id,
        opponent: opponentName,
        result: resultLabel,
        date,
      };
    });

    return ok(res, {
      matches,
      count: matches.length,
    });
  } catch (err) {
    logger.error('recent_challenges_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack,
    });
    return error(res, 500, 'Failed to load recent challenge matches', { message: err.message });
  }
});


// Export router and setSocketIO function
router.setSocketIO = setSocketIOForBattle;
module.exports = router;

