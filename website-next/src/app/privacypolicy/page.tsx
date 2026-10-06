import Link from 'next/link';
import type { Metadata } from 'next';
import '@/app/theme.css'; // --sl-* tokens the legal-page stylesheet depends on
import './privacypolicy.css';
import { PRIVACY_BODY as BODY } from '@/content/privacyBody';

export const metadata: Metadata = {
  title: 'Privacy Policy — SwiftLoan.ai',
  description:
    'SwiftLoan Privacy Policy: how Purpletalk India Private Limited collects, uses, stores, shares and protects your personal data, aligned with the DPDP Act 2023, the IT Act/SPDI Rules and the RBI Digital Lending Guidelines.',
};


export default function PrivacyPolicyPage() {
  const year = new Date().getFullYear();
  return (
    <div className="compliancePage">
      <div className="topbar">
        <span className="msi">verified_user</span> Aligned with the DPDP Act 2023 · IT Act &amp; SPDI Rules · RBI Digital Lending Guidelines
      </div>

      <header className="nav">
        <div className="nav__in">
          <Link href="/" className="brand">
            <svg width="30" height="30" viewBox="0 0 120 120" fill="none">
              <g stroke="#fff" strokeLinecap="round">
                <line x1="16" y1="43" x2="40" y2="43" strokeWidth="6" opacity=".32" />
                <line x1="12" y1="60" x2="38" y2="60" strokeWidth="6" opacity=".55" />
                <line x1="18" y1="77" x2="42" y2="77" strokeWidth="6" opacity=".82" />
              </g>
              <g transform="skewX(-7)">
                <text x="82" y="87" textAnchor="middle" fill="#fff" fontFamily="'Public Sans',Arial,sans-serif" fontSize="84" fontWeight="800">&#8377;</text>
              </g>
            </svg>
            <span><span className="sw">Swift</span>Loan<span className="ai">.ai</span></span>
          </Link>
          <Link href="/" className="back"><span className="msi">arrow_back</span> Back to site</Link>
        </div>
      </header>

      <div className="head">
        <div className="wrap">
          <span className="eyebrow">Legal</span>
          <h1>Privacy Policy</h1>
          <p>How Purpletalk India Private Limited (&ldquo;SwiftLoan&rdquo;) collects, uses, stores, shares and protects your personal information across the SwiftLoan Platform &mdash; and how you stay in control of it.</p>
          <div className="updated">Effective date: 25 August 2026 · Last updated: 18 August 2026 · Version 1.0</div>
        </div>
      </div>

      <div className="wrap" dangerouslySetInnerHTML={{ __html: BODY }} />

      <footer className="f wrap">
        <p>&copy; {year} Purpletalk India Private Limited. SwiftLoan is a loan-comparison and referral platform and Lending Service Provider &mdash; not a lender. Loans are provided by RBI-regulated banks and NBFCs; approval, amount, interest rate, and terms are at the lender&rsquo;s sole discretion, subject to eligibility, KYC, and documentation. Please borrow responsibly. Terms &amp; Conditions apply.</p>
        <p style={{ marginTop: 10 }}><Link href="/">&larr; Back to SwiftLoan.ai</Link></p>
      </footer>
    </div>
  );
}
