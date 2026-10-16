/**
 * Stuck-stage WhatsApp nudges, sent straight through Voxvalley.
 *
 * A stall rule with channel `whatsapp` used to only fire an Upshot event. When
 * the Voxvalley integration is on AND the rule's trigger stage has a template
 * mapped in `settings.stallTemplates`, the message is sent from here instead:
 * WhatsApp only allows business-initiated messages as pre-approved templates, so
 * each stage maps to one template plus the values that fill its {{1}}, {{2}}…
 *
 * Guarded like the drop-off CALL path, because a repeated message to a real
 * customer is a complaint, not a dismissed notification:
 *   - never to a do-not-contact customer
 *   - only inside the calling window (no 3am WhatsApp)
 *   - one WhatsApp per customer per cooldown, across ALL rules
 *   - a lifetime cap per customer
 *   - the OutboundRequest row claims the idempotency key BEFORE sending, so a
 *     crash or a retry tick can never double-send; a failure is recorded and NOT
 *     retried (no retry storm against a customer's phone)
 */
import type { StallRule } from '@prisma/client';
import { prisma } from './prisma.js';
import { JOURNEY_EVENTS, recordJourneyEvent } from './journey.js';
import { getProviderConfig, DEFAULT_SETTINGS } from './integrations.js';
import { withinCallingHours } from './leadCaller.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';

/** One stage's template: its name, language, and the ordered values for {{1}}… */
export interface StallTemplate {
  template: string;
  language?: string;
  /** Each entry may contain {tokens}: name, ref, offerCount, siteUrl. */
  placeholders?: string[];
}

export type StallTemplateMap = Record<string, StallTemplate>;

const COOLDOWN_HOURS = Number(process.env.STALL_WA_COOLDOWN_HOURS ?? 24) || 24;
const MAX_PER_CUSTOMER = Number(process.env.STALL_WA_MAX_PER_CUSTOMER ?? 3) || 3;
/**
 * A customer who stalled weeks ago is not "stuck", they left. Only people whose
 * stall began inside this window (after the rule's own delay) are messaged, so
 * switching a rule on never blasts the whole historical backlog.
 */
export const STALL_WA_MAX_AGE_HOURS = Number(process.env.STALL_WA_MAX_AGE_HOURS ?? 24) || 24;

/* ───────────────────────── pure helpers (unit-tested) ───────────────────────── */

/**
 * Fill `{token}`s from `vars`. Returns null if any token has no value — a
 * message reading "Ref: undefined" is worse than no message.
 */
export function interpolate(pattern: string, vars: Record<string, string | number | null | undefined>): string | null {
  let missing = false;
  const out = pattern.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === null || v === undefined || String(v).trim() === '') {
      missing = true;
      return '';
    }
    return String(v);
  });
  return missing ? null : out;
}

/** Ordered template values, or null when any one cannot be filled. */
export function buildPlaceholders(
  spec: string[] | undefined,
  vars: Record<string, string | number | null | undefined>,
): string[] | null {
  const values: string[] = [];
  for (const entry of spec ?? []) {
    const v = interpolate(String(entry), vars);
    if (v === null) return null;
    values.push(v);
  }
  return values;
}

/** The mapped template for a rule, if the operator has configured one. */
export function templateFor(map: unknown, triggerEvent: string): StallTemplate | null {
  if (!map || typeof map !== 'object') return null;
  const t = (map as StallTemplateMap)[triggerEvent];
  return t && typeof t.template === 'string' && t.template.trim() ? t : null;
}

/* ─────────────────────────────── sending ─────────────────────────────── */

export interface DirectWhatsApp {
  map: StallTemplateMap;
  siteUrl: string;
}

/**
 * The direct-send config, or null when Voxvalley is off / incomplete — in which
 * case the rule falls back to its Upshot event exactly as before.
 */
export async function directWhatsAppConfig(): Promise<DirectWhatsApp | null> {
  // Not just "enabled": a missing token/sender must fall back to Upshot, not
  // claim every customer's cooldown slot with a send that cannot succeed.
  if (!(await whatsappConfigured())) return null;
  const cfg = await getProviderConfig('voxvalley');
  // Shipped defaults underneath whatever the dashboard saved: the settings form
  // stores a snapshot of every field, so without this a stage added in a later
  // release would never appear on an environment that had already saved once.
  // A saved entry wins, and a blank `template` switches a stage back to Upshot.
  const map: StallTemplateMap = {
    ...((DEFAULT_SETTINGS.voxvalley.stallTemplates ?? {}) as StallTemplateMap),
    ...((cfg.settings.stallTemplates ?? {}) as StallTemplateMap),
  };
  if (Object.keys(map).length === 0) return null;
  return { map, siteUrl: String(cfg.settings.siteUrl || '').replace(/\/+$/, '') };
}

/** Values a template can reference. Anything unknown stays undefined -> skipped. */
async function varsFor(customer: { name: string | null; userId: string | null }, siteUrl: string) {
  const vars: Record<string, string | number | null | undefined> = {
    name: customer.name?.trim().split(/\s+/)[0] || 'there',
    siteUrl,
  };
  if (customer.userId) {
    const app = await prisma.loanApplication.findFirst({
      where: { userId: customer.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ref: true },
    });
    if (app) {
      vars.ref = app.ref;
      vars.offerCount = await prisma.offer.count({ where: { applicationId: app.id } });
    }
  }
  return vars;
}

/**
 * Send the stage's WhatsApp template to a stalled customer.
 * Returns true only if Voxvalley accepted the message.
 */
export async function sendStallWhatsApp(
  rule: StallRule,
  customer: { id: string; phone: string | null; name: string | null; userId: string | null; currentStage: string },
  tpl: StallTemplate,
  siteUrl: string,
  minutesStuck: number,
  idempotencyKey: string,
  now: Date,
): Promise<boolean> {
  if (!customer.phone) return false;
  // Someone who asked us to stop gets nothing on any channel.
  if (customer.currentStage === 'lost') return false;
  // Not claiming the key here leaves them eligible once the window opens.
  if (!withinCallingHours(now)) return false;

  const vars = await varsFor(customer, siteUrl);
  const placeholders = buildPlaceholders(tpl.placeholders, vars);
  if (!placeholders) {
    console.warn(`[stall-wa] ${rule.name}: template "${tpl.template}" needs a value this customer lacks — skipped`);
    return false;
  }

  const since = new Date(now.getTime() - COOLDOWN_HOURS * 3_600_000);
  const recent = await prisma.outboundRequest.count({
    where: { customerId: customer.id, kind: 'whatsapp_template', status: 'sent', createdAt: { gte: since } },
  });
  if (recent > 0) return false;
  const ever = await prisma.outboundRequest.count({
    where: { customerId: customer.id, kind: 'whatsapp_template', status: 'sent' },
  });
  if (ever >= MAX_PER_CUSTOMER) return false;

  // Claim the key BEFORE sending.
  let claimId: string;
  try {
    const claim = await prisma.outboundRequest.create({
      data: {
        customerId: customer.id,
        channel: 'whatsapp',
        kind: 'whatsapp_template',
        idempotencyKey,
        status: 'pending',
        payload: {
          rule: rule.name,
          stuckAt: rule.triggerEvent,
          expected: rule.expectedEvent,
          minutesStuck,
          template: tpl.template,
        },
      },
    });
    claimId = claim.id;
  } catch {
    return false; // another worker claimed it first
  }

  const result = await sendWhatsAppTemplate({
    phone: customer.phone,
    templateName: tpl.template,
    language: tpl.language,
    placeholders,
    referenceId: claimId,
  });

  await prisma.outboundRequest
    .update({
      where: { id: claimId },
      data: result.ok
        ? { status: 'sent', sentAt: now, attempts: 1, providerRef: result.messageId ?? null, response: (result.body ?? null) as object }
        : { status: 'failed', attempts: 1, lastError: (result.error ?? 'WhatsApp send failed').slice(0, 500), response: (result.body ?? null) as object },
    })
    .catch(() => undefined);

  if (!result.ok) {
    console.warn(`[stall-wa] ${customer.phone}: ${result.error}`);
    return false;
  }

  await recordJourneyEvent(customer.id, {
    channel: 'system',
    name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: {
      rule: rule.name, via: 'whatsapp', template: tpl.template,
      stuckAt: rule.triggerEvent, expected: rule.expectedEvent, minutesStuck,
    },
    mirrorTelemetry: false,
  }).catch(() => undefined);

  console.log(`[stall-wa] sent "${tpl.template}" to ${customer.phone} — ${rule.name} (stuck ${minutesStuck}m)`);
  return true;
}
