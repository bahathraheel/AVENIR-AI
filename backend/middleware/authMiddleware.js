const { auth } = require('../config/firebase');

/**
 * Authentication Middleware
 * Validates the Firebase ID token passed in the Authorization header.
 * Attaches the verified decoded token payload to req.user.
 * Never trust userId in req.body or req.params; rely on req.user.uid.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token missing. Please provide a valid Bearer token in the Authorization header.',
      });
    }

    const token = authHeader.split('Bearer ')[1]?.trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Malformed Bearer token provided.',
      });
    }

    // Verify token with Firebase Admin
    const decodedToken = await auth.verifyIdToken(token);

    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token: no user ID found.',
      });
    }

    // Attach decoded user information to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || null,
      picture: decodedToken.picture || null,
      emailVerified: decodedToken.email_verified || false,
      claims: decodedToken,
    };

    next();
  } catch (error) {
    // Specific error mapping for Firebase Auth errors
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'Authentication token has expired. Please refresh your session.',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token provided.',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication failed. Please verify your credentials and sign in again.',
    });
  }
};

module.exports = {
  authenticate,
};
