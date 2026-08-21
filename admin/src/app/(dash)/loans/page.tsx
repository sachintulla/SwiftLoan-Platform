'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
// `LoanApplication.amount` is whole RUPEES (the create route validates ₹25k–₹15L), so
// it needs `inrR`. `inr` divides by 100 and rendered a ₹1,50,000 application as ₹1,500.
import { inrR, dateStr } from '@/lib/format';

// Every ApplicationStatus, in funnel order. The mid-funnel states
// (pan_pending / prequalifying / handoff) were previously unfilterable even
// though they are exactly where applications go quiet — an operator chasing
// drop-offs could not isolate them.
const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pan_pending', label: 'PAN Pending' },
  { key: 'prequalifying', label: 'Prequalifying' },
  { key: 'offers_ready', label: 'Offers' },
  { key: 'handoff', label: 'Handoff' },
  { key: 'under_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Disbursed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'closed', label: 'Closed' },
] as const;

interface Row { id: string; ref: string; amount: number; loanType: string; status: string; createdAt: string; user?: { fullName?: string; phone?: string }; loan?: { id: string } | null; _count?: { offers: number } }

// `useSearchParams` opts the subtree out of static prerendering, so it has to sit
// inside a Suspense boundary or `next build` fails on this route.
export default function LoansPage() {
  return (
    <Suspense fallback={<div className="page"><TableSkeleton rows={8} cols={6} /></div>}>
      <LoansList />
    </Suspense>
  );
}

function LoansList() {
  const router = useRouter();
  // Seed the filter from `?status=` so the overview's pipeline rows can deep-link
  // straight into the stage they represent. Without this the link landed on "All"
  // and the operator had to re-pick the stage they had just clicked.
  const params = useSearchParams();
  const initialStatus = params.get('status') ?? '';
  const [status, setStatus] = useState<string>(
    STATUS_FILTERS.some((f) => f.key === initialStatus) ? initialStatus : '',
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(search ? { search } : {}) });
  const { data, isLoading } = useSWR(`/api/admin/loans?${qs.toString()}`, swrFetcher);
  const rows = (data?.data ?? []) as Row[];
  const pg = data?.pagination;

  return (
    <div className="page">
      <h1 className="page-title">Loan Funnel</h1>
      <p className="page-sub">Every application and the stage it is sitting at now. Click a row for the full journey.</p>

      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={STATUS_FILTERS as unknown as { key: string; label: string }[]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search ref, name, phone…" />
        </div>

        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label="No applications match" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Ref</th><th>Applicant</th><th>Type</th><th>Amount</th><th>Offers</th><th>Status</th><th>Applied</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/loans/${r.id}`)}>
                    <td className="mono">{r.ref}</td>
                    <td>{r.user?.fullName || '—'}<div className="muted" style={{ fontSize: 11.5 }}>{r.user?.phone}</div></td>
                    <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.loanType}</td>
                    <td className="mono">{inrR(r.amount)}</td>
                    <td className="mono">{r._count?.offers ?? 0}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="muted">{dateStr(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
