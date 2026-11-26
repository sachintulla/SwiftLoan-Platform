'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { StatCard } from '@/components/ui';
import { inrCompact, num } from '@/lib/format';
import PeopleDailyChart from '@/components/PeopleDailyChart';
import LenderBars from '@/components/LenderBars';
import OutcomePie from '@/components/OutcomePie';
import DashboardTables from '@/components/DashboardTables';

interface Overview {
  stats: {
    totalUsers: number; totalApplications: number; requestedAmount: number; totalDisbursed: number;
    /** People who asked for offers, and of them how many got one / were turned down (each person once). */
    peopleChecked: number; peopleWithOffers: number; offersPct: number; peopleRejected: number; rejectedPct: number;
  };
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
            <StatCard label="Total users" value={num(o.stats.totalUsers)} icon="◉" tone="teal" foot="People who signed up" />
            <StatCard label="Total applications" value={num(o.stats.totalApplications)} icon="▤" tone="blue" foot={`From ${num(o.stats.peopleChecked)} people who asked for offers`} />
            <StatCard label="Amount requested" value={inrCompact(o.stats.requestedAmount)} icon="₹" tone="blue" foot="Added up across all applications" />
            <StatCard label="Amount disbursed" value={inrCompact(o.stats.totalDisbursed)} icon="✓" tone="green" foot={o.stats.totalDisbursed > 0 ? 'Paid out by lenders' : 'Lenders do not report payouts to us yet'} />
            <StatCard label="Got offers" value={`${o.stats.offersPct}%`} icon="★" tone="green" foot={`${num(o.stats.peopleWithOffers)} of ${num(o.stats.peopleChecked)} people who asked`} />
            <StatCard label="Rejected" value={num(o.stats.peopleRejected)} icon="✕" tone="red" foot={`${o.stats.rejectedPct}% of people who asked · no lender offered a loan`} />
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
