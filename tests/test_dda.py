import math
from DDA_Algo import DDASystem
from algo_config import difficulty_from_beta, EASY_MAX, MEDIUM_MAX, MAX_BETA_STEP, clamp_beta


def make_irt(probability: float, theta: float = 0.0):
	return {"probability": probability, "adjusted_theta": theta}


def test_difficulty_mapping_boundaries():
	assert difficulty_from_beta(EASY_MAX - 1e-6) == "Easy"
	assert difficulty_from_beta(EASY_MAX) == "Medium"
	assert difficulty_from_beta(MEDIUM_MAX - 1e-6) == "Medium"
	assert difficulty_from_beta(MEDIUM_MAX) == "Hard"


def test_step_cap_limits_large_gap():
	dda = DDASystem()
	beta_old = 0.5
	# Huge negative performance to force big increase
	irt = make_irt(probability=0.0, theta=0.0)
	res = dda.adjust_difficulty(beta_old=beta_old, irt_output=irt, success_count=1, fail_count=0, target_performance=0.9, adjustment_rate=1.0)
	beta_new = res["beta_new"]
	assert beta_new - beta_old <= MAX_BETA_STEP + 1e-6


def test_step_cap_limits_large_drop():
	dda = DDASystem()
	beta_old = 0.7
	# Huge positive performance to force big decrease
	irt = make_irt(probability=1.0, theta=0.0)
	res = dda.adjust_difficulty(beta_old=beta_old, irt_output=irt, success_count=0, fail_count=1, target_performance=0.5, adjustment_rate=1.0)
	beta_new = res["beta_new"]
	assert beta_old - beta_new <= MAX_BETA_STEP + 1e-6


def test_beta_clamped_range():
	assert clamp_beta(-1.0) >= 0.1
	assert clamp_beta(2.0) <= 1.0


def test_perfect_performance_should_not_reduce_beta_from_medium():
	dda = DDASystem()
	beta_old = 0.5
	irt = make_irt(probability=1.0, theta=0.0)
	res = dda.adjust_difficulty(beta_old=beta_old, irt_output=irt, success_count=5, fail_count=0, target_performance=0.7, adjustment_rate=0.1)
	assert res["beta_new"] >= beta_old - 1e-6


def test_monotonic_response_to_performance_gap():
	dda = DDASystem()
	beta_old = 0.5
	irt_bad = make_irt(probability=0.2, theta=0.0)
	irt_good = make_irt(probability=0.8, theta=0.0)
	res_bad = dda.adjust_difficulty(beta_old=beta_old, irt_output=irt_bad, success_count=0, fail_count=5, target_performance=0.7, adjustment_rate=0.2)
	res_good = dda.adjust_difficulty(beta_old=beta_old, irt_output=irt_good, success_count=5, fail_count=0, target_performance=0.7, adjustment_rate=0.2)
	assert res_bad["beta_new"] > beta_old  # should increase difficulty when underperforming
	assert res_good["beta_new"] < beta_old  # should decrease difficulty when overperforming

