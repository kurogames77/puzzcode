-- Migration: Add preferred_difficulty tracking for adaptive difficulty switching
-- This allows the algorithm to switch students between Easy/Medium/Hard variants

-- Add preferred_difficulty column to student_progress
-- This tracks which difficulty variant (Easy/Medium/Hard) the student should use for the next level
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'student_progress' 
        AND column_name = 'preferred_difficulty'
    ) THEN
        ALTER TABLE student_progress 
        ADD COLUMN preferred_difficulty VARCHAR(10) CHECK (preferred_difficulty IN ('Easy', 'Medium', 'Hard'));
        
        -- Create index for faster lookups
        CREATE INDEX IF NOT EXISTS idx_student_progress_preferred_difficulty 
        ON student_progress(user_id, lesson_id, preferred_difficulty);
        
        RAISE NOTICE 'Added preferred_difficulty column to student_progress table';
    ELSE
        RAISE NOTICE 'preferred_difficulty column already exists in student_progress table';
    END IF;
END $$;

