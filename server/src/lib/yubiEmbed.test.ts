import { describe, expect, it, vi } from 'vitest';

vi.mock('./prisma.js', () => ({ prisma: {} }));
const { embeddableFromHeaders, probeEmbeddable } = await import('./yubiReferral.js');

const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
const SITE = 'https://swiftloan.ai';

describe('embeddableFromHeaders — will a browser render the partner page in our iframe?', () => {
  it('no restriction → embeddable', () => {
    expect(embeddableFromHeaders(h({}), SITE)).toBe(true);
  });
  it('today\'s YMPL headers (DENY + frame-ancestors none) → not embeddable', () => {
    expect(embeddableFromHeaders(h({ 'x-frame-options': 'DENY', 'content-security-policy': 'frame-ancestors none' }), SITE)).toBe(false);
  });
  it.each(['DENY', 'deny', 'SAMEORIGIN', 'ALLOW-FROM https://swiftloan.ai'])('X-Frame-Options %s blocks', (v) => {
    expect(embeddableFromHeaders(h({ 'x-frame-options': v }), SITE)).toBe(false);
  });
  it("frame-ancestors 'none' / 'self' block", () => {
    expect(embeddableFromHeaders(h({ 'content-security-policy': "frame-ancestors 'none'" }), SITE)).toBe(false);
    expect(embeddableFromHeaders(h({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self'" }), SITE)).toBe(false);
  });
  it('frame-ancestors * allows everyone', () => {
    expect(embeddableFromHeaders(h({ 'content-security-policy': 'frame-ancestors *' }), SITE)).toBe(true);
  });
  it('an allow-list passes only the listed origins', () => {
    const csp = 'frame-ancestors https://swiftloan.ai https://*.swiftloan.ai';
    expect(embeddableFromHeaders(h({ 'content-security-policy': csp }), 'https://swiftloan.ai')).toBe(true);
    expect(embeddableFromHeaders(h({ 'content-security-policy': csp }), 'https://dev.swiftloan.ai')).toBe(true);
    expect(embeddableFromHeaders(h({ 'content-security-policy': csp }), 'https://evil.example')).toBe(false);
    expect(embeddableFromHeaders(h({ 'content-security-policy': csp }), 'http://swiftloan.ai')).toBe(false);
    expect(embeddableFromHeaders(h({ 'content-security-policy': csp }), null)).toBe(false);
  });
  it('a scheme source (https:) allows any https origin', () => {
    expect(embeddableFromHeaders(h({ 'content-security-policy': 'frame-ancestors https:' }), SITE)).toBe(true);
    expect(embeddableFromHeaders(h({ 'content-security-policy': 'frame-ancestors https:' }), 'http://localhost:4002')).toBe(false);
  });
  it('other CSP directives without frame-ancestors do not restrict framing', () => {
    expect(embeddableFromHeaders(h({ 'content-security-policy': "default-src 'self'; script-src 'self'" }), SITE)).toBe(true);
  });
});

describe('probeEmbeddable', () => {
  const resp = (headers: Record<string, string>) => ({ headers: new Headers(headers) });
  it('reads the partner origin root (never the tokenised URL) and caches it', async () => {
    const f = vi.fn().mockResolvedValue(resp({ 'x-frame-options': 'DENY' }));
    vi.stubGlobal('fetch', f);
    expect(await probeEmbeddable('https://journey.example/?token=SECRET', SITE)).toBe(false);
    expect(await probeEmbeddable('https://journey.example/other?token=OTHER', SITE)).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://journey.example/');
    expect(JSON.stringify(f.mock.calls)).not.toContain('SECRET');
    vi.unstubAllGlobals();
  });
  it('is embeddable when the partner sends no framing headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({})));
    expect(await probeEmbeddable('https://open.example/?t=1', SITE)).toBe(true);
    vi.unstubAllGlobals();
  });
  it('fails closed on a network error or a bad url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await probeEmbeddable('https://down.example/?t=1', SITE)).toBe(false);
    expect(await probeEmbeddable('not a url', SITE)).toBe(false);
    vi.unstubAllGlobals();
  });
});
