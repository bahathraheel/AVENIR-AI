const { db } = require('../config/firebase');
const { validateProfile, sanitizeString } = require('../utils/validators');

/**
 * GET /api/user/profile
 * Fetches user profile data from Firestore
 */
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.uid;

    const userDocRef = db.collection('users').doc(userId);
    const docSnap = await userDocRef.get();

    if (!docSnap.exists) {
      // Return basic profile from auth token if not yet created in Firestore
      return res.status(200).json({
        success: true,
        data: {
          uid: userId,
          email: req.user.email,
          displayName: req.user.name || '',
          photoURL: req.user.picture || '',
          targetRole: 'Software Engineer',
          bio: '',
          skills: [],
          yearsOfExperience: 0,
          optInLeaderboard: true,
          preferences: {},
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: docSnap.data(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/user/profile
 * Updates user profile details
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.uid;

    const validation = validateProfile(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed for profile updates.',
        errors: validation.errors,
      });
    }

    const {
      displayName,
      headline,
      targetRole,
      bio,
      skills,
      yearsOfExperience,
      githubUrl,
      linkedinUrl,
      optInLeaderboard,
    } = req.body;

    const userDocRef = db.collection('users').doc(userId);
    const docSnap = await userDocRef.get();

    const existingData = docSnap.exists ? docSnap.data() : {};

    // Process skills into array
    let parsedSkills = existingData.skills || [];
    if (Array.isArray(skills)) {
      parsedSkills = skills.map((s) => sanitizeString(String(s))).filter(Boolean);
    } else if (typeof skills === 'string') {
      parsedSkills = skills.split(',').map((s) => sanitizeString(s)).filter(Boolean);
    }

    const updatePayload = {
      uid: userId,
      email: req.user.email || existingData.email || '',
      displayName: displayName !== undefined ? sanitizeString(displayName) : existingData.displayName || '',
      headline: headline !== undefined ? sanitizeString(headline) : existingData.headline || '',
      targetRole: targetRole !== undefined ? sanitizeString(targetRole) : existingData.targetRole || 'Software Engineer',
      bio: bio !== undefined ? sanitizeString(bio) : existingData.bio || '',
      skills: parsedSkills,
      yearsOfExperience: yearsOfExperience !== undefined ? Number(yearsOfExperience) : existingData.yearsOfExperience || 0,
      githubUrl: githubUrl !== undefined ? sanitizeString(githubUrl) : existingData.githubUrl || '',
      linkedinUrl: linkedinUrl !== undefined ? sanitizeString(linkedinUrl) : existingData.linkedinUrl || '',
      optInLeaderboard: optInLeaderboard !== undefined ? Boolean(optInLeaderboard) : existingData.optInLeaderboard ?? true,
      updatedAt: new Date().toISOString(),
    };

    await userDocRef.set(updatePayload, { merge: true });

    return res.status(200).json({
      success: true,
      data: updatePayload,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/user/settings
 * Updates user preferences and application settings
 */
const updateSettings = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { preferredDifficulty, preferredInterviewType, emailNotifications, theme } = req.body;

    const userDocRef = db.collection('users').doc(userId);
    const docSnap = await userDocRef.get();
    const existing = docSnap.exists ? docSnap.data() : {};

    const updatedPreferences = {
      ...(existing.preferences || {}),
      ...(preferredDifficulty !== undefined && { preferredDifficulty: sanitizeString(preferredDifficulty) }),
      ...(preferredInterviewType !== undefined && { preferredInterviewType: sanitizeString(preferredInterviewType) }),
      ...(emailNotifications !== undefined && { emailNotifications: Boolean(emailNotifications) }),
      ...(theme !== undefined && { theme: sanitizeString(theme) }),
      updatedAt: new Date().toISOString(),
    };

    await userDocRef.set({ preferences: updatedPreferences }, { merge: true });

    return res.status(200).json({
      success: true,
      data: updatedPreferences,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateSettings,
};
