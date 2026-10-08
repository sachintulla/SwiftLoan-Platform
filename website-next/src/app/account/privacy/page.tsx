'use client';

import { AccountShell } from '@/components/apply/AccountShell';
import { LegalPage } from '@/components/account/LegalHero';
import { PRIVACY_BODY } from '@/content/privacyBody';

// Same policy, hero and styling as the public /privacypolicy page (shared
// PRIVACY_BODY + the site's own stylesheet), kept inside the dashboard shell.
export default function AccountPrivacyPage() {
  return (
    <AccountShell backHref="/account/profile" backLabel="Profile" title="Legal" wide>
      <LegalPage
        title="Privacy Policy"
        intro="How Purpletalk India Private Limited (“SwiftLoan”) collects, uses, stores, shares and protects your personal information across the SwiftLoan Platform — and how you stay in control of it."
        updated="Effective date: 25 August 2026 · Last updated: 18 August 2026 · Version 1.0"
      >
        <div dangerouslySetInnerHTML={{ __html: PRIVACY_BODY }} />
      </LegalPage>
    </AccountShell>
  );
}
