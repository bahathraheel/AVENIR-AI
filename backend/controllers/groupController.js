const { db } = require('../config/firebase');
const geminiService = require('../services/geminiService');
const { sanitizeString } = require('../utils/validators');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper to generate 6-character room code
 */
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * POST /api/group/create
 * Creates a collaborative group interview room with a unique join code
 */
const createRoom = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { title, jobRole = 'Software Engineer', difficulty = 'medium', questionCount = 3 } = req.body;

    const sanitizedTitle = sanitizeString(title) || 'AVENIR Mock Interview Room';
    const sanitizedRole = sanitizeString(jobRole) || 'Software Engineer';
    const sanitizedDifficulty = sanitizeString(difficulty).toLowerCase() || 'medium';
    const count = Math.min(10, Math.max(1, parseInt(questionCount, 10) || 3));

    // Generate questions for this group session
    const questions = await geminiService.generateInterviewQuestions({
      jobRole: sanitizedRole,
      interviewType: 'technical',
      difficulty: sanitizedDifficulty,
      experienceLevel: 'mid',
      questionCount: count,
    });

    const roomId = uuidv4();
    const roomCode = generateRoomCode();

    const hostParticipant = {
      uid: userId,
      displayName: req.user.name || req.user.email?.split('@')[0] || 'Host',
      role: 'host',
      joinedAt: new Date().toISOString(),
    };

    const roomData = {
      id: roomId,
      roomCode,
      title: sanitizedTitle,
      jobRole: sanitizedRole,
      difficulty: sanitizedDifficulty,
      hostId: userId,
      status: 'active',
      participants: [hostParticipant],
      questions,
      submissions: {
        [userId]: {},
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection('groupRooms').doc(roomId).set(roomData);

    return res.status(201).json({
      success: true,
      data: {
        roomId,
        roomCode,
        title: sanitizedTitle,
        jobRole: sanitizedRole,
        difficulty: sanitizedDifficulty,
        questions,
        participants: [hostParticipant],
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/group/join
 * Join group room using roomCode
 */
const joinRoom = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { roomCode } = req.body;

    if (!roomCode || typeof roomCode !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'roomCode is required to join a room.',
      });
    }

    const cleanCode = sanitizeString(roomCode).toUpperCase();

    const snapshot = await db
      .collection('groupRooms')
      .where('roomCode', '==', cleanCode)
      .limit(1)
      .get();

    if (snapshot.empty || snapshot.docs[0].data().status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Active room not found with this code. Please check code and try again.',
      });
    }

    const roomDoc = snapshot.docs[0];
    const roomData = roomDoc.data();

    // Check if user is already a participant
    const existingIndex = roomData.participants.findIndex((p) => p.uid === userId);
    let participants = [...roomData.participants];

    if (existingIndex === -1) {
      const newParticipant = {
        uid: userId,
        displayName: req.user.name || req.user.email?.split('@')[0] || 'Participant',
        role: 'participant',
        joinedAt: new Date().toISOString(),
      };
      participants.push(newParticipant);

      const submissions = {
        ...roomData.submissions,
        [userId]: roomData.submissions?.[userId] || {},
      };

      await roomDoc.ref.update({
        participants,
        submissions,
        updatedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        roomId: roomDoc.id,
        roomCode: roomData.roomCode,
        title: roomData.title,
        jobRole: roomData.jobRole,
        difficulty: roomData.difficulty,
        questions: roomData.questions,
        participants,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/group/:roomId
 * Gets live room details for participants only
 */
const getRoom = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { roomId } = req.params;

    const docRef = db.collection('groupRooms').doc(roomId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Group room not found.',
      });
    }

    const roomData = docSnap.data();

    // Check if user is participant
    const isParticipant = roomData.participants?.some((p) => p.uid === userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: 'You are not a participant in this room.',
      });
    }

    return res.status(200).json({
      success: true,
      data: roomData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/group/:roomId/answer
 * Submits an answer for a question in a group session and evaluates it
 */
const submitGroupAnswer = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { roomId } = req.params;
    const { questionIndex = 0, answer } = req.body;

    if (answer === undefined || typeof answer !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Answer text is required.',
      });
    }

    const docRef = db.collection('groupRooms').doc(roomId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Group room not found.',
      });
    }

    const roomData = docSnap.data();

    const isParticipant = roomData.participants?.some((p) => p.uid === userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: 'You are not an authorized participant in this room.',
      });
    }

    const qIdx = parseInt(questionIndex, 10) || 0;
    const currentQuestion = roomData.questions[qIdx];
    if (!currentQuestion) {
      return res.status(400).json({
        success: false,
        error: 'Invalid question index for this group room.',
      });
    }

    const sanitizedAnswer = sanitizeString(answer);

    // Evaluate answer with Gemini
    const evaluation = await geminiService.evaluateInterviewAnswer({
      question: currentQuestion.question,
      answer: sanitizedAnswer,
      jobRole: roomData.jobRole,
      difficulty: roomData.difficulty,
    });

    const userSubmissions = roomData.submissions?.[userId] || {};
    userSubmissions[String(qIdx)] = {
      answer: sanitizedAnswer,
      evaluation,
      submittedAt: new Date().toISOString(),
    };

    const updatedSubmissions = {
      ...roomData.submissions,
      [userId]: userSubmissions,
    };

    await docRef.update({
      submissions: updatedSubmissions,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      data: {
        questionIndex: qIdx,
        evaluation,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  submitGroupAnswer,
};
