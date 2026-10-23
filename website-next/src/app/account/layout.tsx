import { AccountProvider } from '@/lib/accountContext';
import ActivityPing from '@/components/site/ActivityPing';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <ActivityPing />
      {children}
    </AccountProvider>
  );
}
