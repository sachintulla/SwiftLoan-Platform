'use client';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { TableSkeleton } from '@/components/ui';
import { PrequalifyingOfferForm, type PrequalifyingOffer } from '@/components/PrequalifyingOfferForm';

export default function EditPrequalifyingOfferPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSWR<{ data: PrequalifyingOffer[] }>('/api/admin/prequalifying-offers', swrFetcher);
  const offer = data?.data?.find((o) => o.id === id);

  if (isLoading) return <div className="page"><TableSkeleton rows={8} /></div>;
  if (!offer) return <div className="page"><p className="page-sub">Offer not found.</p></div>;

  return (
    <div className="page">
      <h1 className="page-title">Edit {offer.lenderName}</h1>
      <div className="mt-16"><PrequalifyingOfferForm offer={offer} /></div>
    </div>
  );
}
