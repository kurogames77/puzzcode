from Puzzel_Based import run_puzzle_adjustment


def test_run_puzzle_adjustment_basic_shape():
	result = run_puzzle_adjustment(
		user_id="u1",
		level_id="l1",
		theta=0.0,
		beta_old=0.5,
		rank_name="novice",
		completed_achievements=0,
		success_count=3,
		fail_count=2,
		target_performance=0.7,
		adjustment_rate=0.1,
		auto_sync=True,
		verbose=False,
	)
	assert "IRT_Result" in result
	assert "DDA_Result" in result
	summary = result.get("Summary") or result.get("summary")
	assert isinstance(summary, dict)
	assert "New_Beta" in summary
	assert "Next_Puzzle_Difficulty" in summary

