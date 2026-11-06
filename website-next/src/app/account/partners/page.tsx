'use client';

import { useEffect, useState } from 'react';
import { AccountShell } from '@/components/apply/AccountShell';
import { LegalPage } from '@/components/account/LegalHero';
import { prettyLenderName } from '@/components/apply/LenderLogo';
import { useAccount } from '@/lib/accountContext';
import { listApplications } from '@/lib/applyApi';
import { authFetch } from '@/lib/session';
import { useCopy } from '@/lib/i18n';
import { accountCopy } from '@/i18n/account';

interface Partner {
  name: string;
  logoUrl: string | null;
}

export default function LendingPartnersPage() {
  const { loading: accountLoading } = useAccount();
  const t = useCopy(accountCopy);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  // Every active lender on the platform (public catalog), so the page is never
  // empty for someone who has not applied yet.
  const [catalog, setCatalog] = useState<Partner[]>([]);

  useEffect(() => {
    authFetch('/api/catalog/partners')
      .then((body: { partners?: { name: string; logoUrl: string | null }[] }) =>
        setCatalog((body.partners ?? []).map((p) => ({ name: p.name, logoUrl: p.logoUrl ?? null }))))
      .catch(() => setCatalog([]));
  }, []);

  // The lenders that have actually made this user an offer — real data, not a
  // static marketing list.
  useEffect(() => {
    if (accountLoading) return;
    listApplications()
      .then((apps) => {
        const seen = new Map<string, Partner>();
        for (const a of apps) {
          for (const o of a.offers ?? []) {
            const name = o.lenderName ?? o.partner?.name;
            if (name && !seen.has(name)) seen.set(name, { name, logoUrl: o.lenderLogoUrl });
          }
        }
        setPartners([...seen.values()]);
      })
      .catch(() => setPartners([]))
      .finally(() => setLoading(false));
  }, [accountLoading]);

  return (
    <AccountShell backHref="/account/profile" backLabel={t.profileBack} title={t.legalPill} wide>
      <LegalPage
        title={t.partnersTitle}
        intro={t.partnersIntro}
      >
        {/* Same section markup/classes as the website's compliance page "partners" block. */}
        <section className="block" id="partners">
          <h2>
            <span className="msi">diversity_3</span> {t.partnersHeading}
          </h2>
          <p className="sublead">
            {t.partnersLead}
          </p>
          {loading || accountLoading ? (
            <p className="fine" aria-busy="true">{t.loading}</p>
          ) : partners.length === 0 ? (
            <div className="callout">
              <b>{t.partnersEmptyBold}</b>{t.partnersEmptyRest}
            </div>
          ) : (
            <PartnerGrid partners={partners} />
          )}
          <p className="fine">
            {t.partnersFine}
          </p>
        </section>
        {catalog.length > 0 && (
          <section className="block" id="all-partners">
            <h2>
              <span className="msi">account_balance</span> {t.partnersAllHeading}
            </h2>
            <p className="sublead">{t.partnersAllLead}</p>
            <PartnerGrid partners={catalog} />
          </section>
        )}
      </LegalPage>
    </AccountShell>
  );
}

function PartnerGrid({ partners }: { partners: Partner[] }) {
  return (
    <div className="grid2">
      {partners.map((p) => {
        const name = prettyLenderName(p.name);
        return (
          <div className="partner" key={p.name}>
            {p.logoUrl ? (
              <img
                src={p.logoUrl}
                alt=""
                style={{ width: 42, height: 42, flexShrink: 0, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--sl-border)', background: '#fff', padding: 4 }}
              />
            ) : (
              <span className="msi" style={{ width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--sl-surface-mint)' }}>account_balance</span>
            )}
            <span style={{ fontWeight: 700, lineHeight: 1.3 }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}
