import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DROPOFF_MESSAGES, deriveDropoff, dropoffStopReason, fillTokens, includeAppLink, isMessageable, mergeDropoffMessages, messageKindFor, pickSms,
  pickWhatsapp, resolveWhatsappMessage, noOffersCallBrief, noOffersCallDue, noOffersReasonCode,
  type DropoffSnapshot, type DropoffMessages,
} from './dropoffSteps.js';

const T0 = new Date('2026-10-27T10:00:00Z');
const T1 = new Date('2026-10-27T10:20:00Z');

const app = (over: Partial<NonNullable<DropoffSnapshot['application']>> = {}): NonNullable<DropoffSnapshot['application']> => ({
  status: 'draft', createdAt: T0, updatedAt: T1, offersFetchedAt: null, prequalifyReason: null, offerCount: 0, appliedToLender: false, ...over,
});

describe('deriveDropoff: where did this person stop', () => {
  it('OTP only (no PAN, no application) is nothing: the website reminder owns it', () => {
    expect(deriveDropoff({ panOnFile: false, panSince: null, application: null }).status).toBeNull();
  });

  it('PAN done and no application yet = pan_verified, counted from when the PAN was saved', () => {
    expect(deriveDropoff({ panOnFile: true, panSince: T0, application: null })).toEqual({ status: 'pan_verified', since: T0, reason: null });
  });

  it('an application that has not reached the offers outcome = application_filled', () => {
    for (const status of ['draft', 'pan_pending', 'prequalifying']) {
      expect(deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status }) }).status).toBe('application_filled');
    }
  });

  it('offers came and none applied = offers_not_applied, counted from when offers were fetched', () => {
    const r = deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status: 'offers_ready', offerCount: 3, offersFetchedAt: T0 }) });
    expect(r).toEqual({ status: 'offers_not_applied', since: T0, reason: null });
  });

  it('offers_ready with zero offers is never reported as "you have offers"', () => {
    expect(deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status: 'offers_ready', offerCount: 0 }) }).status).toBeNull();
  });

  it('a lender decision with no offers = rejected, carrying the reason for the admin', () => {
    const r = deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status: 'rejected', prequalifyReason: 'Number already registered', offersFetchedAt: T0 }) });
    expect(r).toEqual({ status: 'rejected', since: T0, reason: 'Number already registered' });
  });

  it('a technical failure is failed, never rejected', () => {
    const r = deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status: 'failed' }) });
    expect(r.status).toBe('failed');
    expect(isMessageable(r.status)).toBe(false);
  });

  it('"number already registered" (stored as failed + reason duplicate) counts as no offers, not a technical failure', () => {
    const r = deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status: 'failed', prequalifyReason: 'duplicate', offersFetchedAt: T0 }) });
    expect(r).toEqual({ status: 'rejected', since: T0, reason: 'duplicate' });
    expect(isMessageable(r.status)).toBe(true);
    // while a technical fault, or a failure with no reason, is still never messaged
    expect(deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status: 'failed', prequalifyReason: 'technical' }) }).status).toBe('failed');
  });

  it('applying to a lender = applied, whatever the parent status says', () => {
    expect(deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status: 'offers_ready', offerCount: 2, appliedToLender: true }) }).status).toBe('applied');
  });

  it('anything past the offers stage is finished (the lender sequence owns it)', () => {
    for (const status of ['handoff', 'under_review', 'approved', 'disbursed', 'closed']) {
      expect(deriveDropoff({ panOnFile: true, panSince: T0, application: app({ status }) }).status).toBe('finished');
    }
  });

  it('is the same for the website and the app: only stored data decides, not the channel', () => {
    const snapshot: DropoffSnapshot = { panOnFile: true, panSince: T0, application: app({ status: 'draft' }) };
    expect(deriveDropoff(snapshot)).toEqual(deriveDropoff(structuredClone(snapshot)));
  });
});

describe('what gets messaged', () => {
  it('only the four agreed statuses start a sequence', () => {
    expect(isMessageable('pan_verified')).toBe(true);
    expect(isMessageable('application_filled')).toBe(true);
    expect(isMessageable('rejected')).toBe(true);
    expect(isMessageable('offers_not_applied')).toBe(true);
    for (const s of ['applied', 'failed', 'finished', null] as const) expect(isMessageable(s)).toBe(false);
  });

  it('maps each status to its message', () => {
    expect(messageKindFor('pan_verified')).toBe('continue');
    expect(messageKindFor('application_filled')).toBe('continue');
    expect(messageKindFor('rejected')).toBe('no_offers');
    expect(messageKindFor('offers_not_applied')).toBe('apply_offers');
    expect(messageKindFor('applied')).toBeNull();
  });
});

describe('the app-link rule', () => {
  it('gives the link to someone who is not in the app, and none to someone who is', () => {
    expect(includeAppLink('continue', false)).toBe(true);
    expect(includeAppLink('continue', true)).toBe(false);
    expect(includeAppLink('apply_offers', false)).toBe(true);
    expect(includeAppLink('apply_offers', true)).toBe(false);
  });

  it('never puts the link in the "our team will call you" message', () => {
    expect(includeAppLink('no_offers', false)).toBe(false);
    expect(includeAppLink('no_offers', true)).toBe(false);
  });
});

describe('stop rules', () => {
  const base = { armedStatus: 'application_filled' as const, doNotContact: false };

  it('carries on while nothing changed', () => {
    expect(dropoffStopReason({ ...base, statusNow: 'application_filled' })).toBeNull();
  });
  it('ends when they move to a different status (a fresh run is armed for it)', () => {
    expect(dropoffStopReason({ ...base, statusNow: 'offers_not_applied' })).toBe('progressed');
    expect(dropoffStopReason({ ...base, statusNow: null })).toBe('progressed');
  });
  it('hands over to the lender sequence when they apply, and ends when the journey is past offers', () => {
    expect(dropoffStopReason({ ...base, statusNow: 'applied' })).toBe('applied');
    expect(dropoffStopReason({ ...base, statusNow: 'finished' })).toBe('finished');
  });
  it('do-not-contact beats everything', () => {
    expect(dropoffStopReason({ ...base, statusNow: 'application_filled', doNotContact: true })).toBe('do_not_contact');
  });
});

describe('picking the configured template', () => {
  const messages: DropoffMessages = {
    continue: {
      whatsapp: { withLink: { template: 'drop_continue_link', placeholders: ['{name}', '{step}', '{link}'] }, noLink: { template: 'drop_continue' } },
      sms: {
        withLink: { templateId: 'D1', body: 'Hi {name} open {link}' },
        noLink: { templateId: 'D2', body: 'Hi {name} open the app' },
      },
    },
    apply_offers: { sms: { withLink: { templateId: 'D3', body: 'Apply now' } } },
  };

  it('returns the variant that matches the link decision', () => {
    expect(pickWhatsapp(messages, 'continue', true)?.template).toBe('drop_continue_link');
    expect(pickWhatsapp(messages, 'continue', false)?.template).toBe('drop_continue');
    expect(pickSms(messages, 'continue', false)?.templateId).toBe('D2');
  });

  it('returns null when a message or variant is not configured yet', () => {
    expect(pickWhatsapp(messages, 'no_offers', false)).toBeNull();
    expect(pickWhatsapp(undefined, 'continue', true)).toBeNull();
    expect(pickSms(messages, 'apply_offers', false)).toBeNull();
  });

  it('treats a with-link SMS that has no {link} slot as not configured (it would send no link)', () => {
    expect(pickSms(messages, 'apply_offers', true)).toBeNull();
  });
});

describe('the shipped default templates (WhatsApp)', () => {
  // How many {{n}} each approved Vox template has. WhatsApp rejects a send whose placeholder count differs.
  const VARIABLES: Record<string, number> = {
    install_app_resume_step: 3, // name, step, link
    dropoff_continue_app: 2, // name, step
    offers_ready: 4, // name, offer count, application ref, link
    dropoff_apply_offers_app: 1, // name
  };

  it('each placeholder list matches its approved template exactly', () => {
    for (const kind of ['continue', 'apply_offers'] as const) {
      for (const withLink of [true, false]) {
        const ref = pickWhatsapp(DEFAULT_DROPOFF_MESSAGES, kind, withLink)!;
        expect(ref, `${kind} withLink=${withLink}`).not.toBeNull();
        expect(ref.placeholders?.length, ref.template).toBe(VARIABLES[ref.template!]);
      }
    }
  });

  it('only the variants that carry the app link contain {link}', () => {
    for (const kind of ['continue', 'apply_offers'] as const) {
      expect(pickWhatsapp(DEFAULT_DROPOFF_MESSAGES, kind, true)!.placeholders).toContain('{link}');
      expect(pickWhatsapp(DEFAULT_DROPOFF_MESSAGES, kind, false)!.placeholders).not.toContain('{link}');
    }
  });

  it('leaves "no offers" OFF until the follow-up call exists (its text promises a call)', () => {
    expect(pickWhatsapp(DEFAULT_DROPOFF_MESSAGES, 'no_offers', false)).toBeNull();
  });

  it('fills every default with real values', () => {
    const vars = { name: 'Priya', step: 'Basic details', link: 'https://x.test/dl?ref=AB', ref: 'SL-1', offerCount: 3 };
    expect(resolveWhatsappMessage(DEFAULT_DROPOFF_MESSAGES, 'continue', true, vars)).toMatchObject({ ok: true, template: 'install_app_resume_step', placeholders: ['Priya', 'Basic details', 'https://x.test/dl?ref=AB'] });
    expect(resolveWhatsappMessage(DEFAULT_DROPOFF_MESSAGES, 'continue', false, vars)).toMatchObject({ ok: true, template: 'dropoff_continue_app', placeholders: ['Priya', 'Basic details'] });
    expect(resolveWhatsappMessage(DEFAULT_DROPOFF_MESSAGES, 'apply_offers', true, vars)).toMatchObject({ ok: true, template: 'offers_ready', placeholders: ['Priya', '3', 'SL-1', 'https://x.test/dl?ref=AB'] });
    expect(resolveWhatsappMessage(DEFAULT_DROPOFF_MESSAGES, 'apply_offers', false, vars)).toMatchObject({ ok: true, template: 'dropoff_apply_offers_app', placeholders: ['Priya'] });
  });
});

describe('resolving a message', () => {
  it('skips, rather than sends a blank, when a value is missing', () => {
    const r = resolveWhatsappMessage(DEFAULT_DROPOFF_MESSAGES, 'apply_offers', true, { name: 'Priya', link: 'l', ref: null, offerCount: 2 });
    expect(r).toEqual({ ok: false, reason: 'whatsapp placeholder missing' });
  });

  it('says so when the message has no template yet', () => {
    expect(resolveWhatsappMessage(DEFAULT_DROPOFF_MESSAGES, 'no_offers', false, { name: 'Priya' })).toEqual({ ok: false, reason: 'whatsapp template not configured' });
  });

  it('treats a zero offer count as a real value, not a missing one', () => {
    expect(fillTokens(['{offerCount}'], { offerCount: 0 })).toEqual(['0']);
    expect(fillTokens(['{x}'], {})).toBeNull();
    expect(fillTokens(undefined, {})).toEqual([]);
  });
});

describe('merging saved settings over the shipped defaults', () => {
  it('keeps defaults for variants nobody saved', () => {
    const merged = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, undefined);
    expect(pickWhatsapp(merged, 'continue', true)?.template).toBe('install_app_resume_step');
  });

  it('a saved variant wins, and the other variant keeps its default', () => {
    const merged = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, { continue: { whatsapp: { noLink: { template: 'my_template', placeholders: ['{name}'] } } } });
    expect(pickWhatsapp(merged, 'continue', false)?.template).toBe('my_template');
    expect(pickWhatsapp(merged, 'continue', true)?.template).toBe('install_app_resume_step');
  });

  it('a blank saved template switches that variant off', () => {
    const merged = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, { apply_offers: { whatsapp: { withLink: { template: '' } } } });
    expect(pickWhatsapp(merged, 'apply_offers', true)).toBeNull();
    expect(pickWhatsapp(merged, 'apply_offers', false)?.template).toBe('dropoff_apply_offers_app');
  });

  it('adds a message the defaults do not have (how "no offers" gets turned on)', () => {
    const merged = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, { no_offers: { whatsapp: { noLink: { template: 'dropoff_no_offers_callback', placeholders: ['{name}'] } } } });
    expect(pickWhatsapp(merged, 'no_offers', false)?.template).toBe('dropoff_no_offers_callback');
  });

  it('survives junk in the saved value', () => {
    for (const junk of [null, 'x', 5, [], { continue: null }]) expect(() => mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, junk)).not.toThrow();
  });
});

describe('the "no offers" call: what the agent is told', () => {
  it('turns the stored reason into a code, never the lender wording', () => {
    expect(noOffersReasonCode('duplicate')).toBe('already_registered');
    expect(noOffersReasonCode('not_eligible')).toBe('no_match');
    expect(noOffersReasonCode(null)).toBe('no_match');
  });

  it('is grammatical after "you", names the surface, and never mentions the lender or a duplicate', () => {
    const web = noOffersCallBrief('duplicate', false);
    expect(web.reason.startsWith('asked for loan offers')).toBe(true);
    expect(web.channel).toBe('the website');
    expect(noOffersCallBrief('not_eligible', true).channel).toBe('the app');
    for (const b of [web, noOffersCallBrief('not_eligible', true)]) {
      const all = JSON.stringify(b).toLowerCase();
      expect(all).not.toContain('duplicate');
      expect(all).toContain('do not promise');
    }
  });

  it('only for "already registered" does the agent get the gentle "have you applied before" hint', () => {
    expect(noOffersCallBrief('duplicate', false).help).toContain('applied before');
    expect(noOffersCallBrief('not_eligible', false).help).not.toContain('applied before');
  });
});

describe('the "no offers" call: is it due?', () => {
  const T = new Date('2026-10-27T06:30:00Z');
  const base = {
    dropStatus: 'rejected', runStatus: 'active', startAt: new Date(T.getTime() - 60 * 60_000), lastSentAt: null as Date | null, now: T,
    delayMs: 45 * 60_000, quietAfterMessageMs: 15 * 60_000, inCallingHours: true, alreadyCalled: false, doNotContact: false, callAllowed: true,
  };

  it('is due once the wait has passed, in hours, and everything is allowed', () => {
    expect(noOffersCallDue(base)).toEqual({ due: true });
  });

  it('says exactly why it is not due', () => {
    expect(noOffersCallDue({ ...base, dropStatus: 'offers_not_applied' })).toEqual({ due: false, reason: 'not_no_offers' });
    expect(noOffersCallDue({ ...base, runStatus: 'stopped' })).toEqual({ due: false, reason: 'not_active' }); // they moved on / applied
    expect(noOffersCallDue({ ...base, doNotContact: true })).toEqual({ due: false, reason: 'do_not_contact' });
    expect(noOffersCallDue({ ...base, alreadyCalled: true })).toEqual({ due: false, reason: 'already_called' });
    expect(noOffersCallDue({ ...base, startAt: new Date(T.getTime() - 30 * 60_000) })).toEqual({ due: false, reason: 'too_early' });
    expect(noOffersCallDue({ ...base, lastSentAt: new Date(T.getTime() - 5 * 60_000) })).toEqual({ due: false, reason: 'after_message' });
    expect(noOffersCallDue({ ...base, inCallingHours: false })).toEqual({ due: false, reason: 'outside_hours' });
    expect(noOffersCallDue({ ...base, callAllowed: false })).toEqual({ due: false, reason: 'not_allowed' });
  });

  it('a message sent long enough ago does not block the call', () => {
    expect(noOffersCallDue({ ...base, lastSentAt: new Date(T.getTime() - 20 * 60_000) })).toEqual({ due: true });
  });

  it('permanent reasons are reported before "not yet" ones', () => {
    expect(noOffersCallDue({ ...base, doNotContact: true, startAt: T })).toEqual({ due: false, reason: 'do_not_contact' });
  });
});
