import { describe, it, expect } from 'vitest';
import { noticeKindFor, buildNoticeVars, NO_OFFERS_GUIDANCE, OFFERS_NOTICE_SETTING, DEFAULT_NO_OFFERS_CONFIG, DEFAULT_RETRY_CONFIG } from './offersNotice.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { DEFAULT_SETTINGS } from './integrations.js';
import { templateByName } from './whatsappTemplates.js';
import { JOURNEY_EVENTS } from './journey.js';

describe('noticeKindFor', () => {
  it('tells the customer about a real decline and about a technical fault', () => {
    expect(noticeKindFor('not_eligible')).toBe('no_offers');
    expect(noticeKindFor('technical')).toBe('eligibility_retry');
  });

  it('says nothing for a duplicate number, an unknown reason or no reason', () => {
    for (const r of ['duplicate', 'something_new', '', null, undefined]) expect(noticeKindFor(r as string | null | undefined), String(r)).toBeNull();
  });
});

describe('buildNoticeVars', () => {
  it('uses the first name, the reference, the guidance and a link to the app', () => {
    const v = buildNoticeVars({ name: 'Priya Sharma', ref: 'SL-884021', siteUrl: 'https://www.swiftloan.ai/' });
    expect(v).toEqual({ name: 'Priya', ref: 'SL-884021', guidance: NO_OFFERS_GUIDANCE, link: 'https://www.swiftloan.ai/applink' });
  });

  it('falls back to a neutral greeting rather than a blank', () => {
    expect(buildNoticeVars({ name: null, ref: 'SL-1', siteUrl: 'https://x.test' }).name).toBe('there');
  });

  it('fills every placeholder the shipped defaults and catalogue templates need', () => {
    const vars = buildNoticeVars({ name: 'Priya', ref: 'SL-884021', siteUrl: 'https://www.swiftloan.ai' });
    expect(buildPlaceholders(DEFAULT_NO_OFFERS_CONFIG.placeholders, vars)).toHaveLength(3);
    expect(buildPlaceholders(DEFAULT_RETRY_CONFIG.placeholders, vars)).toHaveLength(3);
    for (const name of ['no_offers_update', 'eligibility_retry_update']) {
      const t = templateByName(name)!;
      expect(buildPlaceholders(t.placeholders, vars), name).toHaveLength(t.examples.length);
    }
  });

  it('never repeats the lender wording', () => {
    expect(NO_OFFERS_GUIDANCE).not.toMatch(/lender said|declined|rejected|credit score/i);
  });
});

describe('wiring', () => {
  it('ships both notices off with no template, so nothing sends until an admin turns them on', () => {
    for (const key of Object.values(OFFERS_NOTICE_SETTING)) {
      const c = (DEFAULT_SETTINGS.voxvalley as Record<string, { enabled: boolean; template: string }>)[key];
      expect(c.enabled, key).toBe(false);
      expect(c.template, key).toBe('');
    }
  });

  it('records the missing offers as their own journey event', () => {
    expect(JOURNEY_EVENTS.OFFERS_NOT_RECEIVED).toBe('offers_not_received');
  });
});
