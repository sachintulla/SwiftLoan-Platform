import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PURPOSE_LABELS, PURPOSE_OPTIONS, purposeLabel, statusWord, answeredWord, canCallAgain,
  DEFAULT_FILTERS, callQuery, rangeBounds, rangeError, istDayStart, hasActiveFilters, filterSummary,
  statCells, overdueJobs, overdueMessage, jobName, everyLabel, triggerErrorMessage, barPercent,
  STATUS_CHIPS, type CallFilters, type JobHeartbeat,
} from './calls';

const NOW = new Date('2026-10-27T10:00:00.000Z'); // 15:30 IST

/** Every callContext.reason the server writes, found by reading the server source. */
function serverReasons(): string[] {
  const root = fileURLToPath(new URL('../../../server/src', import.meta.url));
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.ts') || p.endsWith('.test.ts')) continue;
      const src = readFileSync(p, 'utf8');
      // Only files that actually place calls write a callContext reason.
      if (!/placeCall\(|triggerElloCall\(/.test(src)) continue;
      for (const m of src.matchAll(/\breason:\s*'([a-z_]+)'/g)) found.add(m[1]);
    }
  };
  walk(root);
  return [...found];
}

describe('purposeLabel', () => {
  it('labels every callContext.reason the server writes', () => {
    const reasons = serverReasons();
    // Sanity: the scan finds the ones we know about, so it is not silently empty.
    expect(reasons).toEqual(expect.arrayContaining(['app_dropoff_followup', 'daily_status_update', 'manual_dashboard_call']));
    for (const r of reasons) expect(PURPOSE_LABELS[r], `no label for reason "${r}"`).toBeTruthy();
  });

  it('uses the owner wording', () => {
    expect(purposeLabel('app_dropoff_followup')).toBe('Stuck on a step');
    expect(purposeLabel('daily_status_update')).toBe('Daily status update');
    expect(purposeLabel('website_lead_followup')).toBe('Website enquiry');
    expect(purposeLabel('immediate_callback_optin')).toBe('Immediate callback');
    expect(purposeLabel('campaign')).toBe('Campaign');
    expect(purposeLabel('manual_dashboard_call')).toBe('Called by an admin');
  });

  it('falls back to readable words for an unknown reason, never a raw code', () => {
    expect(purposeLabel('renewal_reminder_call')).toBe('Renewal reminder call');
    expect(purposeLabel('renewal_reminder_call')).not.toContain('_');
  });

  it('says nothing was recorded when there is no reason', () => {
    expect(purposeLabel(null)).toBe('Not recorded');
    expect(purposeLabel('(unknown)')).toBe('Not recorded');
    expect(purposeLabel('')).toBe('Not recorded');
  });

  it('has a select option for each label the owner listed', () => {
    const labels = PURPOSE_OPTIONS.map((o) => o.label);
    for (const l of ['Stuck on a step', 'Daily status update', 'Website enquiry', 'Immediate callback', 'Campaign', 'Called by an admin']) {
      expect(labels).toContain(l);
    }
    expect(PURPOSE_OPTIONS[0].value).toBe('');
  });
});

describe('result words', () => {
  it('names each status in plain words', () => {
    expect(statusWord('no_answer')).toBe('No answer');
    expect(statusWord('dialing')).toBe('Ringing');
    expect(statusWord('in_progress')).toBe('In progress');
    expect(statusWord(null)).toBe('Unknown');
    expect(statusWord('weird_state')).toBe('Weird state');
  });

  it('says answered, not answered, or nothing while the call is going', () => {
    expect(answeredWord('completed', true)).toBe('Answered');
    expect(answeredWord('no_answer', false)).toBe('Not answered');
    expect(answeredWord('failed', false)).toBe('Not answered');
    expect(answeredWord('in_progress', false)).toBe('');
    expect(answeredWord('queued', null)).toBe('');
  });

  it('offers a second call only for failed or unanswered calls', () => {
    expect(canCallAgain('failed', false)).toBe(true);
    expect(canCallAgain('no_answer', false)).toBe(true);
    expect(canCallAgain('busy', false)).toBe(true);
    expect(canCallAgain('completed', true)).toBe(false);
    expect(canCallAgain('in_progress', false)).toBe(false);
    expect(canCallAgain('queued', false)).toBe(false);
  });
});

describe('callQuery', () => {
  it('is empty for the untouched page (every call, any time)', () => {
    expect(callQuery(DEFAULT_FILTERS, NOW).toString()).toBe('');
  });

  it('runs today and the last 7 days up to now, from a whole India day, so the request is stable all day', () => {
    const today = callQuery({ ...DEFAULT_FILTERS, range: 'today' }, NOW);
    expect(today.get('from')).toBe('2026-10-26T18:30:00.000Z');
    expect(today.has('to')).toBe(false);
    const week = callQuery({ ...DEFAULT_FILTERS, range: '7d' }, NOW);
    expect(week.get('from')).toBe('2026-10-20T18:30:00.000Z');
    expect(week.has('to')).toBe(false);
    // a minute later, the same request
    expect(callQuery({ ...DEFAULT_FILTERS, range: '7d' }, new Date(NOW.getTime() + 60_000)).toString()).toBe(week.toString());
  });

  it('maps each status view to the server parameters', () => {
    const q = (view: CallFilters['view']) => callQuery({ ...DEFAULT_FILTERS, view, range: 'all' }, NOW);
    expect(q('all').toString()).toBe('');
    expect(q('answered').get('answered')).toBe('1');
    expect(q('no_answer').get('status')).toBe('no_answer');
    expect(q('busy').get('status')).toBe('busy');
    expect(q('failed').get('status')).toBe('failed');
    expect(q('in_progress').get('status')).toBe('dialing,in_progress');
    expect(q('not_answered').get('status')).toBe('no_answer,busy');
    expect(q('follow_up').get('followUp')).toBe('1');
  });

  it('carries search, outcome and reason, trimmed, and skips empty ones', () => {
    const qs = callQuery({ ...DEFAULT_FILTERS, search: '  98765 ', outcome: 'interested', purpose: 'campaign' }, NOW);
    expect(qs.get('search')).toBe('98765');
    expect(qs.get('outcome')).toBe('interested');
    expect(qs.get('purpose')).toBe('campaign');
    expect(callQuery({ ...DEFAULT_FILTERS, search: '   ' }, NOW).has('search')).toBe(false);
  });

  it('never carries paging', () => {
    expect(callQuery({ ...DEFAULT_FILTERS, view: 'failed' }, NOW).has('page')).toBe(false);
  });

  it('drops a back-to-front custom range instead of sending it', () => {
    const f: CallFilters = { ...DEFAULT_FILTERS, range: 'custom', from: '2026-10-20', to: '2026-10-10' };
    expect(rangeError(f)).toMatch(/must be on or before/);
    const qs = callQuery(f, NOW);
    expect(qs.has('from')).toBe(false);
    expect(qs.has('to')).toBe(false);
  });
});

describe('date ranges', () => {
  it('starts today at midnight India time, which is 18:30 UTC the day before', () => {
    expect(istDayStart(NOW).toISOString()).toBe('2026-10-26T18:30:00.000Z');
    expect(rangeBounds({ range: 'today', from: '', to: '' }, NOW)).toEqual({ from: '2026-10-26T18:30:00.000Z' });
  });

  it('has no bounds for any time', () => {
    expect(rangeBounds({ range: 'all', from: '', to: '' }, NOW)).toEqual({});
  });

  it('turns a custom range into whole India days', () => {
    expect(rangeBounds({ range: 'custom', from: '2026-10-01', to: '2026-10-02' }, NOW)).toEqual({
      from: '2026-09-30T18:30:00.000Z',
      to: '2026-10-02T18:29:59.999Z',
    });
  });

  it('accepts one open end and ignores junk', () => {
    expect(rangeBounds({ range: 'custom', from: '2026-10-01', to: '' }, NOW).to).toBeUndefined();
    expect(rangeBounds({ range: 'custom', from: 'tomorrow', to: '' }, NOW)).toEqual({});
    expect(rangeError({ range: 'custom', from: '2026-10-01', to: '' })).toBeNull();
    expect(rangeError({ range: '7d', from: '2026-10-20', to: '2026-10-10' })).toBeNull();
  });
});

describe('filters in words', () => {
  it('knows when nothing has been changed', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, view: 'failed' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, range: 'today' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, range: '7d' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: ' ' })).toBe(false);
  });

  it('summarises what is on screen', () => {
    expect(filterSummary(DEFAULT_FILTERS)).toBe('Showing every call.');
    expect(filterSummary({ ...DEFAULT_FILTERS, view: 'failed', outcome: 'interested', search: '98', range: 'today' }))
      .toBe('Showing failed, outcome Interested, search "98", today.');
    expect(filterSummary({ ...DEFAULT_FILTERS, range: '7d' })).toBe('Showing the last 7 days.');
    expect(filterSummary({ ...DEFAULT_FILTERS, range: 'custom', from: '2026-10-01', to: '' })).toBe('Showing from 2026-10-01 to now.');
  });

  it('offers the six status chips the owner listed', () => {
    expect(STATUS_CHIPS.map((c) => c.label)).toEqual(['All', 'Answered', 'No answer', 'Busy', 'Failed', 'In progress']);
  });
});

describe('statCells', () => {
  const summary = {
    placed: 40, answered: 22, answerRate: 55, avgDurationSec: 61, interested: 5, callbacksDue: 2,
    doNotCall: 1, failed: 3, notAnswered: 12, needsFollowUp: 4,
  };

  it('has the five cells in order, each with a filter', () => {
    const cells = statCells(summary);
    expect(cells.map((c) => c.label)).toEqual(['Calls today', 'Answered', 'Not answered', 'Failed', 'Need a follow-up']);
    expect(cells.map((c) => c.value)).toEqual([40, 22, 12, 3, 4]);
    expect(cells[1].foot).toBe('55% of calls today');
    expect(cells[0].filter).toEqual({ view: 'all', range: 'today' });
    expect(cells[2].filter.view).toBe('not_answered');
    expect(cells[3].filter.view).toBe('failed');
    expect(cells[4].filter).toEqual({ view: 'follow_up', range: 'all' });
  });

  it('colours a number only when it is a warning', () => {
    const cells = statCells(summary);
    expect(cells[3].tone).toBe('red');
    expect(cells[4].tone).toBe('amber');
    const calm = statCells({ ...summary, failed: 0, needsFollowUp: 0 });
    expect(calm[3].tone).toBeUndefined();
    expect(calm[4].tone).toBeUndefined();
  });

  it('copes with no data yet', () => {
    expect(statCells(null).map((c) => c.value)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('dialler job health', () => {
  const job = (name: string, healthy: boolean, isCallJob = true): JobHeartbeat => ({
    name, everyMs: 60_000, runs: 3, lastRunAt: null, lastError: null, isCallJob, healthy,
  });

  it('lists only call jobs that are overdue', () => {
    const jobs = [job('step-stall', false), job('status-call', true), job('some-other-job', false, false)];
    expect(overdueJobs(jobs).map((j) => j.name)).toEqual(['step-stall']);
    expect(overdueJobs([job('status-call', true)])).toEqual([]);
    expect(overdueJobs(null)).toEqual([]);
  });

  it('names jobs in plain words and falls back readably', () => {
    expect(jobName('step-stall')).toBe('Calls to people stuck on a step');
    expect(jobName('brand-new-job')).toBe('Brand new job');
  });

  it('writes the overdue notice with the job names', () => {
    const msg = overdueMessage([job('step-stall', false), job('call-reconcile', false)]);
    expect(msg).toContain('Automatic calls may have stopped.');
    expect(msg).toContain('Calls to people stuck on a step, Clean-up of unfinished calls');
    expect(msg).toContain('wait a minute and refresh');
    expect(msg).not.toContain('!');
  });

  it('says how often a job runs', () => {
    expect(everyLabel(60_000)).toBe('Every 1 min');
    expect(everyLabel(5 * 60_000)).toBe('Every 5 min');
    expect(everyLabel(3_600_000)).toBe('Every 1 hour');
    expect(everyLabel(2 * 3_600_000)).toBe('Every 2 hours');
  });
});

describe('triggerErrorMessage', () => {
  it('words the two new refusals', () => {
    expect(triggerErrorMessage({ status: 409, message: 'x', body: { data: { code: 'do_not_contact' } } })).toContain('asked not to be contacted');
    expect(triggerErrorMessage({ status: 403, message: 'x', body: { data: { code: 'not_on_test_allowlist' } } })).toContain('test allowlist');
  });

  it('says a plain 403 is about the role', () => {
    expect(triggerErrorMessage({ status: 403, message: 'Forbidden' })).toBe('Only a super admin can place calls.');
  });

  it('shows the server message for anything else', () => {
    expect(triggerErrorMessage({ status: 500, message: 'Call failed: provider error' })).toBe('Call failed: provider error');
    expect(triggerErrorMessage({ status: 500, message: '' })).toBe('The call could not be placed.');
  });
});

describe('barPercent', () => {
  it('scales to the largest and keeps a sliver for small counts', () => {
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(1, 1000)).toBe(3);
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
  });
});
