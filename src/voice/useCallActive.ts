import { useEffect, useState } from 'react';
import { agent } from '.';

/** Ruby is on a call: any status but idle / ended (connecting counts — she is about to talk). */
const callActive = (s: string): boolean => s !== 'idle' && s !== 'ended';

/**
 * True while a voice call is live. Screens use it to PAUSE their ambient
 * "look what I'm offering" demo animations so they never fight the real agent,
 * which drives the same highlights itself through the `highlight` tool.
 */
export function useCallActive(): boolean {
  const [live, setLive] = useState(() => callActive(agent.getStatus()));
  useEffect(() => agent.on('statusChange', (s: string) => setLive(callActive(s))), []);
  return live;
}
