'use client';
// Leads merged into Customers. A lead and a "customer" were always the same
// person seen from two places; Customer is the superset. This route stays alive
// only so existing links, bookmarks and the voice agent's navigation do not 404.
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';

export default function LeadsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/customers'); }, [router]);
  return (
    <div className="page">
      <Card>
        <div className="empty">Leads now live in Customers — taking you there…</div>
      </Card>
    </div>
  );
}
