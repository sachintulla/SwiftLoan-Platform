// Support-ticket domain: categories, the public reference, and the
// new-ticket notification email.

import { sendMail, type MailResult } from './mail.js';

export const TICKET_CATEGORIES = ['repayments', 'documents', 'privacy', 'disbursement', 'fees', 'application', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  repayments: 'Repayments (EMI & prepayment)',
  documents: 'Documents (KYC & proofs)',
  privacy: 'Privacy & data',
  disbursement: 'Disbursement (when funds arrive)',
  fees: 'Fees & charges',
  application: 'My application',
  other: 'Something else',
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c as TicketCategory] ?? c;
}

/** Public ticket reference, e.g. SL-T-00042. */
export function ticketRef(ticketNo: number): string {
  return `SL-T-${String(ticketNo).padStart(5, '0')}`;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface TicketMailInput {
  ticketNo: number;
  id: string;
  type: string;
  category: string;
  subject: string;
  body: string | null;
  status: string;
  createdAt: Date;
  user: { id: string; fullName: string | null; phone: string; email: string | null };
  application?: { ref: string; amount: number; status: string } | null;
}

/** Recipients of new-ticket mail. */
export function supportRecipients(): string[] {
  return (process.env.SUPPORT_NOTIFY_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function adminLink(id: string): string {
  const base = (process.env.ADMIN_DASHBOARD_URL ?? 'http://localhost:4001').replace(/\/+$/, '');
  return `${base}/support?ticket=${encodeURIComponent(id)}`;
}

function inr(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function istStamp(d: Date): string {
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST';
}

/** Build subject + text + html for a new-ticket notification. Pure — no I/O. */
export function buildTicketEmail(t: TicketMailInput): { subject: string; text: string; html: string } {
  const ref = ticketRef(t.ticketNo);
  const kind = t.type === 'grievance' ? 'Grievance' : 'Support request';
  const subject = `[SwiftLoan] New ${kind.toLowerCase()} ${ref} — ${categoryLabel(t.category).split(' (')[0]}: ${t.subject}`.slice(0, 200);
  const name = t.user.fullName || 'Not provided';
  const email = t.user.email || 'Not provided';
  const link = adminLink(t.id);
  const message = t.body?.trim() || '(No message provided)';

  const rows: [string, string][] = [
    ['Ticket', ref],
    ['Type', kind],
    ['Category', categoryLabel(t.category)],
    ['Status', t.status.replace('_', ' ')],
    ['Raised', istStamp(t.createdAt)],
  ];
  const customer: [string, string][] = [
    ['Name', name],
    ['Mobile', `+91 ${t.user.phone}`],
    ['Email', email],
    ['User ID', t.user.id],
  ];
  const app: [string, string][] = t.application
    ? [
        ['Application', t.application.ref],
        ['Amount', inr(t.application.amount)],
        ['Application status', t.application.status.replace(/_/g, ' ')],
      ]
    : [];

  const text = [
    `New ${kind.toLowerCase()} raised on SwiftLoan`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'CUSTOMER',
    ...customer.map(([k, v]) => `${k}: ${v}`),
    ...(app.length ? ['', 'LINKED APPLICATION', ...app.map(([k, v]) => `${k}: ${v}`)] : []),
    '',
    `SUBJECT: ${t.subject}`,
    '',
    'MESSAGE',
    message,
    '',
    `Open in admin dashboard: ${link}`,
  ].join('\n');

  const table = (title: string, data: [string, string][]) =>
    data.length === 0
      ? ''
      : `<tr><td style="padding:18px 28px 6px;font:700 11px/1 Arial,sans-serif;letter-spacing:.12em;color:#079FA0;text-transform:uppercase">${esc(title)}</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
${data.map(([k, v]) => `<tr><td style="padding:7px 0;width:150px;font:13px/1.4 Arial,sans-serif;color:#6b7c7c;border-bottom:1px solid #eef3f3">${esc(k)}</td><td style="padding:7px 0;font:600 13px/1.4 Arial,sans-serif;color:#0F2A2B;border-bottom:1px solid #eef3f3">${esc(v)}</td></tr>`).join('\n')}
</table></td></tr>`;

  const html = `<!doctype html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f8f8">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f8f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dfeaea">
<tr><td style="background:#0A3F41;padding:22px 28px">
  <div style="font:700 12px/1 Arial,sans-serif;letter-spacing:.14em;color:#6FEBBE;text-transform:uppercase">SwiftLoan Support</div>
  <div style="font:800 22px/1.25 Arial,sans-serif;color:#ffffff;margin-top:8px">New ${esc(kind.toLowerCase())} · ${esc(ref)}</div>
</td></tr>
<tr><td style="padding:22px 28px 4px">
  <div style="font:700 17px/1.35 Arial,sans-serif;color:#0F2A2B">${esc(t.subject)}</div>
</td></tr>
<tr><td style="padding:10px 28px 4px"><div style="background:#f3f8f8;border-left:3px solid #079FA0;border-radius:8px;padding:14px 16px;font:14px/1.6 Arial,sans-serif;color:#243b3b;white-space:pre-wrap">${esc(message)}</div></td></tr>
${table('Ticket', rows)}
${table('Customer', customer)}
${table('Linked application', app)}
<tr><td style="padding:26px 28px 30px"><a href="${esc(link)}" style="display:inline-block;background:#079FA0;color:#ffffff;text-decoration:none;font:700 14px/1 Arial,sans-serif;padding:13px 22px;border-radius:999px">Open in admin dashboard →</a></td></tr>
<tr><td style="background:#f3f8f8;padding:14px 28px;font:11px/1.5 Arial,sans-serif;color:#7c8d8d">Sent automatically by SwiftLoan. Replying to this email writes to the customer${t.user.email ? '' : ' (no email on file — contact by phone instead)'}.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

/** Email the support team about a new ticket. Never throws. */
export async function sendTicketNotification(t: TicketMailInput): Promise<MailResult> {
  const to = supportRecipients();
  if (to.length === 0) return { sent: false, reason: 'SUPPORT_NOTIFY_TO not set' };
  const { subject, text, html } = buildTicketEmail(t);
  return sendMail({ to, subject, text, html, ...(t.user.email ? { replyTo: t.user.email } : {}) });
}
