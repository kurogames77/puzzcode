from functools import lru_cache
from math import sqrt, exp

MAX_FAILS = 100
EPSILON = 1e-9  
DECAY_RATE = 0.96  


FAIL_TIERS = [
    {"min": 3, "max": 5, "level": "Low Failure", "value": 0.30, "penalty": 0.02},
    {"min": 6, "max": 50, "level": "Moderate Failure", "value": 0.60, "penalty": 0.05},
    {"min": 51, "max": 100, "level": "High Failure", "value": 0.90, "penalty": 0.10},
]

DEFAULT_FAIL = {"level": "Minimal Failure", "value": 0.10, "penalty": 0.00}


# Weighted Failure Computation
@lru_cache(maxsize=None)
def compute_failure(
    puzzle_fail: int,
    battle_fail: int,
    gameplay_risk: float,
    lesson_outcome: float,
    engagement_rate: float
) -> dict:
    """
    Compute the player's total failure value across performance dimensions.

    Args:
        puzzle_fail (int): Failed attempts in puzzle lessons.
        battle_fail (int): Losses in multiplayer battles.
        gameplay_risk (float): Error-proneness / inefficient moves (0–1).
        lesson_outcome (float): Poor lesson performance indicator (0–1).
        engagement_rate (float): Player activity consistency (0–1).

    Returns:
        dict: {
            "level": str,
            "fail_value": float,
            "penalty": float,
            "normalized": float,
            "details": {...}
        }
    """

    #Input validation 
    for val in (puzzle_fail, battle_fail):
        if not isinstance(val, int) or val < 0:
            raise ValueError("Failure counts must be positive integers.")
    for val in (gameplay_risk, lesson_outcome, engagement_rate):
        if not isinstance(val, (int, float)) or not (0.0 <= val <= 1.0):
            raise ValueError("Gameplay metrics must be between 0.0 and 1.0")

    #Normalize
    puzzle_norm = min(puzzle_fail / MAX_FAILS, 1.0)
    battle_norm = min(battle_fail / MAX_FAILS, 1.0)

    #Weighted Failure Formula
    weighted_failure = (
        (0.35 * puzzle_norm) +
        (0.25 * battle_norm) +
        (0.20 * gameplay_risk) +
        (0.10 * lesson_outcome) +
        (0.10 * ((1 - engagement_rate) * DECAY_RATE))
    )

    # Clamp result
    weighted_failure = max(0.0, min(weighted_failure, 1.0))

    #Tier Classification
    fail_equiv = int(weighted_failure * MAX_FAILS)
    tier = next((t for t in FAIL_TIERS if t["min"] <= fail_equiv <= t["max"]), DEFAULT_FAIL)

    # Dynamic Penalty Adjustment
    dynamic_penalty = tier["penalty"] + (sqrt(weighted_failure) * 0.02)

    #Adaptive Normalization (inverted sigmoid to model failure)
    normalized = 1 - (1 / (1 + exp(-6 * (weighted_failure - 0.5))))

    return {
        "level": tier["level"],
        "fail_value": round(weighted_failure, 4),
        "penalty": round(dynamic_penalty, 4),
        "normalized": round(normalized, 4),
        "details": {
            "puzzle_fail_norm": round(puzzle_norm, 3),
            "battle_fail_norm": round(battle_norm, 3),
            "gameplay_risk": round(gameplay_risk, 3),
            "lesson_outcome": round(lesson_outcome, 3),
            "engagement_rate": round(engagement_rate, 3)
        }
    }


@lru_cache(maxsize=MAX_FAILS + 1)
def get_fail_rate(fail_count: int) -> tuple[str, float, float]:
    """
    Fast wrapper function for failure rate calculation.
    Returns (level, fail_value, penalty) for backward compatibility.
    
    Args:
        fail_count (int): Total failed attempts.
    
    Returns:
        tuple: (level_name, fail_rate_value, penalty_value)
    """
    if not isinstance(fail_count, int) or fail_count < 0:
        fail_count = 0
    
    # Use simplified calculation for speed (only puzzle fail, assume defaults for others)
    normalized = min(fail_count / MAX_FAILS, 1.0)
    fail_equiv = int(normalized * MAX_FAILS)
    
    # Find matching tier
    tier = next((t for t in FAIL_TIERS if t["min"] <= fail_equiv <= t["max"]), DEFAULT_FAIL)
    
    # Calculate dynamic penalty
    dynamic_penalty = tier["penalty"] + (sqrt(normalized) * 0.02)
    
    return tier["level"], round(normalized, 4), round(dynamic_penalty, 4)