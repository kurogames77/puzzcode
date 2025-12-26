"""
KMeans_Cluster.py - K-Means Clustering Algorithm
--------------------------------------------------
Groups players into skill-based clusters for balanced matchmaking.

Algorithm: 1) Extract IRT features 2) Normalize to [0,1] 3) K-means++ init
           4) Assign to nearest centroid 5) Recompute centroids 6) Repeat until convergence

Key Functions: kmeans_from_irt(), init_kmeans_plus_plus(), normalize_data()
Returns: Centroids and cluster assignments
"""

import math
import random

# Vector Math Utilities: Distance calculations and centroid computation

# Euclidean Distance: sqrt(sum((a_i - b_i)^2)) - finds nearest centroid
def euclidean_distance(a, b):
    """Return Euclidean distance between two numeric vectors."""
    return math.sqrt(squared_distance(a, b))


# Squared Distance: Faster than euclidean (no sqrt) - preserves ordering for comparisons
def squared_distance(a, b):
    """Return squared Euclidean distance (cheaper than taking sqrt)."""
    total = 0.0
    for x, y in zip(a, b):
        d = x - y
        total += d * d
    return total


# Compute Centroid: Calculates cluster center (mean of all points in cluster)
def compute_centroid(points):
    """Compute the centroid for a list of k-dimensional points."""
    if not points:
        return []
    count = len(points)
    dim = len(points[0])
    # Efficient single pass through points; avoids repeatedly dividing inside loop
    centroid = [0.0] * dim
    for point in points:
        for i in range(dim):
            centroid[i] += point[i]
    inv_count = 1.0 / count
    return [centroid[i] * inv_count for i in range(dim)]


# Normalize Data: Scales features to [0,1] so all features contribute equally to distance
def normalize_data(data):
    """
    Normalize each dimension of the dataset to [0, 1].
    Keeps clustering stable even when theta/beta/success rates are on
    different numeric scales.
    """
    if not data:
        return data

    dims = len(data[0])
    mins = list(data[0])
    maxs = list(data[0])

    # Single pass to find min/max per dimension.
    for pt in data[1:]:
        for i in range(dims):
            if pt[i] < mins[i]:
                mins[i] = pt[i]
            if pt[i] > maxs[i]:
                maxs[i] = pt[i]

    norm_data = []
    ranges = [maxs[i] - mins[i] for i in range(dims)]

    for pt in data:
        scaled = [
            0.0 if ranges[i] == 0.0 else (pt[i] - mins[i]) / ranges[i]
            for i in range(dims)
        ]
        norm_data.append(scaled)

    return norm_data


# K-Means++ Init: Smart centroid initialization (better than random)
# Picks centroids far apart to avoid poor local minima
def init_kmeans_plus_plus(data, k):
    """
    Initialize centroids using the k-means++ heuristic; this keeps clusters stable
    even when player distributions are skewed.
    """
    if not data:
        return []

    n = len(data)
    if k >= n:
        return data.copy()

    centroids = [random.choice(data)]

    while len(centroids) < k:
        min_dist_sq = []
        for pt in data:
            min_sq = float('inf')
            for c in centroids:
                sq_dist = squared_distance(pt, c)
                if sq_dist < min_sq:
                    min_sq = sq_dist
            min_dist_sq.append(min_sq)

        total = sum(min_dist_sq)
        if total == 0 or total < 1e-10:
            remaining = [pt for pt in data if pt not in centroids]
            if remaining:
                centroids.append(random.choice(remaining))
            break

        r = random.random() * total
        cumulative = 0.0
        for i, d in enumerate(min_dist_sq):
            cumulative += d
            if r <= cumulative:
                centroids.append(data[i])
                break
        else:
            centroids.append(data[-1])

    return centroids

# Main Clustering Function: Groups players into k skill-based clusters
def kmeans_from_irt(irt_data, k=3, max_iter=100, tol=1e-4, verbose=False):
    """
    K-Means Clustering from IRT Data
    Process: Extract features → Normalize → K-means++ init → Iterate (assign/recompute) → Converge
    Returns: centroids, assignments, cluster_count, converged_after
    """

    # Convert IRT rows into numeric feature vectors composed of
    # adjusted_theta, probability, success_rate, and fail_rate.
    data_points = [
        [
            item.get("adjusted_theta", 0.0),
            item.get("probability", 0.0),
            item.get("success_rate", 0.0),
            item.get("fail_rate", 0.0)
        ]
        for item in irt_data
    ]

    if not data_points:
        raise ValueError("IRT data is empty. Cannot perform K-Means clustering.")

    # Normalize features to neutralize scale differences.
    data_points = normalize_data(data_points)

    # Initialize centroids via k-means++ for better convergence.
    centroids = init_kmeans_plus_plus(data_points, k)

    # Standard k-means loop with early stopping when centroids barely move.
    assignments = []
    for iteration in range(max_iter):
        clusters = [[] for _ in range(k)]
        
        # Assign each data point to the nearest centroid.
        assignments = []
        for pt in data_points:
            min_dist_sq = float('inf')
            nearest = 0
            for idx, centroid in enumerate(centroids):
                dist_sq = squared_distance(pt, centroid)
                if dist_sq < min_dist_sq:
                    min_dist_sq = dist_sq
                    nearest = idx
            assignments.append(nearest)
            clusters[nearest].append(pt)

        # Rebuild centroids for the new clusters.
        new_centroids = []
        for c in clusters:
            if c:
                new_centroids.append(compute_centroid(c))
            else:
                # Empty cluster: reinitialize randomly to keep k clusters alive.
                new_centroids.append(random.choice(data_points))

        # Measure shift; if tiny we consider the algorithm converged.
        shift_sq = sum(squared_distance(a, b) for a, b in zip(centroids, new_centroids))
        
        # Early convergence check.
        if shift_sq < (tol * tol):
            if verbose:
                print(f"[INFO] K-Means converged after {iteration + 1} iterations")
            break

        centroids = new_centroids
        
        #Additional early stopping: if shift is very small after few iterations
        if iteration > 5 and shift_sq < (tol * tol * 10):
            break

    else:
        if verbose:
            print("[WARNING] K-Means did not converge within max iterations.")

    return {
        "centroids": centroids,
        "assignments": assignments,
        "cluster_count": k,
        "converged_after": iteration + 1
    }
