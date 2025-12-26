const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { error, ok } = require('../utils/http');
const {
  fetchCachedLeaderboard,
  ensureLeaderboardCache
} = require('../services/leaderboardCache');

/**
 * GET /api/leaderboard
 * Get leaderboard rankings
 * Query params:
 *   - type: 'overall' (default), 'multiplayer', 'achievements', 'streaks'
 *   - limit: number of results (default: 100)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const type = req.query.type || 'overall';
    const limit = parseInt(req.query.limit, 10) || 100;
    const userId = req.user?.id;
    const validTypes = ['overall', 'multiplayer', 'achievements', 'streaks'];

    if (!validTypes.includes(type)) {
      return error(res, 400, 'Invalid leaderboard type', { validTypes });
    }

    const rows = await fetchCachedLeaderboard(type, limit);

    const leaderboard = rows.map(row => ({
      rank: row.rank_position,
      userId: row.user_id,
      username: row.username,
      name:
        row.first_name && row.last_name
          ? `${row.first_name} ${row.last_name}`
          : row.username,
      avatar: row.avatar_url,
      schoolId: row.school_id,
      exp: parseInt(row.exp, 10) || 0,
      rankName: row.rank_name,
      rankIndex: parseInt(row.rank_index, 10) || 0,
      achievements: parseInt(row.total_achievements, 10) || 0,
      levelsCompleted: parseInt(row.levels_completed, 10) || 0,
      lessonsCompleted: parseInt(row.lessons_completed, 10) || 0,
      longestStreak: parseInt(row.longest_streak, 10) || 0,
      currentStreak: parseInt(row.current_streak, 10) || 0,
      multiplayerWins: parseInt(row.total_wins, 10) || 0,
      multiplayerMatches: parseInt(row.total_matches, 10) || 0,
      winRate: parseInt(row.win_rate, 10) || 0
    }));

    let userRank = null;
    if (userId) {
      const match = rows.find(entry => entry.user_id === userId);
      if (match) {
        userRank = match.rank_position;
      }
    }

    return ok(res, {
      leaderboard,
      type,
      userRank,
      total: leaderboard.length
    });
  } catch (err) {
    logger.error('fetch_leaderboard_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack
    });
    return error(res, 500, 'Failed to fetch leaderboard', { message: err.message });
  }
});

/**
 * GET /api/leaderboard/user/:userId
 * Get a specific user's leaderboard position
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const type = req.query.type || 'overall';
    const validTypes = ['overall', 'multiplayer', 'achievements', 'streaks'];

    if (validTypes.includes(type)) {
      await ensureLeaderboardCache(type);
      const cached = await pool.query(
        `SELECT 
          le.*,
          u.username,
          u.first_name,
          u.last_name,
          u.avatar_url
        FROM leaderboardentry le
        JOIN users u ON u.id = le.user_id
        WHERE le.board_type = $1 AND le.user_id = $2`,
        [type, userId]
      );

      if (cached.rows.length) {
        const row = cached.rows[0];
        return ok(res, {
          userId: row.user_id,
          username: row.username,
          name:
            row.first_name && row.last_name
              ? `${row.first_name} ${row.last_name}`
              : row.username,
          avatar: row.avatar_url,
          exp: parseInt(row.exp, 10) || 0,
          rankName: row.rank_name,
          achievements: parseInt(row.total_achievements, 10) || 0,
          longestStreak: parseInt(row.longest_streak, 10) || 0,
          multiplayerWins: parseInt(row.total_wins, 10) || 0,
          position: row.rank_position
        });
      }
    }

    // Fallback to live calculation (e.g., user outside cache)
    const result = await pool.query(
      `SELECT 
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.avatar_url,
        COALESCE(ss.exp, 0) as exp,
        COALESCE(ss.rank_name, 'novice') as rank_name,
        COALESCE(ss.completed_achievements, 0) as completed_achievements,
        COALESCE(ss.longest_streak, 0) as longest_streak,
        COALESCE(ss.total_success_count, 0) as total_success_count,
        (
          SELECT COUNT(*) 
          FROM multiplayer_match_participants mmp
          WHERE mmp.user_id = u.id AND mmp.is_winner = true
        ) as multiplayer_wins
        COALESCE(ss.total_success_count, 0) as total_success_count,
        (
          SELECT COUNT(*) 
          FROM multiplayer_match_participants mmp
          WHERE mmp.user_id = u.id AND mmp.is_winner = true
        ) as multiplayer_wins
      FROM users u
      LEFT JOIN student_statistics ss ON ss.user_id = u.id
      WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return error(res, 404, 'User not found');
    }

    const userData = result.rows[0];
    let position = null;

    if (type === 'overall') {
      const overallPos = await pool.query(
        `SELECT COUNT(*) + 1 as position
          FROM student_statistics ss
          LEFT JOIN (
            SELECT 
              mmp.user_id, 
              COUNT(*) FILTER (WHERE mmp.is_winner = true) as multiplayer_wins
            FROM multiplayer_match_participants mmp
            GROUP BY mmp.user_id
          ) mw ON mw.user_id = ss.user_id
          WHERE (
            ss.exp > $1
            OR (ss.exp = $1 AND ss.completed_achievements > $2)
            OR (ss.exp = $1 AND ss.completed_achievements = $2 AND ss.total_success_count > $3)
            OR (
              ss.exp = $1 
              AND ss.completed_achievements = $2 
              AND ss.total_success_count = $3 
              AND COALESCE(mw.multiplayer_wins, 0) > $4
            )
          )
          AND ss.user_id != $5`,
        [
          userData.exp,
          userData.completed_achievements,
          userData.total_success_count,
          userData.multiplayer_wins,
          userId
        ]
      );
      position = parseInt(overallPos.rows[0].position, 10);
    }

    return ok(res, {
      userId: userData.id,
      username: userData.username,
      name:
        userData.first_name && userData.last_name
          ? `${userData.first_name} ${userData.last_name}`
          : userData.username,
      avatar: userData.avatar_url,
      exp: parseInt(userData.exp, 10) || 0,
      rankName: userData.rank_name,
      achievements: parseInt(userData.completed_achievements, 10) || 0,
      longestStreak: parseInt(userData.longest_streak, 10) || 0,
      multiplayerWins: parseInt(userData.multiplayer_wins, 10) || 0,
      position
    });
  } catch (err) {
    logger.error('fetch_user_leaderboard_error', {
      userId: req.user?.id,
      targetUserId: req.params.userId,
      error: err.message
    });
    return error(res, 500, 'Failed to fetch user leaderboard position', {
      message: err.message
    });
  }
});

module.exports = router;

