"""
Puzzel_Based.py
---------------
High-level adaptive engine entrypoint used by the backend. Combines IRT +
DDA to predict success probability and pick the next puzzle difficulty/beta.
"""

from functools import lru_cache
from IRT_Algo import irt_probability
from DDA_Algo import DDASystem
from algo_config import clamp_beta, BETA_MIN, BETA_MAX
from RankBases.EXP import PlayerEXP

# Initialize the DDA system once for continuity and performance.
_dda_system = DDASystem(stability_threshold=0.05, momentum_factor=0.6)

# Cache for recent results to avoid redundant calculations.
_last_inputs = {}
_last_result = None


@lru_cache(maxsize=256)
def _compute_rates_cached(success_count: int, fail_count: int) -> tuple:
    total_attempts = success_count + fail_count
    if total_attempts > 0:
        inv_total = 1.0 / total_attempts
        success_rate = success_count * inv_total
        fail_rate = fail_count * inv_total
    else:
        success_rate = 0.5
        fail_rate = 0.5
    return success_rate, fail_rate


def run_puzzle_adjustment(
    user_id: str = None,
    level_id: str = None,
    theta: float = 0.0,
    beta_old: float = 0.5,
    rank_name: str = "novice",
    completed_achievements: int = 0,
    success_count: int = 0,
    fail_count: int = 0,
    target_performance: float = 0.7,
    adjustment_rate: float = 0.1,
    auto_sync: bool = True,
    verbose: bool = False,
    player_exp: PlayerEXP = None,
    exp: int = None
) -> dict:

    global _last_inputs, _last_result
    
    # Input validation / defaults.
    if user_id is None:
        user_id = "unknown_user"
    if level_id is None:
        level_id = "unknown_level"
    
    # Clamp values to valid ranges
    theta = max(-3.0, min(3.0, theta))
    beta_old = clamp_beta(beta_old)
    target_performance = max(0.0, min(1.0, target_performance))
    adjustment_rate = max(0.0, min(1.0, adjustment_rate))
    
    if success_count < 0:
        success_count = 0
    if fail_count < 0:
        fail_count = 0
    if completed_achievements < 0:
        completed_achievements = 0
    
    # Handle EXP data - use PlayerEXP instance if provided, otherwise exp integer.
    exp_value = None
    if player_exp is not None:
        if not isinstance(player_exp, PlayerEXP):
            raise TypeError("player_exp must be a PlayerEXP instance.")
        exp_value = player_exp.exp
    elif exp is not None:
        if exp < 0:
            exp = 0
        exp_value = exp
    
    # Return cached result if inputs unchanged
    input_key = (user_id, level_id, theta, beta_old, rank_name, completed_achievements, 
                 success_count, fail_count, target_performance, adjustment_rate, auto_sync, exp_value)
    if input_key == _last_inputs.get('key') and _last_result:
        return _last_result
    
    # Estimate learner's predicted performance using IRT (includes EXP bonuses).
    irt_result = irt_probability(
        theta=theta,
        beta=beta_old,
        rank_name=rank_name,
        completed_achievements=completed_achievements,
        success_count=success_count,
        fail_count=fail_count,
        exp=exp_value
    )
    
    # Compute success/failure metrics (cached helper).
    success_rate, fail_rate = _compute_rates_cached(success_count, fail_count)
    
    
    # Dynamically adjust puzzle difficulty using DDA.
    dda_result = _dda_system.adjust_difficulty(
        beta_old=beta_old,
        irt_output=irt_result,
        success_count=success_count,
        fail_count=fail_count,
        target_performance=target_performance,
        adjustment_rate=adjustment_rate
    )
    
    # Extract all values in single pass for summary.
    adjusted_theta = irt_result.get("adjusted_theta", theta)
    probability = irt_result.get("probability", 0.5)
    
    beta_new = dda_result.get("beta_new", beta_old)
    difficulty_label = dda_result.get("difficulty_label", "Unknown")
    
    # Extract success/fail levels from DDA result (already computed there).
    dda_success = dda_result.get("success_level", "Unknown")
    dda_fail = dda_result.get("fail_level", "Unknown")
    
    # Use DDA's computed levels if auto_sync, otherwise generic labels.
    if auto_sync:
        success_level = dda_success
        fail_level = dda_fail
    else:
        success_level = "N/A"
        fail_level = "N/A"
    
    # Build combined result for API consumers.
    combined_result = {
        "user_id": user_id,
        "level_id": level_id,
        "IRT_Result": irt_result,
        "DDA_Result": dda_result,
        "Summary": {
            "Student_Skill": round(adjusted_theta, 3),
            "Predicted_Success_Probability": round(probability, 3),
            "Actual_Success_Rate": round(success_rate, 3),
            "Actual_Fail_Rate": round(fail_rate, 3),
            "Target_Performance": target_performance,
            "New_Beta": beta_new,
            "Next_Puzzle_Difficulty": difficulty_label,
            "Success_Level": success_level,
            "Fail_Level": fail_level,
        },
        "metadata": {
            "timestamp": None, 
            "sessions_played": None
        }
    }
    
    # Cache result for next call.
    _last_inputs['key'] = input_key
    _last_result = combined_result
    
    return combined_result