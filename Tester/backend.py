"""
Flask Backend API for Algorithm Testing
Provides REST endpoints to test Python algorithms from the front-end.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os

# Add parent directory to path to import algorithms
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from IRT_Algo import IRTModel, irt_probability
from DDA_Algo import DDASystem
from Puzzel_Based import run_puzzle_adjustment
from Multiplayer_Based import MultiplayerMatchmaker, quick_match

app = Flask(__name__)
CORS(app)  # Enable CORS for front-end requests

# Initialize algorithm instances
irt_model = IRTModel()
dda_system = DDASystem()
matchmaker = MultiplayerMatchmaker()


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "message": "Algorithm testing API is running"})


@app.route('/api/irt/compute', methods=['POST'])
def compute_irt():
    """
    Compute IRT probability and ability adjustment.
    
    Expected JSON payload:
    {
        "user_id": str,
        "theta": float,
        "beta": float,
        "success_count": int,
        "fail_count": int,
        "sessions_played": int (optional),
        "prev_theta": float (optional)
    }
    """
    try:
        data = request.json
        
        # Extract required parameters
        user_id = data.get('user_id', 'user')
        theta = float(data.get('theta', 0.0))
        beta = float(data.get('beta', 0.5))
        success_count = int(data.get('success_count', 0))
        fail_count = int(data.get('fail_count', 0))
        sessions_played = int(data.get('sessions_played', 1))
        prev_theta = data.get('prev_theta')
        
        # Compute full IRT result
        result = irt_model.compute_full_irt(
            user_id=user_id,
            theta=theta,
            beta=beta,
            success_count=success_count,
            fail_count=fail_count,
            sessions_played=sessions_played,
            prev_theta=prev_theta
        )
        
        return jsonify({
            "success": True,
            "result": result
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


@app.route('/api/irt/probability', methods=['POST'])
def compute_irt_probability():
    """
    Simplified IRT probability wrapper.
    
    Expected JSON payload:
    {
        "theta": float,
        "beta": float,
        "rank_name": str (optional),
        "completed_achievements": int (optional),
        "success_count": int (optional),
        "fail_count": int (optional)
    }
    """
    try:
        data = request.json
        
        theta = float(data.get('theta', 0.0))
        beta = float(data.get('beta', 0.5))
        rank_name = data.get('rank_name', 'novice')
        completed_achievements = int(data.get('completed_achievements', 0))
        success_count = int(data.get('success_count', 0))
        fail_count = int(data.get('fail_count', 0))
        
        result = irt_probability(
            theta=theta,
            beta=beta,
            rank_name=rank_name,
            completed_achievements=completed_achievements,
            success_count=success_count,
            fail_count=fail_count
        )
        
        return jsonify({
            "success": True,
            "result": result
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


@app.route('/api/dda/adjust', methods=['POST'])
def adjust_difficulty():
    """
    Adjust puzzle difficulty using DDA algorithm.
    
    Expected JSON payload:
    {
        "beta_old": float,
        "irt_output": dict,
        "success_count": int,
        "fail_count": int,
        "target_performance": float (optional),
        "adjustment_rate": float (optional)
    }
    """
    try:
        data = request.json
        
        beta_old = float(data.get('beta_old', 0.5))
        irt_output = data.get('irt_output', {})
        success_count = int(data.get('success_count', 0))
        fail_count = int(data.get('fail_count', 0))
        target_performance = float(data.get('target_performance', 0.7))
        adjustment_rate = float(data.get('adjustment_rate', 0.1))
        
        result = dda_system.adjust_difficulty(
            beta_old=beta_old,
            irt_output=irt_output,
            success_count=success_count,
            fail_count=fail_count,
            target_performance=target_performance,
            adjustment_rate=adjustment_rate
        )
        
        return jsonify({
            "success": True,
            "result": result
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


@app.route('/api/puzzle/adjust', methods=['POST'])
def puzzle_adjustment():
    """
    Run puzzle-based adjustment combining IRT and DDA.
    Supports both single student and batch processing (multiple students).
    
    Single student JSON payload:
    {
        "theta": float,
        "beta_old": float,
        "rank_name": str,
        "completed_achievements": int,
        "success_count": int,
        "fail_count": int,
        "target_performance": float (optional),
        "adjustment_rate": float (optional),
        "auto_sync": bool (optional),
        "verbose": bool (optional)
    }
    
    Batch processing JSON payload:
    {
        "students": [
            {
                "player_name": str (optional),
                "theta": float,
                "beta_old": float,
                "rank_name": str,
                "completed_achievements": int,
                "success_count": int,
                "fail_count": int,
                ...
            },
            ...
        ],
        "target_performance": float (optional, applies to all),
        "adjustment_rate": float (optional, applies to all),
        "auto_sync": bool (optional, applies to all)
    }
    """
    try:
        data = request.json
        
        # Check if this is a batch request (has "students" array)
        if 'students' in data and isinstance(data.get('students'), list):
            # Batch processing for multiple students
            students = data.get('students', [])
            if not students:
                raise ValueError("'students' must be a non-empty list")
            
            # Get global defaults
            target_performance = float(data.get('target_performance', 0.7))
            adjustment_rate = float(data.get('adjustment_rate', 0.1))
            auto_sync = data.get('auto_sync', True)
            
            # Process each student
            results = []
            for idx, student in enumerate(students):
                try:
                    player_name = student.get('player_name') or student.get('user_id') or student.get('player_id', f'Student_{idx+1}')
                    theta = float(student.get('theta', 0.5))
                    beta_old = float(student.get('beta_old', 0.5))
                    rank_name = student.get('rank_name', 'novice')
                    completed_achievements = int(student.get('completed_achievements', 0))
                    success_count = int(student.get('success_count', 0))
                    fail_count = int(student.get('fail_count', 0))
                    student_target = float(student.get('target_performance', target_performance))
                    student_adjustment_rate = float(student.get('adjustment_rate', adjustment_rate))
                    student_auto_sync = student.get('auto_sync', auto_sync)
                    
                    result = run_puzzle_adjustment(
                        theta=theta,
                        beta_old=beta_old,
                        rank_name=rank_name,
                        completed_achievements=completed_achievements,
                        success_count=success_count,
                        fail_count=fail_count,
                        target_performance=student_target,
                        adjustment_rate=student_adjustment_rate,
                        auto_sync=student_auto_sync,
                        verbose=False
                    )
                    
                    summary = result.get("Summary", {})
                    results.append({
                        "student_index": idx + 1,
                        "player_name": player_name,
                        "rank_name": rank_name,
                        "completed_achievements": completed_achievements,
                        "success_count": success_count,
                        "fail_count": fail_count,
                        "player_skill": summary.get("Student_Skill", 0),
                        "predicted_success": summary.get("Predicted_Success_Probability", 0),
                        "actual_success_rate": summary.get("Actual_Success_Rate", 0),
                        "actual_fail_rate": summary.get("Actual_Fail_Rate", 0),
                        "target_performance": summary.get("Target_Performance", 0.7),
                        "old_difficulty": beta_old,
                        "new_difficulty": summary.get("New_Beta", beta_old),
                        "difficulty_label": summary.get("Next_Puzzle_Difficulty", "Unknown"),
                        "success_level": summary.get("Success_Level", "Unknown"),
                        "fail_level": summary.get("Fail_Level", "Unknown"),
                        "full_details": result
                    })
                except Exception as e:
                    # If one student fails, include error in result
                    results.append({
                        "student_index": idx + 1,
                        "player_name": student.get('player_name', f'Student_{idx+1}'),
                        "error": str(e)
                    })
            
            return jsonify({
                "success": True,
                "result": {
                    "batch_mode": True,
                    "students": results,
                    "summary": {
                        "total_students": len(students),
                        "processed": len([r for r in results if "error" not in r]),
                        "failed": len([r for r in results if "error" in r])
                    }
                }
            })
        
        else:
            # Single student processing (original behavior)
            player_name = data.get('player_name') or data.get('user_id') or data.get('player_id', 'Player')
            
            theta = float(data.get('theta', 0.5))
            beta_old = float(data.get('beta_old', 0.5))
            rank_name = data.get('rank_name', 'novice')
            completed_achievements = int(data.get('completed_achievements', 0))
            success_count = int(data.get('success_count', 0))
            fail_count = int(data.get('fail_count', 0))
            target_performance = float(data.get('target_performance', 0.7))
            adjustment_rate = float(data.get('adjustment_rate', 0.1))
            auto_sync = data.get('auto_sync', True)
            verbose = data.get('verbose', False)
            
            result = run_puzzle_adjustment(
                theta=theta,
                beta_old=beta_old,
                rank_name=rank_name,
                completed_achievements=completed_achievements,
                success_count=success_count,
                fail_count=fail_count,
                target_performance=target_performance,
                adjustment_rate=adjustment_rate,
                auto_sync=auto_sync,
                verbose=verbose
            )
            
            # Format output for better readability
            summary = result.get("Summary", {})
            formatted_result = {
                "batch_mode": False,
                "summary": {
                    "player_name": player_name,
                    "rank_name": rank_name,
                    "completed_achievements": completed_achievements,
                    "success_count": success_count,
                    "fail_count": fail_count,
                    "player_skill": summary.get("Student_Skill", 0),
                    "predicted_success": summary.get("Predicted_Success_Probability", 0),
                    "actual_success_rate": summary.get("Actual_Success_Rate", 0),
                    "actual_fail_rate": summary.get("Actual_Fail_Rate", 0),
                    "target_performance": summary.get("Target_Performance", 0.7),
                    "old_difficulty": beta_old,
                    "new_difficulty": summary.get("New_Beta", beta_old),
                    "difficulty_label": summary.get("Next_Puzzle_Difficulty", "Unknown"),
                    "success_level": summary.get("Success_Level", "Unknown"),
                    "fail_level": summary.get("Fail_Level", "Unknown")
                },
                "full_details": result  # Include full details for advanced users
            }
            
            return jsonify({
                "success": True,
                "result": formatted_result
            })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


@app.route('/api/multiplayer/match', methods=['POST'])
def multiplayer_match():
    """
    Find matches for multiple players using clustering and skill-based matching.
    
    Expected JSON payload:
    {
        "players": [
            {
                "user_id": str,
                "theta": float,
                "beta": float,
                "success_count": int,
                "fail_count": int,
                "rank_name": str,
                "completed_achievements": int
            },
            ...
        ],
        "match_size": int (optional, default: 2),
        "allow_cross_cluster": bool (optional, default: True),
        "min_match_score": float (optional, default: 0.5)
    }
    """
    try:
        data = request.json
        
        players = data.get('players', [])
        if not players or not isinstance(players, list):
            raise ValueError("'players' must be a non-empty list of player dictionaries")
        
        match_size = int(data.get('match_size', 2))
        allow_cross_cluster = data.get('allow_cross_cluster', True)
        min_match_score = float(data.get('min_match_score', 0.5))
        
        result = matchmaker.find_matches(
            players=players,
            match_size=match_size,
            allow_cross_cluster=allow_cross_cluster,
            min_match_score=min_match_score
        )
        
        # Format output for better readability
        formatted_matches = []
        for idx, match in enumerate(result, 1):
            matched_players_info = []
            for player in match.get("players", []):
                matched_players_info.append({
                    "user_id": player.get("user_id"),
                    "theta": player.get("theta"),
                    "rank_name": player.get("rank_name"),
                    "success_count": player.get("success_count"),
                    "fail_count": player.get("fail_count")
                })
            
            formatted_matches.append({
                "match_id": idx,
                "matched_players": matched_players_info,
                "player_count": len(matched_players_info),
                "match_score": match.get("match_score", 0),
                "cluster": match.get("cluster", "unknown")
            })
        
        return jsonify({
            "success": True,
            "result": {
                "matches": formatted_matches,
                "summary": {
                    "total_matches": len(result),
                    "total_players": len(players),
                    "matched_players": sum(len(m.get("players", [])) for m in result),
                    "unmatched_players": len(players) - sum(len(m.get("players", [])) for m in result),
                    "match_size": match_size
                }
            }
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


@app.route('/api/multiplayer/quick_match', methods=['POST'])
def multiplayer_quick_match():
    """
    Quick matchmaking function for simple use cases.
    
    Expected JSON payload:
    {
        "players": [player_dicts...],
        "match_size": int (optional, default: 2)
    }
    """
    try:
        data = request.json
        
        players = data.get('players', [])
        if not players or not isinstance(players, list):
            raise ValueError("'players' must be a non-empty list of player dictionaries")
        
        match_size = int(data.get('match_size', 2))
        
        result = quick_match(players, match_size=match_size)
        
        return jsonify({
            "success": True,
            "result": {
                "matches": result,
                "total_matches": len(result),
                "total_players": len(players)
            }
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


@app.route('/api/test', methods=['POST'])
def test_custom():
    """
    Generic test endpoint that accepts function name and arguments.
    This allows testing any function from the algorithms.
    
    Expected JSON payload:
    {
        "function": str,  # "irt_compute", "irt_probability", "dda_adjust", "puzzle_adjust", "multiplayer_match"
        "args": dict       # Arguments for the function
    }
    """
    try:
        data = request.json
        func_name = data.get('function', '').lower()
        args = data.get('args', {})
        
        if func_name == 'irt_compute':
            result = irt_model.compute_full_irt(**args)
        elif func_name == 'irt_probability':
            result = irt_probability(**args)
        elif func_name == 'dda_adjust':
            result = dda_system.adjust_difficulty(**args)
        elif func_name == 'puzzle_adjust':
            result = run_puzzle_adjustment(**args)
        elif func_name == 'multiplayer_match':
            result = matchmaker.find_matches(**args)
        else:
            return jsonify({
                "success": False,
                "error": f"Unknown function: {func_name}. Available: irt_compute, irt_probability, dda_adjust, puzzle_adjust, multiplayer_match"
            }), 400
        
        return jsonify({
            "success": True,
            "result": result
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


if __name__ == '__main__':
    print("Starting Algorithm Testing API on http://localhost:5000")
    print("API Endpoints:")
    print("  GET  /api/health")
    print("  POST /api/irt/compute")
    print("  POST /api/irt/probability")
    print("  POST /api/dda/adjust")
    print("  POST /api/puzzle/adjust")
    print("  POST /api/multiplayer/match")
    print("  POST /api/multiplayer/quick_match")
    print("  POST /api/test")
    app.run(debug=True, port=5000)

