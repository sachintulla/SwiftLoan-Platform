'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { StatCard } from '@/components/ui';
import { inrCompact, num } from '@/lib/format';
import PeopleDailyChart from '@/components/PeopleDailyChart';
import LenderBars from '@/components/LenderBars';
import OutcomePie from '@/components/OutcomePie';
import DashboardTables from '@/components/DashboardTables';

/** People counted once, by the shared rules (server lib/peopleMetrics.ts). The Customers page shows the same numbers. */
interface People {
  total: number; checked: number; gotOffers: number; gotOffersPct: number; noOffers: number; noOffersPct: number;
  tappedApply: number; appliedLender: number; appliedLenderPct: number; rejected: number; rejectedPct: number;
  approved: number; disbursed: number;
}
interface Overview {
  stats: { totalUsers: number; totalApplications: number; requestedAmountPeople: number; totalDisbursed: number; people: People };
}

export default function OverviewPage() {
  const { data, isLoading } = useSWR('/api/admin/dashboard/overview', swrFetcher, { refreshInterval: 15000 });
  const o = data?.data as Overview | undefined;

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>

      {/* Six cards: one row of 6, or 2 rows of 3, or 3 rows of 2. Never a row with one card left over. */}
      <div className="dash-cards-wrap"><div className="dash-cards">
        {isLoading || !o ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="stat"><div className="skeleton" style={{ height: 46 }} /></div>)
        ) : (
          <>
            <StatCard label="Total customers" value={num(o.stats.people.total)} icon="◉" tone="teal" foot="Same count as the Customers page" />
            <StatCard label="Total applications" value={num(o.stats.totalApplications)} icon="▤" tone="blue" foot={`From ${num(o.stats.people.checked)} people who checked eligibility`} />
            <StatCard label="Amount requested" value={inrCompact(o.stats.requestedAmountPeople)} icon="₹" tone="blue" foot="Each person once: their latest request" />
            {/* Lenders reached through Yubi report a disbursal but not its amount; the Aurix lenders report neither yet.
                So the card counts LOANS, and shows rupees only when a lender gave an amount. */}
            <StatCard label="Loans disbursed" value={num(o.stats.people.disbursed)} icon="✓" tone="green"
              foot={o.stats.totalDisbursed > 0
                ? `${inrCompact(o.stats.totalDisbursed)} paid out · ${num(o.stats.people.approved)} more approved`
                : o.stats.people.disbursed > 0
                  ? `Amount not reported by the lender · ${num(o.stats.people.approved)} more approved`
                  : `${num(o.stats.people.approved)} approved · lenders have reported no payout yet`} />
            <StatCard label="Got offers" value={`${o.stats.people.gotOffersPct}%`} icon="★" tone="green" foot={`${num(o.stats.people.gotOffers)} of ${num(o.stats.people.checked)} people who checked · ${num(o.stats.people.noOffers)} got no offers`} />
            <StatCard label="Rejected by a lender" value={num(o.stats.people.rejected)} icon="✕" tone="red" foot={`Of ${num(o.stats.people.appliedLender)} who applied with a lender · no offers is not counted here`} />
          </>
        )}
      </div></div>

      <div style={{ marginTop: 16 }}>
        <PeopleDailyChart />
      </div>

      {/* Right under the People per day graph. Two tables: who was active today (left) and the share of users at each stage (right, narrow). */}
      <div style={{ marginTop: 16 }}>
        <DashboardTables />
      </div>

      {/* The lender chart, with the overall outcome pie on its right (under it on a narrow screen). */}
      <div className="dash-lenders" style={{ marginTop: 16 }}>
        <LenderBars />
        <OutcomePie />
      </div>
    </div>
  );
}
