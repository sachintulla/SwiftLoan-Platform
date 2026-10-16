'use client';

import { useEffect, useState } from 'react';

// Real internal-beta install links.
const IOS = 'https://testflight.apple.com/join/Bc429VvP';
const ANDROID = 'https://play.google.com/apps/testing/ai.swiftloan.app';

type Platform = 'ios' | 'android' | 'other';

function detect(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac with touch; treat as iOS.
  const isiOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  if (isiOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

export function InstallButtons() {
  const [platform, setPlatform] = useState<Platform>('other');
  useEffect(() => setPlatform(detect()), []);

  const primaryHref = platform === 'android' ? ANDROID : IOS;
  const primaryLabel =
    platform === 'android' ? 'Install on Android →' : platform === 'ios' ? 'Install on iPhone →' : 'Install the app →';

  return (
    <>
      <a className="cta" href={primaryHref} rel="noopener">{primaryLabel}</a>
      <div className="plat">
        <a href={IOS} rel="noopener">iOS · TestFlight</a>
        <a href={ANDROID} rel="noopener">Android · Play test</a>
      </div>
    </>
  );
}
