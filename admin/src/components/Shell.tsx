'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, getToken, clearSession } from '@/lib/api';
import { useAdminSession } from '@/lib/useAdminSession';
import VoiceWidget from '@/components/VoiceWidget';

interface NavDef { href: string; label: string; icon: string; badgeKey?: 'unreadNotifs'; superAdminOnly?: boolean }

// Re-exported from its new home so existing imports keep working.
export type { AdminInfo } from '@/lib/useAdminSession';

// There were three people-shaped destinations — Customers, All Users and Loan
// Pipeline — and an operator had to know which one answered their question. Now there
// are two, split by QUESTION rather than by database table:
//
//   All Users   → WHO are they? Every person who has shown interest on any channel —
//                 website and campaign leads included, not only those who registered
//                 in the app (65 rows vs the old list's 50). Click through for the
//                 360: journey, calls, conversations, enquiries and app account.
//   Loan Funnel → WHERE are they? Every application and the stage it sits at now.
//
// The old /users list was a strict SUBSET of this one — every registered user has a
// Customer row — so it now redirects here. Its per-person page survives as the
// "App account" view, linked from the 360.
const NAV: { section?: string; items: NavDef[] }[] = [
  { items: [
    { href: '/overview', label: 'Master Overview', icon: '▚' },
    { href: '/customers', label: 'All Users', icon: '☺' },
    { href: '/loans', label: 'Loan Funnel', icon: '₹' },
  ] },
  {
    section: 'Acquisition',
    items: [
      { href: '/downloads', label: 'App Downloads', icon: '⭳' },
      { href: '/campaigns', label: 'Campaigns', icon: '📣' },
      { href: '/preapproved', label: 'Pre-Approved Plans', icon: '◆' },
    ],
  },
  {
    section: 'Insight',
    items: [
      // Analytics merged into Master Overview's "Trends" section; /analytics
      // still resolves via a redirect for old links.
      { href: '/notifications', label: 'Notifications', icon: '◈', badgeKey: 'unreadNotifs' },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { href: '/integrations', label: 'Configs', icon: '⚙' },
      { href: '/notifications-rules', label: 'Notification Rules', icon: '⏱' },
      { href: '/account', label: 'Account', icon: '☖' },
      { href: '/audit', label: 'Audit Log', icon: '❑', superAdminOnly: true },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/overview': 'Master Overview', '/loans': 'Loan Funnel',
  '/leads': 'All Users', '/downloads': 'App Downloads & Attribution',
  // /users redirects to /customers; only its detail page still renders, as the
  // app-account view for one person.
  '/users': 'App Account',
  '/analytics': 'Analytics', '/notifications': 'Notifications',
  // The single people surface — leads, app users and phone-in customers all land here.
  '/customers': 'All Users', '/campaigns': 'Campaigns', '/integrations': 'Configs',
  '/notifications-rules': 'Notification Rules',
  '/account': 'Account & Security', '/audit': 'Audit Log', '/preapproved': 'Pre-Approved Plans',
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Resolved after mount, never during render — see useAdminSession.ts. `pathname` is
  // the refresh key so a fresh sign-in is picked up on the next navigation.
  // Declared before the effect below because that effect depends on `locked`.
  const { admin, locked, ready } = useAdminSession(pathname);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    // 428 / login told us this admin must rotate their password — pin them to /account.
    // Gated on `ready` so the first pass (before localStorage has been read) cannot
    // mistake "not looked yet" for "not locked".
    if (ready && locked && !pathname.startsWith('/account')) {
      router.replace('/account?mustChange=1');
    }
  }, [router, pathname, ready, locked]);

  const { data: realtime } = useSWR('/api/admin/dashboard/realtime', swrFetcher, { refreshInterval: 8000 });
  const rt = (realtime?.data ?? {}) as { unreadNotifs?: number; activeSessions?: number };

  const title = TITLES[pathname] || (Object.keys(TITLES).find((k) => pathname.startsWith(k)) ? TITLES[Object.keys(TITLES).find((k) => pathname.startsWith(k))!] : 'SwiftLoan Admin');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">S</div>
          <div className="brand-name">SwiftLoan</div>
        </div>
        {NAV.map((group, gi) => (
          <React.Fragment key={gi}>
            {group.section && <div className="nav-section">{group.section}</div>}
            {group.items
              // Audit is a super_admin surface — hide it for everyone else (the API 403s anyway).
              .filter((it) => !it.superAdminOnly || admin?.role === 'super_admin')
              .map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + '/');
              const badge = it.badgeKey ? rt[it.badgeKey] : undefined;
              const inner = (
                <>
                  <span className="row" style={{ gap: 10 }}><span style={{ width: 18, textAlign: 'center', opacity: .9 }}>{it.icon}</span>{it.label}</span>
                  {badge ? <span className="nav-badge">{badge}</span> : null}
                </>
              );
              // While a password change is required, everything except /account is inert.
              if (locked && !it.href.startsWith('/account')) {
                return (
                  <span key={it.href} className="nav-item" style={{ opacity: .4, cursor: 'not-allowed' }} title="Change your password first">
                    {inner}
                  </span>
                );
              }
              return (
                <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`}>{inner}</Link>
              );
            })}
          </React.Fragment>
        ))}
        <div className="spacer" />
        <button className="nav-item" style={{ border: 'none', background: 'none', width: '100%' }} onClick={() => { clearSession(); router.replace('/login'); }}>
          <span className="row" style={{ gap: 10 }}><span style={{ width: 18, textAlign: 'center' }}>⏻</span>Sign out</span>
        </button>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="row" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 7, fontSize: 12.5 }}><span className="dot-live" /> {rt.activeSessions ?? 0} active</span>
            <div className="avatar" title={admin?.email}>{(admin?.name || 'A').slice(0, 1).toUpperCase()}</div>
          </div>
        </div>
        {children}
      </div>
      <VoiceWidget />
    </div>
  );
}
