/**
 * Whether the company / employer name is mandatory on the website's details step. Everyone has one to give except a
 * student or a retired person (the field stays visible, optional). The lender's EmployerName was going out blank.
 * Mirrors companyNeeded() in the app's src/utils/basicRequired.ts: keep the two in step.
 */
export function companyRequired(employment: string | null | undefined): boolean {
  const k = (employment ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return !!k && k !== 'student' && k !== 'retired';
}
