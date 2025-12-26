const { SUMMARY_CACHE } = require('../config/rules');

const cache = new Map();

function cacheKey(userId, lessonId) {
  return `${userId || 'anon'}::${lessonId || 'none'}`;
}

function now() {
  return Date.now();
}

function getFromCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now() - hit.timestamp > SUMMARY_CACHE.ttlMs) {
    cache.delete(key);
    return null;
  }
  hit.timestamp = now(); // touch for LRU semantics
  return hit.summary;
}

function setCache(key, summary) {
  if (cache.size >= SUMMARY_CACHE.maxEntries) {
    // Drop the oldest entry
    let oldestKey = null;
    let oldestTs = Infinity;
    cache.forEach((value, k) => {
      if (value.timestamp < oldestTs) {
        oldestTs = value.timestamp;
        oldestKey = k;
      }
    });
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { summary, timestamp: now() });
}

async function queryAttempts(client, userId, lessonId) {
  const result = await client.query(
    `SELECT 
        pa.level_id,
        pa.success,
        pa.attempt_time,
        pa.difficulty_label,
        pa.created_at,
        l.level_number
      FROM puzzle_attempt pa
      JOIN levels l ON pa.level_id = l.id
      WHERE pa.user_id = $1
        AND pa.lesson_id = $2
      ORDER BY pa.created_at DESC
      LIMIT 50`,
    [userId, lessonId]
  );
  return result.rows.map((row) => ({
    levelId: row.level_id,
    levelNumber: row.level_number,
    success: row.success,
    difficulty: row.difficulty_label,
    attemptTime: row.attempt_time,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  }));
}

async function queryFailCounts(client, userId, levelIds) {
  if (!levelIds.length) return {};
  const result = await client.query(
    `SELECT level_id, fail_count 
     FROM student_progress
     WHERE user_id = $1 AND level_id = ANY($2::uuid[])`,
    [userId, levelIds]
  );
  return result.rows.reduce((acc, row) => {
    acc[row.level_id] = Number(row.fail_count || 0);
    return acc;
  }, {});
}

async function getLessonSummary(client, { userId, lessonId }) {
  if (!lessonId) {
    return {
      attempts: [],
      failCounts: {},
    };
  }
  const key = cacheKey(userId, lessonId);
  const cached = getFromCache(key);
  if (cached) return cached;

  const attempts = await queryAttempts(client, userId, lessonId);
  const levelIds = [...new Set(attempts.map((attempt) => attempt.levelId))];
  const failCounts = await queryFailCounts(client, userId, levelIds);
  const summary = { attempts, failCounts };
  setCache(key, summary);
  return summary;
}

function primeLessonSummary({ userId, lessonId, failCounts, attempts }) {
  if (!lessonId) return;
  const key = cacheKey(userId, lessonId);
  const summary = cache.get(key);
  if (!summary) return;
  const mergedFailCounts = { ...summary.summary.failCounts, ...failCounts };
  const mergedAttempts = [...attempts, ...summary.summary.attempts];
  cache.set(key, {
    summary: {
      attempts: mergedAttempts.slice(0, 50),
      failCounts: mergedFailCounts,
    },
    timestamp: now(),
  });
}

module.exports = {
  getLessonSummary,
  primeLessonSummary,
};


