
from functools import lru_cache
from threading import Lock
from RankBases.EXP import get_normalized_exp, PlayerEXP


# Configuration
RANK_LEVELS = (
    "novice",
    "apprentice",
    "bronze_coder",
    "silver_coder",
    "gold_developer",
    "platinum_engineer",
    "diamond_hacker",
    "master_coder",
    "grandmaster_dev",
    "code_overlord"
)

_TOTAL_RANKS = len(RANK_LEVELS) - 1

# Precomputed normalized thresholds for each rank
# Using exponential curve (power of 1.6) to make higher ranks require more EXP
# This slows down ranking progression, especially for higher ranks
RANK_POWER = 1.6  # Higher values = slower progression (1.0 = linear, 2.0 = quadratic)
RANK_THRESHOLDS = tuple(
    round((i / _TOTAL_RANKS) ** RANK_POWER, 4) if i > 0 else 0.0
    for i in range(len(RANK_LEVELS))
)

#Bias table (precomputed for speed)
RANK_BIAS = (
    -0.05,  
    -0.05,  
    -0.03,  
    0.0,    
    0.0,    
    0.03,   
    0.03,   
    0.05,   
    0.06,   
    0.07,   
)

#  Direct index and reverse lookup maps
_RANK_INDEX = {name: i for i, name in enumerate(RANK_LEVELS)}
_RANK_FROM_INDEX = tuple(RANK_LEVELS)

#  Thread lock for rank updates 
_rank_lock = Lock()



# Rank Retrieval
@lru_cache(maxsize=None)
def get_rank_value(rank_name: str) -> tuple[float, float]:
    """Return normalized rank value and bias (cached O(1))."""
    if not isinstance(rank_name, str):
        raise TypeError("rank_name must be a string.")
    key = rank_name.strip().lower().replace(" ", "_")
    idx = _RANK_INDEX.get(key, 0)
    return RANK_THRESHOLDS[idx], RANK_BIAS[idx]


def get_rank_name(rank_value: float) -> str:
    """Return rank name from normalized EXP (0.0–1.0) (optimized)."""
    if not isinstance(rank_value, (int, float)):
        raise TypeError("rank_value must be numeric.")
    # Find the highest rank threshold that the value meets or exceeds
    # Since thresholds are now non-linear, we need to check each threshold
    idx = 0
    for i in range(len(RANK_THRESHOLDS) - 1, -1, -1):
        if rank_value >= RANK_THRESHOLDS[i]:
            idx = i
            break
    idx = 0 if idx < 0 else (_TOTAL_RANKS if idx > _TOTAL_RANKS else idx)
    return _RANK_FROM_INDEX[idx]



# PlayerRank Class
class PlayerRank:
    """
    Ultra-fast player rank tracker.
    Compatible with EXP system for auto-updates.
    """

    __slots__ = ("player_name", "_rank_index", "_locked")

    def __init__(self, player_name: str):
        self.player_name = player_name
        self._rank_index = 0
        self._locked = False  

   
    # Rank Management
    def set_rank(self, rank_name: str) -> None:
        """Sets rank directly by name (thread-safe)."""
        key = rank_name.strip().lower().replace(" ", "_")
        with _rank_lock:
            self._rank_index = _RANK_INDEX.get(key, 0)

    def promote(self, steps: int = 1) -> None:
        """Moves player up the rank ladder (thread-safe)."""
        if self._locked:
            return
        with _rank_lock:
            self._rank_index = min(self._rank_index + steps, _TOTAL_RANKS)

    def demote(self, steps: int = 1) -> None:
        """Moves player down the rank ladder (thread-safe)."""
        if self._locked:
            return
        with _rank_lock:
            self._rank_index = max(self._rank_index - steps, 0)

    def lock_rank(self, state: bool = True) -> None:
        """Prevents frequent rank changes."""
        self._locked = state

  
    # Rank Calculation from EXP

    def update_from_exp(self, normalized_exp: float) -> None:
        """
        Sync rank with normalized EXP (0.0–1.0).
        Uses threshold lookup to find appropriate rank based on non-linear thresholds.
        """
        if not isinstance(normalized_exp, (int, float)):
            raise TypeError("normalized_exp must be numeric.")
        with _rank_lock:
            # Find the highest rank threshold that the value meets or exceeds
            idx = 0
            for i in range(len(RANK_THRESHOLDS) - 1, -1, -1):
                if normalized_exp >= RANK_THRESHOLDS[i]:
                    idx = i
                    break
            self._rank_index = max(0, min(idx, _TOTAL_RANKS))

    def update_from_player_exp(self, player_exp: PlayerEXP) -> None:
        """
        Sync rank directly from a PlayerEXP instance.
        Automatically normalizes EXP and updates rank accordingly.
        
        Args:
            player_exp (PlayerEXP): PlayerEXP instance to sync from.
        """
        if not isinstance(player_exp, PlayerEXP):
            raise TypeError("player_exp must be a PlayerEXP instance.")
        normalized_exp = get_normalized_exp(player_exp.exp)
        self.update_from_exp(normalized_exp)


    # Rank Information

    def get_status(self) -> dict:
        """Return rank data with bias and EXP ratio."""
        rank_name = _RANK_FROM_INDEX[self._rank_index]
        rank_value, bias = get_rank_value(rank_name)
        return {
            "player": self.player_name,
            "rank": rank_name,
            "rank_index": self._rank_index,
            "rank_value": round(rank_value, 4),
            "bias": round(bias, 4),
            "locked": self._locked
        }

    def __repr__(self):
        return f"<PlayerRank {self.player_name}: {RANK_LEVELS[self._rank_index].title()}>"



# Compatibility Wrapper Function


def get_rank_data(user_id: str, player_exp: PlayerEXP = None) -> tuple[str, float]:
    """
    Fast wrapper function for rank data retrieval.
    Returns (rank_name, rank_bonus) for backward compatibility.
    
    Args:
        user_id (str): Player identifier (not used in simplified version).
        player_exp (PlayerEXP, optional): PlayerEXP instance to determine rank from EXP.
    
    Returns:
        tuple: (rank_name, bias_value)
    """
    # If PlayerEXP is provided, use it to determine rank
    if player_exp is not None:
        if not isinstance(player_exp, PlayerEXP):
            raise TypeError("player_exp must be a PlayerEXP instance.")
        normalized_exp = get_normalized_exp(player_exp.exp)
        rank_name = get_rank_name(normalized_exp)
        _, bias = get_rank_value(rank_name)
        return rank_name, bias
    
    # Default to novice rank if user_id lookup not implemented
    # In a full implementation, you'd look up the user's actual rank
    rank_name = RANK_LEVELS[0]
    _, bias = get_rank_value(rank_name)
    return rank_name, bias


def get_rank_from_exp(exp: int) -> tuple[str, float]:
    """
    Helper function to get rank directly from EXP value.
    
    Args:
        exp (int): Total EXP value.
    
    Returns:
        tuple: (rank_name, bias_value)
    """
    normalized_exp = get_normalized_exp(exp)
    rank_name = get_rank_name(normalized_exp)
    _, bias = get_rank_value(rank_name)
    return rank_name, bias