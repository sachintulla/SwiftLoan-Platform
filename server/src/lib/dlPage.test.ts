import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { dlContentSecurityPolicy, newNonce, renderDlPage } from './dlPage';

const TOKEN = 'swiftloan-ref:ABCDEF123456';
const TARGET = 'https://testflight.apple.com/join/XYZ';
const scriptOf = (html: string) => html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1];

describe('the /dl page policy (regression: helmet\'s default policy silently blocked the page\'s own script)', () => {
  it('allows exactly the page\'s own script, by nonce, and no other script', () => {
    const n = newNonce();
    const csp = dlContentSecurityPolicy(n);
    expect(csp).toContain(`script-src 'nonce-${n}'`);
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain("'self'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('the nonce is fresh for every response', () => {
    expect(newNonce()).not.toBe(newNonce());
    expect(newNonce().length).toBeGreaterThanOrEqual(22);
  });

  it('the page carries that nonce on its one script, and has no other script', () => {
    const n = newNonce();
    const html = renderDlPage({ target: TARGET, clip: TOKEN, debug: false, nonce: n });
    expect(html).toContain(`<script nonce="${n}">`);
    expect((html.match(/<script/g) ?? []).length).toBe(1);
    expect(html).toContain(`href="${TARGET}"`);
  });

  it('over HTTP, the page\'s policy REPLACES helmet\'s default one (which forbids inline scripts)', async () => {
    const app = express();
    app.use(helmet());
    app.get('/dl', (_req, res) => {
      const nonce = newNonce();
      res.setHeader('Content-Security-Policy', dlContentSecurityPolicy(nonce));
      res.type('html').send(renderDlPage({ target: TARGET, clip: TOKEN, debug: false, nonce }));
    });
    const server = await new Promise<http.Server>((r) => { const s = app.listen(0, () => r(s)); });
    try {
      const port = (server.address() as { port: number }).port;
      const { headers, body } = await new Promise<{ headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
        http.get({ port, path: '/dl' }, (res) => {
          let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ headers: res.headers, body: b }));
        }).on('error', reject);
      });
      const csp = String(headers['content-security-policy']);
      const nonce = body.match(/<script nonce="([^"]+)">/)![1];
      expect(csp).toContain(`script-src 'nonce-${nonce}'`);
      expect(csp).not.toContain("script-src 'self'");     // helmet's default is gone
      expect(Array.isArray(headers['content-security-policy'])).toBe(false); // one header, not two
    } finally {
      server.close();
    }
  });
});

describe('the page\'s script: a tap copies the token, then goes to the store', () => {
  function run(debug: boolean, opts: { clipboardApi?: 'ok' | 'reject' | 'missing'; execCommand?: boolean } = {}) {
    const html = renderDlPage({ target: TARGET, clip: TOKEN, debug, nonce: 'N' });
    const calls: string[] = [];
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const location = { href: '' };
    const dbg = { textContent: '' };
    let click: ((e: { preventDefault: () => void }) => void) | undefined;
    const go = { addEventListener: (_t: string, fn: typeof click) => { click = fn; } };
    const textarea: Record<string, unknown> = { style: {}, setAttribute() {}, focus() { calls.push('focus'); }, select() { calls.push('select'); }, setSelectionRange() {} };
    const document = {
      getElementById: (id: string) => (id === 'go' ? go : id === 'dbg' ? dbg : null),
      createElement: () => textarea,
      body: { appendChild() {}, removeChild() {} },
      execCommand: (c: string) => { calls.push('exec:' + c); return opts.execCommand !== false; },
    };
    const clipboardApi = opts.clipboardApi ?? 'ok';
    const navigator = clipboardApi === 'missing' ? {} : {
      clipboard: { writeText: (t: string) => { calls.push('write:' + t); return clipboardApi === 'ok' ? Promise.resolve() : Promise.reject(new Error('denied')); } },
    };
    (document as { execCommand: unknown }).execCommand = document.execCommand;
    const ctx = vm.createContext({
      document: { ...document, execCommand: document.execCommand }, navigator, location, window: { isSecureContext: true },
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return 0; }, Promise,
    });
    vm.runInContext(scriptOf(html), ctx);
    expect(click, 'the script must attach its click handler').toBeTypeOf('function');
    let prevented = false;
    click!({ preventDefault: () => { prevented = true; } });
    return { calls, timers, location, dbg, get prevented() { return prevented; }, clickAgain: () => click!({ preventDefault() {} }) };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  it('holds the default link action, copies the token (twice over: legacy copy and clipboard API), then goes to the store', async () => {
    const r = run(false);
    expect(r.prevented).toBe(true);                       // without this the button just follows its link and nothing is copied
    expect(r.calls).toContain('exec:copy');
    expect(r.calls).toContain('write:' + TOKEN);
    await flush();
    expect(r.location.href).toBe(TARGET);
  });

  it('still goes to the store when the clipboard API is rejected (the legacy copy was already done)', async () => {
    const r = run(false, { clipboardApi: 'reject' });
    expect(r.calls).toContain('exec:copy');
    await flush();
    expect(r.location.href).toBe(TARGET);
  });

  it('still goes to the store when there is no clipboard API at all', () => {
    const r = run(false, { clipboardApi: 'missing' });
    expect(r.calls).toContain('exec:copy');
    expect(r.location.href).toBe(TARGET);
  });

  it('debug mode shows what happened and holds the page for 8 seconds before leaving', async () => {
    const r = run(true);
    await flush();
    expect(r.dbg.textContent).toContain('writeText: ok');
    expect(r.dbg.textContent).toContain('execCommand copy: true');
    expect(r.location.href).toBe('');                    // not yet: it is waiting
    const wait = r.timers.find((t) => t.ms === 8000);
    expect(wait).toBeTruthy();
    wait!.fn();
    expect(r.location.href).toBe(TARGET);
  });
});
