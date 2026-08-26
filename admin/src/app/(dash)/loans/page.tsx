'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, LoanStatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateStr } from '@/lib/format';

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

interface AppliedOffer { id: string; lenderName?: string | null; lenderStatus?: string | null; partner?: { name?: string } | null }
interface Row { id: string; ref: string; amount: number; loanType: string; status: string; createdAt: string; user?: { fullName?: string; phone?: string }; loan?: { id: string } | null; _count?: { offers: number }; offers?: AppliedOffer[] }

/** Compact per-lender summary for a pipeline row, e.g. "3 lenders · 1 Active". */
function lenderSummary(offers: AppliedOffer[] | undefined): string {
  const applied = offers ?? [];
  if (applied.length === 0) return '—';
  const approved = applied.filter((o) => o.lenderStatus === 'approved').length;
  const disbursed = applied.filter((o) => o.lenderStatus === 'disbursed').length;
  const rejected = applied.filter((o) => o.lenderStatus === 'rejected' || o.lenderStatus === 'failed').length;
  const parts: string[] = [];
  if (disbursed) parts.push(`${disbursed} Active`);
  if (approved) parts.push(`${approved} Approved`);
  if (rejected) parts.push(`${rejected} Rejected`);
  const pending = applied.length - approved - disbursed - rejected;
  if (pending) parts.push(`${pending} in progress`);
  return `${applied.length} lender${applied.length === 1 ? '' : 's'}${parts.length ? ' · ' + parts.join(', ') : ''}`;
}

export default function LoansPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(search ? { search } : {}) });
  const { data, isLoading } = useSWR(`/api/admin/loans?${qs.toString()}`, swrFetcher);
  const rows = (data?.data ?? []) as Row[];
  const pg = data?.pagination;

  return (
    <div className="page">
      <h1 className="page-title">Loan Pipeline</h1>
      <p className="page-sub">Every loan application with its current stage. Click a row for the full journey.</p>

      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={STATUS_FILTERS as unknown as { key: string; label: string }[]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search ref, name, phone…" />
        </div>

        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label="No applications match" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Ref</th><th>Applicant</th><th>Type</th><th>Amount</th><th>Status</th><th>Lender applications</th><th>Applied</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/loans/${r.id}`)}>
                    <td className="mono">{r.ref}</td>
                    <td>{r.user?.fullName || '—'}<div className="muted" style={{ fontSize: 11.5 }}>{r.user?.phone}</div></td>
                    <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.loanType}</td>
                    <td className="mono">{inr(r.amount)}</td>
                    <td><LoanStatusBadge status={r.status} /></td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{lenderSummary(r.offers)}</td>
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
