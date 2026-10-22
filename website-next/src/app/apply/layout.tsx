import { ApplyProvider } from '@/lib/applyContext';
import ActivityPing from '@/components/site/ActivityPing';

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApplyProvider>
      <ActivityPing />
      {children}
    </ApplyProvider>
  );
}
