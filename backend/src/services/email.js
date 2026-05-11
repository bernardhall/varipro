const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

if (!resend) {
  console.warn('⚠️ WARNING: RESEND_API_KEY not found. Emails will not be sent.');
}

const BACKEND_URL = process.env.BACKEND_URL || 'https://varipro-backend.onrender.com';

async function sendConfirmationEmail(email, name, token) {
  const confirmLink = `${BACKEND_URL}/auth/confirm/${token}`;

  if (!resend) {
    console.error(`[Email] Cannot send email to ${email} - RESEND_API_KEY is missing.`);
    return null;
  }

  try {
    const data = await resend.emails.send({
      from: 'VariPro <onboarding@resend.dev>', // In production, use your own domain
      to: email,
      subject: 'Welcome to VariPro! Please confirm your email',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1a365d;">Welcome to VariPro, ${name}!</h2>
          <p>Thanks for joining the professional team. To get started, we just need to verify your email address.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${confirmLink}" style="background-color: #f6ad55; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Confirm My Account</a>
          </div>
          <p style="color: #718096; font-size: 14px;">If you didn't create an account with VariPro, you can safely ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 20px 0;">
          <p style="font-size: 12px; color: #a0aec0;">VariPro - Professional Trade Quoting & Management</p>
        </div>
      `,
    });

    return data;
  } catch (error) {
    console.error('Failed to send confirmation email', error);
    throw error;
  }
}

module.exports = { sendConfirmationEmail };
