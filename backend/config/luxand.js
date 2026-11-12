require('dotenv').config();

const LUXAND_API_URL = process.env.LUXAND_API_URL || 'https://api.luxand.cloud';
const LUXAND_API_TOKEN = process.env.LUXAND_API_TOKEN;

/**
 * Validates Luxand API configuration status at startup
 */
const isLuxandConfigured = () => {
  return Boolean(LUXAND_API_TOKEN && LUXAND_API_TOKEN.trim().length > 0);
};

const getLuxandToken = () => {
  if (!isLuxandConfigured()) {
    throw new Error('Luxand API token is missing. Please set LUXAND_API_TOKEN in backend/.env');
  }
  return LUXAND_API_TOKEN.trim();
};

module.exports = {
  LUXAND_API_URL,
  getLuxandToken,
  isLuxandConfigured,
};

