'use client';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatusBadge, TableSkeleton } from '@/components/ui';
import { humanStatus, timeAgo } from '@/lib/format';

export default function OnboardingJourney() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const { data, isLoading } = useSWR(`/api/admin/onboarding/${userId}`, swrFetcher);
  const steps = (data?.data as { steps?: any[] })?.steps ?? [];
  const events = (data?.data as { events?: any[] })?.events ?? [];

  if (isLoading) return <div className="page"><TableSkeleton rows={8} /></div>;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back</button>
      <h1 className="page-title">Onboarding journey</h1>
      <p className="page-sub">User {userId}</p>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Steps">
          {steps.length === 0 ? <div className="empty">No onboarding steps recorded</div> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {steps.map((s: any) => (
                <div key={s.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{s.stepNumber}. {s.stepName}</span>
                  <span className="row" style={{ gap: 10 }}><span className="muted mono" style={{ fontSize: 12 }}>{s.timeSpentSec}s</span><StatusBadge status={s.status} /></span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Events">
          {events.length === 0 ? <div className="empty">No events</div> : (
            <div style={{ display: 'grid', gap: 2, maxHeight: 420, overflowY: 'auto' }}>
              {events.map((e: any) => (
                <div key={e.id} className="row" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--blue)' }} />
                  <span style={{ fontSize: 13 }}>{humanStatus(e.eventName)}</span>
                  {e.screen && <span className="muted" style={{ fontSize: 11.5 }}>· {e.screen}</span>}
                  <span className="spacer" /><span className="muted" style={{ fontSize: 11 }}>{timeAgo(e.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
