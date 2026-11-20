// @vitest-environment jsdom
// The ads consent banner: asked in a browser, on the banner layer (above Ruby); never shown, and no
// Pixel loaded, inside the mobile app's WebView (?embed=app).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/config/meta', () => ({
  META_ENABLED: true,
  META_PIXEL_ID: '123456789',
  META_SDK_URL: 'https://connect.facebook.net/en_US/fbevents.js',
}));
vi.mock('@/lib/leads', () => ({ apiBase: () => 'https://api.test' }));
vi.mock('@/lib/session', () => ({ getAccessToken: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/privacy-policy' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import MetaPixel from './MetaPixel';
import { LAYERS } from '@/lib/layers';
import { META_CONSENT_KEY, __resetMetaForTests, metaAllowed } from '@/lib/meta';

const go = (url: string) => window.history.replaceState(null, '', url);
const banner = () => document.querySelector('[data-consent-banner]') as HTMLElement | null;
const pixelScript = () => document.querySelector('script[src*="fbevents"]');

beforeEach(() => {
  __resetMetaForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  document.head.innerHTML = '';
  go('/privacy-policy');
});
afterEach(cleanup);

describe('ads consent banner', () => {
  it('asks in a browser, with both buttons, on the banner layer (above Ruby)', () => {
    render(<MetaPixel />);
    expect(banner()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeTruthy();
    expect(Number(banner()!.style.zIndex)).toBe(LAYERS.banner);
    expect(Number(banner()!.style.zIndex)).toBeGreaterThan(LAYERS.ruby);
  });

  it('goes away once answered', () => {
    render(<MetaPixel />);
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(banner()).toBeNull();
    expect(window.localStorage.getItem(META_CONSENT_KEY)).toBe('denied');
  });

  it('is not shown inside the app (?embed=app), and nothing is stored or loaded', () => {
    go('/privacy-policy?embed=app');
    render(<MetaPixel />);
    expect(banner()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(window.localStorage.getItem(META_CONSENT_KEY)).toBeNull();
    expect(pixelScript()).toBeNull();
  });

  it('keeps the Pixel off inside the app even if this WebView once stored a yes', () => {
    window.localStorage.setItem(META_CONSENT_KEY, 'granted');
    go('/privacy-policy?embed=app');
    render(<MetaPixel />);
    expect(metaAllowed()).toBe(false);
    expect(pixelScript()).toBeNull();
    expect(banner()).toBeNull();
  });

  it('still loads the Pixel in a browser for a visitor who said yes (unchanged)', () => {
    window.localStorage.setItem(META_CONSENT_KEY, 'granted');
    render(<MetaPixel />);
    expect(pixelScript()).not.toBeNull();
    expect(banner()).toBeNull();
  });
});
