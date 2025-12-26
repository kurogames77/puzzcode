"""
IRT_Algo.py - Item Response Theory (IRT) Algorithm
---------------------------------------------------
Predicts student success probability and adjusts ability estimates based on
performance, rank, achievements, and consistency.

Key Functions:
- compute_probability(): Predicts success using theta (ability) and beta (difficulty)
- update_ability(): Adjusts ability based on success/fail counts
- compute_full_irt(): Complete IRT computation with bonuses/penalties
- irt_probability(): Lightweight wrapper for matchmaking

Concepts: Theta (ability -3.0 to 3.0), Beta (difficulty 0.1 to 1.0), 
          Adjusted Theta (with bonuses), Confidence Index (consistency)
"""

import math
import json
import os
from IRT_Bases.Rank import get_rank_data, get_rank_from_exp
from IRT_Bases.Achivements import get_achievement_score
from IRT_Bases.Success import get_success_rate
from IRT_Bases.Fail import get_fail_rate
from RankBases.EXP import PlayerEXP


# IRT Model Class - Encapsulates all IRT computations
class IRTModel:
    __slots__ = ("D", "decay_rate", "alpha", "log_file")
    
    # D: Scaling factor (1.7), decay_rate: Ability decay after inactivity
    # alpha: Smoothing factor, log_file: Logging path
    def __init__(self, D: float = 1.7, decay_rate: float = 0.01, alpha: float = 0.3, log_file: str = "IRT_Logs.json"):
        self.D = D
        self.decay_rate = decay_rate
        self.alpha = alpha
        self.log_file = log_file

    # Core Utilities: Mathematical helpers for IRT computations
    
    # Sigmoid: Converts (theta - beta) to probability [0, 1] using tanh
    # Returns 0.0 for x < -20, 1.0 for x > 20 (prevents overflow)
    @staticmethod
    def _sigmoid(x: float) -> float:
        if x < -20:
            return 0.0
        if x > 20:
            return 1.0
        return 0.5 * (1.0 + math.tanh(x / 2.0))

    # Clamp: Keeps theta in valid range [-3.0, 3.0]
    @staticmethod
    def _clamp(value: float, min_value: float = -3.0, max_value: float = 3.0) -> float:
        return max(min_value, min(max_value, value))

    # Advanced Features: Consistency, decay, and smoothing
    
    # Confidence: Measures performance consistency (0.0=volatile, 1.0=consistent)
    # If success_rate ≈ fail_rate → volatile, else → consistent
    def compute_confidence(self, success_rate: float, fail_rate: float) -> float:
        confidence = 1.0 - abs(success_rate - fail_rate)
        return round(max(0.0, min(confidence, 1.0)), 3)

    # Learning Decay: Reduces ability after inactivity (prevents stale data)
    def apply_learning_decay(self, theta: float, sessions_played: int) -> float:
        decayed_theta = theta * (1 - (self.decay_rate * sessions_played))
        return round(self._clamp(decayed_theta), 3)

    # Smooth Value: Exponential moving average to prevent sudden ability jumps
    def smooth_value(self, current: float, previous: float) -> float:
        return round(self.alpha * current + (1 - self.alpha) * previous, 3)

    def log_results(self, data: dict):
        try:
            with open(self.log_file, "a", buffering=8192) as f:
                f.write(json.dumps(data, separators=(',', ':')) + "\n")
        except (IOError, OSError, TypeError) as e:
            pass

    # Core Computation: Fundamental IRT calculations
    
    # Compute Probability: P = sigmoid(D * (theta - beta))
    # Returns 0.0-1.0. If theta > beta → P > 0.5 (likely success)
    def compute_probability(self, theta: float, beta: float) -> float:
        return round(self._sigmoid(self.D * (theta - beta)), 4)

    # Update Ability: Adjusts theta based on success/fail ratio
    # success_rate > 50% → increase theta, < 50% → decrease theta
    def update_ability(self, theta: float, success_count: int, fail_count: int, learning_rate: float = 0.05) -> float:
        total = success_count + fail_count
        if total == 0:
            return theta

        performance_ratio = success_count / total
        delta = (performance_ratio - 0.5) * learning_rate
        return self._clamp(theta + delta)

    # Full IRT Computation: Combines all components
    # Steps: 1) Base probability 2) Ability adjustment 3) Rank/achievement bonuses
    #        4) Success/fail penalties 5) Confidence weighting 6) Learning decay 7) Smoothing
    def compute_full_irt(
        self,
        user_id: str = None,
        theta: float = 0.0,
        beta: float = 0.5,
        success_count: int = 0,
        fail_count: int = 0,
        sessions_played: int = 1,
        prev_theta: float = None,
        player_exp: PlayerEXP = None,
        exp: int = None
    ):
        # Handle missing user_id (for new users)
        if user_id is None:
            user_id = "default_user"
        
        # Clamp theta and beta to valid ranges
        theta = self._clamp(theta)
        beta = max(0.1, min(1.0, beta))
        
        if success_count < 0:
            success_count = 0
        if fail_count < 0:
            fail_count = 0
        if sessions_played < 1:
            sessions_played = 1

        # Collect rank/achievement context (EXP if available for accuracy).
        if player_exp is not None:
            # Use PlayerEXP instance if provided
            rank_name, rank_bonus = get_rank_data(user_id, player_exp=player_exp)
        elif exp is not None:
            # Use EXP integer value if provided
            rank_name, rank_bonus = get_rank_from_exp(exp)
        else:
            # Fallback to default (backward compatible)
            rank_name, rank_bonus = get_rank_data(user_id)
        achievement_score = get_achievement_score(user_id)
        success_level, success_rate, success_bonus = get_success_rate(success_count)
        fail_level, fail_value, fail_penalty = get_fail_rate(fail_count)

        # Compute core probability from current theta/beta.
        probability = self.compute_probability(theta, beta)

        # Ability update from raw success/fail counts.
        adjusted_theta = self.update_ability(theta, success_count, fail_count)

        # Integrate rank/achievement/penalties into theta.
        adjusted_theta += rank_bonus + success_bonus - fail_penalty
        adjusted_theta += min(achievement_score * 0.01, 0.1)

        # Apply confidence index (trust theta less if performance is volatile).
        confidence = self.compute_confidence(success_rate, fail_value)
        adjusted_theta *= confidence

        # Apply learning decay to avoid stale ability after long breaks.
        adjusted_theta = self.apply_learning_decay(adjusted_theta, sessions_played)

        # Smooth transitions if we know previous theta (prevents spikes).
        if prev_theta is not None:
            adjusted_theta = self.smooth_value(adjusted_theta, prev_theta)
            adjusted_theta = self._clamp(adjusted_theta)

        # Build result payload consumed by downstream DDA logic.
        result = {
            "user_id": user_id,
            "rank": rank_name,
            "success_level": success_level,
            "fail_level": fail_level,
            "probability": probability,
            "adjusted_theta": adjusted_theta,
            "confidence_index": confidence,
            "success_rate": round(success_rate, 3),
            "fail_rate_value": round(fail_value, 3),
            "rank_bonus": rank_bonus,
            "achievement_score": achievement_score,
            "fail_penalty": fail_penalty,
            "sessions_played": sessions_played,
        }

        return result

# ----------------------------------------------------------------------
# Compatibility wrapper: lightweight API used elsewhere (battle scripts).
# ----------------------------------------------------------------------
def irt_probability(
    theta: float = 0.0,
    beta: float = 0.5,
    rank_name: str = "novice",
    completed_achievements: int = 0,
    success_count: int = 0,
    fail_count: int = 0,
    exp: int = None
) -> dict:
    model = IRTModel()
    
    # Input validation
    theta = model._clamp(theta)
    beta = max(0.1, min(1.0, beta))
    if success_count < 0:
        success_count = 0
    if fail_count < 0:
        fail_count = 0
    if completed_achievements < 0:
        completed_achievements = 0
    
    # Get rank and achievement bonuses - use EXP if available
    if exp is not None:
        _, rank_bonus = get_rank_from_exp(exp)
    else:
        _, rank_bonus = get_rank_data("user")
    achievement_score = completed_achievements * 0.01
    
    # Get success/fail rates
    _, success_rate, success_bonus = get_success_rate(success_count)
    _, fail_value, fail_penalty = get_fail_rate(fail_count)
    
    # Compute base probability (with D scaling factor)
    prob_input = model.D * (theta - beta)
    probability = model._sigmoid(prob_input)
    
    # Adjust theta with bonuses
    adjusted_theta = model.update_ability(theta, success_count, fail_count)
    adjusted_theta += rank_bonus + success_bonus - fail_penalty
    adjusted_theta += min(achievement_score * 0.01, 0.1)
    adjusted_theta = model._clamp(adjusted_theta)
    
    # Compute confidence index (performance consistency)
    confidence = model.compute_confidence(success_rate, fail_value)
    
    return {
        "probability": probability,
        "adjusted_theta": adjusted_theta,
        "confidence_index": confidence,
        "success_rate": success_rate,
        "fail_rate": fail_value,
        "rank_bonus": rank_bonus,
        "achievement_score": achievement_score



        
    }


    
