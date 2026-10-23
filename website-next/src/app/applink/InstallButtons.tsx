'use client';

import { useEffect, useState } from 'react';

// Real internal-beta install links.
const IOS = 'https://testflight.apple.com/join/Bc429VvP';
const ANDROID = 'https://play.google.com/store/apps/details?id=ai.swiftloan.app';

type Platform = 'ios' | 'android' | 'other';

function detect(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac with touch; treat as iOS.
  const isiOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  if (isiOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

const urlFor = (p: Platform) => (p === 'android' ? ANDROID : IOS);

export function InstallButtons() {
  const [platform, setPlatform] = useState<Platform>('other');
  useEffect(() => setPlatform(detect()), []);

  // Detect again at click time (most reliable) and redirect to the right store.
  const install = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = urlFor(detect());
  };

  const label =
    platform === 'android' ? 'Install on Android →' : platform === 'ios' ? 'Install on iPhone →' : 'Install the app →';

  return (
    <>
      {/* href is a no-JS fallback; onClick re-detects and redirects on tap */}
      <a className="cta" href={urlFor(platform)} onClick={install} rel="noopener">{label}</a>
      <div className="plat">
        <a href={IOS} rel="noopener">iPhone · TestFlight</a>
        <a href={ANDROID} rel="noopener">Android · Play test</a>
      </div>
    </>
  );
}
