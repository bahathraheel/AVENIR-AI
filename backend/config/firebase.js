const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

let db = null;
let auth = null;
let isInitialized = false;

try {
  if (admin.apps.length > 0) {
    const existingApp = admin.app();
    db = existingApp.firestore();
    auth = existingApp.auth();
    isInitialized = true;
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (privateKey) {
      // Handle escaped newlines from environment strings
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (projectId && clientEmail && privateKey) {
      const app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      db = app.firestore();
      auth = app.auth();
      isInitialized = true;
      console.log('[Firebase] Admin SDK initialized successfully with service account.');
    } else if (projectId) {
      // Fallback for GCP / Cloud Run environment with Application Default Credentials
      const app = admin.initializeApp({
        projectId,
      });
      db = app.firestore();
      auth = app.auth();
      isInitialized = true;
      console.log('[Firebase] Admin SDK initialized with Application Default Credentials.');
    } else {
      console.warn(
        '[Firebase Warning] Firebase environment variables not fully configured. Database and authentication features will fail until valid credentials are provided.'
      );
    }
  }
} catch (error) {
  console.error('[Firebase Error] Failed to initialize Firebase Admin SDK:', error.message);
}

// Fallback proxy to provide meaningful error if accessed before proper configuration
const createUninitializedProxy = (serviceName) => {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'inspect' || prop === Symbol.toStringTag) {
        return undefined;
      }
      return (...args) => {
        throw new Error(
          `Firebase ${serviceName} is not initialized. Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your .env file.`
        );
      };
    },
  });
};

const getDb = () => {
  return db || createUninitializedProxy('Firestore');
};

const getAuth = () => {
  return auth || createUninitializedProxy('Auth');
};

// Export active instances and wrappers
module.exports = {
  admin,
  get db() {
    return getDb();
  },
  get auth() {
    return getAuth();
  },
  isFirebaseInitialized: () => isInitialized,
};
