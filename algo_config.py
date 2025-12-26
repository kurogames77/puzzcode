"""
Central configuration for algorithm thresholds and mappings.
Keep all tunable constants here so backend and tests can rely on one source.
"""

# Beta bounds
BETA_MIN = 0.1
BETA_MAX = 1.0

# Difficulty thresholds (map beta to Easy/Medium/Hard)
# Easy: beta < EASY_MAX
# Medium: EASY_MAX <= beta < MEDIUM_MAX
# Hard: beta >= MEDIUM_MAX
EASY_MAX = 0.3
MEDIUM_MAX = 0.6

# Defaults for adaptive difficulty
TARGET_SUCCESS_RATE_DEFAULT = 0.7
ADJUSTMENT_RATE_DEFAULT = 0.1

# DDA stability / momentum
STABILITY_THRESHOLD_DEFAULT = 0.05
MOMENTUM_FACTOR_DEFAULT = 0.6

# Cap per-step absolute beta change to avoid oscillation
MAX_BETA_STEP = 0.15


def clamp_beta(beta: float) -> float:
	"""Clamp beta to allowed range."""
	if beta < BETA_MIN:
		return BETA_MIN
	if beta > BETA_MAX:
		return BETA_MAX
	return beta


def difficulty_from_beta(beta: float) -> str:
	"""Map beta to difficulty label."""
	if beta < EASY_MAX:
		return "Easy"
	if beta < MEDIUM_MAX:
		return "Medium"
	return "Hard"


