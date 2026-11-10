import React, { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { agent } from '../voice';
import RubyWelcome from './RubyWelcome';

/** Ruby is on a call: anything but idle / ended (connecting counts — she is about to talk). */
const callActive = (s: string) => s !== 'idle' && s !== 'ended';

/**
 * The Ruby welcome video plays only while no call is on. If a call is live (or
 * starts while the video is up), the pending welcome is dropped for this login —
 * the person is already talking to Ruby, and the video would cover the screen
 * she is working on.
 */
export default function WelcomeGate() {
  const { state, set } = useStore();
  const [live, setLive] = useState(() => callActive(agent.getStatus()));
  useEffect(() => agent.on('statusChange', s => setLive(callActive(s))), []);
  useEffect(() => {
    if (live && state.welcomePending) set({ welcomePending: false });
  }, [live, state.welcomePending, set]);
  if (!state.welcomePending || live) return null;
  return <RubyWelcome onDone={() => set({ welcomePending: false })} />;
}
