const { auth, db } = require('../config/firebase');

/**
 * POST /api/auth/verify
 * Verifies Firebase token, syncs/creates user profile document in Firestore,
 * and returns user metadata.
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing Bearer token in Authorization header.',
      });
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Empty Bearer token provided.',
      });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { uid, email, name, picture } = decodedToken;

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    const timestamp = new Date().toISOString();
    let userData;

    if (!userSnap.exists) {
      userData = {
        uid,
        email: email || '',
        displayName: name || email?.split('@')[0] || 'Avenir Candidate',
        photoURL: picture || '',
        targetRole: 'Software Engineer',
        optInLeaderboard: true,
        createdAt: timestamp,
        lastLoginAt: timestamp,
        preferences: {
          difficulty: 'medium',
          interviewType: 'technical',
          emailNotifications: true,
        },
      };
      await userRef.set(userData);
    } else {
      userData = userSnap.data();
      // Update last login
      await userRef.update({
        lastLoginAt: timestamp,
        email: email || userData.email,
      });
      userData.lastLoginAt = timestamp;
    }

    return res.status(200).json({
      success: true,
      data: {
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        targetRole: userData.targetRole,
        optInLeaderboard: userData.optInLeaderboard ?? true,
        preferences: userData.preferences || {},
      },
    });
  } catch (error) {
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'Token has expired.',
      });
    }
    return res.status(401).json({
      success: false,
      error: `Token verification failed: ${error.message}`,
    });
  }
};

module.exports = {
  verifyToken,
};
