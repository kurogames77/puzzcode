/**
 * Service for multiplayer matchmaking using Python algorithms
 * Integrates KMeans_Cluster.py, SkillBasedMatchMaking.py, and Multiplayer_Based.py
 */

const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_BASE_URL = process.env.ALGO_SERVICE_URL || 'http://127.0.0.1:5000';
const DEFAULT_TIMEOUT_MS = Number(process.env.ALGO_SERVICE_TIMEOUT_MS || 5000);

function detectPythonCommand() {
  if (process.env.PYTHON_COMMAND) {
    return process.env.PYTHON_COMMAND;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Call Python matchmaking script via child process
 * @param {string} functionName - Function to call: 'find_matches', 'find_best_match', or 'cluster_players'
 * @param {object} args - Arguments for the function
 * @returns {Promise<object>} Matchmaking result
 */
async function callMatchmakingFallback(functionName, args) {
  const pythonScriptPath = path.join(__dirname, '../../algorithms/matchmaking.py');
  const pythonCommand = detectPythonCommand();
  
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonCommand, [pythonScriptPath], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const input = JSON.stringify({
      function: functionName,
      args: args
    });

    pythonProcess.stdin.write(input);
    pythonProcess.stdin.end();

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python matchmaking script exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const response = JSON.parse(stdout);
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error || 'Matchmaking computation failed'));
        }
      } catch (parseError) {
        reject(new Error(`Failed to parse Python output: ${parseError.message}\nOutput: ${stdout}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}

/**
 * Call matchmaking via HTTP service (if available)
 * @param {string} functionName - Function to call
 * @param {object} args - Arguments for the function
 * @returns {Promise<object>} Matchmaking result
 */
async function callMatchmakingService(functionName, args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  
  try {
    const response = await fetch(`${DEFAULT_BASE_URL}/api/multiplayer/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        function: functionName,
        args: args
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timer);
    
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    if (!payload?.success) {
      throw new Error(payload?.error || 'Matchmaking service responded with failure');
    }
    return payload.result;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Matchmaking service timeout');
    }
    throw err;
  }
}

/**
 * Find matches for multiple players using clustering and skill-based matching
 * @param {Array<object>} players - Array of player objects with user_id, theta, beta, etc.
 * @param {object} options - Matchmaking options
 * @returns {Promise<Array>} Array of match groups
 */
async function findMatches(players, options = {}) {
  const {
    matchSize = 2,
    allowCrossCluster = true,
    minMatchScore = 0.5,
    kClusters = 3,
    useService = false
  } = options;

  if (!players || players.length < matchSize) {
    return [];
  }

  const args = {
    players: players,
    match_size: matchSize,
    allow_cross_cluster: allowCrossCluster,
    min_match_score: minMatchScore,
    k_clusters: kClusters
  };

  try {
    if (useService) {
      return await callMatchmakingService('find_matches', args);
    }
  } catch (serviceError) {
    console.warn('Matchmaking service unavailable, falling back to Python script:', serviceError.message);
  }

  // Fallback to Python script
  return await callMatchmakingFallback('find_matches', args);
}

/**
 * Find best match for a single player
 * @param {object} player - Player object
 * @param {Array<Array<number>>} dataPoints - Array of [theta, beta] pairs
 * @param {Array<Array<number>>} centroids - Cluster centroids
 * @returns {Promise<object>} Match result
 */
async function findBestMatch(player, dataPoints, centroids) {
  const args = {
    player_index: 0, // Player is first in dataPoints
    data_points: dataPoints,
    centroids: centroids,
    rank_name: player.rank_name || 'novice',
    completed_achievements: player.completed_achievements || 0,
    success_count: player.success_count || 0,
    fail_count: player.fail_count || 0
  };

  try {
    if (process.env.ALGO_SERVICE_URL) {
      return await callMatchmakingService('find_best_match', args);
    }
  } catch (serviceError) {
    console.warn('Matchmaking service unavailable, falling back to Python script:', serviceError.message);
  }

  return await callMatchmakingFallback('find_best_match', args);
}

/**
 * Cluster players using K-Means
 * @param {Array<object>} irtData - IRT data for clustering
 * @param {object} options - Clustering options
 * @returns {Promise<object>} Clustering result
 */
async function clusterPlayers(irtData, options = {}) {
  const {
    k = 3,
    maxIter = 100,
    tol = 1e-4
  } = options;

  const args = {
    irt_data: irtData,
    k: k,
    max_iter: maxIter,
    tol: tol
  };

  try {
    if (process.env.ALGO_SERVICE_URL) {
      return await callMatchmakingService('cluster_players', args);
    }
  } catch (serviceError) {
    console.warn('Matchmaking service unavailable, falling back to Python script:', serviceError.message);
  }

  return await callMatchmakingFallback('cluster_players', args);
}

module.exports = {
  findMatches,
  findBestMatch,
  clusterPlayers,
  callMatchmakingFallback
};

