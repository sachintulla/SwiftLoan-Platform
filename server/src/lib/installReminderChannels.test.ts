import { describe, it, expect } from 'vitest';
import { reminderSendsWhatsapp } from './installReminder.js';
import { DEFAULT_SCHEDULE_CONFIG, stepsFromRows, type ScheduleConfig } from './reminderSchedule.js';

const cfg = (rows: Array<{ channel: 'sms' | 'whatsapp'; afterMinutes: number }>): ScheduleConfig => ({ ...DEFAULT_SCHEDULE_CONFIG, steps: stepsFromRows(rows) });

describe('reminderSendsWhatsapp (does the drop-off WhatsApp journey stand back for this reminder?)', () => {
  it('an SMS-only website reminder does not: the WhatsApp journey keeps running alongside it', () => {
    const smsOnly = cfg([{ channel: 'sms', afterMinutes: 5 }, { channel: 'sms', afterMinutes: 1440 }]);
    expect(reminderSendsWhatsapp({ unverified: false, lastStep: 'pan_done' }, smsOnly)).toBe(false);
    expect(reminderSendsWhatsapp({ unverified: false, lastStep: 'offers_ready' }, smsOnly)).toBe(false);
  });
  it('a verified-visitor reminder sends nothing while its switch is off (the default), so it never blocks the journey', () => {
    const mixed = cfg([{ channel: 'sms', afterMinutes: 5 }, { channel: 'whatsapp', afterMinutes: 30 }]);
    expect(reminderSendsWhatsapp({ unverified: false, lastStep: 'otp_only' }, mixed)).toBe(false);
  });
  it('the "never entered the OTP" run follows its own schedule (default has a WhatsApp row)', () => {
    expect(reminderSendsWhatsapp({ unverified: true, lastStep: 'otp_requested' }, cfg([{ channel: 'sms', afterMinutes: 5 }]))).toBe(true);
  });
});
