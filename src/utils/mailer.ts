import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailerResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

/**
 * Creates and returns the Nodemailer SMTP transport instance
 */
export function getMailTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE !== 'false';
  const user = process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Dispatches an HTML email via Nodemailer SMTP.
 * Gracefully falls back to console logging if SMTP environment variables are missing.
 */
export async function sendEmail(options: EmailOptions): Promise<MailerResult> {
  try {
    const transport = getMailTransport();
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_EMAIL || '"AI Bookkeeper" <reports@aibookkeeper.com>';

    if (!transport) {
      console.log(`\n------------------------------------------------------------`);
      console.log(`[SMTP Mailer Simulated Dispatch] (SMTP_EMAIL / SMTP_PASSWORD not set)`);
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log(`Body Length: ${options.html.length} chars`);
      console.log(`------------------------------------------------------------\n`);
      return {
        success: true,
        messageId: `simulated-${Date.now()}`,
        simulated: true
      };
    }

    const info = await transport.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text || 'Your automated financial report is ready. Please view in an HTML-compatible email reader.',
      html: options.html,
    });

    console.log(`[SMTP Mailer Success] Email dispatched to ${options.to} (Message ID: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
      simulated: false
    };
  } catch (error: any) {
    console.error(`[SMTP Mailer Error] Failed to send email to ${options.to}:`, error);
    return {
      success: false,
      error: error.message || 'Failed to send email via SMTP'
    };
  }
}
