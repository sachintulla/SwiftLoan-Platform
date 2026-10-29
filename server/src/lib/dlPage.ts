import { randomBytes } from 'node:crypto';

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A fresh, unguessable value for ONE response: it lets that response's own inline script run, and nothing else. */
export const newNonce = (): string => randomBytes(16).toString('base64');

/**
 * The security policy for the /dl page.
 *
 * The server's default policy (helmet) is `script-src 'self'`, which forbids inline scripts. This page's whole job is one
 * inline script (copy the install token to the clipboard inside the tap, then go to the store), so under the default
 * policy the browser silently refused to run it: the button just followed its link to TestFlight with nothing copied, and
 * the iOS clipboard hand-off never worked. This page gets its own, stricter policy that allows exactly its one script,
 * by nonce, and nothing else (no network, no frames, no forms, no other scripts).
 */
export function dlContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The iOS interstitial: a one-tap page that copies the click token to the clipboard (Safari only allows that on a user
 * gesture) so the app can read it on first launch, then continues to TestFlight / the App Store.
 * `debug` (?debug=1) shows whether the copy worked and holds the page for a few seconds before leaving.
 */
export function renderDlPage(opts: { target: string; clip: string; debug: boolean; nonce: string }): string {
  const { target, clip, debug, nonce } = opts;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Get SwiftLoan</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:linear-gradient(160deg,#0A3F41,#079FA0);min-height:100vh;display:grid;place-items:center;padding:22px}
.c{background:#fff;border-radius:20px;max-width:380px;width:100%;padding:28px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)}
h1{font-size:21px;margin:0 0 8px;color:#0A3F41}p{color:#5b6b6b;font-size:14px;line-height:1.5;margin:0 0 20px}
a{display:block;background:#079FA0;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:12px}small{display:block;color:#8a9a9a;margin-top:14px;font-size:11px}</style></head>
<body><div class="c"><h1>Get the SwiftLoan app</h1><p>Install it, then open it — we'll pick up your invite automatically.</p>
<a id="go" href="${esc(target)}">Continue to install</a><small>SwiftLoan • Fast · Fair · Secure</small><pre id="dbg" style="text-align:left;font-size:11px;white-space:pre-wrap;color:#333"></pre></div>
<script nonce="${nonce}">
(function(){var go=document.getElementById('go'),clip=${JSON.stringify(clip)},url=${JSON.stringify(target)};
go.addEventListener('click',function(e){e.preventDefault();
var debug=${debug ? 'true' : 'false'},dbg=document.getElementById('dbg'),notes=[];
function note(m){notes.push(m);if(debug&&dbg)dbg.textContent=notes.join('\\n')}
function next(){if(debug){setTimeout(function(){location.href=url},8000)}else{location.href=url}}
// execCommand needs to run inside the tap, so the fallback is also used when the async API is missing or rejects
// (in-app browsers such as WhatsApp's reject writeText); a rejection used to skip it and send them off with nothing copied.
function legacy(){try{var t=document.createElement('textarea');t.value=clip;t.setAttribute('readonly','');t.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(t);t.focus();t.select();t.setSelectionRange(0,clip.length);var ok=document.execCommand('copy');document.body.removeChild(t);note('execCommand copy: '+ok);return ok}catch(e){note('execCommand error: '+e);return false}}
var done=false;function once(){if(!done){done=true;next()}}
note('secure context: '+window.isSecureContext+', clipboard api: '+!!(navigator.clipboard&&navigator.clipboard.writeText));
try{if(navigator.clipboard&&navigator.clipboard.writeText){
  // Copy with the legacy path right away (still inside the tap), then also try the async API before leaving.
  legacy();
  navigator.clipboard.writeText(clip).then(function(){note('writeText: ok');once()},function(e){note('writeText rejected: '+e);once()});setTimeout(once,600);return}}catch(_){}
legacy();next()})})();
</script></body></html>`;
}
