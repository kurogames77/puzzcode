// Client for calling the warm Python algorithm service (Flask)
// Falls back to child_process at call site if service is unavailable

const DEFAULT_BASE_URL = process.env.ALGO_SERVICE_URL || 'http://127.0.0.1:5000';
const DEFAULT_TIMEOUT_MS = Number(process.env.ALGO_SERVICE_TIMEOUT_MS || 2500);
const MAX_RETRY = Number(process.env.ALGO_SERVICE_MAX_RETRY || 2);
const CIRCUIT_BREAK_AFTER = Number(process.env.ALGO_SERVICE_CIRCUIT_FAILS || 3);
const CIRCUIT_RESET_MS = Number(process.env.ALGO_SERVICE_CIRCUIT_RESET_MS || 30_000);

let failureCount = 0;
let circuitOpenUntil = 0;

function isCircuitOpen() {
  if (circuitOpenUntil === 0) return false;
  if (Date.now() > circuitOpenUntil) {
    failureCount = 0;
    circuitOpenUntil = 0;
    return false;
  }
  return true;
}

function recordFailure() {
  failureCount += 1;
  if (failureCount >= CIRCUIT_BREAK_AFTER) {
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
  }
}

function resetFailures() {
  failureCount = 0;
  circuitOpenUntil = 0;
}

function mapError(err, attempt) {
  if (err.name === 'AbortError') {
    return new Error(`Algo service timeout after ${attempt} attempt(s)`);
  }
  if (err.message === 'fetch failed') {
    return new Error('Algo service unreachable');
  }
  return err;
}

async function attemptRequest(args, { baseUrl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: 'puzzle_adjust', args }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    if (!payload?.success) {
      const error = new Error(payload?.error || 'Algo service responded with failure');
      error.status = 500;
      throw error;
    }
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

async function callPuzzleAdjust(
  args,
  {
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetry = MAX_RETRY,
  } = {},
) {
  if (isCircuitOpen()) {
    const error = new Error('Algo service circuit breaker open');
    error.code = 'CIRCUIT_OPEN';
    throw error;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxRetry + 1; attempt += 1) {
    try {
      const result = await attemptRequest(args, { baseUrl, timeoutMs });
      resetFailures();
      return result;
    } catch (err) {
      lastError = mapError(err, attempt);
      // Do not retry on 4xx errors
      if (err.status && err.status >= 400 && err.status < 500) {
        recordFailure();
        throw lastError;
      }
      if (attempt > maxRetry) {
        recordFailure();
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }

  recordFailure();
  throw lastError || new Error('Algo service failed without error');
}

module.exports = {
  callPuzzleAdjust,
};

