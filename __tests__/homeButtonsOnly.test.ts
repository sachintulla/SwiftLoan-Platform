// Home sends the agent the available buttons only: no screen text, no prior inquiries, and
// text-only changes (counters, hero headline) are not worth a new context send.
import { agent } from '../src/voice';
import { publishScreenGraph, getScreenTexts, buildPageContext, BUTTONS_ONLY_SCREENS } from '../src/voice/actionRegistry';

const btn = (id: string, label: string) => ({ id, kind: 'button' as const, label, onTap: () => undefined });

describe('buttons-only screens', () => {
  it('home is buttons-only; other screens keep their text', () => {
    expect(BUTTONS_ONLY_SCREENS.has('home')).toBe(true);
    expect(BUTTONS_ONLY_SCREENS.has('profile')).toBe(false);
  });

  it('drops the screen text on home but keeps it elsewhere', () => {
    publishScreenGraph('home', [btn('b1', 'My Offers')], ['Hero headline', '15+ partners']);
    publishScreenGraph('profile', [btn('p1', 'Edit')], ['Your profile']);
    expect(getScreenTexts('home')).toEqual([]);
    expect(getScreenTexts('profile')).toEqual(['Your profile']);
  });

  it('home context lists buttons and no screen_overview', () => {
    publishScreenGraph('home', [btn('b1', 'My Offers'), btn('b2', 'Profile')], ['Anything']);
    const ctx = buildPageContext('home') as any;
    expect(ctx.screen_overview).toBeUndefined();
    expect(ctx.available_actions.map((a: any) => a.label)).toEqual(expect.arrayContaining(['My Offers', 'Profile']));
  });

  it('a text-only change on home is not a change worth sending', () => {
    publishScreenGraph('home', [btn('b1', 'My Offers')], ['0+ partners']);
    expect(publishScreenGraph('home', [btn('b1', 'My Offers')], ['15+ partners'])).toBe(false);
  });
});

describe('home: later button changes do not send another update', () => {
  const sent: any[] = [];
  const ctxFor = (page: string, labels: string[]) => ({
    page,
    available_actions: labels.map(label => ({ kind: 'button', label })),
  });
  let current = ctxFor('home', ['Apply for a loan']);
  beforeAll(() => {
    if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = { OPEN: 1, CLOSED: 3 };
  });
  beforeEach(() => {
    sent.length = 0;
    (agent as any).socket = { readyState: 1, send: (m: any) => sent.push(m), close: jest.fn() };
    (agent as any).status = 'listening';
    (agent as any).lastSentPerScreen = new Map();
    (agent as any).lastSentPage = null;
    (agent as any).pageContextFn = () => current;
  });
  afterEach(() => {
    (agent as any).socket = null;
    (agent as any).pageContextFn = null;
  });
  const flush = (urgent = false) => (agent as any).flushPageContext(urgent);

  it('sends the first update, then skips a button-only change on the same screen', () => {
    current = ctxFor('home', ['Apply for a loan']);
    flush(true); // login: urgent
    current = ctxFor('home', ['View Best Offers', 'Change amount', 'IDFC', 'Prefr']); // data loaded
    flush(false);
    expect(sent).toHaveLength(1);
  });

  it('still sends when the user arrives on home from another screen', () => {
    current = ctxFor('loans', ['Back']);
    flush(false);
    current = ctxFor('home', ['My Offers']);
    flush(false);
    expect(sent).toHaveLength(2);
  });

  it('an urgent update on home still goes through', () => {
    current = ctxFor('home', ['Apply for a loan']);
    flush(true);
    current = ctxFor('home', ['View Best Offers']);
    flush(true);
    expect(sent).toHaveLength(2);
  });

  it('other screens are not affected (a changed profile screen still sends)', () => {
    current = ctxFor('profile', ['Edit']);
    flush(false);
    current = ctxFor('profile', ['Edit', 'Save']);
    flush(false);
    expect(sent).toHaveLength(2);
  });
});
