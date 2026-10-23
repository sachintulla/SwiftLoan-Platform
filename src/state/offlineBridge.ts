// Lets any internet-dependent call (src/api/client.ts's request()) tell
// OfflineNotice "a feature just failed because of the network", independent of
// NetInfo's own connectivity state. NetInfo can lag or disagree with reality
// (a phone associated to a dead Wi-Fi AP, or DNS blocked while "connected" is
// still true) — this is the fallback signal that catches those cases and
// draws attention to the banner even when NetInfo alone wouldn't have shown it.
//
// Two kinds of failure, because they need different advice:
//   'offline'     — the phone has no connection at all.
//   'unreachable' — the phone IS connected but SwiftLoan's servers could not be
//                   reached/trusted (office or public Wi-Fi that blocks or
//                   re-signs secure connections, a firewall, the server being down).
export type NetworkIssue = 'offline' | 'unreachable';
type Listener = (issue: NetworkIssue) => void;

const listeners = new Set<Listener>();

export function reportOfflineAttempt(): void {
  listeners.forEach(l => l('offline'));
}

export function reportServerUnreachable(): void {
  listeners.forEach(l => l('unreachable'));
}

export function subscribeOfflineAttempts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
