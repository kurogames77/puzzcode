const {
  PERFORMANCE: PERFORMANCE_DEFAULTS,
  INTERMEDIATE: INTERMEDIATE_DEFAULTS,
  BEGINNER: BEGINNER_DEFAULTS,
  ADVANCED: ADVANCED_DEFAULTS,
} = require('../config/rules');
const { difficultyFromBeta, difficultyToBeta, clampBeta } = require('../config/difficulty');

function resolveThresholds(input, summary) {
  const overrides =
    input?.thresholdOverrides ||
    summary?.thresholdOverrides ||
    summary?.performanceOverrides ||
    {};

  const performance = {
    ...PERFORMANCE_DEFAULTS,
    ...(overrides.performance || {}),
  };
  const intermediate = {
    ...INTERMEDIATE_DEFAULTS,
    ...(overrides.intermediate || {}),
  };
  const beginner = {
    ...BEGINNER_DEFAULTS,
    ...(overrides.beginner || {}),
  };
  const advanced = {
    ...ADVANCED_DEFAULTS,
    ...(overrides.advanced || {}),
  };

  return {
    performance,
    intermediate,
    beginner,
    advanced,
  };
}

function normalizeAttemptMetrics(attempt, defaults, failCounts = {}) {
  const attemptTime =
    typeof attempt?.attemptTime === 'number' && Number.isFinite(attempt.attemptTime)
      ? attempt.attemptTime
      : defaults.timeFallback;
  const failCountSource =
    typeof attempt?.failCount === 'number' && Number.isFinite(attempt.failCount)
      ? attempt.failCount
      : failCounts[attempt?.levelId] ?? defaults.failFallback;

  return {
    levelId: attempt?.levelId ?? null,
    levelNumber: attempt?.levelNumber ?? null,
    difficulty: attempt?.difficulty ?? null,
    attemptTime,
    success: Boolean(attempt?.success),
    failCount: Math.max(0, failCountSource),
    createdAt: attempt?.createdAt ? new Date(attempt.createdAt).getTime() : 0,
  };
}

function createHistory(summary, currentAttempt, thresholds) {
  const defaults = {
    timeFallback: thresholds?.performance?.timeUnderSeconds ?? PERFORMANCE_DEFAULTS.timeUnderSeconds,
    failFallback: thresholds?.performance?.maxErrors ?? PERFORMANCE_DEFAULTS.maxErrors,
  };

  const attempts = (summary?.attempts || []).map((attempt) =>
    normalizeAttemptMetrics(attempt, defaults, summary?.failCounts)
  );
  if (currentAttempt) {
    const normalized = normalizeAttemptMetrics(currentAttempt, defaults, summary?.failCounts);
    normalized.createdAt = normalized.createdAt || Date.now();
    attempts.push(normalized);
  }
  attempts.sort((a, b) => a.createdAt - b.createdAt);
  return attempts;
}

function latestSuccessByLevel(attempts) {
  const map = new Map();
  attempts.forEach((attempt) => {
    if (!attempt.success) return;
    const existing = map.get(attempt.levelNumber);
    if (!existing || existing.createdAt < attempt.createdAt) {
      map.set(attempt.levelNumber, attempt);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.levelNumber - b.levelNumber);
}

function findRecentConsecutive(windowedAttempts, requiredLength) {
  if (windowedAttempts.length < requiredLength) return [];
  for (let i = windowedAttempts.length - requiredLength; i >= 0; i -= 1) {
    const slice = windowedAttempts.slice(i, i + requiredLength);
    let isConsecutive = true;
    for (let j = 1; j < slice.length; j += 1) {
      if (slice[j].levelNumber !== slice[j - 1].levelNumber + 1) {
        isConsecutive = false;
        break;
      }
    }
    if (isConsecutive) return slice;
  }
  return [];
}

function allMeetPerformanceCriteria(attempts, performanceThresholds) {
  if (attempts.length === 0) return false;
  return attempts.length > 0 && attempts.every((attempt) => {
    const meetsTime =
      attempt.attemptTime != null && attempt.attemptTime < performanceThresholds.timeUnderSeconds;
    const meetsErrors = attempt.failCount <= performanceThresholds.maxErrors;
    return meetsTime && meetsErrors;
  });
}

function evaluateIntermediateRules(input, summaryHistory, thresholds) {
  const audit = [];
  const base = {
    beta: input.algorithmBeta ?? input.currentBeta,
    reason: 'algorithm',
  };
  const attemptsHistory = createHistory(
    summaryHistory,
    {
      levelId: input.levelId,
      levelNumber: input.currentLevelNumber,
      difficulty: input.levelDifficulty,
      attemptTime: input.attemptTime,
      success: input.success,
      failCount: input.newFailCount,
    },
    thresholds
  );
  const latest = latestSuccessByLevel(attemptsHistory);
  const recentFive = findRecentConsecutive(latest, thresholds.intermediate.consecutiveWindow);
  const performedWell = input.success
    && input.attemptTime != null
    && input.attemptTime < thresholds.performance.timeUnderSeconds
    && input.newFailCount <= thresholds.performance.maxErrors;
  const struggledHeavily = input.success
    && input.newFailCount >= thresholds.intermediate.heavyStruggleErrors;

  if (
    input.success
    && input.levelDifficulty === 'Medium'
    && performedWell
    && recentFive.length >= thresholds.intermediate.consecutiveMediumPromotion
    && allMeetPerformanceCriteria(recentFive, thresholds.performance)
  ) {
    audit.push({ rule: 'intermediate_medium_run_promotion', applied: true });
    return {
      beta: difficultyToBeta.Hard,
      difficulty: 'Hard',
      audit,
    };
  }

  if (input.success && input.levelDifficulty === 'Easy' && performedWell) {
    audit.push({ rule: 'intermediate_easy_promotion', applied: true });
    return {
      beta: difficultyToBeta.Medium,
      difficulty: 'Medium',
      audit,
    };
  }

  if (input.success && input.levelDifficulty === 'Hard' && !performedWell) {
    audit.push({ rule: 'intermediate_hard_relief', applied: true });
    return {
      beta: difficultyToBeta.Medium,
      difficulty: 'Medium',
      audit,
    };
  }

  if (input.success && struggledHeavily) {
    const beta = input.newFailCount >= thresholds.intermediate.heavyStruggleErrors
      ? difficultyToBeta.Easy
      : difficultyToBeta.Medium;
    audit.push({ rule: 'intermediate_struggle_relief', applied: true });
    return {
      beta,
      difficulty: difficultyFromBeta(beta),
      audit,
    };
  }

  const perfectRun = input.success && input.newFailCount === 0;
  if (perfectRun && base.beta < input.currentBeta) {
    audit.push({ rule: 'intermediate_perfect_no_decrease', applied: true });
    return {
      beta: input.currentBeta,
      difficulty: difficultyFromBeta(input.currentBeta),
      audit,
    };
  }

  audit.push({ rule: 'intermediate_algorithm_default', applied: false });
  return {
    beta: clampBeta(base.beta),
    difficulty: difficultyFromBeta(clampBeta(base.beta)),
    audit,
  };
}

function evaluateBeginnerRules(input, summaryHistory, thresholds) {
  const audit = [];
  const baseBeta = input.algorithmBeta ?? input.currentBeta;
  const attemptsHistory = createHistory(
    summaryHistory,
    {
      levelId: input.levelId,
      levelNumber: input.currentLevelNumber,
      difficulty: input.levelDifficulty,
      attemptTime: input.attemptTime,
      success: input.success,
      failCount: input.newFailCount,
    },
    thresholds
  );
  const latest = latestSuccessByLevel(attemptsHistory);
  const performedWell = input.success
    && input.newFailCount <= thresholds.performance.maxErrors
    && input.attemptTime != null
    && input.attemptTime < thresholds.performance.timeUnderSeconds;
  const struggling = input.success
    && (input.newFailCount >= thresholds.performance.maxErrors
      || (input.attemptTime != null && input.attemptTime >= thresholds.performance.timeUnderSeconds));

  const windowFive = findRecentConsecutive(latest, thresholds.beginner.promoteMediumLevel);
  if (
    input.levelDifficulty === 'Easy'
    && input.currentLevelNumber >= thresholds.beginner.promoteMediumLevel
    && windowFive.length >= thresholds.beginner.promoteMediumLevel
    && allMeetPerformanceCriteria(windowFive, thresholds.performance)
  ) {
    audit.push({ rule: 'beginner_promote_medium', applied: true });
    return {
      beta: difficultyToBeta.Medium,
      difficulty: 'Medium',
      audit,
    };
  }

  const windowEight = findRecentConsecutive(latest, thresholds.beginner.promoteHardLevel);
  if (
    windowEight.length >= thresholds.beginner.promoteHardLevel
    && windowEight.every((attempt) => attempt.difficulty === 'Easy')
    && allMeetPerformanceCriteria(windowEight, thresholds.performance)
  ) {
    audit.push({ rule: 'beginner_promote_hard', applied: true });
    return {
      beta: difficultyToBeta.Hard,
      difficulty: 'Hard',
      audit,
    };
  }

  if (struggling && (input.levelDifficulty === 'Medium' || input.levelDifficulty === 'Hard')) {
    audit.push({ rule: 'beginner_relief_easy', applied: true });
    return {
      beta: difficultyToBeta.Easy,
      difficulty: 'Easy',
      audit,
    };
  }

  if (performedWell && input.levelDifficulty === 'Easy') {
    // Prevent repeated oscillation by requiring a minimal attempt count since last promotion
    if (summaryHistory?.attempts?.length && summaryHistory?.attempts.length < thresholds.beginner.promoteMediumLevel) {
      audit.push({ rule: 'beginner_easy_success_insufficient_history', applied: false });
      const beta = clampBeta(baseBeta);
      return {
        beta,
        difficulty: difficultyFromBeta(beta),
        audit,
      };
    }
    audit.push({ rule: 'beginner_easy_success', applied: true });
    return {
      beta: difficultyToBeta.Medium,
      difficulty: 'Medium',
      audit,
    };
  }

  audit.push({ rule: 'beginner_algorithm_default', applied: false });
  const beta = clampBeta(baseBeta);
  return {
    beta,
    difficulty: difficultyFromBeta(beta),
    audit,
  };
}

function evaluateAdvancedRules(input, summaryHistory, thresholds) {
  const audit = [];
  const baseBeta = input.algorithmBeta ?? input.currentBeta;
  const attemptsHistory = createHistory(
    summaryHistory,
    {
      levelId: input.levelId,
      levelNumber: input.currentLevelNumber,
      difficulty: input.levelDifficulty,
      attemptTime: input.attemptTime,
      success: input.success,
      failCount: input.newFailCount,
    },
    thresholds
  );
  const latest = latestSuccessByLevel(attemptsHistory);
  const struggling = input.success
    && (input.newFailCount >= thresholds.performance.maxErrors
      || (input.attemptTime != null && input.attemptTime >= thresholds.performance.timeUnderSeconds));
  const performingStrong = input.success
    && input.newFailCount <= thresholds.performance.maxErrors
    && input.attemptTime != null
    && input.attemptTime < thresholds.performance.timeUnderSeconds;

  const windowFive = findRecentConsecutive(latest, thresholds.advanced.demoteMediumLevel);
  if (windowFive.length >= thresholds.advanced.demoteMediumLevel
    && windowFive.every((attempt) => attempt.difficulty === 'Hard')
    && windowFive.every((attempt) => attempt.failCount >= thresholds.performance.maxErrors
      || attempt.attemptTime >= thresholds.performance.timeUnderSeconds)
  ) {
    audit.push({ rule: 'advanced_demote_medium', applied: true });
    return {
      beta: difficultyToBeta.Medium,
      difficulty: 'Medium',
      audit,
    };
  }

  const windowEight = findRecentConsecutive(latest, thresholds.advanced.demoteEasyLevel);
  if (windowEight.length >= thresholds.advanced.demoteEasyLevel
    && windowEight.every((attempt) => attempt.difficulty === 'Hard')
    && windowEight.every((attempt) => attempt.failCount >= thresholds.performance.maxErrors
      || attempt.attemptTime >= thresholds.performance.timeUnderSeconds)
  ) {
    audit.push({ rule: 'advanced_demote_easy', applied: true });
    return {
      beta: difficultyToBeta.Easy,
      difficulty: 'Easy',
      audit,
    };
  }

  if (performingStrong && (input.levelDifficulty === 'Medium' || input.levelDifficulty === 'Easy')) {
    audit.push({ rule: 'advanced_promote_hard', applied: true });
    return {
      beta: difficultyToBeta.Hard,
      difficulty: 'Hard',
      audit,
    };
  }

  if (struggling && input.levelDifficulty === 'Hard') {
    audit.push({ rule: 'advanced_struggle_relief', applied: true });
    return {
      beta: difficultyToBeta.Medium,
      difficulty: 'Medium',
      audit,
    };
  }

  audit.push({ rule: 'advanced_algorithm_default', applied: false });
  const beta = clampBeta(baseBeta);
  return {
    beta,
    difficulty: difficultyFromBeta(beta),
    audit,
  };
}

function evaluateDifficultyRules(input) {
  const summaryHistory = input.summary || { attempts: [], failCounts: {} };
  const thresholds = resolveThresholds(input, summaryHistory);
  const defaultResult = {
    beta: clampBeta(input.algorithmBeta ?? input.currentBeta),
    difficulty: difficultyFromBeta(clampBeta(input.algorithmBeta ?? input.currentBeta)),
    audit: [{ rule: 'algorithm', applied: false }],
  };

  if (!input.enableRules) {
    return defaultResult;
  }

  switch (input.lessonDifficulty) {
    case 'Beginner':
      return evaluateBeginnerRules(input, summaryHistory, thresholds);
    case 'Advanced':
      return evaluateAdvancedRules(input, summaryHistory, thresholds);
    case 'Intermediate':
      return evaluateIntermediateRules(input, summaryHistory, thresholds);
    default:
      return defaultResult;
  }
}

module.exports = {
  evaluateDifficultyRules,
};


