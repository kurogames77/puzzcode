-- ============================================================
-- Migration: Add Performance Indexes
-- ============================================================
-- Adds composite indexes for common query patterns:
-- - puzzle_attempts: (user_id, lesson_id, success, created_at)
-- - levels: (lesson_id, level_number)
-- - student_progress: (user_id, level_id) - already exists but ensure it's optimal
-- ============================================================

-- Composite index for puzzle_attempts queries filtering by user, lesson, success, and time
-- Used for: "Get recent successes per lesson" queries (5/8-level checks)
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_lesson_success_created 
ON puzzle_attempts(user_id, lesson_id, success, created_at DESC)
WHERE success = TRUE;

-- Alternative index for all attempts (not just successes) with same pattern
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_lesson_created 
ON puzzle_attempts(user_id, lesson_id, created_at DESC);

-- Index for levels lookup by lesson and level number (for next level queries)
-- Note: This may already exist as idx_levels_lesson_level_difficulty, but we need one without difficulty
CREATE INDEX IF NOT EXISTS idx_levels_lesson_level_number 
ON levels(lesson_id, level_number);

-- Ensure student_progress has optimal index for user_id + level_id lookups
-- This supports the SELECT ... FOR UPDATE pattern used in puzzle.js
CREATE INDEX IF NOT EXISTS idx_student_progress_user_level_composite 
ON student_progress(user_id, level_id);

-- Index for lesson-based progress queries
CREATE INDEX IF NOT EXISTS idx_student_progress_user_lesson 
ON student_progress(user_id, lesson_id);

-- Index for adaptive_log queries by user and lesson
CREATE INDEX IF NOT EXISTS idx_adaptive_log_user_lesson_created 
ON adaptive_log(user_id, lesson_id, created_at DESC);

-- Comments for documentation
COMMENT ON INDEX idx_puzzle_attempts_user_lesson_success_created IS 
'Composite index for efficient queries of recent successful attempts per user per lesson';

COMMENT ON INDEX idx_levels_lesson_level_number IS 
'Index for finding levels by lesson and level number (for progression queries)';

