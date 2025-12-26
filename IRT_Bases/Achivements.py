
from functools import lru_cache
TOTAL_ACHIEVEMENTS = 30

BIAS_THRESHOLDS = (
    (0.25, 0.00),
    (0.50, 0.02),
    (0.75, 0.05),
    (0.90, 0.08),
    (1.01, 0.12)
)

# This avoids computing progress thresholds every time
_BIAS_MAP = [0.0] * (TOTAL_ACHIEVEMENTS + 1)
for i in range(TOTAL_ACHIEVEMENTS + 1):
    progress = i / TOTAL_ACHIEVEMENTS
    for threshold, bias in BIAS_THRESHOLDS:
        if progress < threshold:
            _BIAS_MAP[i] = bias
            break


@lru_cache(maxsize=TOTAL_ACHIEVEMENTS + 1)
def get_achievement_value(completed: int) -> tuple[float, float]:
    """
    Fast retrieval of achievement progress and bias.
    Uses precomputed bias table and cached lookups.
    """
    if not isinstance(completed, int):
        raise TypeError(f"Expected int for 'completed', got {type(completed).__name__}")

    # Clamp and lookup precomputed bias
    if completed < 0:
        completed = 0
    elif completed > TOTAL_ACHIEVEMENTS:
        completed = TOTAL_ACHIEVEMENTS

    progress = completed / TOTAL_ACHIEVEMENTS
    bias = _BIAS_MAP[completed]
    return progress, bias



# Lightweight PlayerAchievement tracker
class PlayerAchievement:
    """
    Extremely lightweight player achievement tracker.
    Designed for high-frequency updates.
    """

    __slots__ = ("player_name", "completed")  
    def __init__(self, player_name: str):
        self.player_name = player_name
        self.completed = 0

    def add_achievement(self, count: int = 1) -> None:
        """Adds achievements (clamped for safety)."""
        total = self.completed + count
        if total > TOTAL_ACHIEVEMENTS:
            total = TOTAL_ACHIEVEMENTS
        elif total < 0:
            total = 0
        self.completed = total

    def reset(self) -> None:
        """Instant reset (no overhead)."""
        self.completed = 0

    def get_status(self) -> dict:
        """Returns fast cached status lookup."""
        progress, bias = get_achievement_value(self.completed)
        return {
            "player": self.player_name,
            "completed": self.completed,
            "progress": round(progress * 100, 2),
            "bias": round(bias, 4)
        }


# Compatibility Wrapper Function
def get_achievement_score(user_id: str) -> int:
    """
    Fast wrapper function for achievement score retrieval.
    Returns achievement count for backward compatibility.
    
    Args:
        user_id (str): Player identifier (not used in simplified version).
    
    Returns:
        int: Achievement score (defaults to 0, would look up user's actual count in full implementation)
    """
    return 0