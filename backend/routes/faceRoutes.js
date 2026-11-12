const express = require('express');
const router = express.Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const faceController = require('../controllers/faceController');
const { isLuxandConfigured } = require('../config/luxand');
const { auth } = require('../config/firebase');

// Rate limiting: max 30 face detection requests per minute per IP to protect Luxand quota
const faceRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many face detection requests from this IP. Please slow down.',
  },
});

// Configure Multer for in-memory handling with 5MB file size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      const err = new Error('Invalid image file type. Only JPEG, PNG, and WebP are allowed.');
      err.statusCode = 400;
      cb(err, false);
    }
  },
});

/**
 * Optional authentication:
 * If an Authorization Bearer token is provided, verify it with Firebase Admin.
 * If REQUIRE_FACE_AUTH is explicitly set to true in production, enforce it.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      try {
        const decoded = await auth.verifyIdToken(token);
        req.user = decoded;
      } catch (err) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired authentication token.',
        });
      }
    }
  } else if (process.env.REQUIRE_FACE_AUTH === 'true') {
    return res.status(401).json({
      success: false,
      error: 'Authentication required for face detection.',
    });
  }

  next();
};

/**
 * GET /api/face/status
 * Check if Luxand face detection service is configured and ready
 */
router.get('/status', (req, res) => {
  const configured = isLuxandConfigured();
  return res.status(200).json({
    success: true,
    service: 'Luxand.cloud Face Detection',
    ready: configured,
    supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024,
  });
});

/**
 * POST /api/face/detect
 * Detect human faces in a webcam snapshot (supports multipart file 'photo' or JSON base64 'photo')
 */
router.post(
  '/detect',
  faceRateLimiter,
  optionalAuth,
  (req, res, next) => {
    // Attempt multipart single file upload with field 'photo' (or fallback 'image')
    upload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File size exceeds the 5MB upload limit.',
          });
        }
        return res.status(400).json({
          success: false,
          error: `Upload error: ${err.message}`,
        });
      } else if (err) {
        return res.status(err.statusCode || 400).json({
          success: false,
          error: err.message,
        });
      }

      // Normalise req.file if files object exists
      if (req.files) {
        req.file = req.files['photo']?.[0] || req.files['image']?.[0];
      }

      next();
    });
  },
  faceController.detectFace
);

module.exports = router;

