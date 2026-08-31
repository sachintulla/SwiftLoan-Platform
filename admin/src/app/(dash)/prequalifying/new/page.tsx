'use client';
import { PrequalifyingOfferForm } from '@/components/PrequalifyingOfferForm';

export default function NewPrequalifyingOfferPage() {
  return (
    <div className="page">
      <h1 className="page-title">New Pre-Qualifying Offer</h1>
      <p className="page-sub">This appears at the top of the app&apos;s home screen once saved and active.</p>
      <div className="mt-16"><PrequalifyingOfferForm /></div>
    </div>
  );
}
