import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SwiftLoan Admin',
  description: 'Loan application tracking & operations dashboard',
  // Self-contained SVG favicon — the SwiftLoan mark (teal→mint gradient, ₹),
  // matching the public site so the browser tab is branded with no binary asset.
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%230CB6A6'/%3E%3Cstop offset='1' stop-color='%232FB183'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='120' rx='30' fill='url(%23g)'/%3E%3Cg stroke='white' stroke-linecap='round'%3E%3Cline x1='14' y1='52' x2='36' y2='52' stroke-width='7' opacity='.5'/%3E%3Cline x1='16' y1='72' x2='38' y2='72' stroke-width='7' opacity='.85'/%3E%3C/g%3E%3Ctext x='78' y='88' text-anchor='middle' fill='white' font-family='Arial,sans-serif' font-size='82' font-weight='bold'%3E%E2%82%B9%3C/text%3E%3C/svg%3E",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
