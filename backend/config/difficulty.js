// Central difficulty thresholds and mappings for backend
// Keep aligned with Python algo_config.py

const EASY_MAX = 0.3;
const MEDIUM_MAX = 0.6;

function clampBeta(beta) {
  if (beta < 0.1) return 0.1;
  if (beta > 1.0) return 1.0;
  return beta;
}

function difficultyFromBeta(beta) {
  if (beta < EASY_MAX) return 'Easy';
  if (beta < MEDIUM_MAX) return 'Medium';
  return 'Hard';
}

const difficultyToBeta = {
  Easy: 0.2,
  Medium: 0.5,
  Hard: 0.8,
};

module.exports = {
  EASY_MAX,
  MEDIUM_MAX,
  clampBeta,
  difficultyFromBeta,
  difficultyToBeta,
};


