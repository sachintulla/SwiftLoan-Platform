import { basicDetailsForAgent } from '../src/state/store';
import type { UserContext } from '../src/api/client';

const ctx = (over: Partial<UserContext> = {}): UserContext => ({
  hasHistory: true,
  profile: {
    name: 'BHIMIREDDY VEERENDRA REDDY', email: 'someone@example.com', phone: '9000000061', dob: '1991-02-11', gender: 'male',
    city: 'AMEERPET', pincode: '500018', employment: 'salaried', monthlyIncome: 600000, panOnFile: false,
  },
  prefill: { available: true, panAvailable: true },
  applicantDraft: { state: 'ANDHRA PRADESH', addressLine1: '403 BALAJI EMPIRE', alternateMobile: '9649112345' },
  ...over,
} as unknown as UserContext);

describe('basicDetailsForAgent (what the voice agent is told from the mobile-number lookup)', () => {
  it('gives the basic details only', () => {
    expect(basicDetailsForAgent(ctx())).toEqual({
      name: 'Bhimireddy Veerendra Reddy', date_of_birth: '1991-02-11', gender: 'male',
      city: 'Ameerpet', state: 'Andhra Pradesh', pincode: '500018', employment: 'salaried', pan_on_record: true,
    });
  });

  it('never carries the PAN, score, income, street address, email or alternate number', () => {
    const text = JSON.stringify(basicDetailsForAgent(ctx()));
    for (const leak of ['600000', 'someone@example.com', '403 BALAJI', '9649112345', '9000000061', 'monthlyIncome', 'creditScore', 'pan"']) {
      expect(text).not.toContain(leak);
    }
  });

  it('sends nothing unless details were fetched for this account', () => {
    expect(basicDetailsForAgent(null)).toBeUndefined();
    expect(basicDetailsForAgent(ctx({ prefill: null }))).toBeUndefined();
    expect(basicDetailsForAgent(ctx({ prefill: undefined }))).toBeUndefined();
    expect(basicDetailsForAgent(ctx({ profile: null }))).toBeUndefined();
  });

  it('leaves out what is missing and keeps a name that is already in normal capitals', () => {
    const out = basicDetailsForAgent(ctx({
      profile: { name: 'Asha Rao', email: null, phone: '9', dob: null, gender: null, city: null, pincode: null, employment: null, monthlyIncome: null, panOnFile: false },
      prefill: { available: true, panAvailable: false },
      applicantDraft: null,
    } as unknown as Partial<UserContext>));
    expect(out).toEqual({ name: 'Asha Rao', pan_on_record: false });
  });
});
