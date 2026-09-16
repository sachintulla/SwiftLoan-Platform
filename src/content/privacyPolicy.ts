// SwiftLoan Privacy Policy — content integrated from the approved policy document
// (SwiftLoan-Privacy-Policy.docx, v1.0). Shown on the first-launch consent screen
// and referenced by the Ello assistant's knowledge. Aligned with the DPDP Act 2023,
// IT Act / SPDI Rules 2011, and the RBI Digital Lending Guidelines 2022.

export const PRIVACY_POLICY_VERSION = '1.0';

export const PRIVACY_INTRO =
  'SwiftLoan is a loan-comparison and referral platform — not a lender. Loans are provided by RBI-regulated banks/NBFCs, who make all credit decisions. This policy explains how we collect, use, store, share and protect your personal information, and how you can control it.';

export interface PolicySection { title: string; body: string }

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    title: '1. Who we are',
    body:
      'SwiftLoan is a technology platform and Lending Service Provider (LSP) operating a Digital Lending App. We help you discover, compare and apply for loans from third-party Lending Partners (RBI-regulated banks/NBFCs). SwiftLoan is NOT a lender — we do not sanction, underwrite, price or disburse any loan. Under the DPDP Act we act as a Data Fiduciary for data we collect, and as a Data Processor for a Lending Partner where we process data on its behalf.',
  },
  {
    title: '2. Information we collect',
    body:
      'Only what is necessary (data minimization):\n• Identity & contact: mobile number, name, email, date of birth, PIN code/address.\n• Financial & employment (sensitive): monthly income, employer, loan amount/tenure/purpose.\n• KYC identifiers: PAN, and only the last 4 digits of Aadhaar / bank account. We do NOT store your full Aadhaar, Aadhaar image, or biometric selfie.\n• Verification: OTPs, stored only in hashed form.\n• Voice assistant (“Ruby”): optional and consent-based — your voice input is processed to act on your requests via a contracted voice-AI provider. You can use the whole app without it.\n• Device & usage: device model, OS, app version, in-app activity and analytics, to operate, secure and improve the app.\n• Credit info: an indicative score may be shown; a formal bureau enquiry (e.g. CIBIL) happens only with your explicit consent.',
  },
  {
    title: '3. How we use your information',
    body:
      'To provide and secure the app and your account; verify your identity (OTP); calculate EMIs and help you compare offers you may be eligible for; with your consent, initiate your loan application with the Lending Partner you select; communicate about your applications and (only if you opt in) promotions; detect and prevent fraud; and comply with legal/regulatory obligations (RBI, DPDP, IT Act, CERT-In). We use your data only for the purposes it was collected (purpose limitation).',
  },
  {
    title: '4. Consent & legal basis',
    body:
      'We rely primarily on your consent, obtained through clear, purpose-specific prompts. Separate, explicit consent is taken before any credit-bureau enquiry. You may withdraw consent at any time — withdrawal does not affect processing already done, and may mean we can no longer provide certain features or facilitate a loan.',
  },
  {
    title: '5. Lending services — sharing with Lending Partners',
    body:
      'When you choose to proceed with an offer, with your consent we share the information reasonably necessary to process that application (identity, contact, income/employment, PAN, KYC identifiers, loan details) with the specific Lending Partner you select, so they can verify your details, assess eligibility and set the terms. After sharing, that Lending Partner’s own privacy policy governs the data. We only share with partners bound by confidentiality and data-protection terms.',
  },
  {
    title: '6. How we share your information',
    body:
      'We do NOT sell your personal information. We share it only with: Lending Partners (with your consent); credit bureaus (only with your explicit consent); service providers/sub-processors (e.g. cloud hosting, the voice-AI processor for “Ruby”) under contract; legal/regulatory authorities where required by law; and in a corporate transaction subject to this policy.',
  },
  {
    title: '7. Data retention & deletion',
    body:
      'We keep your data only as long as necessary for the purposes here and to meet legal, regulatory record-keeping, dispute and audit obligations, then delete, anonymise or securely dispose of it. You may request deletion of your account and data (see Your rights).',
  },
  {
    title: '8. Data security',
    body:
      'We use reasonable security practices appropriate to the data’s sensitivity: encryption in transit (TLS); hashing of credentials and OTPs; role-based least-privilege access; data minimization (e.g. storing only the last 4 digits of Aadhaar/bank identifiers, no biometric selfies); logging and monitoring; and secure development practices. No system is perfectly secure; in a data breach we notify CERT-In, the Data Protection Board of India, and affected users as required by law.',
  },
  {
    title: '9. Your rights',
    body:
      'Subject to law you can: access a summary of your data; correct/update it (you can edit much of your profile in-app); request erasure; withdraw consent; raise a grievance; and nominate someone to exercise your rights (DPDP Act). Contact our Grievance Officer / DPO to exercise these; we may verify your identity first.',
  },
  {
    title: '10. Grievance redressal',
    body:
      'We have a Grievance Officer / Data Protection Officer for questions and complaints about your data and the lending services. Email: grievance@swiftloan.ai. We acknowledge and resolve complaints within the timeframes prescribed by law. Loan-specific grievances can also be escalated to your Lending Partner and, where applicable, the RBI Integrated Ombudsman Scheme.',
  },
  {
    title: '11. Children, localization & changes',
    body:
      'The app is for individuals 18+. We store personal data on servers located in India; any cross-border transfer is only as permitted by law. We may update this policy and will post the revised version with a new “Last updated” date; material changes are notified as required by law.',
  },
  {
    title: '12. Contact',
    body:
      'Questions about this policy or your data: support@swiftloan.ai · https://swiftloan.ai. This policy aligns with the DPDP Act 2023, IT Act / SPDI Rules 2011, and the RBI Digital Lending Guidelines 2022.',
  },
];
