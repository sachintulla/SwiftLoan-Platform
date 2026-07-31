import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import VoiceWidget from '@/components/VoiceWidget';
import './globals.css';

// Self-hosted (not next/font/google) so builds don't depend on reaching
// fonts.googleapis.com — that fetch fails behind some corporate proxies/MITM certs.
const openSans = localFont({
  src: [
    { path: './fonts/OpenSans-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/OpenSans-500.ttf', weight: '500', style: 'normal' },
    { path: './fonts/OpenSans-600.ttf', weight: '600', style: 'normal' },
    { path: './fonts/OpenSans-700.ttf', weight: '700', style: 'normal' },
    { path: './fonts/OpenSans-800.ttf', weight: '800', style: 'normal' },
  ],
  variable: '--font-open-sans',
  display: 'swap',
});
const jetbrainsMono = localFont({
  src: [
    { path: './fonts/JetBrainsMono-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/JetBrainsMono-500.ttf', weight: '500', style: 'normal' },
  ],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://swiftloan.ai'),
  title: 'SwiftLoan.ai — Fast · Fair · Secure loans, matched to the right lender',
  description:
    "SwiftLoan.ai uses intelligent qualification and AI lender matching to help you access personal and business loans faster — with transparent terms, bank-grade security, and full consent control.",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%230CB6A6'/%3E%3Cstop offset='1' stop-color='%232FB183'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='120' rx='30' fill='url(%23g)'/%3E%3Cg stroke='white' stroke-linecap='round'%3E%3Cline x1='14' y1='52' x2='36' y2='52' stroke-width='7' opacity='.5'/%3E%3Cline x1='16' y1='72' x2='38' y2='72' stroke-width='7' opacity='.85'/%3E%3C/g%3E%3Ctext x='78' y='88' text-anchor='middle' fill='white' font-family='Arial,sans-serif' font-size='82' font-weight='bold'%3E%E2%82%B9%3C/text%3E%3C/svg%3E",
      },
    ],
    apple: '/icon.png',
  },
  openGraph: { images: ['/icon.png'] },
};

export const viewport: Viewport = {
  themeColor: '#0A3F41',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${openSans.variable} ${jetbrainsMono.variable}`}>
        <div className="aurora" aria-hidden="true">
          <span className="motif" style={{ top: '8%', left: '5%', transform: 'rotate(-12deg)' }}>currency_rupee</span>
          <span className="motif motif--fill" style={{ top: '14%', right: '7%', transform: 'rotate(14deg)' }}>savings</span>
          <span className="motif" style={{ top: '46%', left: '2%', transform: 'rotate(8deg)' }}>trending_up</span>
          <span className="motif motif--fill" style={{ top: '62%', right: '4%', transform: 'rotate(-8deg)' }}>account_balance</span>
          <span className="motif" style={{ top: '82%', left: '12%', transform: 'rotate(10deg)' }}>shield</span>
          <span className="motif" style={{ top: '34%', right: '22%', transform: 'rotate(-6deg)' }}>payments</span>
        </div>
        {children}
        <VoiceWidget />
      </body>
    </html>
  );
}
