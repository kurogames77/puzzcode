const jwt = require('jsonwebtoken');
const pool = require('../db');
const logger = require('../utils/logger');

// JWT secret key (should be in .env in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to verify JWT token
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user from database to ensure they still exist and are active
    const userResult = await pool.query(
      'SELECT id, username, email, user_type, school_id, first_name, last_name, avatar_url, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn('auth_invalid_token', {
        error: error.message
      });
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token',
        type: 'AUTHENTICATION_ERROR'
      });
    }
    if (error.name === 'TokenExpiredError') {
      logger.warn('auth_token_expired', {
        error: error.message
      });
      return res.status(401).json({ 
        success: false,
        error: 'Token expired',
        type: 'AUTHENTICATION_ERROR'
      });
    }
    logger.error('auth_middleware_error', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    return res.status(500).json({ 
      success: false,
      error: 'Authentication error',
      type: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Middleware to check if user is admin
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.user_type !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

/**
 * Middleware to check if user is student
 */
const requireStudent = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.user_type !== 'student') {
    return res.status(403).json({ error: 'Student access required' });
  }

  next();
};

/**
 * Generate JWT token for user
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireStudent,
  generateToken,
  JWT_SECRET
};

