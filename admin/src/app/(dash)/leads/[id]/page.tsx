'use client';
// A lead page is now a customer page. Look the lead up, find the Customer row it
// resolved to (matched on phone by the API) and hand over. A lead with no phone
// has no customer to hand over to, which is a real state — say so rather than
// bouncing the operator somewhere unrelated.
import React, { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, TableSkeleton } from '@/components/ui';

export default function LeadRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/leads/${id}`, swrFetcher);
  const payload = (data?.data ?? {}) as { customerId?: string | null; lead?: { name?: string | null; phone?: string | null } };
  const customerId = payload.customerId ?? null;

  useEffect(() => {
    if (customerId) router.replace(`/customers/${customerId}`);
  }, [customerId, router]);

  // Both "still fetching the lead" and "found it, redirecting" render the SAME
  // skeleton. They used to differ — a skeleton, then a near-empty card reading
  // "Opening the customer journey…" — so the hop showed a visible two-step flicker that
  // read as a page that had stalled. The redirect itself is unavoidable: the Customer id
  // is only known after the lead is fetched, and the admin token lives in localStorage
  // so this cannot be resolved server-side.
  if (isLoading || customerId) return <div className="page"><TableSkeleton rows={6} /></div>;

  if (error) {
    return (
      <div className="page"><Card>
        <div className="empty">
          Could not load this lead — {(error as Error).message}
          <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button className="btn" onClick={() => mutate()}>Retry</button>
            <Link className="btn" href="/customers">Go to customers</Link>
          </div>
        </div>
      </Card></div>
    );
  }

  if (!customerId) {
    return (
      <div className="page"><Card title="No customer record for this lead">
        <div className="empty">
          This lead {payload.lead?.phone ? '' : 'has no phone number, so it '}has never been resolved to a customer,
          so there is no journey to show.
          <div style={{ marginTop: 12 }}><Link className="btn" href="/customers">Go to customers</Link></div>
        </div>
      </Card></div>
    );
  }

  // Unreachable in practice: isLoading, error, !customerId and customerId are
  // exhaustive. Kept as a defensive fallback rather than returning null.
  return <div className="page"><TableSkeleton rows={6} /></div>;
}
