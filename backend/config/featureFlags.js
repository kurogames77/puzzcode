// Feature flags controlled by environment variables
// Defaults keep current behavior

const ENABLE_RULE_OVERRIDES = (process.env.ENABLE_RULE_OVERRIDES || 'true').toLowerCase() !== 'false';
const ENABLE_WARM_ALGO_SERVICE = (process.env.ENABLE_WARM_ALGO_SERVICE || 'true').toLowerCase() !== 'false';
const ENABLE_STRUCTURED_LOGS = (process.env.ENABLE_STRUCTURED_LOGS || 'true').toLowerCase() !== 'false';
const EXPERIMENT_PURE_DDA = (process.env.EXPERIMENT_PURE_DDA || 'false').toLowerCase() === 'true';
const ENABLE_SUMMARY_CACHE = (process.env.ENABLE_SUMMARY_CACHE || 'true').toLowerCase() !== 'false';

module.exports = {
  ENABLE_RULE_OVERRIDES,
  ENABLE_WARM_ALGO_SERVICE,
  ENABLE_STRUCTURED_LOGS,
  EXPERIMENT_PURE_DDA,
  ENABLE_SUMMARY_CACHE,
};


