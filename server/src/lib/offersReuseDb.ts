import type { Prisma } from '@prisma/client';
import type { SafeApplication } from './storedPan.js';
import { prisma } from './prisma.js';

const withDetails = { emiOptions: true, partner: true } as const;

/** The stored offers for an application, best rate first — same shape prequalify returns. */
export async function storedOffers(applicationId: string) {
  return prisma.offer.findMany({ where: { applicationId }, include: withDetails, orderBy: { apr: 'asc' } });
}

/**
 * Give `app` the offers an earlier application of the same user already fetched with
 * identical details, instead of asking the lender again. Copies the offer rows (and
 * their EMI options) and the outcome; the copy keeps the ORIGINAL fetch time so reuse
 * never extends how long the offers count as fresh. Lender-side progress (selected /
 * applied / status) is deliberately not copied — that belongs to the old application.
 */
export async function copyOffersFrom(app: SafeApplication, sourceId: string) {
  const source = await prisma.loanApplication.findUnique({
    where: { id: sourceId },
    include: { offers: { include: { emiOptions: true }, orderBy: { apr: 'asc' } } },
  });
  if (!source) return null;

  await prisma.$transaction(async (tx) => {
    // Same serialisation point as a normal prequalify run (see applications.routes.ts).
    await tx.$queryRaw`SELECT id FROM "LoanApplication" WHERE id = ${app.id} FOR UPDATE`;
    await tx.offer.deleteMany({ where: { applicationId: app.id } });
    for (const o of source.offers) {
      await tx.offer.create({
        data: {
          applicationId: app.id,
          partnerId: o.partnerId,
          amount: o.amount,
          apr: o.apr,
          emi: o.emi,
          tenureMonths: o.tenureMonths,
          processingFee: o.processingFee,
          processingFeeAmount: o.processingFeeAmount,
          gstOnProcessingFee: o.gstOnProcessingFee,
          netDisbursalAmount: o.netDisbursalAmount,
          badgeText: o.badgeText,
          tag: o.tag,
          recommended: o.recommended,
          offerCode: o.offerCode,
          offerType: o.offerType,
          roi: o.roi,
          offerLikelihood: o.offerLikelihood,
          redirectionUrl: o.redirectionUrl,
          lenderName: o.lenderName,
          lenderLogoUrl: o.lenderLogoUrl,
          externalPartnerId: o.externalPartnerId,
          ...(o.rawOffer !== null ? { rawOffer: o.rawOffer as Prisma.InputJsonValue } : {}),
          emiOptions: o.emiOptions.length
            ? {
                create: o.emiOptions.map((e) => ({
                  tenureMonths: e.tenureMonths,
                  monthlyEmi: e.monthlyEmi,
                  totalInterestPayable: e.totalInterestPayable,
                  totalRepaymentAmount: e.totalRepaymentAmount,
                  recommended: e.recommended,
                })),
              }
            : undefined,
        },
      });
    }
    const hadOffers = source.offers.length > 0;
    await tx.loanApplication.update({
      where: { id: app.id },
      data: {
        status: hadOffers ? 'offers_ready' : 'rejected',
        prequalifyReason: hadOffers ? null : source.prequalifyReason,
        offersSignature: source.offersSignature,
        offersFetchedAt: source.offersFetchedAt,
      },
    });
  });
  return storedOffers(app.id);
}
