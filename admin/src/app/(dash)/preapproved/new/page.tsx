'use client';
import { PreApprovedPlanForm } from '@/components/PreApprovedPlanForm';

export default function NewPreApprovedPlanPage() {
  return (
    <div className="page">
      <h1 className="page-title">New Pre-Approved Plan</h1>
      <p className="page-sub">This will appear on the app&apos;s loan-options screen once saved and active.</p>
      <div className="mt-16"><PreApprovedPlanForm /></div>
    </div>
  );
}
