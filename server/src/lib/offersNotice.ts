/**
 * WhatsApp notice when the eligibility check produces no offers.
 *
 * Two utility templates cover the two real situations (see lib/whatsappTemplates.ts):
 *  - `not_eligible`: the lender replied and none of its partners can offer a loan
 *    for this profile. Template `no_offers_update`.
 *  - `technical`: the check could not complete because of a fault, so the customer
 *    is told their details are saved and to try again. Template `eligibility_retry_update`.
 * A `duplicate` (same number already with a lender) is not a decline and gets nothing.
 *
 * Same rules as the conversation recap: off until an admin names a template, never to
 * someone who asked us to stop, test mode honours the allowed numbers, one send per
 * application and kind (claimed before sending), and it never breaks the request that
 * triggered it. The lender's own wording is never forwarded to the customer.
 */
import { prisma } from './prisma.js';
import { getProviderConfig } from './integrations.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { withinTestAllowlist } from './callGate.js';
import { normalizeSummaryConfig, forWhatsApp, type ConversationSummaryConfig } from './conversationSummary.js';
import { scoped } from './log.js';

const log = scoped('offers-notice');

export type OffersNoticeKind = 'no_offers' | 'eligibility_retry';
/** The reason codes the prequalify endpoint already produces. */
export type PrequalifyReason = 'not_eligible' | 'duplicate' | 'technical' | string | null | undefined;

/** Settings keys in the Voxvalley settings for each notice. */
export const OFFERS_NOTICE_SETTING: Record<OffersNoticeKind, 'noOffers' | 'eligibilityRetry'> = {
  no_offers: 'noOffers',
  eligibility_retry: 'eligibilityRetry',
};

export const OFFERS_NOTICE_TOKENS = ['{name}', '{ref}', '{guidance}', '{link}'] as const;

export const DEFAULT_NO_OFFERS_CONFIG: ConversationSummaryConfig = { enabled: false, template: '', language: 'en', placeholders: ['{name}', '{ref}', '{guidance}'] };
export const DEFAULT_RETRY_CONFIG: ConversationSummaryConfig = { enabled: false, template: '', language: 'en', placeholders: ['{name}', '{ref}', '{link}'] };

/** Which notice, if any, a prequalify result calls for. */
export function noticeKindFor(reason: PrequalifyReason): OffersNoticeKind | null {
  if (reason === 'not_eligible') return 'no_offers';
  if (reason === 'technical') return 'eligibility_retry';
  return null; // duplicate, unknown or no reason: nothing to say
}

/** What the customer is told to do next. Plain and honest; never lender wording. */
export const NO_OFFERS_GUIDANCE = 'You can review or update your details in the SwiftLoan app and check again.';

export interface OffersNoticeInput {
  applicationId: string;
  userId: string;
  reason: PrequalifyReason;
}

export type OffersNoticeResult = 'sent' | 'failed' | `skipped:${string}`;

export function buildNoticeVars(i: { name?: string | null; ref: string; siteUrl: string }): Record<string, string> {
  const first = String(i.name ?? '').trim().split(/\s+/)[0];
  return {
    name: first || 'there',
    ref: i.ref,
    guidance: NO_OFFERS_GUIDANCE,
    link: `${i.siteUrl.replace(/\/+$/, '')}/applink`,
  };
}

/** Never throws: a messaging problem must not fail the eligibility response. */
export async function sendOffersNotice(i: OffersNoticeInput): Promise<OffersNoticeResult> {
  try {
    const kind = noticeKindFor(i.reason);
    if (!kind) return 'skipped:no_notice_for_reason';

    const vox = await getProviderConfig('voxvalley');
    const settings = vox.settings as Record<string, unknown>;
    const cfg = normalizeSummaryConfig(settings[OFFERS_NOTICE_SETTING[kind]]);
    if (!cfg.enabled || !cfg.template) return 'skipped:off';

    const user = await prisma.user.findUnique({ where: { id: i.userId }, select: { phone: true, fullName: true, firstName: true } });
    if (!user?.phone) return 'skipped:no_phone';
    if (!withinTestAllowlist(user.phone)) return 'skipped:test_mode';
    if (!(await whatsappConfigured())) return 'skipped:whatsapp_not_configured';

    const customer = await prisma.customer.findFirst({ where: { userId: i.userId }, select: { id: true, currentStage: true, name: true } });
    if (customer?.currentStage === 'lost') return 'skipped:do_not_contact';

    const app = await prisma.loanApplication.findUnique({ where: { id: i.applicationId }, select: { ref: true } });
    if (!app) return 'skipped:no_application';

    const vars = buildNoticeVars({
      name: user.firstName ?? user.fullName ?? customer?.name ?? null,
      ref: app.ref,
      siteUrl: String(settings.siteUrl || 'https://www.swiftloan.ai'),
    });
    const placeholders = buildPlaceholders(cfg.placeholders.map((p) => p), { ...vars, guidance: forWhatsApp(vars.guidance, 200) });
    if (!placeholders) return 'skipped:missing_value';

    // Claim BEFORE sending: one notice per application and kind, even if the check is retried.
    let claimId: string;
    try {
      const claim = await prisma.outboundRequest.create({
        data: {
          customerId: customer?.id ?? null,
          channel: 'whatsapp',
          kind: `offers_notice_${kind}`,
          idempotencyKey: `offers-notice:${kind}:${i.applicationId}`,
          status: 'pending',
          payload: { template: cfg.template, applicationId: i.applicationId, reason: String(i.reason ?? '') },
        },
      });
      claimId = claim.id;
    } catch {
      return 'skipped:already_sent';
    }

    const result = await sendWhatsAppTemplate({
      phone: user.phone,
      templateName: cfg.template,
      language: cfg.language,
      placeholders,
      referenceId: claimId,
      track: { kind: `offers_notice_${kind}`, customerId: customer?.id ?? null },
    });
    await prisma.outboundRequest
      .update({
        where: { id: claimId },
        data: result.ok
          ? { status: 'sent', sentAt: new Date(), providerRef: result.messageId ?? null }
          : { status: 'failed', lastError: (result.error ?? 'send failed').slice(0, 500) },
      })
      .catch(() => undefined);

    if (!result.ok) {
      log.warn('offers notice not delivered', { applicationId: i.applicationId, kind, error: result.error ?? null });
      return 'failed';
    }
    log.info('offers notice sent', { applicationId: i.applicationId, kind });
    return 'sent';
  } catch (e) {
    log.error('offers notice failed', { applicationId: i.applicationId, error: (e as Error).message });
    return 'failed';
  }
}
