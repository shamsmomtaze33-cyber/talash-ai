import nodemailer from 'nodemailer';

export interface EmailDeliveryStatus {
  configured: boolean;
  provider: 'smtp' | 'resend' | null;
}

export function getEmailDeliveryStatus(): EmailDeliveryStatus {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (smtpHost && smtpUser && smtpPass) {
    return { configured: true, provider: 'smtp' };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    return { configured: true, provider: 'resend' };
  }

  return { configured: false, provider: null };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ sent: boolean; provider?: 'smtp' | 'resend'; reason?: string }> {
  const status = getEmailDeliveryStatus();
  if (!status.configured || !status.provider) {
    return {
      sent: false,
      reason: 'Transactional email delivery (SMTP_* or RESEND_API_KEY) is not configured on the server.',
    };
  }

  const fromAddress =
    process.env.SMTP_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'TALASH Ai <no-reply@talash.ai>';

  if (status.provider === 'smtp') {
    const port = Number(process.env.SMTP_PORT || '587');
    const secure =
      process.env.SMTP_SECURE?.trim().toLowerCase() === 'true' || port === 465;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });

    await transporter.sendMail({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    return { sent: true, provider: 'smtp' };
  }

  // Resend HTTPS API
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  });

  if (!resendResponse.ok) {
    const errText = await resendResponse.text().catch(() => '');
    throw new Error(`Email provider error (${resendResponse.status}): ${errText || resendResponse.statusText}`);
  }

  return { sent: true, provider: 'resend' };
}

export async function sendVerificationEmail(params: {
  to: string;
  name: string;
  verifyUrl: string;
  code: string;
}): Promise<{ sent: boolean; provider?: 'smtp' | 'resend'; reason?: string }> {
  const safeName = escapeHtml(params.name || 'User');
  const safeUrl = escapeHtml(params.verifyUrl);
  const safeCode = escapeHtml(params.code);

  const subject = 'Verify your email address — TALASH Ai';
  const text = [
    `Assalamu Alaikum ${params.name || 'User'},`,
    '',
    'Thank you for registering with TALASH Ai.',
    `Your verification code is: ${params.code}`,
    '',
    `Or click this link to verify your email address (expires in 24 hours):`,
    params.verifyUrl,
    '',
    'If you did not create this account, you can safely ignore this message.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:32px 16px;color:#0f172a;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Verify your email for TALASH Ai</h2>
        <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.6;">
          Assalamu Alaikum ${safeName}, please verify your email address to activate your TALASH Ai account.
        </p>
        <div style="background:#f1f5f9;border-radius:12px;padding:14px;text-align:center;margin-bottom:18px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-bottom:4px;">Verification Code</div>
          <div style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:0.16em;color:#0f172a;">${safeCode}</div>
        </div>
        <a href="${safeUrl}" style="display:inline-block;background:#0a2540;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">Verify Email Address</a>
        <p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
          This link and code expire in 24 hours. If you did not register for TALASH Ai, you may safely ignore this email.
        </p>
      </div>
    </div>
  `;

  return sendEmail({ to: params.to, subject, text, html });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
  code: string;
}): Promise<{ sent: boolean; provider?: 'smtp' | 'resend'; reason?: string }> {
  const safeName = escapeHtml(params.name || 'User');
  const safeUrl = escapeHtml(params.resetUrl);
  const safeCode = escapeHtml(params.code);

  const subject = 'Reset your TALASH Ai password';
  const text = [
    `Assalamu Alaikum ${params.name || 'User'},`,
    '',
    'We received a request to reset your TALASH Ai password.',
    `Your password recovery code is: ${params.code}`,
    '',
    'Or open this link to choose a new password (expires in 30 minutes):',
    params.resetUrl,
    '',
    'If you did not request a password reset, no action is needed and your current password remains secure.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:32px 16px;color:#0f172a;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Password Recovery — TALASH Ai</h2>
        <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.6;">
          Assalamu Alaikum ${safeName}, use the code or button below to reset your TALASH Ai password.
        </p>
        <div style="background:#f1f5f9;border-radius:12px;padding:14px;text-align:center;margin-bottom:18px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-bottom:4px;">Recovery Code</div>
          <div style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:0.16em;color:#0f172a;">${safeCode}</div>
        </div>
        <a href="${safeUrl}" style="display:inline-block;background:#0a2540;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">Reset Password</a>
        <p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
          This link and code expire in 30 minutes. All existing sessions will be signed out once your password is changed.
        </p>
      </div>
    </div>
  `;

  return sendEmail({ to: params.to, subject, text, html });
}
