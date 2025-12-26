-- Adds cache metadata columns for leaderboardentry so it can back the API
ALTER TABLE leaderboardentry
    ADD COLUMN IF NOT EXISTS board_type VARCHAR(20) NOT NULL DEFAULT 'overall'
        CHECK (board_type IN ('overall', 'multiplayer', 'achievements', 'streaks')),
    ADD COLUMN IF NOT EXISTS rank_index INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS levels_completed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leaderboardentry_board_type
    ON leaderboardentry(board_type, rank_position);

