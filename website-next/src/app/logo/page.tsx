import type { Metadata } from 'next';

/**
 * Logo concepts page — faithful mirror of website/logo.html.
 * Self-contained (its own colour tokens, not the shared --sl-* theme),
 * matching the source page which ships its own inline :root palette.
 */
export const metadata: Metadata = {
  title: 'SwiftLoan — Logo',
};

const PAGE_STYLE = `
  .logo-page{
    --teal:#079FA0;--green:#2FB183;--teal-bright:#0CB6A6;--mint:#6FEBBE;
    --dark1:#0C2B2C;--dark2:#0A3F41;--ink:#0F2A2B;--sub:#5C6E6E;--muted:#93A3A3;
    --border:#E4EEED;--card:#FCFBF8;
    --grad-tile:linear-gradient(145deg,#0CB6A6,#2FB183);
    --font-head:'Public Sans',system-ui,sans-serif;--font-body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;
    --sh:0 22px 46px -28px rgba(20,60,58,.34);
  }
  .logo-page{font-family:var(--font-body);color:var(--ink);background:
    radial-gradient(58% 40% at 0% 0%,rgba(47,177,131,.16),transparent 55%),
    radial-gradient(60% 44% at 100% 3%,rgba(245,201,150,.18),transparent 54%),
    radial-gradient(72% 52% at 100% 100%,rgba(7,159,160,.16),transparent 60%),
    linear-gradient(155deg,#FCFBF8,#F5F9F8 52%,#EDF5F3);min-height:100vh;padding:48px 20px 80px}
  .logo-page .wrap{max-width:1080px;margin:0 auto}
  .logo-page h1{font-family:var(--font-head);font-size:2.4rem;font-weight:800;letter-spacing:-.03em;margin-bottom:.4rem}
  .logo-page .lead{color:var(--sub);font-size:1.05rem;margin-bottom:2.6rem;max-width:60ch}
  .logo-page .eyebrow{font-family:var(--font-body);font-weight:700;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin:2.4rem 0 1rem;display:block}
  .logo-page .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .logo-page .card{background:var(--card);border:1px solid var(--border);border-radius:24px;padding:26px;box-shadow:var(--sh);text-align:center}
  .logo-page .card.reco{border:2px solid var(--green)}
  .logo-page .badge{display:inline-block;background:var(--green);color:#fff;font-size:.68rem;font-weight:700;letter-spacing:.04em;padding:.25rem .7rem;border-radius:999px;margin-bottom:14px}
  .logo-page .card h3{font-family:var(--font-head);font-size:1.05rem;margin-bottom:4px}
  .logo-page .card p{font-size:.82rem;color:var(--muted);min-height:2.4em}
  .logo-page .mark-slot{display:grid;place-items:center;padding:22px 0 18px}
  .logo-page .row{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
  .logo-page .panel{background:var(--card);border:1px solid var(--border);border-radius:24px;padding:30px 34px;box-shadow:var(--sh);margin-bottom:18px}
  .logo-page .panel--dark{background:linear-gradient(150deg,#0C2B2C,#0A3F41 70%,#0E6E5C 130%);border:none;color:#fff}
  .logo-page .lockup{display:inline-flex;align-items:center;gap:16px}
  .logo-page .wordmark{font-family:var(--font-head);font-weight:800;font-size:2.5rem;letter-spacing:-.03em;line-height:1}
  .logo-page .wordmark .sw{color:var(--teal)}
  .logo-page .wordmark .ln{color:var(--ink)}
  .logo-page .panel--dark .wordmark .sw{color:#6FEBBE}
  .logo-page .panel--dark .wordmark .ln{color:#fff}
  .logo-page .wordmark small{display:block;font-family:var(--font-body);font-size:.7rem;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);margin-top:6px}
  .logo-page .panel--dark .wordmark small{color:#9fc4bf}
  .logo-page .sizes{display:flex;align-items:flex-end;gap:26px;flex-wrap:wrap}
  .logo-page .sizes figure{text-align:center}
  .logo-page .sizes figcaption{font-family:var(--mono);font-size:.72rem;color:var(--muted);margin-top:8px}
  .logo-page .swatches{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px}
  .logo-page .sw-chip{border:1px solid var(--border);border-radius:14px;overflow:hidden;width:150px}
  .logo-page .sw-chip .fill{height:60px}
  .logo-page .sw-chip .meta{padding:8px 12px}
  .logo-page .sw-chip .n{font-size:.8rem;font-weight:700}
  .logo-page .sw-chip .h{font-family:var(--mono);font-size:.72rem;color:var(--muted)}
  .logo-page .usage{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .logo-page .u{display:flex;gap:12px;align-items:flex-start;font-size:.86rem;color:var(--sub)}
  .logo-page .u b{color:var(--ink)}
  .logo-page .dot{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;color:#fff;font-weight:800;font-size:.8rem}
  .logo-page .ok{background:var(--green)}.logo-page .no{background:#D9524E}
  .logo-page .note{font-size:.8rem;color:var(--muted);margin-top:10px}
  @media(max-width:820px){.logo-page .grid{grid-template-columns:1fr}.logo-page .usage{grid-template-columns:1fr}.logo-page .wordmark{font-size:2rem}}
`;

const BODY_HTML = `
<div class="wrap">
  <h1>SwiftLoan — Logo</h1>
  <p class="lead">The rupee, disbursed swiftly. The exact ₹ symbol leans forward with speed streaks trailing behind it — money in motion — set in the brand's teal→green gradient tile.</p>

  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <defs>
      <linearGradient id="slg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0CB6A6"/><stop offset="1" stop-color="#2FB183"/>
      </linearGradient>
      <linearGradient id="slg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#079FA0"/><stop offset="1" stop-color="#2FB183"/>
      </linearGradient>

      <symbol id="markA" viewBox="0 0 120 120">
        <rect width="120" height="120" rx="30" fill="url(#slg)"/>
        <g stroke="#fff" stroke-linecap="round" fill="none">
          <line x1="16" y1="43" x2="40" y2="43" stroke-width="6" opacity=".32"/>
          <line x1="12" y1="60" x2="38" y2="60" stroke-width="6" opacity=".55"/>
          <line x1="18" y1="77" x2="42" y2="77" stroke-width="6" opacity=".82"/>
        </g>
        <g transform="skewX(-7)">
          <text x="82" y="87" text-anchor="middle" fill="#fff"
            font-family="'Public Sans',Arial,sans-serif" font-size="84" font-weight="800">₹</text>
        </g>
      </symbol>

      <symbol id="markB" viewBox="0 0 120 120">
        <rect width="120" height="120" rx="30" fill="url(#slg)"/>
        <circle cx="64" cy="60" r="34" fill="none" stroke="#fff" stroke-width="5" opacity=".9"/>
        <circle cx="64" cy="60" r="34" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"
          stroke-dasharray="150 400" transform="rotate(-45 64 60)" opacity=".35"/>
        <g stroke="#fff" stroke-linecap="round">
          <line x1="10" y1="46" x2="26" y2="46" stroke-width="5.5" opacity=".5"/>
          <line x1="6" y1="60" x2="24" y2="60" stroke-width="5.5" opacity=".75"/>
          <line x1="10" y1="74" x2="26" y2="74" stroke-width="5.5" opacity=".5"/>
        </g>
        <text x="64" y="80" text-anchor="middle" fill="#fff"
          font-family="'Public Sans',Arial,sans-serif" font-size="52" font-weight="800">₹</text>
      </symbol>

      <symbol id="markC" viewBox="0 0 120 120">
        <rect width="120" height="120" rx="30" fill="url(#slg)"/>
        <path d="M22 84 H86" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55"/>
        <path d="M74 74 L92 84 L74 94" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
        <g stroke="#fff" stroke-linecap="round" opacity=".45">
          <line x1="16" y1="34" x2="36" y2="34" stroke-width="5.5"/>
          <line x1="12" y1="52" x2="34" y2="52" stroke-width="5.5"/>
        </g>
        <g transform="skewX(-8)">
          <text x="76" y="66" text-anchor="middle" fill="#fff"
            font-family="'Public Sans',Arial,sans-serif" font-size="60" font-weight="800">₹</text>
        </g>
      </symbol>
    </defs>
  </svg>

  <span class="eyebrow">Three concepts · pick one</span>
  <div class="grid">
    <div class="card reco">
      <span class="badge">Recommended</span>
      <h3>A · Rupee Rush</h3>
      <div class="mark-slot"><svg width="110" height="110"><use href="#markA"/></svg></div>
      <p>Exact ₹ leaning forward, three speed streaks trailing — money moving fast.</p>
    </div>
    <div class="card">
      <h3>B · Coin Dash</h3>
      <div class="mark-slot"><svg width="110" height="110"><use href="#markB"/></svg></div>
      <p>₹ struck on a coin with a motion arc and streaks — literal "Indian money", in a hurry.</p>
    </div>
    <div class="card">
      <h3>C · Disburse</h3>
      <div class="mark-slot"><svg width="110" height="110"><use href="#markC"/></svg></div>
      <p>₹ riding a forward send-arrow — the rupee being disbursed to you.</p>
    </div>
  </div>

  <span class="eyebrow">Primary lockup · light</span>
  <div class="panel">
    <div class="lockup">
      <svg width="76" height="76"><use href="#markA"/></svg>
      <span class="wordmark"><span class="sw">Swift</span><span class="ln">Loan</span>
        <small>Fast · Fair · Secure</small></span>
    </div>
  </div>

  <span class="eyebrow">Primary lockup · dark</span>
  <div class="panel panel--dark">
    <div class="lockup">
      <svg width="76" height="76"><use href="#markA"/></svg>
      <span class="wordmark"><span class="sw">Swift</span><span class="ln">Loan</span>
        <small>Fast · Fair · Secure</small></span>
    </div>
  </div>

  <span class="eyebrow">Scales to favicon</span>
  <div class="panel">
    <div class="sizes">
      <figure><svg width="120" height="120"><use href="#markA"/></svg><figcaption>120px · app icon</figcaption></figure>
      <figure><svg width="72" height="72"><use href="#markA"/></svg><figcaption>72px</figcaption></figure>
      <figure><svg width="48" height="48"><use href="#markA"/></svg><figcaption>48px</figcaption></figure>
      <figure><svg width="32" height="32"><use href="#markA"/></svg><figcaption>32px</figcaption></figure>
      <figure><svg width="16" height="16"><use href="#markA"/></svg><figcaption>16px · favicon</figcaption></figure>
    </div>
  </div>

  <span class="eyebrow">Colour &amp; type</span>
  <div class="panel">
    <div class="swatches">
      <div class="sw-chip"><div class="fill" style="background:#079FA0"></div><div class="meta"><div class="n">Primary Teal</div><div class="h">#079FA0</div></div></div>
      <div class="sw-chip"><div class="fill" style="background:#2FB183"></div><div class="meta"><div class="n">Secondary Green</div><div class="h">#2FB183</div></div></div>
      <div class="sw-chip"><div class="fill" style="background:linear-gradient(145deg,#0CB6A6,#2FB183)"></div><div class="meta"><div class="n">Tile gradient</div><div class="h">145°</div></div></div>
      <div class="sw-chip"><div class="fill" style="background:#0F2A2B"></div><div class="meta"><div class="n">Ink</div><div class="h">#0F2A2B</div></div></div>
      <div class="sw-chip"><div class="fill" style="background:#6FEBBE"></div><div class="meta"><div class="n">Mint (on dark)</div><div class="h">#6FEBBE</div></div></div>
    </div>
    <p class="note">Wordmark: <b style="color:var(--ink)">Public Sans 800</b>, tracking −0.03em. "Swift" in Teal, "Loan" in Ink (Mint + White on dark). Glyph is the exact Unicode ₹.</p>
  </div>

  <span class="eyebrow">Do &amp; don't</span>
  <div class="panel">
    <div class="usage">
      <div class="u"><span class="dot ok">✓</span><div><b>Keep the streaks behind the ₹.</b> They read left-to-right as motion — the rupee arriving fast.</div></div>
      <div class="u"><span class="dot ok">✓</span><div><b>Use the gradient tile</b> on light backgrounds; mark stays white inside.</div></div>
      <div class="u"><span class="dot ok">✓</span><div><b>Give it clear space</b> equal to the tile's corner radius on all sides.</div></div>
      <div class="u"><span class="dot no">✕</span><div><b>Don't</b> recolour the ₹, rotate the tile, add a drop shadow to the glyph, or stretch the lockup.</div></div>
    </div>
  </div>
</div>
`;

export default function LogoPage() {
  return (
    <div className="logo-page">
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLE }} />
      <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </div>
  );
}
