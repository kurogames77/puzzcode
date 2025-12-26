// Simple in-memory rate limiter keyed by userId (or IP as fallback)
// Defaults: 10 requests per 10 seconds

const WINDOW_MS = +(process.env.RATE_LIMIT_WINDOW_MS || 10_000);
const MAX_REQS = +(process.env.RATE_LIMIT_MAX_REQS || 10);

const buckets = new Map();

function now() {
  return Date.now();
}

function rateLimit(req, res, next) {
  try {
    const userKey = (req.user && req.user.id) || req.ip || 'anon';
    const ts = now();
    const win = WINDOW_MS;
    const max = MAX_REQS;

    let bucket = buckets.get(userKey);
    if (!bucket) {
      bucket = [];
      buckets.set(userKey, bucket);
    }
    // Drop old timestamps
    while (bucket.length && ts - bucket[0] > win) {
      bucket.shift();
    }
    if (bucket.length >= max) {
      const retryAfter = Math.ceil((win - (ts - bucket[0])) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please slow down.', retryAfter });
    }
    bucket.push(ts);
    next();
  } catch (e) {
    // Fail-open for limiter errors
    next();
  }
}

module.exports = {
  rateLimit,
};


