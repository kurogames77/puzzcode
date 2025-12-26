const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const logger = require('../utils/logger');
const { error, ok } = require('../utils/http');

/**
 * GET /api/achievements
 * Get all achievements for the current user
 */
router.get('/', authenticateToken, requireStudent, async (req, res) => {
  try {
    const rawSchoolId = (req.query.school_id || req.query.schoolId || '').toString().trim();
    let userId = req.user.id;
    let resolvedSchoolId = req.user.school_id || null;

    if (rawSchoolId) {
      const schoolResult = await pool.query(
        `SELECT id, school_id 
         FROM users 
         WHERE school_id = $1`,
        [rawSchoolId]
      );

      if (schoolResult.rowCount === 0) {
        return error(res, 404, 'No user found with the provided school ID', { schoolId: rawSchoolId });
      }

      const requestedUserId = schoolResult.rows[0].id;

      if (requestedUserId !== req.user.id) {
        return error(res, 403, 'You can only access your own achievements by school ID');
      }

      userId = requestedUserId;
      resolvedSchoolId = schoolResult.rows[0].school_id;
    }

    // Fetch user's earned achievements
    const earnedResult = await pool.query(
      `SELECT 
        id,
        achievement_type,
        achievement_tier,
        achievement_name,
        achievement_description,
        exp_reward,
        unlocked_at
       FROM achievements 
       WHERE user_id = $1
       ORDER BY unlocked_at DESC`,
      [userId]
    );

    // Get all possible achievement definitions (from expRankService)
    const { checkAchievements } = require('../services/expRankService');
    
    // Get user stats for progress calculation
    const statsResult = await pool.query(
      `SELECT 
        total_success_count,
        current_streak,
        longest_streak,
        exp,
        completed_achievements
       FROM student_statistics 
       WHERE user_id = $1`,
      [userId]
    );
    
    // Get level completion count
    const levelsResult = await pool.query(
      `SELECT COUNT(DISTINCT level_id) as completed_levels
       FROM lesson_level_completions 
       WHERE user_id = $1`,
      [userId]
    );
    
    const completedLevels = parseInt(levelsResult.rows[0]?.completed_levels || 0);
    
    const stats = statsResult.rows[0] || {
      total_success_count: 0,
      current_streak: 0,
      longest_streak: 0,
      exp: 0,
      completed_achievements: 0
    };
    
    // Add completed levels to stats
    stats.completed_levels = completedLevels;

    // Create a map of earned achievements by type
    const earnedMap = new Map();
    earnedResult.rows.forEach(ach => {
      earnedMap.set(ach.achievement_type, {
        id: ach.id,
        type: ach.achievement_type,
        name: ach.achievement_name,
        description: ach.achievement_description,
        tier: ach.achievement_tier,
        expReward: ach.exp_reward,
        unlockedAt: ach.unlocked_at,
        earned: true
      });
    });

    // Define all possible achievements with their metadata
    const allAchievements = [
      // Beginner Achievements
      {
        type: 'first_puzzle',
        name: 'First Steps',
        description: 'Complete your first level',
        icon: '👶',
        category: 'beginner',
        tier: 'bronze',
        points: 50,
        check: () => stats.completed_levels >= 1
      },
      {
        type: 'levels_5',
        name: 'Getting Started',
        description: 'Complete 5 levels',
        icon: '🌟',
        category: 'beginner',
        tier: 'bronze',
        points: 75,
        check: () => stats.completed_levels >= 5
      },
      {
        type: 'levels_10',
        name: 'Code Apprentice',
        description: 'Complete 10 levels',
        icon: '💻',
        category: 'coding',
        tier: 'bronze',
        points: 150,
        check: () => stats.completed_levels >= 10
      },
      {
        type: 'levels_25',
        name: 'Code Explorer',
        description: 'Complete 25 levels',
        icon: '🔍',
        category: 'coding',
        tier: 'silver',
        points: 300,
        check: () => stats.completed_levels >= 25
      },
      {
        type: 'levels_50',
        name: 'Code Master',
        description: 'Complete 50 levels',
        icon: '📐',
        category: 'coding',
        tier: 'silver',
        points: 400,
        check: () => stats.completed_levels >= 50
      },
      {
        type: 'levels_100',
        name: 'Code Legend',
        description: 'Complete 100 levels',
        icon: '🏆',
        category: 'coding',
        tier: 'gold',
        points: 500,
        check: () => stats.completed_levels >= 100
      },
      {
        type: 'levels_250',
        name: 'Code Virtuoso',
        description: 'Complete 250 levels',
        icon: '🎯',
        category: 'coding',
        tier: 'gold',
        points: 750,
        check: () => stats.completed_levels >= 250
      },
      {
        type: 'levels_500',
        name: 'Code Grandmaster',
        description: 'Complete 500 levels',
        icon: '👑',
        category: 'coding',
        tier: 'platinum',
        points: 1000,
        check: () => stats.completed_levels >= 500
      },
      // Streak Achievements
      {
        type: 'streak_3',
        name: 'Warming Up',
        description: 'Complete 3 levels in a row',
        icon: '🌡️',
        category: 'streak',
        tier: 'bronze',
        points: 50,
        check: () => stats.current_streak >= 3 || stats.longest_streak >= 3
      },
      {
        type: 'streak_5',
        name: 'On Fire',
        description: 'Complete 5 levels in a row',
        icon: '🔥',
        category: 'streak',
        tier: 'bronze',
        points: 100,
        check: () => stats.current_streak >= 5 || stats.longest_streak >= 5
      },
      {
        type: 'streak_10',
        name: 'Unstoppable',
        description: 'Complete 10 levels in a row',
        icon: '⚡',
        category: 'streak',
        tier: 'silver',
        points: 200,
        check: () => stats.current_streak >= 10 || stats.longest_streak >= 10
      },
      {
        type: 'streak_20',
        name: 'Legendary Streak',
        description: 'Complete 20 levels in a row',
        icon: '💫',
        category: 'streak',
        tier: 'gold',
        points: 400,
        check: () => stats.current_streak >= 20 || stats.longest_streak >= 20
      },
      {
        type: 'streak_30',
        name: 'Perfect Storm',
        description: 'Complete 30 levels in a row',
        icon: '🌪️',
        category: 'streak',
        tier: 'platinum',
        points: 600,
        check: () => stats.current_streak >= 30 || stats.longest_streak >= 30
      },
      // Rank Achievements
      {
        type: 'rank_bronze',
        name: 'Bronze Coder',
        description: 'Reach Bronze Coder rank',
        icon: '🥉',  // Bronze medal
        category: 'rank',
        tier: 'bronze',
        points: 200,
        check: () => stats.exp >= 1050  // Updated threshold (was 1000) - exponential curve
      },
      {
        type: 'rank_silver',
        name: 'Silver Coder',
        description: 'Reach Silver Coder rank',
        icon: '🥈',  // Silver medal
        category: 'rank',
        tier: 'silver',
        points: 400,
        check: () => stats.exp >= 1920  // Updated threshold (was 2000) - exponential curve
      },
      {
        type: 'rank_gold',
        name: 'Gold Developer',
        description: 'Reach Gold Developer rank',
        icon: '🥇',  // Gold medal
        category: 'rank',
        tier: 'gold',
        points: 600,
        check: () => stats.exp >= 2960  // Updated threshold (was 4000) - exponential curve
      },
      {
        type: 'rank_platinum',
        name: 'Platinum Engineer',
        description: 'Reach Platinum Engineer rank',
        icon: '🔷',  // Blue diamond square - represents platinum's precious metal status
        category: 'rank',
        tier: 'platinum',
        points: 800,
        check: () => stats.exp >= 4140  // Updated threshold (was 6000) - exponential curve
      },
      {
        type: 'rank_diamond',
        name: 'Diamond Hacker',
        description: 'Reach Diamond Hacker rank',
        icon: '💎',  // Diamond gem - classic diamond icon
        category: 'rank',
        tier: 'platinum',
        points: 1000,
        check: () => stats.exp >= 5440  // Updated threshold (was 8000) - exponential curve
      },
      {
        type: 'rank_master',
        name: 'Master Coder',
        description: 'Reach Master Coder rank',
        icon: '👑',  // Crown - represents mastery
        category: 'rank',
        tier: 'platinum',
        points: 1500,
        check: () => stats.exp >= 6860  // Updated threshold (was 10000) - exponential curve
      },
      // Performance Achievements
      {
        type: 'perfect_10',
        name: 'Perfect Ten',
        description: 'Complete 10 levels with high success rate',
        icon: '✨',
        category: 'performance',
        tier: 'silver',
        points: 250,
        check: () => stats.completed_levels >= 10
      },
      {
        type: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete 20 levels quickly',
        icon: '⚡',
        category: 'performance',
        tier: 'gold',
        points: 350,
        check: () => stats.completed_levels >= 20
      },
      // Milestone Achievements
      {
        type: 'century',
        name: 'Century Club',
        description: 'Complete 100 total levels',
        icon: '💯',
        category: 'milestone',
        tier: 'gold',
        points: 500,
        check: () => stats.completed_levels >= 100
      },
      {
        type: 'half_k',
        name: 'Halfway Hero',
        description: 'Complete 500 total levels',
        icon: '🎖️',
        category: 'milestone',
        tier: 'platinum',
        points: 1000,
        check: () => stats.completed_levels >= 500
      },
      {
        type: 'levels_75',
        name: 'Code Warrior',
        description: 'Complete 75 levels',
        icon: '⚔️',
        category: 'coding',
        tier: 'gold',
        points: 450,
        check: () => stats.completed_levels >= 75
      },
      {
        type: 'levels_200',
        name: 'Code Champion',
        description: 'Complete 200 levels',
        icon: '🏅',
        category: 'coding',
        tier: 'gold',
        points: 600,
        check: () => stats.completed_levels >= 200
      },
      {
        type: 'streak_7',
        name: 'Week Warrior',
        description: 'Complete 7 levels in a row',
        icon: '📅',
        category: 'streak',
        tier: 'bronze',
        points: 150,
        check: () => stats.current_streak >= 7 || stats.longest_streak >= 7
      },
      {
        type: 'streak_15',
        name: 'Consistency King',
        description: 'Complete 15 levels in a row',
        icon: '👑',
        category: 'streak',
        tier: 'silver',
        points: 300,
        check: () => stats.current_streak >= 15 || stats.longest_streak >= 15
      },
      {
        type: 'levels_15',
        name: 'Rising Star',
        description: 'Complete 15 levels',
        icon: '⭐',
        category: 'beginner',
        tier: 'bronze',
        points: 200,
        check: () => stats.completed_levels >= 15
      },
      {
        type: 'levels_35',
        name: 'Code Navigator',
        description: 'Complete 35 levels',
        icon: '🧭',
        category: 'coding',
        tier: 'silver',
        points: 350,
        check: () => stats.completed_levels >= 35
      },
      {
        type: 'levels_1000',
        name: 'Code Overlord',
        description: 'Complete 1000 total levels',
        icon: '👑',
        category: 'milestone',
        tier: 'platinum',
        points: 2000,
        check: () => stats.completed_levels >= 1000
      }
    ];

    // Map achievements to frontend format with progress calculation
    const achievements = allAchievements.map(ach => {
      const earned = earnedMap.get(ach.type);
      // Check if achievement criteria are met (even if not in database)
      const criteriaMet = ach.check ? ach.check() : false;
      const isEarned = !!earned || criteriaMet;
      let progress = 0;
      
      // Calculate progress percentage for unearned achievements
      if (!isEarned) {
        if (ach.type.startsWith('levels_')) {
          const target = parseInt(ach.type.split('_')[1]);
          progress = Math.min(100, Math.round((stats.completed_levels / target) * 100));
        } else if (ach.type.startsWith('streak_')) {
          const target = parseInt(ach.type.split('_')[1]);
          const currentStreak = Math.max(stats.current_streak, stats.longest_streak);
          progress = Math.min(100, Math.round((currentStreak / target) * 100));
        } else if (ach.type.startsWith('rank_')) {
          // Rank progress based on EXP thresholds (updated to match exponential curve)
          const rankThresholds = {
            'rank_bronze': 1050,
            'rank_silver': 1920,
            'rank_gold': 2960,
            'rank_platinum': 4140,
            'rank_diamond': 5440,
            'rank_master': 6860
          };
          const target = rankThresholds[ach.type] || 0;
          if (target > 0) {
            progress = Math.min(100, Math.round((stats.exp / target) * 100));
          }
        } else {
          // For other achievements, show 0% or 100% based on check
          progress = criteriaMet ? 100 : 0;
        }
      } else {
        progress = 100; // Earned achievements show 100%
      }
      
      return {
        id: earned?.id || ach.type,
        type: ach.type,
        name: ach.name,
        description: ach.description,
        icon: ach.icon,
        category: ach.category,
        tier: ach.tier,
        points: ach.points,
        earned: isEarned,
        date: earned?.unlockedAt || (criteriaMet && !earned ? new Date().toISOString() : null),
        progress: progress
      };
    });

    // Calculate totals
    const earnedCount = achievements.filter(a => a.earned).length;
    const totalPoints = achievements.filter(a => a.earned).reduce((sum, a) => sum + a.points, 0);
    const completionRate = Math.round((earnedCount / achievements.length) * 100);

    return ok(res, {
      achievements,
      summary: {
        earned: earnedCount,
        total: achievements.length,
        points: totalPoints,
        completionRate
      },
      metadata: {
        userId,
        schoolId: resolvedSchoolId
      }
    });

  } catch (err) {
    logger.error('fetch_achievements_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to fetch achievements', { message: err.message });
  }
});

module.exports = router;

