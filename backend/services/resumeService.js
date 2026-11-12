const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extracts plain text from a PDF Buffer using pdf-parse
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
const extractTextFromPDF = async (buffer) => {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Input must be a valid Buffer.');
    }
    const data = await pdfParse(buffer);
    const text = data.text ? data.text.trim() : '';
    if (!text) {
      throw new Error('Could not extract any readable text from this PDF. It may be scanned or empty.');
    }
    return text;
  } catch (error) {
    console.error('[ResumeService] PDF extraction failed:', error.message);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Extracts plain text from a DOCX Buffer using mammoth
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
const extractTextFromDOCX = async (buffer) => {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Input must be a valid Buffer.');
    }
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value ? result.value.trim() : '';
    if (!text) {
      throw new Error('Could not extract any readable text from this DOCX document.');
    }
    return text;
  } catch (error) {
    console.error('[ResumeService] DOCX extraction failed:', error.message);
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
};

/**
 * Routes buffer to appropriate parser based on mimeType or file extension
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} originalName
 * @returns {Promise<string>}
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
  } catch {
    return await extractTextFromDOCX(buffer);
  }
};

module.exports = {
  extractTextFromPDF,
  extractTextFromDOCX,
  extractText,
};
