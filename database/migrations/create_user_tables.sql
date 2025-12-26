-- ============================================================
-- User Authentication & Profile Tables
-- ============================================================
-- This migration creates tables for user authentication,
-- student progress tracking, and algorithm data storage.
-- ============================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS TABLE (Students & Admins)
-- ============================================================
-- Stores authentication and profile information for all users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- Store hashed password, not plain text
    user_type VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (user_type IN ('student', 'admin')),
    school_id VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Indexes for faster lookups
    CONSTRAINT users_username_unique UNIQUE (username),
    CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);

-- ============================================================
-- 2. STUDENT PROGRESS TABLE
-- ============================================================
-- Tracks IRT/DDA algorithm data per student per level
-- This is the core table for puzzle difficulty adjustment
CREATE TABLE IF NOT EXISTS student_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID REFERENCES levels(id) ON DELETE SET NULL,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    
    -- IRT Algorithm Parameters
    theta FLOAT DEFAULT 0.0, -- Player ability estimate (-3.0 to 3.0)
    prev_theta FLOAT, -- Previous theta for smoothing
    
    -- DDA Algorithm Parameters
    beta FLOAT DEFAULT 0.5, -- Current puzzle difficulty (0.1 to 1.0)
    prev_beta FLOAT, -- Previous beta for momentum tracking
    
    -- Performance Metrics
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    total_attempts INTEGER DEFAULT 0,
    
    -- Additional Metrics
    sessions_played INTEGER DEFAULT 1,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    best_completion_time INTEGER, -- in seconds
    average_completion_time FLOAT, -- in seconds
    
    -- Algorithm Outputs (cached for performance)
    adjusted_theta FLOAT, -- Latest adjusted theta from IRT
    confidence_index FLOAT, -- Performance consistency (0-1)
    success_rate FLOAT, -- Calculated success rate (0-1)
    fail_rate FLOAT, -- Calculated fail rate (0-1)
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one progress record per user per level
    UNIQUE (user_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_student_progress_user_id ON student_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_level_id ON student_progress(level_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_lesson_id ON student_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_theta ON student_progress(theta);
CREATE INDEX IF NOT EXISTS idx_student_progress_beta ON student_progress(beta);

-- ============================================================
-- 3. PUZZLE ATTEMPTS TABLE
-- ============================================================
-- Logs every puzzle attempt for detailed analytics
CREATE TABLE IF NOT EXISTS puzzle_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    
    -- Attempt Details
    success BOOLEAN NOT NULL,
    attempt_time INTEGER, -- Time taken in seconds
    code_submitted TEXT, -- Store submitted code for analysis
    expected_output TEXT, -- Expected output for this attempt
    actual_output TEXT, -- Actual output from code execution
    
    -- Algorithm Context (snapshot at time of attempt)
    theta_at_attempt FLOAT, -- Theta value when attempt was made
    beta_at_attempt FLOAT, -- Beta value when attempt was made
    difficulty_label VARCHAR(20), -- Easy, Medium, Hard
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for analytics queries
    CONSTRAINT puzzle_attempts_success_check CHECK (success IN (TRUE, FALSE))
);

CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_id ON puzzle_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_level_id ON puzzle_attempts(level_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_lesson_id ON puzzle_attempts(lesson_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_success ON puzzle_attempts(success);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_created_at ON puzzle_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_level ON puzzle_attempts(user_id, level_id);

-- ============================================================
-- 4. STUDENT STATISTICS TABLE
-- ============================================================
-- Aggregated statistics for students (for leaderboards, rankings)
CREATE TABLE IF NOT EXISTS student_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Rank & EXP System (from RankBases/EXP.py)
    exp INTEGER DEFAULT 0,
    normalized_exp FLOAT DEFAULT 0.0, -- 0.0 to 1.0
    rank_name VARCHAR(50) DEFAULT 'novice',
    rank_index INTEGER DEFAULT 0, -- 0-9 for rank levels
    
    -- Achievement System (from IRT_Bases/Achivements.py)
    completed_achievements INTEGER DEFAULT 0,
    total_achievements INTEGER DEFAULT 30, -- Max achievements
    
    -- Overall Performance
    total_success_count INTEGER DEFAULT 0, -- Across all levels
    total_fail_count INTEGER DEFAULT 0, -- Across all levels
    total_sessions INTEGER DEFAULT 0,
    
    -- Success/Fail Levels (from IRT_Bases/Success.py and Fail.py)
    success_level VARCHAR(50) DEFAULT 'Beginner',
    fail_level VARCHAR(50) DEFAULT 'Minimal Failure',
    
    -- Engagement Metrics
    current_streak INTEGER DEFAULT 0, -- Consecutive successful attempts
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_statistics_user_id ON student_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_student_statistics_exp ON student_statistics(exp DESC);
CREATE INDEX IF NOT EXISTS idx_student_statistics_rank ON student_statistics(rank_name);
CREATE INDEX IF NOT EXISTS idx_student_statistics_achievements ON student_statistics(completed_achievements DESC);

-- ============================================================
-- 5. ACHIEVEMENTS TABLE
-- ============================================================
-- Tracks individual achievements unlocked by students
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(100) NOT NULL, -- e.g., 'first_puzzle', 'streak_10', 'master_coder'
    achievement_tier VARCHAR(20), -- 'bronze', 'silver', 'gold', 'platinum'
    achievement_name VARCHAR(255) NOT NULL,
    achievement_description TEXT,
    exp_reward INTEGER DEFAULT 0,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique achievement per user
    UNIQUE (user_id, achievement_type)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_achievements_unlocked_at ON achievements(unlocked_at DESC);

-- ============================================================
-- 6. MULTIPLAYER MATCHES TABLE
-- ============================================================
-- Stores matchmaking results (from Multiplayer_Based.py)
CREATE TABLE IF NOT EXISTS multiplayer_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_type VARCHAR(50) DEFAULT '1v1', -- '1v1', '2v2', etc.
    cluster_id INTEGER, -- K-Means cluster assignment
    match_score FLOAT, -- Match quality score (0-1)
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    
    -- Match Details
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_status ON multiplayer_matches(status);
CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_cluster ON multiplayer_matches(cluster_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_created_at ON multiplayer_matches(created_at DESC);

-- ============================================================
-- 7. MULTIPLAYER MATCH PARTICIPANTS TABLE
-- ============================================================
-- Links users to multiplayer matches
CREATE TABLE IF NOT EXISTS multiplayer_match_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES multiplayer_matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Player State at Match Time (for matchmaking algorithms)
    theta FLOAT,
    beta FLOAT,
    rank_name VARCHAR(50),
    success_count INTEGER,
    fail_count INTEGER,
    completed_achievements INTEGER,
    
    -- Match Result
    is_winner BOOLEAN DEFAULT FALSE,
    completed_code BOOLEAN DEFAULT FALSE, -- Whether player finished their code
    exp_gained INTEGER DEFAULT 0,
    exp_lost INTEGER DEFAULT 0,
    
    -- Performance Metrics
    completion_time INTEGER, -- Time taken in seconds
    code_submitted TEXT,
    
    -- Metadata
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_participants_match_id ON multiplayer_match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id ON multiplayer_match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_winner ON multiplayer_match_participants(is_winner);

-- ============================================================
-- 8. SESSIONS TABLE
-- ============================================================
-- Tracks user sessions for engagement metrics
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_end TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    puzzles_attempted INTEGER DEFAULT 0,
    puzzles_completed INTEGER DEFAULT 0,
    battles_joined INTEGER DEFAULT 0,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_start ON user_sessions(session_start DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_progress_updated_at BEFORE UPDATE ON student_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_statistics_updated_at BEFORE UPDATE ON student_statistics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_multiplayer_matches_updated_at BEFORE UPDATE ON multiplayer_matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to automatically create student_statistics when user is created
CREATE OR REPLACE FUNCTION create_student_statistics()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_type = 'student' THEN
        INSERT INTO student_statistics (user_id)
        VALUES (NEW.id)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_student_stats_on_user_create
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_student_statistics();

-- Function to update total_attempts in student_progress
CREATE OR REPLACE FUNCTION update_student_progress_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE student_progress
    SET 
        total_attempts = success_count + fail_count,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id AND level_id = NEW.level_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Note: This trigger would be called after puzzle_attempts insert
-- You'll need to update student_progress manually or via application logic

-- ============================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON TABLE users IS 'Stores authentication and profile data for all users (students and admins)';
COMMENT ON TABLE student_progress IS 'Core table for IRT/DDA algorithms - tracks ability (theta) and difficulty (beta) per level';
COMMENT ON TABLE puzzle_attempts IS 'Detailed log of every puzzle attempt for analytics and algorithm training';
COMMENT ON TABLE student_statistics IS 'Aggregated statistics for leaderboards, rankings, and achievements';
COMMENT ON TABLE achievements IS 'Individual achievements unlocked by students';
COMMENT ON TABLE multiplayer_matches IS 'Matchmaking results from Multiplayer_Based.py and SkillBasedMatchMaking.py';
COMMENT ON TABLE multiplayer_match_participants IS 'Links users to matches with their performance data';
COMMENT ON TABLE user_sessions IS 'Tracks user sessions for engagement and analytics';

COMMENT ON COLUMN student_progress.theta IS 'IRT ability estimate: -3.0 (low) to 3.0 (high)';
COMMENT ON COLUMN student_progress.beta IS 'DDA difficulty parameter: 0.1 (easy) to 1.0 (hard)';
COMMENT ON COLUMN student_progress.success_count IS 'Total successful puzzle completions for this level';
COMMENT ON COLUMN student_progress.fail_count IS 'Total failed attempts for this level';
COMMENT ON COLUMN student_statistics.exp IS 'Total EXP points (from RankBases/EXP.py)';
COMMENT ON COLUMN student_statistics.rank_name IS 'Current rank: novice, apprentice, bronze_coder, etc.';

