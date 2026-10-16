import { describe, it, expect } from 'vitest';
import { smsFor } from './stallSms.js';

const base = { smsTemplateId: 'T-DEFAULT', smsBody: 'Default text\n-Team' };

describe('smsFor', () => {
  it('uses the registered default for any stage', () => {
    expect(smsFor(base, 'otp_requested')).toEqual({ templateId: 'T-DEFAULT', body: 'Default text\n-Team' });
  });

  it('prefers a per-stage override when both its id and body are set', () => {
    const s = { ...base, smsTemplates: { kyc_started: { templateId: 'T-KYC', body: 'Finish KYC' } } };
    expect(smsFor(s, 'kyc_started')).toEqual({ templateId: 'T-KYC', body: 'Finish KYC' });
    expect(smsFor(s, 'offer_viewed')?.templateId).toBe('T-DEFAULT');
  });

  it('ignores a half-filled override (a body without its DLT id would be dropped by the carrier)', () => {
    const s = { ...base, smsTemplates: { kyc_started: { templateId: '', body: 'Finish KYC' } } };
    expect(smsFor(s, 'kyc_started')?.templateId).toBe('T-DEFAULT');
  });

  it('returns null when nothing is registered', () => {
    expect(smsFor({}, 'otp_requested')).toBeNull();
    expect(smsFor({ smsTemplateId: 'T', smsBody: '  ' }, 'otp_requested')).toBeNull();
  });
});
