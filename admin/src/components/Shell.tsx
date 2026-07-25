'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, getToken, getAdmin, clearSession } from '@/lib/api';

interface NavDef { href: string; label: string; icon: string; badgeKey?: 'unreadNotifs' }

const NAV: { section?: string; items: NavDef[] }[] = [
  { items: [{ href: '/overview', label: 'Master Overview', icon: '▚' }] },
  {
    section: 'Funnel',
    items: [
      { href: '/onboarding', label: 'Onboarding', icon: '◔' },
      { href: '/loans', label: 'Loan Pipeline', icon: '₹' },
      { href: '/leads', label: 'Leads', icon: '✦' },
      { href: '/downloads', label: 'App Downloads', icon: '⭳' },
    ],
  },
  {
    section: 'People & Insight',
    items: [
      { href: '/users', label: 'All Users', icon: '☺' },
      { href: '/analytics', label: 'Analytics', icon: '◫' },
      { href: '/notifications', label: 'Notifications', icon: '◈', badgeKey: 'unreadNotifs' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/overview': 'Master Overview', '/onboarding': 'Onboarding Journeys', '/loans': 'Loan Pipeline',
  '/leads': 'Leads & Contact', '/downloads': 'App Downloads & Attribution', '/users': 'All Users',
  '/analytics': 'Analytics', '/notifications': 'Notifications',
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);

  const { data: realtime } = useSWR('/api/admin/dashboard/realtime', swrFetcher, { refreshInterval: 8000 });
  const rt = (realtime?.data ?? {}) as { unreadNotifs?: number; activeSessions?: number };
  const admin = getAdmin();

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
            {group.items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + '/');
              const badge = it.badgeKey ? rt[it.badgeKey] : undefined;
              return (
                <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`}>
                  <span className="row" style={{ gap: 10 }}><span style={{ width: 18, textAlign: 'center', opacity: .9 }}>{it.icon}</span>{it.label}</span>
                  {badge ? <span className="nav-badge">{badge}</span> : null}
                </Link>
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
    </div>
  );
}
