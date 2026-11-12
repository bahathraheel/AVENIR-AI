const { db } = require('../config/firebase');
const geminiService = require('../services/geminiService');
const { sanitizeString } = require('../utils/validators');

/**
 * a) generateRoadmap
 * Analyzes authenticated user's interview history, resume gaps, and selected role,
 * generates an intensive 7-day curriculum via Gemini AI, and persists it into Firestore.
 */
const generateRoadmap = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const {
      weakTopics: reqWeakTopics,
      jobRole: reqJobRole,
      experienceLevel: reqExpLevel,
      interviewCategory: reqCategory,
    } = req.body || {};

    // 1. Fetch User Profile
    let userProfile = {};
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        userProfile = userDoc.data() || {};
      }
    } catch (profileErr) {
      console.warn('[LearningController] Failed to fetch user profile:', profileErr.message);
    }

    // 2. Fetch User's Recent Interview Performance History
    const identifiedWeakTopics = [];
    const performanceNotes = [];
    let detectedRoleFromInterviews = null;
    let detectedCategoryFromInterviews = null;

    try {
      const interviewsSnap = await db
        .collection('interviews')
        .where('userId', '==', userId)
        .limit(10)
        .get();

      if (!interviewsSnap.empty) {
        interviewsSnap.forEach((doc) => {
          const iv = doc.data();
          if (!detectedRoleFromInterviews && iv.jobRole) detectedRoleFromInterviews = iv.jobRole;
          if (!detectedCategoryFromInterviews && iv.interviewType) detectedCategoryFromInterviews = iv.interviewType;

          // Check overall score
          if (typeof iv.overallScore === 'number' && iv.overallScore < 75) {
            performanceNotes.push(`${iv.jobRole || 'Technical'} interview score: ${iv.overallScore}%`);
          }

          // Check individual evaluations
          if (Array.isArray(iv.evaluations)) {
            iv.evaluations.forEach((ev, idx) => {
              const qScore = ev?.overallScore ?? ev?.score;
              if (typeof qScore === 'number' && qScore < 70) {
                const qText = iv.questions && iv.questions[idx]
                  ? (typeof iv.questions[idx] === 'string' ? iv.questions[idx] : iv.questions[idx].title || iv.questions[idx].question)
                  : `Question ${idx + 1}`;
                if (qText) {
                  identifiedWeakTopics.push(qText.slice(0, 60));
                }
              }
            });
          }
        });
      }
    } catch (ivErr) {
      console.warn('[LearningController] Failed to fetch interviews history:', ivErr.message);
    }

    // 3. Fetch User's Resume Skills and Gaps (if uploaded)
    const resumeSkills = [];
    try {
      const resumeSnap = await db
        .collection('resumes')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (!resumeSnap.empty) {
        const resumeData = resumeSnap.docs[0].data();
        const analysis = resumeData?.analysis || {};
        if (Array.isArray(analysis.skills)) {
          analysis.skills.slice(0, 8).forEach((s) => resumeSkills.push(String(s)));
        }
        if (Array.isArray(analysis.improvements)) {
          analysis.improvements.slice(0, 3).forEach((imp) => identifiedWeakTopics.push(String(imp).slice(0, 50)));
        }
      }
    } catch (resErr) {
      console.warn('[LearningController] Failed to fetch resume analysis:', resErr.message);
    }

    // 4. Resolve Target Parameters
    const sanitizedRole = sanitizeString(reqJobRole) ||
      userProfile.preferredRole ||
      detectedRoleFromInterviews ||
      'Software Developer';

    const sanitizedLevel = sanitizeString(reqExpLevel) ||
      userProfile.experienceLevel ||
      'Mid-Level';

    const sanitizedCategory = sanitizeString(reqCategory) ||
      detectedCategoryFromInterviews ||
      'Technical Interview';

    // Merge identified weak topics with any explicitly passed in request
    let combinedWeakTopics = [];
    if (Array.isArray(reqWeakTopics) && reqWeakTopics.length > 0) {
      combinedWeakTopics = reqWeakTopics.map((t) => sanitizeString(String(t))).filter(Boolean);
    } else if (typeof reqWeakTopics === 'string' && reqWeakTopics.trim()) {
      combinedWeakTopics = reqWeakTopics.split(',').map((t) => sanitizeString(t)).filter(Boolean);
    }

    if (identifiedWeakTopics.length > 0) {
      combinedWeakTopics = Array.from(new Set([...combinedWeakTopics, ...identifiedWeakTopics]));
    }

    if (combinedWeakTopics.length === 0) {
      combinedWeakTopics = [
        'Data Structures & Algorithms',
        'System Architecture & Design Patterns',
        'Production Performance & Edge-Case Handling',
        'Structured Communication & STAR Method'
      ];
    }

    // 5. Generate Personalized Curriculum via Gemini AI
    const roadmap = await geminiService.generateLearningRoadmap({
      weakTopics: combinedWeakTopics.slice(0, 6),
      jobRole: sanitizedRole,
      experienceLevel: sanitizedLevel,
      interviewCategory: sanitizedCategory,
      performanceSummary: performanceNotes.slice(0, 4).join('; '),
      resumeSkills: resumeSkills.slice(0, 8),
    });

    // 6. Check existing progress in Firestore to preserve completed checkboxes
    const progressDocRef = db.collection('learningProgress').doc(userId);
    const existingDoc = await progressDocRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() : {};
    const existingCompleted = Array.isArray(existingData.completedTopics) ? existingData.completedTopics : [];

    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const totalTopics = (roadmap.topics || []).length;
    const completedCount = (roadmap.topics || []).filter((_, i) => existingCompleted.includes(i.toString())).length;
    const progressPercentage = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

    const payload = {
      id: planId,
      learningPlanId: planId,
      userId,
      jobRole: sanitizedRole,
      experienceLevel: sanitizedLevel,
      interviewCategory: sanitizedCategory,
      objectives: roadmap.objectives || [],
      topics: roadmap.topics || [],
      sevenDayPlan: roadmap.sevenDayPlan || [],
      weeklyPlan: roadmap.sevenDayPlan || [], // Kept for backward compatibility
      completedTopics: existingCompleted,
      currentProgress: {
        totalTopics,
        completedTopics: completedCount,
        progressPercentage,
      },
      createdAt: existingData.createdAt || new Date().toISOString(),
      generatedDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Embed roadmap directly so client-side references like data.roadmap always resolve
    payload.roadmap = {
      objectives: payload.objectives,
      topics: payload.topics,
      sevenDayPlan: payload.sevenDayPlan,
      weeklyPlan: payload.weeklyPlan,
    };

    await progressDocRef.set(payload, { merge: true });

    return res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error('[LearningController] generateRoadmap Error:', error.message);
    next(error);
  }
};

/**
 * b) updateProgress
 * Updates completed status for specific roadmap topics and recalculates progress metrics
 */
const updateProgress = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { topicName, completed, completedTopics, topicIndex } = req.body || {};

    const progressDocRef = db.collection('learningProgress').doc(userId);
    const docSnap = await progressDocRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Learning roadmap not found. Please generate a learning plan first.',
      });
    }

    const data = docSnap.data();
    let updatedCompleted = new Set(data.completedTopics || []);

    if (Array.isArray(completedTopics)) {
      // Overwrite with provided list
      updatedCompleted = new Set(completedTopics.map((t) => sanitizeString(String(t))));
    } else if (topicIndex !== undefined && topicIndex !== null) {
      const idxStr = String(topicIndex);
      if (completed === false) {
        updatedCompleted.delete(idxStr);
      } else {
        updatedCompleted.add(idxStr);
      }
    } else if (topicName && typeof topicName === 'string') {
      const cleanName = sanitizeString(topicName);
      if (completed === false) {
        updatedCompleted.delete(cleanName);
      } else {
        updatedCompleted.add(cleanName);
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Please provide either completedTopics array or topicName/topicIndex with completed status.',
      });
    }

    const completedList = Array.from(updatedCompleted);
    const topics = data.topics || [];
    const totalTopics = topics.length;
    // Count how many topic indices (e.g. "0", "1") or names are marked complete
    const completedCount = topics.filter((_, i) =>
      completedList.includes(i.toString()) ||
      completedList.includes(`topic_${i + 1}`) ||
      (topics[i] && completedList.includes(topics[i].name))
    ).length;

    const progressPercentage = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
    const inProgressCount = totalTopics > 0 && completedCount < totalTopics ? 1 : 0;
    const upcomingCount = Math.max(0, totalTopics - completedCount - inProgressCount);

    const currentProgress = {
      totalTopics,
      completedTopics: completedCount,
      inProgressTopics: inProgressCount,
      upcomingTopics: upcomingCount,
      progressPercentage,
    };

    await progressDocRef.update({
      completedTopics: completedList,
      currentProgress,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      data: {
        completedTopics: completedList,
        totalTopics,
        completedCount,
        inProgressCount,
        upcomingCount,
        progressPercentage,
      },
    });
  } catch (error) {
    console.error('[LearningController] updateProgress Error:', error.message);
    next(error);
  }
};

/**
 * c) getProgress
 * Retrieves current personalized learning roadmap and completion metrics for authenticated user
 */
const getProgress = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const docSnap = await db.collection('learningProgress').doc(userId).get();

    if (!docSnap.exists) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    const data = docSnap.data();
    const completedList = data.completedTopics || [];
    const topics = data.topics || [];
    const totalTopics = topics.length;

    const completedCount = topics.filter((_, i) =>
      completedList.includes(i.toString()) ||
      completedList.includes(`topic_${i + 1}`) ||
      (topics[i] && completedList.includes(topics[i].name))
    ).length;

    const progressPercentage = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
    const inProgressCount = totalTopics > 0 && completedCount < totalTopics ? 1 : 0;
    const upcomingCount = Math.max(0, totalTopics - completedCount - inProgressCount);

    const enrichedData = {
      ...data,
      totalTopics,
      completedCount,
      inProgressCount,
      upcomingCount,
      progressPercentage,
      roadmap: {
        objectives: data.objectives || [],
        topics: data.topics || [],
        sevenDayPlan: data.sevenDayPlan || data.weeklyPlan || [],
        weeklyPlan: data.weeklyPlan || data.sevenDayPlan || [],
      },
    };

    return res.status(200).json({
      success: true,
      data: enrichedData,
    });
  } catch (error) {
    console.error('[LearningController] getProgress Error:', error.message);
    next(error);
  }
};

module.exports = {
  generateRoadmap,
  updateProgress,
  getProgress,
};
