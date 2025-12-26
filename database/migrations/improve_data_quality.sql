-- ============================================================
-- Migration: Improve Data Quality
-- ============================================================
-- Adds NOT NULL constraints, defaults, and generated columns
-- Ensures data consistency and prevents NULL issues
-- ============================================================

-- Add NOT NULL constraints where appropriate (only if column doesn't have NULL values)
-- We'll use ALTER COLUMN SET NOT NULL with a check first

-- puzzle_attempts.success should never be NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'puzzle_attempts' AND column_name = 'success'
    ) THEN
        -- Check if there are any NULL values
        IF NOT EXISTS (SELECT 1 FROM puzzle_attempts WHERE success IS NULL) THEN
            ALTER TABLE puzzle_attempts ALTER COLUMN success SET NOT NULL;
        END IF;
    END IF;
END $$;

-- student_progress defaults (ensure critical fields have defaults)
DO $$
BEGIN
    -- Ensure success_count, fail_count, total_attempts have defaults
    ALTER TABLE student_progress 
    ALTER COLUMN success_count SET DEFAULT 0,
    ALTER COLUMN fail_count SET DEFAULT 0,
    ALTER COLUMN total_attempts SET DEFAULT 0,
    ALTER COLUMN sessions_played SET DEFAULT 1;
    
    -- Ensure theta and beta have defaults
    ALTER TABLE student_progress 
    ALTER COLUMN theta SET DEFAULT 0.0,
    ALTER COLUMN beta SET DEFAULT 0.5;
END $$;

-- Add generated column for difficulty band from beta (optional, for consistency)
-- This ensures difficulty_label always matches beta value
DO $$
BEGIN
    -- Check if column doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'student_progress' AND column_name = 'difficulty_band'
    ) THEN
        ALTER TABLE student_progress
        ADD COLUMN difficulty_band VARCHAR(10) GENERATED ALWAYS AS (
            CASE 
                WHEN beta IS NULL THEN NULL
                WHEN beta < 0.4 THEN 'Easy'
                WHEN beta < 0.7 THEN 'Medium'
                ELSE 'Hard'
            END
        ) STORED;
        
        CREATE INDEX IF NOT EXISTS idx_student_progress_difficulty_band 
        ON student_progress(difficulty_band);
        
        COMMENT ON COLUMN student_progress.difficulty_band IS 
        'Generated column: difficulty band derived from beta value (Easy < 0.4, Medium < 0.7, Hard >= 0.7)';
    END IF;
END $$;

-- Add attempt_id column to puzzle_attempts if it doesn't exist (for idempotency)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'puzzle_attempts' AND column_name = 'attempt_id'
    ) THEN
        ALTER TABLE puzzle_attempts
        ADD COLUMN attempt_id VARCHAR(128);
        
        -- Add unique index for idempotency (allows NULL)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzle_attempts_attempt_id_user 
        ON puzzle_attempts(attempt_id, user_id) 
        WHERE attempt_id IS NOT NULL;
        
        COMMENT ON COLUMN puzzle_attempts.attempt_id IS 
        'Idempotency key: prevents duplicate writes on retries. Unique per user.';
    END IF;
END $$;

-- Ensure updated_at is set on student_progress updates
-- (This should already exist, but ensure it's there)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_student_progress_updated_at'
    ) THEN
        CREATE TRIGGER update_student_progress_updated_at
        BEFORE UPDATE ON student_progress
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Add check to ensure total_attempts = success_count + fail_count (data integrity)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_progress_attempts_consistency_check'
    ) THEN
        ALTER TABLE student_progress
        ADD CONSTRAINT student_progress_attempts_consistency_check
        CHECK (total_attempts >= (success_count + fail_count));
    END IF;
END $$;

-- Add check for attempt_time range (reasonable bounds)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'puzzle_attempts_attempt_time_range_check'
    ) THEN
        ALTER TABLE puzzle_attempts
        ADD CONSTRAINT puzzle_attempts_attempt_time_range_check
        CHECK (attempt_time IS NULL OR (attempt_time >= 0 AND attempt_time <= 3600));
    END IF;
END $$;

-- Ensure levels.beta has a default if column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'levels' AND column_name = 'beta'
    ) THEN
        -- Set default beta based on difficulty if not set
        UPDATE levels 
        SET beta = CASE 
            WHEN difficulty = 'Easy' THEN 0.3
            WHEN difficulty = 'Medium' THEN 0.5
            WHEN difficulty = 'Hard' THEN 0.8
            ELSE 0.5
        END
        WHERE beta IS NULL;
        
        -- Add default for future inserts
        ALTER TABLE levels 
        ALTER COLUMN beta SET DEFAULT 0.5;
    END IF;
END $$;

-- Comments for documentation
COMMENT ON CONSTRAINT student_progress_attempts_consistency_check ON student_progress IS 
'Ensures total_attempts is at least the sum of success_count and fail_count';

COMMENT ON CONSTRAINT puzzle_attempts_attempt_time_range_check ON puzzle_attempts IS 
'Ensures attempt_time is between 0 and 3600 seconds (1 hour max)';

