/**
 * Terms of Service for the website (account → Profile → Terms of Service).
 * Same text as the app's built-in Terms (src/content/legal.ts → TERMS), worded for
 * the website as well. Keep the two in step when either changes.
 * Legal text, English on purpose (like the privacy-policy body).
 */
export const TERMS_INTRO =
  'These Terms of Service ("Terms") govern your use of the SwiftLoan website, mobile application and services ("SwiftLoan", "we", "us"). By creating an account or using SwiftLoan you agree to these Terms. If you do not agree, please do not use SwiftLoan.';

export const TERMS_SECTIONS: { title: string; body: string }[] = [
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
      'The SwiftLoan name, logo, app, content and software are owned by SwiftLoan and its licensors and are protected by applicable laws. You are granted a limited, non-exclusive, non-transferable licence to use the website and app for their intended purpose.',
  },
  {
    title: '8. Limitation of liability',
    body:
      'The app is provided on an "as is" basis. To the maximum extent permitted by law, SwiftLoan is not liable for the acts, omissions, decisions or products of any lending partner, for any loan not being approved or disbursed, or for indirect or consequential losses arising from your use of the app.',
  },
  {
    title: '9. Suspension and termination',
    body:
      'We may suspend or terminate your access if you breach these Terms or applicable law, or to protect the security of the service. You may stop using the app and delete your account at any time from Profile → Delete account.',
  },
  {
    title: '10. Governing law and grievances',
    body:
      'These Terms are governed by the laws of India, and disputes are subject to the courts of competent jurisdiction in India. For any grievance, contact our Grievance Officer at grievance@swiftloan.ai; or raise a ticket from Grievance & Support in your account.',
  },
];
