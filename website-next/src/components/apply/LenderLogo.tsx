'use client';

import { useState } from 'react';

// Aurix sends lender names in all caps ("IDFC FIRST BANK LIMITED"). Title-case
// them for display, keeping the well-known acronyms upper.
const ACRONYMS = new Set(['IDFC', 'HDFC', 'ICICI', 'SBI', 'IIFL', 'AU', 'DMI', 'LTFS', 'RBL', 'IDBI', 'PNB', 'BOB', 'NBFC']);

export function prettyLenderName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Lender logo on a white tile, falling back to the lender's initials when no
 * logo was supplied or the image fails to decode.
 */
export function LenderLogo({ name, logoUrl, size = 56 }: { name: string; logoUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (logoUrl && !failed) {
    return (
      <span className="border-border grid shrink-0 place-items-center overflow-hidden rounded-2xl border bg-white p-1.5 shadow-sm" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="bg-accent text-primary grid shrink-0 place-items-center rounded-2xl text-base font-extrabold" style={box}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
