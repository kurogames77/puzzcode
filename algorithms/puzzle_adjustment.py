#!/usr/bin/env python3
"""
Standalone script to run puzzle adjustment algorithm
Can be called directly from Node.js using child_process
"""
import sys
import json
import os
import logging

# Add parent directory to path to import algorithms
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from Puzzel_Based import run_puzzle_adjustment

def main():
    """Main entry point for puzzle adjustment"""
    # Configure logging to stderr so stdout stays clean JSON for Node
    logging.basicConfig(stream=sys.stderr, level=logging.INFO)
    try:
        # Read input from stdin (JSON)
        input_data = json.loads(sys.stdin.read())
        try:
            logging.info({"event": "puzzle_adjust_input", "payload": input_data})
        except Exception:
            pass

        # Extract parameters
        user_id = input_data.get('user_id', 'unknown_user')
        level_id = input_data.get('level_id', 'unknown_level')
        theta = float(input_data.get('theta', 0.0))
        beta_old = float(input_data.get('beta_old', 0.5))
        rank_name = input_data.get('rank_name', 'novice')
        completed_achievements = int(input_data.get('completed_achievements', 0))
        success_count = int(input_data.get('success_count', 0))
        fail_count = int(input_data.get('fail_count', 0))
        target_performance = float(input_data.get('target_performance', 0.7))
        adjustment_rate = float(input_data.get('adjustment_rate', 0.1))
        auto_sync = input_data.get('auto_sync', True)
        
        # Run the algorithm
        result = run_puzzle_adjustment(
            user_id=user_id,
            level_id=level_id,
            theta=theta,
            beta_old=beta_old,
            rank_name=rank_name,
            completed_achievements=completed_achievements,
            success_count=success_count,
            fail_count=fail_count,
            target_performance=target_performance,
            adjustment_rate=adjustment_rate,
            auto_sync=auto_sync,
            verbose=False
        )
        
        # Output result as JSON to stdout
        output = {
            "success": True,
            "result": result
        }
        try:
            # Log a compact summary to stderr
            summary = result.get("Summary") or result.get("summary") or {}
            logging.info({
                "event": "puzzle_adjust_output",
                "user_id": user_id,
                "level_id": level_id,
                "beta_new": summary.get("New_Beta"),
                "difficulty": summary.get("Next_Puzzle_Difficulty"),
                "student_skill": summary.get("Student_Skill"),
            })
        except Exception:
            pass
        print(json.dumps(output))

    except Exception as e:
        # Output error as JSON
        error_output = {
            "success": False,
            "error": str(e)
        }
        # Also try to log the error to stderr
        try:
            logging.exception({"event": "puzzle_adjust_error", "error": str(e)})
        except Exception:
            pass
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == '__main__':
    main()

