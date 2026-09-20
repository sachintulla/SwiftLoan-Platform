import { AccountProvider } from '@/lib/accountContext';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>;
}
