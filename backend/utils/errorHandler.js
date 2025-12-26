const logger = require('./logger');

/**
 * Error classification types
 */
const ErrorType = {
  VALIDATION: 'VALIDATION_ERROR',
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DATABASE: 'DATABASE_ERROR',
  NETWORK: 'NETWORK_ERROR',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  INTERNAL: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST'
};

/**
 * PostgreSQL error codes mapping
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  INVALID_DATETIME_FORMAT: '22007',
  STRING_DATA_RIGHT_TRUNCATED: '22001',
  UNDEFINED_TABLE: '42P01',
  UNDEFINED_COLUMN: '42703',
  UNDEFINED_FUNCTION: '42883',
  DUPLICATE_TABLE: '42P07',
  INSUFFICIENT_PRIVILEGE: '42501',
  CONNECTION_FAILURE: '08000',
  CONNECTION_DOES_NOT_EXIST: '08003',
  CONNECTION_FAILURE_SQLCLIENT: '08006',
  CONNECTION_FAILURE_SQLSERVER: '08001'
};

/**
 * Classify error type based on error properties
 */
function classifyError(error) {
  // Database errors
  if (error.code) {
    if (Object.values(PG_ERROR_CODES).includes(error.code)) {
      return ErrorType.DATABASE;
    }
    // Network errors
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE'].includes(error.code)) {
      return ErrorType.NETWORK;
    }
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return ErrorType.AUTHENTICATION;
  }

  // Validation errors (Zod, etc.)
  if (error.name === 'ZodError' || error.issues) {
    return ErrorType.VALIDATION;
  }

  // HTTP status-based classification
  if (error.status) {
    if (error.status === 401) return ErrorType.AUTHENTICATION;
    if (error.status === 403) return ErrorType.AUTHORIZATION;
    if (error.status === 404) return ErrorType.NOT_FOUND;
    if (error.status === 400) return ErrorType.BAD_REQUEST;
    if (error.status === 429) return ErrorType.RATE_LIMIT;
  }

  // Message-based heuristics (fallback)
  const message = (error.message || '').toLowerCase();
  if (message.includes('not found') || message.includes('does not exist')) {
    return ErrorType.NOT_FOUND;
  }
  if (message.includes('unauthorized') || message.includes('authentication')) {
    return ErrorType.AUTHENTICATION;
  }
  if (message.includes('forbidden') || message.includes('permission')) {
    return ErrorType.AUTHORIZATION;
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorType.VALIDATION;
  }
  if (message.includes('database') || message.includes('relation') || message.includes('column')) {
    return ErrorType.DATABASE;
  }

  return ErrorType.INTERNAL;
}

/**
 * Get user-friendly error message based on error type and details
 */
function getUserFriendlyMessage(error, errorType) {
  // Database errors
  if (errorType === ErrorType.DATABASE) {
    if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
      if (error.constraint === 'users_username_unique') {
        return 'Username already exists';
      }
      if (error.constraint === 'users_email_unique') {
        return 'Email already exists';
      }
      return 'This record already exists';
    }
    if (error.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
      return 'Cannot perform this operation due to related records';
    }
    if (error.code === PG_ERROR_CODES.NOT_NULL_VIOLATION) {
      return 'Required field is missing';
    }
    if (error.code === PG_ERROR_CODES.CONNECTION_FAILURE || 
        error.code === PG_ERROR_CODES.CONNECTION_DOES_NOT_EXIST ||
        error.code === PG_ERROR_CODES.CONNECTION_FAILURE_SQLCLIENT ||
        error.code === PG_ERROR_CODES.CONNECTION_FAILURE_SQLSERVER) {
      return 'Database connection failed. Please try again later.';
    }
    if (error.code === PG_ERROR_CODES.UNDEFINED_TABLE || 
        error.code === PG_ERROR_CODES.UNDEFINED_COLUMN) {
      return 'Database configuration error. Please contact support.';
    }
    return 'Database operation failed. Please try again.';
  }

  // Network errors
  if (errorType === ErrorType.NETWORK) {
    if (error.code === 'ECONNREFUSED') {
      return 'Service unavailable. Please check your connection and try again.';
    }
    if (error.code === 'ETIMEDOUT') {
      return 'Request timed out. Please try again.';
    }
    return 'Network error. Please check your connection and try again.';
  }

  // Authentication errors
  if (errorType === ErrorType.AUTHENTICATION) {
    if (error.name === 'TokenExpiredError') {
      return 'Your session has expired. Please log in again.';
    }
    if (error.name === 'JsonWebTokenError') {
      return 'Invalid authentication token. Please log in again.';
    }
    return 'Authentication failed. Please check your credentials.';
  }

  // Validation errors
  if (errorType === ErrorType.VALIDATION) {
    return 'Invalid input. Please check your data and try again.';
  }

  // Not found errors
  if (errorType === ErrorType.NOT_FOUND) {
    return 'The requested resource was not found.';
  }

  // Authorization errors
  if (errorType === ErrorType.AUTHORIZATION) {
    return 'You do not have permission to perform this action.';
  }

  // Rate limit errors
  if (errorType === ErrorType.RATE_LIMIT) {
    return 'Too many requests. Please slow down and try again later.';
  }

  // Default
  return error.message || 'An unexpected error occurred. Please try again.';
}

/**
 * Get HTTP status code for error type
 */
function getStatusCode(errorType, error) {
  switch (errorType) {
    case ErrorType.VALIDATION:
    case ErrorType.BAD_REQUEST:
      return 400;
    case ErrorType.AUTHENTICATION:
      return 401;
    case ErrorType.AUTHORIZATION:
      return 403;
    case ErrorType.NOT_FOUND:
      return 404;
    case ErrorType.RATE_LIMIT:
      return 429;
    case ErrorType.DATABASE:
    case ErrorType.NETWORK:
    case ErrorType.EXTERNAL_SERVICE:
    case ErrorType.INTERNAL:
    default:
      return 500;
  }
}

/**
 * Create standardized error response
 */
function createErrorResponse(error, options = {}) {
  const {
    includeStack = process.env.NODE_ENV === 'development',
    includeDetails = true,
    customMessage = null,
    userId = null,
    requestId = null
  } = options;

  const errorType = classifyError(error);
  const statusCode = getStatusCode(errorType, error);
  const userMessage = customMessage || getUserFriendlyMessage(error, errorType);

  const response = {
    success: false,
    error: userMessage,
    type: errorType
  };

  // Add details in development or if explicitly requested
  if (includeDetails) {
    const details = {
      code: error.code || null,
      name: error.name || null
    };

    // Add constraint for database errors
    if (error.constraint) {
      details.constraint = error.constraint;
    }

    // Add validation errors if present
    if (error.issues) {
      details.validationErrors = error.issues;
    }

    // Add hint for common errors
    if (errorType === ErrorType.DATABASE) {
      if (error.code === PG_ERROR_CODES.CONNECTION_FAILURE || 
          error.code === PG_ERROR_CODES.CONNECTION_DOES_NOT_EXIST) {
        details.hint = 'Database connection failed. Please check if the database is running.';
      } else if (error.code === PG_ERROR_CODES.UNDEFINED_TABLE || 
                 error.code === PG_ERROR_CODES.UNDEFINED_COLUMN) {
        details.hint = 'Database schema issue. Please check database migrations.';
      }
    } else if (errorType === ErrorType.NETWORK) {
      if (error.code === 'ECONNREFUSED') {
        details.hint = 'Service unavailable. Please check if the service is running.';
      }
    } else if (errorType === ErrorType.EXTERNAL_SERVICE) {
      details.hint = 'External service unavailable. Please try again later.';
    }

    if (Object.keys(details).length > 0) {
      response.details = details;
    }
  }

  // Add stack trace in development
  if (includeStack && error.stack) {
    response.stack = error.stack;
  }

  // Add request tracking
  if (requestId) {
    response.requestId = requestId;
  }

  return {
    statusCode,
    response
  };
}

/**
 * Handle database transaction rollback with proper error handling
 */
async function safeRollback(client, error = null) {
  try {
    await client.query('ROLLBACK');
    if (error) {
      logger.error('transaction_rollback', {
        error: error.message,
        code: error.code,
        stack: error.stack
      });
    }
  } catch (rollbackError) {
    // Log rollback failure but don't throw - we're already in error handling
    logger.error('rollback_failed', {
      originalError: error?.message,
      rollbackError: rollbackError.message,
      rollbackStack: rollbackError.stack
    });
  }
}

/**
 * Handle database savepoint rollback with proper error handling
 */
async function safeRollbackToSavepoint(client, savepointName, error = null) {
  try {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    if (error) {
      logger.error('savepoint_rollback', {
        savepoint: savepointName,
        error: error.message,
        code: error.code
      });
    }
  } catch (rollbackError) {
    logger.error('savepoint_rollback_failed', {
      savepoint: savepointName,
      originalError: error?.message,
      rollbackError: rollbackError.message
    });
  }
}

/**
 * Wrap async route handler with error handling
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ErrorType,
  PG_ERROR_CODES,
  classifyError,
  getUserFriendlyMessage,
  getStatusCode,
  createErrorResponse,
  safeRollback,
  safeRollbackToSavepoint,
  asyncHandler
};

