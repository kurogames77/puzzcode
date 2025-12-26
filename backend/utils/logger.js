const { ENABLE_STRUCTURED_LOGS } = require('../config/featureFlags');

function log(event, data = {}) {
  if (!ENABLE_STRUCTURED_LOGS) {
    // Fallback to plain console
    // eslint-disable-next-line no-console
    console.log(event, data);
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...data,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

function warn(event, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level: 'warn',
    event,
    ...data,
  };
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify(payload));
}

function error(event, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level: 'error',
    event,
    ...data,
  };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
}

// Alias info to log for compatibility with existing code
function info(event, data = {}) {
  log(event, data);
}

module.exports = {
  log,
  info,
  warn,
  error,
};


