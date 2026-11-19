'use client';
// Messages was folded into Alerts (everything sent to customers in one list). This route stays alive only so
// existing links and bookmarks do not 404.
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';

export default function MessagesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/alerts'); }, [router]);
  return (
    <div className="page">
      <Card>
        <div className="empty">Messages now live in Alerts. Taking you there…</div>
      </Card>
    </div>
  );
}
