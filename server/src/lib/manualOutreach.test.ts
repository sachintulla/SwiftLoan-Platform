import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ───────────── mocks: the database and every provider, so nothing real is touched ───────────── */

const h = vi.hoisted(() => ({
  calls: [] as string[],
  inWindow: true,
  allowlisted: true,
  notOnTestList: false,
  dnc: new Set<string>(),
  waConfig: null as any,
  smsConfig: null as any,
  rows: [] as any[],
  claimError: null as null | Error,
  existingClaim: null as null | { id: string; status: string },
  retakeCount: 1,
  nudgesOff: false,
}));

// The dispatch worker is off when NUDGES_DISABLED is set. The real module pulls in every background job.
vi.mock('../jobs/tracking.jobs.js', () => ({ nudgesDisabled: vi.fn(() => h.nudgesOff) }));

const prismaMock = vi.hoisted(() => ({
  outboundRequest: {
    findMany: vi.fn(async () => h.rows),
    create: vi.fn(async (args: any) => {
      h.calls.push(`create:${args.data.kind}`);
      if (h.claimError) throw h.claimError;
      return { id: `req-${h.calls.length}`, ...args.data };
    }),
    findUnique: vi.fn(async () => h.existingClaim),
    update: vi.fn(async (args: any) => {
      h.calls.push(`update:${args.data.status ?? 'payload'}`);
      return { id: args.where.id, ...args.data };
    }),
    updateMany: vi.fn(async () => ({ count: h.retakeCount })),
  },
  adminUser: { findMany: vi.fn(async () => [{ id: 'adm-1', name: 'Priya Rao' }]) },
  customer: { update: vi.fn(async () => ({})) },
  loanApplication: { findFirst: vi.fn(async () => ({ id: 'app-1', ref: 'SL-1001' })) },
  offer: { count: vi.fn(async () => 3) },
}));
vi.mock('./prisma.js', () => ({ prisma: prismaMock }));

const journeyMock = vi.hoisted(() => ({ recordJourneyEvent: vi.fn(async () => undefined) }));
vi.mock('./journey.js', async (orig) => ({ ...(await orig<typeof import('./journey.js')>()), recordJourneyEvent: journeyMock.recordJourneyEvent }));

const wa = vi.hoisted(() => ({
  send: vi.fn(async (_o: any): Promise<any> => ({ ok: true, status: 200, messageId: 'wamid-1' })),
}));
vi.mock('./whatsapp.js', () => ({ sendWhatsAppTemplate: wa.send, whatsappConfigured: vi.fn(async () => true) }));

const sms = vi.hoisted(() => ({
  send: vi.fn(async (_o: any): Promise<any> => ({ ok: true, status: 200, messageId: 'sms-1' })),
}));
vi.mock('./voxSms.js', () => ({ sendVoxSms: sms.send, smsConfigured: vi.fn(async () => true) }));

vi.mock('./stallWhatsapp.js', async (orig) => ({
  ...(await orig<typeof import('./stallWhatsapp.js')>()),
  directWhatsAppConfig: vi.fn(async () => h.waConfig),
}));
vi.mock('./stallSms.js', async (orig) => ({
  ...(await orig<typeof import('./stallSms.js')>()),
  directSmsConfig: vi.fn(async () => h.smsConfig),
}));
vi.mock('./leadCaller.js', () => ({ withinCallingHours: vi.fn(() => h.inWindow) }));
vi.mock('./callGate.js', () => ({ withinTestAllowlist: vi.fn(() => h.allowlisted) }));
vi.mock('./installReminder.js', () => ({ notOnTestList: vi.fn(() => h.notOnTestList) }));
vi.mock('./integrations.js', () => ({ upshotEventNameForStage: vi.fn(async () => 'kyc_nudge'), getProviderConfig: vi.fn(), DEFAULT_SETTINGS: {} }));
const dispatchMock = vi.hoisted(() => ({
  nudge: vi.fn(async (_c: any, _s: any): Promise<any[]> => [{ id: 'ev-1', kind: 'upshot_event', channel: 'push', status: 'pending', payload: { eventName: 'kyc_nudge' } }]),
}));
vi.mock('./dispatch.js', () => ({ nudgeCustomer: dispatchMock.nudge }));
vi.mock('./doNotContact.js', async (orig) => ({
  ...(await orig<typeof import('./doNotContact.js')>()),
  doNotContactCustomerIds: vi.fn(async (ids: string[]) => new Set(ids.filter((i) => h.dnc.has(i)))),
}));
vi.mock('../middleware/adminAuth.js', () => ({ CAN_WRITE: ['super_admin', 'admin'] }));

const installMock = vi.hoisted(() => ({
  mint: vi.fn(async (_i: any) => ({ url: 'https://dl.example.test/dl?ref=ABCD2345', token: 'ABCD2345', outboundRequestId: 'link-1' })),
  cancel: vi.fn(async (_id: string) => undefined),
  details: vi.fn(async () => ({ amountRupees: 300000, product: 'personal' })),
}));
vi.mock('./installContext.js', async (orig) => ({
  ...(await orig<typeof import('./installContext.js')>()),
  mintInstallLink: installMock.mint,
  cancelInstallLink: installMock.cancel,
  loadInstallDetails: installMock.details,
}));

const M = await import('./manualOutreach.js');
const { STAGE_LABELS, JOURNEY_EVENTS } = await import('./journey.js');
const { isOutreachStage } = await import('./stageOutreach.js');
const { buildPlaceholders } = await import('./stallWhatsapp.js');

/* ───────────── fixtures ───────────── */

const NOW = new Date('2026-10-27T10:00:00Z');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const customer = {
  id: 'cust-1', name: 'Asha Verma', phone: '9876543210', userId: 'user-1',
  currentStage: 'kyc_started', stageEnteredAt: minsAgo(500),
} as any;
const admin = { id: 'adm-1', email: 'priya@example.test', role: 'admin' };
const superAdmin = { id: 'adm-9', email: 'boss@example.test', role: 'super_admin' };

const waConfig = {
  siteUrl: 'https://site.example.test',
  map: {
    kyc_started: { template: 'finish_kyc', language: 'en', placeholders: ['{name}', '{ref}'] },
    app_installed: { template: 'get_started', language: 'en', placeholders: ['{name}', '{appLink}'] },
  },
};
const smsSettings = {
  smsTemplateId: 'T-DEFAULT', smsBody: 'Default text',
  smsTemplates: { kyc_started: { templateId: 'T-KYC', body: 'Finish your KYC today' } },
};

function guard(over: Record<string, any> = {}) {
  return {
    customer: { phone: '9876543210', currentStage: 'kyc_started' },
    dnc: false, allowlisted: true, role: 'admin', inWindow: true,
    recent: { ...M.NO_RECENT }, now: NOW, ...over,
  } as any;
}
const waInput = (over: Record<string, any> = {}) => ({
  ...guard(over), customer: { ...customer, ...(over.customer ?? {}) }, stageKey: 'kyc_started', cfg: waConfig as any,
  vars: { name: 'Asha', ref: 'SL-1001', offerCount: 3, siteUrl: 'https://site.example.test', appLink: '(link created when sent)' },
  ...(over.cfg !== undefined ? { cfg: over.cfg } : {}),
  ...(over.stageKey !== undefined ? { stageKey: over.stageKey } : {}),
  ...(over.vars !== undefined ? { vars: over.vars } : {}),
});

beforeEach(() => {
  h.calls.length = 0;
  h.inWindow = true; h.allowlisted = true; h.notOnTestList = false; h.nudgesOff = false;
  h.dnc = new Set(); h.rows = []; h.claimError = null; h.existingClaim = null; h.retakeCount = 1;
  h.waConfig = waConfig; h.smsConfig = { settings: smsSettings };
  vi.clearAllMocks();
  dispatchMock.nudge.mockImplementation(async () => [{ id: 'ev-1', kind: 'upshot_event', channel: 'push', status: 'pending', payload: { eventName: 'kyc_nudge' } }]);
  wa.send.mockImplementation(async () => { h.calls.push('provider:wa'); return { ok: true, status: 200, messageId: 'wamid-1' }; });
  sms.send.mockImplementation(async () => { h.calls.push('provider:sms'); return { ok: true, status: 200, messageId: 'sms-1' }; });
  installMock.mint.mockImplementation(async () => { h.calls.push('mint'); return { url: 'https://dl.example.test/dl?ref=ABCD2345', token: 'ABCD2345', outboundRequestId: 'link-1' }; });
});

/* ───────────── stage mapping ───────────── */

describe('resolveOutreachStage', () => {
  const allStages = Object.keys(STAGE_LABELS);

  it('covers all 14 journey stages', () => {
    expect(allStages).toHaveLength(14);
    expect(Object.keys(M.STAGE_TO_OUTREACH).sort()).toEqual([...allStages].sort());
  });

  it('only ever returns a key that Stage outreach knows', () => {
    for (const s of allStages) {
      const key = M.resolveOutreachStage(s);
      if (key !== null) expect(isOutreachStage(key)).toBe(true);
    }
  });

  it('maps the stage a customer is in to the event that put them there', () => {
    expect(M.resolveOutreachStage('lead_captured')).toBe('lead_captured');
    expect(M.resolveOutreachStage('contacted')).toBe('lead_captured');
    expect(M.resolveOutreachStage('app_installed')).toBe('app_installed');
    expect(M.resolveOutreachStage('registered')).toBe('otp_verified');
    expect(M.resolveOutreachStage('eligibility_checked')).toBe('eligibility_completed');
    expect(M.resolveOutreachStage('offers_viewed')).toBe('offer_viewed');
    expect(M.resolveOutreachStage('offer_selected')).toBe('offer_selected');
    expect(M.resolveOutreachStage('kyc_started')).toBe('kyc_started');
  });

  it('has nothing to say at the end of the journey', () => {
    for (const s of ['kyc_completed', 'application_submitted', 'approved', 'rejected', 'disbursed', 'lost']) {
      expect(M.resolveOutreachStage(s)).toBeNull();
    }
    expect(M.resolveOutreachStage(null)).toBeNull();
    expect(M.resolveOutreachStage('made_up')).toBeNull();
  });
});

/* ───────────── guard order ───────────── */

describe('firstBlock guard order', () => {
  it('checks phone, then do-not-contact, then the test list, then role', () => {
    const all = guard({ customer: { phone: null, currentStage: 'lost' }, dnc: true, allowlisted: false, role: 'analyst' });
    expect(M.firstBlock('whatsapp', all, null)).toBe('no_phone');
    expect(M.firstBlock('whatsapp', { ...all, customer: { phone: '9876543210', currentStage: 'lost' } }, null)).toBe('do_not_contact');
    expect(M.firstBlock('whatsapp', { ...all, customer: { phone: '9876543210', currentStage: 'kyc_started' }, dnc: false }, null)).toBe('not_on_test_allowlist');
    expect(M.firstBlock('whatsapp', { ...all, customer: { phone: '9876543210', currentStage: 'kyc_started' }, dnc: false, allowlisted: true }, null)).toBe('forbidden');
  });

  it('puts the message check before calling hours, hours before repeat, repeat before the daily cap', () => {
    const busy = guard({ inWindow: false, recent: { lastSentAt: minsAgo(5), lastSentBy: null, sentToday: 3 } });
    expect(M.firstBlock('whatsapp', busy, 'no_template')).toBe('no_template');
    expect(M.firstBlock('whatsapp', busy, null)).toBe('outside_calling_hours');
    expect(M.firstBlock('whatsapp', busy, null, { overrideHours: true })).toBe('forbidden_override');
    expect(M.firstBlock('whatsapp', { ...busy, role: 'super_admin' }, null, { overrideHours: true })).toBe('recently_sent');
    expect(M.firstBlock('whatsapp', { ...busy, role: 'super_admin' }, null, { overrideHours: true, confirmRepeat: true })).toBe('daily_limit');
  });

  it('refuses a do-not-contact customer for a super admin, even with every override', () => {
    const g = guard({ role: 'super_admin', dnc: true });
    expect(M.firstBlock('whatsapp', g, null, { confirmRepeat: true, overrideHours: true })).toBe('do_not_contact');
  });

  it('refuses a number off the test list for a super admin, even with every override', () => {
    const g = guard({ role: 'super_admin', allowlisted: false });
    expect(M.firstBlock('sms', g, null, { confirmRepeat: true, overrideHours: true })).toBe('not_on_test_allowlist');
  });

  it('allows a normal send', () => {
    expect(M.firstBlock('whatsapp', guard(), null)).toBeNull();
  });
});

/* ───────────── plans ───────────── */

describe('planWhatsApp', () => {
  it('is available and previews the template with the values buildPlaceholders gives', () => {
    const plan = M.planWhatsApp(waInput());
    expect(plan.available).toBe(true);
    expect(plan.preview).toEqual({
      kind: 'whatsapp', template: 'finish_kyc', language: 'en',
      values: buildPlaceholders(['{name}', '{ref}'], { name: 'Asha', ref: 'SL-1001' }),
    });
    expect(plan.preview).toMatchObject({ values: ['Asha', 'SL-1001'] });
  });

  it('says there is no message for a stage with no template', () => {
    const plan = M.planWhatsApp(waInput({ stageKey: 'offer_viewed' }));
    expect(plan).toMatchObject({ available: false, code: 'no_template', reason: 'No message is set up for this stage. Add one in Stage outreach.' });
    expect(M.planWhatsApp(waInput({ stageKey: null })).code).toBe('no_template');
  });

  it('says WhatsApp is not connected when there is no gateway', () => {
    expect(M.planWhatsApp(waInput({ cfg: null }))).toMatchObject({ available: false, code: 'not_configured', reason: 'WhatsApp is not connected' });
  });

  it('says there is no phone number', () => {
    expect(M.planWhatsApp(waInput({ customer: { phone: null } }))).toMatchObject({ available: false, code: 'no_phone', reason: 'No phone number on file' });
  });

  it('says the customer is missing a detail when a value cannot be filled', () => {
    const plan = M.planWhatsApp(waInput({ vars: { name: 'Asha' } }));
    expect(plan).toMatchObject({ available: false, code: 'missing_value', reason: 'This customer is missing a detail the message needs' });
  });

  it('refuses do-not-contact, the test list and a role that cannot message, with their reasons', () => {
    expect(M.planWhatsApp(waInput({ dnc: true })).reason).toBe('This customer asked not to be contacted');
    expect(M.planWhatsApp(waInput({ allowlisted: false })).reason).toBe('This number is not on the test list');
    expect(M.planWhatsApp(waInput({ role: 'analyst' })).reason).toBe('Needs an admin or super admin');
  });

  it('stays available but flags a repeat within 24 hours', () => {
    const plan = M.planWhatsApp(waInput({ recent: { lastSentAt: minsAgo(12), lastSentBy: 'Priya', sentToday: 1 } }));
    expect(plan).toMatchObject({
      available: true, recentlySent: true, code: 'recently_sent',
      reason: 'A WhatsApp for this stage was already sent 12 minutes ago.', lastSentBy: 'Priya', sentToday: 1,
    });
  });

  it('is not a repeat once 24 hours have passed', () => {
    const plan = M.planWhatsApp(waInput({ recent: { lastSentAt: minsAgo(25 * 60), lastSentBy: null, sentToday: 0 } }));
    expect(plan).toMatchObject({ available: true, recentlySent: false, code: null });
  });

  it('turns the button off at the daily cap, even for a super admin', () => {
    const recent = { lastSentAt: minsAgo(5), lastSentBy: 'Priya', sentToday: 3 };
    for (const role of ['admin', 'super_admin']) {
      expect(M.planWhatsApp(waInput({ recent, role }))).toMatchObject({ available: false, code: 'daily_limit' });
    }
    expect(M.planWhatsApp(waInput({ recent })).reason).toBe('The limit of 3 manual WhatsApp sends in 24 hours has been reached for this customer');
  });

  it('outside calling hours: off for an admin, on with a warning for a super admin', () => {
    expect(M.planWhatsApp(waInput({ inWindow: false }))).toMatchObject({
      available: false, code: 'outside_calling_hours', reason: 'It is outside calling hours. Only a super admin can send now.',
    });
    expect(M.planWhatsApp(waInput({ inWindow: false, role: 'super_admin' }))).toMatchObject({
      available: true, code: 'outside_calling_hours', reason: 'It is outside calling hours. As a super admin you can send anyway.',
    });
  });

  it('shows the app link placeholder text in a preview and never creates a link', () => {
    const plan = M.planWhatsApp(waInput({
      stageKey: 'app_installed', customer: { currentStage: 'app_installed' },
      vars: { name: 'Asha', appLink: '(link created when sent)' },
    }));
    expect(plan.preview).toMatchObject({ values: ['Asha', '(link created when sent)'] });
    expect(installMock.mint).not.toHaveBeenCalled();
  });
});

describe('buildManualVars', () => {
  it('uses the first name, the latest reference, the offer count and the preview app link', async () => {
    const vars = await M.buildManualVars({ name: 'Asha Verma', userId: 'user-1' }, 'https://site.example.test');
    expect(vars).toEqual({
      name: 'Asha', siteUrl: 'https://site.example.test', appLink: '(link created when sent)', ref: 'SL-1001', offerCount: 3,
    });
    expect(installMock.mint).not.toHaveBeenCalled();
  });

  it('falls back to "there" and leaves out ref when the customer has no account', async () => {
    const vars = await M.buildManualVars({ name: null, userId: null }, '');
    expect(vars.name).toBe('there');
    expect(vars.ref).toBeUndefined();
  });
});

describe('planSms', () => {
  const input = (over: Record<string, any> = {}) => ({
    ...guard(over), stageKey: 'kyc_started', settings: smsSettings,
    ...(over.settings !== undefined ? { settings: over.settings } : {}),
    ...(over.stageKey !== undefined ? { stageKey: over.stageKey } : {}),
  });

  it('previews exactly the body configured for the stage', () => {
    expect(M.planSms(input()).preview).toEqual({ kind: 'sms', text: 'Finish your KYC today', templateId: 'T-KYC' });
  });

  it('falls back to the default text for a stage with no override', () => {
    expect(M.planSms(input({ stageKey: 'offer_viewed' })).preview).toEqual({ kind: 'sms', text: 'Default text', templateId: 'T-DEFAULT' });
  });

  it('says SMS is not connected, or that no text is set up', () => {
    expect(M.planSms(input({ settings: null }))).toMatchObject({ available: false, code: 'not_configured', reason: 'SMS is not connected' });
    expect(M.planSms(input({ settings: {} }))).toMatchObject({ available: false, code: 'no_template', reason: 'No message is set up for this stage. Add one in Stage outreach.' });
    expect(M.planSms(input({ stageKey: null })).code).toBe('no_template');
  });

  it('flags a repeat inside 24 hours', () => {
    expect(M.planSms(input({ recent: { lastSentAt: minsAgo(60), lastSentBy: null, sentToday: 1 } }))).toMatchObject({ available: true, recentlySent: true, code: 'recently_sent' });
  });
});

describe('planPush', () => {
  const input = (over: Record<string, any> = {}) => ({
    ...guard(over),
    customer: { phone: '9876543210', currentStage: 'kyc_started', userId: 'user-1', ...(over.customer ?? {}) },
    eventName: 'kyc_nudge',
  });

  it('describes the stage event', () => {
    const plan = M.planPush(input());
    expect(plan.available).toBe(true);
    expect(plan.preview).toMatchObject({ kind: 'push', eventName: 'kyc_nudge' });
    expect((plan.preview as any).summary).toContain('KYC started');
  });

  it('cannot be delivered to a customer who is not signed in to the app', () => {
    expect(M.planPush(input({ customer: { userId: null } }))).toMatchObject({
      available: false, code: 'not_signed_in',
      reason: 'The customer is not signed in to the app, so a push cannot be delivered',
    });
  });

  it('is not sent at the end of the journey', () => {
    for (const s of ['disbursed', 'rejected']) {
      expect(M.planPush(input({ customer: { currentStage: s } })).code).toBe('not_available_for_stage');
    }
    // A customer who is lost is do-not-contact, which is checked first.
    expect(M.planPush(input({ customer: { currentStage: 'lost' }, dnc: true })).code).toBe('do_not_contact');
  });

  it('uses a two hour repeat window, not 24', () => {
    expect(M.planPush(input({ recent: { lastSentAt: minsAgo(90), lastSentBy: null, sentToday: 1 } })).recentlySent).toBe(true);
    expect(M.planPush(input({ recent: { lastSentAt: minsAgo(150), lastSentBy: null, sentToday: 1 } })).recentlySent).toBe(false);
  });
});

describe('summariseRecent', () => {
  const row = (over: Record<string, any>) => ({ kind: 'whatsapp_template', channel: 'whatsapp', status: 'sent', createdAt: minsAgo(30), sentAt: minsAgo(30), payload: {}, ...over });

  it('finds the last send, who sent it, and counts only manual sends from the last 24 hours', () => {
    const r = M.summariseRecent([
      row({ createdAt: minsAgo(10), sentAt: minsAgo(10), payload: { source: 'admin', sentBy: { id: 'adm-1' } } }),
      row({ createdAt: minsAgo(300), sentAt: minsAgo(300), payload: { source: 'admin', sentBy: { id: 'adm-1' } } }),
      row({ createdAt: minsAgo(40 * 60), sentAt: minsAgo(40 * 60), payload: { source: 'admin', sentBy: { id: 'adm-1' } } }),
      row({ createdAt: minsAgo(500), sentAt: minsAgo(500), payload: { rule: 'stall' } }),
    ], NOW, { 'adm-1': 'Priya' });
    expect(r.whatsapp.sentToday).toBe(2);
    expect(r.whatsapp.lastSentAt).toEqual(minsAgo(10));
    expect(r.whatsapp.lastSentBy).toBe('Priya');
  });

  it('counts an automatic send as the last send but not toward the manual cap', () => {
    const r = M.summariseRecent([row({ createdAt: minsAgo(5), sentAt: minsAgo(5), payload: { rule: 'stall' } })], NOW);
    expect(r.whatsapp).toMatchObject({ sentToday: 0, lastSentBy: null });
    expect(r.whatsapp.lastSentAt).toEqual(minsAgo(5));
  });

  it('keeps channels apart and ignores failed rows and other kinds', () => {
    const r = M.summariseRecent([
      row({ kind: 'sms_template', channel: 'sms' }),
      row({ kind: 'upshot_event', channel: 'push', status: 'pending', sentAt: null }),
      row({ status: 'failed' }),
      row({ kind: 'upshot_event', channel: 'whatsapp' }),
      row({ kind: 'install_link', channel: 'whatsapp' }),
    ], NOW);
    expect(r.whatsapp.lastSentAt).toBeNull();
    expect(r.sms.lastSentAt).not.toBeNull();
    expect(r.push.lastSentAt).not.toBeNull();
  });
});

/* ───────────── sending ───────────── */

describe('sendManualWhatsApp', () => {
  it('claims the OutboundRequest before it calls the provider, and passes the admin track', async () => {
    const out = await M.sendManualWhatsApp(customer, admin, {}, NOW);
    expect(out.ok).toBe(true);
    expect(h.calls.indexOf('create:whatsapp_template')).toBeGreaterThanOrEqual(0);
    expect(h.calls.indexOf('create:whatsapp_template')).toBeLessThan(h.calls.indexOf('provider:wa'));
    const arg = wa.send.mock.calls[0][0];
    expect(arg).toMatchObject({ phone: '9876543210', templateName: 'finish_kyc', language: 'en', placeholders: ['Asha', 'SL-1001'], track: { kind: 'admin', customerId: 'cust-1' } });
    const claim = (prismaMock.outboundRequest.create.mock.calls as any)[0][0].data;
    expect(claim).toMatchObject({ kind: 'whatsapp_template', channel: 'whatsapp', status: 'pending' });
    expect(claim.payload).toMatchObject({ source: 'admin', sentBy: { id: 'adm-1', email: 'priya@example.test' }, stageKey: 'kyc_started', template: 'finish_kyc', channel: 'whatsapp' });
    expect(claim.idempotencyKey).toMatch(/^admin_wa:cust-1:kyc_started:\d+$/);
  });

  it('on success: marks the row sent, sets lastNudgedAt and records NUDGE_SENT from the admin', async () => {
    const out = await M.sendManualWhatsApp(customer, admin, {}, NOW);
    expect(out).toMatchObject({ ok: true, data: { channel: 'whatsapp', status: 'sent', messageId: 'wamid-1', sentAt: NOW.toISOString() } });
    expect((prismaMock.outboundRequest.update.mock.calls as any)[0][0].data).toMatchObject({ status: 'sent', attempts: 1, providerRef: 'wamid-1' });
    expect(prismaMock.customer.update).toHaveBeenCalledWith({ where: { id: 'cust-1' }, data: { lastNudgedAt: NOW } });
    expect(journeyMock.recordJourneyEvent).toHaveBeenCalledWith('cust-1', expect.objectContaining({
      name: JOURNEY_EVENTS.NUDGE_SENT,
      metadata: expect.objectContaining({ via: 'whatsapp', template: 'finish_kyc', source: 'admin', sentBy: { id: 'adm-1', email: 'priya@example.test' } }),
    }));
  });

  it('on a provider failure: records failed, does not throw, does not retry and does not set lastNudgedAt', async () => {
    wa.send.mockImplementation(async () => { h.calls.push('provider:wa'); return { ok: false, status: 400, error: 'Template not approved' }; });
    const out = await M.sendManualWhatsApp(customer, admin, {}, NOW);
    expect(out).toMatchObject({ ok: false, status: 502, code: 'send_failed' });
    expect((out as any).message).toContain('Template not approved');
    expect(wa.send).toHaveBeenCalledTimes(1);
    expect((prismaMock.outboundRequest.update.mock.calls as any)[0][0].data).toMatchObject({ status: 'failed', lastError: 'Template not approved' });
    expect(prismaMock.customer.update).not.toHaveBeenCalled();
    expect(journeyMock.recordJourneyEvent).not.toHaveBeenCalled();
  });

  it('refuses a do-not-contact customer for a super admin, even with confirmRepeat and overrideHours, and sends nothing', async () => {
    h.dnc.add('cust-1');
    const out = await M.sendManualWhatsApp(customer, superAdmin, { confirmRepeat: true, overrideHours: true }, NOW);
    expect(out).toMatchObject({ ok: false, status: 403, code: 'do_not_contact' });
    expect(prismaMock.outboundRequest.create).not.toHaveBeenCalled();
    expect(wa.send).not.toHaveBeenCalled();
  });

  it('refuses a number that is off the test list, even for a super admin', async () => {
    h.notOnTestList = true;
    const out = await M.sendManualWhatsApp(customer, superAdmin, { confirmRepeat: true, overrideHours: true }, NOW);
    expect(out).toMatchObject({ ok: false, status: 403, code: 'not_on_test_allowlist' });
    expect(wa.send).not.toHaveBeenCalled();
    h.notOnTestList = false;
    h.allowlisted = false;
    expect(await M.sendManualWhatsApp(customer, superAdmin, {}, NOW)).toMatchObject({ code: 'not_on_test_allowlist' });
  });

  it('refuses an analyst, and an admin who asks to override the hours', async () => {
    expect(await M.sendManualWhatsApp(customer, { ...admin, role: 'analyst' }, {}, NOW)).toMatchObject({ ok: false, status: 403, code: 'forbidden' });
    expect(await M.sendManualWhatsApp(customer, admin, { overrideHours: true }, NOW)).toMatchObject({ ok: false, status: 403, code: 'forbidden_override' });
    expect(wa.send).not.toHaveBeenCalled();
  });

  it('refuses outside calling hours, but lets a super admin override', async () => {
    h.inWindow = false;
    expect(await M.sendManualWhatsApp(customer, admin, {}, NOW)).toMatchObject({ ok: false, status: 409, code: 'outside_calling_hours' });
    expect(wa.send).not.toHaveBeenCalled();
    expect((await M.sendManualWhatsApp(customer, superAdmin, { overrideHours: true }, NOW)).ok).toBe(true);
  });

  it('asks for confirmation on a repeat inside 24 hours, then sends once confirmed', async () => {
    h.rows = [{ kind: 'whatsapp_template', channel: 'whatsapp', status: 'sent', createdAt: minsAgo(12), sentAt: minsAgo(12), payload: { source: 'admin', sentBy: { id: 'adm-1' } } }];
    const first = await M.sendManualWhatsApp(customer, admin, {}, NOW);
    expect(first).toMatchObject({ ok: false, status: 409, code: 'recently_sent', extra: { lastSentAt: minsAgo(12).toISOString() } });
    expect(wa.send).not.toHaveBeenCalled();
    const second = await M.sendManualWhatsApp(customer, admin, { confirmRepeat: true }, NOW);
    expect(second.ok).toBe(true);
  });

  it('stops at three manual sends in 24 hours even when confirmed', async () => {
    h.rows = [1, 2, 3].map((n) => ({ kind: 'whatsapp_template', channel: 'whatsapp', status: 'sent', createdAt: minsAgo(n * 100), sentAt: minsAgo(n * 100), payload: { source: 'admin', sentBy: { id: 'adm-1' } } }));
    const out = await M.sendManualWhatsApp(customer, admin, { confirmRepeat: true }, NOW);
    expect(out).toMatchObject({ ok: false, status: 409, code: 'daily_limit' });
    expect(wa.send).not.toHaveBeenCalled();
  });

  it('answers recently_sent when the same send was claimed in the last ten minutes', async () => {
    h.claimError = new Error('unique');
    h.existingClaim = { id: 'x', status: 'sent' };
    const out = await M.sendManualWhatsApp(customer, admin, { confirmRepeat: true }, NOW);
    expect(out).toMatchObject({ ok: false, status: 409, code: 'recently_sent' });
    expect(wa.send).not.toHaveBeenCalled();
  });

  it('takes back a claim that failed earlier, so the admin can try again', async () => {
    h.claimError = new Error('unique');
    h.existingClaim = { id: 'old-claim', status: 'failed' };
    const out = await M.sendManualWhatsApp(customer, admin, {}, NOW);
    expect(out.ok).toBe(true);
    expect(wa.send.mock.calls[0][0].referenceId).toBe('old-claim');
    h.retakeCount = 0;
    expect(await M.sendManualWhatsApp(customer, admin, {}, NOW)).toMatchObject({ ok: false, code: 'recently_sent' });
  });

  it('reports a missing gateway or template without claiming anything', async () => {
    h.waConfig = null;
    expect(await M.sendManualWhatsApp(customer, admin, {}, NOW)).toMatchObject({ ok: false, status: 400, code: 'not_configured' });
    h.waConfig = waConfig;
    expect(await M.sendManualWhatsApp({ ...customer, currentStage: 'offers_viewed' }, admin, {}, NOW)).toMatchObject({ ok: false, status: 400, code: 'no_template' });
    expect(prismaMock.outboundRequest.create).not.toHaveBeenCalled();
  });

  describe('the app link', () => {
    const installed = { ...customer, currentStage: 'app_installed' };

    it('is created at send time, after the claim, and goes into the template values', async () => {
      const out = await M.sendManualWhatsApp(installed, admin, {}, NOW);
      expect(out).toMatchObject({ ok: true, data: { installLink: 'https://dl.example.test/dl?ref=ABCD2345' } });
      expect(h.calls.indexOf('create:whatsapp_template')).toBeLessThan(h.calls.indexOf('mint'));
      expect(h.calls.indexOf('mint')).toBeLessThan(h.calls.indexOf('provider:wa'));
      expect(wa.send.mock.calls[0][0].placeholders).toEqual(['Asha', 'https://dl.example.test/dl?ref=ABCD2345']);
      expect(installMock.mint).toHaveBeenCalledWith(expect.objectContaining({
        stage: 'app_installed', channel: 'whatsapp', admin: { id: 'adm-1', email: 'priya@example.test' }, amountRupees: 300000, product: 'personal',
      }));
    });

    it('is not created for a template that does not use it', async () => {
      await M.sendManualWhatsApp(customer, admin, {}, NOW);
      expect(installMock.mint).not.toHaveBeenCalled();
    });

    it('is cancelled when the message then fails to send', async () => {
      wa.send.mockImplementation(async () => ({ ok: false, status: 500, error: 'boom' }));
      const out = await M.sendManualWhatsApp(installed, admin, {}, NOW);
      expect(out.ok).toBe(false);
      expect(installMock.cancel).toHaveBeenCalledWith('link-1');
    });

    it('stops with the claim marked failed when the link cannot be created', async () => {
      installMock.mint.mockImplementation(async () => { throw new Error('Could not create the app link'); });
      const out = await M.sendManualWhatsApp(installed, admin, {}, NOW);
      expect(out).toMatchObject({ ok: false, status: 502, code: 'send_failed' });
      expect(wa.send).not.toHaveBeenCalled();
      expect((prismaMock.outboundRequest.update.mock.calls as any)[0][0].data.status).toBe('failed');
    });
  });
});

describe('sendManualSms', () => {
  it('claims before it calls the gateway, and sends the configured body and template id', async () => {
    const out = await M.sendManualSms(customer, admin, {}, NOW);
    expect(out).toMatchObject({ ok: true, data: { channel: 'sms', status: 'sent', messageId: 'sms-1' } });
    expect(h.calls.indexOf('create:sms_template')).toBeLessThan(h.calls.indexOf('provider:sms'));
    expect(sms.send.mock.calls[0][0]).toMatchObject({ phone: '9876543210', body: 'Finish your KYC today', templateId: 'T-KYC', track: { kind: 'admin', customerId: 'cust-1' } });
    expect((prismaMock.outboundRequest.create.mock.calls as any)[0][0].data.payload).toMatchObject({ source: 'admin', sentBy: { id: 'adm-1' }, templateId: 'T-KYC', channel: 'sms' });
    expect(journeyMock.recordJourneyEvent).toHaveBeenCalledWith('cust-1', expect.objectContaining({ metadata: expect.objectContaining({ via: 'sms', source: 'admin' }) }));
  });

  it('records a gateway failure, does not retry and does not set lastNudgedAt', async () => {
    sms.send.mockImplementation(async () => { h.calls.push('provider:sms'); return { ok: false, status: 200, error: 'Invalid template' }; });
    const out = await M.sendManualSms(customer, admin, {}, NOW);
    expect(out).toMatchObject({ ok: false, status: 502, code: 'send_failed' });
    expect(sms.send).toHaveBeenCalledTimes(1);
    expect((prismaMock.outboundRequest.update.mock.calls as any)[0][0].data.status).toBe('failed');
    expect(prismaMock.customer.update).not.toHaveBeenCalled();
  });

  it('refuses a do-not-contact customer without claiming or sending', async () => {
    h.dnc.add('cust-1');
    expect(await M.sendManualSms(customer, superAdmin, { confirmRepeat: true }, NOW)).toMatchObject({ ok: false, code: 'do_not_contact' });
    expect(prismaMock.outboundRequest.create).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });
});

describe('sendManualPush', () => {
  it('queues the stage event, tags it as an admin send and answers queued', async () => {
    const out = await M.sendManualPush(customer, admin, {}, NOW);
    expect(out).toMatchObject({ ok: true, data: { channel: 'push', status: 'queued', outboundRequestId: 'ev-1', messageId: null, sentAt: null } });
    expect(dispatchMock.nudge).toHaveBeenCalledWith(customer, 'kyc_started');
    expect((prismaMock.outboundRequest.update.mock.calls as any)[0][0].data.payload).toMatchObject({ eventName: 'kyc_nudge', source: 'admin', sentBy: { id: 'adm-1' } });
    expect(prismaMock.customer.update).toHaveBeenCalledWith({ where: { id: 'cust-1' }, data: { lastNudgedAt: NOW } });
  });

  it('refuses when push is switched off on this server, and queues nothing', async () => {
    h.nudgesOff = true;
    expect(M.planPush({ ...guard(), customer: { phone: '9876543210', currentStage: 'kyc_started', userId: 'user-1' }, eventName: 'kyc_nudge' }))
      .toMatchObject({ available: false, code: 'nudges_disabled', reason: 'Push is switched off on this server' });
    expect(await M.sendManualPush(customer, admin, {}, NOW)).toMatchObject({ ok: false, status: 409, code: 'nudges_disabled', message: 'Push is switched off on this server' });
    expect(await M.sendManualPush(customer, superAdmin, { confirmRepeat: true, overrideHours: true }, NOW)).toMatchObject({ ok: false, code: 'nudges_disabled' });
    expect(dispatchMock.nudge).not.toHaveBeenCalled();
  });

  it('refuses a customer who is not signed in to the app', async () => {
    expect(await M.sendManualPush({ ...customer, userId: null }, admin, {}, NOW)).toMatchObject({ ok: false, status: 400, code: 'not_signed_in' });
    expect(dispatchMock.nudge).not.toHaveBeenCalled();
  });

  it('asks before a second push inside two hours', async () => {
    h.rows = [{ kind: 'upshot_event', channel: 'push', status: 'sent', createdAt: minsAgo(30), sentAt: minsAgo(30), payload: {} }];
    expect(await M.sendManualPush(customer, admin, {}, NOW)).toMatchObject({ ok: false, status: 409, code: 'recently_sent' });
    expect((await M.sendManualPush(customer, admin, { confirmRepeat: true }, NOW)).ok).toBe(true);
  });

  it('refuses a do-not-contact customer', async () => {
    h.dnc.add('cust-1');
    expect(await M.sendManualPush(customer, superAdmin, { confirmRepeat: true, overrideHours: true }, NOW)).toMatchObject({ ok: false, code: 'do_not_contact' });
    expect(dispatchMock.nudge).not.toHaveBeenCalled();
  });
});

describe('agoText', () => {
  it('reads in plain English', () => {
    expect(M.agoText(minsAgo(0), NOW)).toBe('just now');
    expect(M.agoText(minsAgo(1), NOW)).toBe('1 minute ago');
    expect(M.agoText(minsAgo(12), NOW)).toBe('12 minutes ago');
    expect(M.agoText(minsAgo(120), NOW)).toBe('2 hours ago');
    expect(M.agoText(minsAgo(3 * 24 * 60), NOW)).toBe('3 days ago');
  });
});
