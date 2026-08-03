'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, getToken, getAdmin, clearSession, mustChangePassword } from '@/lib/api';
import VoiceWidget from '@/components/VoiceWidget';

interface NavDef { href: string; label: string; icon: string; badgeKey?: 'unreadNotifs'; superAdminOnly?: boolean }

const NAV: { section?: string; items: NavDef[] }[] = [
  { items: [
    { href: '/overview', label: 'Master Overview', icon: '▚' },
    { href: '/customers', label: 'Customers 360', icon: '◉' },
  ] },
  {
    section: 'Funnel',
    items: [
      { href: '/loans', label: 'Loan Pipeline', icon: '₹' },
      { href: '/leads', label: 'Leads', icon: '✦' },
      { href: '/downloads', label: 'App Downloads', icon: '⭳' },
      { href: '/campaigns', label: 'Campaigns', icon: '📣' },
    ],
  },
  {
    section: 'People & Insight',
    items: [
      { href: '/users', label: 'All Users', icon: '☺' },
      // Analytics merged into Master Overview's "Trends" section; /analytics
      // still resolves via a redirect for old links.
      { href: '/notifications', label: 'Notifications', icon: '◈', badgeKey: 'unreadNotifs' },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { href: '/integrations', label: 'Integrations', icon: '⚙' },
      { href: '/notifications-rules', label: 'Notification Rules', icon: '⏱' },
      { href: '/account', label: 'Account', icon: '☖' },
      { href: '/audit', label: 'Audit Log', icon: '❑', superAdminOnly: true },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/overview': 'Master Overview', '/loans': 'Loan Pipeline',
  '/leads': 'Leads & Contact', '/downloads': 'App Downloads & Attribution', '/users': 'All Users',
  '/analytics': 'Analytics', '/notifications': 'Notifications',
  '/customers': 'Customers 360', '/campaigns': 'Campaigns', '/integrations': 'Integrations',
  '/notifications-rules': 'Notification Rules',
  '/account': 'Account & Security', '/audit': 'Audit Log',
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    // 428 / login told us this admin must rotate their password — pin them to /account.
    if (mustChangePassword() && !pathname.startsWith('/account')) {
      router.replace('/account?mustChange=1');
    }
  }, [router, pathname]);

  const locked = mustChangePassword();

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
