import { missingRequiredDelta, normaliseContext, trimForSend, identityMap, compactOverview } from '../src/voice/pageContextDelta';

const screen = (over: any = {}, actions?: any[]) =>
  normaliseContext({
    page: 'basic',
    screen_title: 'Basic Details',
    missing_required_fields: ['salary mode', 'monthly income'],
    available_actions: actions ?? [
      { kind: 'field', label: 'Monthly income (₹)', value: '' },
      { kind: 'chips', label: 'Bank Transfer', group: 'Salary / income mode', selected: false },
      { kind: 'button', label: 'Continue' },
    ],
    ...over,
  });

describe('missingRequiredDelta', () => {
  it('sends only page + the list when a value was filled and the list shrank', () => {
    const prev = screen();
    const next = screen({ missing_required_fields: ['salary mode'] }, [
      { kind: 'field', label: 'Monthly income (₹)', value: '20000' },
      { kind: 'chips', label: 'Bank Transfer', group: 'Salary / income mode', selected: false },
      { kind: 'button', label: 'Continue' },
    ]);
    expect(missingRequiredDelta(prev, next)).toEqual({ page: 'basic', missing_required_fields: ['salary mode'] });
  });

  it('sends an empty list when the last mandatory field was filled', () => {
    const prev = screen({ missing_required_fields: ['salary mode'] });
    const next = screen({ missing_required_fields: [] }, [
      { kind: 'field', label: 'Monthly income (₹)', value: '' },
      { kind: 'chips', label: 'Bank Transfer', group: 'Salary / income mode', selected: true },
      { kind: 'button', label: 'Continue' },
    ]);
    expect(missingRequiredDelta(prev, next)).toEqual({ page: 'basic', missing_required_fields: [] });
  });

  it('is null when the list did not change (normal path decides)', () => {
    expect(missingRequiredDelta(screen(), screen())).toBeNull();
  });

  it('is null when anything else changed: a control appeared/was renamed', () => {
    const next = screen({ missing_required_fields: [] }, [
      { kind: 'field', label: 'Monthly income (₹)', value: '' },
      { kind: 'button', label: 'Starting…', enabled: false },
    ]);
    expect(missingRequiredDelta(screen(), next)).toBeNull();
  });

  it('is null when another top-level field changed (title, user name…)', () => {
    expect(missingRequiredDelta(screen(), screen({ missing_required_fields: [], user_name: 'X' }))).toBeNull();
  });

  it('is null for a different page, or when there is no baseline or no list', () => {
    expect(missingRequiredDelta(screen(), screen({ page: 'home', missing_required_fields: [] }))).toBeNull();
    expect(missingRequiredDelta(undefined, screen())).toBeNull();
    const noList = normaliseContext({ page: 'basic', available_actions: [] });
    expect(missingRequiredDelta(noList, noList)).toBeNull();
  });
});

describe('trimForSend', () => {
  const ctx = (over: any = {}) => ({
    page: 'basicpan',
    screen_title: 'PAN Verification',
    screen_overview: 'Verify your PAN · long page text',
    available_actions: [{ kind: 'button', label: 'Upload PAN photo' }],
    preferred_language: 'English',
    agent_language: 'Telugu',
    user_name: 'RALLABANDI',
    authenticated_phone: '9234223121',
    heard_intro_pitch: true,
    already_introduced: true,
    priorInquiries: [],
    account_summary: { has_history: true, has_active_loan: false },
    ...over,
  });

  it('drops the identity block once it has been sent, keeps the screen part', () => {
    const c = ctx();
    const { out } = trimForSend(c, c, identityMap(c));
    expect(out.page).toBe('basicpan');
    expect(out.screen_title).toBe('PAN Verification');
    expect(out.available_actions).toHaveLength(1);
    for (const k of ['preferred_language', 'agent_language', 'user_name', 'authenticated_phone', 'heard_intro_pitch', 'already_introduced', 'priorInquiries', 'account_summary']) {
      expect(out).not.toHaveProperty(k);
    }
  });

  it('sends the identity block the first time, and afterwards only the keys that changed', () => {
    const c = ctx();
    expect(trimForSend(c, c, null).out.authenticated_phone).toBe('9234223121');
    const known = identityMap(c);
    // e.g. login: the phone and account summary changed; the language did not and must not be repeated
    const changed = ctx({ account_summary: { has_history: true, has_active_loan: true }, authenticated_phone: '9000000001' });
    const r = trimForSend(changed, changed, known);
    expect(r.out.account_summary).toEqual({ has_history: true, has_active_loan: true });
    expect(r.out.authenticated_phone).toBe('9000000001');
    for (const k of ['preferred_language', 'agent_language', 'user_name', 'heard_intro_pitch', 'already_introduced']) {
      expect(r.out).not.toHaveProperty(k);
    }
    expect(r.identity.account_summary).not.toBe(known.account_summary);
    expect(r.identity.agent_language).toBe(known.agent_language);
  });

  it('a language change is sent on its own', () => {
    const c = ctx();
    const known = identityMap(c);
    const hi = ctx({ agent_language: 'Hindi' });
    const r = trimForSend(hi, hi, known);
    expect(r.out.agent_language).toBe('Hindi');
    expect(r.out).not.toHaveProperty('account_summary');
  });

  it('never sends an empty priorInquiries, and no page text on the PAN screen', () => {
    const c = ctx();
    const { out } = trimForSend(c, c, null);
    expect(out).not.toHaveProperty('priorInquiries');
    expect(out).not.toHaveProperty('screen_overview');
    const other = ctx({ page: 'offers' });
    expect(trimForSend(other, other, null).out.screen_overview).toBe('Verify your PAN · long page text');
  });

  it('leaves the small missing-fields update alone', () => {
    const c = ctx();
    const slim = { page: 'basic', missing_required_fields: [] };
    expect(trimForSend(slim, c, identityMap(c)).out).toEqual(slim);
  });
});

describe('compactOverview', () => {
  const profileText =
    'Account Settings · Manage your personal information. · U · Verified Member · Phone Number: +91 7854216495 · Date of Birth: Not set · English · Manage Data Partners · Log out · Profile · Home';

  it('drops segments that are just a control label, a tab label or the title', () => {
    const out = compactOverview(profileText, ['U', 'English', 'Manage Data Partners', 'Log out'], 'Profile');
    expect(out).toBe('Account Settings · Manage your personal information. · Verified Member · Phone Number: (phone on file) · Date of Birth: Not set');
  });

  it('masks Indian mobile numbers in any common format', () => {
    for (const n of ['+91 7854216495', '7854216495', '78542 16495', '+91-78542-16495', '917854216495']) {
      expect(compactOverview(`Phone: ${n}`, [], '')).toBe('Phone: (phone on file)');
    }
    expect(compactOverview('Loan amount ₹1,50,000 · Ref SL-928089', [], '')).toBe('Loan amount ₹1,50,000 · Ref SL-928089');
  });

  it('is undefined when nothing new is left', () => {
    expect(compactOverview('My Offers · Home', [], 'My Offers')).toBeUndefined();
    expect(compactOverview('', [], '')).toBeUndefined();
  });

  it('trimForSend applies it: the repeated page text goes, the news stays', () => {
    const ctx = {
      page: 'fare',
      screen_title: 'My Offers',
      screen_overview: 'My Offers · Your personalised loan offers · Apply for a loan',
      available_actions: [{ kind: 'button', label: 'Apply for a loan' }],
    };
    expect(trimForSend(ctx, ctx, null).out.screen_overview).toBe('Your personalised loan offers');
    const bare = { ...ctx, screen_overview: 'My Offers · Apply for a loan' };
    expect(trimForSend(bare, bare, null).out).not.toHaveProperty('screen_overview');
  });
});

describe('identityMap', () => {
  it('does not change when priorInquiries toggles between absent and an empty list (Home vs other screens)', () => {
    const home = { agent_language: 'Telugu', user_name: '', account_summary: { has_history: true } };
    const other = { ...home, priorInquiries: [] };
    expect(identityMap(home)).toEqual(identityMap(other));
    expect(identityMap({ ...other, priorInquiries: [{ id: 1 }] })).not.toEqual(identityMap(home));
  });
});
