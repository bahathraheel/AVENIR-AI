const luxandService = require('../services/luxandService');

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Parses and extracts image buffer and MIME type from either multipart file or base64 payload
 */
const extractImagePayload = (req) => {
  // Option 1: File upload via Multer (multipart/form-data)
  if (req.file) {
    return {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || 'image/jpeg',
      size: req.file.size || req.file.buffer.length,
    };
  }

  // Option 2: JSON payload with base64 string (webcam canvas snapshot)
  const base64String = req.body?.photo || req.body?.image;
  if (typeof base64String === 'string' && base64String.trim().length > 0) {
    let cleanBase64 = base64String.trim();
    let mimeType = 'image/jpeg';

    // Parse data URL prefix if present (e.g. data:image/png;base64,...)
    const dataUrlMatch = cleanBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1].toLowerCase();
      cleanBase64 = dataUrlMatch[2];
    }

    try {
      const buffer = Buffer.from(cleanBase64, 'base64');
      return {
        buffer,
        mimeType,
        size: buffer.length,
      };
    } catch (e) {
      return null;
    }
  }

  return null;
};

/**
 * Controller to handle face detection for webcam images
 * POST /api/face/detect
 */
const detectFace = async (req, res, next) => {
  try {
    const payload = extractImagePayload(req);

    if (!payload || !payload.buffer || payload.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image provided. Please upload a photo file or send a base64 encoded webcam image.',
      });
    }

    // Image size restriction
    if (payload.size > MAX_IMAGE_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: `Image size exceeds the 5MB limit (received ${(payload.size / (1024 * 1024)).toFixed(2)}MB).`,
      });
    }

    // MIME type validation
    const normalizedMime = payload.mimeType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported image format (${normalizedMime}). Supported formats: JPEG, PNG, WebP.`,
      });
    }

    // Call Luxand.cloud API
    const result = await luxandService.detectFace(payload.buffer, normalizedMime);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Preserve custom status code from service if available
    const statusCode = error.statusCode || 500;
    const sanitizedMessage = error.message
      ? error.message.replace(/[a-zA-Z0-9_-]{20,}/g, '[REDACTED]')
      : 'Face detection failed due to an internal error.';

    return res.status(statusCode).json({
      success: false,
      error: sanitizedMessage,
    });
  }
};

module.exports = {
  detectFace,
};

