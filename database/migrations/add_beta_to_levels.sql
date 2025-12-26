-- ============================================================
-- Migration: Add beta column to levels table
-- ============================================================
-- Adds admin-defined difficulty beta values to each puzzle level
-- Beta values represent difficulty: Easy = 0.2, Medium = 0.5, Hard = 0.8
-- ============================================================

-- Add beta column to levels table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'levels' AND column_name = 'beta'
    ) THEN
        ALTER TABLE levels 
        ADD COLUMN beta FLOAT DEFAULT 0.5 CHECK (beta >= 0.1 AND beta <= 1.0);
        
        -- Set default beta values based on existing difficulty labels
        UPDATE levels SET beta = 0.2 WHERE difficulty = 'Easy' AND beta = 0.5;
        UPDATE levels SET beta = 0.5 WHERE difficulty = 'Medium' AND beta = 0.5;
        UPDATE levels SET beta = 0.8 WHERE difficulty = 'Hard' AND beta = 0.5;
        
        -- Add comment for documentation
        COMMENT ON COLUMN levels.beta IS 'Admin-defined difficulty parameter (beta) for IRT/DDA algorithms: 0.1-1.0 (Easy=0.2, Medium=0.5, Hard=0.8)';
        
        RAISE NOTICE 'Added beta column to levels table with default values';
    ELSE
        RAISE NOTICE 'beta column already exists in levels table';
    END IF;
END $$;

