const express = require('express');
const router = express.Router();
const pool = require('../db');
const { safeRollback } = require('../utils/errorHandler');
const { error } = require('../utils/http');
const logger = require('../utils/logger');

// Get all courses
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
       COALESCE(json_agg(
         json_build_object(
           'id', l.id,
           'courseId', l.course_id,
           'title', l.title,
           'description', l.description,
           'difficulty', l.difficulty,
           'createdAt', l.created_at,
           'updatedAt', l.updated_at,
           'levels', (
             SELECT COALESCE(json_agg(
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
             ), '[]'::json)
             FROM levels lev
             WHERE lev.lesson_id = l.id
           )
         ) ORDER BY l.created_at
       ) FILTER (WHERE l.id IS NOT NULL), '[]'::json) as lessons
       FROM courses c
       LEFT JOIN lessons l ON l.course_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at`
    );

    const courses = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      students: row.students,
      status: row.status,
      summary: row.summary,
      icon: row.icon,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lessons: row.lessons || []
    }));

    res.json(courses);
  } catch (error) {
    logger.error('fetch_courses_error', {
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to fetch courses', null, error);
  }
});

// Get course by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT c.*, 
       COALESCE(json_agg(
         json_build_object(
           'id', l.id,
           'courseId', l.course_id,
           'title', l.title,
           'description', l.description,
           'difficulty', l.difficulty,
           'createdAt', l.created_at,
           'updatedAt', l.updated_at,
           'levels', (
             SELECT COALESCE(json_agg(
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
             ), '[]'::json)
             FROM levels lev
             WHERE lev.lesson_id = l.id
           )
         ) ORDER BY l.created_at
       ) FILTER (WHERE l.id IS NOT NULL), '[]'::json) as lessons
       FROM courses c
       LEFT JOIN lessons l ON l.course_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const row = result.rows[0];
    const course = {
      id: row.id,
      name: row.name,
      students: row.students,
      status: row.status,
      summary: row.summary,
      icon: row.icon,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lessons: row.lessons || []
    };

    res.json(course);
  } catch (error) {
    logger.error('fetch_course_error', {
      courseId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to fetch course', null, error);
  }
});

// Create a new course
router.post('/', async (req, res) => {
  try {
    const { name, students, status, summary, icon } = req.body;

    // Check if course with same name already exists
    const existing = await pool.query(
      'SELECT id FROM courses WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Course with this name already exists' });
    }

    const result = await pool.query(
      `INSERT INTO courses (name, students, status, summary, icon)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, students || 0, status || 'Active', summary || '', icon || '']
    );

    const course = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      students: result.rows[0].students,
      status: result.rows[0].status,
      summary: result.rows[0].summary,
      icon: result.rows[0].icon,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
      lessons: []
    };

    res.status(201).json(course);
  } catch (error) {
    logger.error('create_course_error', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    return error(res, 500, 'Failed to create course', null, error);
  }
});

// Update a course
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, students, status, summary, icon } = req.body;

    // Check if course exists
    const existing = await pool.query('SELECT id FROM courses WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if name conflicts with another course
    if (name) {
      const nameConflict = await pool.query(
        'SELECT id FROM courses WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, id]
      );
      if (nameConflict.rows.length > 0) {
        return res.status(400).json({ error: 'Course with this name already exists' });
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (students !== undefined) {
      updates.push(`students = $${paramCount++}`);
      values.push(students);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (summary !== undefined) {
      updates.push(`summary = $${paramCount++}`);
      values.push(summary);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramCount++}`);
      values.push(icon);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE courses SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    const course = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      students: result.rows[0].students,
      status: result.rows[0].status,
      summary: result.rows[0].summary,
      icon: result.rows[0].icon,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    };

    res.json(course);
  } catch (error) {
    logger.error('update_course_error', {
      courseId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to update course', null, error);
  }
});

// Delete a course
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM courses WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('delete_course_error', {
      courseId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to delete course', null, error);
  }
});

// Reset all course student counts
router.post('/reset-student-counts', async (req, res) => {
  try {
    await pool.query('UPDATE courses SET students = 0');
    res.json({ success: true });
  } catch (error) {
    logger.error('reset_student_counts_error', {
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to reset student counts', null, error);
  }
});

// Recalculate all course student counts
router.post('/recalculate-student-counts', async (req, res) => {
  try {
    // Update each course's student count based on actual completions
    await pool.query(
      `UPDATE courses c
       SET students = (
         SELECT COUNT(DISTINCT llc.user_id)
         FROM lesson_level_completions llc
         JOIN lessons l ON l.id = llc.lesson_id
         WHERE l.course_id = c.id
       ),
       updated_at = CURRENT_TIMESTAMP`
    );
    res.json({ success: true, message: 'Student counts recalculated for all courses' });
  } catch (error) {
    logger.error('recalculate_student_counts_error', {
      error: error.message,
      stack: error.stack
    });
    return error(res, 500, 'Failed to recalculate student counts', null, error);
  }
});

module.exports = router;

