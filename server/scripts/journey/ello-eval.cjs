// Evaluate JS in the running app (Hermes) through Metro's inspector. Usage: node ello-eval.cjs '<expr>' [--promise]
const WebSocket = require(require('path').join(__dirname, '../../../node_modules/ws'));
const http = require('http');
const expr = process.argv[2]; const isPromise = process.argv.includes('--promise');
http.get('http://localhost:8081/json/list', (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
  const t = JSON.parse(d).find((x) => x.appId === 'ai.swiftloan.app'); if (!t) { console.log('NO TARGET'); process.exit(2); }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { headers: { Origin: 'http://localhost:8081' } });
  let id = 0; const pending = new Map();
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.on('message', (m) => { const j = JSON.parse(m); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); } });
  ws.on('open', async () => {
    const key = '__jr' + Date.now();
    const wrapped = isPromise ? `globalThis.${key}=undefined; Promise.resolve(${expr}).then(r=>{globalThis.${key}=JSON.stringify(r===undefined?null:r)}).catch(e=>{globalThis.${key}=JSON.stringify({__error:String(e&&e.message||e)})}); 'started'` : `JSON.stringify(${expr})`;
    const first = await send('Runtime.evaluate', { expression: wrapped, returnByValue: true });
    if (!isPromise) { console.log(first.result?.result?.value ?? JSON.stringify(first)); process.exit(0); }
    for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); const r = await send('Runtime.evaluate', { expression: `globalThis.${key}`, returnByValue: true }); const v = r.result?.result?.value; if (v !== undefined) { console.log(v); process.exit(0); } }
    console.log('TIMEOUT'); process.exit(3);
  });
}); });
