/**
 * The SwiftLoan brand mark — the teal→mint rounded tile with the stacked speed
 * lines and the ₹ glyph, matching the public site's logo (website-next
 * /public/assets/swiftloan-mark.svg) and the browser favicon. Inline SVG so it
 * needs no asset file and stays crisp at any size.
 */
export default function BrandMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} role="img" aria-label="SwiftLoan">
      <defs>
        <linearGradient id="sl-brand-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0CB6A6" />
          <stop offset="1" stopColor="#2FB183" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="30" fill="url(#sl-brand-mark)" />
      <g stroke="#fff" strokeLinecap="round" fill="none">
        <line x1="16" y1="43" x2="40" y2="43" strokeWidth="6" opacity=".32" />
        <line x1="12" y1="60" x2="38" y2="60" strokeWidth="6" opacity=".55" />
        <line x1="18" y1="77" x2="42" y2="77" strokeWidth="6" opacity=".82" />
      </g>
      <g transform="skewX(-7)">
        <text x="82" y="87" textAnchor="middle" fill="#fff" fontFamily="'Segoe UI',Arial,sans-serif" fontSize="84" fontWeight="800">₹</text>
      </g>
    </svg>
  );
}
