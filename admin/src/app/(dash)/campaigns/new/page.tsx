'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import CampaignBuilder from '@/components/CampaignBuilder';

export default function NewCampaignPage() {
  const router = useRouter();
  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.push('/campaigns')}>← Back to campaigns</button>
      <h1 className="page-title">New campaign</h1>
      <p className="page-sub">Name it, pick who to call, and save — one step.</p>
      <div style={{ marginTop: 20 }}>
        <CampaignBuilder
          onSaved={(id) => router.push(id ? `/campaigns/${id}` : '/campaigns')}
          onCancel={() => router.push('/campaigns')}
        />
      </div>
    </div>
  );
}
