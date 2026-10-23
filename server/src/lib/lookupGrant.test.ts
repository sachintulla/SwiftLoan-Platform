import { describe, it, expect, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccess } from './jwt.js';
import {
  signLookupGrant, verifyLookupGrant, resolveLookupAccess, grantRequiredRoles,
} from './lookupGrant.js';

const user = { sub: 'user-1', phone: '9876543210' };

describe('lookup grant', () => {
  afterEach(() => { delete process.env.LOOKUP_GRANT_REQUIRED_ROLES; });

  it('round-trips the signed-in identity', () => {
    expect(verifyLookupGrant(signLookupGrant(user))).toEqual(user);
  });

  it('rejects junk, empty and non-string values', () => {
    for (const v of [undefined, null, '', '   ', 'abc.def.ghi', 42, {}]) expect(verifyLookupGrant(v)).toBeNull();
  });

  it('rejects an access token (different key + audience) and an expired grant', () => {
    expect(verifyLookupGrant(signAccess(user))).toBeNull();
    const expired = jwt.sign(user, 'whatever', { audience: 'agent-lookup', expiresIn: -10 });
    expect(verifyLookupGrant(expired)).toBeNull();
  });

  it('a grant cannot be replayed as an access token', () => {
    expect(() => jwt.verify(signLookupGrant(user), 'dev-access')).toThrow();
  });
});

describe('resolveLookupAccess', () => {
  afterEach(() => { delete process.env.LOOKUP_GRANT_REQUIRED_ROLES; });

  it('uses the granted phone and ignores a spoken one', () => {
    const a = resolveLookupAccess({ 'x-agent-role': 'website' }, { phone_number: '9000000001', lookup_grant: signLookupGrant(user) });
    expect(a).toEqual({ kind: 'granted', phone: user.phone, userId: user.sub });
  });

  it('denies a website agent that has no grant, or a bad one, whatever number was said', () => {
    expect(resolveLookupAccess({ 'x-agent-role': 'website' }, { phone_number: '9000000001' })).toEqual({ kind: 'denied' });
    expect(resolveLookupAccess({ 'x-agent-role': 'Website' }, { phone_number: '9000000001', lookup_grant: 'nope' })).toEqual({ kind: 'denied' });
    expect(resolveLookupAccess({ 'x-agent-role': 'website' }, { phone_number: '{context_data.lookup_grant}' })).toEqual({ kind: 'denied' });
  });

  it('leaves phone-only callers (outbound dialer, in-app) unchanged', () => {
    expect(resolveLookupAccess({}, { phone_number: '9000000001' })).toEqual({ kind: 'open' });
    expect(resolveLookupAccess({ 'x-agent-role': 'outbound' }, { phone_number: '9000000001' })).toEqual({ kind: 'open' });
  });

  it('the grant-required roles are configurable', () => {
    process.env.LOOKUP_GRANT_REQUIRED_ROLES = 'website, mobile';
    expect([...grantRequiredRoles()]).toEqual(['website', 'mobile']);
    expect(resolveLookupAccess({ 'x-agent-role': 'mobile' }, {})).toEqual({ kind: 'denied' });
  });
});
