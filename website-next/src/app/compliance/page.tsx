import Link from 'next/link';
import type { Metadata } from 'next';
import './compliance.css';

export const metadata: Metadata = {
  title: 'Compliance & Regulatory — SwiftLoan.ai',
  description:
    "SwiftLoan.ai compliance with the RBI Digital Lending Directions: our role as a Lending Service Provider, Key Fact Statement, fees, cooling-off period, data protection, Fair Practices Code, grievance redressal and lending partners.",
};

export default function CompliancePage() {
  const year = new Date().getFullYear();
  return (
    <div className="compliancePage">
      <div className="topbar">
        <span className="msi">verified_user</span> Aligned with the RBI (Digital Lending) Directions · SwiftLoan.ai is a Lending Service Provider, not a lender
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
          <span className="eyebrow">Regulatory &amp; Compliance</span>
          <h1>Compliance &amp; regulatory framework</h1>
          <p>How SwiftLoan.ai complies with the Reserve Bank of India&apos;s Digital Lending Directions — our role, your protections, the Key Fact Statement, fees, data safeguards, fair-practices and grievance redressal.</p>
          <div className="updated">Last updated: 24 July 2026 · This page is illustrative and part of a demonstration website.</div>
        </div>
      </div>

      <div className="wrap">
        <nav className="toc" aria-label="Contents">
          <a href="#role">Our role</a>
          <a href="#framework">RBI framework</a>
          <a href="#kfs">Key Fact Statement</a>
          <a href="#fees">Rates &amp; fees</a>
          <a href="#cooloff">Cooling-off</a>
          <a href="#privacy">Data protection</a>
          <a href="#fair-practices">Fair Practices</a>
          <a href="#recovery">Recovery</a>
          <a href="#grievance">Grievance</a>
          <a href="#partners">Lending partners</a>
          <a href="#contact">Contact</a>
        </nav>

        {/* ROLE */}
        <section className="block" id="role">
          <h2><span className="msi">gavel</span> Our role: LSP, not a lender</h2>
          <p className="sublead">SwiftLoan.ai is a technology platform and Digital Lending App (DLA) operating as a <b>Lending Service Provider (LSP)</b>.</p>
          <p>We facilitate loans <b>on behalf of Regulated Entities (REs)</b> — RBI-registered banks and NBFCs. We are <b>not a bank or an NBFC</b> and do not lend from our own funds. Our job is to help you discover, compare and apply for credit; the credit decision, sanction and loan agreement are entirely between you and the lender.</p>
          <ul className="list">
            <li><span className="msi">check_circle</span> We <b>never disburse, hold or route your money</b> — funds move directly between you and the lender.</li>
            <li><span className="msi">check_circle</span> We <b>never charge you any fee.</b> Any fee payable to the LSP is paid by the lender, per RBI norms.</li>
            <li><span className="msi">check_circle</span> We present offers <b>impartially</b> — ranked by your likelihood of approval and cost to you, with no dark patterns or pre-ticked consents.</li>
            <li><span className="msi">check_circle</span> The lender&apos;s identity is disclosed to you <b>before</b> you accept, in the Key Fact Statement.</li>
          </ul>
        </section>

        {/* FRAMEWORK */}
        <section className="block" id="framework">
          <h2><span className="msi">account_balance</span> RBI Digital Lending framework</h2>
          <p className="sublead">Our processes are designed around the RBI (Digital Lending) Directions and the earlier Digital Lending Guidelines.</p>
          <ul className="list">
            <li><span className="msi">check_circle</span> <b>Regulated-entity lending:</b> every loan is booked by an RBI-regulated bank or NBFC.</li>
            <li><span className="msi">check_circle</span> <b>Standardised KFS:</b> a Key Fact Statement with the all-inclusive APR is shared before execution.</li>
            <li><span className="msi">check_circle</span> <b>Direct flows:</b> disbursal to your bank account; repayments directly to the lender — no pass-through pool accounts.</li>
            <li><span className="msi">check_circle</span> <b>No automatic limit increases</b> without your explicit consent.</li>
            <li><span className="msi">check_circle</span> <b>Consent &amp; data minimisation</b> with an auditable consent trail and India-based storage.</li>
            <li><span className="msi">check_circle</span> <b>Cooling-off period</b> to exit a new loan without penalty.</li>
            <li><span className="msi">check_circle</span> <b>Nodal grievance officers</b> at both the LSP and the RE, with escalation to the RBI Ombudsman.</li>
          </ul>
        </section>

        {/* KFS */}
        <section className="block" id="kfs">
          <h2><span className="msi">description</span> Key Fact Statement (KFS)</h2>
          <p>Before you accept any offer, the lender provides a standardised <b>Key Fact Statement</b> in a format prescribed by the RBI. It lets you compare the true cost of a loan at a glance. Your KFS shows:</p>
          <ul className="list">
            <li><span className="msi">check_circle</span> Lender (Regulated Entity) name and the sanctioned loan amount</li>
            <li><span className="msi">check_circle</span> The <b>all-inclusive Annual Percentage Rate (APR)</b> — the real annualised cost including interest and fees</li>
            <li><span className="msi">check_circle</span> Loan tenure, EMI amount and the full repayment schedule</li>
            <li><span className="msi">check_circle</span> Every fee and charge — processing fee, documentation, taxes</li>
            <li><span className="msi">check_circle</span> Penal charges on overdue amounts, stated as fixed charges (not compounding penal interest)</li>
            <li><span className="msi">check_circle</span> Cooling-off period, foreclosure/prepayment terms, and the recovery mechanism</li>
            <li><span className="msi">check_circle</span> Grievance-officer contact details for the lender and the LSP</li>
          </ul>
          <div className="callout">There are <b>no hidden charges</b>. If a cost is not in your KFS, you do not pay it.</div>
        </section>

        {/* FEES */}
        <section className="block" id="fees">
          <h2><span className="msi">receipt_long</span> Interest rates, fees &amp; charges</h2>
          <p className="sublead">Indicative ranges across our lending partners. Your exact figures are set by the lender and confirmed in your KFS.</p>
          <div className="wrap-x">
            <table className="tbl">
              <thead><tr><th>Item</th><th>Indicative range</th></tr></thead>
              <tbody>
                <tr><td>Annual Percentage Rate (APR)</td><td>10.49% – 28.00% p.a.</td></tr>
                <tr><td>Loan amount</td><td>₹50,000 – ₹75,00,000</td></tr>
                <tr><td>Tenure</td><td>3 – 60 months</td></tr>
                <tr><td>Processing fee</td><td>up to 3% + GST</td></tr>
                <tr><td>Penal charges</td><td>fixed charge per lender KFS</td></tr>
                <tr><td>Foreclosure / part-prepayment</td><td>0% – 5% per lender (often nil)</td></tr>
              </tbody>
            </table>
          </div>
          <h3>Representative example</h3>
          <p>On a <b>₹1,00,000</b> personal loan for <b>12 months</b> at <b>18% p.a.</b> (reducing balance): monthly EMI ≈ <b>₹9,168</b>, total interest ≈ <b>₹10,016</b>, plus a one-time processing fee of 2% + GST (<b>₹2,360</b>) — an all-inclusive <b>APR ≈ 22.4%</b>, total amount payable ≈ <b>₹1,12,376</b>.</p>
          <p className="fine">This example is purely illustrative to show how APR is computed and is <b>not an offer</b>. Actual amounts, rates and fees are determined by the lending partner based on your profile and disclosed in the Key Fact Statement before you accept.</p>
        </section>

        {/* COOLING OFF */}
        <section className="block" id="cooloff">
          <h2><span className="msi">event_available</span> Cooling-off / look-up period</h2>
          <p>Every borrower gets a cooling-off (look-up) period as prescribed by the RBI, during which you may <b>exit a disbursed loan without penalty</b> by repaying the principal plus the APR proportionate to the period. A lender may retain a reasonable one-time processing fee. The exact cooling-off window is stated in your KFS.</p>
        </section>

        {/* PRIVACY */}
        <section className="block" id="privacy">
          <h2><span className="msi">encrypted</span> Data protection &amp; privacy</h2>
          <p className="sublead">We collect the minimum data needed, only with your consent, and put you in control.</p>
          <ul className="list">
            <li><span className="msi">check_circle</span> <b>Need-based, consent-first collection</b> — each data request is purpose-bound and logged.</li>
            <li><span className="msi">check_circle</span> <b>No access to your phone contacts, media, files or call logs.</b> Camera/mic are used only for one-time KYC with consent.</li>
            <li><span className="msi">check_circle</span> <b>No biometric data is stored.</b></li>
            <li><span className="msi">check_circle</span> <b>Stored in India.</b> Where data is processed abroad, it is brought back and deleted from foreign servers within 24 hours.</li>
            <li><span className="msi">check_circle</span> <b>256-bit encryption</b> in transit and at rest; sharing with a lender happens only via the Account Aggregator framework after your explicit approval.</li>
            <li><span className="msi">check_circle</span> <b>Your rights:</b> review, revoke consent, port, or request deletion of your data at any time.</li>
          </ul>
        </section>

        {/* FAIR PRACTICES */}
        <section className="block" id="fair-practices">
          <h2><span className="msi">balance</span> Fair Practices Code</h2>
          <p>SwiftLoan.ai and its lending partners adhere to the RBI Fair Practices Code. We commit to:</p>
          <ul className="list">
            <li><span className="msi">check_circle</span> Transparent, non-discriminatory and plain-language communication.</li>
            <li><span className="msi">check_circle</span> No misleading advertising, no coercive cross-selling, no automatic add-ons.</li>
            <li><span className="msi">check_circle</span> All terms disclosed up-front in the KFS before you commit.</li>
            <li><span className="msi">check_circle</span> Privacy of borrower information and dignified treatment at every step.</li>
          </ul>
        </section>

        {/* RECOVERY */}
        <section className="block" id="recovery">
          <h2><span className="msi">handshake</span> Recovery practices</h2>
          <p>Recovery, if ever required, is carried out by the lender or its authorised agent under the RBI&apos;s code of conduct:</p>
          <ul className="list">
            <li><span className="msi">check_circle</span> Contact only between 8:00 AM and 7:00 PM; never at inconvenient hours.</li>
            <li><span className="msi">check_circle</span> No harassment, intimidation, or public shaming — ever.</li>
            <li><span className="msi">check_circle</span> The name and contact of the assigned recovery officer is shared with you in advance.</li>
            <li><span className="msi">check_circle</span> Complaints against recovery conduct are handled through the grievance channel below.</li>
          </ul>
        </section>

        {/* GRIEVANCE */}
        <section className="block" id="grievance">
          <h2><span className="msi">support_agent</span> Grievance redressal</h2>
          <p className="sublead">We take complaints seriously. Reach our Nodal Grievance Redressal Officer:</p>
          <div className="contact-row"><span className="msi">person</span> <div><b>Nodal Grievance Redressal Officer</b>, SwiftLoan.ai</div></div>
          <div className="contact-row"><span className="msi">mail</span> <a href="mailto:grievance@swiftloan.ai">grievance@swiftloan.ai</a></div>
          <div className="contact-row"><span className="msi">call</span> 1800-000-0000 (toll-free) · Mon–Sat, 10:00 AM – 6:00 PM</div>
          <h3>Escalation path</h3>
          <ol className="steps">
            <li>We <b>acknowledge within 48 hours</b> and work to resolve your complaint within the RBI-prescribed timeline.</li>
            <li>If you&apos;re not satisfied, escalate to the <b>lending partner&apos;s Grievance Officer</b>, whose details are in your KFS and loan agreement.</li>
            <li>
              If the complaint is not resolved within <b>30 days</b>, you may escalate to the RBI under the <b>Reserve Bank – Integrated Ombudsman Scheme (RB-IOS)</b> via the Complaint Management System at{' '}
              <a href="https://cms.rbi.org.in" target="_blank" rel="noopener">cms.rbi.org.in</a> or the RBI contact centre on 14448.
            </li>
          </ol>
        </section>

        {/* PARTNERS */}
        <section className="block" id="partners">
          <h2><span className="msi">diversity_3</span> Our lending partners</h2>
          <p className="sublead">Loans are provided by the following RBI-regulated partners (illustrative for this demonstration site). The specific lender for your loan is disclosed in your KFS.</p>
          <div className="grid2">
            <div className="partner"><span className="msi">account_balance</span> Aditya Finance Ltd <span className="type">NBFC</span></div>
            <div className="partner"><span className="msi">account_balance</span> MetroCredit NBFC <span className="type">NBFC</span></div>
            <div className="partner"><span className="msi">account_balance</span> Prime Capital Ltd <span className="type">NBFC</span></div>
            <div className="partner"><span className="msi">account_balance</span> UrbanLend Finance <span className="type">NBFC</span></div>
            <div className="partner"><span className="msi">account_balance</span> Bharat Cooperative Bank <span className="type">Bank</span></div>
            <div className="partner"><span className="msi">account_balance</span> Horizon Small Finance Bank <span className="type">Bank</span></div>
          </div>
          <p className="fine">Partner names above are illustrative. Each partner is (or would be) registered with the RBI and lends under its own credit policy and Fair Practices Code.</p>
        </section>

        {/* CONTACT */}
        <section className="block" id="contact">
          <h2><span className="msi">apartment</span> Entity &amp; contact</h2>
          <div className="contact-row"><span className="msi">business</span> <div><b>SwiftLoan.ai</b> (Lending Service Provider / Digital Lending App)</div></div>
          <div className="contact-row"><span className="msi">location_on</span> Registered office: [Address to be added], India</div>
          <div className="contact-row"><span className="msi">mail</span> <a href="mailto:support@swiftloan.ai">support@swiftloan.ai</a> · <a href="mailto:grievance@swiftloan.ai">grievance@swiftloan.ai</a></div>
          <div className="callout">Placeholders such as CIN, GSTIN, registered address, officer name and toll-free number must be filled with the real entity&apos;s verified details before this site is used in production.</div>
        </section>
      </div>

      <footer className="f wrap">
        <p>© <span>{year}</span> SwiftLoan.ai — Illustrative brand for demonstration. SwiftLoan.ai is a Lending Service Provider and does not lend directly. Loans are provided by RBI-regulated banks and NBFCs at their sole discretion. Please read the Key Fact Statement and all loan documents before borrowing. This page does not constitute financial advice or a loan offer.</p>
        <p style={{ marginTop: 10 }}><Link href="/">← Back to SwiftLoan.ai</Link></p>
      </footer>
    </div>
  );
}
