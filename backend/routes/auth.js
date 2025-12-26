const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { generateToken, authenticateToken, requireStudent } = require('../middleware/auth');
const { safeRollback } = require('../utils/errorHandler');
const { error } = require('../utils/http');
const logger = require('../utils/logger');

// Validation helpers
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  if (password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters long' };
  }
  return { isValid: true };
};

const validateUsername = (username) => {
  if (username.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }
  return { isValid: true };
};

// ============================================================
// REGISTER / SIGNUP
// ============================================================
router.post('/register', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if body exists
    if (!req.body || typeof req.body !== 'object') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        errors: { 
          general: 'Invalid request body. Please ensure Content-Type is application/json and body is valid JSON.' 
        } 
      });
    }

    const { username, email, password, confirmPassword, userType, schoolId, firstName, lastName } = req.body;

    // Validation
    const errors = {};

    // Validate required fields
    if (!username || (typeof username === 'string' && username.trim() === '')) {
      errors.username = 'Username is required';
    } else {
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.isValid) {
        errors.username = usernameValidation.error;
      } else {
        // Check if username exists
        const usernameCheck = await client.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
        if (usernameCheck.rows.length > 0) {
          errors.username = 'Username already exists';
        }
      }
    }

    // Validate email
    if (!email || (typeof email === 'string' && email.trim() === '')) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      errors.email = 'Please enter a valid email address';
    } else {
      // Check if email exists
      const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
      if (emailCheck.rows.length > 0) {
        errors.email = 'Email already exists';
      }
    }

    // Validate password
    if (!password) {
      errors.password = 'Password is required';
    } else {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        errors.password = passwordValidation.error;
      }
    }

    // Validate confirm password
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // Validate first name
    if (!firstName || (typeof firstName === 'string' && firstName.trim() === '')) {
      errors.firstName = 'First name is required';
    }

    // Validate last name
    if (!lastName || (typeof lastName === 'string' && lastName.trim() === '')) {
      errors.lastName = 'Last name is required';
    }

    // Validate user type
    const validUserType = userType || 'student';
    if (!['student', 'admin'].includes(validUserType)) {
      errors.userType = 'Invalid user type';
    }

    // Validate school ID (use username if not provided, but check uniqueness)
    const finalSchoolId = schoolId || username;
    if (finalSchoolId) {
      const schoolIdCheck = await client.query('SELECT id FROM users WHERE school_id = $1', [finalSchoolId.trim()]);
      if (schoolIdCheck.rows.length > 0) {
        errors.schoolId = 'School ID already exists';
      }
    }

    // If there are errors, return them
    if (Object.keys(errors).length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user with all fields
    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, user_type, school_id, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, email, user_type, school_id, first_name, last_name, avatar_url, created_at, is_active`,
      [
        username.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        validUserType,
        finalSchoolId ? finalSchoolId.trim() : null,
        firstName.trim(),
        lastName.trim(),
        true // is_active
      ]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Failed to create user');
    }

    const newUser = userResult.rows[0];

    // Generate JWT token
    const token = generateToken(newUser.id);

    // Update last login
    await client.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [newUser.id]);

    await client.query('COMMIT');

    // Return user data (without password)
    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        userType: newUser.user_type,
        schoolId: newUser.school_id,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        avatarUrl: newUser.avatar_url,
        createdAt: newUser.created_at
      },
      token
    });
  } catch (error) {
    await safeRollback(client, error);
    logger.error('registration_error', {
      error: error.message,
      code: error.code,
      constraint: error.constraint,
      stack: error.stack
    });
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      if (error.constraint === 'users_username_unique') {
        return res.status(400).json({ success: false, errors: { username: 'Username already exists' } });
      }
      if (error.constraint === 'users_email_unique') {
        return res.status(400).json({ success: false, errors: { email: 'Email already exists' } });
      }
    }
    
    return error(res, 500, 'Failed to register user. Please try again.', null, error);
  } finally {
    client.release();
  }
});

// ============================================================
// LOGIN
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be username, email, or schoolId

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Username/email and password are required' });
    }

    // Find user by username, email, or school_id (trim and normalize)
    const normalizedIdentifier = identifier.trim();
    const userResult = await pool.query(
      `SELECT id, username, email, password_hash, user_type, school_id, first_name, last_name, 
              avatar_url, is_active, created_at, last_login
       FROM users 
       WHERE username = $1 OR email = $1 OR school_id = $1`,
      [normalizedIdentifier]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Record session start
    const xForwardedFor = req.headers['x-forwarded-for'];
    const requestIp = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]
      : typeof xForwardedFor === 'string'
        ? xForwardedFor.split(',')[0]
        : null;
    const clientIp = (requestIp || req.ip || '').trim();
    const userAgent = req.get('user-agent') || null;

    try {
      await pool.query(
        `INSERT INTO user_sessions (user_id, ip_address, user_agent)
         VALUES ($1, $2::inet, $3)`,
        [user.id, clientIp || null, userAgent]
      );
    } catch (sessionError) {
      console.error('Failed to record user session start:', sessionError);
      // Continue without failing login to avoid locking users out
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Return user data (without password)
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        userType: user.user_type,
        schoolId: user.school_id,
        firstName: user.first_name,
        lastName: user.last_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        lastLogin: user.last_login
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Failed to login' });
  }
});

// ============================================================
// GET CURRENT USER (Protected Route)
// ============================================================
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // User is already attached to req by authenticateToken middleware
    const user = req.user;

    // Optionally fetch additional data like statistics
    if (user.user_type === 'student') {
      const statsResult = await pool.query(
        'SELECT * FROM student_statistics WHERE user_id = $1',
        [user.id]
      );

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          userType: user.user_type,
          schoolId: user.school_id,
          firstName: user.first_name,
          lastName: user.last_name,
          avatarUrl: user.avatar_url
        },
        statistics: statsResult.rows[0] || null
      });
    } else {
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          userType: user.user_type,
          schoolId: user.school_id,
          firstName: user.first_name,
          lastName: user.last_name,
          avatarUrl: user.avatar_url
        }
      });
    }
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user data' });
  }
});

// ============================================================
// UPDATE USER PROFILE (Protected Route)
// ============================================================
router.put('/profile', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { username, email, schoolId, firstName, lastName, avatarUrl } = req.body;

    const errors = {};
    const updates = [];
    const values = [];
    let paramCount = 1;

    // Validate and update username
    if (username !== undefined) {
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.isValid) {
        errors.username = usernameValidation.error;
      } else {
        // Check if username is taken by another user
        const usernameCheck = await client.query(
          'SELECT id FROM users WHERE username = $1 AND id != $2',
          [username, userId]
        );
        if (usernameCheck.rows.length > 0) {
          errors.username = 'Username already exists';
        } else {
          updates.push(`username = $${paramCount++}`);
          values.push(username);
        }
      }
    }

    // Validate and update email
    if (email !== undefined) {
      if (!isValidEmail(email)) {
        errors.email = 'Please enter a valid email address';
      } else {
        // Check if email is taken by another user
        const emailCheck = await client.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, userId]
        );
        if (emailCheck.rows.length > 0) {
          errors.email = 'Email already exists';
        } else {
          updates.push(`email = $${paramCount++}`);
          values.push(email);
        }
      }
    }

    // Validate and update school ID
    if (schoolId !== undefined) {
      const schoolIdCheck = await client.query(
        'SELECT id FROM users WHERE school_id = $1 AND id != $2',
        [schoolId, userId]
      );
      if (schoolIdCheck.rows.length > 0) {
        errors.schoolId = 'School ID already exists';
      } else {
        updates.push(`school_id = $${paramCount++}`);
        values.push(schoolId || null);
      }
    }

    // Update other fields
    if (firstName !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(firstName || null);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(lastName || null);
    }
    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramCount++}`);
      values.push(avatarUrl || null);
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors });
    }

    // If no updates, return success
    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'No changes to update' });
    }

    // Add user ID for WHERE clause
    values.push(userId);

    // Update user
    const result = await client.query(
      `UPDATE users 
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING id, username, email, user_type, school_id, first_name, last_name, avatar_url, updated_at`,
      values
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        userType: result.rows[0].user_type,
        schoolId: result.rows[0].school_id,
        firstName: result.rows[0].first_name,
        lastName: result.rows[0].last_name,
        avatarUrl: result.rows[0].avatar_url,
        updatedAt: result.rows[0].updated_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  } finally {
    client.release();
  }
});

// ============================================================
// CHANGE PASSWORD (Protected Route)
// ============================================================
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'All password fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'New passwords do not match' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ success: false, error: passwordValidation.error });
    }

    // Get current password hash
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

// ============================================================
// LOGOUT (Optional - mainly for token invalidation if using token blacklist)
// ============================================================
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE user_sessions
       SET session_end = CURRENT_TIMESTAMP,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - session_start))::INTEGER
       WHERE id = (
         SELECT id FROM user_sessions
         WHERE user_id = $1 AND session_end IS NULL
         ORDER BY session_start DESC
         LIMIT 1
       )`,
      [req.user.id]
    );
  } catch (error) {
    console.error('Failed to record user session end:', error);
    return res.status(500).json({ success: false, error: 'Failed to logout user session' });
  }

  // In a stateless JWT system, logout is also handled client-side by removing the token
  res.json({ success: true, message: 'Logged out successfully' });
});

// ============================================================
// GET USER STATISTICS (Protected Route)
// ============================================================
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (req.user.user_type !== 'student') {
      return res.json({
        success: true,
        statistics: {
          totalCourses: 0, // Languages engaged
          lessonsCompleted: 0,
          currentStreak: 0,
          totalPoints: 0,
          multiplayerWins: 0,
          studentRank: 'N/A'
        }
      });
    }

    // Get student statistics
    const statsResult = await pool.query(
      `SELECT 
        COALESCE(exp, 0) as exp,
        COALESCE(current_streak, 0) as current_streak,
        COALESCE(rank_name, 'novice') as rank_name,
        COALESCE(normalized_exp, 0.0) as normalized_exp,
        COALESCE(rank_index, 0) as rank_index
       FROM student_statistics 
       WHERE user_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0] || {
      exp: 0,
      current_streak: 0,
      rank_name: 'novice',
      normalized_exp: 0.0,
      rank_index: 0
    };

    // Recalculate rank from EXP to ensure it's always up-to-date
    const { getRankFromExp, normalizeExp } = require('../services/expRankService');
    const currentRank = getRankFromExp(stats.exp);
    const currentNormalizedExp = normalizeExp(stats.exp);
    
    // Update database if rank is out of sync
    if (currentRank.rankName !== stats.rank_name || currentRank.rankIndex !== stats.rank_index) {
      await pool.query(
        `UPDATE student_statistics
         SET rank_name = $1,
             rank_index = $2,
             normalized_exp = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4`,
        [currentRank.rankName, currentRank.rankIndex, currentNormalizedExp, userId]
      );
      // Use the recalculated rank
      stats.rank_name = currentRank.rankName;
    }

    // Count distinct lessons completed (lessons where user completed at least one level)
    const lessonsResult = await pool.query(
      `SELECT COUNT(DISTINCT llc.lesson_id) as lessons_completed
       FROM lesson_level_completions llc
       WHERE llc.user_id = $1`,
      [userId]
    );
    const lessonsCompleted = parseInt(lessonsResult.rows[0]?.lessons_completed || 0);

    // Count distinct languages (courses) that the student has engaged with
    // Each course represents a programming language
    const languagesResult = await pool.query(
      `SELECT COUNT(DISTINCT c.name) as total_languages
       FROM lesson_level_completions llc
       JOIN lessons l ON l.id = llc.lesson_id
       JOIN courses c ON c.id = l.course_id
       WHERE llc.user_id = $1`,
      [userId]
    );
    const totalLanguages = parseInt(languagesResult.rows[0]?.total_languages || 0);

    // Count multiplayer wins
    const winsResult = await pool.query(
      `SELECT COUNT(*) as wins
       FROM multiplayer_match_participants
       WHERE user_id = $1 AND is_winner = true`,
      [userId]
    );
    const multiplayerWins = parseInt(winsResult.rows[0]?.wins || 0);

    // Get recent courses with progress (top 5 by completion date)
    const recentCoursesResult = await pool.query(
      `SELECT DISTINCT
        c.id as course_id,
        c.name as course_name,
        MAX(llc.completed_at) as last_activity
       FROM lesson_level_completions llc
       JOIN lessons l ON l.id = llc.lesson_id
       JOIN courses c ON c.id = l.course_id
       WHERE llc.user_id = $1
       GROUP BY c.id, c.name
       ORDER BY last_activity DESC
       LIMIT 5`,
      [userId]
    );

    // For each course, calculate detailed progress
    const recentCourses = await Promise.all(
      recentCoursesResult.rows.map(async (row) => {
        // Get all lessons for this course
        const lessonsResult = await pool.query(
          `SELECT id FROM lessons WHERE course_id = $1`,
          [row.course_id]
        );
        
        let totalLevels = 0
        let completedLevels = 0
        
        // Calculate progress across all lessons in the course
        for (const lesson of lessonsResult.rows) {
          const levelsResult = await pool.query(
            `SELECT COUNT(DISTINCT level_number) as total
             FROM levels WHERE lesson_id = $1`,
            [lesson.id]
          );
          const completedResult = await pool.query(
            `SELECT COUNT(DISTINCT level_number) as completed
             FROM lesson_level_completions
             WHERE lesson_id = $1 AND user_id = $2`,
            [lesson.id, userId]
          );
          
          totalLevels += parseInt(levelsResult.rows[0]?.total || 0)
          completedLevels += parseInt(completedResult.rows[0]?.completed || 0)
        }
        
        const progress = totalLevels > 0 ? Math.round((completedLevels / totalLevels) * 100) : 0
        
        return {
          courseId: row.course_id,
          name: row.course_name,
          progress,
          totalLessons: lessonsResult.rows.length
        }
      })
    )

    res.json({
      success: true,
      statistics: {
        totalCourses: totalLanguages, // This now represents languages engaged
        lessonsCompleted,
        currentStreak: stats.current_streak || 0,
        totalPoints: stats.exp || 0,
        multiplayerWins,
        studentRank: stats.rank_name || 'novice'
      },
      recentCourses
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

router.get('/statistics/performance', authenticateToken, requireStudent, async (req, res) => {
  try {
    const userId = req.user.id;
    const DAYS = 30;

    const completionTrendResult = await pool.query(
      `SELECT 
         (date_trunc('day', completed_at AT TIME ZONE 'UTC'))::date AS day,
         COUNT(*)::int AS completions
       FROM lesson_level_completions
       WHERE user_id = $1
         AND completed_at >= NOW() - INTERVAL '30 days'
       GROUP BY day
       ORDER BY day`,
      [userId]
    );

    const difficultyResult = await pool.query(
      `SELECT difficulty, COUNT(*)::int AS count
       FROM lesson_level_completions
       WHERE user_id = $1
       GROUP BY difficulty`,
      [userId]
    );

    const dailyAttemptResult = await pool.query(
      `SELECT 
         (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date AS day,
         COUNT(*)::int AS attempts,
         COUNT(*) FILTER (WHERE success)::int AS successes,
         COUNT(*) FILTER (WHERE NOT success)::int AS fails
       FROM puzzle_attempt
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY day
       ORDER BY day`,
      [userId]
    );

    const languageStatsResult = await pool.query(
      `SELECT 
         c.id AS course_id,
         c.name AS course_name,
         COUNT(*)::int AS total_attempts,
         COUNT(*) FILTER (WHERE pa.success)::int AS success_count,
         COUNT(*) FILTER (WHERE NOT pa.success)::int AS fail_count
       FROM puzzle_attempt pa
       JOIN lessons l ON l.id = pa.lesson_id
       JOIN courses c ON c.id = l.course_id
       WHERE pa.user_id = $1
         AND pa.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY c.id, c.name
       ORDER BY c.name`,
      [userId]
    );

    const completionsByDate = new Map();
    completionTrendResult.rows.forEach((row) => {
      const iso = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day;
      completionsByDate.set(iso, Number(row.completions || 0));
    });

    const attemptsByDate = new Map();
    dailyAttemptResult.rows.forEach((row) => {
      const iso = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day;
      attemptsByDate.set(iso, {
        attempts: Number(row.attempts || 0),
        successes: Number(row.successes || 0),
        fails: Number(row.fails || 0),
      });
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
    const trend = [];
    let cumulative = 0;

    for (let i = DAYS - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const iso = day.toISOString().slice(0, 10);
      const completions = completionsByDate.get(iso) || 0;
      const attemptStats = attemptsByDate.get(iso) || { attempts: 0, successes: 0, fails: 0 };
      cumulative += completions;
      trend.push({
        date: iso,
        label: formatter.format(day),
        completions,
        cumulative,
        attempts: attemptStats.attempts,
        successes: attemptStats.successes,
        fails: attemptStats.fails,
      });
    }

    const activeDays = trend.filter((point) => point.completions > 0).length;
    const lastSeven = trend.slice(-7);
    const weeklyAverageRaw =
      lastSeven.reduce((sum, point) => sum + point.completions, 0) /
      (lastSeven.length || 1);
    const weeklyAverage = Number(weeklyAverageRaw.toFixed(1));

    const bestPoint = trend.reduce(
      (best, point) =>
        point.completions > (best?.completions || 0) ? point : best,
      null
    );
    const bestDay = bestPoint
      ? {
          date: bestPoint.date,
          label: bestPoint.label,
          completions: bestPoint.completions,
        }
      : null;

    let currentStreak = 0;
    for (let i = trend.length - 1; i >= 0; i--) {
      if (trend[i].completions > 0) {
        currentStreak += 1;
      } else {
        break;
      }
    }

    const difficultyMap = difficultyResult.rows.reduce((acc, row) => {
      acc[row.difficulty] = Number(row.count || 0);
      return acc;
    }, {});
    const totalDifficultyCompletions = Object.values(difficultyMap).reduce(
      (sum, count) => sum + count,
      0
    );
    const difficultyBreakdown = ['Easy', 'Medium', 'Hard'].map((label) => {
      const count = difficultyMap[label] || 0;
      const percent =
        totalDifficultyCompletions > 0
          ? Number(((count / totalDifficultyCompletions) * 100).toFixed(1))
          : 0;
      return { label, count, percent };
    });

    const languageBreakdown = languageStatsResult.rows.map((row) => ({
      courseId: row.course_id,
      name: row.course_name,
      attempts: Number(row.total_attempts || 0),
      successes: Number(row.success_count || 0),
      errors: Number(row.fail_count || 0),
    }));

    return res.json({
      success: true,
      performance: {
        trend,
        summary: {
          totalCompletions: cumulative,
          weeklyAverage,
          activeDays,
          currentStreak,
          bestDay,
          difficultyBreakdown,
          daysTracked: DAYS,
          languageBreakdown,
        },
      },
    });
  } catch (err) {
    logger.error('student_performance_stats_error', {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack,
    });
    return error(res, 500, 'Failed to load performance statistics');
  }
});

router.post('/session/heartbeat', authenticateToken, async (req, res) => {
  try {
    const sessionResult = await pool.query(
      `SELECT id, session_start, session_end
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY session_start DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (sessionResult.rows.length === 0) {
      return res.json({ success: true, updated: false });
    }

    const session = sessionResult.rows[0];

    await pool.query(
      `UPDATE user_sessions
       SET session_end = NULL,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - session_start))::INTEGER
       WHERE id = $1`,
      [session.id]
    );

    res.json({
      success: true,
      updated: true,
      sessionClosedPreviously: session.session_end !== null
    });
  } catch (error) {
    console.error('Failed to heartbeat session:', error);
    res.status(500).json({ success: false, error: 'Failed to update session' });
  }
});

// ============================================================
// GET ADMIN STATISTICS (Protected Route - Admin Only)
// ============================================================
router.get('/admin/statistics', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied. Admin only.' });
    }

    // Get total user count
    const userCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE user_type = $1',
      ['student']
    );
    const totalUsers = parseInt(userCountResult.rows[0]?.count || 0);

    // Get total courses count
    const coursesCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM courses WHERE status = $1',
      ['Active']
    );
    const totalCourses = parseInt(coursesCountResult.rows[0]?.count || 0);

    // Get total courses (all statuses)
    const allCoursesCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM courses'
    );
    const totalCoursesHandled = parseInt(allCoursesCountResult.rows[0]?.count || 0);

    // Get total lessons count
    const lessonsCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM lessons'
    );
    const totalLessons = parseInt(lessonsCountResult.rows[0]?.count || 0);

    // Get active levels count (for now, all levels are considered active)
    const levelsCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM levels'
    );
    const activeLevels = parseInt(levelsCountResult.rows[0]?.count || 0);

    // Get total students enrolled (students who have completed at least one level)
    const studentsEnrolledResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM lesson_level_completions'
    );
    const totalStudentsEnrolled = parseInt(studentsEnrolledResult.rows[0]?.count || 0);

    // Get enrollment data per course (students who have completed at least one level in each course)
    const enrollmentResult = await pool.query(
      `SELECT 
        c.id,
        c.name,
        COUNT(DISTINCT llc.user_id) as students
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id
      LEFT JOIN lesson_level_completions llc ON llc.lesson_id = l.id
      WHERE c.status = 'Active'
      GROUP BY c.id, c.name
      ORDER BY c.name`
    );

    const enrollmentData = enrollmentResult.rows.map(row => ({
      name: row.name,
      students: parseInt(row.students || 0)
    }));

    res.json({
      success: true,
      statistics: {
        totalUsers,
        totalCourses,
        totalCoursesHandled,
        totalLessons,
        activeLevels,
        totalStudentsEnrolled,
        enrollmentData
      }
    });
  } catch (error) {
    console.error('Get admin statistics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch admin statistics' });
  }
});

module.exports = router;

