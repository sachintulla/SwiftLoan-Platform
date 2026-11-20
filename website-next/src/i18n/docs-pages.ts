import { defineCopy } from "@/lib/copy"; // server-safe: the pages' structured data reads this on the server

/**
 * The documents and eligibility pages: /personal-loan-documents, /business-loan-documents,
 * /personal-loan-eligibility and /personal-loan-for-self-employed.
 *
 * FACTS RULE: every figure and every product fact here is one the site already states, in
 * offers.ts (amounts, "Interest from 10.49% p.a.", tenures, uses), faqs.ts (document lists, soft
 * check, no borrower fees, low credit score, data safety), loan-pages.ts (who can apply) or the
 * compliance page (Key Fact Statement, the lender decides). There is NO minimum age, salary,
 * credit score, turnover or business vintage anywhere: each lender sets its own, and the copy says so.
 * Never promise approval. A test checks every ₹ amount and % here also appears in offers.ts.
 */
export type DocsPageKey = "personalDocs" | "businessDocs" | "eligibility" | "selfEmployed";

/** Page key → its path. Kept here (not in the client component) so server pages can read it. */
export const DOCS_PAGE_PATHS: Record<DocsPageKey, string> = {
  personalDocs: "/personal-loan-documents",
  businessDocs: "/business-loan-documents",
  eligibility: "/personal-loan-eligibility",
  selfEmployed: "/personal-loan-for-self-employed",
};
export const DOCS_PAGE_KEYS = Object.keys(DOCS_PAGE_PATHS) as DocsPageKey[];

/** One block of a page: a paragraph, a list, numbered steps and/or a simple table, in that order. */
export interface DocsSection {
  title: string;
  body?: string;
  items?: string[];
  /** Numbered steps (order matters), shown after `items`. */
  steps?: string[];
  table?: { head: string[]; rows: string[][] };
  note?: string;
}
export interface DocsPage {
  breadcrumb: string;
  h1: string;
  intro: string;
  sections: DocsSection[];
  faqTitle: string;
  faqs: { q: string; a: string }[];
  ctaTitle: string;
  ctaBody: string;
  disclaimer: string;
}
interface DocsPagesCopy {
  home: string;
  ctaButton: string;
  emiLink: string;
  relatedTitle: string;
  /** Labels of the related links that are not one of these four pages. */
  links: { personalLoan: string; businessLoan: string; emiCalculator: string };
  pages: Record<DocsPageKey, DocsPage>;
}

export const docsPagesCopy = defineCopy<DocsPagesCopy>({
  en: {
    home: "Home",
    ctaButton: "Check my offers",
    emiLink: "Work out your EMI",
    relatedTitle: "Related guides",
    links: { personalLoan: "Personal loan", businessLoan: "Business loan", emiCalculator: "EMI calculator" },
    pages: {
      personalDocs: {
        breadcrumb: "Personal loan documents",
        h1: "Documents required for personal loan",
        intro:
          "A personal loan through SwiftLoan.ai is 100% paperless, so the list is short: PAN, Aadhaar-based eKYC or DigiLocker, and recent bank statements or salary slips. You need no documents at all to see your first matched offers. Here is what each one is for and how to get it ready.",
        sections: [
          {
            title: "The personal loan document checklist",
            items: [
              "PAN: your tax identity number. Lenders use it to identify you and to look up your credit history.",
              "Aadhaar-based eKYC or DigiLocker: confirms your identity and address online, with no paper copies.",
              "Recent bank statements or salary slips: show the lender your income and how you manage your money.",
            ],
            note: "This is the list for most personal loans. The lender you choose may ask for something more, and will tell you before you go ahead.",
          },
          {
            title: "Salaried or self-employed: what changes",
            body: "The identity documents are the same for everyone. Only the income proof differs.",
            table: {
              head: ["Document", "Salaried", "Self-employed"],
              rows: [
                ["PAN", "Needed", "Needed"],
                ["Aadhaar-based eKYC or DigiLocker", "Needed", "Needed"],
                ["Income proof", "Recent bank statements or salary slips", "Recent bank statements"],
              ],
            },
            note: "If you are self-employed you have no salary slips, so your bank statements carry the income proof. If the money is for the business itself, look at the business loan documents instead.",
          },
          {
            title: "When each document comes in",
            steps: [
              "Seeing matched offers: no documents. You share a few details and it is a soft check, so your credit score is not affected.",
              "Going ahead with a lender: your identity is confirmed through Aadhaar-based eKYC or DigiLocker, and the lender looks at your bank statements or salary slips.",
              "Before you accept: the lender gives you a Key Fact Statement listing the rate and every charge. Read it carefully; if a cost is not in it, you do not pay it.",
            ],
          },
          {
            title: "How to get your documents ready",
            items: [
              "Check that your name and date of birth read the same on your PAN and your Aadhaar.",
              "Aadhaar-based eKYC usually sends an OTP to the mobile number linked to your Aadhaar, so keep that phone with you.",
              "Download recent statements from your bank's app or net banking, for the account your salary or income is paid into. A statement file from the bank is clearer than a photo of a passbook.",
              "If you are salaried, keep your latest salary slips as clear, complete files.",
            ],
          },
        ],
        faqTitle: "Personal loan documents: common questions",
        faqs: [
          { q: "What documents are required for a personal loan?", a: "For most personal loans: PAN, Aadhaar-based eKYC or DigiLocker, and recent bank statements or salary slips." },
          { q: "Do I need documents to see my offers?", a: "No. No documents are needed to see your initial matched offers. You share a few details and we run a soft check, which does not affect your credit score." },
          { q: "Do I have to submit paper copies?", a: "No. The process is 100% paperless: eKYC and disbursal are done online." },
          { q: "I am self-employed and have no salary slips. Can I still apply?", a: "Yes. You can apply whether you are salaried or self-employed, as long as you have a regular income. Recent bank statements act as your income proof. Each lender sets its own criteria and takes the final decision." },
          { q: "Is it safe to share my documents?", a: "We collect only need-based data with your explicit consent, protect it with 256-bit bank-grade encryption and store it in India. We take no access to your contacts, media or files and store no biometrics." },
        ],
        ctaTitle: "See your offers before you gather any paperwork",
        ctaBody: "Soft credit check, 100% paperless, about 3 minutes.",
        disclaimer: "The lender sets the final document list, loan amount, rate, fees and tenure based on your profile.",
      },
      businessDocs: {
        breadcrumb: "Business loan documents",
        h1: "Documents required for business loan",
        intro:
          "Lenders assess a business loan mainly on GST returns and bank statements, so those are the papers to get in order, along with your PAN and basic details of how long the business has been running. Here is what each one shows, how to prepare it and what happens after you share it.",
        sections: [
          {
            title: "Business loan document checklist",
            table: {
              head: ["Document", "What it shows the lender"],
              rows: [
                ["PAN", "Who is borrowing, and the credit history linked to that PAN."],
                ["GST returns", "What the business sells, period after period."],
                ["Business bank statements", "Money coming in and going out: your cash flow."],
                ["Basic business vintage details", "How long the business has been running."],
              ],
            },
            note: "No documents are needed to see your initial matched offers.",
          },
          {
            title: "Why GST returns and bank statements matter most",
            body: "Business loans here are assessed on GST and bank statements, and rates are tailored to your vintage and turnover. Read together, the two documents tell a lender how much the business sells and how steadily money moves through it, which is what decides whether an EMI fits your cash flow. Complete, up-to-date records make that picture easy to read.",
          },
          {
            title: "How to prepare them",
            items: [
              "File any pending GST returns before you apply, so your record is up to date.",
              "Download statements for the account the business actually runs through, directly from your bank.",
              "Where you can, keep business money and personal money in separate accounts. It makes your cash flow easier to read.",
              "Note when the business started and what it does. That is the basic vintage detail lenders ask for.",
            ],
          },
          {
            title: "If your business is new or small",
            body: "Each lending partner sets its own criteria for vintage, turnover and credit history, so there is no single minimum we can quote. Share your real details: the match shows only the offers that fit them. If you are self-employed and the money is for a personal need, a personal loan asks for bank statements rather than GST returns.",
          },
          {
            title: "What happens after you share your details",
            steps: [
              "We run a soft check, which does not affect your credit score.",
              "You compare matched offers side by side: rate, EMI, fees and tenure. Funding ranges from ₹1,00,000 – ₹75,00,000 over 6 to 48 months.",
              "You pick an offer and finish with the lender, who assesses your GST and bank statements and disburses the loan.",
              "Before you accept, the lender's Key Fact Statement shows every charge.",
            ],
          },
        ],
        faqTitle: "Business loan documents: common questions",
        faqs: [
          { q: "What documents are required for a business loan?", a: "PAN, GST returns, business bank statements and basic business vintage details." },
          { q: "Do I need all of them just to see offers?", a: "No. No documents are needed to see your initial matched offers. The lender assesses your GST and bank statements after you pick an offer." },
          { q: "How do lenders use my GST returns?", a: "Lenders mainly look at your GST returns and bank statements to understand your cash flow." },
          { q: "Can a startup apply?", a: "Yes. Business loans are for MSMEs, startups and self-employed professionals with a running business. Each lending partner sets its own criteria for vintage, turnover and credit history." },
          { q: "Does SwiftLoan.ai charge a fee?", a: "No. Borrowers pay us nothing. Lender charges such as processing fees are shown in each lender's Key Fact Statement before you accept." },
        ],
        ctaTitle: "See the business loan offers that fit your cash flow",
        ctaBody: "Soft credit check first. Documents come later, with the lender you choose.",
        disclaimer: "The lender sets the final document list, loan amount, rate, fees and tenure based on your business profile.",
      },
      eligibility: {
        breadcrumb: "Personal loan eligibility",
        h1: "Personal loan eligibility: who can apply and how to check",
        intro:
          "Personal loan eligibility is decided by the lender, and each lender sets its own age, income and credit-score criteria. Rather than guessing against different rule sheets, you can check once on SwiftLoan.ai with a soft check and see only the offers that fit your profile.",
        sections: [
          {
            title: "Who can apply",
            items: [
              "Indian residents with a regular income.",
              "Salaried and self-employed people alike.",
              "No security or guarantor is needed: a personal loan is collateral-free.",
            ],
            note: "Loan amounts run from ₹50,000 – ₹25,00,000, with tenures of 3 to 60 months and interest from 10.49% p.a. What you are offered depends on your profile.",
          },
          {
            title: "What lenders look at",
            table: {
              head: ["Factor", "Why it matters"],
              rows: [
                ["Income", "Shows whether the EMI fits comfortably within what you earn."],
                ["Credit history", "Shows how you repaid earlier loans and cards. A good repayment history usually means a better rate."],
                ["Age", "Each lender has its own age range."],
                ["Bank statements or salary slips", "Back up the income you state."],
              ],
            },
            note: "There is no single cut-off we can quote for any of these. Each lender sets its own, and our match shows only the offers that fit your profile.",
          },
          {
            title: "How the eligibility check works",
            steps: [
              "Share a few details. The application takes about 3 minutes.",
              "We run a soft check across our lender network. It has no impact on your credit score.",
              "Matched offers appear side by side: rate, EMI, fees and tenure.",
              "A hard enquiry happens only later, with your explicit consent, if you go ahead with a specific lender's offer.",
            ],
          },
          {
            title: "If your credit score is low",
            body: "You can still apply. Offers are ranked by your likelihood of approval, and several of our partners assess cash flow, GST and banking behaviour alongside your bureau score. Because it is a soft check, exploring your options costs you nothing. Seeing an offer is not an approval: the lender takes the final decision.",
          },
          {
            title: "Before you check",
            items: [
              "Give details that match your documents; a mismatch only slows things down.",
              "Ask for an amount whose EMI you can repay comfortably. The EMI calculator shows the monthly figure in seconds.",
              "Paying existing EMIs and card bills on time builds the repayment history lenders look for.",
            ],
          },
        ],
        faqTitle: "Personal loan eligibility: common questions",
        faqs: [
          { q: "Who is eligible for a personal loan?", a: "Indian residents with a regular income, salaried or self-employed, can apply. Each lender sets its own age, income and credit-score criteria." },
          { q: "What is the minimum salary or credit score?", a: "There is no single figure. Each lender sets its own criteria, and our match shows only the offers that fit your profile." },
          { q: "Does checking my eligibility affect my credit score?", a: "No. It is a soft check. A hard enquiry happens only later, with your consent, when you apply to a lender." },
          { q: "Does a matched offer mean my loan is approved?", a: "No. An offer is matched to the details you shared. The credit decision, sanction and loan agreement are between you and the lender." },
          { q: "Is there a charge to check eligibility?", a: "No. We charge borrowers nothing. Lender charges such as processing fees are disclosed in the Key Fact Statement before you accept." },
        ],
        ctaTitle: "Check your personal loan eligibility now",
        ctaBody: "A soft check with no impact on your credit score, in about 3 minutes.",
        disclaimer: "Eligibility, loan amount, rate, fees and tenure are decided by the lender based on your profile.",
      },
      selfEmployed: {
        breadcrumb: "Personal loan for self-employed",
        h1: "Personal loan for self employed: how to apply without salary slips",
        intro:
          "Running your own shop, practice or freelance work does not shut you out of a personal loan. Self-employed people with a regular income can apply through SwiftLoan.ai, and bank statements stand in for the salary slips you do not have.",
        sections: [
          {
            title: "Who counts as self-employed",
            body: "Anyone who earns from their own work rather than a salary: shop owners and traders, professionals with their own practice such as doctors, chartered accountants and consultants, and freelancers. If that is you, you can choose between two kinds of loan, depending on what the money is for.",
          },
          {
            title: "Personal loan or business loan?",
            table: {
              head: ["", "Personal loan", "Business loan"],
              rows: [
                ["Meant for", "Wedding, medical, travel, education, debt consolidation", "Inventory, working capital, equipment, expansion, payroll"],
                ["Amount", "₹50,000 – ₹25,00,000", "₹1,00,000 – ₹75,00,000"],
                ["Tenure", "3 to 60 months", "6 to 48 months"],
                ["Rate", "Interest from 10.49% p.a.", "Tailored to vintage and turnover"],
                ["Assessed on", "Your income and credit history", "GST and bank statements"],
                ["Documents", "PAN, Aadhaar-based eKYC or DigiLocker, recent bank statements", "PAN, GST returns, business bank statements, basic vintage details"],
              ],
            },
            note: "Both are compared the same way: a soft check first, then matched offers side by side.",
          },
          {
            title: "How lenders read your income without a salary slip",
            body: "A salary slip shows one fixed monthly figure. When you work for yourself, a lender reads the same story from your bank statements: what comes in, how regularly, and what is left after expenses. Income that moves up and down from month to month is normal for anyone in business, so a complete statement matters more than a perfect month. Several of our lending partners also assess cash flow, GST and banking behaviour alongside your bureau score.",
          },
          {
            title: "Getting ready to apply",
            items: [
              "Take your earnings through one bank account as far as you can, so a single statement shows your whole income.",
              "Download recent statements for that account directly from your bank.",
              "Keep your PAN and the phone linked to your Aadhaar with you.",
              "Work out the EMI first, and pick one you can still pay in a slow month.",
            ],
          },
        ],
        faqTitle: "Personal loan for self-employed: common questions",
        faqs: [
          { q: "Can a self-employed person get a personal loan?", a: "You can apply. Personal loans are open to Indian residents with a regular income, salaried or self-employed. Each lender sets its own criteria, and approval is the lender's decision." },
          { q: "What documents does a self-employed applicant need?", a: "PAN, Aadhaar-based eKYC or DigiLocker, and recent bank statements. No documents are needed to see your initial matched offers." },
          { q: "Do I need GST returns for a personal loan?", a: "GST returns are on the document list for business loans, not on the list for most personal loans. The lender you choose may ask for more, and will tell you." },
          { q: "Should I take a personal loan or a business loan?", a: "It depends on what the money is for. A personal loan suits personal needs and is assessed on your income and credit history. A business loan funds the business and is assessed on GST and bank statements." },
          { q: "Do I need to pledge anything?", a: "No. A personal loan needs no security or guarantor. The lender decides based on your income and credit history." },
        ],
        ctaTitle: "See the offers you can get as a self-employed applicant",
        ctaBody: "Soft credit check, 100% paperless, about 3 minutes.",
        disclaimer: "Loan amount, rate, fees and tenure are set by the lender based on your profile.",
      },
    },
  },
  hi: {
    home: "होम",
    ctaButton: "मेरे ऑफर्स देखें",
    emiLink: "अपनी EMI निकालें",
    relatedTitle: "इससे जुड़ी जानकारी",
    links: { personalLoan: "पर्सनल लोन", businessLoan: "बिज़नेस लोन", emiCalculator: "EMI कैलकुलेटर" },
    pages: {
      personalDocs: {
        breadcrumb: "पर्सनल लोन के डॉक्युमेंट्स",
        h1: "पर्सनल लोन के लिए ज़रूरी डॉक्युमेंट्स",
        intro:
          "SwiftLoan.ai से पर्सनल लोन 100% पेपरलेस है, इसलिए लिस्ट छोटी है: PAN, Aadhaar आधारित eKYC या DigiLocker, और हाल के बैंक स्टेटमेंट या सैलरी स्लिप। अपने पहले मैच किए गए ऑफर्स देखने के लिए किसी डॉक्युमेंट की ज़रूरत नहीं है। यहाँ जानें कि हर डॉक्युमेंट किस काम आता है और उसे कैसे तैयार रखें।",
        sections: [
          {
            title: "पर्सनल लोन डॉक्युमेंट चेकलिस्ट",
            items: [
              "PAN: आपका टैक्स पहचान नंबर। लेंडर इससे आपकी पहचान करते हैं और आपकी क्रेडिट हिस्ट्री देखते हैं।",
              "Aadhaar आधारित eKYC या DigiLocker: आपकी पहचान और पता ऑनलाइन कन्फ़र्म करता है, बिना किसी पेपर कॉपी के।",
              "हाल के बैंक स्टेटमेंट या सैलरी स्लिप: लेंडर को आपकी आय और पैसों का हिसाब-किताब दिखाते हैं।",
            ],
            note: "यह ज़्यादातर पर्सनल लोन की लिस्ट है। आप जो लेंडर चुनते हैं वह कुछ और माँग सकता है, और आगे बढ़ने से पहले आपको बता देगा।",
          },
          {
            title: "सैलरीड या सेल्फ-एम्प्लॉयड: क्या बदलता है",
            body: "पहचान के डॉक्युमेंट्स सबके लिए एक जैसे हैं। फ़र्क सिर्फ़ आय के प्रमाण में है।",
            table: {
              head: ["डॉक्युमेंट", "सैलरीड", "सेल्फ-एम्प्लॉयड"],
              rows: [
                ["PAN", "ज़रूरी", "ज़रूरी"],
                ["Aadhaar आधारित eKYC या DigiLocker", "ज़रूरी", "ज़रूरी"],
                ["आय का प्रमाण", "हाल के बैंक स्टेटमेंट या सैलरी स्लिप", "हाल के बैंक स्टेटमेंट"],
              ],
            },
            note: "सेल्फ-एम्प्लॉयड होने पर सैलरी स्लिप नहीं होती, इसलिए आपके बैंक स्टेटमेंट ही आय का प्रमाण हैं। अगर पैसा बिज़नेस के लिए चाहिए, तो बिज़नेस लोन के डॉक्युमेंट्स देखें।",
          },
          {
            title: "कौन सा डॉक्युमेंट कब लगता है",
            steps: [
              "मैच किए गए ऑफर्स देखना: कोई डॉक्युमेंट नहीं। आप कुछ जानकारी देते हैं और यह सॉफ्ट चेक है, इसलिए आपके क्रेडिट स्कोर पर असर नहीं पड़ता।",
              "लेंडर के साथ आगे बढ़ना: आपकी पहचान Aadhaar आधारित eKYC या DigiLocker से कन्फ़र्म होती है, और लेंडर आपके बैंक स्टेटमेंट या सैलरी स्लिप देखता है।",
              "स्वीकार करने से पहले: लेंडर आपको Key Fact Statement देता है जिसमें दर और हर चार्ज लिखा होता है। इसे ध्यान से पढ़ें; जो खर्च इसमें नहीं है, वह आपको नहीं देना है।",
            ],
          },
          {
            title: "अपने डॉक्युमेंट्स कैसे तैयार रखें",
            items: [
              "देख लें कि आपके PAN और Aadhaar पर नाम और जन्म तिथि एक जैसी हो।",
              "Aadhaar आधारित eKYC में आम तौर पर Aadhaar से जुड़े मोबाइल नंबर पर OTP आता है, इसलिए वह फ़ोन अपने पास रखें।",
              "जिस खाते में आपकी सैलरी या आय आती है, उसके हाल के स्टेटमेंट बैंक के ऐप या नेट बैंकिंग से डाउनलोड करें। बैंक की स्टेटमेंट फ़ाइल पासबुक की फ़ोटो से ज़्यादा साफ़ होती है।",
              "अगर आप सैलरीड हैं, तो अपनी ताज़ा सैलरी स्लिप साफ़ और पूरी फ़ाइल में रखें।",
            ],
          },
        ],
        faqTitle: "पर्सनल लोन डॉक्युमेंट्स: आम सवाल",
        faqs: [
          { q: "पर्सनल लोन के लिए कौन से डॉक्युमेंट्स चाहिए?", a: "ज़्यादातर पर्सनल लोन के लिए: PAN, Aadhaar आधारित eKYC या DigiLocker, और हाल के बैंक स्टेटमेंट या सैलरी स्लिप।" },
          { q: "क्या ऑफर्स देखने के लिए डॉक्युमेंट्स चाहिए?", a: "नहीं। शुरुआती मैच किए गए ऑफर्स देखने के लिए किसी डॉक्युमेंट की ज़रूरत नहीं है। आप कुछ जानकारी देते हैं और हम सॉफ्ट चेक करते हैं, जिससे आपके क्रेडिट स्कोर पर असर नहीं पड़ता।" },
          { q: "क्या पेपर कॉपी जमा करनी होंगी?", a: "नहीं। प्रक्रिया 100% पेपरलेस है: eKYC और पैसा मिलना, दोनों ऑनलाइन होते हैं।" },
          { q: "मैं सेल्फ-एम्प्लॉयड हूँ और मेरे पास सैलरी स्लिप नहीं है। क्या मैं आवेदन कर सकता हूँ?", a: "हाँ। आप सैलरीड हों या सेल्फ-एम्प्लॉयड, नियमित आय हो तो आवेदन कर सकते हैं। हाल के बैंक स्टेटमेंट आपकी आय का प्रमाण होते हैं। हर लेंडर अपने मापदंड तय करता है और आख़िरी फ़ैसला उसी का होता है।" },
          { q: "क्या अपने डॉक्युमेंट्स शेयर करना सुरक्षित है?", a: "हम सिर्फ़ ज़रूरत भर का डेटा आपकी साफ़ सहमति से लेते हैं, उसे 256-बिट बैंक-ग्रेड एन्क्रिप्शन से सुरक्षित रखते हैं और भारत में स्टोर करते हैं। हम आपके कॉन्टैक्ट्स, मीडिया या फ़ाइलों का एक्सेस नहीं लेते और कोई बायोमेट्रिक्स स्टोर नहीं करते।" },
        ],
        ctaTitle: "कागज़ जुटाने से पहले अपने ऑफर्स देखें",
        ctaBody: "सॉफ्ट क्रेडिट चेक, 100% पेपरलेस, करीब 3 मिनट।",
        disclaimer: "डॉक्युमेंट्स की आख़िरी लिस्ट, लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपकी प्रोफ़ाइल के आधार पर तय करता है।",
      },
      businessDocs: {
        breadcrumb: "बिज़नेस लोन के डॉक्युमेंट्स",
        h1: "बिज़नेस लोन के लिए ज़रूरी डॉक्युमेंट्स",
        intro:
          "लेंडर बिज़नेस लोन का आकलन मुख्य रूप से GST रिटर्न और बैंक स्टेटमेंट से करते हैं, इसलिए यही कागज़ ठीक रखने हैं, साथ में आपका PAN और बिज़नेस कब से चल रहा है इसकी बुनियादी जानकारी। यहाँ जानें कि हर डॉक्युमेंट क्या दिखाता है, उसे कैसे तैयार करें और शेयर करने के बाद क्या होता है।",
        sections: [
          {
            title: "बिज़नेस लोन डॉक्युमेंट चेकलिस्ट",
            table: {
              head: ["डॉक्युमेंट", "लेंडर को इससे क्या पता चलता है"],
              rows: [
                ["PAN", "लोन कौन ले रहा है, और उस PAN से जुड़ी क्रेडिट हिस्ट्री।"],
                ["GST रिटर्न", "बिज़नेस हर अवधि में कितनी बिक्री करता है।"],
                ["बिज़नेस बैंक स्टेटमेंट", "आने और जाने वाला पैसा: आपका कैश फ़्लो।"],
                ["बिज़नेस की उम्र की बुनियादी जानकारी", "बिज़नेस कब से चल रहा है।"],
              ],
            },
            note: "शुरुआती मैच किए गए ऑफर्स देखने के लिए किसी डॉक्युमेंट की ज़रूरत नहीं है।",
          },
          {
            title: "GST रिटर्न और बैंक स्टेटमेंट सबसे अहम क्यों हैं",
            body: "यहाँ बिज़नेस लोन का आकलन GST और बैंक स्टेटमेंट से होता है, और दरें आपके बिज़नेस की उम्र और टर्नओवर के हिसाब से तय होती हैं। दोनों डॉक्युमेंट्स साथ में लेंडर को बताते हैं कि बिज़नेस कितना बेचता है और पैसा कितनी नियमितता से आता-जाता है, और इसी से तय होता है कि EMI आपके कैश फ़्लो में बैठती है या नहीं। पूरे और अप-टू-डेट रिकॉर्ड से यह तस्वीर आसानी से समझ आती है।",
          },
          {
            title: "इन्हें कैसे तैयार करें",
            items: [
              "आवेदन से पहले बाकी GST रिटर्न फ़ाइल कर दें, ताकि आपका रिकॉर्ड अप-टू-डेट रहे।",
              "जिस खाते से बिज़नेस असल में चलता है, उसके स्टेटमेंट सीधे बैंक से डाउनलोड करें।",
              "जहाँ तक हो सके, बिज़नेस का पैसा और निजी पैसा अलग खातों में रखें। इससे आपका कैश फ़्लो समझना आसान होता है।",
              "नोट कर लें कि बिज़नेस कब शुरू हुआ और क्या काम करता है। लेंडर यही बुनियादी जानकारी पूछते हैं।",
            ],
          },
          {
            title: "अगर आपका बिज़नेस नया या छोटा है",
            body: "हर लेंडिंग पार्टनर बिज़नेस की उम्र, टर्नओवर और क्रेडिट हिस्ट्री के अपने मापदंड तय करता है, इसलिए हम कोई एक न्यूनतम सीमा नहीं बता सकते। अपनी सही जानकारी दें: मैच सिर्फ़ वही ऑफर्स दिखाता है जो उसके हिसाब से बैठते हैं। अगर आप सेल्फ-एम्प्लॉयड हैं और पैसा निजी ज़रूरत के लिए चाहिए, तो पर्सनल लोन में GST रिटर्न की जगह बैंक स्टेटमेंट लगते हैं।",
          },
          {
            title: "जानकारी शेयर करने के बाद क्या होता है",
            steps: [
              "हम सॉफ्ट चेक करते हैं, जिससे आपके क्रेडिट स्कोर पर असर नहीं पड़ता।",
              "आप मैच किए गए ऑफर्स साथ-साथ कम्पेयर करते हैं: दर, EMI, फ़ीस और अवधि। फ़ंडिंग ₹1,00,000 – ₹75,00,000 तक, 6 से 48 महीने के लिए मिलती है।",
              "आप एक ऑफर चुनकर लेंडर के साथ आगे बढ़ते हैं, जो आपके GST और बैंक स्टेटमेंट देखकर लोन देता है।",
              "स्वीकार करने से पहले लेंडर के Key Fact Statement में हर चार्ज दिखाया जाता है।",
            ],
          },
        ],
        faqTitle: "बिज़नेस लोन डॉक्युमेंट्स: आम सवाल",
        faqs: [
          { q: "बिज़नेस लोन के लिए कौन से डॉक्युमेंट्स चाहिए?", a: "PAN, GST रिटर्न, बिज़नेस बैंक स्टेटमेंट और बिज़नेस की उम्र की बुनियादी जानकारी।" },
          { q: "क्या सिर्फ़ ऑफर्स देखने के लिए ये सब चाहिए?", a: "नहीं। शुरुआती मैच किए गए ऑफर्स देखने के लिए किसी डॉक्युमेंट की ज़रूरत नहीं है। ऑफर चुनने के बाद लेंडर आपके GST और बैंक स्टेटमेंट देखता है।" },
          { q: "लेंडर मेरे GST रिटर्न का क्या करते हैं?", a: "लेंडर मुख्य रूप से आपके GST रिटर्न और बैंक स्टेटमेंट से आपका कैश फ़्लो समझते हैं।" },
          { q: "क्या स्टार्टअप आवेदन कर सकता है?", a: "हाँ। बिज़नेस लोन चल रहे बिज़नेस वाले MSME, स्टार्टअप और सेल्फ-एम्प्लॉयड प्रोफ़ेशनल्स के लिए है। हर लेंडिंग पार्टनर बिज़नेस की उम्र, टर्नओवर और क्रेडिट हिस्ट्री के अपने मापदंड तय करता है।" },
          { q: "क्या SwiftLoan.ai कोई फ़ीस लेता है?", a: "नहीं। उधार लेने वालों से हम कुछ नहीं लेते। लेंडर के चार्ज, जैसे प्रोसेसिंग फ़ीस, स्वीकार करने से पहले हर लेंडर के Key Fact Statement में दिखाए जाते हैं।" },
        ],
        ctaTitle: "अपने कैश फ़्लो के हिसाब से बिज़नेस लोन ऑफर्स देखें",
        ctaBody: "पहले सॉफ्ट क्रेडिट चेक। डॉक्युमेंट्स बाद में, आपके चुने हुए लेंडर के साथ।",
        disclaimer: "डॉक्युमेंट्स की आख़िरी लिस्ट, लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपके बिज़नेस की प्रोफ़ाइल के आधार पर तय करता है।",
      },
      eligibility: {
        breadcrumb: "पर्सनल लोन पात्रता",
        h1: "पर्सनल लोन पात्रता: कौन आवेदन कर सकता है और कैसे जाँचें",
        intro:
          "पर्सनल लोन की पात्रता लेंडर तय करता है, और हर लेंडर उम्र, आय और क्रेडिट स्कोर के अपने मापदंड रखता है। अलग-अलग नियमों का अंदाज़ा लगाने की जगह, आप SwiftLoan.ai पर एक बार सॉफ्ट चेक से जाँच कर सकते हैं और सिर्फ़ वही ऑफर्स देख सकते हैं जो आपकी प्रोफ़ाइल के हिसाब से हैं।",
        sections: [
          {
            title: "कौन आवेदन कर सकता है",
            items: [
              "नियमित आय वाले भारतीय निवासी।",
              "सैलरीड और सेल्फ-एम्प्लॉयड, दोनों।",
              "कोई सिक्योरिटी या गारंटर नहीं चाहिए: पर्सनल लोन के लिए कुछ गिरवी नहीं रखना पड़ता।",
            ],
            note: "लोन अमाउंट ₹50,000 – ₹25,00,000 तक, अवधि 3 से 60 महीने और ब्याज 10.49% प्रति वर्ष से। आपको क्या ऑफर मिलता है, यह आपकी प्रोफ़ाइल पर निर्भर है।",
          },
          {
            title: "लेंडर क्या देखते हैं",
            table: {
              head: ["बात", "यह क्यों मायने रखती है"],
              rows: [
                ["आय", "इससे पता चलता है कि EMI आपकी कमाई में आराम से बैठती है या नहीं।"],
                ["क्रेडिट हिस्ट्री", "इससे पता चलता है कि आपने पहले के लोन और कार्ड कैसे चुकाए। अच्छा भुगतान रिकॉर्ड आम तौर पर बेहतर दर दिलाता है।"],
                ["उम्र", "हर लेंडर की अपनी उम्र सीमा होती है।"],
                ["बैंक स्टेटमेंट या सैलरी स्लिप", "आपकी बताई आय की पुष्टि करते हैं।"],
              ],
            },
            note: "इनमें से किसी के लिए हम कोई एक कट-ऑफ़ नहीं बता सकते। हर लेंडर अपना तय करता है, और हमारा मैच सिर्फ़ आपकी प्रोफ़ाइल के हिसाब से ऑफर्स दिखाता है।",
          },
          {
            title: "पात्रता की जाँच कैसे होती है",
            steps: [
              "कुछ जानकारी दें। आवेदन में करीब 3 मिनट लगते हैं।",
              "हम अपने लेंडर नेटवर्क में सॉफ्ट चेक करते हैं। इसका आपके क्रेडिट स्कोर पर कोई असर नहीं पड़ता।",
              "मैच किए गए ऑफर्स साथ-साथ दिखते हैं: दर, EMI, फ़ीस और अवधि।",
              "हार्ड इन्क्वायरी बाद में, आपकी साफ़ सहमति से, सिर्फ़ तब होती है जब आप किसी लेंडर के ऑफर के साथ आगे बढ़ते हैं।",
            ],
          },
          {
            title: "अगर आपका क्रेडिट स्कोर कम है",
            body: "आप फिर भी आवेदन कर सकते हैं। ऑफर्स आपकी मंज़ूरी की संभावना के हिसाब से रैंक होते हैं, और हमारे कई पार्टनर आपके ब्यूरो स्कोर के साथ कैश फ़्लो, GST और बैंकिंग व्यवहार भी देखते हैं। यह सॉफ्ट चेक है, इसलिए अपने विकल्प देखने में आपका कुछ खर्च नहीं होता। ऑफर दिखना मंज़ूरी नहीं है: आख़िरी फ़ैसला लेंडर करता है।",
          },
          {
            title: "जाँचने से पहले",
            items: [
              "वही जानकारी दें जो आपके डॉक्युमेंट्स में है; फ़र्क होने पर सिर्फ़ देर होती है।",
              "उतना ही अमाउंट माँगें जिसकी EMI आप आराम से चुका सकें। EMI कैलकुलेटर कुछ सेकंड में महीने की किस्त बता देता है।",
              "मौजूदा EMI और कार्ड बिल समय पर चुकाने से वह भुगतान रिकॉर्ड बनता है जो लेंडर देखते हैं।",
            ],
          },
        ],
        faqTitle: "पर्सनल लोन पात्रता: आम सवाल",
        faqs: [
          { q: "पर्सनल लोन के लिए कौन पात्र है?", a: "नियमित आय वाले भारतीय निवासी, सैलरीड या सेल्फ-एम्प्लॉयड, आवेदन कर सकते हैं। हर लेंडर उम्र, आय और क्रेडिट स्कोर के अपने मापदंड तय करता है।" },
          { q: "न्यूनतम सैलरी या क्रेडिट स्कोर कितना चाहिए?", a: "कोई एक आँकड़ा नहीं है। हर लेंडर अपने मापदंड तय करता है, और हमारा मैच सिर्फ़ आपकी प्रोफ़ाइल के हिसाब से ऑफर्स दिखाता है।" },
          { q: "क्या पात्रता जाँचने से मेरा क्रेडिट स्कोर प्रभावित होता है?", a: "नहीं। यह सॉफ्ट चेक है। हार्ड इन्क्वायरी बाद में, आपकी सहमति से, सिर्फ़ तब होती है जब आप किसी लेंडर के पास आवेदन करते हैं।" },
          { q: "क्या ऑफर मैच होने का मतलब है कि लोन मंज़ूर हो गया?", a: "नहीं। ऑफर आपकी दी हुई जानकारी से मैच होता है। क्रेडिट का फ़ैसला, मंज़ूरी और लोन एग्रीमेंट आपके और लेंडर के बीच होते हैं।" },
          { q: "क्या पात्रता जाँचने का कोई चार्ज है?", a: "नहीं। उधार लेने वालों से हम कुछ नहीं लेते। लेंडर के चार्ज, जैसे प्रोसेसिंग फ़ीस, स्वीकार करने से पहले Key Fact Statement में बताए जाते हैं।" },
        ],
        ctaTitle: "अभी अपनी पर्सनल लोन पात्रता जाँचें",
        ctaBody: "सॉफ्ट चेक, क्रेडिट स्कोर पर कोई असर नहीं, करीब 3 मिनट।",
        disclaimer: "पात्रता, लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपकी प्रोफ़ाइल के आधार पर तय करता है।",
      },
      selfEmployed: {
        breadcrumb: "सेल्फ-एम्प्लॉयड के लिए पर्सनल लोन",
        h1: "सेल्फ-एम्प्लॉयड के लिए पर्सनल लोन: सैलरी स्लिप के बिना कैसे आवेदन करें",
        intro:
          "अपनी दुकान, प्रैक्टिस या फ़्रीलांस काम होने से पर्सनल लोन का रास्ता बंद नहीं होता। नियमित आय वाले सेल्फ-एम्प्लॉयड लोग SwiftLoan.ai से आवेदन कर सकते हैं, और जो सैलरी स्लिप आपके पास नहीं है उसकी जगह बैंक स्टेटमेंट काम आते हैं।",
        sections: [
          {
            title: "सेल्फ-एम्प्लॉयड किसे कहते हैं",
            body: "जो कोई सैलरी की जगह अपने काम से कमाता है: दुकानदार और व्यापारी, अपनी प्रैक्टिस वाले प्रोफ़ेशनल्स जैसे डॉक्टर, चार्टर्ड अकाउंटेंट और कंसल्टेंट, और फ़्रीलांसर। अगर आप इनमें हैं, तो पैसा किस काम के लिए चाहिए इसके हिसाब से आप दो तरह के लोन में से चुन सकते हैं।",
          },
          {
            title: "पर्सनल लोन या बिज़नेस लोन?",
            table: {
              head: ["", "पर्सनल लोन", "बिज़नेस लोन"],
              rows: [
                ["किसलिए", "शादी, इलाज, यात्रा, पढ़ाई, कर्ज़ चुकाना", "स्टॉक, वर्किंग कैपिटल, मशीनरी, विस्तार, सैलरी"],
                ["अमाउंट", "₹50,000 – ₹25,00,000", "₹1,00,000 – ₹75,00,000"],
                ["अवधि", "3 से 60 महीने", "6 से 48 महीने"],
                ["दर", "ब्याज 10.49% प्रति वर्ष से", "बिज़नेस की उम्र और टर्नओवर के हिसाब से"],
                ["आकलन किस पर", "आपकी आय और क्रेडिट हिस्ट्री", "GST और बैंक स्टेटमेंट"],
                ["डॉक्युमेंट्स", "PAN, Aadhaar आधारित eKYC या DigiLocker, हाल के बैंक स्टेटमेंट", "PAN, GST रिटर्न, बिज़नेस बैंक स्टेटमेंट, बिज़नेस की उम्र की बुनियादी जानकारी"],
              ],
            },
            note: "दोनों एक ही तरह से कम्पेयर होते हैं: पहले सॉफ्ट चेक, फिर मैच किए गए ऑफर्स साथ-साथ।",
          },
          {
            title: "सैलरी स्लिप के बिना लेंडर आपकी आय कैसे समझते हैं",
            body: "सैलरी स्लिप में हर महीने की एक तय रकम दिखती है। जब आप अपना काम करते हैं, तो लेंडर वही बात आपके बैंक स्टेटमेंट से समझता है: कितना पैसा आता है, कितनी नियमितता से, और खर्च के बाद कितना बचता है। बिज़नेस में आय का हर महीने ऊपर-नीचे होना आम बात है, इसलिए एक बढ़िया महीने से ज़्यादा पूरा स्टेटमेंट मायने रखता है। हमारे कई लेंडिंग पार्टनर आपके ब्यूरो स्कोर के साथ कैश फ़्लो, GST और बैंकिंग व्यवहार भी देखते हैं।",
          },
          {
            title: "आवेदन की तैयारी",
            items: [
              "जहाँ तक हो सके अपनी कमाई एक ही बैंक खाते से लें, ताकि एक ही स्टेटमेंट में पूरी आय दिखे।",
              "उस खाते के हाल के स्टेटमेंट सीधे बैंक से डाउनलोड करें।",
              "अपना PAN और Aadhaar से जुड़ा फ़ोन अपने पास रखें।",
              "पहले EMI निकालें, और ऐसी EMI चुनें जो आप मंदे महीने में भी चुका सकें।",
            ],
          },
        ],
        faqTitle: "सेल्फ-एम्प्लॉयड के लिए पर्सनल लोन: आम सवाल",
        faqs: [
          { q: "क्या सेल्फ-एम्प्लॉयड व्यक्ति को पर्सनल लोन मिल सकता है?", a: "आप आवेदन कर सकते हैं। पर्सनल लोन नियमित आय वाले भारतीय निवासियों के लिए है, सैलरीड हों या सेल्फ-एम्प्लॉयड। हर लेंडर अपने मापदंड तय करता है, और मंज़ूरी लेंडर का फ़ैसला है।" },
          { q: "सेल्फ-एम्प्लॉयड आवेदक को कौन से डॉक्युमेंट्स चाहिए?", a: "PAN, Aadhaar आधारित eKYC या DigiLocker, और हाल के बैंक स्टेटमेंट। शुरुआती मैच किए गए ऑफर्स देखने के लिए किसी डॉक्युमेंट की ज़रूरत नहीं है।" },
          { q: "क्या पर्सनल लोन के लिए GST रिटर्न चाहिए?", a: "GST रिटर्न बिज़नेस लोन के डॉक्युमेंट्स की लिस्ट में हैं, ज़्यादातर पर्सनल लोन की लिस्ट में नहीं। आप जो लेंडर चुनते हैं वह कुछ और माँग सकता है, और आपको बता देगा।" },
          { q: "मुझे पर्सनल लोन लेना चाहिए या बिज़नेस लोन?", a: "यह इस पर निर्भर है कि पैसा किस काम के लिए चाहिए। पर्सनल लोन निजी ज़रूरतों के लिए है और इसका आकलन आपकी आय और क्रेडिट हिस्ट्री पर होता है। बिज़नेस लोन बिज़नेस के लिए है और इसका आकलन GST और बैंक स्टेटमेंट पर होता है।" },
          { q: "क्या कुछ गिरवी रखना होगा?", a: "नहीं। पर्सनल लोन के लिए कोई सिक्योरिटी या गारंटर नहीं चाहिए। लेंडर आपकी आय और क्रेडिट हिस्ट्री के आधार पर फ़ैसला करता है।" },
        ],
        ctaTitle: "देखें सेल्फ-एम्प्लॉयड के तौर पर आपको कौन से ऑफर्स मिल सकते हैं",
        ctaBody: "सॉफ्ट क्रेडिट चेक, 100% पेपरलेस, करीब 3 मिनट।",
        disclaimer: "लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपकी प्रोफ़ाइल के आधार पर तय करता है।",
      },
    },
  },
  te: {
    home: "హోమ్",
    ctaButton: "నా ఆఫర్స్ చూడండి",
    emiLink: "మీ EMI లెక్కించుకోండి",
    relatedTitle: "దీనికి సంబంధించిన సమాచారం",
    links: { personalLoan: "పర్సనల్ లోన్", businessLoan: "బిజినెస్ లోన్", emiCalculator: "EMI క్యాలిక్యులేటర్" },
    pages: {
      personalDocs: {
        breadcrumb: "పర్సనల్ లోన్ డాక్యుమెంట్స్",
        h1: "పర్సనల్ లోన్ కి కావాల్సిన డాక్యుమెంట్స్",
        intro:
          "SwiftLoan.ai ద్వారా పర్సనల్ లోన్ 100% పేపర్‌లెస్, అందుకే లిస్ట్ చిన్నది: PAN, Aadhaar ఆధారిత eKYC లేదా DigiLocker, ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్. మీ మొదటి మ్యాచ్ అయిన ఆఫర్స్ చూడటానికి ఎలాంటి డాక్యుమెంట్స్ అవసరం లేదు. ప్రతి డాక్యుమెంట్ దేనికి, దాన్ని ఎలా సిద్ధం చేసుకోవాలో ఇక్కడ చూడండి.",
        sections: [
          {
            title: "పర్సనల్ లోన్ డాక్యుమెంట్ చెక్‌లిస్ట్",
            items: [
              "PAN: మీ ట్యాక్స్ గుర్తింపు నంబర్. లెండర్స్ దీనితో మిమ్మల్ని గుర్తిస్తారు, మీ క్రెడిట్ చరిత్ర చూస్తారు.",
              "Aadhaar ఆధారిత eKYC లేదా DigiLocker: పేపర్ కాపీలు లేకుండా మీ గుర్తింపు, చిరునామాను ఆన్‌లైన్ లో నిర్ధారిస్తుంది.",
              "ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్: మీ ఆదాయం, మీరు డబ్బు ఎలా వాడుతున్నారో లెండర్ కి చూపిస్తాయి.",
            ],
            note: "ఇది చాలా పర్సనల్ లోన్లకు ఉండే లిస్ట్. మీరు ఎంచుకున్న లెండర్ ఇంకేదైనా అడగవచ్చు, ముందుకు వెళ్లే ముందే మీకు చెబుతారు.",
          },
          {
            title: "సాలరీడ్ లేదా సెల్ఫ్-ఎంప్లాయ్డ్: ఏం మారుతుంది",
            body: "గుర్తింపు డాక్యుమెంట్స్ అందరికీ ఒకటే. ఆదాయ రుజువు మాత్రమే మారుతుంది.",
            table: {
              head: ["డాక్యుమెంట్", "సాలరీడ్", "సెల్ఫ్-ఎంప్లాయ్డ్"],
              rows: [
                ["PAN", "కావాలి", "కావాలి"],
                ["Aadhaar ఆధారిత eKYC లేదా DigiLocker", "కావాలి", "కావాలి"],
                ["ఆదాయ రుజువు", "ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్", "ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్"],
              ],
            },
            note: "సెల్ఫ్-ఎంప్లాయ్డ్ అయితే సాలరీ స్లిప్స్ ఉండవు, కాబట్టి మీ బ్యాంక్ స్టేట్‌మెంట్సే ఆదాయ రుజువు. డబ్బు బిజినెస్ కోసం అయితే బిజినెస్ లోన్ డాక్యుమెంట్స్ చూడండి.",
          },
          {
            title: "ఏ డాక్యుమెంట్ ఎప్పుడు కావాలి",
            steps: [
              "మ్యాచ్ అయిన ఆఫర్స్ చూడటం: డాక్యుమెంట్స్ అవసరం లేదు. కొన్ని వివరాలు ఇస్తారు; ఇది సాఫ్ట్ చెక్, కాబట్టి మీ క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు.",
              "లెండర్ తో ముందుకు వెళ్లడం: Aadhaar ఆధారిత eKYC లేదా DigiLocker ద్వారా మీ గుర్తింపు నిర్ధారిస్తారు, లెండర్ మీ బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్ చూస్తారు.",
              "ఒప్పుకునే ముందు: లెండర్ మీకు Key Fact Statement ఇస్తారు, అందులో రేటు, ప్రతి ఛార్జీ ఉంటాయి. జాగ్రత్తగా చదవండి; అందులో లేని ఖర్చు మీరు కట్టాల్సిన అవసరం లేదు.",
            ],
          },
          {
            title: "డాక్యుమెంట్స్ ఎలా సిద్ధం చేసుకోవాలి",
            items: [
              "మీ PAN, Aadhaar రెండింటిలో పేరు, పుట్టిన తేదీ ఒకేలా ఉన్నాయో చూసుకోండి.",
              "Aadhaar ఆధారిత eKYC లో సాధారణంగా Aadhaar కి లింక్ అయిన మొబైల్ నంబర్ కి OTP వస్తుంది, కాబట్టి ఆ ఫోన్ మీ దగ్గర ఉంచుకోండి.",
              "మీ జీతం లేదా ఆదాయం వచ్చే ఖాతా ఇటీవలి స్టేట్‌మెంట్స్ ను బ్యాంక్ యాప్ లేదా నెట్ బ్యాంకింగ్ నుండి డౌన్‌లోడ్ చేసుకోండి. పాస్‌బుక్ ఫోటో కంటే బ్యాంక్ ఇచ్చే స్టేట్‌మెంట్ ఫైల్ స్పష్టంగా ఉంటుంది.",
              "మీరు సాలరీడ్ అయితే, తాజా సాలరీ స్లిప్స్ ను స్పష్టమైన, పూర్తి ఫైల్స్ గా ఉంచుకోండి.",
            ],
          },
        ],
        faqTitle: "పర్సనల్ లోన్ డాక్యుమెంట్స్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "పర్సనల్ లోన్ కి ఏ డాక్యుమెంట్స్ కావాలి?", a: "చాలా పర్సనల్ లోన్లకు: PAN, Aadhaar ఆధారిత eKYC లేదా DigiLocker, ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్." },
          { q: "ఆఫర్స్ చూడటానికి డాక్యుమెంట్స్ కావాలా?", a: "అవసరం లేదు. మీ మొదటి మ్యాచ్ అయిన ఆఫర్స్ చూడటానికి ఎలాంటి డాక్యుమెంట్స్ అక్కర్లేదు. మీరు కొన్ని వివరాలు ఇస్తారు, మేము సాఫ్ట్ చెక్ చేస్తాం; దీనివల్ల మీ క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు." },
          { q: "పేపర్ కాపీలు ఇవ్వాలా?", a: "అవసరం లేదు. ప్రక్రియ 100% పేపర్‌లెస్: eKYC, డబ్బు జమ రెండూ ఆన్‌లైన్ లోనే జరుగుతాయి." },
          { q: "నేను సెల్ఫ్-ఎంప్లాయ్డ్, నా దగ్గర సాలరీ స్లిప్స్ లేవు. అప్లై చేయవచ్చా?", a: "చేయవచ్చు. సాలరీడ్ అయినా, సెల్ఫ్-ఎంప్లాయ్డ్ అయినా క్రమమైన ఆదాయం ఉంటే అప్లై చేయవచ్చు. ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ మీ ఆదాయ రుజువుగా పనిచేస్తాయి. ప్రతి లెండర్ తన సొంత ప్రమాణాలు పెట్టుకుంటారు, తుది నిర్ణయం లెండర్ దే." },
          { q: "నా డాక్యుమెంట్స్ షేర్ చేయడం సురక్షితమేనా?", a: "మేము అవసరమైన డేటా మాత్రమే, మీ స్పష్టమైన అనుమతితో తీసుకుంటాం; 256-బిట్ బ్యాంక్-గ్రేడ్ ఎన్‌క్రిప్షన్ తో కాపాడి, భారతదేశంలోనే స్టోర్ చేస్తాం. మీ కాంటాక్ట్స్, మీడియా లేదా ఫైల్స్ యాక్సెస్ తీసుకోం, బయోమెట్రిక్స్ స్టోర్ చేయం." },
        ],
        ctaTitle: "పేపర్లు సేకరించే ముందే మీ ఆఫర్స్ చూడండి",
        ctaBody: "సాఫ్ట్ క్రెడిట్ చెక్, 100% పేపర్‌లెస్, సుమారు 3 నిమిషాలు.",
        disclaimer: "తుది డాక్యుమెంట్ లిస్ట్, లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
      },
      businessDocs: {
        breadcrumb: "బిజినెస్ లోన్ డాక్యుమెంట్స్",
        h1: "బిజినెస్ లోన్ కి కావాల్సిన డాక్యుమెంట్స్",
        intro:
          "లెండర్స్ బిజినెస్ లోన్ ని ముఖ్యంగా GST రిటర్న్స్, బ్యాంక్ స్టేట్‌మెంట్స్ ఆధారంగా అంచనా వేస్తారు, కాబట్టి ఇవే సరిగ్గా ఉంచుకోవాలి; వాటితో పాటు మీ PAN, బిజినెస్ ఎంతకాలంగా నడుస్తోందో ప్రాథమిక వివరాలు. ప్రతి డాక్యుమెంట్ ఏం చూపిస్తుంది, ఎలా సిద్ధం చేయాలి, షేర్ చేసిన తర్వాత ఏం జరుగుతుందో ఇక్కడ చూడండి.",
        sections: [
          {
            title: "బిజినెస్ లోన్ డాక్యుమెంట్ చెక్‌లిస్ట్",
            table: {
              head: ["డాక్యుమెంట్", "లెండర్ కి ఇది ఏం చూపిస్తుంది"],
              rows: [
                ["PAN", "లోన్ ఎవరు తీసుకుంటున్నారు, ఆ PAN కి సంబంధించిన క్రెడిట్ చరిత్ర."],
                ["GST రిటర్న్స్", "బిజినెస్ ప్రతి కాలంలో ఎంత అమ్ముతోంది."],
                ["బిజినెస్ బ్యాంక్ స్టేట్‌మెంట్స్", "వచ్చే డబ్బు, పోయే డబ్బు: మీ క్యాష్ ఫ్లో."],
                ["బిజినెస్ వయసు ప్రాథమిక వివరాలు", "బిజినెస్ ఎంతకాలంగా నడుస్తోంది."],
              ],
            },
            note: "మీ మొదటి మ్యాచ్ అయిన ఆఫర్స్ చూడటానికి ఎలాంటి డాక్యుమెంట్స్ అవసరం లేదు.",
          },
          {
            title: "GST రిటర్న్స్, బ్యాంక్ స్టేట్‌మెంట్స్ ఎందుకు ముఖ్యం",
            body: "ఇక్కడ బిజినెస్ లోన్లను GST, బ్యాంక్ స్టేట్‌మెంట్స్ ఆధారంగా అంచనా వేస్తారు, రేట్లు మీ బిజినెస్ వయసు, టర్నోవర్ ఆధారంగా నిర్ణయిస్తారు. ఈ రెండు డాక్యుమెంట్స్ కలిపి బిజినెస్ ఎంత అమ్ముతోంది, డబ్బు ఎంత క్రమంగా వస్తూ పోతోందో లెండర్ కి చెబుతాయి; EMI మీ క్యాష్ ఫ్లోకి సరిపోతుందా లేదా అనేది దీనితోనే తేలుతుంది. పూర్తి, అప్‌-టు-డేట్ రికార్డులు ఉంటే ఈ చిత్రం సులువుగా అర్థమవుతుంది.",
          },
          {
            title: "వీటిని ఎలా సిద్ధం చేయాలి",
            items: [
              "అప్లై చేసే ముందు పెండింగ్ లో ఉన్న GST రిటర్న్స్ ఫైల్ చేయండి, అప్పుడు మీ రికార్డ్ అప్‌-టు-డేట్ గా ఉంటుంది.",
              "బిజినెస్ నిజంగా నడిచే ఖాతా స్టేట్‌మెంట్స్ ను నేరుగా బ్యాంక్ నుండి డౌన్‌లోడ్ చేసుకోండి.",
              "వీలైనంత వరకు బిజినెస్ డబ్బు, సొంత డబ్బు వేర్వేరు ఖాతాల్లో ఉంచండి. అప్పుడు మీ క్యాష్ ఫ్లో సులువుగా అర్థమవుతుంది.",
              "బిజినెస్ ఎప్పుడు మొదలైంది, ఏం చేస్తుందో రాసి పెట్టుకోండి. లెండర్స్ అడిగే ప్రాథమిక వివరాలు ఇవే.",
            ],
          },
          {
            title: "మీ బిజినెస్ కొత్తది లేదా చిన్నది అయితే",
            body: "ప్రతి లెండింగ్ పార్టనర్ బిజినెస్ వయసు, టర్నోవర్, క్రెడిట్ చరిత్రకు తన సొంత ప్రమాణాలు పెట్టుకుంటారు, కాబట్టి ఒకే కనీస పరిమితి అని మేము చెప్పలేం. మీ నిజమైన వివరాలు ఇవ్వండి: వాటికి సరిపడే ఆఫర్స్ మాత్రమే మ్యాచ్ చూపిస్తుంది. మీరు సెల్ఫ్-ఎంప్లాయ్డ్ అయి, డబ్బు సొంత అవసరానికి అయితే, పర్సనల్ లోన్ కి GST రిటర్న్స్ బదులు బ్యాంక్ స్టేట్‌మెంట్స్ చాలు.",
          },
          {
            title: "వివరాలు షేర్ చేసిన తర్వాత ఏం జరుగుతుంది",
            steps: [
              "మేము సాఫ్ట్ చెక్ చేస్తాం; దీనివల్ల మీ క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు.",
              "మ్యాచ్ అయిన ఆఫర్స్ పక్కపక్కనే కంపేర్ చేస్తారు: రేటు, EMI, ఫీజులు, కాలవ్యవధి. ఫండింగ్ ₹1,00,000 – ₹75,00,000 వరకు, 6 నుండి 48 నెలలకు ఉంటుంది.",
              "ఒక ఆఫర్ ఎంచుకుని లెండర్ దగ్గర పూర్తి చేస్తారు; లెండర్ మీ GST, బ్యాంక్ స్టేట్‌మెంట్స్ చూసి లోన్ ఇస్తారు.",
              "మీరు ఒప్పుకునే ముందు లెండర్ Key Fact Statement లో ప్రతి ఛార్జీ చూపిస్తారు.",
            ],
          },
        ],
        faqTitle: "బిజినెస్ లోన్ డాక్యుమెంట్స్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "బిజినెస్ లోన్ కి ఏ డాక్యుమెంట్స్ కావాలి?", a: "PAN, GST రిటర్న్స్, బిజినెస్ బ్యాంక్ స్టేట్‌మెంట్స్, బిజినెస్ వయసు ప్రాథమిక వివరాలు." },
          { q: "ఆఫర్స్ చూడటానికే ఇవన్నీ కావాలా?", a: "అవసరం లేదు. మీ మొదటి మ్యాచ్ అయిన ఆఫర్స్ చూడటానికి ఎలాంటి డాక్యుమెంట్స్ అక్కర్లేదు. మీరు ఆఫర్ ఎంచుకున్న తర్వాత లెండర్ మీ GST, బ్యాంక్ స్టేట్‌మెంట్స్ చూస్తారు." },
          { q: "లెండర్స్ నా GST రిటర్న్స్ ని ఎలా వాడతారు?", a: "లెండర్స్ ముఖ్యంగా మీ GST రిటర్న్స్, బ్యాంక్ స్టేట్‌మెంట్స్ ద్వారా మీ క్యాష్ ఫ్లో అర్థం చేసుకుంటారు." },
          { q: "స్టార్టప్ అప్లై చేయవచ్చా?", a: "చేయవచ్చు. బిజినెస్ లోన్ నడుస్తున్న బిజినెస్ ఉన్న MSME లు, స్టార్టప్స్, సెల్ఫ్-ఎంప్లాయ్డ్ ప్రొఫెషనల్స్ కోసం. ప్రతి లెండింగ్ పార్టనర్ బిజినెస్ వయసు, టర్నోవర్, క్రెడిట్ చరిత్రకు తన సొంత ప్రమాణాలు పెట్టుకుంటారు." },
          { q: "SwiftLoan.ai ఏమైనా ఫీజు తీసుకుంటుందా?", a: "లేదు. అప్పు తీసుకునే వారి నుండి మేము ఏమీ తీసుకోం. ప్రాసెసింగ్ ఫీజు వంటి లెండర్ ఛార్జీలు మీరు ఒప్పుకునే ముందు ప్రతి లెండర్ Key Fact Statement లో చూపిస్తారు." },
        ],
        ctaTitle: "మీ క్యాష్ ఫ్లోకి సరిపడే బిజినెస్ లోన్ ఆఫర్స్ చూడండి",
        ctaBody: "ముందు సాఫ్ట్ క్రెడిట్ చెక్. డాక్యుమెంట్స్ తర్వాత, మీరు ఎంచుకున్న లెండర్ దగ్గర.",
        disclaimer: "తుది డాక్యుమెంట్ లిస్ట్, లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ బిజినెస్ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
      },
      eligibility: {
        breadcrumb: "పర్సనల్ లోన్ అర్హత",
        h1: "పర్సనల్ లోన్ అర్హత: ఎవరు అప్లై చేయవచ్చు, ఎలా చెక్ చేయాలి",
        intro:
          "పర్సనల్ లోన్ అర్హతను లెండర్ నిర్ణయిస్తారు, ప్రతి లెండర్ వయసు, ఆదాయం, క్రెడిట్ స్కోర్ కి తన సొంత ప్రమాణాలు పెట్టుకుంటారు. రకరకాల నియమాలను ఊహించే బదులు, SwiftLoan.ai లో ఒక్కసారి సాఫ్ట్ చెక్ తో చూసుకుని, మీ ప్రొఫైల్ కి సరిపడే ఆఫర్స్ మాత్రమే చూడవచ్చు.",
        sections: [
          {
            title: "ఎవరు అప్లై చేయవచ్చు",
            items: [
              "క్రమమైన ఆదాయం ఉన్న భారతీయ నివాసులు.",
              "సాలరీడ్, సెల్ఫ్-ఎంప్లాయ్డ్ ఇద్దరూ.",
              "సెక్యూరిటీ లేదా గ్యారంటర్ అక్కర్లేదు: పర్సనల్ లోన్ కి ఏదీ తాకట్టు పెట్టాల్సిన పని లేదు.",
            ],
            note: "లోన్ అమౌంట్ ₹50,000 – ₹25,00,000 వరకు, కాలవ్యవధి 3 నుండి 60 నెలలు, వడ్డీ 10.49% వార్షికం నుండి. మీకు ఏ ఆఫర్ వస్తుందనేది మీ ప్రొఫైల్ పై ఆధారపడి ఉంటుంది.",
          },
          {
            title: "లెండర్స్ ఏం చూస్తారు",
            table: {
              head: ["అంశం", "ఇది ఎందుకు ముఖ్యం"],
              rows: [
                ["ఆదాయం", "EMI మీ సంపాదనలో సులువుగా సరిపోతుందా అని చూపిస్తుంది."],
                ["క్రెడిట్ చరిత్ర", "ఇంతకు ముందు లోన్లు, కార్డులు ఎలా చెల్లించారో చూపిస్తుంది. మంచి చెల్లింపు చరిత్ర ఉంటే సాధారణంగా మంచి రేటు వస్తుంది."],
                ["వయసు", "ప్రతి లెండర్ కి తన సొంత వయసు పరిమితి ఉంటుంది."],
                ["బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్", "మీరు చెప్పిన ఆదాయాన్ని నిర్ధారిస్తాయి."],
              ],
            },
            note: "వీటిలో దేనికీ ఒకే కట్-ఆఫ్ అని మేము చెప్పలేం. ప్రతి లెండర్ తనది తానే నిర్ణయిస్తారు; మా మ్యాచ్ మీ ప్రొఫైల్ కి సరిపడే ఆఫర్స్ మాత్రమే చూపిస్తుంది.",
          },
          {
            title: "అర్హత చెక్ ఎలా జరుగుతుంది",
            steps: [
              "కొన్ని వివరాలు ఇవ్వండి. అప్లికేషన్ కి సుమారు 3 నిమిషాలు పడుతుంది.",
              "మేము మా లెండర్ నెట్‌వర్క్ లో సాఫ్ట్ చెక్ చేస్తాం. దీనివల్ల మీ క్రెడిట్ స్కోర్ పై ఎలాంటి ప్రభావం ఉండదు.",
              "మ్యాచ్ అయిన ఆఫర్స్ పక్కపక్కనే కనిపిస్తాయి: రేటు, EMI, ఫీజులు, కాలవ్యవధి.",
              "హార్డ్ ఎంక్వైరీ తర్వాత, మీ స్పష్టమైన అనుమతితో, మీరు ఒక లెండర్ ఆఫర్ తో ముందుకు వెళ్లినప్పుడు మాత్రమే జరుగుతుంది.",
            ],
          },
          {
            title: "మీ క్రెడిట్ స్కోర్ తక్కువగా ఉంటే",
            body: "అయినా అప్లై చేయవచ్చు. ఆఫర్స్ ను మీ ఆమోద అవకాశం ఆధారంగా ర్యాంక్ చేస్తాం, మా పార్టనర్స్ లో చాలా మంది మీ బ్యూరో స్కోర్ తో పాటు క్యాష్ ఫ్లో, GST, బ్యాంకింగ్ ప్రవర్తన కూడా చూస్తారు. ఇది సాఫ్ట్ చెక్ కాబట్టి మీ ఆప్షన్స్ చూసుకోవడానికి ఏ ఖర్చూ ఉండదు. ఆఫర్ కనిపించడం అంటే ఆమోదం కాదు: తుది నిర్ణయం లెండర్ దే.",
          },
          {
            title: "చెక్ చేసే ముందు",
            items: [
              "మీ డాక్యుమెంట్స్ లో ఉన్న వివరాలే ఇవ్వండి; తేడా ఉంటే ఆలస్యం మాత్రమే అవుతుంది.",
              "మీరు సులువుగా కట్టగలిగే EMI వచ్చే అమౌంట్ అడగండి. EMI క్యాలిక్యులేటర్ కొన్ని సెకన్లలో నెలవారీ మొత్తం చూపిస్తుంది.",
              "ఇప్పటి EMI లు, కార్డ్ బిల్లులు సమయానికి కడితే లెండర్స్ చూసే చెల్లింపు చరిత్ర ఏర్పడుతుంది.",
            ],
          },
        ],
        faqTitle: "పర్సనల్ లోన్ అర్హత: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "పర్సనల్ లోన్ కి ఎవరు అర్హులు?", a: "క్రమమైన ఆదాయం ఉన్న భారతీయ నివాసులు, సాలరీడ్ లేదా సెల్ఫ్-ఎంప్లాయ్డ్, అప్లై చేయవచ్చు. ప్రతి లెండర్ వయసు, ఆదాయం, క్రెడిట్ స్కోర్ కి తన సొంత ప్రమాణాలు పెట్టుకుంటారు." },
          { q: "కనీస జీతం లేదా క్రెడిట్ స్కోర్ ఎంత ఉండాలి?", a: "ఒకే సంఖ్య అంటూ లేదు. ప్రతి లెండర్ తన సొంత ప్రమాణాలు పెట్టుకుంటారు; మా మ్యాచ్ మీ ప్రొఫైల్ కి సరిపడే ఆఫర్స్ మాత్రమే చూపిస్తుంది." },
          { q: "అర్హత చెక్ చేస్తే నా క్రెడిట్ స్కోర్ పై ప్రభావం ఉంటుందా?", a: "లేదు. ఇది సాఫ్ట్ చెక్. హార్డ్ ఎంక్వైరీ తర్వాత, మీ అనుమతితో, మీరు లెండర్ దగ్గర అప్లై చేసినప్పుడు మాత్రమే జరుగుతుంది." },
          { q: "ఆఫర్ మ్యాచ్ అయితే నా లోన్ ఆమోదం అయినట్టేనా?", a: "కాదు. ఆఫర్ మీరు ఇచ్చిన వివరాలకు మ్యాచ్ అవుతుంది. క్రెడిట్ నిర్ణయం, మంజూరు, లోన్ అగ్రిమెంట్ మీకు, లెండర్ కి మధ్య ఉంటాయి." },
          { q: "అర్హత చెక్ చేయడానికి ఏమైనా ఛార్జీ ఉందా?", a: "లేదు. అప్పు తీసుకునే వారి నుండి మేము ఏమీ తీసుకోం. ప్రాసెసింగ్ ఫీజు వంటి లెండర్ ఛార్జీలు మీరు ఒప్పుకునే ముందు Key Fact Statement లో తెలియజేస్తారు." },
        ],
        ctaTitle: "ఇప్పుడే మీ పర్సనల్ లోన్ అర్హత చెక్ చేయండి",
        ctaBody: "సాఫ్ట్ చెక్, క్రెడిట్ స్కోర్ పై ప్రభావం లేదు, సుమారు 3 నిమిషాలు.",
        disclaimer: "అర్హత, లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
      },
      selfEmployed: {
        breadcrumb: "సెల్ఫ్-ఎంప్లాయ్డ్ కోసం పర్సనల్ లోన్",
        h1: "సెల్ఫ్-ఎంప్లాయ్డ్ కోసం పర్సనల్ లోన్: సాలరీ స్లిప్స్ లేకుండా ఎలా అప్లై చేయాలి",
        intro:
          "సొంత షాప్, ప్రాక్టీస్ లేదా ఫ్రీలాన్స్ పని ఉన్నంత మాత్రాన పర్సనల్ లోన్ దారి మూసుకుపోదు. క్రమమైన ఆదాయం ఉన్న సెల్ఫ్-ఎంప్లాయ్డ్ వారు SwiftLoan.ai ద్వారా అప్లై చేయవచ్చు; మీ దగ్గర లేని సాలరీ స్లిప్స్ బదులు బ్యాంక్ స్టేట్‌మెంట్స్ పనికొస్తాయి.",
        sections: [
          {
            title: "సెల్ఫ్-ఎంప్లాయ్డ్ అంటే ఎవరు",
            body: "జీతం కాకుండా సొంత పనితో సంపాదించే ఎవరైనా: షాప్ యజమానులు, వ్యాపారులు, సొంత ప్రాక్టీస్ ఉన్న డాక్టర్లు, చార్టర్డ్ అకౌంటెంట్లు, కన్సల్టెంట్లు వంటి ప్రొఫెషనల్స్, ఫ్రీలాన్సర్లు. మీరు వీరిలో ఒకరైతే, డబ్బు దేనికి కావాలో బట్టి రెండు రకాల లోన్లలో ఒకటి ఎంచుకోవచ్చు.",
          },
          {
            title: "పర్సనల్ లోన్ లేదా బిజినెస్ లోన్?",
            table: {
              head: ["", "పర్సనల్ లోన్", "బిజినెస్ లోన్"],
              rows: [
                ["దేనికి", "పెళ్లి, వైద్యం, ప్రయాణం, చదువు, అప్పులు తీర్చడం", "స్టాక్, వర్కింగ్ క్యాపిటల్, పరికరాలు, విస్తరణ, జీతాలు"],
                ["అమౌంట్", "₹50,000 – ₹25,00,000", "₹1,00,000 – ₹75,00,000"],
                ["కాలవ్యవధి", "3 నుండి 60 నెలలు", "6 నుండి 48 నెలలు"],
                ["రేటు", "వడ్డీ 10.49% వార్షికం నుండి", "బిజినెస్ వయసు, టర్నోవర్ ఆధారంగా"],
                ["దేని ఆధారంగా అంచనా", "మీ ఆదాయం, క్రెడిట్ చరిత్ర", "GST, బ్యాంక్ స్టేట్‌మెంట్స్"],
                ["డాక్యుమెంట్స్", "PAN, Aadhaar ఆధారిత eKYC లేదా DigiLocker, ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్", "PAN, GST రిటర్న్స్, బిజినెస్ బ్యాంక్ స్టేట్‌మెంట్స్, బిజినెస్ వయసు ప్రాథమిక వివరాలు"],
              ],
            },
            note: "రెండింటినీ ఒకేలా కంపేర్ చేస్తారు: ముందు సాఫ్ట్ చెక్, తర్వాత మ్యాచ్ అయిన ఆఫర్స్ పక్కపక్కనే.",
          },
          {
            title: "సాలరీ స్లిప్ లేకుండా లెండర్స్ మీ ఆదాయాన్ని ఎలా అర్థం చేసుకుంటారు",
            body: "సాలరీ స్లిప్ లో ప్రతి నెలా ఒకే నిర్దిష్ట మొత్తం కనిపిస్తుంది. మీరు సొంత పని చేస్తున్నప్పుడు, లెండర్ అదే విషయాన్ని మీ బ్యాంక్ స్టేట్‌మెంట్స్ నుండి చూస్తారు: ఎంత డబ్బు వస్తోంది, ఎంత క్రమంగా వస్తోంది, ఖర్చుల తర్వాత ఎంత మిగులుతోంది. బిజినెస్ లో ఆదాయం నెలనెలా పెరగడం, తగ్గడం మామూలే, కాబట్టి ఒక మంచి నెల కంటే పూర్తి స్టేట్‌మెంట్ ముఖ్యం. మా లెండింగ్ పార్టనర్స్ లో చాలా మంది మీ బ్యూరో స్కోర్ తో పాటు క్యాష్ ఫ్లో, GST, బ్యాంకింగ్ ప్రవర్తన కూడా చూస్తారు.",
          },
          {
            title: "అప్లై చేయడానికి సిద్ధం కావడం",
            items: [
              "వీలైనంత వరకు మీ సంపాదన ఒకే బ్యాంక్ ఖాతాలోకి వచ్చేలా చూసుకోండి, అప్పుడు ఒకే స్టేట్‌మెంట్ లో మీ మొత్తం ఆదాయం కనిపిస్తుంది.",
              "ఆ ఖాతా ఇటీవలి స్టేట్‌మెంట్స్ ను నేరుగా బ్యాంక్ నుండి డౌన్‌లోడ్ చేసుకోండి.",
              "మీ PAN, Aadhaar కి లింక్ అయిన ఫోన్ దగ్గర ఉంచుకోండి.",
              "ముందు EMI లెక్కించుకోండి; వ్యాపారం తక్కువగా ఉన్న నెలలో కూడా కట్టగలిగే EMI ఎంచుకోండి.",
            ],
          },
        ],
        faqTitle: "సెల్ఫ్-ఎంప్లాయ్డ్ కోసం పర్సనల్ లోన్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "సెల్ఫ్-ఎంప్లాయ్డ్ వారికి పర్సనల్ లోన్ వస్తుందా?", a: "మీరు అప్లై చేయవచ్చు. పర్సనల్ లోన్ క్రమమైన ఆదాయం ఉన్న భారతీయ నివాసుల కోసం, సాలరీడ్ అయినా సెల్ఫ్-ఎంప్లాయ్డ్ అయినా. ప్రతి లెండర్ తన సొంత ప్రమాణాలు పెట్టుకుంటారు, ఆమోదం లెండర్ నిర్ణయం." },
          { q: "సెల్ఫ్-ఎంప్లాయ్డ్ వారికి ఏ డాక్యుమెంట్స్ కావాలి?", a: "PAN, Aadhaar ఆధారిత eKYC లేదా DigiLocker, ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్. మీ మొదటి మ్యాచ్ అయిన ఆఫర్స్ చూడటానికి ఎలాంటి డాక్యుమెంట్స్ అవసరం లేదు." },
          { q: "పర్సనల్ లోన్ కి GST రిటర్న్స్ కావాలా?", a: "GST రిటర్న్స్ బిజినెస్ లోన్ డాక్యుమెంట్ లిస్ట్ లో ఉంటాయి, చాలా పర్సనల్ లోన్ల లిస్ట్ లో ఉండవు. మీరు ఎంచుకున్న లెండర్ ఇంకేదైనా అడగవచ్చు, అది మీకు చెబుతారు." },
          { q: "నేను పర్సనల్ లోన్ తీసుకోవాలా, బిజినెస్ లోన్ తీసుకోవాలా?", a: "డబ్బు దేనికి కావాలో దాన్ని బట్టి ఉంటుంది. పర్సనల్ లోన్ సొంత అవసరాలకు; దాన్ని మీ ఆదాయం, క్రెడిట్ చరిత్ర ఆధారంగా అంచనా వేస్తారు. బిజినెస్ లోన్ బిజినెస్ కోసం; దాన్ని GST, బ్యాంక్ స్టేట్‌మెంట్స్ ఆధారంగా అంచనా వేస్తారు." },
          { q: "ఏదైనా తాకట్టు పెట్టాలా?", a: "అవసరం లేదు. పర్సనల్ లోన్ కి ఎలాంటి సెక్యూరిటీ లేదా గ్యారంటర్ అక్కర్లేదు. లెండర్ మీ ఆదాయం, క్రెడిట్ చరిత్ర ఆధారంగా నిర్ణయిస్తారు." },
        ],
        ctaTitle: "సెల్ఫ్-ఎంప్లాయ్డ్ గా మీకు ఏ ఆఫర్స్ వస్తాయో చూడండి",
        ctaBody: "సాఫ్ట్ క్రెడిట్ చెక్, 100% పేపర్‌లెస్, సుమారు 3 నిమిషాలు.",
        disclaimer: "లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
      },
    },
  },
});
