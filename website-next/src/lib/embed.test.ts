// @vitest-environment jsdom
// "Is this page inside the mobile app's WebView?" — the signal that switches off the ads consent
// banner, the Meta Pixel and the website's own Ruby there.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMBED_STORAGE_KEY, isEmbeddedInApp } from './embed';

const go = (url: string) => window.history.replaceState(null, '', url);
type RN = { ReactNativeWebView?: unknown };

beforeEach(() => { window.sessionStorage.clear(); go('/privacy-policy'); });
afterEach(() => { delete (window as unknown as RN).ReactNativeWebView; });

describe('isEmbeddedInApp', () => {
  it('is false in an ordinary browser tab', () => {
    expect(isEmbeddedInApp()).toBe(false);
  });

  it('is true when the page was opened with ?embed=app', () => {
    go('/privacy-policy?embed=app');
    expect(isEmbeddedInApp()).toBe(true);
  });

  it('stays true for the rest of the tab after a link without the parameter', () => {
    go('/privacy-policy?embed=app');
    isEmbeddedInApp();
    go('/compliance');
    expect(window.sessionStorage.getItem(EMBED_STORAGE_KEY)).toBe('app');
    expect(isEmbeddedInApp()).toBe(true);
  });

  it('ignores any other value', () => {
    go('/privacy-policy?embed=1');
    expect(isEmbeddedInApp()).toBe(false);
    go('/privacy-policy?embedded=app');
    expect(isEmbeddedInApp()).toBe(false);
  });

  it('is true inside react-native-webview (window.ReactNativeWebView)', () => {
    (window as unknown as RN).ReactNativeWebView = { postMessage() {} };
    expect(isEmbeddedInApp()).toBe(true);
  });
});
