"""
Multiplayer_Based.py - Multiplayer Matchmaking Orchestrator
------------------------------------------------------------
Top-level orchestrator for forming balanced multiplayer matches.

Pipeline: 1) Prepare data (extract stats, pre-compute IRT) 2) Cluster players (K-Means)
          3) Form matches (within clusters → cross-cluster fallback)

Features: Batch processing, caching, optimized matching, cross-cluster support
Rules: Same rank (5 players) or cross-rank (3-4 players) with algorithm
"""

from typing import List, Dict, Optional, Tuple
from KMeans_Cluster import kmeans_from_irt, squared_distance
from SkillBasedMatchMaking import find_best_match
from IRT_Algo import irt_probability


# Multiplayer Matchmaker Class: Orchestrates entire matchmaking pipeline
class MultiplayerMatchmaker:
    # k_clusters: Number of clusters, max_iter: Max iterations, tolerance: Convergence threshold
    # _clustering_cache: Cache to avoid re-clustering identical player sets
    def __init__(self, k_clusters: int = 3, max_iter: int = 100, tolerance: float = 1e-4):
        self.k_clusters = k_clusters
        self.max_iter = max_iter
        self.tolerance = tolerance
        self._clustering_cache = {}  
    
    # Prepare Player Data: Converts raw data to clustering/matching format
    # Process: Extract stats → Pre-compute IRT → Calculate rates → Build vectors → Store profiles
    def prepare_player_data(self, players: List[Dict]) -> Tuple[List[Dict], List[List[float]], List[Dict]]:
        """
        Batch step: convert raw player dicts into the numeric inputs required for
        clustering and later scoring. Also caches IRT outputs so we don't
        recompute them multiple times.
        """
        n = len(players)
        #Pre-allocate lists for better performance
        irt_data = [None] * n
        data_points = [None] * n
        player_profiles = [None] * n
        
        #Pre-compute all IRT/DDA in batch (single pass)
        for idx, player in enumerate(players):
            # Extract player info (optimized)
            user_id = player.get("user_id", f"player_{idx}")
            theta = float(player.get("theta", 0.0))
            beta = float(player.get("beta", 0.5))
            success_count = int(player.get("success_count", 0))
            fail_count = int(player.get("fail_count", 0))
            rank_name = str(player.get("rank_name", "novice"))
            achievements = int(player.get("completed_achievements", 0))
            
            #Compute IRT metrics ONCE per player
            irt_result = irt_probability(
                theta=theta,
                beta=beta,
                rank_name=rank_name,
                completed_achievements=achievements,
                success_count=success_count,
                fail_count=fail_count
            )
            
            #Calculate success/fail rates
            total_attempts = success_count + fail_count
            if total_attempts > 0:
                inv_total = 1.0 / total_attempts
                success_rate = success_count * inv_total
                fail_rate = fail_count * inv_total
            else:
                success_rate = 0.5
                fail_rate = 0.5
            
            adjusted_theta = irt_result.get("adjusted_theta", theta)
            
            #Store pre-computed profile for matchmaking
            player_profiles[idx] = {
                "theta": adjusted_theta,
                "beta": beta,
                "original_theta": theta,
                "success_count": success_count,
                "fail_count": fail_count,
                "rank_name": rank_name,
                "achievements": achievements
            }
            
            #Build IRT data entry for clustering
            irt_entry = {
                "adjusted_theta": adjusted_theta,
                "probability": irt_result.get("probability", 0.5),
                "success_rate": success_rate,
                "fail_rate": fail_rate,
                "_player_info": {
                    "user_id": user_id,
                    "rank_name": rank_name,
                    "completed_achievements": achievements,
                    "success_count": success_count,
                    "fail_count": fail_count
                }
            }
            
            #Use adjusted theta for clustering (better skill representation)
            data_point = [adjusted_theta, beta]
            
            irt_data[idx] = irt_entry
            data_points[idx] = data_point
        
        return irt_data, data_points, player_profiles
    
    # Cluster Players: Groups players using K-Means (with caching to avoid redundant clustering)
    def cluster_players(self, irt_data: List[Dict], use_cache: bool = True) -> Dict:
        """
        Run k-means (with optional caching) so that similar players are grouped.
        The cache avoids re-running clustering when the player list hasn't moved.
        """
        # Optimize cluster count for small groups
        effective_k = min(self.k_clusters, len(irt_data))
        if effective_k < 1:
            effective_k = 1
        
        # Check cache first (using data hash for better cache hits)
        if use_cache:
            cache_key = hash(tuple(
                (d.get("adjusted_theta", 0), d.get("probability", 0))
                for d in irt_data
            ))
            if cache_key in self._clustering_cache:
                return self._clustering_cache[cache_key]
        
        # Perform clustering
        clustering_result = kmeans_from_irt(
            irt_data=irt_data,
            k=effective_k,
            max_iter=self.max_iter,
            tol=self.tolerance,
            verbose=False
        )
        
        # Cache result
        if use_cache:
            self._clustering_cache[cache_key] = clustering_result
        
        return clustering_result
    
    # Find Matches: Forms balanced match groups
    # Process: Prepare data → Cluster → Match within clusters → Cross-cluster fallback → Calculate scores
    def find_matches(
        self,
        players: List[Dict],
        match_size: int = 2,
        allow_cross_cluster: bool = True,
        min_match_score: float = 0.5
    ) -> List[Dict]:

        if len(players) < match_size:
            return []
        
        # Prepare data with pre-computed profiles
        irt_data, data_points, player_profiles = self.prepare_player_data(players)
        
        # Cluster players
        clustering = self.cluster_players(irt_data)
        assignments = clustering["assignments"]
        
        # Build cluster map
        cluster_map = {}
        for idx, cluster_id in enumerate(assignments):
            cluster_map.setdefault(cluster_id, []).append(idx)
        
        # Sort players by theta for better matching
        all_indices = list(range(len(players)))
        
        # Use optimized matching algorithm
        matches = []
        matched_players = set()
        
        # Sort-based approach
        #Match within clusters first, then cross-cluster
        for cluster_id, cluster_indices in sorted(cluster_map.items()):
            #Sort cluster by theta for better matching
            cluster_indices.sort(key=lambda i: player_profiles[i]["theta"])
            available = [i for i in cluster_indices if i not in matched_players]
            
            #Group matching (much faster than individual calls)
            while len(available) >= match_size:
                match_group = self._find_best_group_fast(
                    available, player_profiles, match_size, min_match_score
                )
                
                if match_group and len(match_group) == match_size:
                    matches.append({
                        "players": [players[i] for i in match_group],
                        "cluster": cluster_id,
                        "match_score": self._calculate_group_score(match_group, player_profiles),
                        "details": {"match_type": "optimized_cluster"}
                    })
                    matched_players.update(match_group)
                    #Remove matched players
                    available = [i for i in available if i not in match_group]
                else:
                    #Remove first player if no match found
                    available.pop(0)
        
        # Cross-cluster matching if enabled
        if allow_cross_cluster:
            remaining = sorted([i for i in range(len(players)) if i not in matched_players],
                             key=lambda i: player_profiles[i]["theta"])
            
            while len(remaining) >= match_size:
                match_group = self._find_best_group_fast(
                    remaining, player_profiles, match_size, min_match_score
                )
                
                if match_group and len(match_group) == match_size:
                    matches.append({
                        "players": [players[i] for i in match_group],
                        "cluster": "cross_cluster",
                        "match_score": self._calculate_group_score(match_group, player_profiles),
                        "details": {"match_type": "optimized_cross_cluster"}
                    })
                    matched_players.update(match_group)
                    remaining = [i for i in remaining if i not in match_group]
                else:
                    remaining.pop(0)
        
        return matches
    
    # Find Best Group Fast: Optimized group matching
    # Strategy: 2 players → smallest theta diff, 3-5 players → lowest variance (O(n*m) vs exhaustive)
    def _find_best_group_fast(self, candidates: List[int], profiles: List[Dict], 
        match_size: int, min_score: float) -> Optional[List[int]]:
        """
        Fast heuristic for forming a match group. For 1v1 we just look at neighbors;
        for bigger team sizes we minimize theta variance across consecutive windows.
        """
       
        if len(candidates) < match_size:
            return None
        
        # For match_size=2, use simple nearest neighbor
        if match_size == 2:
            if len(candidates) < 2:
                return None
            #Find best pair by minimizing theta difference
            best_pair = [candidates[0], candidates[1]]
            min_diff = abs(profiles[candidates[0]]["theta"] - profiles[candidates[1]]["theta"])
            
            for i in range(len(candidates) - 1):
                diff = abs(profiles[candidates[i]]["theta"] - profiles[candidates[i+1]]["theta"])
                if diff < min_diff:
                    min_diff = diff
                    best_pair = [candidates[i], candidates[i+1]]
            
            #Calculate score
            score = 1.0 - min(min_diff, 1.0)
            if score >= min_score:
                return best_pair
            return None
        
        # For larger groups, use consecutive window approach
        # Select consecutive players with lowest variance
        best_group = None
        best_variance = float('inf')
        
        for start in range(len(candidates) - match_size + 1):
            group = candidates[start:start + match_size]
            thetas = [profiles[i]["theta"] for i in group]
            
            #Calculate variance (lower = more balanced)
            mean_theta = sum(thetas) / len(thetas)
            variance = sum((t - mean_theta) ** 2 for t in thetas) / len(thetas)
            
            if variance < best_variance:
                best_variance = variance
                best_group = group
        
        if best_group:
            score = 1.0 - min(best_variance * 4, 1.0)
            if score >= min_score:
                return best_group
        
        return None
    
    # Calculate Group Score: Converts skill variance to match quality (lower variance = higher score)
    def _calculate_group_score(self, group: List[int], profiles: List[Dict]) -> float:
        """Convert theta variance into a 0-1 match score."""
        if len(group) < 2:
            return 0.0
        
        thetas = [profiles[i]["theta"] for i in group]
        mean_theta = sum(thetas) / len(thetas)
        variance = sum((t - mean_theta) ** 2 for t in thetas) / len(thetas)
        
        # Lower variance = higher score
        return round(1.0 - min(variance * 4, 1.0), 3)
    
    def _find_optimal_match_group_legacy(
        self,
        primary_idx: int,
        candidate_indices: List[int],
        data_points: List[List[float]],
        centroids: List[List[float]],
        irt_data: List[Dict],
        match_size: int,
        min_score: float
    ) -> Optional[Dict]:

        if len(candidate_indices) < match_size - 1:
            return None
        
        # Get primary player info
        primary_info = irt_data[primary_idx]["_player_info"]
        
        # Evaluate all possible match combinations
        best_match = None
        best_score = -1.0
        
        # Generate combinations (optimized for small match sizes)
        if match_size == 2:
            # Simple 1v1 matching
            for candidate_idx in candidate_indices:
                match_result = find_best_match(
                    player_index=primary_idx,
                    data_points=data_points,
                    centroids=centroids,
                    rank_name=primary_info["rank_name"],
                    completed_achievements=primary_info["completed_achievements"],
                    success_count=primary_info["success_count"],
                    fail_count=primary_info["fail_count"]
                )
                
                match_idx = match_result.get("match_index")
                if match_idx == candidate_idx:
                    score = match_result.get("match_score", 0.0)
                    if score > best_score and score >= min_score:
                        best_score = score
                        best_match = {
                            "matched_indices": [primary_idx, candidate_idx],
                            "match_score": score,
                            "details": match_result
                        }
                        # Early termination if perfect match found
                        if score >= 0.95:
                            break
        else:
            # Multi-player matching (e.g., 2v2, 3v3)
            # For simplicity, select best candidates greedily
            selected = [primary_idx]
            remaining_candidates = candidate_indices.copy()
            
            while len(selected) < match_size and remaining_candidates:
                best_candidate = None
                best_candidate_score = -1.0
                
                for candidate_idx in remaining_candidates:
                    #Calculate average compatibility with already selected players
                    avg_score = 0.0
                    count = 0
                    
                    for selected_idx in selected:
                        candidate_info = irt_data[candidate_idx]["_player_info"]
                        match_result = find_best_match(
                            player_index=selected_idx,
                            data_points=data_points,
                            centroids=centroids,
                            rank_name=candidate_info["rank_name"],
                            completed_achievements=candidate_info["completed_achievements"],
                            success_count=candidate_info["success_count"],
                            fail_count=candidate_info["fail_count"]
                        )
                        
                        if match_result.get("match_index") == candidate_idx:
                            avg_score += match_result.get("match_score", 0.0)
                            count += 1
                    
                    if count > 0:
                        avg_score /= count
                        if avg_score > best_candidate_score:
                            best_candidate_score = avg_score
                            best_candidate = candidate_idx
                
                if best_candidate is not None and best_candidate_score >= min_score:
                    selected.append(best_candidate)
                    remaining_candidates.remove(best_candidate)
                else:
                    break
            
            if len(selected) == match_size:
                best_match = {
                    "matched_indices": selected,
                    "match_score": best_candidate_score if selected else 0.0,
                    "details": {"match_type": "multiplayer"}
                }
        
        return best_match
    
    def clear_cache(self):
        self._clustering_cache.clear()

# Convenience Functions
def create_matchmaker(k_clusters: int = 3) -> MultiplayerMatchmaker:
    return MultiplayerMatchmaker(k_clusters=k_clusters)


def quick_match(players: List[Dict], match_size: int = 2) -> List[Dict]:
    matchmaker = create_matchmaker()
    return matchmaker.find_matches(players, match_size=match_size)


