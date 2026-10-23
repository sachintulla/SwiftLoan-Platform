import { ApplyProvider } from '@/lib/applyContext';

// /partner/return is where a partner lender sends the applicant back; it renders in the same shell as /apply.
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <ApplyProvider>{children}</ApplyProvider>;
}
