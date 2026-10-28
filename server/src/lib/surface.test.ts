import { describe, expect, it } from 'vitest';
import { surfaceOf, SURFACE_HEADER } from './surface.js';
import { surfaceFilter } from './stallRules.js';

describe('surfaceOf', () => {
  it('is the website only when the header says so', () => {
    expect(surfaceOf({ headers: { [SURFACE_HEADER]: 'website' } })).toBe('website');
    expect(surfaceOf({ headers: { [SURFACE_HEADER]: ' Website ' } })).toBe('website');
  });
  it('is the app for everything else, including no header', () => {
    expect(surfaceOf({ headers: {} })).toBe('app');
    expect(surfaceOf({ headers: { [SURFACE_HEADER]: 'app' } })).toBe('app');
    expect(surfaceOf({ headers: { [SURFACE_HEADER]: 'something' } })).toBe('app');
    expect(surfaceOf({ headers: { [SURFACE_HEADER]: ['website', 'app'] } })).toBe('website');
  });
});

describe('surfaceFilter (which trigger events a rule counts)', () => {
  it('"all" adds no filter, so existing rules behave exactly as before', () => {
    expect(surfaceFilter('all')).toEqual({});
    expect(surfaceFilter(undefined)).toEqual({});
    expect(surfaceFilter('nonsense')).toEqual({});
  });
  it('website counts only website events; app counts everything that is not the website', () => {
    expect(surfaceFilter('website')).toEqual({ channel: 'website' });
    expect(surfaceFilter('app')).toEqual({ channel: { not: 'website' } });
  });
});
