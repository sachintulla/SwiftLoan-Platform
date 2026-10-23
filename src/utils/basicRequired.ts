/**
 * The mandatory fields still empty on the application details screen (`basic`), in the order the
 * screen asks for them, as plain English names.
 *
 * Continue used to be the only thing that revealed them — one error toast at a time — so the voice
 * agent asked for one field, hit the next error after Continue, asked again, and so on. The screen
 * now publishes this whole list to the agent up front (see actionRegistry's screen hints), so it
 * can collect everything BEFORE the user presses Continue. Mirrors the checks in basic.tsx's
 * onContinue; keep the two in step.
 */
export interface BasicRequiredInput {
  first: string;
  last: string;
  dobSet: boolean;
  gender: string | null;
  email: string;
  loanPurpose: string | null;
  qualification: string | null;
  residence: string | null;
  employment: string | null;
  salaryMode: string | null;
  addr1: string;
  city: string;
  state: string;
  pin: string;
  income: string;
}

export function missingBasicRequired(
  v: BasicRequiredInput,
  opts: { pincodeRe: RegExp; incomeMin: number },
): string[] {
  const out: string[] = [];
  if (!v.first.trim()) out.push('first name');
  if (!v.last.trim()) out.push('last name');
  if (!v.dobSet) out.push('date of birth');
  if (!v.gender) out.push('gender');
  if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) out.push('email');
  if (!v.loanPurpose) out.push('loan purpose');
  if (!v.qualification) out.push('qualification');
  if (!v.residence) out.push('residence type');
  if (!v.employment) out.push('employment type');
  if (!v.salaryMode) out.push('salary mode');
  if (!v.addr1.trim()) out.push('address line 1');
  if (!v.city.trim()) out.push('city');
  if (!v.state.trim()) out.push('state');
  if (!opts.pincodeRe.test(v.pin)) out.push('pincode');
  const income = parseInt(v.income, 10);
  if (!v.income || !Number.isFinite(income) || income < opts.incomeMin) out.push('monthly income');
  return out;
}
