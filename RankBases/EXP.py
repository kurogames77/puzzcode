from functools import lru_cache
from time import time


# Configuration
MAX_EXP = 10000             
BASE_EXP_GAIN = 50          
DIFFICULTY_MULTIPLIER = (1.0, 1.25, 1.5, 2.0)  
MIN_BATTLE_EXP_COST = 100    
BATTLE_PENALTY_NO_CODE = 100

# Lesson configuration
LESSON_LEVELS = 10
LESSON_POINTS = 20
MID_LEVEL_BONUS = 40
FINAL_LEVEL_BONUS = 50

# Anti-EXP-farming settings
ANTI_FARM_COOLDOWN = 60     

# Precompute EXP thresholds for fast lookup
_EXP_THRESHOLDS = tuple(i / 10 for i in range(11))  



# Core EXP Computation


@lru_cache(maxsize=None)
def calculate_exp_gain(success: bool, difficulty_level: int = 1, streak: int = 0) -> int:
    """Computes gained EXP from a single puzzle attempt."""
    if not isinstance(success, bool):
        raise TypeError("success must be a boolean value.")
    if not (0 <= difficulty_level < len(DIFFICULTY_MULTIPLIER)):
        raise ValueError("difficulty_level must be between 0–3.")
    if streak < 0:
        streak = 0

    if success:
        return int(BASE_EXP_GAIN * DIFFICULTY_MULTIPLIER[difficulty_level] * (1 + 0.05 * streak))
    else:
        return 0  


@lru_cache(maxsize=MAX_EXP + 1)
def get_normalized_exp(exp: int) -> float:
    """Normalizes total EXP into a 0.0–1.0 scale."""
    if not isinstance(exp, int):
        raise TypeError("exp must be an integer.")
    if exp < 0:
        exp = 0
    elif exp > MAX_EXP:
        exp = MAX_EXP
    return exp / MAX_EXP



# PlayerEXP Tracker Class
class PlayerEXP:
    """Lightweight player EXP tracker with anti-farming and reward systems."""

    __slots__ = ("player_name", "exp", "level", "recent_opponents", "_last_battle_time")

    def __init__(self, player_name: str):
        self.player_name = player_name
        self.exp = 0
        self.level = 0
        self.recent_opponents = set()
        self._last_battle_time = 0.0


    # EXP Management
    def gain(self, amount: int) -> None:
        """Adds EXP and clamps to MAX_EXP."""
        if amount <= 0:
            return
        self.exp += amount
        if self.exp > MAX_EXP:
            self.exp = MAX_EXP
        self._update_level()

    def lose(self, amount: int) -> None:
        """Subtracts EXP safely (non-negative)."""
        if amount <= 0:
            return
        self.exp -= amount
        if self.exp < 0:
            self.exp = 0
        self._update_level()

    def _update_level(self) -> None:
        """Updates internal level based on current EXP (optimized)."""
        # Avoid division by precomputing inverse
        ratio = self.exp * (10.0 / MAX_EXP)
        self.level = min(int(ratio), 10)

    def get_status(self) -> dict:
        """Returns current EXP info for the player."""
        normalized = get_normalized_exp(self.exp)
        return {
            "player": self.player_name,
            "exp": self.exp,
            "normalized_exp": round(normalized, 4),
            "level": self.level
        }


    # Multiplayer Battle System (with Anti-Farming)
    @staticmethod
    def start_battle(players: list["PlayerEXP"], winner_indices: list[int], completed_code_flags: list[bool]):
        """
        Handles EXP transfer in a 1v1 or multiplayer battle.
        Implements anti-farming, code completion checks, and penalties.

        Args:
            players (list[PlayerEXP]): All participants.
            winner_indices (list[int]): Indices of players who won.
            completed_code_flags (list[bool]): Whether each player finished the code.
        """
        if not players or len(players) < 2:
            raise ValueError("At least 2 players are required for a battle.")
        if len(players) != len(completed_code_flags):
            raise ValueError("Each player must have a code completion flag.")
        if not all(isinstance(p, PlayerEXP) for p in players):
            raise TypeError("All participants must be PlayerEXP instances.")

        # Anti-farm check: prevent immediate rematch EXP abuse (optimized)
        now = time()
        for p in players:
            if p._last_battle_time > 0:
                elapsed = now - p._last_battle_time
                if elapsed < ANTI_FARM_COOLDOWN:
                    for opponent in players:
                        if opponent.player_name != p.player_name and opponent.player_name in p.recent_opponents:
                            raise ValueError(
                                f"Anti-Farming: {p.player_name} recently battled {opponent.player_name}. Please wait {int(ANTI_FARM_COOLDOWN - elapsed)}s."
                            )

        # Deduct wagers and apply penalties
        total_pool = 0
        for i, p in enumerate(players):
            wager = max(int(p.exp * 0.05), MIN_BATTLE_EXP_COST)
            p.lose(wager)
            total_pool += wager

            # Penalty for not finishing code
            if not completed_code_flags[i]:
                p.lose(BATTLE_PENALTY_NO_CODE)

        # Only winners who completed code receive EXP
        if not winner_indices:
            return

        share = total_pool // len(winner_indices)
        for idx in winner_indices:
            if 0 <= idx < len(players) and completed_code_flags[idx]:
                players[idx].gain(share)

        # Record battle timestamp for anti-farming
        for p in players:
            p._last_battle_time = now
            p.recent_opponents = {op.player_name for op in players if op.player_name != p.player_name}

  
    # Lesson System


    def complete_lesson(self, levels_completed: int, finished_in_time: bool = True, skipped_levels: list[int] = None) -> int:
        """Computes EXP gained from completing a lesson with multiple levels."""
        if levels_completed < 0 or levels_completed > LESSON_LEVELS:
            raise ValueError(f"levels_completed must be between 0 and {LESSON_LEVELS}")

        skipped_levels = set(skipped_levels or [])
        total_exp_gain = 0

        # Optimize level loop - check skip set once per level
        for level in range(1, levels_completed + 1):
            if level in skipped_levels:
                continue
            # Precompute constants for efficiency
            mid_level = LESSON_LEVELS // 2
            if level == mid_level:
                points = MID_LEVEL_BONUS
            elif level == LESSON_LEVELS:
                points = FINAL_LEVEL_BONUS
            else:
                points = LESSON_POINTS
            total_exp_gain += points

        # Keep only the earned EXP even if not finished in time
        if not finished_in_time:
            total_exp_gain = int(total_exp_gain * 1.0)

        self.gain(total_exp_gain)
        return total_exp_gain


    # Achievement EXP System


    def gain_from_achievement(self, tier: str) -> int:
        """Awards EXP based on achievement tier."""
        rewards = {
            "bronze": 50,
            "silver": 100,
            "gold": 200,
            "platinum": 300
        }
        gained = rewards.get(tier.lower(), 0)
        self.gain(gained)
        return gained


    # Utility


    def __repr__(self):
        return f"<PlayerEXP {self.player_name}: {self.exp} EXP, Lvl {self.level}>"
