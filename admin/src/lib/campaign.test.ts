import { describe, it, expect } from 'vitest';
import { EMPTY_FORM, validate, minutesToTime, timeToMinutes } from './campaign';

describe('validate', () => {
  it('accepts the untouched default form except for the missing name', () => {
    const errs = validate(EMPTY_FORM);
    expect(Object.keys(errs)).toEqual(['name']);
  });

  it('accepts a minimally-filled form (regression: campaign creation with everything else left blank)', () => {
    // This is exactly the shape that used to 400 server-side: name filled,
    // startAt/endAt/assistantId/note left blank. The server's Zod schema
    // rejected the `null` the client sends for those — a bug independent of
    // this client-side validator, but worth pinning here too so this
    // function's own contract (what it considers "valid") doesn't regress.
    const errs = validate({ ...EMPTY_FORM, name: 'Diwali push' });
    expect(errs).toEqual({});
  });

  it('requires a non-blank name', () => {
    expect(validate({ ...EMPTY_FORM, name: '   ' })).toHaveProperty('name');
  });

  it('rejects an end date before the start date', () => {
    const errs = validate({
      ...EMPTY_FORM,
      name: 'x',
      startAt: '2026-01-10T10:00',
      endAt: '2026-01-05T10:00',
    });
    expect(errs).toHaveProperty('endAt');
  });

  it('accepts an end date after the start date', () => {
    const errs = validate({
      ...EMPTY_FORM,
      name: 'x',
      startAt: '2026-01-05T10:00',
      endAt: '2026-01-10T10:00',
    });
    expect(errs).not.toHaveProperty('endAt');
  });

  it('rejects an invalid daily start/end time', () => {
    expect(validate({ ...EMPTY_FORM, name: 'x', dailyStart: 'nope' })).toHaveProperty('dailyStart');
    expect(validate({ ...EMPTY_FORM, name: 'x', dailyEnd: '25:99' })).toHaveProperty('dailyEnd');
  });

  it('rejects concurrency outside 1-50', () => {
    expect(validate({ ...EMPTY_FORM, name: 'x', concurrency: '0' })).toHaveProperty('concurrency');
    expect(validate({ ...EMPTY_FORM, name: 'x', concurrency: '51' })).toHaveProperty('concurrency');
  });

  it('requires attemptsPerDay >= 1 for n_per_day / until_answered strategies', () => {
    expect(validate({ ...EMPTY_FORM, name: 'x', retryStrategy: 'n_per_day', attemptsPerDay: '0' }))
      .toHaveProperty('attemptsPerDay');
    expect(validate({ ...EMPTY_FORM, name: 'x', retryStrategy: 'until_answered', attemptsPerDay: '0' }))
      .toHaveProperty('attemptsPerDay');
  });

  it('requires retryIntervalDays >= 1 for the every_n_days strategy', () => {
    expect(validate({ ...EMPTY_FORM, name: 'x', retryStrategy: 'every_n_days', retryIntervalDays: '0' }))
      .toHaveProperty('retryIntervalDays');
  });
});

describe('minutesToTime / timeToMinutes round-trip', () => {
  it('round-trips a normal time', () => {
    expect(minutesToTime(timeToMinutes('09:30'))).toBe('09:30');
  });
  it('returns null for garbage input', () => {
    expect(timeToMinutes('not a time')).toBeNull();
  });
  it('returns an empty string for a missing minute value', () => {
    expect(minutesToTime(null)).toBe('');
    expect(minutesToTime(undefined)).toBe('');
  });
});
