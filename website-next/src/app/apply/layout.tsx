import { ApplyProvider } from '@/lib/applyContext';
import ActivityPing from '@/components/site/ActivityPing';
import { ApplyConfirm } from '@/components/apply/ApplyConfirm';

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApplyProvider>
      <ActivityPing />
      {children}
      <ApplyConfirm />
    </ApplyProvider>
  );
}
