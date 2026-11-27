import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The SwiftLoan mark and wordmark (Design System 1.0, §02 Logo).
 * Mark: rounded square (corner = 25% of the edge), 145° gradient #0CB6A6 → #2FB183,
 * a white ₹ leaning forward ~7°, three fading speed lines behind it. Same drawing as
 * public/assets/swiftloan-mark.svg. Minimum 32px; the site header uses 36px.
 * Wordmark: "Swift" in teal, "Loan" in ink; mint + white on dark backgrounds.
 */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const px = Math.max(32, size);
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`slm-${id}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#0CB6A6" />
          <stop offset="1" stopColor="#2FB183" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="30" fill={`url(#slm-${id})`} />
      <g stroke="#fff" strokeLinecap="round" fill="none">
        <line x1="16" y1="43" x2="40" y2="43" strokeWidth="6" opacity=".32" />
        <line x1="12" y1="60" x2="38" y2="60" strokeWidth="6" opacity=".55" />
        <line x1="18" y1="77" x2="42" y2="77" strokeWidth="6" opacity=".82" />
      </g>
      <g transform="skewX(-7)">
        <text
          x="82"
          y="87"
          textAnchor="middle"
          fill="#fff"
          style={{ fontFamily: 'var(--font-display), Arial, sans-serif' }}
          fontSize="84"
          fontWeight="800"
        >
          ₹
        </text>
      </g>
    </svg>
  );
}

export function BrandLogo({
  size = 36,
  tone = 'light',
  wordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: number;
  /** light = on a light surface (teal + ink); dark = on a dark surface (mint + white). */
  tone?: 'light' | 'dark';
  wordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark size={size} />
      {wordmark ? (
        <span
          className={cn('font-display truncate text-lg font-extrabold tracking-tight', wordmarkClassName)}
          aria-label="SwiftLoan"
        >
          <span style={{ color: tone === 'dark' ? 'var(--sl-mint-word)' : 'var(--sl-teal-500)' }}>Swift</span>
          <span style={{ color: tone === 'dark' ? '#FFFFFF' : 'var(--sl-ink)' }}>Loan</span>
        </span>
      ) : (
        <span className="sr-only">SwiftLoan</span>
      )}
    </span>
  );
}
