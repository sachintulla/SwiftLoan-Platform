'use client';

import { AccountShell } from '@/components/apply/AccountShell';
import { FaqsView } from '@/components/site/FaqsView';

// The same FAQ page the website shows (shared FaqsView), kept inside the
// dashboard shell — sidebar + back to Profile — instead of bouncing the
// visitor out to the marketing site. The CTA goes to the in-dashboard apply
// flow rather than the website's lead form.
export default function AccountFaqsPage() {
  return (
    <AccountShell backHref="/account/profile" backLabel="Profile" title="FAQs" wide>
      <FaqsView ctaHref="/apply/step-1" inDashboard />
    </AccountShell>
  );
}
