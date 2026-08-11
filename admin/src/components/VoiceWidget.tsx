'use client';

// Floating mic button for the SwiftLoan admin dashboard. Mounts the ElloAgent
// voice client and registers navigation tools so an operator can drive the
// dashboard by voice ("take me to the loan pipeline", "open loan SL-800042").
//
// Tools are registered once (they're sent at session start); navigation uses
// refs to the latest Next router/pathname so handlers always act on the current
// route. Page context is re-sent on every route change while a session is live.

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ElloAgent, type AgentStatus } from '@/lib/ello-agent';
import { registerAdminTools } from '@/lib/ello-tools-admin';

export default function VoiceWidget() {
  const router = useRouter();
  const pathname = usePathname();

  const agentRef = useRef<ElloAgent | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // No Ello API key or agent id in the browser: NEXT_PUBLIC_* values are
    // compiled into the client bundle, so both used to be readable by anyone with
    // devtools. The session is brokered by our own API instead, which keeps the
    // key server-side and decides which agent the `adminNavigator` role means.
    const sessionUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
    if (!sessionUrl) {
      console.warn('[VoiceWidget] NEXT_PUBLIC_API_BASE not set — voice widget disabled.');
      return;
    }
    setEnabled(true);
    const agent = new ElloAgent({
      sessionUrl,
      role: 'adminNavigator',
      wsUrl: process.env.NEXT_PUBLIC_ELLO_WS_URL,
      debug: process.env.NODE_ENV !== 'production',
    });
    registerAdminTools(agent, {
      navigate: (path) => router.push(path),
      currentPath: () => pathRef.current,
    });
    agent.on('statusChange', setStatus);
    agent.on('error', (e) => setError(e.message));
    agentRef.current = agent;
    (window as unknown as { __elloAgent?: unknown }).__elloAgent = agent;
    return () => agent.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-send page context whenever the operator navigates, so the agent knows
  // which screen is current (only if a session is active).
  useEffect(() => {
    if (agentRef.current?.conversationId) agentRef.current.updatePageContext();
  }, [pathname]);

  if (!enabled) return null;

  const active = status !== 'idle' && status !== 'ended';
  const label =
    status === 'connecting' ? 'Connecting…'
    : status === 'listening' ? 'Listening…'
    : status === 'speaking' ? 'Speaking…'
    : status === 'executingTool' ? 'Working…'
    : active ? 'Active' : 'Ask Ello';

  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {error && (
        <div className="badge tone-red" style={{ maxWidth: 280, whiteSpace: 'normal', lineHeight: 1.4 }}>{error}</div>
      )}
      <button
        type="button"
        onClick={() => (active ? agentRef.current?.stop() : agentRef.current?.start())}
        title="Voice navigation — talk to move around the dashboard"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '12px 18px', borderRadius: 999,
          fontSize: 13.5, fontWeight: 650, border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(7,159,160,.35)',
          color: '#fff',
          background: active ? 'linear-gradient(135deg,#f04438,#f79009)' : 'linear-gradient(135deg,#079fa0,#2fb183)',
          transition: 'transform .15s',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={active ? { animation: 'pulse 1.4s infinite' } : undefined} aria-hidden>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <path d="M12 18v4M8 22h8" />
        </svg>
        {label}
      </button>
    </div>
  );
}
