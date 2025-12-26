const { createErrorResponse } = require('./errorHandler');
const logger = require('./logger');

/**
 * Send error response using standardized error handling
 * @param {Object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {Error} originalError - Original error object (optional)
 */
function error(res, status, message, details, originalError = null) {
  // If originalError is provided, use the error handler
  if (originalError) {
    const { statusCode, response } = createErrorResponse(originalError, {
      includeStack: process.env.NODE_ENV === 'development',
      includeDetails: true,
      customMessage: message || null
    });
    return res.status(statusCode).json(response);
  }

  // Legacy support: create response manually
  const payload = { 
    success: false, 
    error: message,
    type: 'INTERNAL_ERROR'
  };
  if (details) {
    payload.details = details;
  }
  return res.status(status).json(payload);
}

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 */
function ok(res, data) {
  return res.status(200).json({ success: true, ...data });
}

module.exports = {
  error,
  ok,
};


