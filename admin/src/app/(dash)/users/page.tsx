'use client';
// The standalone "All Users" list is retired.
//
// It listed registered app users only — a strict subset of /customers, because every
// registered user resolves to a Customer row, while website and campaign leads who
// never installed the app appeared on neither. Having both meant three people-shaped
// destinations (Customers, All Users, Loan Pipeline) and no obvious rule for which one
// answered a given question.
//
// /customers is now the single "All Users" surface, and this route redirects so old
// links and bookmarks keep working. The per-person view lives on at /users/[id] as the
// app-account page, reached from the 360's "View profile".
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui';

export default function UsersListRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/customers'); }, [router]);

  return (
    <div className="page">
      <Card title="Moved to All Users">
        <div className="empty">
          The separate users list has merged into <b>All Users</b>, which also covers
          website and campaign leads who never registered.
          <div style={{ marginTop: 12 }}>
            <Link className="btn btn-primary" href="/customers">Go to All Users</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
