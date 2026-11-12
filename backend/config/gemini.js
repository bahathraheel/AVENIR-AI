const { GoogleGenAI } = require('@google/genai');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY;
const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

if (!apiKey) {
  console.warn(
    '[Gemini Warning] GEMINI_API_KEY environment variable is missing. AI generation features will require a valid API key to function.'
  );
}

// Initialize the GoogleGenAI instance with the provided API key
const ai = new GoogleGenAI({
  apiKey: apiKey || 'dummy-api-key-for-init',
});

module.exports = {
  ai,
  defaultModel,
  getModelName: () => process.env.GEMINI_MODEL || defaultModel,
};
