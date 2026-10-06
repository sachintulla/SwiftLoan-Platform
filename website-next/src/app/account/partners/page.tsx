'use client';

import { useEffect, useState } from 'react';
import { AccountShell } from '@/components/apply/AccountShell';
import { LegalPage } from '@/components/account/LegalHero';
import { prettyLenderName } from '@/components/apply/LenderLogo';
import { useAccount } from '@/lib/accountContext';
import { listApplications } from '@/lib/applyApi';

interface Partner {
  name: string;
  logoUrl: string | null;
}

export default function LendingPartnersPage() {
  const { loading: accountLoading } = useAccount();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

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
    <AccountShell backHref="/account/profile" backLabel="Profile" title="Legal" wide>
      <LegalPage
        title="Lending Partners"
        intro="SwiftLoan is a loan-comparison and referral platform — not a lender. Loans are provided by RBI-regulated banks and NBFCs, each lending under its own credit policy and Fair Practices Code."
      >
        {/* Same section markup/classes as the website's compliance page "partners" block. */}
        <section className="block" id="partners">
          <h2>
            <span className="msi">diversity_3</span> Lenders matched to you
          </h2>
          <p className="sublead">
            These RBI-regulated partners have made you an offer. The specific lender for your loan is disclosed in your Key Fact
            Statement.
          </p>
          {loading || accountLoading ? (
            <p className="fine">Loading…</p>
          ) : partners.length === 0 ? (
            <div className="callout">
              <b>No lender offers yet.</b> Apply for a loan and the lenders matched to you will be listed here.
            </div>
          ) : (
            <div className="grid2">
              {partners.map((p) => {
                const name = prettyLenderName(p.name);
                return (
                  <div className="partner" key={p.name}>
                    {p.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
          )}
          <p className="fine">
            Each partner is registered with the RBI and lends under its own credit policy and Fair Practices Code. SwiftLoan does
            not sanction, underwrite, price or disburse any loan.
          </p>
        </section>
      </LegalPage>
    </AccountShell>
  );
}
