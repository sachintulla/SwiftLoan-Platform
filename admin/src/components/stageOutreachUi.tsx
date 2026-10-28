// Small pieces of the Stage outreach look shared by its timeline and the message steps: channel names, icons, colours and "30 min" wording.
import React from 'react';

export type Channel = 'whatsapp' | 'sms' | 'email' | 'voice' | 'push';

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', voice: 'Call (Ello)', push: 'Push notification' };

export const ICON_PATHS: Record<Channel, string[]> = {
  whatsapp: ['M21 11.5a8.4 8.4 0 0 1-1.1 4.2A8.5 8.5 0 0 1 8.4 19.5L3 21l1.6-5.1A8.5 8.5 0 1 1 21 11.5z'],
  sms: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  email: ['M3 5h18v14H3z', 'M3 7l9 6 9-6'],
  voice: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'],
  push: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
};

export function Icon({ channel }: { channel: Channel }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON_PATHS[channel].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export const tone = (c: Channel) => ({ color: `var(--so-${c === 'voice' ? 'voice' : c})`, background: `var(--so-${c}-bg)` });

export function duration(mins: number): string {
  if (!mins || mins < 1) return 'now';
  if (mins < 60) return `${mins} min`;
  if (mins % 1440 === 0) { const d = mins / 1440; return `${d} day${d === 1 ? '' : 's'}`; }
  if (mins % 60 === 0) { const h = mins / 60; return `${h} hr`; }
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
