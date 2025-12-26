-- ============================================================
-- GAMIFIED LEARNING PLATFORM - COMPLETE DATABASE SCHEMA
-- ============================================================
-- This schema consolidates all tables into logical groups:
-- Student, Admin, Achievement, Puzzlechallenge, Multiplayerbattle,
-- Puzzleattempt, Battleparticipant, Leaderboardentry
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STUDENT GROUP
-- ============================================================
-- Tables: users, user_sessions, student_statistics, student_progress
-- ============================================================

-- Users Table (Students & Admins)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (user_type IN ('student', 'admin')),
    school_id VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);

-- User Sessions Table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_end TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    puzzles_attempted INTEGER DEFAULT 0,
    puzzles_completed INTEGER DEFAULT 0,
    battles_joined INTEGER DEFAULT 0,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_start ON user_sessions(session_start DESC);

-- Student Statistics Table
CREATE TABLE IF NOT EXISTS student_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    exp INTEGER DEFAULT 0,
    normalized_exp FLOAT DEFAULT 0.0,
    rank_name VARCHAR(50) DEFAULT 'novice',
    rank_index INTEGER DEFAULT 0,
    completed_achievements INTEGER DEFAULT 0,
    total_achievements INTEGER DEFAULT 30,
    total_success_count INTEGER DEFAULT 0,
    total_fail_count INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    success_level VARCHAR(50) DEFAULT 'Beginner',
    fail_level VARCHAR(50) DEFAULT 'Minimal Failure',
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_statistics_user_id ON student_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_student_statistics_exp ON student_statistics(exp DESC);
CREATE INDEX IF NOT EXISTS idx_student_statistics_rank ON student_statistics(rank_name);
CREATE INDEX IF NOT EXISTS idx_student_statistics_achievements ON student_statistics(completed_achievements DESC);

-- Student Progress Table
CREATE TABLE IF NOT EXISTS student_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID REFERENCES levels(id) ON DELETE SET NULL,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    theta FLOAT DEFAULT 0.0,
    prev_theta FLOAT,
    beta FLOAT DEFAULT 0.5,
    prev_beta FLOAT,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    total_attempts INTEGER DEFAULT 0,
    sessions_played INTEGER DEFAULT 1,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    best_completion_time INTEGER,
    average_completion_time FLOAT,
    adjusted_theta FLOAT,
    confidence_index FLOAT,
    success_rate FLOAT,
    fail_rate FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_student_progress_user_id ON student_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_level_id ON student_progress(level_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_lesson_id ON student_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_theta ON student_progress(theta);
CREATE INDEX IF NOT EXISTS idx_student_progress_beta ON student_progress(beta);

-- ============================================================
-- ADMIN GROUP
-- ============================================================
-- Tables: courses, lessons, levels
-- ============================================================

-- Courses Table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    students INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Draft', 'Archived')),
    summary TEXT,
    icon VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lessons Table
CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    difficulty VARCHAR(20) NOT NULL DEFAULT 'Beginner' CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (course_id, title)
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);

-- Levels Table
CREATE TABLE IF NOT EXISTS levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    level_number INTEGER NOT NULL CHECK (level_number >= 1 AND level_number <= 10),
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    points INTEGER NOT NULL,
    initial_code TEXT,
    expected_output TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lesson_id, level_number, difficulty)
);

CREATE INDEX IF NOT EXISTS idx_levels_lesson_id ON levels(lesson_id);
CREATE INDEX IF NOT EXISTS idx_levels_lesson_level_difficulty ON levels(lesson_id, level_number, difficulty);

-- ============================================================
-- ACHIEVEMENT GROUP
-- ============================================================
-- Tables: achievements
-- ============================================================

-- Achievements Table
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(100) NOT NULL,
    achievement_tier VARCHAR(20),
    achievement_name VARCHAR(255) NOT NULL,
    achievement_description TEXT,
    exp_reward INTEGER DEFAULT 0,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, achievement_type)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_achievements_unlocked_at ON achievements(unlocked_at DESC);

-- ============================================================
-- PUZZLECHALLENGE GROUP
-- ============================================================
-- Tables: lesson_performance_summary, lesson_level_completions
-- ============================================================

-- Lesson Performance Summary Table
CREATE TABLE IF NOT EXISTS lesson_performance_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    recent_attempts JSONB DEFAULT '[]'::jsonb,
    total_recent_successes INTEGER DEFAULT 0,
    total_recent_attempts INTEGER DEFAULT 0,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_performance_summary_user_lesson 
    ON lesson_performance_summary(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_performance_summary_updated_at 
    ON lesson_performance_summary(updated_at DESC);

-- Lesson Level Completions Table
CREATE TABLE IF NOT EXISTS lesson_level_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    level_number INTEGER NOT NULL CHECK (level_number >= 1),
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_level_completions_user_lesson
    ON lesson_level_completions(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_level_completions_lesson_level
    ON lesson_level_completions(lesson_id, level_number);

-- ============================================================
-- MULTIPLAYERBATTLE GROUP
-- ============================================================
-- Tables: multiplayer_matches, multiplayer_match_participants
-- ============================================================

-- Multiplayer Matches Table
CREATE TABLE IF NOT EXISTS multiplayer_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_type VARCHAR(50) DEFAULT '1v1',
    cluster_id INTEGER,
    match_score FLOAT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_status ON multiplayer_matches(status);
CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_cluster ON multiplayer_matches(cluster_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_created_at ON multiplayer_matches(created_at DESC);

-- Multiplayer Match Participants Table
CREATE TABLE IF NOT EXISTS multiplayer_match_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES multiplayer_matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theta FLOAT,
    beta FLOAT,
    rank_name VARCHAR(50),
    success_count INTEGER,
    fail_count INTEGER,
    completed_achievements INTEGER,
    is_winner BOOLEAN DEFAULT FALSE,
    completed_code BOOLEAN DEFAULT FALSE,
    exp_gained INTEGER DEFAULT 0,
    exp_lost INTEGER DEFAULT 0,
    completion_time INTEGER,
    code_submitted TEXT,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_participants_match_id ON multiplayer_match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id ON multiplayer_match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_winner ON multiplayer_match_participants(is_winner);

-- ============================================================
-- BATTLE CHALLENGES
-- ============================================================
-- Stores direct 1v1 challenge invitations between players
CREATE TABLE IF NOT EXISTS battle_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language VARCHAR(32) NOT NULL DEFAULT 'python',
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ,
    match_id UUID REFERENCES multiplayer_matches(id) ON DELETE SET NULL,
    problem_id VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_battle_challenges_to_user
    ON battle_challenges(to_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_challenges_from_user
    ON battle_challenges(from_user_id, status, created_at DESC);

-- ============================================================
-- PUZZLEATTEMPT GROUP
-- ============================================================
-- Tables: puzzle_attempt, adaptive_log, difficulty_audit
-- ============================================================

-- Puzzle Attempt Table
CREATE TABLE IF NOT EXISTS puzzle_attempt (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL,
    attempt_time INTEGER,
    code_submitted TEXT,
    expected_output TEXT,
    actual_output TEXT,
    theta_at_attempt FLOAT,
    beta_at_attempt FLOAT,
    difficulty_label VARCHAR(20),
    attempt_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT puzzle_attempt_success_check CHECK (success IN (TRUE, FALSE))
);

CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_user_id ON puzzle_attempt(user_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_level_id ON puzzle_attempt(level_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_lesson_id ON puzzle_attempt(lesson_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_success ON puzzle_attempt(success);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_created_at ON puzzle_attempt(created_at);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_user_level ON puzzle_attempt(user_id, level_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_attempt_id_user ON puzzle_attempt(attempt_id, user_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_user_lesson_success_created ON puzzle_attempt(user_id, lesson_id, success, created_at DESC) WHERE success = TRUE;
CREATE INDEX IF NOT EXISTS idx_puzzle_attempt_user_lesson_created ON puzzle_attempt(user_id, lesson_id, created_at DESC);

-- Adaptive Log Table
CREATE TABLE IF NOT EXISTS adaptive_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    total_attempts INTEGER NOT NULL DEFAULT 0,
    attempt_time INTEGER,
    theta_before FLOAT,
    theta_after FLOAT,
    probability FLOAT,
    beta_before FLOAT,
    beta_after FLOAT,
    difficulty_before VARCHAR(10),
    difficulty_after VARCHAR(10),
    actual_success_rate FLOAT,
    target_success_rate FLOAT DEFAULT 0.7,
    performance_gap FLOAT,
    confidence_index FLOAT,
    adjustment_applied FLOAT,
    momentum FLOAT,
    behavior_weight FLOAT,
    errors_threshold_met BOOLEAN,
    below_target_performance BOOLEAN,
    difficulty_increased BOOLEAN,
    difficulty_decreased BOOLEAN,
    next_level_id UUID REFERENCES levels(id) ON DELETE SET NULL,
    next_level_number INTEGER,
    next_difficulty VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adaptive_log_user_id ON adaptive_log(user_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_level_id ON adaptive_log(level_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_lesson_id ON adaptive_log(lesson_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_created_at ON adaptive_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_user_lesson ON adaptive_log(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_log_difficulty_change ON adaptive_log(difficulty_increased, difficulty_decreased);

-- Difficulty Audit Table
CREATE TABLE IF NOT EXISTS difficulty_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    old_beta FLOAT NOT NULL,
    new_beta FLOAT NOT NULL,
    old_difficulty VARCHAR(10) NOT NULL CHECK (old_difficulty IN ('Easy', 'Medium', 'Hard')),
    new_difficulty VARCHAR(10) NOT NULL CHECK (new_difficulty IN ('Easy', 'Medium', 'Hard')),
    rule_applied VARCHAR(100),
    rule_applied_flag BOOLEAN DEFAULT FALSE,
    algorithm_beta FLOAT,
    errors_threshold_met BOOLEAN DEFAULT FALSE,
    time_threshold_met BOOLEAN DEFAULT FALSE,
    consecutive_successes INTEGER,
    performance_criteria_met BOOLEAN,
    success_count INTEGER,
    fail_count INTEGER,
    total_attempts INTEGER,
    attempt_time INTEGER,
    actual_success_rate FLOAT,
    target_success_rate FLOAT DEFAULT 0.7,
    lesson_difficulty VARCHAR(20),
    current_level_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT difficulty_audit_no_updates CHECK (true)
);

CREATE INDEX IF NOT EXISTS idx_difficulty_audit_user_id ON difficulty_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_audit_level_id ON difficulty_audit(level_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_audit_lesson_id ON difficulty_audit(lesson_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_audit_created_at ON difficulty_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_difficulty_audit_user_lesson ON difficulty_audit(user_id, lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_difficulty_audit_rule_applied ON difficulty_audit(rule_applied);
CREATE INDEX IF NOT EXISTS idx_difficulty_audit_difficulty_change ON difficulty_audit(old_difficulty, new_difficulty);

-- ============================================================
-- LEADERBOARDENTRY GROUP
-- ============================================================
-- Tables: leaderboardentry (NEW)
-- ============================================================

-- Leaderboard Entry Table
CREATE TABLE IF NOT EXISTS leaderboardentry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_type VARCHAR(20) NOT NULL DEFAULT 'overall' 
        CHECK (board_type IN ('overall', 'multiplayer', 'achievements', 'streaks')),
    rank_position INTEGER NOT NULL,
    exp INTEGER DEFAULT 0,
    rank_name VARCHAR(50) DEFAULT 'novice',
    rank_index INTEGER DEFAULT 0,
    total_achievements INTEGER DEFAULT 0,
    levels_completed INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_matches INTEGER DEFAULT 0,
    win_rate FLOAT DEFAULT 0.0,
    longest_streak INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    period_type VARCHAR(20) DEFAULT 'all_time' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'all_time')),
    period_start DATE,
    period_end DATE
);

CREATE INDEX IF NOT EXISTS idx_leaderboardentry_user_id ON leaderboardentry(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboardentry_rank_position ON leaderboardentry(rank_position);
CREATE INDEX IF NOT EXISTS idx_leaderboardentry_exp ON leaderboardentry(exp DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboardentry_period ON leaderboardentry(period_type, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_leaderboardentry_period_exp ON leaderboardentry(period_type, exp DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboardentry_board_type
    ON leaderboardentry(board_type, rank_position);

-- ============================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_progress_updated_at ON student_progress;
CREATE TRIGGER update_student_progress_updated_at BEFORE UPDATE ON student_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_statistics_updated_at ON student_statistics;
CREATE TRIGGER update_student_statistics_updated_at BEFORE UPDATE ON student_statistics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lessons_updated_at ON lessons;
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_levels_updated_at ON levels;
CREATE TRIGGER update_levels_updated_at BEFORE UPDATE ON levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_multiplayer_matches_updated_at ON multiplayer_matches;
CREATE TRIGGER update_multiplayer_matches_updated_at BEFORE UPDATE ON multiplayer_matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lesson_performance_summary_updated_at ON lesson_performance_summary;
CREATE TRIGGER update_lesson_performance_summary_updated_at BEFORE UPDATE ON lesson_performance_summary
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

DROP TRIGGER IF EXISTS create_student_stats_on_user_create ON users;
CREATE TRIGGER create_student_stats_on_user_create
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_student_statistics();

-- Function to log difficulty changes (for difficulty_audit)
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
        user_id, level_id, lesson_id, old_beta, new_beta,
        old_difficulty, new_difficulty, rule_applied, rule_applied_flag,
        algorithm_beta, errors_threshold_met, time_threshold_met,
        consecutive_successes, performance_criteria_met, success_count,
        fail_count, total_attempts, attempt_time, actual_success_rate,
        target_success_rate, lesson_difficulty, current_level_number
    )
    VALUES (
        p_user_id, p_level_id, p_lesson_id, p_old_beta, p_new_beta,
        p_old_difficulty, p_new_difficulty, p_rule_applied, p_rule_applied_flag,
        p_algorithm_beta, p_errors_threshold_met, p_time_threshold_met,
        p_consecutive_successes, p_performance_criteria_met, p_success_count,
        p_fail_count, p_total_attempts, p_attempt_time, p_actual_success_rate,
        p_target_success_rate, p_lesson_difficulty, p_current_level_number
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Prevent updates and deletes on difficulty_audit (append-only)
CREATE OR REPLACE FUNCTION prevent_difficulty_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'difficulty_audit is append-only. Updates and deletes are not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_difficulty_audit_update ON difficulty_audit;
CREATE TRIGGER trigger_prevent_difficulty_audit_update
BEFORE UPDATE ON difficulty_audit
FOR EACH ROW
EXECUTE FUNCTION prevent_difficulty_audit_modification();

DROP TRIGGER IF EXISTS trigger_prevent_difficulty_audit_delete ON difficulty_audit;
CREATE TRIGGER trigger_prevent_difficulty_audit_delete
BEFORE DELETE ON difficulty_audit
FOR EACH ROW
EXECUTE FUNCTION prevent_difficulty_audit_modification();

-- Function to update lesson performance summary
CREATE OR REPLACE FUNCTION update_lesson_performance_summary()
RETURNS TRIGGER AS $$
DECLARE
    v_lesson_id UUID;
    v_level_number INTEGER;
    v_difficulty VARCHAR(10);
BEGIN
    -- Get lesson_id from the attempt (from puzzle_attempt table)
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
        user_id, lesson_id, recent_attempts, total_recent_successes,
        total_recent_attempts, last_success_at, last_attempt_at, updated_at
    )
    VALUES (
        NEW.user_id, v_lesson_id,
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
    
    -- Trim to last 50 attempts
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

-- Trigger to automatically update summary on puzzle_attempt insert
DROP TRIGGER IF EXISTS trigger_update_lesson_performance_summary ON puzzle_attempt;
CREATE TRIGGER trigger_update_lesson_performance_summary
AFTER INSERT ON puzzle_attempt
FOR EACH ROW
EXECUTE FUNCTION update_lesson_performance_summary();

-- Remove multiplayer matches when they no longer have participants
CREATE OR REPLACE FUNCTION remove_empty_multiplayer_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM multiplayer_match_participants
        WHERE match_id = OLD.match_id
    ) THEN
        DELETE FROM multiplayer_matches WHERE id = OLD.match_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remove_empty_match ON multiplayer_match_participants;
CREATE TRIGGER trg_remove_empty_match
AFTER DELETE ON multiplayer_match_participants
FOR EACH ROW
EXECUTE FUNCTION remove_empty_multiplayer_match();

-- Function to rebuild lesson performance summary
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
    -- Get last 50 attempts for this user/lesson from puzzle_attempt table
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
        FROM puzzle_attempt pa
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

-- ============================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON TABLE users IS 'Stores authentication and profile data for all users (students and admins)';
COMMENT ON TABLE user_sessions IS 'Tracks user sessions for engagement and analytics';
COMMENT ON TABLE student_statistics IS 'Aggregated statistics for leaderboards, rankings, and achievements';
COMMENT ON TABLE student_progress IS 'Core table for IRT/DDA algorithms - tracks ability (theta) and difficulty (beta) per level';
COMMENT ON TABLE courses IS 'Course definitions created by admins';
COMMENT ON TABLE lessons IS 'Lessons within courses';
COMMENT ON TABLE levels IS 'Individual puzzle levels with Easy/Medium/Hard variants';
COMMENT ON TABLE achievements IS 'Individual achievements unlocked by students';
COMMENT ON TABLE puzzle_attempt IS 'Detailed log of every puzzle attempt for analytics and algorithm training';
COMMENT ON COLUMN puzzle_attempt.attempt_id IS 'Idempotency key: prevents duplicate writes on retries. Unique per user.';
COMMENT ON TABLE lesson_performance_summary IS 'Rolling summary of recent puzzle attempts per user per lesson';
COMMENT ON TABLE lesson_level_completions IS 'Tracks which lesson levels have been completed by students';
COMMENT ON TABLE multiplayer_matches IS 'Matchmaking results for multiplayer battles';
COMMENT ON TABLE multiplayer_match_participants IS 'Links users to matches with their performance data';
COMMENT ON TABLE adaptive_log IS 'Logs all adaptive difficulty adjustments for monitoring and analytics';
COMMENT ON TABLE difficulty_audit IS 'Append-only audit log for difficulty changes';
COMMENT ON TABLE leaderboardentry IS 'Leaderboard entries for different time periods (daily, weekly, monthly, all-time). Note: Some fields (exp, rank_name, achievements, streak) can be joined from student_statistics to avoid redundancy.';
