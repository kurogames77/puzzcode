-- Migration: Add difficulty column to lessons table
-- Run this if your database already exists and doesn't have the difficulty column

-- Add difficulty column to lessons table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'lessons' 
        AND column_name = 'difficulty'
    ) THEN
        ALTER TABLE lessons 
        ADD COLUMN difficulty VARCHAR(20) NOT NULL DEFAULT 'Beginner' 
        CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced'));
        
        RAISE NOTICE 'Added difficulty column to lessons table';
    ELSE
        RAISE NOTICE 'difficulty column already exists in lessons table';
    END IF;
END $$;

