const { db } = require('../config/firebase');

/**
 * GET /api/leaderboard
 * Computes public ranking of candidates who opted into the public leaderboard.
 * Never exposes user emails or private credentials.
 */
const getLeaderboard = async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));

    // 1. Get all users who have opted into leaderboard
    const usersSnapshot = await db
      .collection('users')
      .where('optInLeaderboard', '==', true)
      .get();

    if (usersSnapshot.empty) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const optedInUserMap = new Map();
    usersSnapshot.forEach((doc) => {
      const u = doc.data();
      optedInUserMap.set(doc.id, {
        displayName: u.displayName || 'Candidate ' + doc.id.slice(0, 5),
        targetRole: u.targetRole || 'Software Engineer',
        photoURL: u.photoURL || null,
        scores: [],
        completedCount: 0,
      });
    });

    // 2. Query completed interviews
    const interviewsSnapshot = await db
      .collection('interviews')
      .where('status', '==', 'completed')
      .get();

    interviewsSnapshot.forEach((doc) => {
      const item = doc.data();
      const user = optedInUserMap.get(item.userId);
      if (user && item.report?.overallScore) {
        user.scores.push(item.report.overallScore);
        user.completedCount += 1;
      }
    });

    // 3. Compute stats and ranks
    const leaderboard = [];
    optedInUserMap.forEach((user, userId) => {
      if (user.completedCount > 0) {
        const avg = Math.round(user.scores.reduce((a, b) => a + b, 0) / user.scores.length);
        const highest = Math.max(...user.scores);

        // Compute badge based on performance & sessions
        let badge = 'Novice';
        if (user.completedCount >= 10 && avg >= 85) {
          badge = 'Master';
        } else if (user.completedCount >= 5 && avg >= 75) {
          badge = 'Pro';
        } else if (user.completedCount >= 3) {
          badge = 'Rising Star';
        }

        leaderboard.push({
          id: userId.slice(0, 8), // Masked ID, not full UID
          displayName: user.displayName,
          targetRole: user.targetRole,
          photoURL: user.photoURL,
          averageScore: avg,
          highestScore: highest,
          interviewsCompleted: user.completedCount,
          badge,
        });
      }
    });

    // Sort descending by average score, then by completedCount
    leaderboard.sort((a, b) => {
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      return b.interviewsCompleted - a.interviewsCompleted;
    });

    const ranked = leaderboard.slice(0, limit).map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
    }));

    return res.status(200).json({
      success: true,
      data: ranked,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLeaderboard,
};
