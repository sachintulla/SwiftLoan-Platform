'use client';

import { AccountShell } from '@/components/apply/AccountShell';
import { LegalPage } from '@/components/account/LegalHero';
import { TERMS_INTRO, TERMS_SECTIONS } from '@/content/terms';
import { useCopy } from '@/lib/i18n';
import { accountCopy } from '@/i18n/account';

// Same hero and section styling as the Privacy Policy page beside it.
export default function AccountTermsPage() {
  const t = useCopy(accountCopy);
  return (
    <AccountShell backHref="/account/profile" backLabel={t.profileBack} title={t.legalPill} wide>
      <LegalPage title="Terms of Service" intro={TERMS_INTRO}>
        {TERMS_SECTIONS.map((s) => (
          <section className="block" key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </LegalPage>
    </AccountShell>
  );
}
