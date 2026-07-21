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
      from: process.env.RESEND_FROM_EMAIL || 'VariPro <onboarding@resend.dev>',
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

async function sendQuoteNotificationEmail(toEmail, creatorName, quote, status, clientName, comments) {
  if (!resend) {
    console.error(`[Email] Cannot send quote notification email - RESEND_API_KEY is missing.`);
    return null;
  }

  const actionText = status === 'accepted' ? 'ACCEPTED ✅' : 'DECLINED ❌';
  const subject = `Quote ${actionText}: ${quote.job_name}`;

  try {
    const data = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'VariPro <onboarding@resend.dev>',
      to: toEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: ${status === 'accepted' ? '#059669' : '#dc2626'}; margin-top: 0;">Quote ${status === 'accepted' ? 'Accepted' : 'Declined'}</h2>
          <p>Hi ${creatorName},</p>
          <p>Your client <strong>${clientName || 'N/A'}</strong> has <strong>${status}</strong> the quote for <strong>${quote.job_name}</strong>.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px 0;"><strong>Job:</strong> ${quote.job_name}</p>
            <p style="margin: 0 0 8px 0;"><strong>Total Value:</strong> $${(quote.grand_total || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            ${comments ? `<p style="margin: 8px 0 0 0; font-style: italic;"><strong>Client Comments:</strong> "${comments}"</p>` : ''}
          </div>
          
          <p>You can check the quote details and manage the job inside your VariPro app.</p>
          <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 20px 0;">
          <p style="font-size: 12px; color: #a0aec0;">VariPro Notification System</p>
        </div>
      `,
    });

    return data;
  } catch (error) {
    console.error('Failed to send quote notification email', error);
    throw error;
  }
}

async function sendContractorCopyEmail(contractorEmail, quote, method, recipient, messageBody, pdfBase64) {
  if (!resend) {
    console.error(`[Email] Cannot send contractor copy email - RESEND_API_KEY is missing.`);
    return null;
  }

  const subject = `Quote Sent Copy: ${quote.job_name}`;

  try {
    const data = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'VariPro <onboarding@resend.dev>',
      to: contractorEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1a365d; margin-top: 0;">Quote Sent Notification</h2>
          <p>A quote was just sent from your VariPro account.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px 0;"><strong>Job:</strong> ${quote.job_name}</p>
            <p style="margin: 0 0 8px 0;"><strong>Method:</strong> ${method.toUpperCase()}</p>
            <p style="margin: 0 0 8px 0;"><strong>Sent To:</strong> ${recipient || 'Unknown'}</p>
          </div>

          <p><strong>Message Sent:</strong></p>
          <blockquote style="margin: 10px 0; padding: 10px 15px; border-left: 4px solid #cbd5e1; background-color: #f1f5f9; color: #334155; white-space: pre-wrap;">${messageBody}</blockquote>
          
          <p>A copy of the PDF that was attached is included with this email.</p>
          <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 20px 0;">
          <p style="font-size: 12px; color: #a0aec0;">VariPro Notification System</p>
        </div>
      `,
      attachments: [
        {
          filename: `Quote_${quote.job_name.replace(/ /g, '_')}.pdf`,
          content: pdfBase64,
        }
      ]
    });

    return data;
  } catch (error) {
    console.error('Failed to send contractor copy email', error);
    throw error;
  }
}

async function sendClientQuoteStatusEmail(clientEmail, clientName, quote, status) {
  if (!resend) {
    console.error(`[Email] Cannot send client quote status email - RESEND_API_KEY is missing.`);
    return null;
  }

  const actionText = status === 'accepted' ? 'Accepted' : 'Declined';
  const subject = `Your Quote is ${actionText}: ${quote.job_name}`;

  try {
    const data = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'VariPro <onboarding@resend.dev>',
      to: clientEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: ${status === 'accepted' ? '#059669' : '#dc2626'}; margin-top: 0;">Quote ${actionText}</h2>
          <p>Hi ${clientName || 'there'},</p>
          <p>This is a confirmation that you have successfully <strong>${status}</strong> the quote for <strong>${quote.job_name}</strong>.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px 0;"><strong>Job:</strong> ${quote.job_name}</p>
            <p style="margin: 0 0 8px 0;"><strong>Total Value:</strong> $${(quote.grand_total || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          
          <p>${status === 'accepted' ? 'The contractor has been notified and will be in touch with you shortly.' : 'The contractor has been notified of your decision.'}</p>
          <p>Thank you.</p>
          <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 20px 0;">
          <p style="font-size: 12px; color: #a0aec0;">VariPro Notification System</p>
        </div>
      `,
    });

    return data;
  } catch (error) {
    console.error('Failed to send client quote status email', error);
    throw error;
  }
}

module.exports = { sendConfirmationEmail, sendQuoteNotificationEmail, sendContractorCopyEmail, sendClientQuoteStatusEmail };
