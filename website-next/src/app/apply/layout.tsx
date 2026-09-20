import { ApplyProvider } from '@/lib/applyContext';

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <ApplyProvider>{children}</ApplyProvider>;
}
