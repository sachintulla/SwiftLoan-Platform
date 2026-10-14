/**
 * In-app legal documents reachable from Profile → the `legal` viewer screen.
 * These describe SwiftLoan accurately as a loan marketplace / Lending Service
 * Provider (LSP) and Digital Lending App (DLA) — NOT a lender. The Privacy
 * Policy lives in ./privacyPolicy.ts and is surfaced through the same viewer.
 *
 * Keep the grievance contact and "not a lender" framing consistent with
 * privacyPolicy.ts and the handoff/compare screens.
 */
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_POLICY_VERSION } from './privacyPolicy';

export interface LegalSection { title: string; body: string }
export interface LegalDoc {
  title: string;
  subtitle: string;
  intro: string;
  sections: LegalSection[];
}

export const GRIEVANCE_EMAIL = 'grievance@swiftloan.ai';
export const SUPPORT_EMAIL = 'support@swiftloan.ai';

// The hosted Privacy Policy webpage (website-next → swiftloan.ai/privacy-policy).
// The in-app `legal` viewer loads this for the Privacy Policy so the app and the
// website always show the same, latest policy; the built-in `privacy` doc below
// is the offline fallback if the page can't be reached.
export const PRIVACY_POLICY_URL = 'https://swiftloan.ai/privacy-policy';

const TERMS: LegalDoc = {
  title: 'Terms of Service',
  subtitle: 'Please read these terms before using SwiftLoan',
  intro:
    'These Terms of Service ("Terms") govern your use of the SwiftLoan mobile application and services ("SwiftLoan", "we", "us"). By creating an account or using the app you agree to these Terms. If you do not agree, please do not use the app.',
  sections: [
    {
      title: '1. What SwiftLoan is',
      body:
        'SwiftLoan is a loan marketplace and technology platform (a Lending Service Provider / Digital Lending App) that helps you discover, compare and apply for personal loans offered by RBI-regulated lending partners (banks and NBFCs). SwiftLoan is NOT a lender, does not lend money, and does not make credit decisions. All loans are provided by, and all credit decisions are made solely by, the lending partner you choose.',
    },
    {
      title: '2. Eligibility',
      body:
        'You must be an Indian resident, at least 18 years old, and legally able to enter into a contract to use SwiftLoan. You agree to provide true, accurate and complete information (including your PAN and other KYC details) and to keep it up to date. Providing false information may result in rejection of your application and/or suspension of your account.',
    },
    {
      title: '3. No guarantee of a loan',
      body:
        'Using SwiftLoan, checking your eligibility, or receiving indicative offers does not guarantee that any loan will be approved or disbursed. Final eligibility, loan amount, interest rate, fees and terms are determined solely by the lending partner after its own assessment. Any amounts, rates or EMIs shown in the app before approval are indicative only.',
    },
    {
      title: '4. Applying through a partner',
      body:
        'When you choose to apply, you authorise SwiftLoan to share the information you have provided with the selected lending partner so it can process your application. You may then be taken to the partner’s own secure application journey, which is governed by that partner’s terms and privacy policy. The loan agreement, Key Facts Statement (KFS) and all binding terms are provided by the lending partner.',
    },
    {
      title: '5. Your responsibilities',
      body:
        'You agree to use SwiftLoan only for lawful purposes, to keep your login credentials and OTPs confidential, and not to misuse, reverse-engineer, scrape or disrupt the service. You are responsible for repaying any loan you take from a lending partner according to that partner’s agreement.',
    },
    {
      title: '6. Fees',
      body:
        'SwiftLoan does not charge you a fee to discover or apply for loans. Interest, processing fees, GST and any other charges are set and levied by the lending partner and are disclosed to you before you accept an offer and in the partner’s Key Facts Statement.',
    },
    {
      title: '7. Intellectual property',
      body:
        'The SwiftLoan name, logo, app, content and software are owned by SwiftLoan and its licensors and are protected by applicable laws. You are granted a limited, non-exclusive, non-transferable licence to use the app for its intended purpose.',
    },
    {
      title: '8. Limitation of liability',
      body:
        'The app is provided on an "as is" basis. To the maximum extent permitted by law, SwiftLoan is not liable for the acts, omissions, decisions or products of any lending partner, for any loan not being approved or disbursed, or for indirect or consequential losses arising from your use of the app.',
    },
    {
      title: '9. Suspension and termination',
      body:
        'We may suspend or terminate your access if you breach these Terms or applicable law, or to protect the security of the service. You may stop using the app and delete your account at any time from Profile → Account Deletion.',
    },
    {
      title: '10. Governing law and grievances',
      body:
        `These Terms are governed by the laws of India, and disputes are subject to the courts of competent jurisdiction in India. For any grievance, contact our Grievance Officer at ${GRIEVANCE_EMAIL}; see the Grievance & Consent Withdrawal document in this app for the escalation process.`,
    },
  ],
};

const LENDING: LegalDoc = {
  title: 'Lending Disclosures',
  subtitle: 'How lending works on SwiftLoan',
  intro:
    'These disclosures explain SwiftLoan’s role in the lending process, in line with the RBI Guidelines on Digital Lending. Please read them alongside the Terms of Service and Privacy Policy.',
  sections: [
    {
      title: 'SwiftLoan is not a lender',
      body:
        'SwiftLoan operates as a Lending Service Provider (LSP) and Digital Lending App (DLA). We help you discover and apply for loans; we do not lend money, do not hold your loan, and do not make any credit decision. Every loan is provided by a Regulated Entity — a bank or an RBI-registered NBFC — which is the lender of record.',
    },
    {
      title: 'Our lending partners',
      body:
        'Offers shown in the app come from our empanelled RBI-regulated lending partners. The identity of the lender is disclosed to you before you apply. Your loan agreement is directly between you and that lender.',
    },
    {
      title: 'Cost of the loan',
      body:
        'The annual interest rate (APR), processing fee, applicable GST and the total amount payable are disclosed to you before you accept an offer, and in full in the Key Facts Statement (KFS) provided by the lender before the loan agreement is executed. There are no hidden charges from SwiftLoan — we do not add any fee of our own to your loan.',
    },
    {
      title: 'Key Facts Statement (KFS)',
      body:
        'Before you sign a loan agreement, the lending partner provides a standardised Key Facts Statement setting out the loan amount, APR, all fees, the total cost of credit, the repayment schedule and the cooling-off / look-up period. Please read the KFS carefully; it is the authoritative statement of your loan terms.',
    },
    {
      title: 'Data sharing and consent',
      body:
        'We share your information with a lending partner only after you explicitly choose to apply, and only to the extent needed to process that application. You can withdraw consent and request deletion of your data at any time — see the Grievance & Consent Withdrawal document and Profile → Account Deletion.',
    },
    {
      title: 'No harassment; fair recovery',
      body:
        'Loan recovery is carried out by the lending partner in accordance with RBI’s Fair Practices Code. SwiftLoan does not engage in any coercive or harassing recovery practices and does not access your contacts, call logs or SMS for recovery.',
    },
  ],
};

const GRIEVANCE: LegalDoc = {
  title: 'Grievance & Consent Withdrawal',
  subtitle: 'Raise a concern or withdraw your consent',
  intro:
    'We are committed to resolving your concerns fairly and quickly, in line with the RBI Guidelines on Digital Lending. This document explains how to reach us, how to withdraw consent, and how to escalate.',
  sections: [
    {
      title: 'Grievance Officer',
      body:
        `You can write to our Grievance Officer at ${GRIEVANCE_EMAIL}. Please include your registered mobile number and a description of the issue. We aim to acknowledge your complaint promptly and resolve it within 7 working days.`,
    },
    {
      title: 'Complaints about a lender',
      body:
        'If your concern is about a loan, its terms, charges or recovery, it may need to be handled by the lending partner that provided the loan, as they are the Regulated Entity. We will help route your complaint to the correct partner and follow up on your behalf.',
    },
    {
      title: 'Escalation to the RBI Ombudsman',
      body:
        'If your complaint is not resolved within 30 days, or you are not satisfied with the resolution, you may escalate to the lender’s Nodal/Principal Officer and thereafter to the RBI Ombudsman under the Reserve Bank – Integrated Ombudsman Scheme (cms.rbi.org.in).',
    },
    {
      title: 'Withdrawing your consent',
      body:
        'You may withdraw the consent you gave for processing and sharing your data at any time. To do so, contact the Grievance Officer above, or delete your account from Profile → Account Deletion, which removes your personal data from our systems (subject to records a lending partner or the law requires to be retained).',
    },
    {
      title: 'Deleting your account and data',
      body:
        'Profile → Account Deletion permanently deletes your SwiftLoan account and associated personal data. Note that where you have taken a loan from a lending partner, that partner may be required by law or RBI regulation to retain certain records.',
    },
  ],
};

/** Privacy is assembled from the approved policy content so there is a single source. */
const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  subtitle: `Version ${PRIVACY_POLICY_VERSION} · DPDP Act · RBI Digital Lending Guidelines`,
  intro: PRIVACY_INTRO,
  sections: PRIVACY_SECTIONS,
};

export type LegalDocKey = 'privacy' | 'terms' | 'lending' | 'grievance';

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  privacy: PRIVACY,
  terms: TERMS,
  lending: LENDING,
  grievance: GRIEVANCE,
};
