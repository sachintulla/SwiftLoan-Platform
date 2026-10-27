import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const queryRaw = vi.fn();
vi.mock('./prisma.js', () => ({ prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) } }));

import {
  buildCallWhere, activeCallFilters, followUpIds, purposesFor, toCallListItem,
  istTodayRange, overviewRange, CALL_LIST_SELECT, CALL_PURPOSES, FOLLOW_UP_DAYS,
} from './callFilters.js';

beforeEach(() => queryRaw.mockReset());

describe('buildCallWhere', () => {
  it('is calls only by default', () => {
    expect(buildCallWhere({})).toEqual({ channel: { in: ['phone_outbound', 'phone_inbound'] } });
  });

  it('filters by one status and by several', () => {
    expect(buildCallWhere({ status: 'failed' }).status).toBe('failed');
    expect(buildCallWhere({ status: 'dialing,in_progress' }).status).toEqual({ in: ['dialing', 'in_progress'] });
  });

  it('ignores an invalid status and keeps the valid ones in a list', () => {
    expect(buildCallWhere({ status: 'exploded' }).status).toBeUndefined();
    expect(buildCallWhere({ status: 'busy,exploded' }).status).toBe('busy');
  });

  it('filters by outcome and ignores an invalid one', () => {
    expect(buildCallWhere({ outcome: 'callback_requested' }).outcome).toBe('callback_requested');
    expect(buildCallWhere({ outcome: 'made_up' }).outcome).toBeUndefined();
  });

  it('filters purpose with a JSON path on callContext.reason', () => {
    const w = buildCallWhere({ purpose: 'daily_status_update' });
    expect(w.AND).toEqual([{ callContext: { path: ['reason'], equals: 'daily_status_update' } }]);
  });

  it('accepts every purpose the server writes, and ignores unknown ones', () => {
    for (const p of CALL_PURPOSES) expect(buildCallWhere({ purpose: p }).AND).toBeDefined();
    expect(buildCallWhere({ purpose: 'something_else' }).AND).toBeUndefined();
  });

  it('treats the campaign purpose as "belongs to a campaign"', () => {
    const w = buildCallWhere({ purpose: 'campaign' });
    expect(w.campaignId).toEqual({ not: null });
    expect(w.AND).toBeUndefined();
  });

  it('filters by campaign id', () => {
    expect(buildCallWhere({ campaignId: 'c1' }).campaignId).toBe('c1');
  });

  it('searches the phone number when the search is digits', () => {
    expect(buildCallWhere({ search: '98765' }).phone).toEqual({ contains: '98765' });
    expect(buildCallWhere({ search: '+91 98765-43210' }).phone).toEqual({ contains: '919876543210' });
    expect(buildCallWhere({ search: '98765' }).customer).toBeUndefined();
  });

  it('searches the customer name when the search has letters', () => {
    const w = buildCallWhere({ search: 'asha' });
    expect(w.customer).toEqual({ is: { name: { contains: 'asha', mode: 'insensitive' } } });
    expect(w.phone).toBeUndefined();
    // letters plus digits is still a name, not a number
    expect(buildCallWhere({ search: 'asha 2' }).phone).toBeUndefined();
  });

  it('applies from and to to the queued time', () => {
    const w = buildCallWhere({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' });
    expect(w.queuedAt).toEqual({ gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-02T00:00:00.000Z') });
  });

  it('applies a single bound', () => {
    expect(buildCallWhere({ from: '2026-10-01T00:00:00.000Z' }).queuedAt).toEqual({ gte: new Date('2026-10-01T00:00:00.000Z') });
  });

  it('ignores invalid dates', () => {
    expect(buildCallWhere({ from: 'yesterday', to: 'not-a-date' }).queuedAt).toBeUndefined();
    expect(buildCallWhere({ from: 'nope', to: '2026-10-02T00:00:00.000Z' }).queuedAt).toEqual({ lte: new Date('2026-10-02T00:00:00.000Z') });
  });

  it('filters answered true and false, and ignores anything else', () => {
    expect(buildCallWhere({ answered: '1' }).answered).toBe(true);
    expect(buildCallWhere({ answered: '0' }).answered).toBe(false);
    expect(buildCallWhere({ answered: 'yes' }).answered).toBeUndefined();
  });

  it('restricts to the follow-up ids when followUp=1, and to nothing when there are none', () => {
    expect(buildCallWhere({ followUp: '1' }, { followUpIds: ['a', 'b'] }).id).toEqual({ in: ['a', 'b'] });
    expect(buildCallWhere({ followUp: '1' }).id).toEqual({ in: [] });
    expect(buildCallWhere({}, { followUpIds: ['a'] }).id).toBeUndefined();
  });

  it('combines filters', () => {
    const w = buildCallWhere({ status: 'completed', outcome: 'interested', search: '98', answered: '1' });
    expect(w).toMatchObject({ status: 'completed', outcome: 'interested', phone: { contains: '98' }, answered: true });
  });
});

describe('activeCallFilters', () => {
  it('lists only the filters that were set', () => {
    expect(activeCallFilters({ status: 'failed', search: '', page: '3', purpose: 'campaign' })).toEqual({ status: 'failed', purpose: 'campaign' });
  });
});

describe('CALL_LIST_SELECT', () => {
  it('leaves out the large and sensitive fields', () => {
    const keys = Object.keys(CALL_LIST_SELECT);
    for (const banned of ['rawPayload', 'transcript', 'callContext', 'recordingUrl']) expect(keys).not.toContain(banned);
  });

  it('has the fields the list shows', () => {
    for (const k of ['id', 'phone', 'status', 'outcome', 'outcomeSource', 'answered', 'durationSec', 'summary', 'callbackAt', 'queuedAt', 'startedAt', 'endedAt', 'campaignId', 'customer']) {
      expect(Object.keys(CALL_LIST_SELECT)).toContain(k);
    }
  });
});

describe('toCallListItem', () => {
  const base = {
    id: 'c1', phone: '9876543210', status: 'completed', outcome: 'interested', outcomeSource: 'agent', answered: true,
    durationSec: 42, summary: 'Wants 2 lakh', callbackAt: null, queuedAt: new Date('2026-10-27T05:00:00Z'),
    startedAt: null, endedAt: null, campaignId: null, customer: { id: 'u1', name: 'Asha', phone: '9876543210' },
  };

  it('clips the summary to 300 characters', () => {
    const item = toCallListItem({ ...base, summary: 'x'.repeat(500) }, null);
    expect(item.summary?.length).toBe(300);
    expect(toCallListItem(base, null).summary).toBe('Wants 2 lakh');
    expect(toCallListItem({ ...base, summary: null }, null).summary).toBeNull();
  });

  it('never carries the large fields', () => {
    const item = toCallListItem({ ...base, transcript: [1], rawPayload: {}, callContext: {}, recordingUrl: 'x' } as never, 'upshot_journey');
    for (const banned of ['rawPayload', 'transcript', 'callContext', 'recordingUrl']) expect(item).not.toHaveProperty(banned);
  });

  it('takes the purpose from the reason, and falls back to campaign', () => {
    expect(toCallListItem(base, 'daily_status_update').purpose).toBe('daily_status_update');
    expect(toCallListItem({ ...base, campaignId: 'k1' }, null).purpose).toBe('campaign');
    expect(toCallListItem(base, undefined).purpose).toBeNull();
  });
});

describe('followUpIds', () => {
  it('asks for callback and interested calls with no later phone call, within the window', async () => {
    queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const ids = await followUpIds(7, new Date('2026-10-27T00:00:00Z'));
    expect(ids).toEqual(['a', 'b']);
    const sql = queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain('NOT EXISTS');
    expect(sql.sql).toContain("'callback_requested'::\"CallOutcome\"");
    expect(sql.sql).toContain("'interested'::\"CallOutcome\"");
    expect(sql.sql).toContain('b.id <> a.id');
    expect(sql.values[0]).toEqual(new Date('2026-10-20T00:00:00Z'));
  });

  it('defaults to a fourteen day window', () => {
    expect(FOLLOW_UP_DAYS).toBe(14);
  });

  it('documents the definition right next to the SQL', () => {
    const src = readFileSync(fileURLToPath(new URL('./callFilters.ts', import.meta.url)), 'utf8');
    const doc = src.indexOf('"Needs a follow-up" =');
    const sql = src.indexOf('NOT EXISTS (');
    expect(doc).toBeGreaterThan(-1);
    expect(sql).toBeGreaterThan(doc);
    expect(sql - doc).toBeLessThan(1500);
    expect(src.slice(doc, sql)).toContain('NO LATER phone call');
  });
});

describe('purposesFor', () => {
  it('returns an empty map without querying for no ids', async () => {
    expect((await purposesFor([])).size).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('maps ids to reasons in one query', async () => {
    queryRaw.mockResolvedValue([{ id: 'a', purpose: 'upshot_journey' }, { id: 'b', purpose: null }]);
    const m = await purposesFor(['a', 'b']);
    expect(m.get('a')).toBe('upshot_journey');
    expect(m.get('b')).toBeNull();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('IST day range', () => {
  it('starts at midnight IST, which is 18:30 UTC the day before', () => {
    const r = istTodayRange(new Date('2026-10-27T10:00:00Z')); // 15:30 IST on the 27th
    expect(r.from.toISOString()).toBe('2026-10-26T18:30:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-27T10:00:00.000Z');
  });

  it('rolls over at IST midnight, not UTC midnight', () => {
    // 19:00 UTC on the 27th is 00:30 IST on the 28th
    const r = istTodayRange(new Date('2026-10-27T19:00:00Z'));
    expect(r.from.toISOString()).toBe('2026-10-27T18:30:00.000Z');
  });
});

describe('overviewRange', () => {
  const now = new Date('2026-10-27T10:00:00Z');
  it('defaults to today in IST', () => {
    expect(overviewRange({}, now).from.toISOString()).toBe('2026-10-26T18:30:00.000Z');
  });
  it('uses valid from and to, ignores invalid ones', () => {
    const r = overviewRange({ from: '2026-10-01T00:00:00.000Z', to: 'bad' }, now);
    expect(r.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.to).toEqual(now);
  });
  it('swaps a reversed range', () => {
    const r = overviewRange({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }, now);
    expect(r.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
