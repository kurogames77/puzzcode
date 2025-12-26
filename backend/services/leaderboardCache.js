const pool = require('../db');
const logger = require('../utils/logger');

const DEFAULT_CACHE_LIMIT = parseInt(process.env.LEADERBOARD_CACHE_LIMIT || '200', 10);
const CACHE_TTL_MS =
  parseInt(process.env.LEADERBOARD_CACHE_TTL_MINUTES || '5', 10) * 60 * 1000;

const BOARD_TYPES = ['overall', 'multiplayer', 'achievements', 'streaks'];

const baseUserFields = `
  u.id,
  u.username,
  u.first_name,
  u.last_name,
  u.avatar_url,
  u.school_id
`;

const baseStatsFields = `
  COALESCE(ss.exp, 0) as exp,
  COALESCE(ss.rank_name, 'novice') as rank_name,
  COALESCE(ss.rank_index, 0) as rank_index,
  COALESCE(ss.completed_achievements, 0) as completed_achievements,
  COALESCE(ss.total_success_count, 0) as total_success_count,
  COALESCE(ss.longest_streak, 0) as longest_streak,
  COALESCE(ss.current_streak, 0) as current_streak
`;

const statsGroupFields = `
  ss.exp,
  ss.rank_name,
  ss.rank_index,
  ss.completed_achievements,
  ss.total_success_count,
  ss.longest_streak,
  ss.current_streak
`;

const leaderBoardQueries = {
  overall: {
    sql: `
      SELECT 
        ${baseUserFields},
        ${baseStatsFields},
        (
          SELECT COUNT(*) 
          FROM multiplayer_match_participants mmp
          WHERE mmp.user_id = u.id AND mmp.is_winner = true
        ) as multiplayer_wins,
        (
          SELECT COUNT(*) 
          FROM multiplayer_match_participants mmp
          WHERE mmp.user_id = u.id
        ) as multiplayer_matches,
        (
          SELECT COUNT(DISTINCT llc.lesson_id)
          FROM lesson_level_completions llc
          WHERE llc.user_id = u.id
        ) as lessons_completed
      FROM users u
      LEFT JOIN student_statistics ss ON ss.user_id = u.id
      WHERE u.user_type = 'student' AND u.is_active = true
      ORDER BY 
        COALESCE(ss.exp, 0) DESC,
        COALESCE(ss.completed_achievements, 0) DESC,
        COALESCE(ss.total_success_count, 0) DESC,
        multiplayer_wins DESC
      LIMIT $1
    `,
    mapRow: (row, index) => {
      const totalMatches = parseInt(row.multiplayer_matches, 10) || 0;
      const wins = parseInt(row.multiplayer_wins, 10) || 0;
      return {
        user_id: row.id,
        rank_position: index + 1,
        exp: parseInt(row.exp, 10) || 0,
        rank_name: row.rank_name,
        rank_index: parseInt(row.rank_index, 10) || 0,
        total_achievements: parseInt(row.completed_achievements, 10) || 0,
        levels_completed: parseInt(row.total_success_count, 10) || 0,
        lessons_completed: parseInt(row.lessons_completed, 10) || 0,
        total_wins: wins,
        total_matches: totalMatches,
        win_rate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
        longest_streak: parseInt(row.longest_streak, 10) || 0,
        current_streak: parseInt(row.current_streak, 10) || 0
      };
    }
  },
  multiplayer: {
    sql: `
      SELECT
        ${baseUserFields},
        ${baseStatsFields},
        COUNT(CASE WHEN mmp.is_winner = true THEN 1 END) as wins,
        COUNT(mmp.id) as total_matches
      FROM users u
      LEFT JOIN multiplayer_match_participants mmp ON mmp.user_id = u.id
      LEFT JOIN student_statistics ss ON ss.user_id = u.id
      WHERE u.user_type = 'student' AND u.is_active = true
      GROUP BY ${baseUserFields}, ${statsGroupFields}
      HAVING COUNT(mmp.id) > 0
      ORDER BY wins DESC, total_matches DESC
      LIMIT $1
    `,
    mapRow: (row, index) => {
      const totalMatches = parseInt(row.total_matches, 10) || 0;
      const wins = parseInt(row.wins, 10) || 0;
      return {
        user_id: row.id,
        rank_position: index + 1,
        exp: parseInt(row.exp, 10) || 0,
        rank_name: row.rank_name,
        rank_index: parseInt(row.rank_index, 10) || 0,
        total_achievements: 0,
        levels_completed: 0,
        total_wins: wins,
        total_matches: totalMatches,
        win_rate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
        longest_streak: parseInt(row.longest_streak, 10) || 0,
        current_streak: parseInt(row.current_streak, 10) || 0
      };
    }
  },
  achievements: {
    sql: `
      SELECT
        ${baseUserFields},
        ${baseStatsFields}
      FROM users u
      LEFT JOIN student_statistics ss ON ss.user_id = u.id
      WHERE u.user_type = 'student' AND u.is_active = true
      ORDER BY COALESCE(ss.completed_achievements, 0) DESC, COALESCE(ss.exp, 0) DESC
      LIMIT $1
    `,
    mapRow: (row, index) => ({
      user_id: row.id,
      rank_position: index + 1,
      exp: parseInt(row.exp, 10) || 0,
      rank_name: row.rank_name,
      rank_index: parseInt(row.rank_index, 10) || 0,
      total_achievements: parseInt(row.completed_achievements, 10) || 0,
      levels_completed: 0,
      total_wins: 0,
      total_matches: 0,
      win_rate: 0,
      longest_streak: parseInt(row.longest_streak, 10) || 0,
      current_streak: parseInt(row.current_streak, 10) || 0
    })
  },
  streaks: {
    sql: `
      SELECT
        ${baseUserFields},
        ${baseStatsFields}
      FROM users u
      LEFT JOIN student_statistics ss ON ss.user_id = u.id
      WHERE u.user_type = 'student' AND u.is_active = true
      ORDER BY COALESCE(ss.longest_streak, 0) DESC, COALESCE(ss.current_streak, 0) DESC
      LIMIT $1
    `,
    mapRow: (row, index) => ({
      user_id: row.id,
      rank_position: index + 1,
      exp: parseInt(row.exp, 10) || 0,
      rank_name: row.rank_name,
      rank_index: parseInt(row.rank_index, 10) || 0,
      total_achievements: 0,
      levels_completed: 0,
      total_wins: 0,
      total_matches: 0,
      win_rate: 0,
      longest_streak: parseInt(row.longest_streak, 10) || 0,
      current_streak: parseInt(row.current_streak, 10) || 0
    })
  }
};

async function fetchLeaderboardSnapshot(boardType, limit, client = pool) {
  const config = leaderBoardQueries[boardType];
  if (!config) {
    throw new Error(`Unknown leaderboard type: ${boardType}`);
  }
  const { rows } = await client.query(config.sql, [limit]);
  return rows.map(config.mapRow);
}

async function refreshLeaderboardCache(boardType, limit = DEFAULT_CACHE_LIMIT) {
  if (!BOARD_TYPES.includes(boardType)) {
    throw new Error(`Unsupported leaderboard type: ${boardType}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const snapshot = await fetchLeaderboardSnapshot(boardType, limit, client);

    await client.query('DELETE FROM leaderboardentry WHERE board_type = $1', [
      boardType
    ]);

    const insertText = `
      INSERT INTO leaderboardentry (
        board_type,
        user_id,
        rank_position,
        exp,
        rank_name,
        rank_index,
        total_achievements,
        levels_completed,
        total_wins,
        total_matches,
        win_rate,
        longest_streak,
        current_streak,
        period_type,
        period_start,
        period_end,
        last_updated
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'all_time', NULL, NULL, CURRENT_TIMESTAMP
      )
    `;

    for (const row of snapshot) {
      await client.query(insertText, [
        boardType,
        row.user_id,
        row.rank_position,
        row.exp,
        row.rank_name,
        row.rank_index,
        row.total_achievements,
        row.levels_completed,
        row.total_wins,
        row.total_matches,
        row.win_rate,
        row.longest_streak,
        row.current_streak
      ]);
    }

    await client.query('COMMIT');
    return snapshot;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('leaderboard_cache_refresh_failed', {
      boardType,
      error: err.message
    });
    throw err;
  } finally {
    client.release();
  }
}

async function getCacheState(boardType) {
  const { rows } = await pool.query(
    `
    SELECT 
      COUNT(*)::int as count,
      EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(last_updated), NOW()))) * 1000 as age_ms
    FROM leaderboardentry
    WHERE board_type = $1
    `,
    [boardType]
  );

  if (!rows.length) {
    return { count: 0, ageMs: Infinity };
  }

  return {
    count: parseInt(rows[0].count, 10) || 0,
    ageMs:
      rows[0].age_ms === null || rows[0].age_ms === undefined
        ? Infinity
        : Number(rows[0].age_ms)
  };
}

async function ensureLeaderboardCache(boardType, limit = DEFAULT_CACHE_LIMIT) {
  const { count, ageMs } = await getCacheState(boardType);
  const needsRefresh =
    count === 0 || !Number.isFinite(ageMs) || ageMs > CACHE_TTL_MS;

  if (needsRefresh) {
    await refreshLeaderboardCache(boardType, limit);
  }
}

async function fetchCachedLeaderboard(boardType, limit) {
  await ensureLeaderboardCache(boardType, DEFAULT_CACHE_LIMIT);
  const { rows } = await pool.query(
    `
    SELECT 
      le.*,
      u.username,
      u.first_name,
      u.last_name,
      u.avatar_url,
      u.school_id,
      (
        SELECT COUNT(DISTINCT llc.lesson_id)
        FROM lesson_level_completions llc
        WHERE llc.user_id = le.user_id
      ) as lessons_completed
    FROM leaderboardentry le
    JOIN users u ON u.id = le.user_id
    WHERE le.board_type = $1
    ORDER BY le.rank_position ASC
    LIMIT $2
    `,
    [boardType, limit]
  );
  return rows;
}

module.exports = {
  fetchCachedLeaderboard,
  refreshLeaderboardCache,
  ensureLeaderboardCache
};

