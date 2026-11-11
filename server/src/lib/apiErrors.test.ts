import { describe, it, expect } from 'vitest';
import { buildApiErrorWhere, statusClassWhere, classifyRow, IS_ERROR } from './apiErrors.js';

describe('buildApiErrorWhere', () => {
  it('always constrains to errors, and returns the bare condition with no filters', () => {
    expect(buildApiErrorWhere({})).toEqual(IS_ERROR);
  });

  it('ANDs each chosen filter onto the error condition', () => {
    const w = buildApiErrorWhere({ direction: 'outbound', target: 'aurix', q: 'offers' });
    expect(w).toEqual({
      AND: [
        IS_ERROR,
        { direction: 'outbound' },
        { target: 'aurix' },
        { url: { contains: 'offers', mode: 'insensitive' } },
      ],
    });
  });

  it('builds a date range when from/to are given', () => {
    const from = new Date('2026-11-01T00:00:00Z');
    const to = new Date('2026-11-02T00:00:00Z');
    expect(buildApiErrorWhere({ from, to })).toEqual({ AND: [IS_ERROR, { createdAt: { gte: from, lte: to } }] });
  });
});

describe('statusClassWhere', () => {
  it('maps each class to its status range', () => {
    expect(statusClassWhere('4xx')).toEqual({ status: { gte: 400, lt: 500 } });
    expect(statusClassWhere('5xx')).toEqual({ status: { gte: 500 } });
    expect(statusClassWhere('errored')).toEqual({ status: null, error: { not: null } });
  });
});

describe('classifyRow', () => {
  it('ranks 5xx over 4xx over a bare error', () => {
    expect(classifyRow({ status: 503, error: null })).toBe('5xx');
    expect(classifyRow({ status: 401, error: null })).toBe('4xx');
    expect(classifyRow({ status: null, error: 'ECONNREFUSED' })).toBe('errored');
    expect(classifyRow({ status: 200, error: null })).toBe('ok');
  });
});
