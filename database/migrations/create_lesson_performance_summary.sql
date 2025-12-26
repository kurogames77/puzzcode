-- ============================================================
-- Migration: Create Lesson Performance Summary Table
-- ============================================================
-- Creates a materialized summary table to cache recent completions per lesson
-- This speeds up 5/8-level checks by avoiding heavy query patterns
-- Updated via triggers on puzzle_attempts
-- ============================================================

-- Table to store rolling summaries of recent successes per lesson
CREATE TABLE IF NOT EXISTS lesson_performance_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    
    -- Rolling window of recent successful attempts
    -- Stores JSON array of recent completions (last 50 attempts)
    recent_attempts JSONB DEFAULT '[]'::jsonb,
    
    -- Aggregated metrics (for quick access)
    total_recent_successes INTEGER DEFAULT 0,
    total_recent_attempts INTEGER DEFAULT 0,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- One summary per user per lesson
    UNIQUE (user_id, lesson_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lesson_performance_summary_user_lesson 
ON lesson_performance_summary(user_id, lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_performance_summary_updated_at 
ON lesson_performance_summary(updated_at DESC);

-- Function to update lesson performance summary
CREATE OR REPLACE FUNCTION update_lesson_performance_summary()
RETURNS TRIGGER AS $$
DECLARE
    v_lesson_id UUID;
    v_level_number INTEGER;
    v_difficulty VARCHAR(10);
BEGIN
    -- Get lesson_id from the attempt
    v_lesson_id := COALESCE(NEW.lesson_id, (SELECT lesson_id FROM levels WHERE id = NEW.level_id));
    
    IF v_lesson_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get level details for the attempt
    SELECT l.level_number, l.difficulty INTO v_level_number, v_difficulty
    FROM levels l
    WHERE l.id = NEW.level_id;
    
    -- Insert or update the summary
    INSERT INTO lesson_performance_summary (
        user_id,
        lesson_id,
        recent_attempts,
        total_recent_successes,
        total_recent_attempts,
        last_success_at,
        last_attempt_at,
        updated_at
    )
    VALUES (
        NEW.user_id,
        v_lesson_id,
        jsonb_build_array(
            jsonb_build_object(
                'level_id', NEW.level_id,
                'level_number', v_level_number,
                'difficulty', v_difficulty,
                'success', NEW.success,
                'attempt_time', NEW.attempt_time,
                'created_at', NEW.created_at
            )
        ),
        CASE WHEN NEW.success THEN 1 ELSE 0 END,
        1,
        CASE WHEN NEW.success THEN NEW.created_at ELSE NULL END,
        NEW.created_at,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        recent_attempts = (
            -- Prepend new attempt and keep only last 50
            (jsonb_build_array(
                jsonb_build_object(
                    'level_id', NEW.level_id,
                    'level_number', v_level_number,
                    'difficulty', v_difficulty,
                    'success', NEW.success,
                    'attempt_time', NEW.attempt_time,
                    'created_at', NEW.created_at
                )
            ) || lesson_performance_summary.recent_attempts)::jsonb
        ),
        total_recent_successes = lesson_performance_summary.total_recent_successes + 
            CASE WHEN NEW.success THEN 1 ELSE 0 END,
        total_recent_attempts = lesson_performance_summary.total_recent_attempts + 1,
        last_success_at = CASE 
            WHEN NEW.success THEN NEW.created_at 
            ELSE lesson_performance_summary.last_success_at 
        END,
        last_attempt_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Trim to last 50 attempts (run as separate update to avoid complexity)
    UPDATE lesson_performance_summary
    SET recent_attempts = (
        SELECT jsonb_agg(elem ORDER BY (elem->>'created_at')::timestamp DESC)
        FROM (
            SELECT elem
            FROM jsonb_array_elements(recent_attempts) elem
            ORDER BY (elem->>'created_at')::timestamp DESC
            LIMIT 50
        ) sub
    )
    WHERE user_id = NEW.user_id 
      AND lesson_id = v_lesson_id
      AND jsonb_array_length(recent_attempts) > 50;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update summary on puzzle_attempts insert
CREATE TRIGGER trigger_update_lesson_performance_summary
AFTER INSERT ON puzzle_attempts
FOR EACH ROW
EXECUTE FUNCTION update_lesson_performance_summary();

-- Function to rebuild summary for a specific user/lesson (for maintenance)
CREATE OR REPLACE FUNCTION rebuild_lesson_performance_summary(
    p_user_id UUID,
    p_lesson_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_attempts JSONB;
    v_total_successes INTEGER;
    v_total_attempts INTEGER;
    v_last_success_at TIMESTAMP WITH TIME ZONE;
    v_last_attempt_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get last 50 attempts for this user/lesson
    SELECT 
        jsonb_agg(
            jsonb_build_object(
                'level_id', attempt_data.level_id,
                'level_number', attempt_data.level_number,
                'difficulty', attempt_data.difficulty,
                'success', attempt_data.success,
                'attempt_time', attempt_data.attempt_time,
                'created_at', attempt_data.created_at
            ) ORDER BY attempt_data.created_at DESC
        ),
        COUNT(*) FILTER (WHERE attempt_data.success),
        COUNT(*),
        MAX(attempt_data.created_at) FILTER (WHERE attempt_data.success),
        MAX(attempt_data.created_at)
    INTO v_attempts, v_total_successes, v_total_attempts, v_last_success_at, v_last_attempt_at
    FROM (
        SELECT 
            pa.level_id,
            l.level_number,
            l.difficulty,
            pa.success,
            pa.attempt_time,
            pa.created_at
        FROM puzzle_attempts pa
        JOIN levels l ON pa.level_id = l.id
        WHERE pa.user_id = p_user_id 
          AND pa.lesson_id = p_lesson_id
        ORDER BY pa.created_at DESC
        LIMIT 50
    ) attempt_data;
    
    -- Update or insert summary
    INSERT INTO lesson_performance_summary (
        user_id,
        lesson_id,
        recent_attempts,
        total_recent_successes,
        total_recent_attempts,
        last_success_at,
        last_attempt_at,
        updated_at
    )
    VALUES (
        p_user_id,
        p_lesson_id,
        COALESCE(v_attempts, '[]'::jsonb),
        COALESCE(v_total_successes, 0),
        COALESCE(v_total_attempts, 0),
        v_last_success_at,
        v_last_attempt_at,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        recent_attempts = COALESCE(v_attempts, '[]'::jsonb),
        total_recent_successes = COALESCE(v_total_successes, 0),
        total_recent_attempts = COALESCE(v_total_attempts, 0),
        last_success_at = v_last_success_at,
        last_attempt_at = v_last_attempt_at,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE lesson_performance_summary IS 
'Rolling summary of recent puzzle attempts per user per lesson. Updated automatically via trigger.';

COMMENT ON COLUMN lesson_performance_summary.recent_attempts IS 
'JSONB array of last 50 attempts with level_id, level_number, difficulty, success, attempt_time, created_at';

COMMENT ON FUNCTION update_lesson_performance_summary() IS 
'Trigger function to update lesson_performance_summary when puzzle_attempts are inserted';

COMMENT ON FUNCTION rebuild_lesson_performance_summary(UUID, UUID) IS 
'Rebuild summary for a specific user/lesson. Useful for maintenance or data correction.';

