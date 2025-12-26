-- ============================================================
-- Migration: Create Difficulty Audit Table
-- ============================================================
-- Append-only audit table for tracking difficulty changes
-- Records reason, thresholds triggered, old/new beta values
-- Separate from adaptive_log for focused auditing
-- ============================================================

CREATE TABLE IF NOT EXISTS difficulty_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    
    -- Change Details
    old_beta FLOAT NOT NULL,
    new_beta FLOAT NOT NULL,
    old_difficulty VARCHAR(10) NOT NULL CHECK (old_difficulty IN ('Easy', 'Medium', 'Hard')),
    new_difficulty VARCHAR(10) NOT NULL CHECK (new_difficulty IN ('Easy', 'Medium', 'Hard')),
    
    -- Rule/Algorithm Context
    rule_applied VARCHAR(100), -- e.g., 'beginner_promote_medium', 'intermediate_struggle_relief'
    rule_applied_flag BOOLEAN DEFAULT FALSE, -- Whether rule actually overrode algorithm
    algorithm_beta FLOAT, -- What the algorithm suggested (before rule override)
    
    -- Thresholds Triggered
    errors_threshold_met BOOLEAN DEFAULT FALSE, -- 5+ errors
    time_threshold_met BOOLEAN DEFAULT FALSE, -- Time > 60s
    consecutive_successes INTEGER, -- Number of consecutive successes (for 5/8 checks)
    performance_criteria_met BOOLEAN, -- Whether all attempts met performance criteria
    
    -- Performance Context
    success_count INTEGER,
    fail_count INTEGER,
    total_attempts INTEGER,
    attempt_time INTEGER,
    actual_success_rate FLOAT,
    target_success_rate FLOAT DEFAULT 0.7,
    
    -- Lesson Context
    lesson_difficulty VARCHAR(20), -- Beginner, Intermediate, Advanced
    current_level_number INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent modification (append-only)
    CONSTRAINT difficulty_audit_no_updates CHECK (true) -- Always true, prevents updates
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_difficulty_audit_user_id 
ON difficulty_audit(user_id);

CREATE INDEX IF NOT EXISTS idx_difficulty_audit_level_id 
ON difficulty_audit(level_id);

CREATE INDEX IF NOT EXISTS idx_difficulty_audit_lesson_id 
ON difficulty_audit(lesson_id);

CREATE INDEX IF NOT EXISTS idx_difficulty_audit_created_at 
ON difficulty_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_difficulty_audit_user_lesson 
ON difficulty_audit(user_id, lesson_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_difficulty_audit_rule_applied 
ON difficulty_audit(rule_applied);

CREATE INDEX IF NOT EXISTS idx_difficulty_audit_difficulty_change 
ON difficulty_audit(old_difficulty, new_difficulty);

-- Function to insert audit record (called from application code)
CREATE OR REPLACE FUNCTION log_difficulty_change(
    p_user_id UUID,
    p_level_id UUID,
    p_lesson_id UUID,
    p_old_beta FLOAT,
    p_new_beta FLOAT,
    p_old_difficulty VARCHAR(10),
    p_new_difficulty VARCHAR(10),
    p_rule_applied VARCHAR(100) DEFAULT NULL,
    p_rule_applied_flag BOOLEAN DEFAULT FALSE,
    p_algorithm_beta FLOAT DEFAULT NULL,
    p_errors_threshold_met BOOLEAN DEFAULT FALSE,
    p_time_threshold_met BOOLEAN DEFAULT FALSE,
    p_consecutive_successes INTEGER DEFAULT NULL,
    p_performance_criteria_met BOOLEAN DEFAULT NULL,
    p_success_count INTEGER DEFAULT NULL,
    p_fail_count INTEGER DEFAULT NULL,
    p_total_attempts INTEGER DEFAULT NULL,
    p_attempt_time INTEGER DEFAULT NULL,
    p_actual_success_rate FLOAT DEFAULT NULL,
    p_target_success_rate FLOAT DEFAULT 0.7,
    p_lesson_difficulty VARCHAR(20) DEFAULT NULL,
    p_current_level_number INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO difficulty_audit (
        user_id,
        level_id,
        lesson_id,
        old_beta,
        new_beta,
        old_difficulty,
        new_difficulty,
        rule_applied,
        rule_applied_flag,
        algorithm_beta,
        errors_threshold_met,
        time_threshold_met,
        consecutive_successes,
        performance_criteria_met,
        success_count,
        fail_count,
        total_attempts,
        attempt_time,
        actual_success_rate,
        target_success_rate,
        lesson_difficulty,
        current_level_number
    )
    VALUES (
        p_user_id,
        p_level_id,
        p_lesson_id,
        p_old_beta,
        p_new_beta,
        p_old_difficulty,
        p_new_difficulty,
        p_rule_applied,
        p_rule_applied_flag,
        p_algorithm_beta,
        p_errors_threshold_met,
        p_time_threshold_met,
        p_consecutive_successes,
        p_performance_criteria_met,
        p_success_count,
        p_fail_count,
        p_total_attempts,
        p_attempt_time,
        p_actual_success_rate,
        p_target_success_rate,
        p_lesson_difficulty,
        p_current_level_number
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Prevent updates and deletes (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_difficulty_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'difficulty_audit is append-only. Updates and deletes are not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_difficulty_audit_update
BEFORE UPDATE ON difficulty_audit
FOR EACH ROW
EXECUTE FUNCTION prevent_difficulty_audit_modification();

CREATE TRIGGER trigger_prevent_difficulty_audit_delete
BEFORE DELETE ON difficulty_audit
FOR EACH ROW
EXECUTE FUNCTION prevent_difficulty_audit_modification();

-- Comments for documentation
COMMENT ON TABLE difficulty_audit IS 
'Append-only audit log for difficulty changes. Records rule applications, thresholds triggered, and beta changes.';

COMMENT ON COLUMN difficulty_audit.rule_applied IS 
'Name of the rule that was applied (e.g., beginner_promote_medium, intermediate_struggle_relief)';

COMMENT ON COLUMN difficulty_audit.rule_applied_flag IS 
'True if the rule actually overrode the algorithm suggestion, false if algorithm was used';

COMMENT ON COLUMN difficulty_audit.algorithm_beta IS 
'Beta value suggested by the algorithm before rule evaluation';

COMMENT ON FUNCTION log_difficulty_change IS 
'Helper function to insert audit records. Call from application code after difficulty changes.';

