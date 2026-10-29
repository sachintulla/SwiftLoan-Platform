import {
  extractLinkTarget,
  parseLinkUrl,
  resolveLinkTarget,
  parseInboxResponse,
  LINKABLE_SCREENS,
} from '../src/analytics/upshotLinks';
import { resolveScreenName, SCREEN_NAMES } from '../src/state/store';

describe('extractLinkTarget', () => {
  it('reads flat key-value pairs', () => {
    expect(extractLinkTarget({ screen: 'offers', deeplink: 'swiftloan://offers', event: 'offers_got' })).toEqual({
      screen: 'offers',
      url: 'swiftloan://offers',
      kv: { event: 'offers_got' },
    });
  });

  it('finds the pairs however deeply the SDK nests them, including JSON inside strings', () => {
    const payload = { payload: JSON.stringify({ bk: { kv: JSON.stringify({ screen: 'repay', campaign: 'diwali' }) } }) };
    expect(extractLinkTarget(payload)).toEqual({ screen: 'repay', kv: { campaign: 'diwali' } });
  });

  it('reads Upshot-style [{ key, value }] lists', () => {
    const payload = [{ key: 'screen', value: 'loans' }, { key: 'event', value: 'swiftloan_kyc_incomplete' }];
    expect(extractLinkTarget(payload)).toEqual({ screen: 'loans', kv: { event: 'swiftloan_kyc_incomplete' } });
  });

  it('accepts a deeplink-only payload and ignores non-swiftloan URLs', () => {
    expect(extractLinkTarget({ deepLink: 'swiftloan://status' })?.url).toBe('swiftloan://status');
    expect(extractLinkTarget({ deeplink: 'https://evil.example/x' })).toBeNull();
  });

  it('returns null when there is nothing to open', () => {
    expect(extractLinkTarget(null)).toBeNull();
    expect(extractLinkTarget('not json')).toBeNull();
    expect(extractLinkTarget({ title: 'Hello', body: 'World' })).toBeNull();
  });
});

describe('parseLinkUrl', () => {
  it('splits the screen and the query', () => {
    expect(parseLinkUrl('swiftloan://offers?ref=abc&x=1%202')).toEqual({ name: 'offers', query: { ref: 'abc', x: '1 2' } });
  });
  it('ignores other schemes and the lead handoff', () => {
    expect(parseLinkUrl('https://www.swiftloan.ai/offers')).toBeNull();
    expect(parseLinkUrl('swiftloan://onboard?token=abc')).toBeNull();
    expect(parseLinkUrl('swiftloan://')).toBeNull();
  });
});

describe('resolveLinkTarget', () => {
  const resolve = (n: string) => resolveScreenName(n);

  it('resolves screen aliases through the app\'s own resolver ("offers" is My Offers)', () => {
    expect(resolveLinkTarget({ screen: 'offers', kv: {} }, resolve)).toEqual({ screen: 'fare', requiresAuth: true });
  });

  it('falls back to the deep link when there is no screen key', () => {
    expect(resolveLinkTarget({ url: 'swiftloan://repay', kv: {} }, resolve)).toEqual({ screen: 'repay', requiresAuth: true });
  });

  it('lets signed-out visitors reach only the public screens', () => {
    expect(resolveLinkTarget({ screen: 'calculator', kv: {} }, resolve)?.requiresAuth).toBe(false);
    expect(resolveLinkTarget({ screen: 'mobile', kv: {} }, resolve)?.requiresAuth).toBe(false);
    expect(resolveLinkTarget({ screen: 'loans', kv: {} }, resolve)?.requiresAuth).toBe(true);
  });

  it('refuses unknown names and screens that need state', () => {
    expect(resolveLinkTarget({ screen: 'nope', kv: {} }, resolve)).toBeNull();
    expect(resolveLinkTarget({ screen: 'lenderweb', kv: {} }, resolve)).toBeNull();
    expect(resolveLinkTarget({ screen: 'splash', kv: {} }, resolve)).toBeNull();
    expect(resolveLinkTarget(null, resolve)).toBeNull();
  });

  it('every linkable screen is a real screen id', () => {
    for (const s of LINKABLE_SCREENS) expect((SCREEN_NAMES as readonly string[]).includes(s)).toBe(true);
  });
});

describe('parseInboxResponse', () => {
  const response = {
    statusCode: 200,
    pageId: 1,
    status: 'success',
    data: [
      { id: 'n1', msg_id: 'm1', title: 'Offers ready', message: 'You have 4 offers', read: 0, appData: { screen: 'offers' } },
      { id: 'n2', title: '', etitle: 'Reminder', message: '', emsg: 'Your EMI is due', read: '1', appData: JSON.stringify([{ key: 'deeplink', value: 'swiftloan://repay' }]), image_url: 'https://x/y.png' },
      { id: 'n3', title: '', message: '' },
    ],
  };

  it('parses a JSON string or an object', () => {
    expect(parseInboxResponse(JSON.stringify(response))).toHaveLength(2);
    expect(parseInboxResponse(response)).toHaveLength(2);
  });

  it('maps fields, read flags and link targets', () => {
    const [a, b] = parseInboxResponse(response);
    expect(a).toMatchObject({ id: 'n1', title: 'Offers ready', message: 'You have 4 offers', read: false, imageUrl: null });
    expect(a.target).toEqual({ screen: 'offers', kv: {} });
    expect(b).toMatchObject({ id: 'n2', title: 'Reminder', message: 'Your EMI is due', read: true, imageUrl: 'https://x/y.png' });
    expect(b.target?.url).toBe('swiftloan://repay');
  });

  it('survives garbage', () => {
    expect(parseInboxResponse(null)).toEqual([]);
    expect(parseInboxResponse('oops')).toEqual([]);
    expect(parseInboxResponse({ data: 'nope' })).toEqual([]);
  });
});
