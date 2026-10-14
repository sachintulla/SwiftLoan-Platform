/**
 * Internal API-traffic viewer — GET /logs renders a self-contained HTML page;
 * GET /logs/data returns the rows as JSON (the page polls it). Shows the last
 * 24 hours of inbound (app ↔ swiftloan-api) and outbound (swiftloan-api ↔
 * Aurix) requests/responses, for internal verification.
 *
 * Optional gate: set LOGS_ACCESS_TOKEN and callers must pass ?key=<token>.
 * Bodies are already redacted for sensitive keys (see lib/apiLog.ts).
 */
import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { listApiLogs } from '../lib/apiLog.js';

export const logsRouter = Router();

// Fail closed: the log table holds request/response bodies, so in production the
// viewer is only reachable when LOGS_ACCESS_TOKEN is set. Outside production an
// unset token leaves it open for local development.
const TOKEN = process.env.LOGS_ACCESS_TOKEN || '';
const IS_PROD = process.env.NODE_ENV === 'production';

function keyMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

logsRouter.use((req, res, next) => {
  if (!TOKEN) {
    if (IS_PROD) return res.status(404).type('text/plain').send('Not found');
    return next();
  }
  const key = (typeof req.query.key === 'string' ? req.query.key : '') || req.get('x-logs-key') || '';
  if (!keyMatches(key)) return res.status(401).type('text/plain').send('Unauthorized — append ?key=<token>');
  next();
});

logsRouter.get('/data', ah(async (req, res) => {
  const rows = await listApiLogs({
    limit: parseInt(String(req.query.limit ?? ''), 10) || 200,
    direction: (req.query.direction as any) || undefined,
    target: (req.query.target as string) || undefined,
    q: (req.query.q as string) || undefined,
  });
  res.json({ success: true, count: rows.length, logs: rows });
}));

logsRouter.get('/', (_req, res) => {
  res.type('html').send(PAGE);
});

const PAGE = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SwiftLoan · API Logs</title>
<style>
  :root{--bg:#0b1a1b;--card:#122829;--line:#22403f;--ink:#eaf4f3;--muted:#8aa0a0;--teal:#33c0be;--amber:#f4b45c;--red:#ff6b6b;--green:#5bd6a2}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  header{position:sticky;top:0;background:linear-gradient(150deg,#083e40,#079fa0);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;z-index:2}
  header h1{margin:0;font-size:16px;font-weight:800;color:#fff}
  header .sub{color:rgba(255,255,255,.85);font-size:12px}
  .controls{display:flex;gap:8px;align-items:center;margin-left:auto;flex-wrap:wrap}
  select,input,button{font:inherit;color:var(--ink);background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 9px}
  button{cursor:pointer}
  .wrap{padding:12px 16px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{position:sticky;top:52px;background:var(--card);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px}
  tr:hover{background:rgba(255,255,255,.03)}
  .tag{display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:.3px}
  .in{background:#123a2c;color:var(--green)} .out{background:#3a2e12;color:var(--amber)}
  .aurix{color:var(--amber);font-weight:700} .swift{color:var(--teal);font-weight:700}
  .status2{color:var(--green)} .status4,.status5,.status0{color:var(--red)}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
  .url{max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  details summary{cursor:pointer;color:var(--teal)}
  pre{white-space:pre-wrap;word-break:break-word;background:#0e2122;border:1px solid var(--line);border-radius:8px;padding:8px;margin:6px 0 0;max-height:280px;overflow:auto}
  .muted{color:var(--muted)}
  .empty{padding:40px;text-align:center;color:var(--muted)}
</style></head><body>
<header>
  <div><h1>SwiftLoan · API Logs</h1><div class="sub">Inbound (app ↔ API) &amp; outbound (API ↔ Aurix) · last 24h</div></div>
  <div class="controls">
    <select id="direction"><option value="">All directions</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select>
    <select id="target"><option value="">All targets</option><option value="aurix">Aurix</option><option value="swiftloan-api">SwiftLoan API</option></select>
    <input id="q" placeholder="filter URL…" size="16">
    <label class="sub"><input type="checkbox" id="auto" checked> auto</label>
    <button id="refresh">Refresh</button>
  </div>
</header>
<div class="wrap"><table><thead><tr>
  <th>Time</th><th>Dir</th><th>Route</th><th>Method</th><th>URL</th><th>Status</th><th>ms</th><th>Payloads</th>
</tr></thead><tbody id="rows"><tr><td colspan="8" class="empty">Loading…</td></tr></tbody></table></div>
<script>
  var key = new URLSearchParams(location.search).get('key');
  function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmtTime(t){var d=new Date(t);return d.toLocaleTimeString('en-GB')+'.'+String(d.getMilliseconds()).padStart(3,'0');}
  function statusCls(s){if(s==null)return 'status0';return 'status'+String(s)[0];}
  function payload(label,val){if(!val)return '';return '<details><summary>'+label+'</summary><pre>'+esc(val)+'</pre></details>';}
  async function load(){
    var p=new URLSearchParams();
    var dir=document.getElementById('direction').value; if(dir)p.set('direction',dir);
    var tg=document.getElementById('target').value; if(tg)p.set('target',tg);
    var q=document.getElementById('q').value.trim(); if(q)p.set('q',q);
    p.set('limit','300'); if(key)p.set('key',key);
    try{
      var base=location.pathname.replace(/\\/+$/,'');var r=await fetch(base+'/data?'+p.toString()); var j=await r.json();
      var rows=(j.logs||[]);
      var tb=document.getElementById('rows');
      if(!rows.length){tb.innerHTML='<tr><td colspan="8" class="empty">No logs yet.</td></tr>';return;}
      tb.innerHTML=rows.map(function(x){
        var route=(x.source||'')+' → '+(x.target||'');
        var routeCls=(x.target==='aurix'||x.source==='aurix')?'aurix':'swift';
        return '<tr>'+
          '<td class="mono muted">'+fmtTime(x.createdAt)+'</td>'+
          '<td><span class="tag '+(x.direction==='inbound'?'in':'out')+'">'+esc(x.direction)+'</span></td>'+
          '<td class="'+routeCls+'">'+esc(route)+'</td>'+
          '<td class="mono">'+esc(x.method)+'</td>'+
          '<td class="mono url" title="'+esc(x.url)+'">'+esc(x.url)+'</td>'+
          '<td class="mono '+statusCls(x.status)+'">'+(x.status==null?'—':x.status)+'</td>'+
          '<td class="mono muted">'+(x.durationMs==null?'':x.durationMs)+'</td>'+
          '<td>'+payload('request',x.requestBody)+payload('response',x.responseBody)+(x.error?'<div style="color:var(--red)">'+esc(x.error)+'</div>':'')+'</td>'+
        '</tr>';
      }).join('');
    }catch(e){document.getElementById('rows').innerHTML='<tr><td colspan="8" class="empty">Failed to load: '+esc(e.message)+'</td></tr>';}
  }
  document.getElementById('refresh').onclick=load;
  ['direction','target'].forEach(function(id){document.getElementById(id).onchange=load;});
  document.getElementById('q').oninput=function(){clearTimeout(window._t);window._t=setTimeout(load,300);};
  setInterval(function(){if(document.getElementById('auto').checked)load();},5000);
  load();
</script></body></html>`;
