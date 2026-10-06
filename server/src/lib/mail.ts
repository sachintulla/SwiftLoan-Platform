// Outbound email (SMTP via nodemailer).
//
// Configured entirely from env, same pattern as sms.ts: when SMTP isn't set up
// (local dev) sending is a logged no-op and callers keep working — a missing
// mail server must never fail the request that triggered the mail.
//
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" for port 465),
//   SMTP_USER, SMTP_PASS   — credentials (omit both for an open relay)
//   MAIL_FROM              — e.g. "SwiftLoan Support <support@swiftloan.ai>"
//   SUPPORT_NOTIFY_TO      — comma-separated inbox(es) that receive new-ticket mail

import nodemailer, { type Transporter } from 'nodemailer';
import { scoped } from './log.js';

const log = scoped('mail');

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface MailResult {
  sent: boolean;
  /** Why nothing was sent (not configured / transport error). */
  reason?: string;
}

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

let cached: { key: string; transport: Transporter } | null = null;

function transport(): Transporter {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const key = [host, port, secure, user].join('|');
  if (cached?.key === key) return cached.transport;
  const t = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
    // Fail fast — this runs behind a user-facing request path.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  cached = { key, transport: t };
  return t;
}

/** Strip CR/LF so user-supplied text can never inject extra mail headers. */
export function headerSafe(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  if (!mailConfigured()) {
    log.warn('SMTP not configured — email skipped', { subject: msg.subject });
    return { sent: false, reason: 'SMTP not configured' };
  }
  try {
    const info = await transport().sendMail({
      from: process.env.MAIL_FROM,
      to: msg.to,
      subject: headerSafe(msg.subject),
      text: msg.text,
      html: msg.html,
      ...(msg.replyTo ? { replyTo: headerSafe(msg.replyTo) } : {}),
    });
    log.info('sent', { messageId: info.messageId, to: Array.isArray(msg.to) ? msg.to.length : 1 });
    return { sent: true };
  } catch (e) {
    const reason = (e as Error).message || 'send failed';
    log.error('send failed', { error: reason });
    return { sent: false, reason };
  }
}
