/**
 * Service for handling EXP, Rank, Streaks, and Achievements
 * Integrates with RankBases/EXP.py and IRT_Bases/Rank.py
 */


const MAX_EXP = 10000;
const BASE_EXP_GAIN = 50;
const DIFFICULTY_MULTIPLIER = {
  'Easy': 1.0,
  'Medium': 1.25,
  'Hard': 1.5
};

/**
 * Calculate EXP gain for a puzzle attempt
 * @param {boolean} success - Whether the puzzle was completed successfully
 * @param {string} difficulty - 'Easy', 'Medium', or 'Hard'
 * @param {number} streak - Current consecutive success streak
 * @returns {number} EXP gained
 */
function calculateExpGain(success, difficulty, streak = 0) {
  if (!success) {
    return 0; // No EXP for failed attempts
  }
  
  const multiplier = DIFFICULTY_MULTIPLIER[difficulty] || 1.0;
  const streakBonus = 1 + (0.05 * Math.max(0, streak));
  return Math.floor(BASE_EXP_GAIN * multiplier * streakBonus);
}

/**
 * Normalize EXP to 0.0-1.0 scale
 * @param {number} exp - Total EXP
 * @returns {number} Normalized EXP (0.0-1.0)
 */
function normalizeExp(exp) {
  const clamped = Math.max(0, Math.min(exp, MAX_EXP));
  return clamped / MAX_EXP;
}

/**
 * Get rank name and index from EXP (matches IRT_Bases/Rank.py logic)
 * Uses exponential curve (power of 1.6) to make higher ranks require more EXP
 * @param {number} exp - Total EXP
 * @returns {{rankName: string, rankIndex: number, bias: number}}
 */
function getRankFromExp(exp) {
  const normalized = normalizeExp(exp);
  const RANK_LEVELS = [
    'novice', 'apprentice', 'bronze_coder', 'silver_coder', 'gold_developer',
    'platinum_engineer', 'diamond_hacker', 'master_coder', 'grandmaster_dev', 'code_overlord'
  ];
  const RANK_BIAS = [-0.05, -0.05, -0.03, 0.0, 0.0, 0.03, 0.03, 0.05, 0.06, 0.07];
  
  const totalRanks = RANK_LEVELS.length - 1;
  const RANK_POWER = 1.6; // Higher values = slower progression
  
  // Calculate non-linear thresholds (matching Python implementation)
  const RANK_THRESHOLDS = RANK_LEVELS.map((_, i) => {
    if (i === 0) return 0.0;
    return Math.pow(i / totalRanks, RANK_POWER);
  });
  
  // Find the highest rank threshold that the normalized EXP meets or exceeds
  let idx = 0;
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (normalized >= RANK_THRESHOLDS[i]) {
      idx = i;
      break;
    }
  }
  idx = Math.max(0, Math.min(idx, totalRanks));
  
  return {
    rankName: RANK_LEVELS[idx],
    rankIndex: idx,
    bias: RANK_BIAS[idx]
  };
}

/**
 * Check and award achievements based on user progress
 * @param {Object} dbClient - Database client
 * @param {string} userId - User ID
 * @param {Object} stats - Current statistics
 * @param {boolean} success - Whether current attempt was successful
 * @returns {Promise<Array>} Array of newly unlocked achievements
 */
async function checkAchievements(dbClient, userId, stats, success) {
  const newAchievements = [];
  
  // Get current achievements
  const achievementsResult = await dbClient.query(
    'SELECT achievement_type FROM achievements WHERE user_id = $1',
    [userId]
  );
  const existingTypes = new Set(achievementsResult.rows.map(r => r.achievement_type));
  
  // Achievement icon mapping
  const achievementIcons = {
    'first_puzzle': '👶',
    'streak_3': '🔥',
    'streak_5': '⚡',
    'streak_7': '💪',
    'streak_10': '🌟',
    'streak_15': '👑',
    'streak_20': '🏆',
    'streak_25': '💎',
    'streak_30': '⭐',
    'levels_5': '🌟',
    'levels_10': '💻',
    'levels_15': '⭐',
    'levels_25': '🔍',
    'levels_35': '📊',
    'levels_50': '📐',
    'levels_75': '🎯',
    'levels_100': '🏆',
    'levels_200': '💎',
    'levels_250': '👑',
    'levels_500': '💍',
    'levels_1000': '🌠',
    'rank_bronze': '🥉',
    'rank_silver': '🥈',
    'rank_gold': '🥇',
    'rank_platinum': '💎',
    'rank_diamond': '💠',
    'rank_master': '👑',
    'perfect_10': '✨',
    'speed_demon': '⚡',
    'century': '💯',
    'half_k': '🎯'
  };

  // Achievement definitions
  const achievementChecks = [
    {
      type: 'first_puzzle',
      name: 'First Steps',
      description: 'Complete your first level',
      tier: 'bronze',
      check: () => stats.total_success_count === 1 && success
    },
    {
      type: 'streak_5',
      name: 'On Fire',
      description: 'Complete 5 levels in a row',
      tier: 'bronze',
      check: () => stats.current_streak >= 5 && success
    },
    {
      type: 'streak_10',
      name: 'Unstoppable',
      description: 'Complete 10 levels in a row',
      tier: 'silver',
      check: () => stats.current_streak >= 10 && success
    },
    {
      type: 'streak_3',
      name: 'Warming Up',
      description: 'Complete 3 levels in a row',
      tier: 'bronze',
      check: () => stats.current_streak >= 3 && success
    },
    {
      type: 'streak_7',
      name: 'Week Warrior',
      description: 'Complete 7 levels in a row',
      tier: 'bronze',
      check: () => stats.current_streak >= 7 && success
    },
    {
      type: 'streak_15',
      name: 'Consistency King',
      description: 'Complete 15 levels in a row',
      tier: 'silver',
      check: () => stats.current_streak >= 15 && success
    },
    {
      type: 'streak_20',
      name: 'Legendary Streak',
      description: 'Complete 20 levels in a row',
      tier: 'gold',
      check: () => stats.current_streak >= 20 && success
    },
    {
      type: 'streak_30',
      name: 'Perfect Storm',
      description: 'Complete 30 levels in a row',
      tier: 'platinum',
      check: () => stats.current_streak >= 30 && success
    },
    {
      type: 'levels_5',
      name: 'Getting Started',
      description: 'Complete 5 levels',
      tier: 'bronze',
      check: () => stats.total_success_count >= 5 && success
    },
    {
      type: 'levels_10',
      name: 'Code Apprentice',
      description: 'Complete 10 levels',
      tier: 'bronze',
      check: () => stats.total_success_count >= 10 && success
    },
    {
      type: 'levels_15',
      name: 'Rising Star',
      description: 'Complete 15 levels',
      tier: 'bronze',
      check: () => stats.total_success_count >= 15 && success
    },
    {
      type: 'levels_25',
      name: 'Code Explorer',
      description: 'Complete 25 levels',
      tier: 'silver',
      check: () => stats.total_success_count >= 25 && success
    },
    {
      type: 'levels_35',
      name: 'Code Navigator',
      description: 'Complete 35 levels',
      tier: 'silver',
      check: () => stats.total_success_count >= 35 && success
    },
    {
      type: 'levels_50',
      name: 'Code Master',
      description: 'Complete 50 levels',
      tier: 'gold',
      check: () => stats.total_success_count >= 50 && success
    },
    {
      type: 'levels_75',
      name: 'Code Warrior',
      description: 'Complete 75 levels',
      tier: 'gold',
      check: () => stats.total_success_count >= 75 && success
    },
    {
      type: 'levels_100',
      name: 'Code Legend',
      description: 'Complete 100 levels',
      tier: 'platinum',
      check: () => stats.total_success_count >= 100 && success
    },
    {
      type: 'levels_200',
      name: 'Code Champion',
      description: 'Complete 200 levels',
      tier: 'gold',
      check: () => stats.total_success_count >= 200 && success
    },
    {
      type: 'levels_250',
      name: 'Code Virtuoso',
      description: 'Complete 250 levels',
      tier: 'gold',
      check: () => stats.total_success_count >= 250 && success
    },
    {
      type: 'levels_500',
      name: 'Code Grandmaster',
      description: 'Complete 500 levels',
      tier: 'platinum',
      check: () => stats.total_success_count >= 500 && success
    },
    {
      type: 'levels_1000',
      name: 'Code Overlord',
      description: 'Complete 1000 total levels',
      tier: 'platinum',
      check: () => stats.total_success_count >= 1000 && success
    },
    {
      type: 'rank_bronze',
      name: 'Bronze Coder',
      description: 'Reach Bronze Coder rank',
      tier: 'bronze',
      expThreshold: 1050,
      check: () => (stats.exp || 0) >= 1050 && !existingTypes.has('rank_bronze')
    },
    {
      type: 'rank_silver',
      name: 'Silver Coder',
      description: 'Reach Silver Coder rank',
      tier: 'silver',
      expThreshold: 1920,
      check: () => (stats.exp || 0) >= 1920 && !existingTypes.has('rank_silver')
    },
    {
      type: 'rank_gold',
      name: 'Gold Developer',
      description: 'Reach Gold Developer rank',
      tier: 'gold',
      expThreshold: 2960,
      check: () => (stats.exp || 0) >= 2960 && !existingTypes.has('rank_gold')
    },
    {
      type: 'rank_platinum',
      name: 'Platinum Engineer',
      description: 'Reach Platinum Engineer rank',
      tier: 'platinum',
      expThreshold: 4140,
      check: () => (stats.exp || 0) >= 4140 && !existingTypes.has('rank_platinum')
    },
    {
      type: 'rank_diamond',
      name: 'Diamond Hacker',
      description: 'Reach Diamond Hacker rank',
      tier: 'platinum',
      expThreshold: 5440,
      check: () => (stats.exp || 0) >= 5440 && !existingTypes.has('rank_diamond')
    },
    {
      type: 'rank_master',
      name: 'Master Coder',
      description: 'Reach Master Coder rank',
      tier: 'platinum',
      expThreshold: 6860,
      check: () => (stats.exp || 0) >= 6860 && !existingTypes.has('rank_master')
    }
  ];
  
  // Achievement EXP rewards (matching display points)
  const achievementExpRewards = {
    // Beginner achievements
    'first_puzzle': 50,
    'levels_5': 75,
    'levels_10': 150,
    'levels_15': 200,
    // Streak achievements
    'streak_3': 50,
    'streak_5': 100,
    'streak_7': 150,
    'streak_10': 200,
    'streak_15': 300,
    'streak_20': 400,
    'streak_30': 600,
    // Level achievements
    'levels_25': 300,
    'levels_35': 350,
    'levels_50': 400,
    'levels_75': 450,
    'levels_100': 500,
    'levels_200': 600,
    'levels_250': 750,
    'levels_500': 1000,
    'levels_1000': 2000,
    // Rank achievements
    'rank_bronze': 200,
    'rank_silver': 400,
    'rank_gold': 600,
    'rank_platinum': 800,
    'rank_diamond': 1000,
    'rank_master': 1500,
    // Performance achievements
    'perfect_10': 250,
    'speed_demon': 350,
    // Milestone achievements
    'century': 500,
    'half_k': 1000
  };
  
  // Check each achievement
  for (const achievement of achievementChecks) {
    if (!existingTypes.has(achievement.type) && achievement.check()) {
      // Get EXP reward from mapping or use tier-based default
      const expReward = achievementExpRewards[achievement.type] || 
        (achievement.tier === 'bronze' ? 50 :
         achievement.tier === 'silver' ? 100 :
         achievement.tier === 'gold' ? 200 :
         achievement.tier === 'platinum' ? 300 : 0);
      
      // Insert achievement
      await dbClient.query(
        `INSERT INTO achievements (user_id, achievement_type, achievement_tier, achievement_name, achievement_description, exp_reward)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, achievement_type) DO NOTHING`,
        [userId, achievement.type, achievement.tier, achievement.name, achievement.description, expReward]
      );
      
      newAchievements.push({
        type: achievement.type,
        name: achievement.name,
        description: achievement.description,
        tier: achievement.tier,
        icon: achievementIcons[achievement.type] || '🏆',
        expReward
      });
    }
  }
  
  return newAchievements;
}

/**
 * Update streaks based on success/failure
 * @param {number} currentStreak - Current streak
 * @param {number} longestStreak - Longest streak ever
 * @param {boolean} success - Whether current attempt was successful
 * @returns {{currentStreak: number, longestStreak: number}}
 */
function updateStreaks(currentStreak, longestStreak, success) {
  let newCurrentStreak = success ? (currentStreak || 0) + 1 : 0;
  let newLongestStreak = Math.max(longestStreak || 0, newCurrentStreak);
  
  return {
    currentStreak: newCurrentStreak,
    longestStreak: newLongestStreak
  };
}

/**
 * Get success level from success count (matches IRT_Bases/Success.py logic)
 * @param {number} successCount - Total successful attempts
 * @returns {string} Success level name
 */
function getSuccessLevel(successCount) {
  const MAX_ATTEMPTS = 100;
  const SUCCESS_TIERS = [
    { min: 3, max: 5, level: 'Newbie' },
    { min: 6, max: 50, level: 'Intermediate' },
    { min: 51, max: 100, level: 'Pro' }
  ];
  const DEFAULT_LEVEL = 'Beginner';
  
  if (successCount < 0) successCount = 0;
  const normalized = Math.min(successCount / MAX_ATTEMPTS, 1.0);
  const successCountEquiv = Math.floor(normalized * MAX_ATTEMPTS);
  
  const tier = SUCCESS_TIERS.find(t => successCountEquiv >= t.min && successCountEquiv <= t.max);
  return tier ? tier.level : DEFAULT_LEVEL;
}

/**
 * Get fail level from fail count (matches IRT_Bases/Fail.py logic)
 * @param {number} failCount - Total failed attempts
 * @returns {string} Fail level name
 */
function getFailLevel(failCount) {
  const MAX_FAILS = 100;
  const FAIL_TIERS = [
    { min: 3, max: 5, level: 'Low Failure' },
    { min: 6, max: 50, level: 'Moderate Failure' },
    { min: 51, max: 100, level: 'High Failure' }
  ];
  const DEFAULT_LEVEL = 'Minimal Failure';
  
  if (failCount < 0) failCount = 0;
  const normalized = Math.min(failCount / MAX_FAILS, 1.0);
  const failEquiv = Math.floor(normalized * MAX_FAILS);
  
  const tier = FAIL_TIERS.find(t => failEquiv >= t.min && failEquiv <= t.max);
  return tier ? tier.level : DEFAULT_LEVEL;
}

module.exports = {
  calculateExpGain,
  normalizeExp,
  getRankFromExp,
  getSuccessLevel,
  getFailLevel,
  checkAchievements,
  updateStreaks,
  MAX_EXP
};

