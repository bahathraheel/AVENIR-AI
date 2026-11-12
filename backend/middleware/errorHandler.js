/**
 * Global Error Handler Middleware
 * Catches unhandled errors across Express routes and formats a uniform response.
 * Safely sanitizes logs to prevent leaking sensitive API keys or credentials.
 */

// Helper to sanitize strings from containing potential secrets in logs
const sanitizeLog = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED_TOKEN]');
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  // Safe logging
  const safeMessage = sanitizeLog(err.message || 'Unknown error');
  console.error(`[Error] ${req.method} ${req.originalUrl} - Status ${statusCode} - ${safeMessage}`);
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(sanitizeLog(err.stack));
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds maximum allowed limit (5MB).',
      });
    }
    return res.status(400).json({
      success: false,
      error: `File upload error: ${err.message}`,
    });
  }

  // Handle Validation errors
  if (err.name === 'ValidationError' || err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({
      success: false,
      error: err.message || 'Validation failed.',
      errors: err.errors || undefined,
    });
  }

  // Handle Firebase or Auth errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('auth/')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication error occurred.',
      code: err.code,
    });
  }

  // Handle Rate Limiter errors
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please slow down and try again later.',
    });
  }

  // Default server error
  return res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected internal server error occurred.',
  });
};

/**
 * 404 Route Not Found Handler
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
  sanitizeLog,
};
