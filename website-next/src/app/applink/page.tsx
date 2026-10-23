import type { Metadata } from 'next';
import { InstallButtons } from './InstallButtons';

export const metadata: Metadata = {
  title: 'Install SwiftLoan — Internal Beta',
  description:
    'Install the SwiftLoan app (internal beta). Compare real loan offers from multiple RBI-regulated lenders. Built by Purpletalk India Private Limited.',
  alternates: { canonical: 'https://www.swiftloan.ai/applink' },
  robots: { index: false, follow: false }, // internal beta — keep out of search
};

const css = `
:root{--teal:#079FA0;--mint:#2FB183;--ink:#0A3F41;--ink-deep:#07201F}
.al{min-height:100svh;margin:0;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(150deg,#07201F 0%,#083E40 34%,#079FA0 88%,#2FB183 125%);
  font-family:'Public Sans','Segoe UI',system-ui,Arial,sans-serif;color:#fff;padding:24px;}
.al *{box-sizing:border-box}
.al .card{width:100%;max-width:420px;text-align:center}
.al .logo{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:1.5rem;letter-spacing:-.02em;margin-bottom:6px}
.al .mark{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#0CB6A6,#2FB183);display:grid;place-items:center;font-weight:800;font-size:1.5rem}
.al .pill{display:inline-block;background:rgba(245,166,36,.18);border:1px solid rgba(245,166,36,.55);color:#ffdfa6;
  padding:5px 12px;border-radius:999px;font-size:.72rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;margin:14px 0 18px}
.al h1{font-size:1.9rem;line-height:1.12;margin:0 0 8px}
.al p.sub{color:rgba(255,255,255,.85);font-size:1rem;margin:0 auto 26px;max-width:34ch;line-height:1.5}
.al a.cta{display:block;background:#fff;color:#06403f;font-weight:800;font-size:1.1rem;text-decoration:none;
  padding:16px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.22)}
.al a.cta:active{transform:translateY(1px)}
.al .plat{display:flex;gap:10px;margin-top:12px}
.al .plat a{flex:1;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.35);
  border-radius:14px;padding:11px;font-weight:700;font-size:.9rem;background:rgba(255,255,255,.08)}
.al .note{color:rgba(255,255,255,.72);font-size:.82rem;margin-top:18px;line-height:1.5}
.al .fine{color:rgba(255,255,255,.55);font-size:.7rem;margin-top:22px;line-height:1.5}
.al a.link{color:#bff3e4}
`;

export default function AppLinkPage() {
  return (
    <div className="al">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="card">
        <div className="logo"><span className="mark">&#8377;</span> SwiftLoan</div>
        <div><span className="pill">● Internal Beta</span></div>
        <h1>Install SwiftLoan</h1>
        <p className="sub">Compare real loan offers from multiple RBI-regulated lenders — one soft check, no hit to your credit score.</p>

        <InstallButtons />

        <p className="note">We pick the right build for your phone automatically — or tap your platform above. iPhone installs via <b>TestFlight</b> (install Apple&rsquo;s TestFlight app first); Android via <b>Google Play testing</b>. Then sign in with your mobile number. Questions? <a className="link" href="mailto:support@swiftloan.ai">support@swiftloan.ai</a></p>

        <p className="fine">Internal beta for employee testing only — not a public offering. SwiftLoan is a loan-comparison &amp; referral platform (a Lending Service Provider), not a lender; loans are provided by RBI-regulated banks and NBFCs. Built by Purpletalk India Private Limited.</p>
      </div>
    </div>
  );
}
