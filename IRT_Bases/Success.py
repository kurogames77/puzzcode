
from functools import lru_cache
from math import sqrt, exp

# Configuration 
MAX_ATTEMPTS = 100
EPSILON = 1e-9  
DECAY_RATE = 0.97 

# Success Tier Map
SUCCESS_TIERS = [
    {"min": 3, "max": 5, "level": "Newbie", "value": 0.25, "bias": 0.02},
    {"min": 6, "max": 50, "level": "Intermediate", "value": 0.60, "bias": 0.05},
    {"min": 51, "max": 100, "level": "Pro", "value": 0.90, "bias": 0.10},
]
DEFAULT_TIER = {"level": "Beginner", "value": 0.10, "bias": 0.00}


# Weighted Success Computation

@lru_cache(maxsize=None)
def compute_success(
    puzzle_success: int,
    battle_success: int,
    gameplay_score: float,
    lesson_outcome: float,
    engagement_rate: float
) -> dict:
    """
    Compute player's total success value across multiple performance dimensions.
    
    Args:
        puzzle_success (int): Successful puzzle completions.
        battle_success (int): Wins or successful matches in multiplayer.
        gameplay_score (float): Efficiency or adaptability score (0–1).
        lesson_outcome (float): Quality of puzzle-based learning results (0–1).
        engagement_rate (float): Daily/weekly consistency (0–1).

    Returns:
        dict: {
            "level": str,
            "success_value": float,
            "bias": float,
            "normalized": float,
            "details": {...}
        }
    """

    # Input validation 
    for val in (puzzle_success, battle_success):
        if not isinstance(val, int) or val < 0:
            raise ValueError("Success counts must be positive integers.")
    for val in (gameplay_score, lesson_outcome, engagement_rate):
        if not isinstance(val, (int, float)) or not (0.0 <= val <= 1.0):
            raise ValueError("Gameplay metrics must be between 0.0 and 1.0")

    #Normalize and balance weights 
    puzzle_norm = min(puzzle_success / MAX_ATTEMPTS, 1.0)
    battle_norm = min(battle_success / MAX_ATTEMPTS, 1.0)

    # Weighted combination formula (tunable)
    weighted_success = (
        (0.35 * puzzle_norm) +
        (0.25 * battle_norm) +
        (0.15 * gameplay_score) +
        (0.15 * lesson_outcome) +
        (0.10 * (engagement_rate * DECAY_RATE))
    )

    # Clamp
    weighted_success = max(0.0, min(weighted_success, 1.0))

    #  Tier classification 
    success_count_equiv = int(weighted_success * MAX_ATTEMPTS)
    tier = next((t for t in SUCCESS_TIERS if t["min"] <= success_count_equiv <= t["max"]), DEFAULT_TIER)

    #  Dynamic bias scaling 
    dynamic_bias = tier["bias"] + (sqrt(weighted_success) * 0.02)

    # Adaptive normalization (smooth transition across tiers) 
    normalized = 1 / (1 + exp(-6 * (weighted_success - 0.5)))

    return {
        "level": tier["level"],
        "success_value": round(weighted_success, 4),
        "bias": round(dynamic_bias, 4),
        "normalized": round(normalized, 4),
        "details": {
            "puzzle_norm": round(puzzle_norm, 3),
            "battle_norm": round(battle_norm, 3),
            "gameplay_score": round(gameplay_score, 3),
            "lesson_outcome": round(lesson_outcome, 3),
            "engagement_rate": round(engagement_rate, 3)
        }
    }


@lru_cache(maxsize=MAX_ATTEMPTS + 1)
def get_success_rate(success_count: int) -> tuple[str, float, float]:
    """
    Fast wrapper function for success rate calculation.
    Returns (level, normalized_value, bias) for backward compatibility.
    
    Args:
        success_count (int): Total successful attempts.
    
    Returns:
        tuple: (level_name, normalized_success_rate, bias_value)
    """
    if not isinstance(success_count, int) or success_count < 0:
        success_count = 0
    
    # Use simplified calculation for speed (only puzzle success, assume defaults for others)
    normalized = min(success_count / MAX_ATTEMPTS, 1.0)
    success_count_equiv = int(normalized * MAX_ATTEMPTS)
    
    # Find matching tier
    tier = next((t for t in SUCCESS_TIERS if t["min"] <= success_count_equiv <= t["max"]), DEFAULT_TIER)
    
    # Calculate dynamic bias
    dynamic_bias = tier["bias"] + (sqrt(normalized) * 0.02)
    
    return tier["level"], round(normalized, 4), round(dynamic_bias, 4)