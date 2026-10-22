/**
 * The delivery-status callback URL we hand the WhatsApp gateway with each send. An explicit `callbackUrl` setting on
 * the Voxvalley integration wins; otherwise it is built from PUBLIC_BASE_URL and WHATSAPP_WEBHOOK_KEY, and only when the
 * base is a public https address (a gateway on the internet cannot call localhost, and we never send it a plain-http URL
 * carrying a key). Null means "send no callback".
 */
export function defaultCallbackUrl(): string | null {
  const base = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (process.env.WHATSAPP_WEBHOOK_KEY ?? '').trim();
  if (!/^https:\/\/[^/]+/i.test(base) || !key) return null;
  return `${base}/api/webhooks/whatsapp?key=${encodeURIComponent(key)}`;
}
