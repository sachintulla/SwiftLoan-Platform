/**
 * Local bundled lender logos — used in preference to a hosted `logoUrl`
 * (no network round-trip, no broken-image flash) wherever a plan/offer's
 * `lenderName` matches a key here exactly.
 *
 * Metro requires each `require()` call to be static (it can't resolve a
 * dynamic path built from a variable), so a new logo means adding one line
 * below — drop the file into assets/logos/ and add its entry here.
 *
 * Current PreApprovedPlan seed lender names (server/prisma/seed.preapproved.ts),
 * for reference:
 *   IDFC, Prefr, UnitySFB, "FREO — larger line", "FREO — quick line", Zype, MoneyView
 */
export const LENDER_LOGOS: Record<string, ReturnType<typeof require>> = {
  'IDFC': require('../../assets/logos/idfc.png'),
  'Prefr': require('../../assets/logos/prefr.png'),
  'UnitySFB': require('../../assets/logos/unitysfb.png'),
  'FREO — larger line': require('../../assets/logos/freo.png'),
  'FREO — quick line': require('../../assets/logos/freo.png'),
  'Zype': require('../../assets/logos/zype.png'),
  'MoneyView': require('../../assets/logos/moneyview.png'),
};
