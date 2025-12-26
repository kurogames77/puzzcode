-- ============================================================
-- Migration: Create adaptive_log table
-- ============================================================
-- Logs all adaptive difficulty adjustments for monitoring and analytics
-- Tracks IRT and DDA algorithm results for each puzzle completion
-- ============================================================

CREATE TABLE IF NOT EXISTS adaptive_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    
    -- Performance Data (collected from puzzle completion)
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    total_attempts INTEGER NOT NULL DEFAULT 0,
    attempt_time INTEGER, -- Time taken in seconds
    
    -- IRT Algorithm Results
    theta_before FLOAT, -- Theta before adjustment
    theta_after FLOAT, -- Theta after IRT computation (adjusted_theta)
    probability FLOAT, -- Probability of success from IRT
    
    -- DDA Algorithm Results
    beta_before FLOAT, -- Beta before adjustment
    beta_after FLOAT, -- Beta after DDA adjustment
    difficulty_before VARCHAR(10), -- Difficulty label before (Easy/Medium/Hard)
    difficulty_after VARCHAR(10), -- Difficulty label after adjustment
    
    -- Performance Metrics
    actual_success_rate FLOAT, -- Actual success rate (success_count / total_attempts)
    target_success_rate FLOAT DEFAULT 0.7, -- Target success rate for comparison
    performance_gap FLOAT, -- Difference between actual and target
    
    -- Algorithm Metadata
    confidence_index FLOAT, -- Performance consistency (0-1)
    adjustment_applied FLOAT, -- Beta adjustment amount
    momentum FLOAT, -- DDA momentum value
    behavior_weight FLOAT, -- DDA behavior weight
    
    -- Decision Logic
    errors_threshold_met BOOLEAN, -- Whether 5+ errors were made
    below_target_performance BOOLEAN, -- Whether performance was below target
    difficulty_increased BOOLEAN, -- Whether difficulty was increased
    difficulty_decreased BOOLEAN, -- Whether difficulty was decreased
    
    -- Next Puzzle Assignment
    next_level_id UUID REFERENCES levels(id) ON DELETE SET NULL,
    next_level_number INTEGER,
    next_difficulty VARCHAR(10),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_adaptive_log_user_id ON adaptive_log(user_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_level_id ON adaptive_log(level_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_lesson_id ON adaptive_log(lesson_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_created_at ON adaptive_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_user_lesson ON adaptive_log(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_difficulty_change ON adaptive_log(difficulty_increased, difficulty_decreased);

-- Add comments for documentation
COMMENT ON TABLE adaptive_log IS 'Logs all adaptive difficulty adjustments for monitoring and analytics';
COMMENT ON COLUMN adaptive_log.theta_before IS 'Student ability (theta) before IRT computation';
COMMENT ON COLUMN adaptive_log.theta_after IS 'Student ability (theta) after IRT computation';
COMMENT ON COLUMN adaptive_log.beta_before IS 'Puzzle difficulty (beta) before DDA adjustment';
COMMENT ON COLUMN adaptive_log.beta_after IS 'Puzzle difficulty (beta) after DDA adjustment';
COMMENT ON COLUMN adaptive_log.errors_threshold_met IS 'True if student made 5 or more errors';
COMMENT ON COLUMN adaptive_log.below_target_performance IS 'True if actual success rate was below target (0.7)';

