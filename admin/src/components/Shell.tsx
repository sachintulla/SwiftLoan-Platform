'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, getToken, getAdmin, clearSession, mustChangePassword } from '@/lib/api';
import VoiceWidget from '@/components/VoiceWidget';
import BrandMark from '@/components/BrandMark';

interface NavDef { href: string; label: string; icon: string; badgeKey?: 'unreadNotifs' | 'supportOpen'; superAdminOnly?: boolean }

const NAV: { section?: string; items: NavDef[] }[] = [
  { items: [
    { href: '/overview', label: 'Dashboard', icon: '▚' },
    // Leads used to be a separate nav entry for the same people; it is merged in
    // here (and /leads still redirects for old links).
    { href: '/customers', label: 'Customers', icon: '◉' },
  ] },
  {
    section: 'Funnel',
    items: [
      { href: '/loans', label: 'Applications', icon: '₹' },
      { href: '/downloads', label: 'App Downloads', icon: '⭳' },
      { href: '/prequalifying', label: 'Pre-Qualifying Offers', icon: '★' },
    ],
  },
  {
    section: 'People & Insight',
    items: [
      // All Users folded into Customers (one list; its "Unverified numbers" toggle shows the people who never
      // entered their OTP). /users and /users/:id still open from links on a customer.
      { href: '/support', label: 'Support Tickets', icon: '✉', badgeKey: 'supportOpen' },
      // Alerts = everything sent to customers (WhatsApp, SMS, push, calls).
      { href: '/alerts', label: 'Alerts', icon: '✆' },
      { href: '/api-errors', label: 'API & Webhook Errors', icon: '⚠' },
      { href: '/notify', label: 'Send Notification', icon: '➤' },
      { href: '/notifications', label: 'Notifications', icon: '◈', badgeKey: 'unreadNotifs' },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { href: '/integrations', label: 'Configs', icon: '⚙' },
      { href: '/app-config', label: 'App Config', icon: '📱', superAdminOnly: true },
      { href: '/timings', label: 'Timings', icon: '⏲', superAdminOnly: true },
      { href: '/test-numbers', label: 'Test numbers', icon: '☎', superAdminOnly: true },
      { href: '/account', label: 'Account', icon: '☖' },
      { href: '/audit', label: 'Audit Log', icon: '❑', superAdminOnly: true },
    ],
  },
];

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
  const rt = (realtime?.data ?? {}) as { unreadNotifs?: number; activeSessions?: number; activeToday?: number };
  // Open + in-progress support tickets — what still needs a human.
  const { data: supSummary } = useSWR('/api/admin/support/summary', swrFetcher, { refreshInterval: 15000 });
  const supportOpen = ((supSummary?.data ?? {}) as { needsAction?: number }).needsAction;
  // The signed-in admin: shown in the menu's profile block and used to show the super-admin-only items. Read after mount: the signed-in admin lives in localStorage, which the
  // server render cannot see, so reading it during render would not match the server's HTML.
  const [profile, setProfile] = useState<{ name?: string; email?: string; role?: string } | null>(null);
  useEffect(() => { setProfile(getAdmin()); }, [pathname]);


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark size={32} />
          {/* Wordmark on dark (DS 1.0): "Swift" mint, "Loan" white. */}
          <div className="brand-name"><span className="bw-swift">Swift</span>Loan</div>
        </div>
        {NAV.map((group, gi) => (
          <React.Fragment key={gi}>
            {group.section && <div className="nav-section">{group.section}</div>}
            {group.items
              // Audit is a super_admin surface — hide it for everyone else (the API 403s anyway).
              .filter((it) => !it.superAdminOnly || profile?.role === 'super_admin')
              .map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + '/');
              const badge = it.badgeKey === 'supportOpen' ? supportOpen : it.badgeKey ? rt[it.badgeKey] : undefined;
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
        {/* Profile, pinned to the bottom of the menu: who is signed in, a link to their account, and Sign out. */}
        <div className="nav-profile">
          <Link href="/account" className="nav-profile-who" title="Account and security">
            <span className="avatar" aria-hidden>{(profile?.name || profile?.email || 'A').slice(0, 1).toUpperCase()}</span>
            <span className="nav-profile-text">
              <b>{profile?.name || 'Admin'}</b>
              <span>{profile?.email ?? ''}</span>
            </span>
          </Link>
          <button type="button" className="nav-profile-out" title="Sign out" aria-label="Sign out" onClick={() => { clearSession(); router.replace('/login'); }}>⏻</button>
        </div>
      </aside>

      <div className="main">
        {children}
      </div>
      <VoiceWidget />
    </div>
  );
}
