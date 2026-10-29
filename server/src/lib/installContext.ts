/**
 * Install context: remember WHO an app link was sent to, and by whom.
 *
 * Every app link we send looks like `/dl?ref=<TOKEN>`; when someone opens it the
 * click is stored with that token, and the install that follows carries it as
 * `AppDownload.referrer`. Nothing used to record that an admin had pushed such a
 * link, so the installs page could not say who it was for.
 *
 * Without changing the schema, the answer is one OutboundRequest row per link:
 *   kind 'install_link', idempotencyKey 'install_link:<TOKEN>', status 'sent', and
 *   a JSON payload holding the customer's name, mobile, amount, product, stage,
 *   channel and the admin who sent it. The installs page looks the row up by that
 *   exact key (a unique index), so it is a cheap read and no fake Lead is created.
 *
 * A link is only minted at SEND time, and only when a WhatsApp message actually
 * contains the `{appLink}` placeholder. A preview never writes anything.
 *
 * The payload shape is a contract read by the installs page. Do not change it
 * without changing that reader.
 */
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { downloads } from '../config/downloads.js';
import { buildInstallLink } from './reminderSchedule.js';
import { scoped } from './log.js';

const log = scoped('install-context');

/** Same unambiguous alphabet the website lead tokens use (no 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const INSTALL_LINK_KIND = 'install_link';

/** The literal text a preview shows in place of a real link. */
export const APP_LINK_PREVIEW_TEXT = '(link created when sent)';

/** A short, URL-safe, human-typable token. */
export function newInstallToken(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const installLinkKey = (token: string) => `${INSTALL_LINK_KIND}:${token}`;

/** What the install_link row stores. Read by the installs page. */
export interface InstallLinkPayload {
  v: 1;
  token: string;
  customerId: string;
  name: string | null;
  phone: string | null;
  /** Rupees. Null when no amount is known. */
  amountRupees: number | null;
  product: string | null;
  stage: string;
  channel: 'whatsapp';
  sentBy: { type: 'admin'; id: string; email: string };
  sentAt: string;
}

export interface MintInput {
  customer: { id: string; name: string | null; phone: string | null };
  stage: string;
  channel: 'whatsapp';
  admin: { id: string; email: string };
  amountRupees: number | null;
  product: string | null;
  now?: Date;
}

/** Pure: the row's JSON payload. */
export function buildInstallLinkPayload(token: string, input: MintInput): InstallLinkPayload {
  return {
    v: 1,
    token,
    customerId: input.customer.id,
    name: input.customer.name?.trim() || null,
    phone: input.customer.phone,
    amountRupees: input.amountRupees,
    product: input.product,
    stage: input.stage,
    channel: input.channel,
    sentBy: { type: 'admin', id: input.admin.id, email: input.admin.email },
    sentAt: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * Create the install_link row and return the attributed link.
 * A key collision (one in a billion) just draws a fresh, longer token.
 */
export async function mintInstallLink(input: MintInput): Promise<{ url: string; token: string; outboundRequestId: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newInstallToken(attempt === 0 ? 8 : 10);
    const payload = buildInstallLinkPayload(token, input);
    try {
      const row = await prisma.outboundRequest.create({
        data: {
          customerId: input.customer.id,
          channel: 'whatsapp',
          kind: INSTALL_LINK_KIND,
          idempotencyKey: installLinkKey(token),
          status: 'sent',
          sentAt: input.now ?? new Date(),
          payload: payload as unknown as object,
        },
      });
      return { url: buildInstallLink(downloads.publicBase, token), token, outboundRequestId: row.id };
    } catch (e) {
      lastError = e;
    }
  }
  log.error('could not mint an install link', { customerId: input.customer.id, error: String((lastError as Error)?.message ?? lastError) });
  throw new Error('Could not create the app link');
}

/** The link was minted but the message never went out, so it must not look like a sent link. */
export async function cancelInstallLink(outboundRequestId: string): Promise<void> {
  await prisma.outboundRequest
    .update({ where: { id: outboundRequestId }, data: { status: 'cancelled' } })
    .catch(() => undefined);
}

/**
 * Pure: the loan details to carry with a link, from the customer's most recent
 * application or, failing that, their most recent website enquiry (both whole rupees).
 */
export function pickInstallDetails(
  app: { amount: number; loanType: string } | null,
  lead: { amount: number | null; productInterest: string | null } | null,
): { amountRupees: number | null; product: string | null } {
  if (app && app.amount > 0) return { amountRupees: app.amount, product: app.loanType };
  if (lead && lead.amount != null && lead.amount > 0) {
    return { amountRupees: Math.round(lead.amount), product: lead.productInterest?.trim() || null };
  }
  return { amountRupees: null, product: lead?.productInterest?.trim() || null };
}

/** Load the amount and product to attach to a link for this customer. */
export async function loadInstallDetails(customer: { phone: string | null; userId: string | null }) {
  const [app, lead] = await Promise.all([
    customer.userId
      ? prisma.loanApplication.findFirst({
          where: { userId: customer.userId },
          orderBy: { createdAt: 'desc' },
          select: { amount: true, loanType: true },
        })
      : Promise.resolve(null),
    customer.phone
      ? prisma.lead.findFirst({
          where: { phone: customer.phone },
          orderBy: { createdAt: 'desc' },
          select: { amount: true, productInterest: true },
        })
      : Promise.resolve(null),
  ]);
  return pickInstallDetails(app, lead);
}
