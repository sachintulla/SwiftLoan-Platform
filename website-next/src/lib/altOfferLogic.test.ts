import { describe, expect, it } from 'vitest';
import {
  MIN_AWAY_MS,
  PENDING_TTL_MS,
  altOfferAvailable,
  altStatusTone,
  appliedReferrals,
  parsePending,
  shouldPromptAfterReturn,
} from './altOfferLogic';

describe('altStatusTone — same mapping as the app (loans.tsx yubiStatus)', () => {
  it.each([
    ['DISBURSED', 'approved'],
    ['approved', 'approved'],
    ['LOAN_SANCTIONED', 'approved'],
    ['COMPLETE', 'approved'],
    ['REJECTED', 'rejected'],
    ['application_failed', 'rejected'],
    ['DECLINED', 'rejected'],
    ['EXPIRED', 'rejected'],
    ['NEW_LEAD', 'in_progress'],
    ['OFFERS_GENERATED', 'in_progress'],
    ['', 'in_progress'],
    [null, 'in_progress'],
    [undefined, 'in_progress'],
  ])('%s → %s', (status, tone) => {
    expect(altStatusTone(status as string | null | undefined)).toBe(tone);
  });
});

describe('altOfferAvailable', () => {
  it('needs both the server flag and an application', () => {
    expect(altOfferAvailable(true, 'app-1')).toBe(true);
    expect(altOfferAvailable(false, 'app-1')).toBe(false);
    expect(altOfferAvailable(true, null)).toBe(false);
    expect(altOfferAvailable(true, undefined)).toBe(false);
    expect(altOfferAvailable(true, '')).toBe(false);
  });
});

describe('parsePending', () => {
  it('reads a valid record', () => {
    expect(parsePending(JSON.stringify({ applicationId: 'a', openedAt: 5 }))).toEqual({ applicationId: 'a', openedAt: 5 });
  });
  it.each([null, '', 'not json', '{}', JSON.stringify({ applicationId: '', openedAt: 1 }), JSON.stringify({ applicationId: 'a' }), JSON.stringify({ applicationId: 'a', openedAt: 'x' })])(
    'rejects %s',
    (raw) => {
      expect(parsePending(raw)).toBeNull();
    },
  );
});

describe('shouldPromptAfterReturn', () => {
  const opened = 1_000_000;
  const pending = { applicationId: 'app-1', openedAt: opened };

  it('does not ask without a pending open', () => {
    expect(shouldPromptAfterReturn(null, opened + MIN_AWAY_MS)).toBe(false);
  });
  it('does not ask on a quick tab flick', () => {
    expect(shouldPromptAfterReturn(pending, opened + MIN_AWAY_MS - 1)).toBe(false);
  });
  it('asks once the visitor was away long enough', () => {
    expect(shouldPromptAfterReturn(pending, opened + MIN_AWAY_MS)).toBe(true);
  });
  it('stops asking when the open is stale', () => {
    expect(shouldPromptAfterReturn(pending, opened + PENDING_TTL_MS + 1)).toBe(false);
  });
  it('only asks on the page for the same application', () => {
    expect(shouldPromptAfterReturn(pending, opened + MIN_AWAY_MS, 'app-1')).toBe(true);
    expect(shouldPromptAfterReturn(pending, opened + MIN_AWAY_MS, 'other')).toBe(false);
  });
});

describe('appliedReferrals', () => {
  const r = (id: string, appliedAt: string | null) => ({ id, applicationId: 'a', appliedAt, appliedLender: null, lastStatus: null });
  it('keeps only referrals the applicant proceeded with', () => {
    expect(appliedReferrals({ partnerReferrals: [r('1', '2026-10-12T00:00:00Z'), r('2', null)] }).map((x) => x.id)).toEqual(['1']);
  });
  it('tolerates a missing list', () => {
    expect(appliedReferrals({})).toEqual([]);
    expect(appliedReferrals({ partnerReferrals: null })).toEqual([]);
  });
});
