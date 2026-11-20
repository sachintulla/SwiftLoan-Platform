import { callNameFor, resetCallName } from '../src/voice/callName';

// Regression (prod, 2026-11-20): the first name used on the first call was kept for every
// later call until the app was force-closed. A second account signed in on the same phone
// was addressed by the first account's name ("C", from "C S MURUGARAJ", on SACHIN's calls).
describe('the name Ruby uses on a call', () => {
  beforeEach(() => resetCallName());

  it('stays the same within one call even if the account name is edited mid-call', () => {
    expect(callNameFor('SACHIN', 'user-1', true)).toBe('SACHIN');
    expect(callNameFor('SACHINN', 'user-1', true)).toBe('SACHIN');
  });

  it('starts using the name once it becomes known during the call', () => {
    expect(callNameFor('', 'user-1', true)).toBe('');
    expect(callNameFor('SACHIN', 'user-1', true)).toBe('SACHIN');
  });

  it('is NOT carried into the next call when the call start/end clears it', () => {
    expect(callNameFor('C', 'user-1', true)).toBe('C');
    resetCallName(); // what store.ts does on the agent's connecting / idle status
    expect(callNameFor('SACHIN', 'user-2', true)).toBe('SACHIN');
  });

  it('never gives one account the name locked for another, even with no reset in between', () => {
    expect(callNameFor('C', 'user-1', true)).toBe('C');
    expect(callNameFor('SACHIN', 'user-2', true)).toBe('SACHIN');
    // and signing out mid-call drops it rather than keeping the old name
    expect(callNameFor('', '', true)).toBe('');
  });

  it('picks up the account name when someone signs in during a call', () => {
    expect(callNameFor('', '', true)).toBe('');
    expect(callNameFor('SACHIN', 'user-2', true)).toBe('SACHIN');
  });

  it('holds nothing while no call is live', () => {
    expect(callNameFor('C', 'user-1', true)).toBe('C');
    expect(callNameFor('SACHIN', 'user-1', false)).toBe('SACHIN');
    expect(callNameFor('SACHIN', 'user-1', true)).toBe('SACHIN');
  });
});
