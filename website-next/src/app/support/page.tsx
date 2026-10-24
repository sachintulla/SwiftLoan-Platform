import Link from 'next/link';
import type { Metadata } from 'next';
import '@/app/theme.css'; // --sl-* tokens the legal-page stylesheet depends on
import '../privacypolicy/privacypolicy.css';

export const metadata: Metadata = {
  title: 'Support — SwiftLoan.ai',
  description:
    'Get help with SwiftLoan. Email support@swiftloan.ai for any question about your account, application, offers, repayments or privacy. Grievances: grievance@swiftloan.ai.',
  alternates: { canonical: 'https://swiftloan.ai/support' },
};

export default function SupportPage() {
  const year = new Date().getFullYear();
  return (
    <div className="compliancePage">
      <div className="topbar">
        <span className="msi">support_agent</span> We&rsquo;re here to help &mdash; email us and we&rsquo;ll get back to you
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
          <span className="eyebrow">Help &amp; Support</span>
          <h1>We&rsquo;re here to help</h1>
          <p>Questions about your account, a loan application, your offers, repayments, or your data? The fastest way to reach us is by email &mdash; we read every message.</p>
          <div className="updated">Typical response: within 1 business day</div>
        </div>
      </div>

      <div className="wrap">
        {/* Email first — the primary, always-available channel */}
        <section className="block">
          <h2><span className="msi">mail</span> Email us</h2>
          <p className="sublead">For any question or issue, write to us and include your registered mobile number and, if relevant, your application reference so we can help faster.</p>
          <div className="callout" style={{ fontSize: '1rem' }}>
            <b>General support &mdash; </b>
            <a href="mailto:support@swiftloan.ai?subject=SwiftLoan%20support%20request">support@swiftloan.ai</a>
          </div>
          <ul className="list">
            <li><span className="msi">check_circle</span> Account, sign-in and profile help</li>
            <li><span className="msi">check_circle</span> Loan applications, offers and eligibility</li>
            <li><span className="msi">check_circle</span> Repayments, disbursement and documents</li>
            <li><span className="msi">check_circle</span> Feedback, partnership and press enquiries</li>
          </ul>
        </section>

        {/* In-app */}
        <section className="block">
          <h2><span className="msi">phone_iphone</span> From the SwiftLoan app</h2>
          <p>Signed in to the SwiftLoan app or website? You can raise a support ticket and track its status under <b>Account &rarr; Help &amp; Support</b>, or ask <b>Ruby</b>, our in-app voice assistant, in English, Hindi or Telugu.</p>
          <ol className="steps">
            <li>Open SwiftLoan and go to <b>Account</b>.</li>
            <li>Tap <b>Help &amp; Support</b>.</li>
            <li>Pick a topic and send your message &mdash; you&rsquo;ll get a reference number to track it.</li>
          </ol>
        </section>

        {/* Grievance */}
        <section className="block">
          <h2><span className="msi">gavel</span> Grievance redressal</h2>
          <p>In line with the RBI Digital Lending Guidelines and the DPDP Act 2023, we have a dedicated Grievance Officer / Data Protection Officer for complaints about your personal data or our services.</p>
          <div className="contact-row"><span className="msi">mail</span><div><b>Grievance Officer / DPO:</b> <a href="mailto:grievance@swiftloan.ai">grievance@swiftloan.ai</a></div></div>
          <div className="contact-row"><span className="msi">schedule</span><div><b>Response:</b> we aim to acknowledge promptly and resolve within the period prescribed by applicable law.</div></div>
          <p className="fine">If your grievance relates to a specific loan, your Lending Partner also maintains its own grievance-redressal mechanism, and unresolved matters may be escalated to the RBI Integrated Ombudsman Scheme where applicable. See our <Link href="/privacy-policy">Privacy Policy</Link> for how we handle your data.</p>
        </section>
      </div>

      <footer className="f wrap">
        <p>&copy; {year} Purpletalk India Private Limited. SwiftLoan is a loan-comparison and referral platform and Lending Service Provider &mdash; not a lender. Loans are provided by RBI-regulated banks and NBFCs; approval, amount, interest rate, and terms are at the lender&rsquo;s sole discretion, subject to eligibility, KYC, and documentation. Please borrow responsibly. Terms &amp; Conditions apply.</p>
        <p style={{ marginTop: 10 }}><Link href="/">&larr; Back to SwiftLoan.ai</Link></p>
      </footer>
    </div>
  );
}
