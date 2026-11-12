const { db } = require('../config/firebase');

/**
 * a) getDashboard
 * Queries user's interviews and computes summary dashboard statistics
 */
const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.uid;

    let snapshot;
    try {
      snapshot = await db
        .collection('interviews')
        .where('userId', '==', userId)
        .get();
    } catch (dbErr) {
      console.warn('[Firestore Dashboard Query Warning]:', dbErr.message);
      return res.status(200).json({
        success: true,
        data: {
          totalInterviews: 0,
          completedCount: 0,
          avgScore: 0,
          highestScore: 0,
          totalTimeMinutes: 0,
          recentInterviews: [],
          firestoreNotice: (dbErr.message.includes('NOT_FOUND') || dbErr.message.includes('PERMISSION_DENIED'))
            ? 'Cloud Firestore database pending creation in Google Cloud Console.'
            : undefined,
        },
      });
    }

    const totalInterviews = snapshot.size;
    let completedCount = 0;
    const scores = [];
    let totalEstimatedMinutes = 0;

    const allInterviews = snapshot.docs.map((doc) => {
      const data = doc.data();
      const score = data.report?.overallScore;

      if (data.status === 'completed') {
        completedCount++;
        if (typeof score === 'number' && !isNaN(score)) {
          scores.push(score);
        }

        // Estimate time: difference between createdAt and completedAt if available, else 3 min per question
        if (data.createdAt && data.completedAt) {
          const diffMs = new Date(data.completedAt) - new Date(data.createdAt);
          const minutes = Math.round(diffMs / 60000);
          totalEstimatedMinutes += minutes > 0 && minutes < 180 ? minutes : (data.questions?.length || 5) * 3;
        } else {
          totalEstimatedMinutes += (data.questions?.length || 5) * 3;
        }
      }

      return {
        id: doc.id,
        jobRole: data.jobRole,
        interviewType: data.interviewType,
        difficulty: data.difficulty,
        status: data.status,
        overallScore: score ?? data.overallScore ?? null,
        createdAt: data.createdAt,
        questionCount: data.questions?.length || 0,
      };
    });

    // Sort descending by createdAt in JavaScript
    allInterviews.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const recentInterviews = allInterviews.slice(0, 5);

    return res.status(200).json({
      success: true,
      data: {
        totalInterviews,
        completedCount,
        avgScore,
        highestScore,
        totalTimeMinutes: totalEstimatedMinutes,
        recentInterviews,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Canonical categories for AVENIR AI
 */
const CANONICAL_CATEGORIES = [
  'HR Interview',
  'Technical Interview',
  'Coding Interview',
  'Behavioral Interview',
  'Domain-Specific Interview'
];

/**
 * Normalizes any category string into one of the 5 canonical categories
 */
function normalizeCategory(raw) {
  if (!raw) return 'Technical Interview';
  const lower = String(raw).toLowerCase().trim();
  if (lower.includes('code') || lower === 'coding') return 'Coding Interview';
  if (lower.includes('hr')) return 'HR Interview';
  if (lower.includes('behav')) return 'Behavioral Interview';
  if (lower.includes('domain')) return 'Domain-Specific Interview';
  if (lower.includes('tech')) return 'Technical Interview';
  return 'Technical Interview';
}

/**
 * Formats duration in minutes into a human-readable string ("1 hr 25 mins" or "45 mins")
 */
function formatMinutes(totalMins) {
  if (!totalMins || totalMins <= 0) return '0 mins';
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} mins`;
  if (hrs > 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${mins} mins`;
}

/**
 * Calculates interview session duration in minutes
 */
function calculateDurationMinutes(doc) {
  if (doc.completedAt && doc.createdAt) {
    const diffMs = new Date(doc.completedAt) - new Date(doc.createdAt);
    const mins = Math.round(diffMs / 60000);
    if (mins > 0 && mins < 240) return mins;
  }
  if (typeof doc.durationMinutes === 'number' && doc.durationMinutes > 0) {
    return Math.round(doc.durationMinutes);
  }
  const qCount = doc.questions?.length || (doc.answers ? Object.keys(doc.answers).length : 5);
  return Math.max(1, Math.round(qCount * 2.5));
}

/**
 * b) getPerformance
 * Aggregates performance data across categories, difficulty levels, and time ranges
 * using actual completed interview records from Firestore for the authenticated user.
 */
const getPerformance = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const timeRange = (req.query.timeRange || 'allTime').toLowerCase();

    let snapshot;
    try {
      snapshot = await db.collection('interviews').where('userId', '==', userId).get();
    } catch (dbErr) {
      console.warn('[Firestore Performance Query Warning]:', dbErr.message);
      return res.status(200).json({
        success: true,
        data: {
          timeRange,
          totalInterviews: 0,
          totalStarted: 0,
          completedCount: 0,
          inProgressCount: 0,
          avgScore: 0,
          bestScore: 0,
          completionRate: 0,
          stats: {
            practiceTimeFormatted: '0 mins',
            practiceTimeSubtext: 'No sessions recorded',
            avgScoreText: '0%',
            avgScoreSubtext: 'No completed evaluations',
            completionRateText: '0%',
            completionRateSubtext: 'No sessions started',
            totalSessionsText: '0',
            totalSessionsSubtext: '0 sessions',
          },
          timeline: [],
          scoreTrend: [],
          categoryPerformance: Object.fromEntries(CANONICAL_CATEGORIES.map(c => [c, 0])),
          categories: Object.fromEntries(CANONICAL_CATEGORIES.map(c => [c, { attempts: 0, avgScore: 0, highestScore: 0, trend: '0%' }])),
          difficultyBreakdown: {
            easy: { attempts: 0, avgScore: 0 },
            medium: { attempts: 0, avgScore: 0 },
            hard: { attempts: 0, avgScore: 0 },
          },
          insights: {
            strongestCategory: 'None yet',
            weakestCategory: 'None yet',
            recentImprovement: '0%',
            targetedImprovements: [
              { title: 'Take Your First Mock Interview', desc: 'Complete an interview session to identify specific technical and behavioral focus areas.' }
            ],
          },
        },
      });
    }

    const allDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Date range boundaries
    const now = new Date();
    let currentFilterStart = null;
    let previousFilterStart = null;
    let previousFilterEnd = null;

    if (timeRange === 'weekly') {
      currentFilterStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      previousFilterStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      previousFilterEnd = currentFilterStart;
    } else if (timeRange === 'monthly') {
      currentFilterStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousFilterStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      previousFilterEnd = currentFilterStart;
    }

    // Filter current vs previous period
    const docsInPeriod = allDocs.filter((doc) => {
      if (!currentFilterStart) return true;
      const dt = new Date(doc.createdAt || doc.completedAt || 0);
      return dt >= currentFilterStart;
    });

    const docsInPreviousPeriod = allDocs.filter((doc) => {
      if (!previousFilterStart) return false;
      const dt = new Date(doc.createdAt || doc.completedAt || 0);
      return dt >= previousFilterStart && dt < previousFilterEnd;
    });

    const totalStarted = docsInPeriod.length;
    const completedInPeriod = docsInPeriod.filter((doc) => doc.status === 'completed');
    const inProgressInPeriod = docsInPeriod.filter((doc) => doc.status !== 'completed');
    const completionRate = totalStarted > 0 ? Math.round((completedInPeriod.length / totalStarted) * 100) : 0;

    // Total Practice Time
    let currentPracticeMinutes = 0;
    completedInPeriod.forEach((doc) => {
      currentPracticeMinutes += calculateDurationMinutes(doc);
    });

    let prevPracticeMinutes = 0;
    const prevCompleted = docsInPreviousPeriod.filter((doc) => doc.status === 'completed');
    prevCompleted.forEach((doc) => {
      prevPracticeMinutes += calculateDurationMinutes(doc);
    });

    // Valid Scores
    const validScores = [];
    completedInPeriod.forEach((doc) => {
      const score = doc.report?.overallScore ?? doc.overallScore;
      if (typeof score === 'number' && !isNaN(score)) {
        validScores.push(Math.round(score));
      }
    });

    const avgScore = validScores.length > 0
      ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
      : 0;
    const bestScore = validScores.length > 0 ? Math.max(...validScores) : 0;

    const prevValidScores = [];
    prevCompleted.forEach((doc) => {
      const score = doc.report?.overallScore ?? doc.overallScore;
      if (typeof score === 'number' && !isNaN(score)) {
        prevValidScores.push(Math.round(score));
      }
    });
    const prevAvgScore = prevValidScores.length > 0
      ? Math.round(prevValidScores.reduce((a, b) => a + b, 0) / prevValidScores.length)
      : null;

    // Practice Time Subtext
    let practiceTimeSubtext = '';
    if (prevPracticeMinutes > 0) {
      const diff = currentPracticeMinutes - prevPracticeMinutes;
      const sign = diff >= 0 ? '+' : '';
      practiceTimeSubtext = `${sign}${formatMinutes(Math.abs(diff))} vs previous period`;
    } else if (currentPracticeMinutes > 0) {
      practiceTimeSubtext = timeRange === 'weekly' ? 'Logged this week' : timeRange === 'monthly' ? 'Logged this month' : 'Total recorded practice';
    } else {
      practiceTimeSubtext = 'No sessions recorded';
    }

    // Avg Score Subtext
    let avgScoreSubtext = '';
    if (prevAvgScore !== null) {
      const diff = avgScore - prevAvgScore;
      const sign = diff >= 0 ? '+' : '';
      avgScoreSubtext = `${sign}${diff}% vs previous period`;
    } else if (validScores.length > 0) {
      avgScoreSubtext = `Based on ${validScores.length} completed session${validScores.length > 1 ? 's' : ''}`;
    } else {
      avgScoreSubtext = 'No completed evaluations';
    }

    // Completion Rate Subtext
    const completionRateSubtext = totalStarted > 0
      ? `${completedInPeriod.length} of ${totalStarted} sessions completed`
      : 'No sessions started';

    // Total Sessions Subtext
    const totalSessionsSubtext = totalStarted > 0
      ? `${inProgressInPeriod.length} in progress • ${totalStarted} total`
      : '0 sessions';

    // Timeline for Trend Chart (chronological: oldest to newest)
    const sortedCompleted = [...completedInPeriod].sort(
      (a, b) => new Date(a.completedAt || a.createdAt || 0) - new Date(b.completedAt || b.createdAt || 0)
    );

    const timeline = sortedCompleted.map((doc, idx) => {
      const dt = new Date(doc.completedAt || doc.createdAt || Date.now());
      const score = doc.report?.overallScore ?? doc.overallScore ?? 0;
      return {
        id: doc.id,
        sessionIndex: idx + 1,
        date: dt.toISOString(),
        formattedDate: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: Math.round(score),
        jobRole: doc.jobRole || 'Software Engineer',
        category: normalizeCategory(doc.category || doc.interviewType),
        difficulty: doc.difficulty || 'medium',
        questionsCount: doc.questions?.length || 0,
      };
    });

    // Category Breakdown
    const categoryMap = {};
    CANONICAL_CATEGORIES.forEach((cat) => {
      categoryMap[cat] = {
        attempts: 0,
        scores: [],
        highestScore: 0,
        avgScore: 0,
        trend: '0%',
      };
    });

    completedInPeriod.forEach((doc) => {
      const cat = normalizeCategory(doc.category || doc.interviewType);
      const score = doc.report?.overallScore ?? doc.overallScore;
      if (categoryMap[cat]) {
        categoryMap[cat].attempts++;
        if (typeof score === 'number' && !isNaN(score)) {
          categoryMap[cat].scores.push(Math.round(score));
        }
      }
    });

    Object.keys(categoryMap).forEach((cat) => {
      const entry = categoryMap[cat];
      if (entry.scores.length > 0) {
        entry.avgScore = Math.round(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length);
        entry.highestScore = Math.max(...entry.scores);
        if (entry.scores.length >= 2) {
          const diff = entry.scores[entry.scores.length - 1] - entry.scores[0];
          entry.trend = `${diff >= 0 ? '+' : ''}${diff}%`;
        } else {
          entry.trend = '0%';
        }
      }
    });

    // Difficulty Breakdown
    const difficultyMap = {
      easy: { attempts: 0, scores: [], avgScore: 0 },
      medium: { attempts: 0, scores: [], avgScore: 0 },
      hard: { attempts: 0, scores: [], avgScore: 0 },
    };

    completedInPeriod.forEach((doc) => {
      const diff = String(doc.difficulty || 'medium').toLowerCase();
      const target = difficultyMap[diff] || difficultyMap.medium;
      target.attempts++;
      const score = doc.report?.overallScore ?? doc.overallScore;
      if (typeof score === 'number' && !isNaN(score)) {
        target.scores.push(Math.round(score));
      }
    });

    Object.keys(difficultyMap).forEach((k) => {
      const d = difficultyMap[k];
      d.avgScore = d.scores.length > 0 ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length) : 0;
    });

    // Insights: Strongest & Weakest Category
    let strongest = null;
    let weakest = null;
    let maxAvg = -1;
    let minAvg = 999;

    CANONICAL_CATEGORIES.forEach((cat) => {
      const c = categoryMap[cat];
      if (c.attempts > 0) {
        if (c.avgScore > maxAvg) {
          maxAvg = c.avgScore;
          strongest = `${cat} (${c.avgScore}%)`;
        }
        if (c.avgScore < minAvg) {
          minAvg = c.avgScore;
          weakest = `${cat} (${c.avgScore}%)`;
        }
      }
    });

    // Recent improvement
    let recentImprovement = '0%';
    if (timeline.length >= 2) {
      const diff = timeline[timeline.length - 1].score - timeline[timeline.length - 2].score;
      recentImprovement = `${diff >= 0 ? '+' : ''}${diff}%`;
    }

    // Targeted Improvements
    const improvements = [];
    completedInPeriod.forEach((doc) => {
      const recTopics = doc.report?.recommendedTopics || [];
      const weaknesses = doc.report?.weaknesses || [];
      recTopics.slice(0, 2).forEach((t) => {
        if (t && !improvements.some((i) => i.title.toLowerCase() === t.toLowerCase())) {
          improvements.push({
            title: t,
            desc: weaknesses[0] || `Focus on mastering core concepts and structured communication in ${t}.`,
          });
        }
      });
    });

    if (improvements.length === 0 && completedInPeriod.length === 0) {
      improvements.push(
        { title: 'Take Your First Mock Interview', desc: 'Complete an interview session to identify specific technical and behavioral focus areas.' }
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        timeRange,
        totalInterviews: totalStarted,
        totalStarted,
        completedCount: completedInPeriod.length,
        inProgressCount: inProgressInPeriod.length,
        avgScore,
        bestScore,
        completionRate,
        stats: {
          practiceTimeFormatted: formatMinutes(currentPracticeMinutes),
          practiceTimeSubtext,
          avgScoreText: validScores.length > 0 ? `${avgScore}%` : '0%',
          avgScoreSubtext,
          completionRateText: `${completionRate}%`,
          completionRateSubtext,
          totalSessionsText: String(totalStarted),
          totalSessionsSubtext,
        },
        timeline,
        scoreTrend: timeline,
        categoryPerformance: Object.fromEntries(CANONICAL_CATEGORIES.map((cat) => [cat, categoryMap[cat].avgScore])),
        categories: categoryMap,
        difficultyBreakdown: difficultyMap,
        insights: {
          strongestCategory: strongest || 'None yet',
          weakestCategory: weakest || 'None yet',
          recentImprovement,
          targetedImprovements: improvements.slice(0, 4),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getPerformance,
};
