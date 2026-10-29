/**
 * Pure helpers (no React Native imports, so they run under plain Jest) for two Upshot payloads:
 *
 *  - the NOTIFICATION INBOX list (`getNotificationList`), parsed into `InboxItem`s, and
 *  - a pushed notification's KEY-VALUE PAIRS / deep link, read from a push-tap payload or from an
 *    inbox item's `appData`.
 *
 * Upshot does not document where a campaign's key-value pairs land on a tap (the tap payload is a JSON
 * string whose nesting differs between Android's click bundle and the iOS callback), so the extractor
 * is deliberately tolerant: it walks any nesting, parses JSON-in-strings, and accepts `[{key, value}]`
 * lists. The contract it recognises is documented in docs/UPSHOT_DEEPLINKS.md:
 *
 *    screen   = a screen name (`offers`, `loans`, `repay`, …)        <- preferred
 *    deeplink = swiftloan://<screen>[?k=v]                           <- fallback
 *    event    = the Upshot event that triggered the campaign          <- reporting only
 */

export interface LinkTarget {
  /** Raw `screen` value, if present. */
  screen?: string;
  /** Raw `swiftloan://…` link, if present. */
  url?: string;
  /** Every other string key-value pair found beside it (e.g. `event`, `campaign`). */
  kv: Record<string, string>;
}

export interface InboxItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  imageUrl: string | null;
  /** Where tapping the item should go; null = just mark it read. */
  target: LinkTarget | null;
}

/** Screens a notification may open. Anything else (mid-flow screens that need state) is ignored. */
export const LINKABLE_SCREENS: ReadonlySet<string> = new Set([
  'home', 'loans', 'fare', 'compare', 'calculator', 'help', 'profile', 'referral',
  'basicpan', 'status', 'disbursed', 'repay', 'mobile', 'notifications',
]);

/** Linkable screens a signed-out visitor may open directly; every other target waits for login. */
export const PUBLIC_LINK_SCREENS: ReadonlySet<string> = new Set(['mobile', 'calculator', 'help']);

const norm = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const SCHEME = 'swiftloan://';

function maybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

/** Find the screen / deep link / key-value pairs anywhere inside `payload`. Null when there are none. */
export function extractLinkTarget(payload: unknown): LinkTarget | null {
  const kv: Record<string, string> = {};
  let screen: string | undefined;
  let url: string | undefined;

  const take = (key: string, value: unknown) => {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return;
    const v = String(value).trim();
    if (!v) return;
    const k = norm(key);
    if (k === 'screen' && !screen) screen = v;
    else if ((k === 'deeplink' || k === 'deeplinkurl' || k === 'link' || k === 'url') && !url && v.toLowerCase().startsWith(SCHEME)) url = v;
    else if (k) kv[key] = v;
  };

  const walk = (node: unknown, depth: number) => {
    if (depth > 6) return;
    const n = maybeJson(node);
    if (Array.isArray(n)) {
      n.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    // `[{ key: 'screen', value: 'offers' }]` — the shape Upshot uses for key-value lists.
    if (typeof o.key === 'string' && 'value' in o && Object.keys(o).length <= 3) {
      take(o.key, o.value);
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      const parsed = maybeJson(v);
      if (parsed && typeof parsed === 'object') walk(parsed, depth + 1);
      else take(k, parsed);
    }
  };

  walk(payload, 0);
  if (!screen && !url) return null;
  return { ...(screen ? { screen } : {}), ...(url ? { url } : {}), kv };
}

/** `swiftloan://offers?x=1` → `{ name: 'offers', query: { x: '1' } }`. Null for other schemes and for `onboard` (the lead-token handoff). */
export function parseLinkUrl(url: string): { name: string; query: Record<string, string> } | null {
  const m = /^swiftloan:\/\/([^/?#]*)(?:\/[^?#]*)?(?:\?([^#]*))?/i.exec((url || '').trim());
  if (!m) return null;
  const name = decodeURIComponent(m[1] || '').trim();
  if (!name || name.toLowerCase() === 'onboard') return null;
  const query: Record<string, string> = {};
  (m[2] || '').split('&').filter(Boolean).forEach((pair) => {
    const [k, ...rest] = pair.split('=');
    try {
      query[decodeURIComponent(k)] = decodeURIComponent(rest.join('='));
    } catch {
      /* a malformed pair is skipped */
    }
  });
  return { name, query };
}

export interface ResolvedLink {
  screen: string;
  /** True when a signed-out user must log in before landing here. */
  requiresAuth: boolean;
}

/**
 * Turn a `LinkTarget` into a screen the app may open. `resolve` is the app's own `resolveScreenName`
 * (aliases such as `offers` -> `fare`), passed in so this module stays free of the store.
 */
export function resolveLinkTarget(
  target: LinkTarget | null | undefined,
  resolve: (name: string) => string | null,
): ResolvedLink | null {
  if (!target) return null;
  const name = target.screen ?? (target.url ? parseLinkUrl(target.url)?.name : undefined);
  if (!name) return null;
  const screen = resolve(name);
  if (!screen || !LINKABLE_SCREENS.has(screen)) return null;
  return { screen, requiresAuth: !PUBLIC_LINK_SCREENS.has(screen) };
}

/** Parse Upshot's `getNotificationList` response: `{ statusCode, pageId, status, data: [...] }` (a JSON string or object). */
export function parseInboxResponse(raw: unknown): InboxItem[] {
  const parsed = maybeJson(raw) as any;
  const rows: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
  return rows
    .filter((r) => r && typeof r === 'object')
    .map((r, i): InboxItem => {
      const flag = String(r.read ?? r.isRead ?? '0').toLowerCase();
      return {
        id: String(r.id ?? r.msg_id ?? r.notificationId ?? `row-${i}`),
        // `||`, not `??`: Upshot can send an empty `title` beside a filled extended title (`etitle`).
        title: String(r.title || r.etitle || '').trim(),
        message: String(r.message || r.emsg || '').trim(),
        read: flag === '1' || flag === 'true',
        imageUrl: typeof r.image_url === 'string' && r.image_url ? r.image_url : null,
        target: extractLinkTarget(r.appData ?? r.app_data ?? null),
      };
    })
    .filter((it) => it.title || it.message);
}
