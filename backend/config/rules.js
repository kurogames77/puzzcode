// Central rule thresholds for difficulty adjustments.
// Values can be customized via environment variables to keep Python and Node in sync.

const PERFORMANCE = {
  maxErrors: Number(process.env.RULES_MAX_ERRORS || 5),
  timeUnderSeconds: Number(process.env.RULES_TIME_UNDER_SECONDS || 60),
  minAttemptsForRate: Number(process.env.RULES_MIN_ATTEMPTS_FOR_RATE || 5),
};

const INTERMEDIATE = {
  consecutiveMediumPromotion: Number(process.env.RULES_INTERMEDIATE_CONSECUTIVE_PROMOTION || 5),
  consecutiveWindow: Number(process.env.RULES_INTERMEDIATE_CONSECUTIVE_WINDOW || 5),
  heavyStruggleErrors: Number(process.env.RULES_INTERMEDIATE_HEAVY_STRUGGLE_ERRORS || 7),
};

const BEGINNER = {
  promoteMediumLevel: Number(process.env.RULES_BEGINNER_PROMOTE_MEDIUM_LEVEL || 5),
  promoteHardLevel: Number(process.env.RULES_BEGINNER_PROMOTE_HARD_LEVEL || 8),
};

const ADVANCED = {
  demoteMediumLevel: Number(process.env.RULES_ADVANCED_DEMOTE_MEDIUM_LEVEL || 5),
  demoteEasyLevel: Number(process.env.RULES_ADVANCED_DEMOTE_EASY_LEVEL || 8),
};

const SUMMARY_CACHE = {
  ttlMs: Number(process.env.SUMMARY_CACHE_TTL_MS || 60_000),
  maxEntries: Number(process.env.SUMMARY_CACHE_MAX_ENTRIES || 200),
};

module.exports = {
  PERFORMANCE,
  INTERMEDIATE,
  BEGINNER,
  ADVANCED,
  SUMMARY_CACHE,
};


