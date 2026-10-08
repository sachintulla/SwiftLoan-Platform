import { describe, it, expect } from 'vitest';
import { parseAgentPhone } from './agentPhone.js';

describe('parseAgentPhone', () => {
  it('accepts a normal number and keeps the last 10 digits', () => {
    expect(parseAgentPhone('9876543210')).toEqual({ kind: 'ok', phone: '9876543210' });
    expect(parseAgentPhone('+91 98765-43210')).toEqual({ kind: 'ok', phone: '9876543210' });
    expect(parseAgentPhone(919876543210)).toEqual({ kind: 'ok', phone: '9876543210' });
  });

  it('treats an unfilled Ello template as "no phone yet" (the live bug: 400 -> failed tool call)', () => {
    expect(parseAgentPhone('{context_data.phone_number}')).toEqual({ kind: 'pending' });
    expect(parseAgentPhone('{phone_number}')).toEqual({ kind: 'pending' });
    expect(parseAgentPhone('{{phone}}')).toEqual({ kind: 'pending' });
    expect(parseAgentPhone('  {context_data.phone_number}  ')).toEqual({ kind: 'pending' });
  });

  it('treats missing / empty / null-ish values as "no phone yet"', () => {
    for (const v of [undefined, null, '', '   ', 'null', 'undefined', 'None']) {
      expect(parseAgentPhone(v)).toEqual({ kind: 'pending' });
    }
  });

  it('still rejects a real but malformed number as invalid', () => {
    expect(parseAgentPhone('12345')).toEqual({ kind: 'invalid' });
    expect(parseAgentPhone('abc')).toEqual({ kind: 'invalid' });
    expect(parseAgentPhone('98765 4321')).toEqual({ kind: 'invalid' }); // 9 digits
  });
});
