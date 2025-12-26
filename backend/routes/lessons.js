const express = require('express');
const router = express.Router();
const pool = require('../db');
const { safeRollback } = require('../utils/errorHandler');
const { error } = require('../utils/http');
const logger = require('../utils/logger');
const { authenticateToken, requireStudent } = require('../middleware/auth');

// Get lesson progress for a student (completed levels count)
router.get('/:lessonId/progress', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user.id;

    // Get all unique level numbers for this lesson
    const levelsResult = await pool.query(
      `SELECT DISTINCT level_number 
       FROM levels 
       WHERE lesson_id = $1 
       ORDER BY level_number`,
      [lessonId]
    );

    const totalLevels = levelsResult.rows.length;

    if (totalLevels === 0) {
      console.log('lesson_progress', { lessonId, userId, totalLevels: 0, completed: 0 });
      return res.json({ completed: 0, total: 0, completedLevels: [] });
    }

    // Load completed levels from new tracking table
    const completionRows = await pool.query(
      `SELECT level_number 
       FROM lesson_level_completions
       WHERE lesson_id = $1 AND user_id = $2
       ORDER BY level_number`,
      [lessonId, userId]
    );

    const completedLevelsSet = new Set((completionRows.rows || []).map(row => row.level_number));
    const completedLevels = Array.from(completedLevelsSet);

    // Backfill legacy completions for students who have progress recorded prior to new table
    if (completedLevels.length < totalLevels) {
      const legacyProgressRows = await pool.query(
        `SELECT DISTINCT l.id AS level_id, l.level_number, l.difficulty
         FROM levels l
         INNER JOIN student_progress sp ON sp.level_id = l.id
         WHERE l.lesson_id = $1
           AND sp.user_id = $2
           AND sp.success_count > 0`,
        [lessonId, userId]
      );

      const legacyAttemptRows = await pool.query(
        `SELECT DISTINCT l.id AS level_id, l.level_number, l.difficulty
         FROM puzzle_attempt pa
         INNER JOIN levels l ON l.id = pa.level_id
         WHERE l.lesson_id = $1
           AND pa.user_id = $2
           AND pa.success = TRUE`,
        [lessonId, userId]
      );

      const legacyRows = [...legacyProgressRows.rows, ...legacyAttemptRows.rows];

      for (const row of legacyRows) {
        if (!row) continue;
        if (!completedLevelsSet.has(row.level_number)) {
          completedLevelsSet.add(row.level_number);
          completedLevels.push(row.level_number);
        }

        // Persist backfilled completion for future calls
        if (row.level_id) {
          try {
            await pool.query(
              `INSERT INTO lesson_level_completions (user_id, lesson_id, level_id, level_number, difficulty)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (user_id, level_id) DO NOTHING`,
              [userId, lessonId, row.level_id, row.level_number, row.difficulty || 'Easy']
            );
          } catch (e) {
            console.warn('lesson_progress_backfill_failed', {
              lessonId,
              userId,
              levelId: row.level_id,
              error: e.message
            });
          }
        }
      }
    }

    completedLevels.sort((a, b) => a - b);
    const completed = completedLevels.length;

    console.log('lesson_progress', {
      lessonId,
      userId,
      totalLevels,
      completed,
    });

    res.json({ completed, total: totalLevels, completedLevels });
  } catch (error) {
    logger.error('fetch_lesson_progress_error', {
      userId: req.user?.id,
      lessonId: req.params.lessonId,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to fetch lesson progress', null, error);
  }
});

// Get all lessons for a course
router.get('/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await pool.query(
      `SELECT l.*, 
       COALESCE(json_agg(
         json_build_object(
           'id', lev.id,
           'levelNumber', lev.level_number,
           'title', lev.title,
           'description', lev.description,
           'difficulty', lev.difficulty,
           'points', lev.points,
           'initialCode', lev.initial_code,
           'expectedOutput', lev.expected_output,
           'isCompleted', false
         ) ORDER BY lev.level_number, 
           CASE lev.difficulty 
             WHEN 'Easy' THEN 1 
             WHEN 'Medium' THEN 2 
             WHEN 'Hard' THEN 3 
           END
       ) FILTER (WHERE lev.id IS NOT NULL), '[]'::json) as levels
       FROM lessons l
       LEFT JOIN levels lev ON lev.lesson_id = l.id
       WHERE l.course_id = $1
       GROUP BY l.id
       ORDER BY l.created_at`,
      [courseId]
    );

    const lessons = result.rows.map(row => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty || 'Beginner',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      levels: row.levels || []
    }));

    res.json(lessons);
  } catch (error) {
    logger.error('fetch_lessons_error', {
      courseId: req.params.courseId,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to fetch lessons', null, error);
  }
});

// Get lesson by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT l.*, 
       COALESCE(json_agg(
         json_build_object(
           'id', lev.id,
           'levelNumber', lev.level_number,
           'title', lev.title,
           'description', lev.description,
           'difficulty', lev.difficulty,
           'points', lev.points,
           'initialCode', lev.initial_code,
           'expectedOutput', lev.expected_output,
           'isCompleted', false
         ) ORDER BY lev.level_number, 
           CASE lev.difficulty 
             WHEN 'Easy' THEN 1 
             WHEN 'Medium' THEN 2 
             WHEN 'Hard' THEN 3 
           END
       ) FILTER (WHERE lev.id IS NOT NULL), '[]'::json) as levels
       FROM lessons l
       LEFT JOIN levels lev ON lev.lesson_id = l.id
       WHERE l.id = $1
       GROUP BY l.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const row = result.rows[0];
    const lesson = {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty || 'Beginner',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      levels: row.levels || []
    };

    res.json(lesson);
  } catch (error) {
    logger.error('fetch_lesson_error', {
      lessonId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to fetch lesson', null, error);
  }
});

// Create a new lesson with 10 levels (Easy, Medium, Hard for each)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { courseId, title, description, difficulty } = req.body;

    // Check if course exists
    const courseCheck = await client.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (courseCheck.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if lesson with same title already exists in this course
    const existing = await client.query(
      'SELECT id FROM lessons WHERE course_id = $1 AND LOWER(title) = LOWER($2)',
      [courseId, title]
    );
    if (existing.rows.length > 0) {
      await safeRollback(client);
      return res.status(400).json({ error: 'Lesson with this title already exists in this course' });
    }

    // Create lesson
    const lessonResult = await client.query(
      `INSERT INTO lessons (course_id, title, description, difficulty)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [courseId, title, description || '', difficulty || 'Beginner']
    );

    const lessonId = lessonResult.rows[0].id;

    // Don't create levels upfront - they will be created on-demand when code is added
    // This prevents creating empty levels that the user hasn't worked on yet

    await client.query('COMMIT');

    const lesson = {
      id: lessonResult.rows[0].id,
      courseId: lessonResult.rows[0].course_id,
      title: lessonResult.rows[0].title,
      description: lessonResult.rows[0].description,
      difficulty: lessonResult.rows[0].difficulty || 'Beginner',
      createdAt: lessonResult.rows[0].created_at,
      updatedAt: lessonResult.rows[0].updated_at,
      levels: [] // Start with empty levels array - levels will be created on-demand
    };

    res.status(201).json(lesson);
  } catch (error) {
    await safeRollback(client, error);
    logger.error('create_lesson_error', {
      courseId: req.body.courseId,
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    return error(res, 500, 'Failed to create lesson', null, error);
  } finally {
    client.release();
  }
});

// Update a lesson
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    // Check if lesson exists
    const existing = await pool.query('SELECT id, course_id FROM lessons WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Check if title conflicts with another lesson in the same course
    if (title) {
      const titleConflict = await pool.query(
        'SELECT id FROM lessons WHERE course_id = $1 AND LOWER(title) = LOWER($2) AND id != $3',
        [existing.rows[0].course_id, title, id]
      );
      if (titleConflict.rows.length > 0) {
        return res.status(400).json({ error: 'Lesson with this title already exists in this course' });
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE lessons SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    const lesson = {
      id: result.rows[0].id,
      courseId: result.rows[0].course_id,
      title: result.rows[0].title,
      description: result.rows[0].description,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    };

    res.json(lesson);
  } catch (error) {
    logger.error('update_lesson_error', {
      lessonId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to update lesson', null, error);
  }
});

// Delete a lesson
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM lessons WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('delete_lesson_error', {
      lessonId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to delete lesson', null, error);
  }
});

module.exports = router;

