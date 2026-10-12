'use client';

import { AccountShell } from '@/components/apply/AccountShell';
import { FaqsView } from '@/components/site/FaqsView';
import { useCopy } from '@/lib/i18n';
import { accountCopy } from '@/i18n/account';

// The same FAQ page the website shows (shared FaqsView), kept inside the
// dashboard shell — sidebar + back to Profile — instead of bouncing the
// visitor out to the marketing site. The CTA goes to the in-dashboard apply
// flow rather than the website's lead form.
export default function AccountFaqsPage() {
  const t = useCopy(accountCopy);
  return (
    <AccountShell backHref="/account/profile" backLabel={t.profileBack} title={t.faqsPill} wide>
      <FaqsView ctaHref="/apply/step-1" inDashboard />
    </AccountShell>
  );
}
