const { LUXAND_API_URL, getLuxandToken } = require('../config/luxand');

/**
 * Service to interact with the official Luxand.cloud API
 * Endpoint: POST https://api.luxand.cloud/photo/detect
 */
class LuxandService {
  /**
   * Detects faces in an image buffer using official Luxand.cloud API
   *
   * @param {Buffer} imageBuffer - Raw buffer of JPEG, PNG, or WebP image
   * @param {string} mimeType - e.g. 'image/jpeg', 'image/png'
   * @param {number} timeoutMs - Timeout in milliseconds (default 10,000ms)
   * @returns {Promise<Object>} Sanitized face detection result
   */
  async detectFace(imageBuffer, mimeType = 'image/jpeg', timeoutMs = 10000) {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer provided for face detection.');
    }

    const token = getLuxandToken();
    const endpoint = `${LUXAND_API_URL}/photo/detect`;

    // Construct multipart/form-data with photo field as required by Luxand.cloud
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: mimeType });
    formData.append('photo', blob, 'webcam.jpg');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          token: token,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const status = response.status;
      let responseBody;
      const text = await response.text();

      try {
        responseBody = JSON.parse(text);
      } catch (e) {
        responseBody = { raw: text };
      }

      // Handle specific HTTP error status codes
      if (status === 401 || status === 403) {
        const err = new Error('Luxand.cloud API authentication failed: Invalid or expired API token.');
        err.statusCode = 401;
        throw err;
      }

      if (status === 429) {
        const err = new Error('Luxand.cloud API rate limit or quota exceeded. Please try again later.');
        err.statusCode = 429;
        throw err;
      }

      if (status === 400) {
        const errorMsg = responseBody?.message || responseBody?.error || 'Unsupported or invalid image format.';
        const err = new Error(`Luxand face detection error: ${errorMsg}`);
        err.statusCode = 400;
        throw err;
      }

      if (!response.ok) {
        const errorMsg = responseBody?.message || responseBody?.error || `Luxand API returned HTTP ${status}`;
        const err = new Error(`Face detection request failed: ${errorMsg}`);
        err.statusCode = status >= 500 ? 502 : status;
        throw err;
      }

      // Check for Luxand failure response e.g. {"status":"failure","message":"..."}
      if (responseBody && responseBody.status === 'failure') {
        return {
          detected: false,
          facesCount: 0,
          faces: [],
          message: responseBody.message || 'No face detected or image quality too low.',
        };
      }

      // Luxand returns an array of detected face objects
      const rawFaces = Array.isArray(responseBody) ? responseBody : [];

      // Sanitize and return only the necessary detection results to the frontend
      const sanitizedFaces = rawFaces.map((face) => {
        const rect = face.rectangle || face.face_rectangle || {};
        return {
          rectangle: {
            top: typeof rect.top === 'number' ? rect.top : 0,
            left: typeof rect.left === 'number' ? rect.left : 0,
            right: typeof rect.right === 'number' ? rect.right : 0,
            bottom: typeof rect.bottom === 'number' ? rect.bottom : 0,
          },
          age: typeof face.age === 'number' ? Math.round(face.age) : null,
          gender: face.gender?.value || (typeof face.gender === 'string' ? face.gender : 'Unknown'),
          genderConfidence: typeof face.gender?.probability === 'number' ? parseFloat(face.gender.probability.toFixed(3)) : null,
          ageGroup: face.age_group || null,
          expressions: Array.isArray(face.expression)
            ? face.expression.map((exp) => (typeof exp === 'string' ? exp : exp.value)).filter(Boolean)
            : [],
        };
      });

      return {
        detected: sanitizedFaces.length > 0,
        facesCount: sanitizedFaces.length,
        faces: sanitizedFaces,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutError = new Error('Face detection request timed out after 10 seconds.');
        timeoutError.statusCode = 504;
        throw timeoutError;
      }

      throw error;
    }
  }
}

module.exports = new LuxandService();

