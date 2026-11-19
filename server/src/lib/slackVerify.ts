/**
 * Slack request-signature verification (pure, no I/O) — the gate on the public
 * /api/slack/events webhook so only Slack's servers can reach the assistant.
 *
 * Slack signs every request: X-Slack-Signature = "v0=" + HMAC_SHA256(signingSecret,
 * "v0:" + X-Slack-Request-Timestamp + ":" + rawBody). We recompute it over the RAW
 * body (not the parsed JSON) and compare in constant time, and reject anything older
 * than 5 minutes to stop replay. See https://api.slack.com/authentication/verifying-requests-from-slack
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyResult = { ok: true } | { ok: false; reason: string };

const MAX_SKEW_SEC = 60 * 5;

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifySlackSignature(opts: {
  signingSecret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  nowMs?: number;
}): VerifyResult {
  const { signingSecret, timestamp, signature, rawBody } = opts;
  if (!signingSecret) return { ok: false, reason: 'no signing secret configured' };
  if (!timestamp || !signature) return { ok: false, reason: 'missing signature headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad timestamp' };
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > MAX_SKEW_SEC) return { ok: false, reason: 'timestamp too old (replay?)' };

  const expected = 'v0=' + createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
  if (!safeEqualHex(expected, signature)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}
