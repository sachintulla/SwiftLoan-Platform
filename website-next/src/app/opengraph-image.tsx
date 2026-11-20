import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * The 1200×630 picture shown when a swiftloan.ai link is shared (WhatsApp, LinkedIn, X, Facebook).
 * It used to be the small square app icon. Drawn at build time; no external fonts or images,
 * so the build never depends on reaching another site.
 */
export const alt = 'SwiftLoan.ai — loans matched to the right lender';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function iconDataUrl(): string {
  return `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'icon.png')).toString('base64')}`;
}

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #0A2C2E 0%, #0E3B3A 55%, #114440 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* The real app icon (the default font has no ₹ glyph). */}
          <img src={iconDataUrl()} width={84} height={84} style={{ borderRadius: 22 }} alt="" />
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>
            <span>Swift</span>
            <span style={{ color: '#2FB183' }}>Loan</span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>.ai</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5 }}>
            Loans matched to the right lender
          </div>
          <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.78)' }}>
            Compare offers from 18+ RBI-registered lending partners · Soft credit check · 100% paperless
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#2FB183', fontWeight: 600 }}>swiftloan.ai</div>
      </div>
    ),
    size,
  );
}
