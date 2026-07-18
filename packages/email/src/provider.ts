import * as nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/**
 * SMTP adapter — points at Mailpit locally, or any real SMTP relay in
 * production. A future provider (SES, Resend, ...) only needs to implement
 * EmailProvider.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/** Used in unit tests and as a safe fallback. */
export class NoopEmailProvider implements EmailProvider {
  readonly name = 'noop';
  public readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export function createEmailProvider(
  provider: 'smtp' | 'noop',
  smtpConfig: SmtpConfig,
): EmailProvider {
  if (provider === 'noop') return new NoopEmailProvider();
  return new SmtpEmailProvider(smtpConfig);
}
