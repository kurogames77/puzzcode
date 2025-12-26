/**
 * Error types for frontend error handling
 */
export enum ErrorType {
  NETWORK = 'NETWORK_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  SERVER = 'SERVER_ERROR',
  TIMEOUT = 'TIMEOUT_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR'
}

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public type: ErrorType,
    public details?: any,
    public response?: any
  ) {
    super(message);
    this.name = 'APIError';
    Object.setPrototypeOf(this, APIError.prototype);
  }
}

/**
 * Classify error type from error object
 */
export function classifyError(error: any): ErrorType {
  // Check if it's already an APIError
  if (error instanceof APIError) {
    return error.type;
  }

  // Check for network errors
  if (error.name === 'TypeError' && error.message?.includes('fetch')) {
    return ErrorType.NETWORK;
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return ErrorType.NETWORK;
  }
  if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
    return ErrorType.NETWORK;
  }

  // Check HTTP status codes
  if (error.status || error.response?.status) {
    const status = error.status || error.response?.status;
    if (status === 401) return ErrorType.AUTHENTICATION;
    if (status === 403) return ErrorType.AUTHORIZATION;
    if (status === 404) return ErrorType.NOT_FOUND;
    if (status === 400) return ErrorType.VALIDATION;
    if (status === 500 || status >= 502) return ErrorType.SERVER;
    if (status === 504) return ErrorType.TIMEOUT;
  }

  // Check error type from response
  if (error.response?.type) {
    const type = error.response.type;
    if (type.includes('AUTHENTICATION')) return ErrorType.AUTHENTICATION;
    if (type.includes('AUTHORIZATION')) return ErrorType.AUTHORIZATION;
    if (type.includes('VALIDATION')) return ErrorType.VALIDATION;
    if (type.includes('NOT_FOUND')) return ErrorType.NOT_FOUND;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: any, errorType: ErrorType): string {
  // Check if there's a custom message in the response
  if (error.response?.error) {
    return error.response.error;
  }
  if (error.message && !error.message.includes('fetch')) {
    return error.message;
  }

  // Type-specific messages
  switch (errorType) {
    case ErrorType.NETWORK:
      return 'Network error. Please check your internet connection and try again.';
    case ErrorType.AUTHENTICATION:
      return 'Your session has expired. Please log in again.';
    case ErrorType.AUTHORIZATION:
      return 'You do not have permission to perform this action.';
    case ErrorType.VALIDATION:
      return 'Invalid input. Please check your data and try again.';
    case ErrorType.NOT_FOUND:
      return 'The requested resource was not found.';
    case ErrorType.SERVER:
      return 'Server error. Please try again later.';
    case ErrorType.TIMEOUT:
      return 'Request timed out. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any, errorType: ErrorType): boolean {
  // Network errors are usually retryable
  if (errorType === ErrorType.NETWORK) {
    return true;
  }

  // Timeout errors are retryable
  if (errorType === ErrorType.TIMEOUT) {
    return true;
  }

  // Server errors (5xx) are retryable, except 501 (Not Implemented)
  if (errorType === ErrorType.SERVER) {
    const status = error.status || error.response?.status;
    return status !== 501;
  }

  // Rate limit errors (429) are retryable after delay
  if (error.status === 429 || error.response?.status === 429) {
    return true;
  }

  return false;
}

/**
 * Get retry delay in milliseconds
 */
export function getRetryDelay(attempt: number, baseDelay: number = 1000): number {
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
}

/**
 * Create APIError from fetch error
 */
export function createAPIError(error: any, response?: any): APIError {
  const errorType = classifyError(error);
  const status = error.status || response?.status || 500;
  const message = getUserFriendlyMessage(error, errorType);
  const details = error.response?.details || error.details;

  return new APIError(message, status, errorType, details, response || error.response);
}

/**
 * Log error for debugging (only in development)
 */
export function logError(error: any, context?: string) {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[Error${context ? ` in ${context}` : ''}]:`, {
      error,
      message: error.message,
      stack: error.stack,
      type: error instanceof APIError ? error.type : classifyError(error),
      status: error.status || error.response?.status,
      details: error.details || error.response?.details
    });
  }
}

