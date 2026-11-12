/**
 * AVENIR AI - Transactional Email Service
 * Powered by Resend API (github.com/public-apis/public-apis)
 * with graceful development preview fallback
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send an email via Resend REST API or graceful mock logger
 */
async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'AVENIR AI <onboarding@resend.dev>';

  if (!to || !subject) {
    throw new Error('Email recipient and subject are required.');
  }

  // Graceful development mode if no API key is provided
  if (!apiKey || apiKey.includes('your_resend_api_key')) {
    console.log(`[EmailService - Dev Preview]
--------------------------------------------------
To: ${to}
From: ${fromEmail}
Subject: ${subject}
Notice: RESEND_API_KEY not configured. Email logged in console.
--------------------------------------------------`);
    return {
      success: true,
      delivered: false,
      devMode: true,
      message: 'Email logged to server console (development mode).',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || '',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Resend API HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    console.log(`[EmailService] Email dispatched successfully to ${to}. ID: ${data.id}`);
    return {
      success: true,
      delivered: true,
      id: data.id,
    };
  } catch (error) {
    console.error('[EmailService] Dispatch failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send Mock Interview Scorecard Summary Email
 */
async function sendScorecardEmail({ toEmail, userName, role, overallScore, summary = '' }) {
  const subject = `Your AVENIR AI Mock Interview Report - ${role} (${overallScore}/100)`;
  const safeName = userName || 'Candidate';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F4F5F7; margin: 0; padding: 24px; color: #252525; }
        .card { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E9EBEF; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .logo { font-size: 20px; font-weight: 800; color: #FF7900; letter-spacing: -0.02em; margin-bottom: 24px; }
        .score-box { background: #FFF2E8; border: 1px solid #FFE0C2; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
        .score-val { font-size: 42px; font-weight: 800; color: #FF7900; margin: 0; }
        .score-label { font-size: 14px; color: #666666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
        .footer { font-size: 12px; color: #888888; text-align: center; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">AVENIR AI</div>
        <h2>Hello, ${safeName}!</h2>
        <p>Congratulations on completing your mock interview for <strong>${role}</strong>.</p>
        
        <div class="score-box">
          <div class="score-val">${overallScore}</div>
          <div class="score-label">Overall Evaluation Score</div>
        </div>

        <p>${summary || 'Your comprehensive feedback, strengths, and targeted improvement roadmap have been recorded on your dashboard.'}</p>
        
        <p style="margin-top: 24px;">Keep preparing, keep growing.</p>
        <p><strong>The AVENIR AI Team</strong><br><em>Your Future Starts Here.</em></p>
      </div>
      <div class="footer">
        AVENIR AI Interview Platform &bull; Configure email preferences in your Settings.
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: toEmail,
    subject,
    html,
    text: `Hello ${safeName},\n\nYou completed your mock interview for ${role}. Overall Score: ${overallScore}/100.\n\nKeep preparing,\nThe AVENIR AI Team`,
  });
}

module.exports = {
  sendEmail,
  sendScorecardEmail,
};

