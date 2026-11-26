import './globals.css';
import type { Metadata } from 'next';
import localFont from 'next/font/local';

// SwiftLoan Design System 1.0: Inter for UI text, Manrope for headings, JetBrains Mono for
// figures, all self-hosted. Inter + JetBrains Mono are the same files the website uses (Inter
// from the design bundle). Manrope is not in the repo yet, so headings fall back to Inter.
const inter = localFont({
  src: [
    { path: './fonts/Inter-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Inter-500.ttf', weight: '500', style: 'normal' },
    { path: './fonts/Inter-600.ttf', weight: '600', style: 'normal' },
    { path: './fonts/Inter-700.ttf', weight: '700', style: 'normal' },
    { path: './fonts/Inter-800.ttf', weight: '800', style: 'normal' },
  ],
  variable: '--font-inter',
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
  title: 'SwiftLoan Admin',
  description: 'Loan application tracking & operations dashboard',
  // Self-contained SVG favicon — the SwiftLoan mark (teal→mint gradient, three speed lines, ₹),
  // matching the public site so the browser tab is branded with no binary asset.
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%230CB6A6'/%3E%3Cstop offset='1' stop-color='%232FB183'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='120' rx='30' fill='url(%23g)'/%3E%3Cg stroke='white' stroke-linecap='round'%3E%3Cline x1='16' y1='43' x2='40' y2='43' stroke-width='6' opacity='.32'/%3E%3Cline x1='12' y1='60' x2='38' y2='60' stroke-width='6' opacity='.55'/%3E%3Cline x1='18' y1='77' x2='42' y2='77' stroke-width='6' opacity='.82'/%3E%3C/g%3E%3Cg transform='skewX(-7)'%3E%3Ctext x='82' y='87' text-anchor='middle' fill='white' font-family='Arial,sans-serif' font-size='84' font-weight='800'%3E%E2%82%B9%3C/text%3E%3C/g%3E%3C/svg%3E",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
