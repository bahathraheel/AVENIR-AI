// Firebase Web Configuration - AVENIR AI
const firebaseConfig = {
  apiKey: "AIzaSyBKbSiT-TA4y8jk5f-I66wq2sD7CabB6Ug",
  authDomain: "avenir-ai-7b10f.firebaseapp.com",
  projectId: "avenir-ai-7b10f",
  storageBucket: "avenir-ai-7b10f.firebasestorage.app",
  messagingSenderId: "782837307110",
  appId: "1:782837307110:web:208a042ca5ad8fb0738d27"
};

// Initialize Firebase safely
if (typeof firebase !== 'undefined' && firebase.apps && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

// Ensure default persistence is browserLocalPersistence so authentication state survives reloads, new tabs, and browser restarts
if (auth && typeof firebase !== 'undefined' && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
    console.warn('Firebase setPersistence(LOCAL) warning:', err);
  });
}

// Expose globally for browser usage
window.firebaseConfig = firebaseConfig;
window.auth = auth;
window.db = db;
