-- ============================================================
-- Lesson Level Completions Table
-- ============================================================
-- Stores which lesson levels have been completed by a student.
-- This enables reliable progress tracking across sessions.
-- ============================================================

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


