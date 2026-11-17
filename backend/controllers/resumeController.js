const { db } = require('../config/firebase');
const geminiService = require('../services/geminiService');
const resumeService = require('../services/resumeService');
const { validateResumeFile, sanitizeString } = require('../utils/validators');
const { v4: uuidv4 } = require('uuid');

/**
 * a) analyzeResume
 * Processes uploaded resume document, extracts text, generates ATS analysis via Gemini,
 * and saves analysis report in Firestore under the user's account.
 */
const analyzeResume = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const file = req.file;

    // 1. Missing file check (400)
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No resume file uploaded. Please select a PDF or DOCX document.',
      });
    }

    // 2. File size limit check (413)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      return res.status(413).json({
        success: false,
        error: 'File size exceeds the 5MB limit. Please upload a smaller document.',
      });
    }

    // 3. File type check (415)
    const validation = validateResumeFile(file);
    if (!validation.valid) {
      return res.status(415).json({
        success: false,
        error: 'Unsupported file format. Please upload a PDF (.pdf) or Word (.docx) document.',
        errors: validation.errors,
      });
    }

    const rawTargetRole = req.body.targetJobRole || req.body.targetRole || 'Software Developer';
    const targetJobRole = sanitizeString(rawTargetRole) || 'Software Developer';

    // 4. Extract text from Buffer
    let extractedText = '';
    let extractionMeta = { method: 'default', isScanned: false };

    try {
      const extractionResult = await resumeService.extractText(file.buffer, file.mimetype, file.originalname);
      if (typeof extractionResult === 'string') {
        extractedText = extractionResult;
      } else if (extractionResult && extractionResult.text) {
        extractedText = extractionResult.text;
        extractionMeta.method = extractionResult.method || 'default';
        extractionMeta.isScanned = !!extractionResult.isScanned;
      }
    } catch (extractError) {
      console.error('[ResumeController] Text extraction error:', extractError.message);
      
      if (extractError.code === 'PASSWORD_PROTECTED' || /password/i.test(extractError.message)) {
        return res.status(400).json({
          success: false,
          code: 'PASSWORD_PROTECTED',
          error: 'This PDF is password-protected. Upload an unlocked version.',
        });
      }
      
      if (extractError.code === 'EMPTY_PDF' || /no readable/i.test(extractError.message)) {
        return res.status(400).json({
          success: false,
          code: 'EMPTY_PDF',
          error: 'No readable resume content was found.',
        });
      }

      return res.status(400).json({
        success: false,
        code: 'PARSE_FAILED',
        error: "We couldn't read this PDF. Try exporting it again as a standard PDF.",
        details: extractError.message
      });
    }

    if (!extractedText || extractedText.trim().length < 30) {
      return res.status(400).json({
        success: false,
        code: 'EMPTY_PDF',
        error: 'No readable resume content was found.',
      });
    }

    // 5. Call Gemini to analyze the resume with detailed schema
    let analysis;
    try {
      analysis = await geminiService.analyzeResume({
        resumeText: extractedText,
        targetJobRole,
      });
    } catch (aiError) {
      console.error('[ResumeController] Gemini analysis error:', aiError.message);
      const msg = aiError.message || '';
      return res.status(503).json({
        success: false,
        code: 'AI_FAILURE',
        error: 'Resume text was extracted, but AI analysis could not be completed.',
        details: msg
      });
    }

    const resumeId = uuidv4();
    const resumeDoc = {
      id: resumeId,
      userId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      targetJobRole,
      extractionMethod: extractionMeta.method,
      isScanned: extractionMeta.isScanned,
      analysis,
      createdAt: new Date().toISOString(),
    };

    // 6. Save record to Firestore
    await db.collection('resumes').doc(resumeId).set(resumeDoc);

    return res.status(200).json({
      success: true,
      message: 'Your resume has been analyzed successfully.',
      isScanned: extractionMeta.isScanned,
      data: {
        resumeId,
        fileName: file.originalname,
        targetJobRole,
        isScanned: extractionMeta.isScanned,
        analysis,
        createdAt: resumeDoc.createdAt,
      },
    });
  } catch (error) {
    console.error('[ResumeController] Unexpected analyzeResume error:', error);
    next(error);
  }
};

/**
 * b) getLatestResume
 * Retrieves the most recent resume analysis for the authenticated user
 */
const getLatestResume = async (req, res, next) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db
      .collection('resumes')
      .where('userId', '==', userId)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    // Sort in-memory by createdAt descending
    const docs = snapshot.docs.map(doc => doc.data());
    docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const latest = docs[0];
    return res.status(200).json({
      success: true,
      data: latest,
    });
  } catch (error) {
    console.error('[ResumeController] getLatestResume error:', error);
    next(error);
  }
};

/**
 * b) getResumeHistory
 * Retrieves all previous resume analyses for the authenticated user
 */
const getResumeHistory = async (req, res, next) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db
      .collection('resumes')
      .where('userId', '==', userId)
      .get();

    const resumes = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        fileName: data.fileName,
        targetJobRole: data.targetJobRole,
        overallScore: data.analysis?.overallScore || 0,
        atsScore: data.analysis?.atsCompatibility?.score || 0,
        createdAt: data.createdAt,
      };
    });

    resumes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return res.status(200).json({
      success: true,
      data: resumes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Optional get single resume analysis
 */
const getResumeById = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    const docSnap = await db.collection('resumes').doc(id).get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Resume analysis record not found.',
      });
    }

    const data = docSnap.data();

    if (data.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this resume analysis.',
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeResume,
  getResumeHistory,
  getResumeById,
  getLatestResume,
};
