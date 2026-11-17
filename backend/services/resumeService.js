const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const PDFParser = require('pdf2json');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenAI } = require('@google/genai');

/**
 * Initialize Gemini client for multimodal document extraction / OCR fallback
 */
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

/**
 * Custom Error class with error code property
 */
class ResumeParsingError extends Error {
  constructor(message, code = 'PARSE_FAILED', details = null) {
    super(message);
    this.name = 'ResumeParsingError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Checks if a PDF buffer is password-protected/encrypted
 * @param {Buffer} buffer
 * @returns {boolean}
 */
const isPdfEncrypted = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return false;
  const sampleLength = Math.min(buffer.length, 8192);
  const head = buffer.slice(0, sampleLength).toString('latin1');
  const tail = buffer.slice(Math.max(0, buffer.length - sampleLength)).toString('latin1');
  
  // Look for /Encrypt dictionary indicator
  const hasEncryptDict = /\/Encrypt\s+\d+\s+\d+\s+R/i.test(head) ||
                         /\/Encrypt\s+\d+\s+\d+\s+R/i.test(tail) ||
                         /\/Encrypt\s*<</i.test(head) ||
                         /\/Encrypt\s*<</i.test(tail);
                         
  return hasEncryptDict;
};

/**
 * Sanitizes PDF buffer by stripping leading junk/BOM bytes before %PDF-
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
const sanitizePdfBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return buffer;
  const pdfMagic = Buffer.from('%PDF-');
  const magicIndex = buffer.indexOf(pdfMagic);
  
  if (magicIndex === -1) {
    // Check if it might be valid with lowercase or slight offset
    const latin1 = buffer.slice(0, 1024).toString('latin1');
    const lowerIdx = latin1.toLowerCase().indexOf('%pdf-');
    if (lowerIdx !== -1) {
      return buffer.slice(lowerIdx);
    }
    // Return original buffer if magic not located
    return buffer;
  }
  
  if (magicIndex > 0) {
    return buffer.slice(magicIndex);
  }
  
  return buffer;
};

/**
 * Cleans and normalizes extracted resume text
 * Preserves section headers, bullet points, emails, phone numbers, and line breaks
 * @param {string} rawText
 * @returns {string}
 */
const cleanResumeText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';

  return rawText
    // Remove null bytes and non-printable control chars (except \n, \r, \t)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize unicode bullet points and dashes
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '• ')
    .replace(/[\u2013\u2014]/g, '-')
    // Normalize quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Remove trailing whitespace on each line
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    // Collapse 3+ consecutive newlines to 2
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Method 1: Extracts text using pdf2json (handles modern xref streams and repairs)
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
const extractWithPdf2Json = (buffer) => {
  return new Promise((resolve, reject) => {
    try {
      const pdfParser = new PDFParser(null, 1); // 1 = raw text mode
      
      const timeout = setTimeout(() => {
        reject(new Error('pdf2json extraction timed out after 8 seconds.'));
      }, 8000);

      pdfParser.on('pdfParser_dataError', (errData) => {
        clearTimeout(timeout);
        const errMsg = (errData && errData.parserError && errData.parserError.message) 
          ? errData.parserError.message 
          : String(errData && errData.parserError || 'Unknown pdf2json error');
        reject(new Error(errMsg));
      });

      pdfParser.on('pdfParser_dataReady', () => {
        clearTimeout(timeout);
        try {
          const rawText = pdfParser.getRawTextContent();
          resolve(rawText ? rawText.trim() : '');
        } catch (err) {
          reject(err);
        }
      });

      pdfParser.parseBuffer(buffer);
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Method 2: Extracts text using pdf-parse with fallback options
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
const extractWithPdfParse = async (buffer) => {
  try {
    const data = await pdfParse(buffer, {
      max: 0,
      version: 'default'
    });
    return data && data.text ? data.text.trim() : '';
  } catch (err) {
    // Retry with v2.0.550 if available in pdf-parse
    try {
      const dataV2 = await pdfParse(buffer, {
        max: 0,
        version: 'v2.0.550'
      });
      return dataV2 && dataV2.text ? dataV2.text.trim() : '';
    } catch (_) {
      throw err;
    }
  }
};

/**
 * Method 3: Gemini Multimodal Vision / OCR fallback for scanned or corrupted PDFs
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
const extractWithGeminiOCR = async (buffer) => {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('Gemini API client not configured for OCR fallback.');
  }

  const candidateModels = [
    process.env.GEMINI_MODEL,
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash'
  ].filter(Boolean);

  let lastError = null;

  for (const model of candidateModels) {
    try {
      console.log(`[ResumeService] Attempting Gemini OCR fallback with model "${model}"...`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
          'You are a high-precision OCR and document analysis engine for AVENIR AI. Extract ALL readable text and structural sections from this resume PDF. Ensure all section headings, contact information, technical skills, bullet points, companies, degrees, and project details are preserved completely. Output ONLY the extracted text with no conversational preamble or markdown code blocks.'
        ]
      });

      const text = response && response.text ? response.text.trim() : '';
      if (text && text.length > 30) {
        console.log(`[ResumeService] Gemini OCR successfully extracted ${text.length} characters using "${model}".`);
        return text;
      }
    } catch (err) {
      console.warn(`[ResumeService] Gemini OCR with model "${model}" failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Gemini OCR extraction failed across all candidate models.');
};

/**
 * Robust Multi-Engine PDF Text Extraction Pipeline
 * 1. Validates buffer signature and checks for password protection.
 * 2. Tries pdf2json (handles modern xrefs, streams, Google Docs / Word exports).
 * 3. Tries pdf-parse as secondary engine.
 * 4. Checks if document contains insufficient selectable text (scanned PDF).
 * 5. Falls back to Gemini Multimodal Document Vision & OCR when parsers fail or resume is scanned.
 * 
 * @param {Buffer} buffer
 * @returns {Promise<{ text: string, method: string, isScanned: boolean }>}
 */
const extractTextFromPDF = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ResumeParsingError('No readable resume content was found.', 'EMPTY_PDF');
  }

  // 1. Password Protection Check
  if (isPdfEncrypted(buffer)) {
    throw new ResumeParsingError('This PDF is password-protected. Upload an unlocked version.', 'PASSWORD_PROTECTED');
  }

  // 2. Sanitize buffer (strip prepended headers or BOM)
  const cleanBuffer = sanitizePdfBuffer(buffer);

  // Validate PDF magic bytes
  if (cleanBuffer.slice(0, 1024).indexOf(Buffer.from('%PDF-')) === -1) {
    throw new ResumeParsingError("We couldn't read this PDF. Try exporting it again as a standard PDF.", 'PARSE_FAILED');
  }

  let extractedText = '';
  let usedMethod = 'pdf2json';
  let isScanned = false;

  // Attempt 1: pdf2json
  try {
    extractedText = await extractWithPdf2Json(cleanBuffer);
    usedMethod = 'pdf2json';
  } catch (pdf2JsonErr) {
    console.warn('[ResumeService] pdf2json extraction warning:', pdf2JsonErr.message);
    
    // Check if error message mentions password
    if (pdf2JsonErr.message && /password|encrypt/i.test(pdf2JsonErr.message)) {
      throw new ResumeParsingError('This PDF is password-protected. Upload an unlocked version.', 'PASSWORD_PROTECTED');
    }

    // Attempt 2: pdf-parse fallback
    try {
      extractedText = await extractWithPdfParse(cleanBuffer);
      usedMethod = 'pdf-parse';
    } catch (pdfParseErr) {
      console.warn('[ResumeService] pdf-parse extraction warning:', pdfParseErr.message);
      if (pdfParseErr.message && /password|encrypt/i.test(pdfParseErr.message)) {
        throw new ResumeParsingError('This PDF is password-protected. Upload an unlocked version.', 'PASSWORD_PROTECTED');
      }
      extractedText = '';
    }
  }

  // Check if extracted text is insufficient (< 50 chars indicates scanned images or empty doc)
  const isTextSparse = !extractedText || extractedText.trim().length < 50;

  if (isTextSparse) {
    console.log('[ResumeService] Extracted text is sparse or missing. Initiating Gemini Multimodal OCR...');
    try {
      const ocrText = await extractWithGeminiOCR(cleanBuffer);
      if (ocrText && ocrText.length >= 50) {
        extractedText = ocrText;
        usedMethod = 'gemini-ocr';
        isScanned = true;
      }
    } catch (ocrErr) {
      console.error('[ResumeService] Gemini OCR failed:', ocrErr.message);
      // If we had some text, keep it; otherwise fall through to error
    }
  }

  const cleaned = cleanResumeText(extractedText);

  if (!cleaned || cleaned.length < 30) {
    throw new ResumeParsingError('No readable resume content was found.', 'EMPTY_PDF');
  }

  return {
    text: cleaned,
    method: usedMethod,
    isScanned
  };
};

/**
 * Extracts plain text from a DOCX Buffer using mammoth
 * @param {Buffer} buffer
 * @returns {Promise<{ text: string, method: string, isScanned: boolean }>}
 */
const extractTextFromDOCX = async (buffer) => {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ResumeParsingError('No readable resume content was found.', 'EMPTY_PDF');
    }
    const result = await mammoth.extractRawText({ buffer });
    const text = result && result.value ? cleanResumeText(result.value) : '';
    
    if (!text || text.length < 30) {
      throw new ResumeParsingError('No readable resume content was found.', 'EMPTY_PDF');
    }

    return {
      text,
      method: 'mammoth',
      isScanned: false
    };
  } catch (error) {
    if (error instanceof ResumeParsingError) throw error;
    console.error('[ResumeService] DOCX extraction failed:', error.message);
    throw new ResumeParsingError("We couldn't read this Word document. Please ensure it is a valid .docx file.", 'PARSE_FAILED');
  }
};

/**
 * Routes buffer to appropriate parser based on mimeType or file extension
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} originalName
 * @returns {Promise<{ text: string, method: string, isScanned: boolean }>}
 */
const extractText = async (buffer, mimeType = '', originalName = '') => {
  const lowerMime = (mimeType || '').toLowerCase();
  const lowerName = (originalName || '').toLowerCase();

  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return await extractTextFromPDF(buffer);
  }

  if (
    lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerMime === 'application/msword' ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    return await extractTextFromDOCX(buffer);
  }

  // Fallback: Attempt PDF first, then DOCX
  try {
    return await extractTextFromPDF(buffer);
  } catch (pdfErr) {
    if (pdfErr.code === 'PASSWORD_PROTECTED') throw pdfErr;
    try {
      return await extractTextFromDOCX(buffer);
    } catch {
      throw pdfErr; // Re-throw the original PDF error
    }
  }
};

module.exports = {
  extractTextFromPDF,
  extractTextFromDOCX,
  extractText,
  cleanResumeText,
  isPdfEncrypted,
  sanitizePdfBuffer,
  ResumeParsingError,
};
