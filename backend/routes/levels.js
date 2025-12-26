const express = require('express');
const router = express.Router();
const pool = require('../db');

const difficultyOrder = { Easy: 0, Medium: 1, Hard: 2 };

const detectTopicsFromCode = (code = '') => {
  const text = code.toLowerCase();
  const topics = new Set();

  if (/(for\s*\(|for\s+\w+\s+in|while\s*\()/.test(text)) topics.add('loops');
  if (/function\s+|\bdef\b/.test(text)) topics.add('functions');
  if (/if\s+.*?else|switch\s*\(|elif\b/.test(text)) topics.add('conditionals');
  if (/\blist\b|\[\]|append\(|array|push\(/.test(text)) topics.add('lists and arrays');
  if (/\bdict\b|\{.*:\s*.*\}|map\(/.test(text)) topics.add('dictionaries');
  if (/print\(|console\.log|input\(/.test(text)) topics.add('input/output');
  if (/["'`][^"'`]*["'`]|\.split\(|\.join\(/.test(text)) topics.add('strings');
  if (/\bMath\./i.test(code) || /[\+\-\*\/%]\s*\w/.test(text)) topics.add('math operations');
  if (/len\(|\.length/.test(text)) topics.add('collections');

  return Array.from(topics);
};

const formatTopicPhrase = (topics = []) => {
  if (!topics.length) return 'core programming skills';
  if (topics.length === 1) return topics[0];
  if (topics.length === 2) return `${topics[0]} and ${topics[1]}`;
  return `${topics.slice(0, -1).join(', ')}, and ${topics[topics.length - 1]}`;
};

const generateLevelOverview = ({ levelNumber, difficulty, points, title, code }) => {
  const safeLevelNumber = levelNumber || 1;
  const safeDifficulty = difficulty || 'Easy';
  // All lesson levels give 20 EXP per level
  const safePoints = points || 20;
  const safeTitle = title || `Level ${safeLevelNumber}`;
  const topics = detectTopicsFromCode(code || '');
  const topicPhrase = formatTopicPhrase(topics);

  const intro = `${safeTitle} (${safeDifficulty} • ${safePoints} pts)`;
  if (topics.length === 0) {
    return `${intro} strengthens your grasp of core programming ideas through short practice problems and guided steps.`;
  }
  return `${intro} focuses on ${topicPhrase}, helping you apply these concepts through concise coding exercises.`;
};

// Create a new level (must be before GET /:id to avoid route conflicts)
router.post('/', async (req, res) => {
  try {
    const { lessonId, levelNumber, difficulty, title, description, points, initialCode, expectedOutput } = req.body;

    // Validate required fields
    if (!lessonId || !levelNumber || !difficulty) {
      return res.status(400).json({ error: 'lessonId, levelNumber, and difficulty are required' });
    }

    // Check if lesson exists
    const lessonCheck = await pool.query('SELECT id FROM lessons WHERE id = $1', [lessonId]);
    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Check if level already exists
    const existing = await pool.query(
      'SELECT id FROM levels WHERE lesson_id = $1 AND level_number = $2 AND difficulty = $3',
      [lessonId, levelNumber, difficulty]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Level already exists' });
    }

    // Calculate points and auto-generate description if needed
    // All lesson levels give 20 EXP per level
    const calculatedPoints = points || 20;
    const levelTitle = title || `Level ${levelNumber} - ${difficulty} Mode`;
    const levelDescription =
      description ||
      generateLevelOverview({
        levelNumber,
        difficulty,
        points: calculatedPoints,
        title: levelTitle,
        code: initialCode
      });

    // Create the level
    const result = await pool.query(
      `INSERT INTO levels (lesson_id, level_number, difficulty, title, description, points, initial_code, expected_output)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [lessonId, levelNumber, difficulty, levelTitle, levelDescription, calculatedPoints, initialCode || null, expectedOutput || null]
    );

    const row = result.rows[0];
    const level = {
      id: row.id,
      levelNumber: row.level_number,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      points: row.points,
      initialCode: row.initial_code,
      expectedOutput: row.expected_output,
      isCompleted: false
    };

    res.status(201).json(level);
  } catch (error) {
    console.error('Error creating level:', error);
    res.status(500).json({ error: 'Failed to create level' });
  }
});

// Get level by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM levels WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Level not found' });
    }

    const row = result.rows[0];
    const level = {
      id: row.id,
      levelNumber: row.level_number,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      points: row.points,
      initialCode: row.initial_code,
      expectedOutput: row.expected_output,
      isCompleted: false
    };

    res.json(level);
  } catch (error) {
    console.error('Error fetching level:', error);
    res.status(500).json({ error: 'Failed to fetch level' });
  }
});

// Update level code and output (or create if it doesn't exist)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { initialCode, expectedOutput, lessonId, levelNumber, difficulty, title, description, points } = req.body;

    // Check if level exists
    const existing = await pool.query('SELECT * FROM levels WHERE id = $1', [id]);
    
    // If level doesn't exist, create it (if we have the required fields)
    if (existing.rows.length === 0) {
      if (!lessonId || !levelNumber || !difficulty) {
        return res.status(404).json({ error: 'Level not found. To create a new level, provide lessonId, levelNumber, and difficulty.' });
      }

      // Check if lesson exists
      const lessonCheck = await pool.query('SELECT id FROM lessons WHERE id = $1', [lessonId]);
      if (lessonCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      // Check if level already exists with same lessonId, levelNumber, and difficulty
      const duplicateCheck = await pool.query(
        'SELECT id FROM levels WHERE lesson_id = $1 AND level_number = $2 AND difficulty = $3',
        [lessonId, levelNumber, difficulty]
      );
      if (duplicateCheck.rows.length > 0) {
        // Use the existing level ID instead
        const existingId = duplicateCheck.rows[0].id;
        const existingLevel = await pool.query('SELECT * FROM levels WHERE id = $1', [existingId]);
        const existingRow = existingLevel.rows[0];
        // Update that level instead
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (levelNumber !== undefined) {
          updates.push(`level_number = $${paramCount++}`);
          values.push(levelNumber);
        }
        if (difficulty !== undefined) {
          updates.push(`difficulty = $${paramCount++}`);
          values.push(difficulty);
        }
        if (title !== undefined) {
          updates.push(`title = $${paramCount++}`);
          values.push(title);
        }
        if (points !== undefined) {
          updates.push(`points = $${paramCount++}`);
          values.push(points);
        }
        if (initialCode !== undefined) {
          updates.push(`initial_code = $${paramCount++}`);
          values.push(initialCode);
        }
        if (expectedOutput !== undefined) {
          updates.push(`expected_output = $${paramCount++}`);
          values.push(expectedOutput);
        }

        const resolvedLevelNumber = levelNumber || existingRow.level_number;
        const resolvedDifficulty = difficulty || existingRow.difficulty;
        const resolvedPoints =
          points ||
          existingRow.points ||
          (resolvedLevelNumber * 10 + (difficultyOrder[resolvedDifficulty] || 0) * 5);
        const resolvedTitle = title || existingRow.title;
        const resolvedCode =
          initialCode !== undefined ? initialCode : existingRow.initial_code;

        if (description !== undefined) {
          updates.push(`description = $${paramCount++}`);
          values.push(description);
        } else {
          updates.push(`description = $${paramCount++}`);
          values.push(
            generateLevelOverview({
              levelNumber: resolvedLevelNumber,
              difficulty: resolvedDifficulty,
              points: resolvedPoints,
              title: resolvedTitle,
              code: resolvedCode
            })
          );
        }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(existingId);
        const result = await pool.query(
          `UPDATE levels SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
          values
        );

        const row = result.rows[0];
        const level = {
          id: row.id,
          levelNumber: row.level_number,
          title: row.title,
          description: row.description,
          difficulty: row.difficulty,
          points: row.points,
          initialCode: row.initial_code,
          expectedOutput: row.expected_output,
          isCompleted: false
        };

        return res.json(level);
      }

      // Create the new level
      // All lesson levels give 20 EXP per level
      const calculatedPoints = points || 20;
      const levelTitle = title || `Level ${levelNumber} - ${difficulty} Mode`;
      const levelDescription =
        description ||
        generateLevelOverview({
          levelNumber,
          difficulty,
          points: calculatedPoints,
          title: levelTitle,
          code: initialCode
        });

      const result = await pool.query(
        `INSERT INTO levels (lesson_id, level_number, difficulty, title, description, points, initial_code, expected_output)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [lessonId, levelNumber, difficulty, levelTitle, levelDescription, calculatedPoints, initialCode || null, expectedOutput || null]
      );

      const row = result.rows[0];
      const level = {
        id: row.id,
        levelNumber: row.level_number,
        title: row.title,
        description: row.description,
        difficulty: row.difficulty,
        points: row.points,
        initialCode: row.initial_code,
        expectedOutput: row.expected_output,
        isCompleted: false
      };

      return res.status(201).json(level);
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (levelNumber !== undefined) {
      updates.push(`level_number = $${paramCount++}`);
      values.push(levelNumber);
    }
    if (difficulty !== undefined) {
      updates.push(`difficulty = $${paramCount++}`);
      values.push(difficulty);
    }
    if (points !== undefined) {
      updates.push(`points = $${paramCount++}`);
      values.push(points);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (initialCode !== undefined) {
      updates.push(`initial_code = $${paramCount++}`);
      values.push(initialCode);
    }
    if (expectedOutput !== undefined) {
      updates.push(`expected_output = $${paramCount++}`);
      values.push(expectedOutput);
    }

    const resolvedLevelNumber = levelNumber || existing.rows[0].level_number;
    const resolvedDifficulty = difficulty || existing.rows[0].difficulty;
    const resolvedPoints =
      points ||
      existing.rows[0].points ||
      (resolvedLevelNumber * 10 + (difficultyOrder[resolvedDifficulty] || 0) * 5);
    const resolvedTitle = title || existing.rows[0].title;
    const resolvedCode =
      initialCode !== undefined ? initialCode : existing.rows[0].initial_code;

    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    } else {
      updates.push(`description = $${paramCount++}`);
      values.push(
        generateLevelOverview({
          levelNumber: resolvedLevelNumber,
          difficulty: resolvedDifficulty,
          points: resolvedPoints,
          title: resolvedTitle,
          code: resolvedCode
        })
      );
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE levels SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    const row = result.rows[0];
    const level = {
      id: row.id,
      levelNumber: row.level_number,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      points: row.points,
      initialCode: row.initial_code,
      expectedOutput: row.expected_output,
      isCompleted: false
    };

    res.json(level);
  } catch (error) {
    console.error('Error updating level:', error);
    res.status(500).json({ error: 'Failed to update level' });
  }
});

module.exports = router;

