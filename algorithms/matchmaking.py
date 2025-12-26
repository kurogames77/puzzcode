#!/usr/bin/env python3
"""
matchmaking.py - Matchmaking Service Wrapper
--------------------------------------------
Entry point for Node.js to call Python matchmaking algorithms.
Wraps: Multiplayer_Based.py, SkillBasedMatchMaking.py, KMeans_Cluster.py

Functions:
- find_matches: Groups players into balanced teams
- find_best_match: Finds best opponent for single player
- cluster_players: Performs clustering only

Usage: Called via child_process with JSON stdin/stdout
"""

import sys
import json
from typing import List, Dict

# Add parent directory to path to import modules
sys.path.insert(0, '.')

try:
    from Multiplayer_Based import MultiplayerMatchmaker, create_matchmaker
    from SkillBasedMatchMaking import find_best_match
    from KMeans_Cluster import kmeans_from_irt
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Failed to import matchmaking modules: {str(e)}"
    }), file=sys.stderr)
    sys.exit(1)


# Main Entry Point: Routes JSON input to appropriate algorithm function
def main():
    """Main entry point for matchmaking script"""
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        
        function_name = input_data.get('function')
        args = input_data.get('args', {})
        
        # find_matches: Groups players into balanced teams
        # Process: 1) Pre-compute IRT 2) Cluster players 3) Match within clusters 4) Cross-cluster fallback
        if function_name == 'find_matches':
            # Extract parameters from JSON input
            players = args.get('players', [])
            match_size = args.get('match_size', 2)  # Players per match (3-5 for ranked)
            allow_cross_cluster = args.get('allow_cross_cluster', True)  # Allow different ranks
            min_match_score = args.get('min_match_score', 0.5)  # Minimum quality threshold
            k_clusters = args.get('k_clusters', 3)  # Number of skill clusters
            
            if not players:
                raise ValueError("players list cannot be empty")
            
            # Create matchmaker instance with specified cluster count
            matchmaker = create_matchmaker(k_clusters=k_clusters)
            
            # Execute matchmaking algorithm
            matches = matchmaker.find_matches(
                players=players,
                match_size=match_size,
                allow_cross_cluster=allow_cross_cluster,
                min_match_score=min_match_score
            )
            
            # Format output
            result = {
                "matches": matches,
                "total_matches": len(matches),
                "total_players": len(players),
                "matched_players": sum(len(m["players"]) for m in matches)
            }
            
            print(json.dumps({
                "success": True,
                "result": result
            }))
            
        # find_best_match: Finds best opponent for single player
        # Process: 1) Identify cluster 2) Search within cluster 3) Fallback to nearest cluster 4) Calculate score
        elif function_name == 'find_best_match':
            # Extract parameters
            player_index = args.get('player_index', 0)  # Index of player seeking match
            data_points = args.get('data_points', [])  # [theta, beta] pairs for all players
            centroids = args.get('centroids', [])  # Cluster center points from K-Means
            rank_name = args.get('rank_name', 'novice')
            completed_achievements = args.get('completed_achievements', 0)
            success_count = args.get('success_count', 0)
            fail_count = args.get('fail_count', 0)
            
            if not data_points or not centroids:
                raise ValueError("data_points and centroids are required")
            
            # Execute skill-based matching algorithm
            match_result = find_best_match(
                player_index=player_index,
                data_points=data_points,
                centroids=centroids,
                rank_name=rank_name,
                completed_achievements=completed_achievements,
                success_count=success_count,
                fail_count=fail_count
            )
            
            print(json.dumps({
                "success": True,
                "result": match_result
            }))
            
        # cluster_players: Groups players into clusters without matching
        # Process: 1) Extract IRT features 2) Normalize 3) K-Means clustering 4) Assign to clusters
        elif function_name == 'cluster_players':
            # Extract parameters
            irt_data = args.get('irt_data', [])  # IRT computation results for each player
            k = args.get('k', 3)  # Number of clusters to form
            max_iter = args.get('max_iter', 100)  # Maximum iterations for convergence
            tol = args.get('tol', 1e-4)  # Convergence tolerance (stops when centroids move < tol)
            
            if not irt_data:
                raise ValueError("irt_data cannot be empty")
            
            # Execute K-Means clustering algorithm
            clustering_result = kmeans_from_irt(
                irt_data=irt_data,
                k=k,
                max_iter=max_iter,
                tol=tol,
                verbose=False
            )
            
            print(json.dumps({
                "success": True,
                "result": clustering_result
            }))
            
        else:
            raise ValueError(f"Unknown function: {function_name}")
            
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

