require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Middlewares
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route Handlers
const authRoutes = require('./routes/authRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const learningRoutes = require('./routes/learningRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const groupRoutes = require('./routes/groupRoutes');
const userRoutes = require('./routes/userRoutes');
const faceRoutes = require('./routes/faceRoutes');
const jobsRoutes = require('./routes/jobsRoutes');
const codeRoutes = require('./routes/codeRoutes');
const skillsRoutes = require('./routes/skillsRoutes');
const { isLuxandConfigured } = require('./config/luxand');

const app = express();
const PORT = process.env.PORT || 5000;

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Cross-Origin Resource Sharing
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Cross-Origin Request Blocked by CORS policy.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  })
);

// HTTP Request Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Rate Limiting: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP address. Please try again after 15 minutes.',
  },
});

app.use('/api/', apiLimiter);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    app: 'AVENIR AI',
    tagline: 'Your Future Starts Here.',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// API Routes Mounting
app.use('/api/auth', authRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/user', userRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/skills', skillsRoutes);

// Frontend Static File Serving
const frontendDir = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendDir));

// Route any non-API clean URLs (e.g. /dashboard -> dashboard.html)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return notFoundHandler(req, res, next);
  }
  const cleanPath = req.path.replace(/^\//, '');
  const candidateHtml = path.join(frontendDir, `${cleanPath}.html`);
  if (cleanPath && fs.existsSync(candidateHtml)) {
    return res.sendFile(candidateHtml);
  }
  if (req.path === '/' || req.path === '') {
    return res.sendFile(path.join(frontendDir, 'index.html'));
  }
  res.status(404).sendFile(path.join(frontendDir, '404.html'), (err) => {
    if (err) res.status(404).send('Page Not Found');
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`  AVENIR AI Server Running on Port ${PORT}    `);
  console.log(`  --> http://localhost:${PORT}                 `);
  console.log(`  --> http://127.0.0.1:${PORT}                 `);
  console.log(`  "Your Future Starts Here."                  `);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);

  // Check Luxand API token at startup
  if (isLuxandConfigured()) {
    console.log(`  Luxand Face API: CONFIGURED & READY         `);
  } else {
    console.warn(`  [Luxand Warning] LUXAND_API_TOKEN is missing `);
  }

  console.log(`===============================================`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = app;
