'use client';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { TableSkeleton } from '@/components/ui';
import { PreApprovedPlanForm, type PreApprovedPlan } from '@/components/PreApprovedPlanForm';

export default function EditPreApprovedPlanPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSWR<{ data: PreApprovedPlan[] }>('/api/admin/preapproved-plans', swrFetcher);
  const plan = data?.data?.find((p) => p.id === id);

  if (isLoading) return <div className="page"><TableSkeleton rows={8} /></div>;
  if (!plan) return <div className="page"><p className="page-sub">Plan not found.</p></div>;

  return (
    <div className="page">
      <h1 className="page-title">Edit {plan.lenderName}</h1>
      <div className="mt-16"><PreApprovedPlanForm plan={plan} /></div>
    </div>
  );
}
