/**
 * SwiftLoan Design System 1.0 colours for code that cannot read CSS variables
 * (Recharts draws SVG attributes). Keep in step with the :root tokens in app/globals.css.
 *
 * Charts use only the PDF's chart set: action teal, green, dark teal, bright teal and amber
 * (amber for caution only). The old blue (#2E90FA) and violet are retired.
 */
export const DS = {
  teal500: '#079FA0',
  teal600: '#057C7D',
  teal200: '#8FDCDB',
  teal900: '#0A3F41',
  tealBright: '#0CB6A6',
  green400: '#2FB183',
  ink: '#0F2A2B',
  ink2: '#5C6E6E',
  faint: '#7E9291',
  muted: '#A6B4B4',
  border: '#E4EEED',
  grid: '#EEF3F2',
  surface2: '#F5F9F8',
  success: '#1E7D5A',
  warning: '#B4740A',
  error: '#C0392B',
  errorSoft: '#E9A69E',
} as const;

/** chart-1 … chart-5 from the PDF, in order. */
export const CHART = [DS.teal600, DS.green400, DS.teal900, DS.tealBright, DS.warning] as const;

/** Axis ticks, grid and tooltip box shared by every Recharts graph. */
export const AXIS_TICK = { fontSize: 11, fill: DS.faint };
export const TOOLTIP_STYLE = { borderRadius: 8, border: `1px solid ${DS.border}`, fontSize: 12, color: DS.ink };

/** One colour per lender, the same on the Dashboard charts and the Applications page. */
export const LENDER_COLOR = { aurix: DS.teal600, yubi: DS.tealBright, revasure: DS.teal900 } as const;
