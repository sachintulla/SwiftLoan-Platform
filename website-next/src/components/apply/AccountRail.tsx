'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutList, Tag, User, MessageCircle, LogOut, Menu, X } from 'lucide-react';
import { logout as logoutSession } from '@/lib/session';

const NAV = [
  { href: '/account', label: 'My Applications', icon: LayoutList },
  // Mirrors the app's own "My Offers" bottom-nav tab (fare.tsx) — a
  // persistent destination for your current eligible offers, not just a
  // mid-funnel step. /apply/offers already renders correctly with this same
  // account sidebar; it just needed a way in from outside the apply funnel.
  { href: '/apply/offers', label: 'My Offers', icon: Tag },
  { href: '/account/profile', label: 'Profile', icon: User },
  { href: '/account/support', label: 'Support', icon: MessageCircle },
];

function initials(name?: string) {
  if (!name) return 'U';
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export interface AccountRailUser {
  fullName?: string | null;
  firstName?: string | null;
  phone?: string | null;
}

/**
 * The logged-in account sidebar — shown in place of the marketing brand rail
 * anywhere a real session already exists: the /account/* pages (via
 * AccountShell) AND the back half of the /apply funnel (offers onward), once
 * the visitor is a real, logged-in applicant rather than someone still being
 * pitched the product. Self-contained (fetches nothing, owns its own logout)
 * so either caller can drop it in with just the user object it already has.
 */
export function AccountRail({ user }: { user?: AccountRailUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const name = user?.fullName || user?.firstName || 'there';

  return (
    <>
      <aside className="bg-deep-gradient relative hidden h-screen w-[320px] shrink-0 flex-col gap-6 self-start overflow-y-auto p-8 text-white lg:sticky lg:top-0 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold">
          <span className="bg-brand-gradient grid h-8 w-8 place-items-center rounded-xl text-sm">S</span>
          SwiftLoan
        </Link>
        {/* Deliberately NOT the brand-gradient tile above — a glass/outline
            treatment reads as "a person" at a glance instead of a second logo. */}
        <div className="flex items-center gap-3 border-t border-white/10 pt-6">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-white/25 bg-white/10 text-base font-extrabold backdrop-blur-sm">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-extrabold">{name}</div>
            {user?.phone && <div className="text-xs text-white/60">+91 {user.phone}</div>}
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  active ? 'bg-white/12 text-white' : 'text-white/75'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
          <button
            onClick={() => setConfirmingLogout(true)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white/75"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </nav>
      </aside>

      {confirmingLogout && (
        <LogoutModal
          onClose={() => setConfirmingLogout(false)}
          onConfirm={async () => {
            await logoutSession();
            router.replace('/apply');
          }}
        />
      )}
    </>
  );
}

/**
 * Mobile/tablet (< lg) replacement for the left rails, which are hidden
 * there: the brand mark linking home, plus — once logged in — a menu button
 * opening the same account navigation (and Log out) the desktop rail has.
 * Without it, logged-in pages had no navigation at all on phones.
 */
export function MobileTopBar({ user }: { user?: AccountRailUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const name = user?.fullName || user?.firstName || 'there';

  return (
    <div className="lg:hidden">
      <div className="border-border bg-background/95 sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 backdrop-blur sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-extrabold">
          <span className="bg-brand-gradient grid h-7 w-7 place-items-center rounded-lg text-xs text-white">S</span>
          SwiftLoan
        </Link>
        {user && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="border-border bg-card grid h-10 w-10 place-items-center rounded-full border"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
      </div>

      {user && open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" aria-hidden />
          <nav
            className="animate-in fade-in slide-in-from-top-2 bg-deep-gradient relative flex flex-col gap-1 p-4 text-white shadow-[var(--shadow-float)] duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-3 border-b border-white/10 px-2 pb-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-white/25 bg-white/10 text-sm font-extrabold">
                {initials(name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold">{name}</div>
                {user.phone && <div className="text-xs text-white/60">+91 {user.phone}</div>}
              </div>
            </div>
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${pathname === href ? 'bg-white/12 text-white' : 'text-white/80'}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <button
              onClick={() => { setOpen(false); setConfirmingLogout(true); }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-white/80"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </nav>
        </div>
      )}

      {confirmingLogout && (
        <LogoutModal
          onClose={() => setConfirmingLogout(false)}
          onConfirm={async () => {
            await logoutSession();
            router.replace('/apply');
          }}
        />
      )}
    </div>
  );
}

function LogoutModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6" onClick={onClose}>
      <div
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-card p-6 text-center shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-danger-soft text-danger grid h-12 w-12 place-items-center rounded-full">
          <LogOut className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Log out?</h2>
          <p className="text-muted-foreground mt-1.5 text-sm">You&apos;ll need to verify your mobile number again to sign back in.</p>
        </div>
        <div className="flex w-full gap-3">
          <button onClick={onClose} className="border-border flex-1 rounded-full border py-2.5 text-sm font-bold">
            Cancel
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              await onConfirm();
            }}
            disabled={loading}
            className="bg-danger flex-1 rounded-full py-2.5 text-sm font-bold text-white"
          >
            {loading ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </div>
    </div>
  );
}
