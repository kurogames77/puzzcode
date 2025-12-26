-- ============================================================
-- Migration: Add Constraints and Foreign Keys
-- ============================================================
-- Ensures referential integrity and data quality:
-- - Foreign keys across puzzle_attempts and student_progress
-- - CHECK constraints for valid difficulty labels
-- - Consider ENUM types for difficulty (optional, can use CHECK instead)
-- ============================================================

-- Ensure puzzle_attempts has all required foreign keys
-- Note: These may already exist, but we'll use IF NOT EXISTS pattern

-- Verify and add FK for puzzle_attempts.user_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'puzzle_attempts_user_id_fkey'
    ) THEN
        ALTER TABLE puzzle_attempts
        ADD CONSTRAINT puzzle_attempts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Verify and add FK for puzzle_attempts.level_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'puzzle_attempts_level_id_fkey'
    ) THEN
        ALTER TABLE puzzle_attempts
        ADD CONSTRAINT puzzle_attempts_level_id_fkey
        FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Verify and add FK for puzzle_attempts.lesson_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'puzzle_attempts_lesson_id_fkey'
    ) THEN
        ALTER TABLE puzzle_attempts
        ADD CONSTRAINT puzzle_attempts_lesson_id_fkey
        FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Verify and add FK for student_progress.user_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_user_id_fkey'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Verify and add FK for student_progress.level_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_level_id_fkey'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_level_id_fkey
        FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Verify and add FK for student_progress.lesson_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_lesson_id_fkey'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_lesson_id_fkey
        FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add CHECK constraint for difficulty_label in puzzle_attempts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'puzzle_attempts_difficulty_check'
    ) THEN
        ALTER TABLE puzzle_attempts
        ADD CONSTRAINT puzzle_attempts_difficulty_check
        CHECK (difficulty_label IS NULL OR difficulty_label IN ('Easy', 'Medium', 'Hard'));
    END IF;
END $$;

-- Add CHECK constraint for difficulty in adaptive_log
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'adaptive_log_difficulty_before_check'
    ) THEN
        ALTER TABLE adaptive_log
        ADD CONSTRAINT adaptive_log_difficulty_before_check
        CHECK (difficulty_before IS NULL OR difficulty_before IN ('Easy', 'Medium', 'Hard'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'adaptive_log_difficulty_after_check'
    ) THEN
        ALTER TABLE adaptive_log
        ADD CONSTRAINT adaptive_log_difficulty_after_check
        CHECK (difficulty_after IS NULL OR difficulty_after IN ('Easy', 'Medium', 'Hard'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'adaptive_log_next_difficulty_check'
    ) THEN
        ALTER TABLE adaptive_log
        ADD CONSTRAINT adaptive_log_next_difficulty_check
        CHECK (next_difficulty IS NULL OR next_difficulty IN ('Easy', 'Medium', 'Hard'));
    END IF;
END $$;

-- Add CHECK constraint for preferred_difficulty in student_progress (if column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'student_progress' AND column_name = 'preferred_difficulty'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_preferred_difficulty_check'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_preferred_difficulty_check
        CHECK (preferred_difficulty IS NULL OR preferred_difficulty IN ('Easy', 'Medium', 'Hard'));
    END IF;
END $$;

-- Add CHECK constraints for numeric ranges
-- Beta should be between 0.1 and 1.0
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_beta_range_check'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_beta_range_check
        CHECK (beta IS NULL OR (beta >= 0.1 AND beta <= 1.0));
    END IF;
END $$;

-- Theta should be between -3.0 and 3.0
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_theta_range_check'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_theta_range_check
        CHECK (theta IS NULL OR (theta >= -3.0 AND theta <= 3.0));
    END IF;
END $$;

-- Success/fail counts should be non-negative
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_counts_nonnegative_check'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_counts_nonnegative_check
        CHECK (
            success_count >= 0 AND 
            fail_count >= 0 AND 
            total_attempts >= 0 AND
            sessions_played >= 0
        );
    END IF;
END $$;

-- Attempt time should be positive if provided
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'puzzle_attempts_attempt_time_check'
    ) THEN
        ALTER TABLE puzzle_attempts
        ADD CONSTRAINT puzzle_attempts_attempt_time_check
        CHECK (attempt_time IS NULL OR attempt_time > 0);
    END IF;
END $$;

-- Comments for documentation
COMMENT ON CONSTRAINT puzzle_attempts_difficulty_check ON puzzle_attempts IS 
'Ensures difficulty_label is one of: Easy, Medium, Hard';

COMMENT ON CONSTRAINT student_progress_beta_range_check ON student_progress IS 
'Ensures beta (difficulty) is between 0.1 (easy) and 1.0 (hard)';

COMMENT ON CONSTRAINT student_progress_theta_range_check ON student_progress IS 
'Ensures theta (ability) is between -3.0 (low) and 3.0 (high)';

