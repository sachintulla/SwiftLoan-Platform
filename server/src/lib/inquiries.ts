/**
 * Website inquiries = Lead rows, one per "enter your details" submission,
 * keyed by phone. A returning customer who submits a new name/amount creates a
 * NEW inquiry linked to the same phone, so the funnel keeps full history.
 *
 * An inquiry is VERIFIED once its phone completed OTP (markLatestInquiryVerified,
 * called from the website /otp/verify). Until then it is an unverified inquiry —
 * anyone can type any number, so an un-OTP'd submission is never treated as proven.
 */
import { prisma } from './prisma.js';

/**
 * Mark the most recent unverified inquiry for a phone as verified. Called when
 * the person behind that number completes OTP. Best-effort — never throws.
 */
export async function markLatestInquiryVerified(phone: string, at: Date = new Date()): Promise<void> {
  if (!phone) return;
  try {
    const latest = await prisma.lead.findFirst({
      where: { phone, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!latest) return;
    await prisma.lead.update({ where: { id: latest.id }, data: { verifiedAt: at } });
  } catch {
    /* non-fatal: verification marking must never break login */
  }
}

export interface InquiryLeadRow {
  phone: string;
  name: string | null;
  amount: number | null; // paise
  verifiedAt: Date | string | null;
  createdAt: Date | string;
}

export interface PhoneInquiry {
  phone: string;
  name: string | null; // latest non-empty name seen for this phone
  inquiries: number; // total submissions
  verifiedInquiries: number; // submissions whose phone was OTP-verified
  distinctAmounts: number; // how many DIFFERENT loan amounts they asked for
  latestAmount: number | null; // paise, most recent submission
  lastInquiryAt: string; // ISO, most recent submission
  verified: boolean; // has this phone EVER verified an inquiry
}

export interface InquiryRollup {
  totalInquiries: number;
  verifiedInquiries: number;
  unverifiedInquiries: number;
  uniqueInquirers: number; // distinct phones
  repeatInquirers: number; // phones with more than one inquiry
  amountChangers: number; // phones that inquired with >1 distinct amount
  perPhone: PhoneInquiry[]; // sorted by inquiries desc, then lastInquiryAt desc
}

const iso = (v: Date | string): string => (typeof v === 'string' ? v : v.toISOString());
const ms = (v: Date | string): number => new Date(v).getTime();

/**
 * Pure rollup of inquiry leads, grouped by phone. Deterministic and side-effect
 * free so it can be unit-tested and reused by the admin endpoint.
 */
export function rollupInquiries(leads: InquiryLeadRow[]): InquiryRollup {
  const byPhone = new Map<string, InquiryLeadRow[]>();
  for (const l of leads) {
    if (!l.phone) continue;
    const arr = byPhone.get(l.phone) ?? [];
    arr.push(l);
    byPhone.set(l.phone, arr);
  }

  const perPhone: PhoneInquiry[] = [];
  let totalInquiries = 0;
  let verifiedInquiries = 0;

  for (const [phone, rows] of byPhone) {
    rows.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); // newest first
    const verifiedCount = rows.filter((r) => r.verifiedAt != null).length;
    const distinctAmounts = new Set(rows.filter((r) => r.amount != null).map((r) => r.amount)).size;
    const latest = rows[0];
    const latestName = rows.find((r) => (r.name ?? '').trim())?.name ?? null;

    totalInquiries += rows.length;
    verifiedInquiries += verifiedCount;

    perPhone.push({
      phone,
      name: latestName,
      inquiries: rows.length,
      verifiedInquiries: verifiedCount,
      distinctAmounts,
      latestAmount: latest.amount ?? null,
      lastInquiryAt: iso(latest.createdAt),
      verified: verifiedCount > 0,
    });
  }

  perPhone.sort((a, b) => b.inquiries - a.inquiries || ms(b.lastInquiryAt) - ms(a.lastInquiryAt));

  return {
    totalInquiries,
    verifiedInquiries,
    unverifiedInquiries: totalInquiries - verifiedInquiries,
    uniqueInquirers: byPhone.size,
    repeatInquirers: perPhone.filter((p) => p.inquiries > 1).length,
    amountChangers: perPhone.filter((p) => p.distinctAmounts > 1).length,
    perPhone,
  };
}
