// Design tokens ported verbatim from the SwiftLoan design bundle (renderVals + inline styles).
// Colors are the exact hex values used in the source prototype.

export const colors = {
  // Brand
  primary: '#079FA0', // teal — main accent
  mint: '#2FB183', // gradient partner / toggle-on / success
  ink: '#0A3F41', // deep teal ground (splash/hero)
  inkDeep: '#083E40',
  inkAlt: '#0C2B2C',
  paper: '#FCFBF8', // warm off-white

  // Text
  text: '#0F2A2B',
  textMid: '#3A4C4C',
  textSoft: '#5C6E6E',
  muted: '#93A3A3',

  // Surfaces / lines
  surface: '#FFFFFF',
  surfaceSoft: '#F4F7F6',
  chip: '#EAF4EF',
  line: '#E2E9E7',
  lineSoft: '#EDF1F0',
  trackOff: '#D3DDDD',

  // Semantic
  amber: '#F5A624',
  green: '#2FB183',
  greenDeep: '#0E8C7E',
  red: '#EF6A5E',
  redDeep: '#D64C3F',
  blue: '#2C6E8F',
  gold: '#E9C21F',

  // App background (screen content area)
  appBg: '#F3F5F4',
} as const;

// Hero / splash gradient (linear-gradient(140deg,#083E40,#079FA0))
export const heroGradient = ['#083E40', '#079FA0'] as const;
export const heroGradientStart = { x: 0.1, y: 0 };
export const heroGradientEnd = { x: 0.9, y: 1 };

// Active bottom-nav pill gradient (140deg #079FA0 -> #2FB183)
export const navGradient = ['#079FA0', '#2FB183'] as const;

// The design uses Inter for UI. We bundle real static weights extracted from the design
// bundle (Inter-Regular/Medium/SemiBold/Bold/ExtraBold) as separate families, plus the
// Material Symbols Outlined icon font (exact glyphs via ligatures).
export const MATERIAL_FONT = 'MaterialSymbolsOutlined';

type Weight = '400' | '500' | '600' | '700' | '800' | number;

// Map a desired weight to the correct bundled Inter family. iOS/Android select the face
// by family name, so each weight is its own family.
export function interFamily(weight: Weight = '400'): string {
  const w = typeof weight === 'number' ? weight : parseInt(weight, 10);
  if (w >= 800) return 'Inter-ExtraBold';
  if (w >= 700) return 'Inter-Bold';
  if (w >= 600) return 'Inter-SemiBold';
  if (w >= 500) return 'Inter-Medium';
  return 'Inter-Regular';
}

// Convenience: returns the RN style fields for a given weight (family only; the numeric
// fontWeight is intentionally omitted so the chosen family is not double-applied).
export function font(weight: Weight = '400') {
  return { fontFamily: interFamily(weight) } as const;
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 9999 };

// Indian-format currency (₹1,23,456) — mirrors inr(v) = v.toLocaleString('en-IN')
export function inr(v: number): string {
  const n = Math.round(v);
  const s = String(Math.abs(n));
  let out: string;
  if (s.length <= 3) {
    out = s;
  } else {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest.length) parts.unshift(rest);
    out = parts.join(',') + ',' + last3;
  }
  return (n < 0 ? '-' : '') + out;
}

export const rupee = (v: number) => '₹' + inr(v);
