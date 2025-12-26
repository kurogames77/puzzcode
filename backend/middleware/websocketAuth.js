/**
 * WebSocket Authentication Middleware
 * Authenticates Socket.IO connections using JWT tokens
 */

const jwt = require('jsonwebtoken');
const pool = require('../db');
const logger = require('../utils/logger');
const { JWT_SECRET } = require('./auth');

/**
 * Authenticate WebSocket connection
 * @param {object} socket - Socket.IO socket instance
 * @param {function} next - Next middleware function
 */
async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user from database
    const userResult = await pool.query(
      'SELECT id, username, email, user_type, school_id, first_name, last_name, avatar_url, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return next(new Error('User not found'));
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return next(new Error('Account is deactivated'));
    }

    // Attach user to socket
    socket.user = user;
    socket.userId = user.id;

    logger.log('websocket_authenticated', {
      userId: user.id,
      username: user.username,
      socketId: socket.id
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn('websocket_invalid_token', {
        error: error.message,
        socketId: socket.id
      });
      return next(new Error('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      logger.warn('websocket_token_expired', {
        error: error.message,
        socketId: socket.id
      });
      return next(new Error('Token expired'));
    }
    logger.error('websocket_auth_error', {
      error: error.message,
      stack: error.stack,
      socketId: socket.id
    });
    return next(new Error('Authentication error'));
  }
}

module.exports = {
  authenticateSocket
};

