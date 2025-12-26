-- ============================================================
-- Migration: Add Partitioning and Retention Policy
-- ============================================================
-- Implements table partitioning for puzzle_attempts by month
-- Sets up retention/archival policy for old data
-- ============================================================
-- NOTE: Partitioning requires careful planning. This migration
-- provides the structure but may need adjustment based on data volume.
-- ============================================================

-- Enable pg_partman extension if available (optional, for automatic partition management)
-- CREATE EXTENSION IF NOT EXISTS pg_partman;

-- For now, we'll create a partitioned table structure
-- If puzzle_attempts already has data, you'll need to migrate it

-- Step 1: Create a new partitioned table structure
-- We'll use monthly range partitioning on created_at

-- Check if partitioning is already set up
DO $$
DECLARE
    v_is_partitioned BOOLEAN;
BEGIN
    -- Check if puzzle_attempts is already partitioned
    SELECT EXISTS (
        SELECT 1 FROM pg_inherits 
        WHERE inhrelid = 'puzzle_attempts'::regclass
    ) INTO v_is_partitioned;
    
    -- If not partitioned and table exists, we'll create a partitioned version
    -- NOTE: This is a template. Actual migration requires data migration.
    -- For production, consider:
    -- 1. Create new partitioned table
    -- 2. Migrate data
    -- 3. Swap tables
    -- 4. Update application
    
    IF NOT v_is_partitioned THEN
        -- Create a function to manage partitions (monthly)
        CREATE OR REPLACE FUNCTION create_puzzle_attempts_partition(
            partition_date DATE
        )
        RETURNS VOID AS $$
        DECLARE
            v_partition_name TEXT;
            v_start_date DATE;
            v_end_date DATE;
        BEGIN
            v_start_date := date_trunc('month', partition_date);
            v_end_date := v_start_date + INTERVAL '1 month';
            v_partition_name := 'puzzle_attempts_' || to_char(v_start_date, 'YYYY_MM');
            
            -- Create partition if it doesn't exist
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS %I 
                PARTITION OF puzzle_attempts
                FOR VALUES FROM (%L) TO (%L)',
                v_partition_name,
                v_start_date,
                v_end_date
            );
            
            -- Create indexes on partition
            EXECUTE format('
                CREATE INDEX IF NOT EXISTS %I 
                ON %I(user_id, lesson_id, success, created_at DESC)',
                v_partition_name || '_user_lesson_idx',
                v_partition_name
            );
        END;
        $$ LANGUAGE plpgsql;
        
        COMMENT ON FUNCTION create_puzzle_attempts_partition IS 
        'Creates a monthly partition for puzzle_attempts. Call with date to create partition for that month.';
    END IF;
END $$;

-- Step 2: Create retention policy function
-- Archives or deletes old partitions (older than retention period)

CREATE OR REPLACE FUNCTION archive_old_puzzle_attempts(
    retention_months INTEGER DEFAULT 12
)
RETURNS TABLE(
    partition_name TEXT,
    partition_start DATE,
    rows_count BIGINT,
    action_taken TEXT
) AS $$
DECLARE
    v_cutoff_date DATE;
    v_partition_record RECORD;
    v_archive_table TEXT;
BEGIN
    v_cutoff_date := CURRENT_DATE - (retention_months || ' months')::INTERVAL;
    
    -- Find partitions older than cutoff
    FOR v_partition_record IN
        SELECT 
            schemaname,
            tablename,
            (regexp_match(tablename, '(\d{4}_\d{2})'))[1] as month_str
        FROM pg_tables
        WHERE tablename LIKE 'puzzle_attempts_%'
          AND tablename ~ '^\d{4}_\d{2}$'
    LOOP
        -- Parse date from partition name
        DECLARE
            v_partition_date DATE;
        BEGIN
            v_partition_date := to_date(v_partition_record.month_str, 'YYYY_MM');
            
            IF v_partition_date < v_cutoff_date THEN
                -- Option 1: Archive to separate table (recommended)
                v_archive_table := 'puzzle_attempts_archive_' || v_partition_record.month_str;
                
                -- Create archive table if it doesn't exist
                EXECUTE format('
                    CREATE TABLE IF NOT EXISTS %I (LIKE puzzle_attempts INCLUDING ALL)
                ', v_archive_table);
                
                -- Copy data to archive
                EXECUTE format('
                    INSERT INTO %I 
                    SELECT * FROM %I.%I
                ', v_archive_table, v_partition_record.schemaname, v_partition_record.tablename);
                
                -- Drop partition (data is archived)
                EXECUTE format('
                    DROP TABLE IF EXISTS %I.%I
                ', v_partition_record.schemaname, v_partition_record.tablename);
                
                -- Return result
                partition_name := v_partition_record.tablename;
                partition_start := v_partition_date;
                EXECUTE format('SELECT COUNT(*) FROM %I', v_archive_table) INTO rows_count;
                action_taken := 'archived';
                RETURN NEXT;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                -- Skip partitions that don't match expected format
                CONTINUE;
        END;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create function to set up initial partitions (for new installations)
CREATE OR REPLACE FUNCTION setup_puzzle_attempts_partitions(
    months_ahead INTEGER DEFAULT 3
)
RETURNS VOID AS $$
DECLARE
    v_month DATE;
    v_counter INTEGER := 0;
BEGIN
    -- Create partitions for current month and next N months
    v_month := date_trunc('month', CURRENT_DATE);
    
    FOR v_counter IN 0..months_ahead LOOP
        PERFORM create_puzzle_attempts_partition(v_month + (v_counter || ' months')::INTERVAL);
    END LOOP;
    
    -- Also create partition for previous month (in case of backfill)
    PERFORM create_puzzle_attempts_partition(v_month - INTERVAL '1 month');
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create scheduled job function (to be called by cron or pg_cron)
-- This ensures partitions are created ahead of time
CREATE OR REPLACE FUNCTION maintain_puzzle_attempts_partitions()
RETURNS VOID AS $$
BEGIN
    -- Create partition for next month if it doesn't exist
    PERFORM create_puzzle_attempts_partition(
        date_trunc('month', CURRENT_DATE + INTERVAL '1 month')
    );
    
    -- Optionally: Archive old partitions (uncomment if needed)
    -- PERFORM archive_old_puzzle_attempts(12); -- Keep 12 months
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON FUNCTION create_puzzle_attempts_partition IS 
'Creates a monthly partition for puzzle_attempts. Call monthly to create next partition.';

COMMENT ON FUNCTION archive_old_puzzle_attempts IS 
'Archives puzzle_attempts partitions older than retention_months. Returns list of archived partitions.';

COMMENT ON FUNCTION setup_puzzle_attempts_partitions IS 
'Initial setup: creates partitions for current month and next N months. Run once on new installations.';

COMMENT ON FUNCTION maintain_puzzle_attempts_partitions IS 
'Maintenance function: creates next month partition. Call monthly via cron or pg_cron.';

-- ============================================================
-- IMPORTANT NOTES:
-- ============================================================
-- 1. Partitioning requires converting existing puzzle_attempts table
--    This migration provides functions but doesn't automatically convert
-- 2. To enable partitioning on existing table:
--    a) Create new partitioned table
--    b) Migrate data
--    c) Swap tables
-- 3. For hash partitioning by user_id (alternative approach):
--    Use: PARTITION BY HASH (user_id) instead of RANGE (created_at)
-- 4. Set up pg_cron or external cron to call maintain_puzzle_attempts_partitions()
--    Example: SELECT cron.schedule('create-partitions', '0 0 1 * *', 'SELECT maintain_puzzle_attempts_partitions()');
-- ============================================================

