const { db } = require('../config/firebase');
const geminiService = require('../services/geminiService');
const { validateInterviewConfig, validateAnswer, sanitizeString } = require('../utils/validators');
const { v4: uuidv4 } = require('uuid');

// In-memory session store providing resilient fallback when Cloud Firestore is pending provisioning
const inMemoryInterviews = new Map();

const getSession = async (interviewId) => {
  if (inMemoryInterviews.has(interviewId)) {
    const memoryData = inMemoryInterviews.get(interviewId);
    let docRef = null;
    try {
      docRef = db.collection('interviews').doc(interviewId);
    } catch (_) {}
    return { docRef, data: memoryData };
  }
  try {
    const docSnap = await db.collection('interviews').doc(interviewId).get();
    if (docSnap.exists) {
      const data = docSnap.data();
      inMemoryInterviews.set(interviewId, data);
      return { docRef: db.collection('interviews').doc(interviewId), data };
    }
  } catch (fsErr) {
    console.warn('[Firestore getSession Notice]:', fsErr.message);
  }
  return null;
};

const saveSession = async (interviewId, updates) => {
  if (inMemoryInterviews.has(interviewId)) {
    Object.assign(inMemoryInterviews.get(interviewId), updates);
  } else {
    inMemoryInterviews.set(interviewId, updates);
  }
  try {
    await db.collection('interviews').doc(interviewId).set(updates, { merge: true });
  } catch (fsErr) {
    console.warn('[Firestore saveSession Notice]:', fsErr.message);
  }
};

/**
 * a) generateQuestions
 * Validates config, generates questions via Gemini, and persists initial session in Firestore
 */
const generateQuestions = async (req, res, next) => {
  const reqStartTime = performance.now();
  try {
    const userId = req.user.uid;
    const { jobRole, interviewType, difficulty, experienceLevel, questionCount } = req.body;

    const tValidationStart = performance.now();
    // validateInterviewConfig now returns normalised values alongside errors
    const validation = validateInterviewConfig({
      jobRole,
      interviewType,
      difficulty,
      experienceLevel,
      questionCount,
    });

    if (!validation.valid) {
      console.warn('[generateQuestions] Validation failed:', validation.errors, '| Raw payload:', {
        jobRole, interviewType, difficulty, experienceLevel, questionCount
      });
      return res.status(400).json({
        success: false,
        error: validation.errors[0] || 'Validation failed for interview configuration.',
        errors: validation.errors,
      });
    }

    // Use the normalised, sanitised values from the validator
    const norm = validation.normalised;
    const sanitizedRole = sanitizeString(norm.jobRole);
    const sanitizedType = norm.interviewType;        // already lowercase slug
    const sanitizedDifficulty = norm.difficulty;     // already lowercase slug
    const sanitizedLevel = norm.experienceLevel;     // already lowercase slug
    const count = norm.questionCount;
    const validationDuration = performance.now() - tValidationStart;

    console.log('[generateQuestions] Calling Gemini with config:', {
      jobRole: sanitizedRole,
      interviewType: sanitizedType,
      difficulty: sanitizedDifficulty,
      experienceLevel: sanitizedLevel,
      questionCount: count,
    });

    // Call Gemini Service
    const tGeminiStart = performance.now();
    const questions = await geminiService.generateInterviewQuestions({
      jobRole: sanitizedRole,
      interviewType: sanitizedType,
      difficulty: sanitizedDifficulty,
      experienceLevel: sanitizedLevel,
      questionCount: count,
    });
    const totalGeminiWait = performance.now() - tGeminiStart;

    const geminiGenTime = questions._timing?.geminiGeneration || Math.round(totalGeminiWait);
    const jsonValTime = questions._timing?.jsonValidation || Math.max(1, Math.round(validationDuration));

    const interviewId = uuidv4();
    const interviewData = {
      id: interviewId,
      userId,
      userEmail: req.user.email || null,
      jobRole: sanitizedRole,
      interviewType: sanitizedType,
      difficulty: sanitizedDifficulty,
      experienceLevel: sanitizedLevel,
      questionCount: count,
      questions,
      answers: {},
      evaluations: {},
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Cache session in-memory immediately for zero-latency retrieval
    inMemoryInterviews.set(interviewId, interviewData);

    // Persist to Cloud Firestore
    const tFsStart = performance.now();
    try {
      await db.collection('interviews').doc(interviewId).set(interviewData);
    } catch (fsErr) {
      console.warn('[Firestore Write Warning]:', fsErr.message);
    }
    const firestoreSaveTime = Math.round(performance.now() - tFsStart);
    const totalBackendTime = Math.round(performance.now() - reqStartTime);

    console.log(`
[INTERVIEW PERFORMANCE]
- API request received: 0 ms
- Gemini generation: ${geminiGenTime} ms
- JSON validation: ${jsonValTime} ms
- Firestore save: ${firestoreSaveTime} ms
- Total backend time: ${totalBackendTime} ms
`);

    return res.status(201).json({
      success: true,
      data: {
        interviewId,
        jobRole: sanitizedRole,
        interviewType: sanitizedType,
        difficulty: sanitizedDifficulty,
        experienceLevel: sanitizedLevel,
        questions,
        _performance: {
          apiReceived: 0,
          geminiGeneration: geminiGenTime,
          jsonValidation: jsonValTime,
          firestoreSave: firestoreSaveTime,
          totalBackend: totalBackendTime,
          attempts: questions._timing?.attempts || []
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * b) evaluateAnswer
 * Validates candidate's answer, invokes Gemini evaluator, updates Firestore session
 */
const evaluateAnswer = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const {
      interviewId,
      questionIndex,
      question,
      answer,
      programmingLanguage,
      sourceCode,
      testResults,
      codeExecutionResults,
    } = req.body;

    const validation = validateAnswer({
      interviewId,
      questionIndex,
      question,
      answer: answer || sourceCode || '',
    });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid answer submission data.',
        errors: validation.errors,
      });
    }

    const session = await getSession(interviewId);
    if (!session || !session.data) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found.',
      });
    }

    const interview = session.data;

    // Verify ownership
    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this interview session.',
      });
    }

    const qIdx = String(questionIndex !== undefined ? questionIndex : 0);
    const questionObj = interview.questions?.[questionIndex] || {};
    const questionText = question || questionObj.questionText || questionObj.title || questionObj.question || 'Interview Question';

    // For coding answers, do not strip C/C++ includes (<stdio.h>, <iostream>) with HTML regex
    const isCoding = (interview.interviewCategory === 'coding') || (interview.interviewType === 'coding') || Boolean(sourceCode);
    const finalAnswerText = typeof answer === 'string'
      ? (isCoding ? answer.trim() : sanitizeString(answer))
      : (sourceCode ? String(sourceCode).trim() : '');

    const effectiveTestResults = testResults || codeExecutionResults || null;

    // Call Gemini Evaluation
    const evaluation = await geminiService.evaluateInterviewAnswer({
      question: questionText,
      answer: finalAnswerText,
      jobRole: interview.jobRole,
      interviewType: interview.interviewType || interview.interviewCategory || 'technical',
      difficulty: interview.difficulty,
      programmingLanguage: programmingLanguage || questionObj.defaultLanguage || 'c',
      sourceCode: sourceCode || finalAnswerText,
      testResults: effectiveTestResults,
      questionDetails: questionObj,
    });

    // Update Session
    const answerEntry = isCoding
      ? {
        code: sourceCode || finalAnswerText,
        language: programmingLanguage || 'c',
        testResults: effectiveTestResults,
        submittedAt: new Date().toISOString(),
      }
      : finalAnswerText;

    const updatedAnswers = { ...interview.answers, [qIdx]: answerEntry };
    const updatedEvaluations = { ...interview.evaluations, [qIdx]: evaluation };

    await saveSession(interviewId, {
      answers: updatedAnswers,
      evaluations: updatedEvaluations,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      data: {
        interviewId,
        questionIndex: parseInt(qIdx, 10),
        evaluation,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * c) generateFollowUp
 * Adaptive follow-up generator based on current answer performance
 */
const generateFollowUp = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { interviewId, questionIndex, previousQuestion, previousAnswer, evaluation } = req.body;

    if (!interviewId) {
      return res.status(400).json({
        success: false,
        error: 'interviewId is required.',
      });
    }

    const session = await getSession(interviewId);
    if (!session || !session.data) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found.',
      });
    }

    const interview = session.data;

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this interview session.',
      });
    }

    const qIdx = String(questionIndex || 0);
    const qText = previousQuestion || interview.questions[qIdx]?.question || 'Previous Question';
    const aText = previousAnswer || interview.answers[qIdx] || '';
    const evalData = evaluation || interview.evaluations[qIdx] || { overallScore: 70 };

    const followUp = await geminiService.generateFollowUpQuestion({
      previousQuestion: qText,
      previousAnswer: aText,
      evaluation: evalData,
      jobRole: interview.jobRole,
      interviewType: interview.interviewType,
      difficulty: interview.difficulty,
    });

    return res.status(200).json({
      success: true,
      data: followUp,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * d) completeInterview
 * Synthesizes final interview report, aggregates stats, and permanently records in Firestore
 */
const completeInterview = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { interviewId, answers: incomingAnswers, evaluations: incomingEvaluations } = req.body;

    if (!interviewId) {
      return res.status(400).json({
        success: false,
        error: 'interviewId is required to complete interview.',
      });
    }

    const session = await getSession(interviewId);
    if (!session || !session.data) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found.',
      });
    }

    const interview = session.data;

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this interview session.',
      });
    }

    // Deduplication check: if already completed, return existing report without duplicate writes
    if (interview.status === 'completed' && interview.report) {
      return res.status(200).json({
        success: true,
        data: {
          interviewId,
          status: 'completed',
          report: interview.report,
          overallScore: interview.overallScore ?? interview.report.overallScore ?? 0,
        },
      });
    }

    // Merge answers and evaluations from both backend session and incoming payload
    const mergedAnswers = { ...(interview.answers || {}), ...(incomingAnswers || {}) };
    const mergedEvaluations = { ...(interview.evaluations || {}), ...(incomingEvaluations || {}) };

    const questions = interview.questions || [];
    let answeredCount = 0;
    let skippedCount = 0;
    let scoreSum = 0;
    let validScoreCount = 0;

    const formattedAnswers = questions.map((q, i) => {
      const a = mergedAnswers[String(i)] ?? mergedAnswers[q.id] ?? '';
      if (!a || a === '[Skipped]' || String(a).trim() === '') {
        skippedCount++;
        return '[Skipped]';
      }
      answeredCount++;
      return a;
    });

    const formattedEvaluations = questions.map((q, i) => {
      const ev = mergedEvaluations[String(i)] ?? mergedEvaluations[q.id] ?? {};
      const score = Number(ev.score ?? ev.overallScore);
      if (!isNaN(score) && formattedAnswers[i] !== '[Skipped]') {
        scoreSum += score;
        validScoreCount++;
      }
      return ev;
    });

    // Generate comprehensive report via Gemini with safe fallback
    let report;
    try {
      report = await geminiService.generateInterviewReport({
        questions,
        answers: formattedAnswers,
        evaluations: formattedEvaluations,
        jobRole: interview.jobRole,
        interviewType: interview.interviewType,
        difficulty: interview.difficulty,
      });
    } catch (reportErr) {
      console.warn('[completeInterview] Report generation fallback:', reportErr.message);
      const computedScore = validScoreCount > 0 ? Math.round(scoreSum / questions.length) : 0;
      report = {
        overallScore: computedScore,
        technicalAccuracy: computedScore,
        communicationClarity: computedScore,
        completeness: computedScore,
        executiveSummary: `Completed ${answeredCount} of ${questions.length} questions for ${interview.jobRole}.`,
        keyStrengths: ['Demonstrated understanding of core concepts'],
        areasForImprovement: ['Continue practicing complex edge-case questions'],
        recommendations: ['Review targeted study roadmap modules on dashboard'],
      };
    }

    const finalOverallScore = typeof report.overallScore === 'number'
      ? report.overallScore
      : (validScoreCount > 0 ? Math.round(scoreSum / questions.length) : 0);

    const completedAt = new Date().toISOString();
    const updatePayload = {
      interviewId,
      id: interviewId,
      userId,
      userEmail: req.user.email || interview.userEmail || null,
      jobRole: interview.jobRole || 'Software Engineer',
      interviewCategory: interview.interviewType || interview.interviewCategory || 'technical',
      interviewType: interview.interviewType || interview.interviewCategory || 'technical',
      difficulty: interview.difficulty || 'medium',
      experienceLevel: interview.experienceLevel || 'mid',
      questions,
      answers: mergedAnswers,
      evaluations: mergedEvaluations,
      overallScore: finalOverallScore,
      answeredCount,
      skippedCount,
      status: 'completed',
      report,
      createdAt: interview.createdAt || completedAt,
      completedAt,
      updatedAt: completedAt,
    };

    // Save directly to Firestore with confirmed write
    await db.collection('interviews').doc(interviewId).set(updatePayload, { merge: true });
    if (inMemoryInterviews.has(interviewId)) {
      Object.assign(inMemoryInterviews.get(interviewId), updatePayload);
    }

    // Sync updated user stats in users/{userId} for dashboard consistency
    try {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      const currentStats = userDoc.exists ? (userDoc.data()?.stats || {}) : {};
      const newTotal = (currentStats.totalInterviews || 0) + 1;
      const newCompleted = (currentStats.completedInterviews || 0) + 1;
      const prevTotalScore = (currentStats.averageScore || 0) * (currentStats.completedInterviews || 0);
      const newAvg = Math.round((prevTotalScore + finalOverallScore) / newCompleted);
      const newHighest = Math.max(currentStats.highestScore || 0, finalOverallScore);

      await userRef.set({
        stats: {
          totalInterviews: newTotal,
          completedInterviews: newCompleted,
          averageScore: newAvg,
          highestScore: newHighest,
          lastInterviewDate: completedAt,
        },
        updatedAt: completedAt,
      }, { merge: true });
    } catch (uErr) {
      console.warn('[User Stats Sync Notice]:', uErr.message);
    }

    return res.status(200).json({
      success: true,
      data: updatePayload,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * e) getHistory
 * Retrieves user's interviews ordered by createdAt descending (requires NO composite index)
 */
const getHistory = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let allDocs = [];
    try {
      // Query without .orderBy to avoid Firestore composite index requirement
      const snapshot = await db
        .collection('interviews')
        .where('userId', '==', userId)
        .get();

      allDocs = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          interviewId: d.interviewId || doc.id,
          ...d,
        };
      });
    } catch (fsErr) {
      console.warn('[Firestore getHistory Warning]:', fsErr.message);
      for (const item of inMemoryInterviews.values()) {
        if (item.userId === userId) {
          allDocs.push({ id: item.id, interviewId: item.id, ...item });
        }
      }
    }

    // Sort descending by createdAt in JavaScript
    allDocs.sort((a, b) => new Date(b.createdAt || b.completedAt || 0) - new Date(a.createdAt || a.completedAt || 0));

    const total = allDocs.length;
    const docs = allDocs.slice(offset, offset + limit);

    const interviews = docs.map((data) => {
      return {
        id: data.id,
        interviewId: data.interviewId || data.id,
        jobRole: data.jobRole,
        interviewCategory: data.interviewCategory || data.interviewType || 'Technical',
        interviewType: data.interviewType || data.interviewCategory || 'Technical',
        difficulty: data.difficulty,
        experienceLevel: data.experienceLevel,
        status: data.status,
        overallScore: data.overallScore ?? data.report?.overallScore ?? null,
        answeredCount: data.answeredCount || 0,
        skippedCount: data.skippedCount || 0,
        createdAt: data.createdAt,
        completedAt: data.completedAt || null,
        questionCount: data.questions?.length || 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        interviews,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * f) getInterview
 * Fetches a single complete interview session by ID after ownership verification
 */
const getInterview = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    const session = await getSession(id);
    if (!session || !session.data) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found.',
      });
    }

    const interview = session.data;

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this interview record.',
      });
    }

    return res.status(200).json({
      success: true,
      data: interview,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * g) deleteInterview
 * Deletes an interview session by ID after ownership check
 */
const deleteInterview = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    const docRef = db.collection('interviews').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found.',
      });
    }

    const interview = docSnap.data();

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to delete this interview.',
      });
    }

    await docRef.delete();

    return res.status(200).json({
      success: true,
      message: 'Interview session deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateQuestions,
  evaluateAnswer,
  generateFollowUp,
  completeInterview,
  getHistory,
  getInterview,
  deleteInterview,
};
