/**
 * Plain-language name + purpose of every screen, sent to the voice agent in
 * page_context as `screen_title` / `screen_purpose`.
 *
 * Why: `page` is the app's internal route id (`fare`, `basicpan`, `lenderweb` ...), which
 * says nothing to a model — `fare` is the "My Offers" tab, `basicpan` is Step 1 of the
 * application. Without a readable name the agent could not tell the user where they
 * are, and the visible text alone does not always say it (e.g. the loader screens).
 * Titles match the names used for Upshot screen events where one exists.
 */
export interface ScreenInfo {
  title: string;
  purpose: string;
}

export const SCREEN_INFO: Record<string, ScreenInfo> = {
  splash: { title: 'Splash', purpose: 'SwiftLoan logo shown for a moment when the app opens; moves on by itself.' },
  privacy: { title: 'Privacy Policy', purpose: 'The privacy policy the user must read and accept before continuing.' },
  language: { title: 'Choose Language', purpose: 'The user picks the app language: English, Hindi or Telugu.' },
  intro: { title: 'Get Started', purpose: 'Welcome page with the Get Started button, before sign-in.' },
  mobile: { title: 'Enter Mobile Number', purpose: 'The user enters their mobile number to receive an OTP.' },
  otp: { title: 'Verify OTP', purpose: 'The user enters the OTP sent by SMS to verify their number.' },
  permissions: { title: 'Allow Permissions', purpose: 'Explains and asks for notification, camera and location permissions.' },
  aboutyou: { title: 'About You', purpose: 'Basic profile: name, date of birth, gender, email and pincode. Can be skipped.' },
  home: { title: 'Home', purpose: 'Dashboard with the Apply for Loan button, available lender offers and shortcuts.' },
  loans: { title: 'My Loans', purpose: "The user's loan applications and their status." },
  fare: { title: 'My Offers', purpose: 'Loan offers the user has received from lenders.' },
  help: { title: 'Help & Support', purpose: 'Help, FAQs and ways to contact support.' },
  profile: { title: 'Profile', purpose: "The user's profile details, language and notification settings." },
  basicpan: { title: 'PAN Verification (Step 1 of 3)', purpose: 'First step of the loan application: enter and verify the PAN; details are pre-filled from it.' },
  basic: { title: 'Basic Details (Step 2 of 3)', purpose: 'Second step of the loan application: personal, employment and loan details.' },
  moredetails: { title: 'More Details (Step 3 of 3)', purpose: 'Third step of the loan application: remaining details before offers are fetched.' },
  finding: { title: 'Finding Offers', purpose: 'Loader shown while lenders are checked for offers. Nothing to do but wait.' },
  offers: { title: 'Loan Offers', purpose: 'The offers returned for this application, to compare and choose from.' },
  compare: { title: 'Compare Offers', purpose: 'Side-by-side comparison of the offers.' },
  calculator: { title: 'EMI Calculator', purpose: 'Estimate the monthly EMI for a loan amount, rate and tenure.' },
  handoff: { title: 'Continue to Lender', purpose: 'Hands the user over to the chosen lender to complete the application.' },
  lenderweb: { title: 'Lender Application', purpose: "The lender's own application form, opened inside the app." },
  status: { title: 'Application Status', purpose: "Progress of the user's application with the lender." },
  disbursed: { title: 'Loan Disbursed', purpose: 'Confirmation that the loan amount has been disbursed.' },
  repay: { title: 'Repayment', purpose: 'EMI schedule and repayments for an active loan.' },
};
