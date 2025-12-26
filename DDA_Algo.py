"""
DDA_Algo.py
-----------
Difficulty Dynamic Adjustment system. Consumes the IRT snapshot plus raw
success/fail counts and returns a new beta (difficulty) along with diagnostics.
"""

import logging
import math
from dataclasses import dataclass
from functools import lru_cache

from IRT_Bases.Fail import get_fail_rate
from IRT_Bases.Success import get_success_rate
from algo_config import (
    MAX_BETA_STEP,
    MOMENTUM_FACTOR_DEFAULT,
    STABILITY_THRESHOLD_DEFAULT,
    clamp_beta,
    difficulty_from_beta,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SuccessMetrics:
    level: str
    success_rate: float
    consistency: float
    bias: float


@dataclass(frozen=True)
class FailMetrics:
    level: str
    fail_rate: float
    penalty: float
    normalized_fail: float


@dataclass(frozen=True)
class IRTSnapshot:
    probability: float
    theta: float


class DDASystem:

    __slots__ = (
        "_previous_beta",
        "_momentum",
        "_stability_threshold",
        "_momentum_factor",
    )

    def __init__(
        self,
        stability_threshold: float = STABILITY_THRESHOLD_DEFAULT,
        momentum_factor: float = MOMENTUM_FACTOR_DEFAULT,
    ):
        self._previous_beta: float | None = None
        self._momentum: float = 0.0
        self._stability_threshold = stability_threshold
        self._momentum_factor = momentum_factor

    @lru_cache(maxsize=512)
    def _fetch_success_metrics(self, success_count: int) -> SuccessMetrics:
        try:
            level, normalized_value, bias = get_success_rate(success_count)
        except (ValueError, TypeError):
            level, normalized_value, bias = "Unknown", 0.5, 0.0

        success_rate = round(normalized_value, 3)
        consistency = round(min(1.0, normalized_value + bias), 3)
        return SuccessMetrics(level, success_rate, consistency, bias)

    @lru_cache(maxsize=512)
    def _fetch_fail_metrics(self, fail_count: int) -> FailMetrics:
        try:
            fail_level, fail_value, fail_penalty = get_fail_rate(fail_count)
        except (ValueError, TypeError):
            fail_level, fail_value, fail_penalty = "Unknown", 0.0, 0.0

        normalized_fail = round(min(1.0, fail_value + fail_penalty), 3)
        return FailMetrics(fail_level, fail_value, fail_penalty, normalized_fail)

    @staticmethod
    def _sanitize_beta(beta_old: float) -> float:
        return clamp_beta(beta_old)

    @staticmethod
    def _sanitize_counts(success_count: int, fail_count: int) -> tuple[int, int]:
        return max(0, success_count), max(0, fail_count)

    @staticmethod
    def _extract_irt_snapshot(irt_output: dict) -> IRTSnapshot:
        if not isinstance(irt_output, dict):
            raise TypeError("irt_output must be a dictionary")
        probability = float(irt_output.get("probability", 0.5))
        theta = float(irt_output.get("adjusted_theta", 0.0))
        return IRTSnapshot(probability=probability, theta=theta)


    @staticmethod
    def _calculate_behavior_weight(
        success_metrics: SuccessMetrics, fail_metrics: FailMetrics
    ) -> float:
        return (
            (0.6 * success_metrics.success_rate)
            + (0.4 * success_metrics.consistency)
            - (0.5 * fail_metrics.penalty)
        )

    @staticmethod
    def _calculate_sensitivity(theta: float) -> float:
        clamped_theta = max(-3.0, min(3.0, theta))
        return 1 - (clamped_theta / 6.0)

    @staticmethod
    def _apply_behavior_weight(beta_adjustment: float, behavior_weight: float) -> float:
        return beta_adjustment * (1 + behavior_weight * 0.3)

    def _enforce_stability_gate(
        self, performance_gap: float, beta_adjustment: float
    ) -> float:
        if abs(performance_gap) < self._stability_threshold:
            return 0.0
        return beta_adjustment

    def _apply_momentum(self, beta_adjustment: float) -> float:
        self._momentum = (
            self._momentum_factor * self._momentum
            + (1 - self._momentum_factor) * beta_adjustment
        )
        return beta_adjustment + self._momentum * 0.5

    def _slow_if_recently_stable(
        self, beta_old: float, beta_adjustment: float
    ) -> float:
        if self._previous_beta is None:
            return beta_adjustment
        delta = abs(beta_old - self._previous_beta)
        if delta < self._stability_threshold:
            return beta_adjustment * 0.4
        return beta_adjustment

    @staticmethod
    def _propose_beta(beta_old: float, beta_adjustment: float) -> float:
        proposed = beta_old + math.tanh(beta_adjustment) * 0.8
        return clamp_beta(proposed)

    @staticmethod
    def _cap_step(beta_old: float, proposed: float) -> float:
        if abs(proposed - beta_old) > MAX_BETA_STEP:
            direction = 1 if proposed > beta_old else -1
            return clamp_beta(beta_old + direction * MAX_BETA_STEP)
        return clamp_beta(proposed)

    @staticmethod
    def _preserve_on_perfect_performance(
        beta_old: float, beta_new: float, irt_snapshot: IRTSnapshot
    ) -> float:
        if irt_snapshot.probability >= 0.99 and beta_new < beta_old and beta_old >= 0.5:
            return beta_old
        return beta_new

    def _log_adjustment(
        self,
        beta_old: float,
        beta_new: float,
        target_performance: float,
        adjustment_rate: float,
        behavior_weight: float,
        success_metrics: SuccessMetrics,
        fail_metrics: FailMetrics,
        irt_snapshot: IRTSnapshot,
    ) -> None:
        final_adjustment = beta_new - beta_old
        try:
            logger.info(
                {
                    "event": "dda_adjust",
                    "beta_old": round(beta_old, 3),
                    "beta_new": round(beta_new, 3),
                    "target_performance": round(target_performance, 3),
                    "actual_performance": round(irt_snapshot.probability, 3),
                    "performance_gap": round(
                        target_performance - irt_snapshot.probability, 3
                    ),
                    "adjustment_rate": round(adjustment_rate, 3),
                    "stability_threshold": self._stability_threshold,
                    "momentum": round(self._momentum, 3),
                    "behavior_weight": round(behavior_weight, 3),
                    "success_rate": success_metrics.success_rate,
                    "consistency": success_metrics.consistency,
                    "fail_rate": fail_metrics.fail_rate,
                    "fail_penalty": fail_metrics.penalty,
                    "final_adjustment": round(final_adjustment, 3),
                }
            )
        except Exception:
            pass

    def _build_response(
        self,
        beta_old: float,
        beta_new: float,
        target_performance: float,
        behavior_weight: float,
        success_metrics: SuccessMetrics,
        fail_metrics: FailMetrics,
        irt_snapshot: IRTSnapshot,
    ) -> dict:
        final_adjustment = beta_new - beta_old
        difficulty_label = difficulty_from_beta(beta_new)
        return {
            "beta_new": round(beta_new, 3),
            "difficulty_label": difficulty_label,
            "actual_performance": round(irt_snapshot.probability, 3),
            "target_performance": target_performance,
            "adjustment_applied": round(final_adjustment, 3),
            "momentum": round(self._momentum, 3),
            "behavior_weight": round(behavior_weight, 3),
            "irt_theta": round(irt_snapshot.theta, 3),
            "success_rate": success_metrics.success_rate,
            "consistency": success_metrics.consistency,
            "fail_rate": fail_metrics.fail_rate,
            "fail_penalty": fail_metrics.penalty,
            "success_level": success_metrics.level,
            "fail_level": fail_metrics.level,
            "bias": success_metrics.bias,
            "stability_threshold": self._stability_threshold,
        }

    def adjust_difficulty(
        self,
        beta_old: float,
        irt_output: dict,
        success_count: int = 0,
        fail_count: int = 0,
        target_performance: float = 0.7,
        adjustment_rate: float = 0.1,
    ) -> dict:
        """Adjust beta using player performance and behavioral signals."""
        beta_old = self._sanitize_beta(beta_old)
        success_count, fail_count = self._sanitize_counts(success_count, fail_count)
        irt_snapshot = self._extract_irt_snapshot(irt_output)

        success_metrics = self._fetch_success_metrics(success_count)
        fail_metrics = self._fetch_fail_metrics(fail_count)

        performance_gap = target_performance - irt_snapshot.probability
        sensitivity = self._calculate_sensitivity(irt_snapshot.theta)
        beta_adjustment = adjustment_rate * performance_gap * sensitivity

        behavior_weight = self._calculate_behavior_weight(
            success_metrics, fail_metrics
        )
        beta_adjustment = self._apply_behavior_weight(beta_adjustment, behavior_weight)
        beta_adjustment = self._enforce_stability_gate(performance_gap, beta_adjustment)
        beta_adjustment = self._apply_momentum(beta_adjustment)
        beta_adjustment = self._slow_if_recently_stable(beta_old, beta_adjustment)

        proposed_beta = self._propose_beta(beta_old, beta_adjustment)
        beta_new = self._cap_step(beta_old, proposed_beta)
        beta_new = self._preserve_on_perfect_performance(
            beta_old, beta_new, irt_snapshot
        )

        self._previous_beta = beta_new

        self._log_adjustment(
            beta_old,
            beta_new,
            target_performance,
            adjustment_rate,
            behavior_weight,
            success_metrics,
            fail_metrics,
            irt_snapshot,
        )
        return self._build_response(
            beta_old,
            beta_new,
            target_performance,
            behavior_weight,
            success_metrics,
            fail_metrics,
            irt_snapshot,
        )
