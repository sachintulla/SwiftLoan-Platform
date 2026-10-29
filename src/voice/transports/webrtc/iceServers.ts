// Which ICE (STUN/TURN) servers the WebRTC call uses. Pure, so the rule is unit-tested without the native module.
//
// A direct connection works on most networks, but strict-NAT mobile networks (some Jio/Airtel/OEM setups) block
// inbound UDP, and there only a TURN relay can carry the call's audio. The relay sees (encrypted) customer voice
// traffic, so it must be a server we run or have a contract with, not a free shared one.
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STUN: IceServer = { urls: 'stun:stun.l.google.com:19302' };

// A free, shared, no-SLA public relay. Only so a developer's own debug build can get through a strict network:
// NEVER used in a release build.
const PUBLIC_DEV_RELAY: IceServer = {
  urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function isIceServer(v: unknown): v is IceServer {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  const urlsOk = isStr(s.urls) || (Array.isArray(s.urls) && s.urls.length > 0 && s.urls.every(isStr));
  const optOk = (x: unknown) => x === undefined || typeof x === 'string';
  return urlsOk && optOk(s.username) && optOk(s.credential);
}

/**
 * `configured` is `globalThis.SWIFTLOAN_ICE_SERVERS` (voiceCredentials.local.js, or whatever injects the production
 * relay). A valid configured list REPLACES the defaults entirely, so list a STUN entry too if you want one.
 * Without it: a debug build gets STUN + the public dev relay; a release build gets STUN only.
 */
export function pickIceServers(configured: unknown, isDev: boolean): IceServer[] {
  const valid = Array.isArray(configured) ? configured.filter(isIceServer) : [];
  if (valid.length > 0) return valid;
  return isDev ? [STUN, PUBLIC_DEV_RELAY] : [STUN];
}

/** True when the list carries a TURN relay (the one thing that makes strict-NAT networks work). */
export const hasRelay = (servers: IceServer[]): boolean =>
  servers.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/i.test(u)));
