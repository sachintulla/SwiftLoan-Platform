import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok } from '../lib/http.js';
import { downloads, contextLinks } from '../config/downloads.js';

// WS3 downloads: the app-build manifest (for the admin App Downloads section)
// and the public landing pages a captured lead opens from their context link.
export const downloadsRouter = Router();

// GET /api/downloads/manifest — the two builds + version, for the admin UI.
downloadsRouter.get('/api/downloads/manifest', ah(async (_req, res) => {
  return ok(res, {
    version: downloads.version,
    deepLinkScheme: downloads.deepLinkScheme,
    builds: [
      { ...downloads.builds.generic, context: false },
      { ...downloads.builds.context, context: true },
    ],
  }, 'Download manifest');
}));

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function landingPage(opts: { title: string; heading: string; sub: string; apkUrl: string; deepLink?: string; summary?: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(opts.title)}</title>
<style>
  :root{--brand:#079FA0;--mint:#2FB183;--ink:#0A3F41}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(160deg,#0A3F41,#079FA0);color:#0b1b1c;min-height:100vh;display:grid;place-items:center;padding:22px}
  .card{background:#fff;border-radius:20px;max-width:420px;width:100%;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  .logo{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--brand),var(--mint));display:grid;place-items:center;color:#fff;font-weight:800;font-size:22px;margin-bottom:16px}
  h1{font-size:21px;margin:0 0 6px;letter-spacing:-.02em}
  p.sub{color:#5b6b6b;margin:0 0 18px;font-size:14px;line-height:1.5}
  .ctx{background:#e4f7f4;border:1px solid #bfeae4;border-radius:12px;padding:12px 14px;margin:0 0 18px;font-size:13.5px;color:#0d5f5a}
  a.btn{display:block;text-align:center;text-decoration:none;font-weight:700;font-size:15px;padding:14px;border-radius:12px;margin:10px 0}
  a.primary{background:var(--brand);color:#fff}
  a.secondary{background:#fff;color:var(--ink);border:1.5px solid var(--brand)}
  ol{color:#5b6b6b;font-size:12.5px;line-height:1.6;padding-left:18px;margin:16px 0 0}
  .foot{color:#8a9a9a;font-size:11px;text-align:center;margin-top:16px}
</style></head>
<body><div class="card">
  <div class="logo">S</div>
  <h1>${esc(opts.heading)}</h1>
  <p class="sub">${esc(opts.sub)}</p>
  ${opts.summary ? `<div class="ctx">${esc(opts.summary)}</div>` : ''}
  <a class="btn primary" href="${esc(opts.apkUrl)}">⬇ Download the app</a>
  ${opts.deepLink ? `<a class="btn secondary" href="${esc(opts.deepLink)}">Already installed? Open with my details →</a>` : ''}
  <ol>
    <li>Tap <b>Download the app</b> and install the APK (allow install from this source if asked).</li>
    ${opts.deepLink ? '<li>After it installs, tap <b>Open with my details</b> to continue right where you left off.</li>' : '<li>Open SwiftLoan and get started.</li>'}
  </ol>
  <div class="foot">SwiftLoan • Fast · Fair · Secure</div>
</div></body></html>`;
}

// GET /d/:token — context landing (the link a captured lead receives).
downloadsRouter.get('/d/:token', ah(async (req, res) => {
  const token = req.params.token.toUpperCase();
  const s = await prisma.lead.findUnique({ where: { token } });
  const links = contextLinks(token);
  const summary = s?.note
    ?? (s?.amount ? `Continuing your ₹${(s.amount / 100).toLocaleString('en-IN')} ${s?.productInterest ?? 'loan'} application${s?.name ? ', ' + s.name : ''}.` : undefined);
  res.type('html').send(landingPage({
    title: 'Continue your SwiftLoan application',
    heading: s?.name ? `Welcome back, ${s.name}` : 'Continue your application',
    sub: 'Pick up your loan application exactly where you left off — your details are already saved.',
    apkUrl: links.contextApkUrl,
    deepLink: links.deepLink,
    summary,
  }));
}));

// GET /d — generic landing (no context).
downloadsRouter.get('/d', ah(async (_req, res) => {
  res.type('html').send(landingPage({
    title: 'Download SwiftLoan',
    heading: 'Get the SwiftLoan app',
    sub: 'Compare offers and apply for a personal or business loan, matched to the right lender.',
    apkUrl: downloads.builds.generic.url,
  }));
}));
