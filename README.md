# AVENIR AI

<div align="center">

**Your Future Starts Here.**

*A world-class, premium AI-powered mock interview & career preparation SaaS platform inspired by Linear, Stripe, and Vercel.*

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-Backend-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-2.0%20Flash-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![Dark Mode](https://img.shields.io/badge/UI%2FUX-Light%20%26%20Dark%20Mode-FF5841?style=flat)](frontend/css/global.css)
[![License](https://img.shields.io/badge/License-Proprietary-C53678?style=flat)](#license)

</div>

---

AVENIR AI transforms technical and behavioral interview preparation with intelligent, role-tailored mock sessions, real-time voice recognition, ATS-grade resume optimization, dynamic 5-tier weighted evaluation, and personalized learning roadmaps.

## Key Features

- **Linear & Stripe-Grade UI/UX**: Ultra-clean, premium SaaS aesthetic with subtle glassmorphism, smooth micro-interactions, responsive sidebars, and universal Light & Dark Mode persistence.
- **Role-Tailored AI Mock Interviews**: Dynamic multi-turn interviews custom-built for 12+ industry roles across Software Engineering, Data, Cloud, AI/ML, and Cybersecurity.
- **Intelligent 5-Tier Weighted Evaluation**: Rigorous scoring across Technical Accuracy (30%), Problem Solving (25%), Communication (20%), Completeness (15%), and Practical Knowledge (10%) with per-question breakdowns and zero hallucinated scores.
- **Voice-Powered Practice**: Dual-mode text and voice interaction powered by Web Speech API speech-to-text with live waveforms.
- **ATS Resume Analyzer**: Extracts key skills, flags missing keywords, calculates ATS compatibility, and provides actionable bullet improvements.
- **Interactive Performance Analytics**: Rich canvas-based trend charts, category breakdowns, and difficulty metrics that adapt seamlessly across light and dark themes.
- **Personalized Learning Roadmaps**: Week-by-week structured curriculum targeting candidate-specific weak areas.
- **Peer Group Interviews**: Shared room codes with peer candidate grids for collaborative mock sessions.
- **Community Leaderboard & PDF Export**: Competitive ranking and exportable executive-ready evaluation reports.

## Design System & Theme Engine

AVENIR AI features a cohesive brand identity with zero-FOUC (Flash of Unstyled Content) Light/Dark mode transitions:

| Token | Light Mode | Dark Mode (Linear-Inspired) |
|---|---|---|
| **Primary Coral** | `#FF5841` | `#FF5841` |
| **Secondary Pink** | `#C53678` | `#C53678` |
| **Background** | `#FFFFFF` | `#0D1117` |
| **Surface Secondary** | `#FFF8F7` | `#161B22` |
| **Card Surface** | `#FFFFFF` | `#1C2128` |
| **Primary Text** | `#242424` | `#F0F3F6` |
| **Secondary Text** | `#74717A` | `#A0AAB8` |
| **Border Color** | `#F0E2E8` | `#30363D` |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | Firebase Cloud Firestore |
| Auth | Firebase Authentication |
| AI | Google Gemini API |
| Icons | Lucide Icons |

## Project Structure

```
AVENIR-AI/
├── frontend/           # Static frontend files
│   ├── css/           # Stylesheets
│   ├── js/            # JavaScript modules
│   ├── assets/        # Images, icons, logo
│   └── *.html         # Page files
├── backend/           # Express.js API server
│   ├── config/        # Firebase & Gemini config
│   ├── routes/        # API route handlers
│   ├── controllers/   # Business logic
│   ├── services/      # AI & utility services
│   ├── middleware/     # Auth & error handling
│   └── utils/         # Validators & helpers
└── firebase/          # Firestore rules & indexes
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A [Firebase](https://console.firebase.google.com/) project
- A [Google Gemini API](https://ai.google.dev/) key

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd AVENIR-AI
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Authentication** → Email/Password sign-in method
4. Enable **Cloud Firestore** database
5. Get your **web app config** (Project Settings → General → Your apps → Web app):
   - Copy the `firebaseConfig` object
   - Paste values into `frontend/js/firebase-config.js`
6. Generate a **service account key** (Project Settings → Service accounts → Generate new private key):
   - This JSON file contains `project_id`, `client_email`, and `private_key`
   - Use these values for backend environment variables
   - **Never commit this file to git**
7. Deploy Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

### 3. Gemini API Setup

1. Go to [Google AI Studio](https://ai.google.dev/)
2. Create an API key
3. Use this key in your backend `.env` file

### 4. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your actual values:

```env
PORT=5000
GEMINI_API_KEY=your_actual_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### 5. Frontend Setup

Edit `frontend/js/firebase-config.js` with your Firebase web app config:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

Edit `frontend/js/api.js` to set the correct `API_BASE_URL` for your backend (default is `http://localhost:5000`).

### 6. Run Locally (One Command)

You can run both the frontend and backend simultaneously:

**Option A — Single Command:**
```bash
npm start
```
*Or double-click `start.bat` on Windows.*

**Option B — Run Separately:**
```bash
# Terminal 1 (Backend on :5000)
npm run start:backend

# Terminal 2 (Frontend on :3000)
npm run start:frontend
```

Then visit:
- **Frontend Application:** `http://localhost:3000`
- **Backend API Health:** `http://localhost:5000/api/health`

## Deployment

### Frontend → Vercel

1. Install [Vercel CLI](https://vercel.com/cli): `npm i -g vercel`
2. From the `frontend/` directory:
   ```bash
   cd frontend
   vercel
   ```
3. Follow the prompts
4. Update `API_BASE_URL` in `frontend/js/api.js` to your deployed backend URL

### Backend → Render

1. Create a new **Web Service** on [Render](https://render.com/)
2. Connect your GitHub repository
3. Set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add all environment variables from `.env`
5. Set `FRONTEND_URL` to your Vercel frontend URL
6. Deploy

### Firebase

1. Install Firebase CLI: `npm i -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init` (select Firestore)
4. Deploy rules: `firebase deploy --only firestore:rules`
5. Deploy indexes: `firebase deploy --only firestore:indexes`

## Environment Variables

### Backend (.env)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 5000) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Gemini model name (default: gemini-2.0-flash) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `FRONTEND_URL` | Frontend URL for CORS |
| `NODE_ENV` | Environment (development/production) |

### Frontend

| File | Config |
|------|--------|
| `js/firebase-config.js` | Firebase web app configuration |
| `js/api.js` | `API_BASE_URL` for backend |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/verify` | Verify Firebase token |
| POST | `/api/interview/generate` | Generate interview questions |
| POST | `/api/interview/evaluate` | Evaluate an answer |
| POST | `/api/interview/followup` | Generate follow-up question |
| POST | `/api/interview/complete` | Complete interview & get report |
| GET | `/api/interview/history` | Get interview history |
| GET | `/api/interview/:id` | Get single interview |
| DELETE | `/api/interview/:id` | Delete interview |
| POST | `/api/resume/analyze` | Analyze resume |
| GET | `/api/resume/history` | Get resume analysis history |
| GET | `/api/analytics/dashboard` | Get dashboard data |
| GET | `/api/analytics/performance` | Get performance analytics |
| GET | `/api/leaderboard` | Get leaderboard |
| POST | `/api/learning/generate` | Generate learning plan |
| POST | `/api/learning/progress` | Update learning progress |
| POST | `/api/group/create` | Create group room |
| POST | `/api/group/join` | Join group room |
| GET | `/api/group/:roomId` | Get room details |
| POST | `/api/group/:roomId/answer` | Submit group answer |
| GET | `/api/user/profile` | Get user profile |
| PUT | `/api/user/profile` | Update user profile |
| PUT | `/api/user/settings` | Update user settings |
| POST | `/api/face/detect` | Detect human faces & attributes (Luxand.cloud) |
| GET | `/api/face/status` | Face detection service readiness status |

## Security

- API keys are stored in environment variables only
- Firebase Admin SDK verifies auth tokens on all protected endpoints
- User data is access-controlled via Firestore security rules
- File uploads are validated for type and size
- CORS is configured for the deployed frontend domain
- Rate limiting is applied to all API endpoints
- No credentials are logged or exposed

## License

This project is proprietary. All rights reserved.

---

**AVENIR AI** — *Practice. Improve. Succeed.*

