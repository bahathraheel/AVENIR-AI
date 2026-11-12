/**
 * AVENIR AI - Authentication & Session Management Module
 * Production-ready Firebase Auth integration with route protection
 */

// Protected and Public Page lists
const PROTECTED_PAGES = [
  'dashboard',
  'interview-setup',
  'interview-room',
  'results',
  'resume-analyzer',
  'analytics',
  'history',
  'learning',
  'leaderboard',
  'group-interview',
  'profile',
  'settings'
];

const PUBLIC_PAGES = [
  'index',
  'login',
  'register',
  'forgot-password'
];

/**
 * Identify the current page slug from window.location.pathname
 * e.g., "/login.html" -> "login", "/" -> "index"
 */
function getCurrentPageSlug() {
  const path = window.location.pathname;
  let filename = path.substring(path.lastIndexOf('/') + 1);
  if (!filename || filename === '') {
    return 'index';
  }
  if (filename.includes('.')) {
    filename = filename.split('.')[0];
  }
  return filename.toLowerCase();
}

/**
 * Determine if current page is protected
 */
function isProtectedPage() {
  if (typeof window !== 'undefined' && (window.location.search.includes('preview=true') || window.location.search.includes('mock=true'))) {
    return false;
  }
  const slug = getCurrentPageSlug();
  return PROTECTED_PAGES.includes(slug);
}

/**
 * Determine if current page is an auth page (login, register, forgot-password)
 */
function isAuthPage() {
  const slug = getCurrentPageSlug();
  return ['login', 'register', 'forgot-password'].includes(slug);
}

/**
 * Translate Firebase Auth error codes into clean user-friendly messages
 */
function getFriendlyAuthErrorMessage(error) {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const code = error.code || '';
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email address or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 8 characters with letters and numbers.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-closed-by-user':
      return 'Sign in popup was closed before completion. Please try again.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access temporarily disabled. Try again later.';
    default:
      return error.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Show error in auth-error container
 */
function showAuthError(message, containerId = null) {
  let errorBox = null;
  let errorText = null;

  if (containerId) {
    errorBox = document.getElementById(containerId);
  }
  if (!errorBox) {
    errorBox = document.querySelector('.auth-error');
  }

  if (errorBox) {
    errorText = errorBox.querySelector('.error-text') || errorBox;
    if (errorText && errorText !== errorBox) {
      errorText.textContent = message;
    } else {
      errorBox.textContent = message;
    }
    errorBox.classList.remove('hidden');
    errorBox.setAttribute('aria-hidden', 'false');
  } else {
    alert(message);
  }
}

/**
 * Hide auth error box
 */
function hideAuthError(containerId = null) {
  let errorBox = null;
  if (containerId) {
    errorBox = document.getElementById(containerId);
  }
  if (!errorBox) {
    errorBox = document.querySelector('.auth-error');
  }
  if (errorBox) {
    errorBox.classList.add('hidden');
    errorBox.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Helper to update button loading state
 */
function setButtonLoading(btn, spinner, isLoading, defaultText = null) {
  if (!btn) return;
  const btnText = btn.querySelector('.btn-text');
  btn.disabled = isLoading;

  if (isLoading) {
    btn.classList.add('loading');
    if (spinner) spinner.classList.remove('hidden');
  } else {
    btn.classList.remove('loading');
    if (spinner) spinner.classList.add('hidden');
    if (btnText && defaultText) {
      btnText.textContent = defaultText;
    }
  }
}

// Global Auth Initialization State
let authInitialized = false;
let authInitPromise = null;
let currentAuthUser = null;
let isGuardRunning = false;

/**
 * Returns a Promise that resolves with the authenticated Firebase User (or null)
 * once Firebase Auth has completely finished restoring state from browser local storage.
 * Guarantees that any caller will wait for authentication restoration rather than seeing a premature null.
 */
function waitForAuthInit() {
  if (authInitialized && currentAuthUser !== undefined) {
    return Promise.resolve(currentAuthUser);
  }

  if (authInitPromise) {
    return authInitPromise;
  }

  authInitPromise = new Promise((resolve) => {
    if (!firebase || !firebase.auth) {
      console.warn('Firebase Auth SDK not found in window.');
      authInitialized = true;
      currentAuthUser = null;
      resolve(null);
      return;
    }

    // Enforce browser local persistence application-wide
    try {
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
        console.warn('Firebase setPersistence(LOCAL) notice:', err);
      });
    } catch (e) {
      // Continue even if setPersistence throws in unsupported environments
    }

    // Only one global listener needs to fulfill this initialization promise
    const unsubscribe = firebase.auth().onAuthStateChanged(
      (user) => {
        authInitialized = true;
        currentAuthUser = user || null;
        resolve(user || null);
      },
      (error) => {
        console.error('Firebase onAuthStateChanged init error:', error);
        authInitialized = true;
        currentAuthUser = null;
        resolve(null);
      }
    );
  });

  return authInitPromise;
}

/**
 * a) checkAuthState()
 * Central Route Guard:
 * - Awaits full Firebase Auth restoration before evaluating route permissions.
 * - If user signed in and on auth pages (login/register/forgot), redirects to dashboard.html
 * - If user NOT signed in and on protected pages, redirects to login.html
 * - Never redirects prematurely during initial load or token refresh.
 */
async function checkAuthState() {
  if (isGuardRunning) return;
  isGuardRunning = true;

  try {
    const user = await waitForAuthInit();
    const slug = getCurrentPageSlug();

    if (user) {
      // User is authenticated
      if (isAuthPage()) {
        window.location.replace('dashboard.html');
        return;
      }

      // Sync user profile display on protected pages
      syncUserInterfaceDetails(user);

    } else {
      // User is not authenticated
      if (isProtectedPage()) {
        // Prevent redirect loops: do not redirect if already on login
        if (slug !== 'login') {
          console.warn(`Unauthenticated access to protected page '${slug}'. Redirecting to login.`);
          window.location.replace('login.html');
          return;
        }
      }
    }
  } catch (err) {
    console.error('Error during checkAuthState route guard:', err);
  } finally {
    isGuardRunning = false;
  }
}

/**
 * Register the single global Auth listener across the application
 */
if (typeof window !== 'undefined') {
  if (!window.__avenirAuthListenerRegistered && typeof firebase !== 'undefined' && firebase.auth) {
    window.__avenirAuthListenerRegistered = true;
    firebase.auth().onAuthStateChanged((user) => {
      authInitialized = true;
      currentAuthUser = user || null;
      if (user) {
        syncUserInterfaceDetails(user);
        if (isAuthPage()) {
          window.location.replace('dashboard.html');
        }
      } else {
        if (isProtectedPage() && getCurrentPageSlug() !== 'login') {
          window.location.replace('login.html');
        }
      }
    });
  }
}

/**
 * Sync user profile display across common layout elements (avatars, usernames)
 */
function syncUserInterfaceDetails(user) {
  if (!user) return;
  const displayName = user.displayName || user.email?.split('@')[0] || 'Candidate';
  const email = user.email || '';
  const initial = displayName.charAt(0).toUpperCase();

  const userNameDisplay = document.getElementById('userNameDisplay');
  if (userNameDisplay) userNameDisplay.textContent = displayName;

  const sidebarUserName = document.getElementById('sidebarUserName');
  if (sidebarUserName) sidebarUserName.textContent = displayName;

  const sidebarUserEmail = document.getElementById('sidebarUserEmail');
  if (sidebarUserEmail) sidebarUserEmail.textContent = email;

  const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
  if (sidebarUserAvatar) {
    if (user.photoURL) {
      sidebarUserAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;">`;
    } else {
      sidebarUserAvatar.textContent = initial;
    }
  }
}

/**
 * b) registerUser(fullName, email, password)
 * Sets browser local persistence, creates user, updates display name, creates user document in Firestore 'users', redirects to dashboard.html
 */
async function registerUser(fullName, email, password) {
  if (!firebase || !firebase.auth || !firebase.firestore) {
    throw new Error('Firebase SDK is not initialized.');
  }

  // Ensure persistent login across browser sessions
  await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  const cleanName = (fullName || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  // Create Auth user
  const userCredential = await firebase.auth().createUserWithEmailAndPassword(cleanEmail, password);
  const user = userCredential.user;
  currentAuthUser = user;
  authInitialized = true;

  // Update Auth Profile
  await user.updateProfile({
    displayName: cleanName
  });

  // Create Firestore document in 'users' collection
  try {
    const db = firebase.firestore();
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      fullName: cleanName,
      displayName: cleanName,
      email: cleanEmail,
      preferredRole: '',
      targetRole: 'Software Developer',
      experienceLevel: '',
      careerInterests: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      preferences: {
        dailyGoal: 1,
        weeklyTarget: 5,
        leaderboardOptIn: true,
        timerEnabled: true
      }
    });
  } catch (firestoreErr) {
    console.warn('Firestore initial user doc creation notice:', firestoreErr);
  }

  // Force retrieve fresh token to prime local cache
  await user.getIdToken(true);

  window.location.replace('dashboard.html');
  return user;
}

/**
 * c) loginUser(email, password, rememberMe)
 * Sets browser local persistence, signs in, primes token, and redirects to dashboard.html
 */
async function loginUser(email, password, rememberMe = true) {
  if (!firebase || !firebase.auth) {
    throw new Error('Firebase Auth is not initialized.');
  }

  // Enforce browser local persistence so user remains logged in permanently until explicit logout
  await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  const cleanEmail = (email || '').trim().toLowerCase();
  const userCredential = await firebase.auth().signInWithEmailAndPassword(cleanEmail, password);
  const user = userCredential.user;
  currentAuthUser = user;
  authInitialized = true;

  // Prime token cache to guarantee immediate availability for API calls
  await user.getIdToken(true);

  window.location.replace('dashboard.html');
  return user;
}

/**
 * Google Sign In / Sign Up handler
 */
async function loginWithGoogle() {
  if (!firebase || !firebase.auth) {
    throw new Error('Firebase Auth is not initialized.');
  }

  await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');

  const result = await firebase.auth().signInWithPopup(provider);
  const user = result.user;
  currentAuthUser = user;
  authInitialized = true;

  // Check or initialize Firestore profile
  if (firebase.firestore) {
    try {
      const db = firebase.firestore();
      const userDocRef = db.collection('users').doc(user.uid);
      const docSnap = await userDocRef.get();

      if (!docSnap.exists) {
        await userDocRef.set({
          uid: user.uid,
          fullName: user.displayName || 'Candidate',
          displayName: user.displayName || 'Candidate',
          email: user.email || '',
          photoURL: user.photoURL || null,
          preferredRole: '',
          targetRole: 'Software Developer',
          experienceLevel: '',
          careerInterests: '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          preferences: {
            dailyGoal: 1,
            weeklyTarget: 5,
            leaderboardOptIn: true,
            timerEnabled: true
          }
        });
      }
    } catch (fsErr) {
      console.warn('Firestore Google sign-in sync notice:', fsErr);
    }
  }

  await user.getIdToken(true);

  window.location.replace('dashboard.html');
  return user;
}

/**
 * d) logoutUser()
 * Signs out from Firebase Auth and redirects to login.html
 */
async function logoutUser() {
  try {
    sessionStorage.removeItem('avenir_interview_data');
    sessionStorage.clear();
    currentAuthUser = null;
    authInitialized = false;
    authInitPromise = null;
    if (firebase && firebase.auth) {
      await firebase.auth().signOut();
    }
  } catch (error) {
    console.error('Error during sign out:', error);
  } finally {
    window.location.replace('login.html');
  }
}

/**
 * e) resetPassword(email)
 * Sends password reset email
 */
async function resetPassword(email) {
  if (!firebase || !firebase.auth) {
    throw new Error('Firebase Auth is not initialized.');
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  await firebase.auth().sendPasswordResetEmail(cleanEmail);
  return true;
}

/**
 * f) getCurrentUser()
 * Returns currently signed-in user or null
 */
function getCurrentUser() {
  if (currentAuthUser) return currentAuthUser;
  if (typeof auth !== 'undefined' && auth && auth.currentUser) {
    return auth.currentUser;
  }
  if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
    return firebase.auth().currentUser;
  }
  return null;
}

/**
 * g) getAuthToken(forceRefresh = false)
 * Waits for Firebase Auth restoration if necessary, then returns current user's ID token.
 * This guarantees no protected API request is ever dispatched with a premature null token.
 */
async function getAuthToken(forceRefresh = false) {
  let user = getCurrentUser();

  // If user is null but auth hasn't initialized yet, wait for restoration
  if (!user && !authInitialized) {
    user = await waitForAuthInit();
  }

  // If still null on a protected page, give Firebase one brief retry window
  if (!user && isProtectedPage()) {
    user = await waitForAuthInit();
  }

  if (!user) return null;

  try {
    return await user.getIdToken(forceRefresh);
  } catch (error) {
    console.error('Failed to retrieve Firebase ID token:', error);
    return null;
  }
}

/**
 * Password strength validator
 * Requires minimum 8 characters, at least 1 uppercase, 1 lowercase, and 1 number
 */
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return {
      valid: false,
      message: 'Password must be at least 8 characters long.'
    };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber) {
    return {
      valid: false,
      message: 'Password must contain uppercase letters, lowercase letters, and at least one number.'
    };
  }
  return { valid: true };
}

/**
 * h) Event Listeners initialization on DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Login Form handling
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthError('loginError');

      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const rememberMeInput = document.getElementById('rememberMe');
      const loginBtn = document.getElementById('loginBtn');
      const loginSpinner = document.getElementById('loginSpinner');

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const rememberMe = rememberMeInput ? rememberMeInput.checked : false;

      if (!email || !password) {
        showAuthError('Please enter both your email and password.', 'loginError');
        return;
      }

      setButtonLoading(loginBtn, loginSpinner, true);

      try {
        await loginUser(email, password, rememberMe);
      } catch (error) {
        console.error('Login error:', error);
        setButtonLoading(loginBtn, loginSpinner, false, 'Sign In');
        showAuthError(getFriendlyAuthErrorMessage(error), 'loginError');
      }
    });
  }

  // 2. Register Form handling
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthError('registerError');

      const fullNameInput = document.getElementById('fullName');
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const confirmPasswordInput = document.getElementById('confirmPassword');
      const agreeTermsInput = document.getElementById('agreeTerms');
      const registerBtn = document.getElementById('registerBtn');
      const registerSpinner = document.getElementById('registerSpinner');

      const fullName = fullNameInput ? fullNameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
      const agreeTerms = agreeTermsInput ? agreeTermsInput.checked : true;

      if (!fullName) {
        showAuthError('Please provide your full name.', 'registerError');
        fullNameInput?.focus();
        return;
      }

      if (!email) {
        showAuthError('Please provide a valid email address.', 'registerError');
        emailInput?.focus();
        return;
      }

      const passValidation = validatePasswordStrength(password);
      if (!passValidation.valid) {
        showAuthError(passValidation.message, 'registerError');
        passwordInput?.focus();
        return;
      }

      if (password !== confirmPassword) {
        showAuthError('Passwords do not match. Please re-enter your password.', 'registerError');
        confirmPasswordInput?.focus();
        return;
      }

      if (agreeTermsInput && !agreeTerms) {
        showAuthError('You must agree to the Terms of Service to create an account.', 'registerError');
        return;
      }

      setButtonLoading(registerBtn, registerSpinner, true);

      try {
        await registerUser(fullName, email, password);
      } catch (error) {
        console.error('Registration error:', error);
        setButtonLoading(registerBtn, registerSpinner, false, 'Create Account');
        showAuthError(getFriendlyAuthErrorMessage(error), 'registerError');
      }
    });
  }

  // 3. Forgot Password Form handling
  const forgotForm = document.getElementById('forgotForm');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthError('forgotError');

      const forgotSuccess = document.getElementById('forgotSuccess');
      if (forgotSuccess) forgotSuccess.classList.add('hidden');

      const emailInput = document.getElementById('email');
      const forgotBtn = document.getElementById('forgotBtn');
      const forgotSpinner = document.getElementById('forgotSpinner');

      const email = emailInput ? emailInput.value.trim() : '';

      if (!email) {
        showAuthError('Please enter your registered email address.', 'forgotError');
        emailInput?.focus();
        return;
      }

      setButtonLoading(forgotBtn, forgotSpinner, true);

      try {
        await resetPassword(email);
        setButtonLoading(forgotBtn, forgotSpinner, false, 'Send Reset Link');
        if (forgotSuccess) {
          forgotSuccess.classList.remove('hidden');
        }
        if (emailInput) emailInput.value = '';
      } catch (error) {
        console.error('Reset password error:', error);
        setButtonLoading(forgotBtn, forgotSpinner, false, 'Send Reset Link');
        showAuthError(getFriendlyAuthErrorMessage(error), 'forgotError');
      }
    });
  }

  // 4. Google Sign-In Buttons
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
      hideAuthError('loginError');
      try {
        googleSignInBtn.disabled = true;
        await loginWithGoogle();
      } catch (error) {
        googleSignInBtn.disabled = false;
        showAuthError(getFriendlyAuthErrorMessage(error), 'loginError');
      }
    });
  }

  const googleSignUpBtn = document.getElementById('googleSignUpBtn');
  if (googleSignUpBtn) {
    googleSignUpBtn.addEventListener('click', async () => {
      hideAuthError('registerError');
      try {
        googleSignUpBtn.disabled = true;
        await loginWithGoogle();
      } catch (error) {
        googleSignUpBtn.disabled = false;
        showAuthError(getFriendlyAuthErrorMessage(error), 'registerError');
      }
    });
  }

  // 5. Global Logout buttons handler (delegation and explicit IDs)
  document.addEventListener('click', (e) => {
    const logoutTarget = e.target.closest('#logoutBtn, .nav-logout, [data-action="logout"]');
    if (logoutTarget) {
      e.preventDefault();
      logoutUser();
    }
  });

  // 6. Generic Password visibility toggles
  document.querySelectorAll('.password-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const parentWrapper = btn.closest('.input-wrapper');
      if (!parentWrapper) return;
      const input = parentWrapper.querySelector('input');
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const icon = btn.querySelector('[data-lucide], i, svg');
      if (icon && window.lucide) {
        btn.innerHTML = isPassword 
          ? '<i data-lucide="eye-off"></i>' 
          : '<i data-lucide="eye"></i>';
        window.lucide.createIcons();
      }
    });
  });

  // Run Auth Check on every page load
  checkAuthState();
});

// Export functions to window namespace for direct global accessibility
window.waitForAuthInit = waitForAuthInit;
window.checkAuthState = checkAuthState;
window.registerUser = registerUser;
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.resetPassword = resetPassword;
window.getCurrentUser = getCurrentUser;
window.getAuthToken = getAuthToken;
window.loginWithGoogle = loginWithGoogle;
