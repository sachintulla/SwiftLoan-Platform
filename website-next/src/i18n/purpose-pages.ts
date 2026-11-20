import { defineCopy } from "@/lib/copy"; // server-safe: the pages' structured data reads this on the server

/**
 * The loan-purpose pages: /wedding-loan, /medical-loan, /travel-loan, /education-loan and
 * /debt-consolidation-loan. Each one is about a PERSONAL LOAN USED FOR that purpose; none is a
 * separate loan product, and the copy says so.
 *
 * Facts: the amount, rate and tenure lines are NOT typed here. The page reads them from the home
 * page's personal-loan card (offers.ts), as /personal-loan does. Everything else factual repeats
 * what the site already says (faqs.ts, loan-pages.ts, the compliance page): soft check, no
 * borrower-side fee, the documents, the lender decides and disburses, the Key Fact Statement.
 * The rest is general guidance on borrowing. No statistics, no eligibility numbers, no tax
 * claims, no promises of approval. The EMI tables are computed (lib/emi.ts) at illustrative rates.
 */
export const PURPOSE_KEYS = ["wedding", "medical", "travel", "education", "debt"] as const;
export type PurposeKey = (typeof PURPOSE_KEYS)[number];

export const PURPOSE_PATH: Record<PurposeKey, string> = {
  wedding: "/wedding-loan",
  medical: "/medical-loan",
  travel: "/travel-loan",
  education: "/education-loan",
  debt: "/debt-consolidation-loan",
};

/**
 * The worked example on each page. Not translated, so it lives outside the copy. Every rate is an
 * illustration inside the APR range the compliance page shows; amounts and tenures are inside the
 * personal-loan range on the home page. `rows` vary the tenure, except on the debt page, where the
 * same loan is shown at several rates (the point of that page is what the rate does to the cost).
 */
export interface PurposeExample {
  principal: number;
  vary: "tenure" | "rate";
  rows: { rate: number; months: number }[];
}
export const PURPOSE_EXAMPLE: Record<PurposeKey, PurposeExample> = {
  wedding: { principal: 400000, vary: "tenure", rows: [24, 36, 48, 60].map((months) => ({ rate: 13, months })) },
  medical: { principal: 150000, vary: "tenure", rows: [6, 12, 18, 24].map((months) => ({ rate: 14, months })) },
  travel: { principal: 100000, vary: "tenure", rows: [3, 6, 12].map((months) => ({ rate: 14, months })) },
  education: { principal: 200000, vary: "tenure", rows: [12, 24, 36].map((months) => ({ rate: 13, months })) },
  debt: { principal: 300000, vary: "rate", rows: [12, 16, 20, 24].map((rate) => ({ rate, months: 36 })) },
};

/** A section of a purpose page. The layouts differ so the five pages are not one template. */
export type PurposeSection =
  | { layout: "prose"; title: string; paragraphs: string[] }
  | { layout: "steps" | "cards"; title: string; intro?: string; items: { title: string; body: string }[] }
  | { layout: "checklist"; title: string; intro?: string; items: string[]; note?: string }
  | { layout: "twoLists"; title: string; lists: { title: string; points: string[] }[] };

export interface PurposePage {
  /** last breadcrumb item */
  breadcrumb: string;
  /** name used when other pages link here */
  linkLabel: string;
  h1: string;
  intro: string;
  factsTitle: string;
  factsNote: string;
  sections: PurposeSection[];
  /** tokens: {amount}, {rate}, {months} */
  exampleTitle: string;
  exampleNote: string;
  faqTitle: string;
  faqs: { q: string; a: string }[];
  ctaTitle: string;
  ctaBody: string;
  disclaimer: string;
}

export interface PurposePagesCopy {
  home: string;
  personalLoan: string;
  emiLink: string;
  ctaButton: string;
  cols: { tenure: string; rate: string; emi: string; interest: string; total: string };
  months: string;
  /** shown under every example table */
  illustration: string;
  relatedTitle: string;
  relatedPersonal: string;
  relatedEmi: string;
  pages: Record<PurposeKey, PurposePage>;
}

export const purposePagesCopy = defineCopy<PurposePagesCopy>({
  en: {
    home: "Home",
    personalLoan: "Personal loan",
    emiLink: "Work out your EMI first",
    ctaButton: "Check my offers",
    cols: { tenure: "Tenure", rate: "Interest rate", emi: "Monthly EMI", interest: "Total interest", total: "Total repayment" },
    months: "months",
    illustration: "The rate in this table is an illustration to show the arithmetic. It is not an offer; your rate is set by the lender.",
    relatedTitle: "Keep reading",
    relatedPersonal: "Personal loan: facts, documents and how it works",
    relatedEmi: "EMI calculator",
    pages: {
      wedding: {
        breadcrumb: "Wedding",
        linkLabel: "Personal loan for wedding",
        h1: "Personal loan for wedding expenses: plan the EMI before you book",
        intro:
          "A wedding loan is simply a personal loan that you use for wedding costs. It needs no collateral, and on SwiftLoan.ai you can check your eligibility with a soft credit check and compare matched offers from RBI-registered lending partners. Decide the amount from the EMI you can repay, not from the guest list.",
        factsTitle: "The personal loan you would be using",
        factsNote: "These are the personal loan terms shown across SwiftLoan.ai. There is no separate wedding loan product, and the lender sets your final terms.",
        sections: [
          {
            layout: "steps",
            title: "How much to borrow for a wedding",
            items: [
              { title: "Start with what you already have", body: "Add up savings and family contributions first. The loan should cover only the gap." },
              { title: "List the costs that are fixed", body: "Write down the costs you have firm quotes for. Leave the wish-list items out of the loan." },
              { title: "Work backwards from the EMI", body: "Pick a monthly EMI you can pay comfortably after rent, bills and existing EMIs, then see what amount and tenure that gives." },
              { title: "Keep the buffer small", body: "Wedding budgets tend to stretch. A modest buffer is sensible; borrowing far beyond the plan is not." },
            ],
          },
          {
            layout: "cards",
            title: "What to compare between offers",
            items: [
              { title: "Interest rate", body: "A lower rate means a lower EMI and less interest over the loan." },
              { title: "Processing fee", body: "It is charged by the lender and shown in the Key Fact Statement before you accept. Two offers at the same rate can cost different amounts." },
              { title: "Tenure", body: "A longer tenure lowers the EMI but adds to the total interest." },
              { title: "Total repayment", body: "Every EMI plus fees is the real price of the loan. The Key Fact Statement shows an all-inclusive APR that makes offers easier to compare." },
            ],
          },
          {
            layout: "prose",
            title: "A word of caution",
            paragraphs: [
              "A wedding lasts a few days; the EMI lasts for the whole tenure. Borrowing for a celebration is a choice rather than a need, so ask what you would cut if the loan were not available.",
              "If the EMI would leave you short for essentials or an emergency, a smaller event or a longer period of saving is the safer route. Agree on the repayment plan as a couple before the wedding, because the EMIs will come out of your shared budget.",
            ],
          },
          {
            layout: "checklist",
            title: "What you need to apply",
            items: ["PAN", "Aadhaar-based eKYC or DigiLocker", "Recent bank statements or salary slips"],
            note: "No documents are needed to see your initial matched offers.",
          },
        ],
        exampleTitle: "Example: {amount} at {rate}% a year",
        exampleNote: "The same loan over four tenures: the EMI falls as the tenure grows, and the total interest rises.",
        faqTitle: "Wedding loan: common questions",
        faqs: [
          { q: "Is there a separate wedding loan?", a: "Not on SwiftLoan.ai. It is a personal loan that you use for wedding costs. The amount, rate and tenure are those of a personal loan and are set by the lender." },
          { q: "Do I need collateral or a guarantor?", a: "No. A personal loan needs no security or guarantor. The lender decides based on your income and credit history." },
          { q: "Will checking wedding loan offers affect my credit score?", a: "No. It is a soft check. A hard enquiry happens only later, with your consent, when you apply to a lender." },
          { q: "When should I apply?", a: "When your costs are firm enough to know the amount. Interest starts once the loan is disbursed, so borrowing months early means paying interest on money you are not using yet. Approval and disbursal are done by the lender." },
          { q: "Can I repay the loan early?", a: "That depends on the lender. Foreclosure and part-prepayment terms are listed in the Key Fact Statement, so read them before you accept if you expect to repay early." },
        ],
        ctaTitle: "See what a personal loan for your wedding would cost",
        ctaBody: "Soft credit check, 100% paperless, about 3 minutes.",
        disclaimer: "SwiftLoan.ai is a Lending Service Provider, not a lender. Loan amount, rate, fees and tenure are set by the lender based on your profile.",
      },
      medical: {
        breadcrumb: "Medical emergency",
        linkLabel: "Personal loan for medical emergency",
        h1: "Personal loan for a medical emergency: what to check when time is short",
        intro:
          "When a hospital bill cannot wait, a personal loan is one way to pay it: it needs no collateral and the process is paperless. SwiftLoan.ai matches you with RBI-registered lending partners after a soft credit check, so you can see offers without affecting your credit score. Approval and disbursal are done by the lender.",
        factsTitle: "Personal loan terms at a glance",
        factsNote: "A loan for medical costs is a personal loan. The amount, rate and tenure you actually get are decided by the lender.",
        sections: [
          {
            layout: "checklist",
            title: "Before you borrow, check these first",
            intro: "A loan costs interest. A few minutes on these can reduce how much you need.",
            items: [
              "Health insurance: ask the hospital's insurance desk or your insurer what your policy covers and how the claim works.",
              "Employer cover: if you are salaried, check whether your employer provides medical cover.",
              "Emergency savings: use what you set aside for exactly this, and borrow only the remainder.",
              "A written estimate: ask the hospital for one, so that you borrow a known amount.",
            ],
            note: "If insurance will reimburse you later, plan to repay the loan with that money, and check the prepayment terms in the Key Fact Statement first.",
          },
          {
            layout: "prose",
            title: "How fast it can be, and who decides",
            paragraphs: [
              "The application on SwiftLoan.ai takes about 3 minutes, and matched offers appear as soon as it is done. With paperless eKYC, approval can happen in minutes, and approved funds are typically credited to your bank account within the same or next working day, depending on the lender.",
              "Nobody can promise a time, because the lender verifies your details and makes the decision. What you can control is being ready.",
            ],
          },
          {
            layout: "cards",
            title: "Keep these ready to avoid delays",
            items: [
              { title: "PAN", body: "Have the number or the card at hand." },
              { title: "Aadhaar-based eKYC or DigiLocker", body: "This is how your identity is verified without paper." },
              { title: "Bank statements or salary slips", body: "Recent ones, so the lender can see your income." },
              { title: "Your bank account", body: "Approved funds are credited directly to your bank account." },
            ],
          },
          {
            layout: "prose",
            title: "Borrow for the bill, not beyond it",
            paragraphs: [
              "In an emergency it is tempting to accept the first offer or to round the amount up. Take two minutes to compare the rate, processing fee and total repayment of the offers you are shown, and choose a tenure whose EMI you can keep paying during recovery.",
              "If no offer suits you, you do not have to accept one. Checking costs you nothing, and the soft check leaves your credit score unchanged.",
            ],
          },
        ],
        exampleTitle: "Example: {amount} at {rate}% a year",
        exampleNote: "A shorter tenure clears the loan sooner and costs less interest. Pick the shortest one whose EMI you can sustain.",
        faqTitle: "Medical emergency loan: common questions",
        faqs: [
          { q: "How quickly can I get money for a medical emergency?", a: "The application takes about 3 minutes. With paperless eKYC, approval can happen in minutes and approved funds are typically credited within the same or next working day, depending on the lender. The lender makes the decision, so no time can be promised." },
          { q: "Should I use insurance or a loan?", a: "Check insurance first, because it does not have to be repaid. A loan is for the part that insurance and savings do not cover." },
          { q: "Can I apply to pay for a family member's treatment?", a: "The loan is assessed and repaid by the person who applies. If you apply to pay for a family member's treatment, the lender looks at your income and credit history, and the EMIs are yours." },
          { q: "Does SwiftLoan.ai charge anything?", a: "No. Borrowers pay us nothing. Lender charges such as processing fees are shown in each lender's Key Fact Statement before you accept." },
          { q: "What if my credit score is low?", a: "You can still check. It is a soft check, so looking at your options does not affect your credit score. Each lender sets its own criteria." },
        ],
        ctaTitle: "See the offers you can get today",
        ctaBody: "Soft credit check, paperless, about 3 minutes. No charge to check.",
        disclaimer: "SwiftLoan.ai is not a lender. Approval, loan amount, rate, fees and disbursal time are decided by the lender.",
      },
      travel: {
        breadcrumb: "Travel",
        linkLabel: "Personal loan for travel",
        h1: "Personal loan for travel: decide the EMI before you book the trip",
        intro:
          "A travel loan is a personal loan used to pay for a trip. It is collateral-free, and you can compare matched offers on SwiftLoan.ai after a soft credit check. Because a holiday is a want rather than a need, this page is as much about when not to borrow as about how.",
        factsTitle: "What a personal loan offers",
        factsNote: "There is no separate travel loan. These are personal loan terms, and the lender sets the ones you get.",
        sections: [
          {
            layout: "prose",
            title: "First question: should this trip be on credit?",
            paragraphs: [
              "A trip ends in days or weeks; the EMIs carry on after you are home. Interest makes the trip cost more than its price tag. If you can save for a few more months and pay in full, you pay no interest at all.",
            ],
          },
          {
            layout: "twoLists",
            title: "When borrowing can be reasonable, and when to wait",
            lists: [
              {
                title: "It can be reasonable when",
                points: [
                  "The dates cannot move, such as a family event you must attend.",
                  "The EMI fits easily in your monthly budget alongside existing EMIs.",
                  "You can finish repaying in a short tenure.",
                ],
              },
              {
                title: "Better to wait when",
                points: [
                  "You already find current EMIs or card bills hard to pay.",
                  "The loan would use up the room you keep for emergencies.",
                  "Only the longest tenure makes the EMI fit.",
                ],
              },
            ],
          },
          {
            layout: "steps",
            title: "Keeping a travel loan small",
            items: [
              { title: "Price the trip first", body: "Total up tickets, stay and daily spending from actual quotes, so the amount is a number and not a guess." },
              { title: "Pay part from savings", body: "Borrow only the gap. If the gap is small, saving a little longer may be simpler than a loan." },
              { title: "Take the shortest tenure you can afford", body: "The EMI is higher, the interest is lower, and the loan is gone before the next holiday." },
              { title: "Compare before you accept", body: "Look at the rate, processing fee and total repayment in each lender's Key Fact Statement." },
            ],
          },
        ],
        exampleTitle: "Example: {amount} at {rate}% a year",
        exampleNote: "Short tenures keep the interest low. Check that the EMI still leaves room for your regular bills.",
        faqTitle: "Travel loan: common questions",
        faqs: [
          { q: "Is a travel loan different from a personal loan?", a: "No. It is a personal loan that you use for a trip. The lender decides the amount, rate and tenure based on your income and credit history." },
          { q: "Does checking offers commit me to a loan?", a: "No. It is a soft check with no effect on your credit score, and you pay SwiftLoan.ai nothing. You choose whether to go ahead with a lender." },
          { q: "What tenure should I choose for a travel loan?", a: "The shortest one whose EMI you can pay comfortably. A longer tenure lowers the EMI but raises the total interest." },
          { q: "Should I book before the loan is approved?", a: "It is safer not to rely on money you do not have yet. Approval and disbursal are decided by the lender, so avoid non-refundable bookings until the funds are in your account." },
          { q: "Are there charges besides interest?", a: "Lenders may charge a processing fee. It is shown, with the all-inclusive APR, in the Key Fact Statement before you accept. SwiftLoan.ai charges borrowers nothing." },
        ],
        ctaTitle: "Check what the trip would cost on EMI",
        ctaBody: "Compare matched personal loan offers. Soft credit check, about 3 minutes.",
        disclaimer: "Loans are given by the lender, not by SwiftLoan.ai. The lender sets the final amount, rate, fees and tenure.",
      },
      education: {
        breadcrumb: "Education",
        linkLabel: "Personal loan for education",
        h1: "Personal loan for education costs: what it is, and what it is not",
        intro:
          "This page is about using a personal loan to pay for education costs such as fees, books or a laptop. It is not a dedicated education loan: there is no pause on repayments while you study and no interest subsidy. It can still be useful when you have a regular income and want a collateral-free loan.",
        factsTitle: "The personal loan terms that apply",
        factsNote: "These are personal loan terms, not education loan terms. The lender sets your final amount, rate and tenure.",
        sections: [
          {
            layout: "twoLists",
            title: "Personal loan vs a dedicated education loan",
            lists: [
              {
                title: "A personal loan used for education",
                points: [
                  "EMIs start once the loan is disbursed. There is no moratorium during the course.",
                  "No security or guarantor is needed.",
                  "The lender assesses the borrower's income and credit history, not the course.",
                ],
              },
              {
                title: "A dedicated education loan",
                points: [
                  "Is built around a course, and repayment often begins after the study period.",
                  "May come with schemes or subsidies that a personal loan does not have.",
                  "Is not what SwiftLoan.ai matches. Ask a bank directly if you want those features.",
                ],
              },
            ],
          },
          {
            layout: "prose",
            title: "Who it suits",
            paragraphs: [
              "Because EMIs begin right away, the borrower needs a regular income now. It tends to suit a working professional paying for a part-time course or a certification, or a salaried or self-employed parent paying a child's costs.",
              "A full-time student with no income would usually not be the applicant.",
            ],
          },
          {
            layout: "cards",
            title: "Costs to price before you borrow",
            intro: "Borrow for costs you can name and put a number on.",
            items: [
              { title: "Course or coaching fees", body: "Ask the institute for the fee schedule. If fees are paid in stages, you may not need the whole amount at once." },
              { title: "Books, a laptop and equipment", body: "Get actual prices. These are one-time costs, so a short tenure usually fits." },
              { title: "Exam and application fees", body: "Often small enough to pay from savings without a loan." },
              { title: "Living costs while studying", body: "The hardest to estimate. Budget month by month and avoid borrowing for more than you can repay." },
            ],
          },
          {
            layout: "steps",
            title: "Planning the repayment",
            items: [
              { title: "Check the EMI against today's income", body: "Repayment cannot wait for a future salary, so the EMI must fit what you earn now." },
              { title: "Compare offers", body: "Rate, processing fee, tenure and total repayment all differ between lenders." },
              { title: "Read the Key Fact Statement", body: "It shows the all-inclusive APR and the foreclosure and prepayment terms before you accept." },
            ],
          },
        ],
        exampleTitle: "Example: {amount} at {rate}% a year",
        exampleNote: "The first EMI falls due soon after disbursal, whether or not the course has finished.",
        faqTitle: "Personal loan for education: common questions",
        faqs: [
          { q: "Is this an education loan?", a: "No. It is a personal loan used for education costs. There is no moratorium during the course and no interest subsidy; EMIs start after the loan is disbursed." },
          { q: "Can a student apply?", a: "Lenders look for a regular income, and each sets its own age, income and credit criteria. For a student without an income, it is usually a working parent or guardian who borrows." },
          { q: "Should I look at a dedicated education loan first?", a: "If you need a large amount for a long course and have no income yet, a dedicated education loan from a bank is worth asking about first, since it is built for that. A personal loan fits smaller, nearer costs that you can start repaying now." },
          { q: "What documents are needed?", a: "For most personal loans: PAN, Aadhaar-based eKYC or DigiLocker, and recent bank statements or salary slips. No documents are needed to see your initial matched offers." },
          { q: "Does SwiftLoan.ai give the loan?", a: "No. SwiftLoan.ai is a Lending Service Provider: we match you with RBI-registered lending partners, and the loan is given by the lender." },
        ],
        ctaTitle: "See personal loan offers for your education costs",
        ctaBody: "Soft credit check, so your credit score is not affected. About 3 minutes.",
        disclaimer: "This is a personal loan, not an education loan. Loan amount, rate, fees and tenure are set by the lender based on your profile.",
      },
      debt: {
        breadcrumb: "Debt consolidation",
        linkLabel: "Personal loan for debt consolidation",
        h1: "Personal loan for debt consolidation: one EMI in place of many",
        intro:
          "Debt consolidation means taking one personal loan and using it to close several existing debts, such as credit card dues or smaller loans. You are left with one EMI, one due date and one rate. It saves money only if the new loan costs less in total than what it replaces, so the numbers matter more than the convenience.",
        factsTitle: "The loan you would consolidate into",
        factsNote: "A consolidation loan on SwiftLoan.ai is a personal loan. Whether its rate beats your current debts depends on the offer the lender makes you.",
        sections: [
          {
            layout: "steps",
            title: "Do the sums before you apply",
            items: [
              { title: "List every debt", body: "For each one, note the amount outstanding, the interest rate, the monthly payment and the months left." },
              { title: "Add up the cost of changing nothing", body: "Total the payments still to come on all of them. This is the figure to beat." },
              { title: "Ask about closing charges", body: "Your current lenders may charge a foreclosure or prepayment fee. Find out before you decide." },
              { title: "Compare with the new loan", body: "Take the new loan's total repayment and add its processing fee and the closing charges. If the result is not clearly lower, consolidation is not saving you money." },
            ],
          },
          {
            layout: "twoLists",
            title: "When it helps, and when it does not",
            lists: [
              {
                title: "It helps when",
                points: [
                  "The new rate is lower than the rates on the debts you are closing.",
                  "The tenure stays similar, so the interest is not simply spread over more years.",
                  "Several due dates are causing missed payments, and one EMI fixes that.",
                ],
              },
              {
                title: "It does not help when",
                points: [
                  "The new rate is the same or higher.",
                  "A much longer tenure lowers the EMI but raises the total you repay.",
                  "Fees on the new loan and closing charges on the old ones cancel the saving.",
                  "You keep spending on the cleared credit cards and end up with the loan plus new card dues.",
                ],
              },
            ],
          },
          {
            layout: "prose",
            title: "What a lower EMI can hide",
            paragraphs: [
              "A consolidation loan can show a smaller monthly EMI simply because it runs for longer. That breathing room may be exactly what you need, but look at the total repayment as well as the EMI. The table below shows how much the rate alone changes the cost of the same loan.",
            ],
          },
          {
            layout: "checklist",
            title: "After you consolidate",
            items: [
              "Close the old debts straight away and get written confirmation from each lender.",
              "Do not treat the cleared card limits as spare money.",
              "Pay the single EMI on time every month. A good repayment history usually means a better rate later.",
            ],
          },
        ],
        exampleTitle: "Example: {amount} over {months} months, at four different rates",
        exampleNote: "Same amount, same tenure: only the rate changes. This is why the rate you are offered decides whether consolidation is worth it.",
        faqTitle: "Debt consolidation: common questions",
        faqs: [
          { q: "What is a debt consolidation loan?", a: "It is a personal loan used to pay off several existing debts, leaving one loan to repay. On SwiftLoan.ai it is a personal loan, not a separate product." },
          { q: "Does consolidating always save money?", a: "No. It saves money only when the total repayment on the new loan, including fees, is lower than what you would have paid on the old debts." },
          { q: "Will the lender pay off my old debts directly?", a: "That depends on the lender, so ask before you accept. If the money is credited to your bank account, close the old debts yourself straight away." },
          { q: "Will checking offers hurt my credit score?", a: "No. It is a soft check. A hard enquiry happens only later, with your consent, when you apply to a lender." },
          { q: "Can I consolidate with a low credit score?", a: "You can still check, since it is a soft check and each lender sets its own criteria. If the rate you are offered is not lower than your current debts, consolidating will not save you money." },
        ],
        ctaTitle: "See the rate you could consolidate at",
        ctaBody: "Compare matched offers side by side: rate, EMI, fees and tenure. Soft credit check.",
        disclaimer: "SwiftLoan.ai matches you with lenders and does not lend. The lender sets the rate, fees, amount and tenure, and these decide whether consolidation saves you money.",
      },
    },
  },
  hi: {
    home: "होम",
    personalLoan: "पर्सनल लोन",
    emiLink: "पहले अपनी EMI निकालें",
    ctaButton: "मेरे ऑफर्स देखें",
    cols: { tenure: "अवधि", rate: "ब्याज दर", emi: "मासिक EMI", interest: "कुल ब्याज", total: "कुल भुगतान" },
    months: "महीने",
    illustration: "इस टेबल की दर सिर्फ़ हिसाब समझाने का उदाहरण है। यह कोई ऑफर नहीं है; आपकी दर लेंडर तय करता है।",
    relatedTitle: "आगे पढ़ें",
    relatedPersonal: "पर्सनल लोन: जानकारी, डॉक्युमेंट्स और यह कैसे काम करता है",
    relatedEmi: "EMI कैलकुलेटर",
    pages: {
      wedding: {
        breadcrumb: "शादी",
        linkLabel: "शादी के लिए पर्सनल लोन",
        h1: "शादी के खर्च के लिए पर्सनल लोन: बुकिंग से पहले EMI तय करें",
        intro:
          "वेडिंग लोन असल में एक पर्सनल लोन ही है, जिसे आप शादी के खर्च के लिए इस्तेमाल करते हैं। इसके लिए कोई सिक्योरिटी नहीं चाहिए, और SwiftLoan.ai पर आप सॉफ्ट क्रेडिट चेक से अपनी पात्रता जाँचकर RBI-रजिस्टर्ड लेंडिंग पार्टनर्स के मैच किए गए ऑफर्स कम्पेयर कर सकते हैं। रकम मेहमानों की लिस्ट से नहीं, उस EMI से तय करें जो आप चुका सकते हैं।",
        factsTitle: "वह पर्सनल लोन जो आप इस्तेमाल करेंगे",
        factsNote: "ये वही पर्सनल लोन की शर्तें हैं जो पूरे SwiftLoan.ai पर दिखती हैं। अलग से कोई वेडिंग लोन प्रोडक्ट नहीं है, और आपकी अंतिम शर्तें लेंडर तय करता है।",
        sections: [
          {
            layout: "steps",
            title: "शादी के लिए कितना लोन लें",
            items: [
              { title: "पहले देखें कि आपके पास क्या है", body: "पहले अपनी बचत और परिवार का योगदान जोड़ें। लोन सिर्फ़ बची हुई कमी के लिए हो।" },
              { title: "पक्के खर्चों की लिस्ट बनाएँ", body: "वे खर्च लिखें जिनका पक्का कोटेशन आपके पास है। शौक़ वाली चीज़ों को लोन से बाहर रखें।" },
              { title: "EMI से उल्टा हिसाब लगाएँ", body: "किराया, बिल और मौजूदा EMI के बाद जो मासिक EMI आराम से दे सकें वह चुनें, फिर देखें कि उससे कितनी रकम और अवधि बनती है।" },
              { title: "बफ़र छोटा रखें", body: "शादी का बजट अक्सर बढ़ जाता है। थोड़ा बफ़र ठीक है; प्लान से बहुत ज़्यादा उधार लेना ठीक नहीं।" },
            ],
          },
          {
            layout: "cards",
            title: "ऑफर्स में क्या कम्पेयर करें",
            items: [
              { title: "ब्याज दर", body: "कम दर का मतलब है कम EMI और पूरे लोन पर कम ब्याज।" },
              { title: "प्रोसेसिंग फ़ीस", body: "यह लेंडर लेता है और स्वीकार करने से पहले Key Fact Statement में दिखाई जाती है। एक जैसी दर वाले दो ऑफर्स की कुल लागत अलग हो सकती है।" },
              { title: "अवधि", body: "लंबी अवधि से EMI कम होती है, पर कुल ब्याज बढ़ जाता है।" },
              { title: "कुल भुगतान", body: "सारी EMI और फ़ीस मिलाकर ही लोन की असली क़ीमत बनती है। Key Fact Statement में सब कुछ शामिल APR दिखता है, जिससे ऑफर्स कम्पेयर करना आसान होता है।" },
            ],
          },
          {
            layout: "prose",
            title: "एक सावधानी",
            paragraphs: [
              "शादी कुछ दिन चलती है; EMI पूरी अवधि तक चलती है। समारोह के लिए उधार लेना ज़रूरत नहीं, एक चुनाव है, इसलिए सोचें कि अगर लोन न मिलता तो आप क्या कम करते।",
              "अगर EMI के बाद ज़रूरी खर्चों या इमरजेंसी के लिए पैसे कम पड़ें, तो छोटा आयोजन या कुछ और समय बचत करना ज़्यादा सुरक्षित है। शादी से पहले दोनों मिलकर चुकाने का प्लान तय करें, क्योंकि EMI आपके साझा बजट से जाएगी।",
            ],
          },
          {
            layout: "checklist",
            title: "आवेदन के लिए क्या चाहिए",
            items: ["PAN", "Aadhaar आधारित eKYC या DigiLocker", "हाल के बैंक स्टेटमेंट या सैलरी स्लिप"],
            note: "शुरुआती मैच किए गए ऑफर्स देखने के लिए कोई डॉक्युमेंट नहीं चाहिए।",
          },
        ],
        exampleTitle: "उदाहरण: {amount}, {rate}% सालाना दर पर",
        exampleNote: "एक ही लोन, चार अवधियाँ: अवधि बढ़ने पर EMI घटती है और कुल ब्याज बढ़ता है।",
        faqTitle: "वेडिंग लोन: आम सवाल",
        faqs: [
          { q: "क्या अलग से कोई वेडिंग लोन होता है?", a: "SwiftLoan.ai पर नहीं। यह पर्सनल लोन है जिसे आप शादी के खर्च के लिए इस्तेमाल करते हैं। रकम, दर और अवधि पर्सनल लोन की ही होती हैं और लेंडर तय करता है।" },
          { q: "क्या सिक्योरिटी या गारंटर चाहिए?", a: "नहीं। पर्सनल लोन के लिए कोई सिक्योरिटी या गारंटर नहीं चाहिए। लेंडर आपकी आय और क्रेडिट हिस्ट्री के आधार पर फ़ैसला करता है।" },
          { q: "क्या वेडिंग लोन के ऑफर्स देखने से मेरा क्रेडिट स्कोर प्रभावित होगा?", a: "नहीं। यह सॉफ्ट चेक है। हार्ड इन्क्वायरी बाद में, आपकी सहमति से, सिर्फ़ तब होती है जब आप किसी लेंडर के पास आवेदन करते हैं।" },
          { q: "आवेदन कब करना चाहिए?", a: "जब खर्च इतने पक्के हो जाएँ कि रकम पता हो। लोन मिलते ही ब्याज शुरू हो जाता है, इसलिए महीनों पहले लेने का मतलब है उस पैसे पर ब्याज देना जो अभी इस्तेमाल नहीं हो रहा। मंज़ूरी और पैसा लेंडर देता है।" },
          { q: "क्या मैं लोन समय से पहले चुका सकता हूँ?", a: "यह लेंडर पर निर्भर है। फ़ोरक्लोज़र और पार्ट-प्रीपेमेंट की शर्तें Key Fact Statement में लिखी होती हैं, इसलिए अगर आप जल्दी चुकाने की सोच रहे हैं तो स्वीकार करने से पहले उन्हें पढ़ लें।" },
        ],
        ctaTitle: "देखें आपकी शादी के लिए पर्सनल लोन कितने का पड़ेगा",
        ctaBody: "सॉफ्ट क्रेडिट चेक, 100% पेपरलेस, करीब 3 मिनट।",
        disclaimer: "SwiftLoan.ai एक Lending Service Provider है, लेंडर नहीं। लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपकी प्रोफ़ाइल के आधार पर तय करता है।",
      },
      medical: {
        breadcrumb: "मेडिकल इमरजेंसी",
        linkLabel: "मेडिकल इमरजेंसी के लिए पर्सनल लोन",
        h1: "मेडिकल इमरजेंसी के लिए पर्सनल लोन: समय कम हो तो क्या जाँचें",
        intro:
          "जब अस्पताल का बिल रुक नहीं सकता, तो पर्सनल लोन उसे चुकाने का एक तरीका है: इसके लिए कोई सिक्योरिटी नहीं चाहिए और प्रक्रिया पेपरलेस है। SwiftLoan.ai सॉफ्ट क्रेडिट चेक के बाद आपको RBI-रजिस्टर्ड लेंडिंग पार्टनर्स से मिलाता है, इसलिए आप क्रेडिट स्कोर पर असर डाले बिना ऑफर्स देख सकते हैं। मंज़ूरी और पैसा लेंडर देता है।",
        factsTitle: "पर्सनल लोन की शर्तें एक नज़र में",
        factsNote: "इलाज के खर्च का लोन पर्सनल लोन ही है। आपको असल में कितनी रकम, दर और अवधि मिलेगी, यह लेंडर तय करता है।",
        sections: [
          {
            layout: "checklist",
            title: "उधार लेने से पहले ये जाँच लें",
            intro: "लोन पर ब्याज लगता है। इन पर कुछ मिनट लगाने से आपकी ज़रूरत की रकम कम हो सकती है।",
            items: [
              "हेल्थ इंश्योरेंस: अस्पताल के इंश्योरेंस डेस्क या अपनी इंश्योरेंस कंपनी से पूछें कि आपकी पॉलिसी में क्या कवर है और क्लेम कैसे होता है।",
              "कंपनी का कवर: अगर आप सैलरीड हैं, तो देखें कि आपकी कंपनी मेडिकल कवर देती है या नहीं।",
              "इमरजेंसी की बचत: जो पैसा इसी काम के लिए रखा था उसे इस्तेमाल करें, और सिर्फ़ बाकी रकम उधार लें।",
              "लिखित एस्टीमेट: अस्पताल से माँगें, ताकि आप एक तय रकम ही उधार लें।",
            ],
            note: "अगर इंश्योरेंस बाद में पैसा लौटाएगा, तो उसी पैसे से लोन चुकाने का प्लान बनाएँ, और पहले Key Fact Statement में प्रीपेमेंट की शर्तें देख लें।",
          },
          {
            layout: "prose",
            title: "यह कितनी जल्दी हो सकता है, और फ़ैसला कौन करता है",
            paragraphs: [
              "SwiftLoan.ai पर आवेदन में करीब 3 मिनट लगते हैं, और पूरा होते ही मैच किए गए ऑफर्स दिख जाते हैं। पेपरलेस eKYC के साथ मंज़ूरी मिनटों में हो सकती है, और मंज़ूर रकम आम तौर पर उसी या अगले कामकाजी दिन आपके बैंक खाते में आ जाती है, यह लेंडर पर निर्भर है।",
              "समय का वादा कोई नहीं कर सकता, क्योंकि लेंडर आपकी जानकारी जाँचकर फ़ैसला करता है। आपके हाथ में बस तैयार रहना है।",
            ],
          },
          {
            layout: "cards",
            title: "देरी से बचने के लिए ये तैयार रखें",
            items: [
              { title: "PAN", body: "नंबर या कार्ड पास रखें।" },
              { title: "Aadhaar आधारित eKYC या DigiLocker", body: "इसी से आपकी पहचान बिना काग़ज़ के वेरिफ़ाई होती है।" },
              { title: "बैंक स्टेटमेंट या सैलरी स्लिप", body: "हाल के, ताकि लेंडर आपकी आय देख सके।" },
              { title: "आपका बैंक खाता", body: "मंज़ूर रकम सीधे आपके बैंक खाते में आती है।" },
            ],
          },
          {
            layout: "prose",
            title: "बिल जितना ही उधार लें, उससे ज़्यादा नहीं",
            paragraphs: [
              "इमरजेंसी में पहला ऑफर मान लेने या रकम बढ़ाकर लेने का मन होता है। जो ऑफर्स दिखें उनकी दर, प्रोसेसिंग फ़ीस और कुल भुगतान कम्पेयर करने में दो मिनट लगाएँ, और ऐसी अवधि चुनें जिसकी EMI आप इलाज के दौरान भी चुकाते रह सकें।",
              "अगर कोई ऑफर ठीक न लगे, तो उसे लेना ज़रूरी नहीं। जाँचने का कोई खर्च नहीं है, और सॉफ्ट चेक से आपका क्रेडिट स्कोर नहीं बदलता।",
            ],
          },
        ],
        exampleTitle: "उदाहरण: {amount}, {rate}% सालाना दर पर",
        exampleNote: "छोटी अवधि में लोन जल्दी ख़त्म होता है और ब्याज कम लगता है। वह सबसे छोटी अवधि चुनें जिसकी EMI आप निभा सकें।",
        faqTitle: "मेडिकल इमरजेंसी लोन: आम सवाल",
        faqs: [
          { q: "मेडिकल इमरजेंसी के लिए पैसा कितनी जल्दी मिल सकता है?", a: "आवेदन में करीब 3 मिनट लगते हैं। पेपरलेस eKYC के साथ मंज़ूरी मिनटों में हो सकती है और मंज़ूर रकम आम तौर पर उसी या अगले कामकाजी दिन आ जाती है, यह लेंडर पर निर्भर है। फ़ैसला लेंडर करता है, इसलिए समय का वादा नहीं किया जा सकता।" },
          { q: "इंश्योरेंस इस्तेमाल करूँ या लोन?", a: "पहले इंश्योरेंस देखें, क्योंकि उसे लौटाना नहीं पड़ता। लोन उस हिस्से के लिए है जो इंश्योरेंस और बचत से पूरा नहीं होता।" },
          { q: "क्या मैं परिवार के किसी सदस्य के इलाज के लिए आवेदन कर सकता हूँ?", a: "लोन का आकलन उसी का होता है और वही चुकाता है जो आवेदन करता है। अगर आप परिवार के सदस्य के इलाज के लिए आवेदन करते हैं, तो लेंडर आपकी आय और क्रेडिट हिस्ट्री देखता है, और EMI आपकी होती है।" },
          { q: "क्या SwiftLoan.ai कोई चार्ज लेता है?", a: "नहीं। उधार लेने वालों से हम कुछ नहीं लेते। लेंडर के चार्ज, जैसे प्रोसेसिंग फ़ीस, स्वीकार करने से पहले हर लेंडर के Key Fact Statement में दिखाए जाते हैं।" },
          { q: "अगर मेरा क्रेडिट स्कोर कम है तो?", a: "आप फिर भी जाँच सकते हैं। यह सॉफ्ट चेक है, इसलिए विकल्प देखने से आपके क्रेडिट स्कोर पर असर नहीं पड़ता। हर लेंडर अपने मापदंड तय करता है।" },
        ],
        ctaTitle: "देखें आज आपको कौन से ऑफर्स मिल सकते हैं",
        ctaBody: "सॉफ्ट क्रेडिट चेक, पेपरलेस, करीब 3 मिनट। जाँचने का कोई चार्ज नहीं।",
        disclaimer: "SwiftLoan.ai लेंडर नहीं है। मंज़ूरी, लोन अमाउंट, दर, फ़ीस और पैसा आने का समय लेंडर तय करता है।",
      },
      travel: {
        breadcrumb: "यात्रा",
        linkLabel: "यात्रा के लिए पर्सनल लोन",
        h1: "यात्रा के लिए पर्सनल लोन: ट्रिप बुक करने से पहले EMI तय करें",
        intro:
          "ट्रैवल लोन एक पर्सनल लोन है जिससे ट्रिप का खर्च चुकाया जाता है। इसके लिए कोई सिक्योरिटी नहीं चाहिए, और सॉफ्ट क्रेडिट चेक के बाद आप SwiftLoan.ai पर मैच किए गए ऑफर्स कम्पेयर कर सकते हैं। छुट्टी ज़रूरत नहीं, एक चाहत है, इसलिए यह पेज जितना उधार लेने के तरीके के बारे में है, उतना ही इस बारे में भी कि कब उधार न लें।",
        factsTitle: "पर्सनल लोन में क्या मिलता है",
        factsNote: "अलग से कोई ट्रैवल लोन नहीं है। ये पर्सनल लोन की शर्तें हैं, और आपको कौन सी मिलेंगी यह लेंडर तय करता है।",
        sections: [
          {
            layout: "prose",
            title: "पहला सवाल: क्या यह ट्रिप उधार पर होनी चाहिए?",
            paragraphs: [
              "ट्रिप कुछ दिनों या हफ़्तों में ख़त्म हो जाती है; EMI घर लौटने के बाद भी चलती रहती है। ब्याज की वजह से ट्रिप अपनी क़ीमत से महँगी पड़ती है। अगर आप कुछ महीने और बचत करके पूरा पैसा दे सकते हैं, तो कोई ब्याज नहीं लगेगा।",
            ],
          },
          {
            layout: "twoLists",
            title: "कब उधार लेना ठीक हो सकता है, और कब रुकना बेहतर है",
            lists: [
              {
                title: "यह ठीक हो सकता है जब",
                points: [
                  "तारीख़ें बदल नहीं सकतीं, जैसे कोई पारिवारिक कार्यक्रम जिसमें जाना ज़रूरी है।",
                  "मौजूदा EMI के साथ भी यह EMI आपके मासिक बजट में आराम से आ जाती है।",
                  "आप छोटी अवधि में लोन चुका सकते हैं।",
                ],
              },
              {
                title: "रुकना बेहतर है जब",
                points: [
                  "मौजूदा EMI या कार्ड के बिल चुकाना पहले से मुश्किल हो रहा है।",
                  "लोन वह गुंजाइश खा जाएगा जो आप इमरजेंसी के लिए रखते हैं।",
                  "EMI सिर्फ़ सबसे लंबी अवधि पर ही बजट में आती है।",
                ],
              },
            ],
          },
          {
            layout: "steps",
            title: "ट्रैवल लोन छोटा कैसे रखें",
            items: [
              { title: "पहले ट्रिप का खर्च निकालें", body: "टिकट, ठहरने और रोज़ के खर्च को असली कोटेशन से जोड़ें, ताकि रकम अंदाज़ा नहीं, एक पक्का आँकड़ा हो।" },
              { title: "कुछ हिस्सा बचत से दें", body: "सिर्फ़ कमी जितना उधार लें। अगर कमी छोटी है, तो थोड़ा और बचत करना लोन से आसान हो सकता है।" },
              { title: "जितनी छोटी अवधि निभा सकें, उतनी लें", body: "EMI ज़्यादा होगी, ब्याज कम लगेगा, और अगली छुट्टी से पहले लोन ख़त्म हो जाएगा।" },
              { title: "स्वीकार करने से पहले कम्पेयर करें", body: "हर लेंडर के Key Fact Statement में दर, प्रोसेसिंग फ़ीस और कुल भुगतान देखें।" },
            ],
          },
        ],
        exampleTitle: "उदाहरण: {amount}, {rate}% सालाना दर पर",
        exampleNote: "छोटी अवधि में ब्याज कम रहता है। देख लें कि EMI के बाद आपके नियमित बिलों के लिए गुंजाइश बचती है।",
        faqTitle: "ट्रैवल लोन: आम सवाल",
        faqs: [
          { q: "क्या ट्रैवल लोन पर्सनल लोन से अलग है?", a: "नहीं। यह पर्सनल लोन है जिसे आप ट्रिप के लिए इस्तेमाल करते हैं। रकम, दर और अवधि लेंडर आपकी आय और क्रेडिट हिस्ट्री के आधार पर तय करता है।" },
          { q: "क्या ऑफर्स देखने से मुझे लोन लेना ही पड़ेगा?", a: "नहीं। यह सॉफ्ट चेक है जिसका आपके क्रेडिट स्कोर पर कोई असर नहीं पड़ता, और आप SwiftLoan.ai को कुछ नहीं देते। किसी लेंडर के साथ आगे बढ़ना है या नहीं, यह आप तय करते हैं।" },
          { q: "ट्रैवल लोन के लिए कौन सी अवधि चुनूँ?", a: "वह सबसे छोटी अवधि जिसकी EMI आप आराम से दे सकें। लंबी अवधि से EMI कम होती है, पर कुल ब्याज बढ़ जाता है।" },
          { q: "क्या लोन मंज़ूर होने से पहले बुकिंग कर लूँ?", a: "जो पैसा अभी आपके पास नहीं है उस पर भरोसा न करना ही सुरक्षित है। मंज़ूरी और पैसा देना लेंडर तय करता है, इसलिए जब तक रकम आपके खाते में न आ जाए, नॉन-रिफ़ंडेबल बुकिंग से बचें।" },
          { q: "क्या ब्याज के अलावा भी चार्ज हैं?", a: "लेंडर प्रोसेसिंग फ़ीस ले सकते हैं। यह, सब कुछ शामिल APR के साथ, स्वीकार करने से पहले Key Fact Statement में दिखाई जाती है। SwiftLoan.ai उधार लेने वालों से कुछ नहीं लेता।" },
        ],
        ctaTitle: "देखें EMI पर यह ट्रिप कितने की पड़ेगी",
        ctaBody: "मैच किए गए पर्सनल लोन ऑफर्स कम्पेयर करें। सॉफ्ट क्रेडिट चेक, करीब 3 मिनट।",
        disclaimer: "लोन लेंडर देता है, SwiftLoan.ai नहीं। अंतिम अमाउंट, दर, फ़ीस और अवधि लेंडर तय करता है।",
      },
      education: {
        breadcrumb: "पढ़ाई",
        linkLabel: "पढ़ाई के लिए पर्सनल लोन",
        h1: "पढ़ाई के खर्च के लिए पर्सनल लोन: यह क्या है, और क्या नहीं है",
        intro:
          "यह पेज फ़ीस, किताबों या लैपटॉप जैसे पढ़ाई के खर्च के लिए पर्सनल लोन इस्तेमाल करने के बारे में है। यह एजुकेशन लोन नहीं है: पढ़ाई के दौरान EMI रुकती नहीं और ब्याज पर कोई सब्सिडी नहीं मिलती। फिर भी, अगर आपकी नियमित आय है और आपको बिना सिक्योरिटी का लोन चाहिए, तो यह काम आ सकता है।",
        factsTitle: "पर्सनल लोन की शर्तें जो यहाँ लागू होती हैं",
        factsNote: "ये पर्सनल लोन की शर्तें हैं, एजुकेशन लोन की नहीं। आपकी अंतिम रकम, दर और अवधि लेंडर तय करता है।",
        sections: [
          {
            layout: "twoLists",
            title: "पर्सनल लोन और एजुकेशन लोन में फ़र्क़",
            lists: [
              {
                title: "पढ़ाई के लिए लिया गया पर्सनल लोन",
                points: [
                  "लोन मिलते ही EMI शुरू हो जाती है। कोर्स के दौरान कोई मोरेटोरियम नहीं होता।",
                  "कोई सिक्योरिटी या गारंटर नहीं चाहिए।",
                  "लेंडर कोर्स नहीं, उधार लेने वाले की आय और क्रेडिट हिस्ट्री देखता है।",
                ],
              },
              {
                title: "एजुकेशन लोन",
                points: [
                  "कोर्स के हिसाब से बना होता है, और चुकाना अक्सर पढ़ाई पूरी होने के बाद शुरू होता है।",
                  "इसमें ऐसी स्कीम या सब्सिडी हो सकती हैं जो पर्सनल लोन में नहीं होतीं।",
                  "SwiftLoan.ai इसे मैच नहीं करता। ये सुविधाएँ चाहिए तो सीधे बैंक से पूछें।",
                ],
              },
            ],
          },
          {
            layout: "prose",
            title: "यह किसके लिए ठीक है",
            paragraphs: [
              "EMI तुरंत शुरू होती है, इसलिए उधार लेने वाले की अभी नियमित आय होनी चाहिए। यह आम तौर पर उन नौकरीपेशा लोगों के लिए ठीक रहता है जो पार्ट-टाइम कोर्स या सर्टिफ़िकेशन कर रहे हैं, या उन सैलरीड या सेल्फ-एम्प्लॉयड माता-पिता के लिए जो बच्चे का खर्च दे रहे हैं।",
              "बिना आय वाला फ़ुल-टाइम स्टूडेंट आम तौर पर ख़ुद आवेदक नहीं होता।",
            ],
          },
          {
            layout: "cards",
            title: "उधार लेने से पहले इन खर्चों का हिसाब लगाएँ",
            intro: "उन्हीं खर्चों के लिए उधार लें जिनका नाम और रकम आप बता सकें।",
            items: [
              { title: "कोर्स या कोचिंग की फ़ीस", body: "संस्थान से फ़ीस का शेड्यूल माँगें। अगर फ़ीस किस्तों में जाती है, तो पूरी रकम एक साथ लेने की ज़रूरत शायद न हो।" },
              { title: "किताबें, लैपटॉप और सामान", body: "असली दाम पता करें। ये एक बार के खर्च हैं, इसलिए आम तौर पर छोटी अवधि ठीक रहती है।" },
              { title: "परीक्षा और आवेदन की फ़ीस", body: "ये अक्सर इतनी छोटी होती हैं कि बिना लोन के बचत से दी जा सकती हैं।" },
              { title: "पढ़ाई के दौरान रहने का खर्च", body: "इसका अंदाज़ा लगाना सबसे मुश्किल है। महीने-दर-महीने बजट बनाएँ और जितना चुका सकें उससे ज़्यादा उधार न लें।" },
            ],
          },
          {
            layout: "steps",
            title: "चुकाने का प्लान",
            items: [
              { title: "EMI को आज की आय से मिलाएँ", body: "चुकाना आगे मिलने वाली सैलरी का इंतज़ार नहीं कर सकता, इसलिए EMI आपकी अभी की कमाई में आनी चाहिए।" },
              { title: "ऑफर्स कम्पेयर करें", body: "दर, प्रोसेसिंग फ़ीस, अवधि और कुल भुगतान हर लेंडर में अलग होते हैं।" },
              { title: "Key Fact Statement पढ़ें", body: "इसमें स्वीकार करने से पहले सब कुछ शामिल APR और फ़ोरक्लोज़र व प्रीपेमेंट की शर्तें दिखती हैं।" },
            ],
          },
        ],
        exampleTitle: "उदाहरण: {amount}, {rate}% सालाना दर पर",
        exampleNote: "पहली EMI लोन मिलने के कुछ ही समय बाद देनी होती है, कोर्स पूरा हुआ हो या नहीं।",
        faqTitle: "पढ़ाई के लिए पर्सनल लोन: आम सवाल",
        faqs: [
          { q: "क्या यह एजुकेशन लोन है?", a: "नहीं। यह पढ़ाई के खर्च के लिए इस्तेमाल किया गया पर्सनल लोन है। कोर्स के दौरान कोई मोरेटोरियम नहीं होता और ब्याज पर कोई सब्सिडी नहीं मिलती; लोन मिलने के बाद EMI शुरू हो जाती है।" },
          { q: "क्या स्टूडेंट आवेदन कर सकता है?", a: "लेंडर नियमित आय देखते हैं, और हर लेंडर उम्र, आय और क्रेडिट के अपने मापदंड तय करता है। बिना आय वाले स्टूडेंट के लिए आम तौर पर कमाने वाले माता-पिता या अभिभावक उधार लेते हैं।" },
          { q: "क्या पहले एजुकेशन लोन देखना चाहिए?", a: "अगर आपको लंबे कोर्स के लिए बड़ी रकम चाहिए और अभी आय नहीं है, तो पहले बैंक से एजुकेशन लोन के बारे में पूछना ठीक रहेगा, क्योंकि वह इसी के लिए बना है। पर्सनल लोन उन छोटे, नज़दीकी खर्चों के लिए ठीक है जिन्हें आप अभी से चुकाना शुरू कर सकते हैं।" },
          { q: "कौन से डॉक्युमेंट्स चाहिए?", a: "ज़्यादातर पर्सनल लोन के लिए: PAN, Aadhaar आधारित eKYC या DigiLocker, और हाल के बैंक स्टेटमेंट या सैलरी स्लिप। शुरुआती मैच किए गए ऑफर्स देखने के लिए कोई डॉक्युमेंट नहीं चाहिए।" },
          { q: "क्या SwiftLoan.ai लोन देता है?", a: "नहीं। SwiftLoan.ai एक Lending Service Provider है: हम आपको RBI-रजिस्टर्ड लेंडिंग पार्टनर्स से मिलाते हैं, और लोन लेंडर देता है।" },
        ],
        ctaTitle: "पढ़ाई के खर्च के लिए पर्सनल लोन ऑफर्स देखें",
        ctaBody: "सॉफ्ट क्रेडिट चेक, इसलिए क्रेडिट स्कोर पर असर नहीं। करीब 3 मिनट।",
        disclaimer: "यह पर्सनल लोन है, एजुकेशन लोन नहीं। लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपकी प्रोफ़ाइल के आधार पर तय करता है।",
      },
      debt: {
        breadcrumb: "कर्ज़ एक जगह करना",
        linkLabel: "कर्ज़ एक जगह करने के लिए पर्सनल लोन",
        h1: "डेट कंसोलिडेशन के लिए पर्सनल लोन: कई EMI की जगह एक EMI",
        intro:
          "डेट कंसोलिडेशन का मतलब है एक पर्सनल लोन लेकर उससे कई मौजूदा कर्ज़ बंद करना, जैसे क्रेडिट कार्ड का बकाया या छोटे लोन। फिर आपके पास एक EMI, एक तारीख़ और एक दर रह जाती है। पैसा तभी बचता है जब नया लोन कुल मिलाकर उन कर्ज़ों से सस्ता पड़े जिन्हें वह बदल रहा है, इसलिए सुविधा से ज़्यादा हिसाब मायने रखता है।",
        factsTitle: "वह लोन जिसमें आप कर्ज़ एक जगह करेंगे",
        factsNote: "SwiftLoan.ai पर कंसोलिडेशन लोन एक पर्सनल लोन ही है। उसकी दर आपके मौजूदा कर्ज़ों से कम होगी या नहीं, यह उस ऑफर पर निर्भर है जो लेंडर आपको देता है।",
        sections: [
          {
            layout: "steps",
            title: "आवेदन से पहले हिसाब लगाएँ",
            items: [
              { title: "हर कर्ज़ की लिस्ट बनाएँ", body: "हर एक के लिए बकाया रकम, ब्याज दर, मासिक भुगतान और बचे हुए महीने लिखें।" },
              { title: "कुछ न बदलने की लागत जोड़ें", body: "सब पर आगे जो भुगतान बाकी हैं उन्हें जोड़ें। नए लोन को इसी आँकड़े से कम पड़ना चाहिए।" },
              { title: "बंद करने के चार्ज पूछें", body: "आपके मौजूदा लेंडर फ़ोरक्लोज़र या प्रीपेमेंट फ़ीस ले सकते हैं। फ़ैसले से पहले पता कर लें।" },
              { title: "नए लोन से कम्पेयर करें", body: "नए लोन के कुल भुगतान में उसकी प्रोसेसिंग फ़ीस और बंद करने के चार्ज जोड़ें। अगर नतीजा साफ़ तौर पर कम नहीं है, तो कंसोलिडेशन से पैसा नहीं बच रहा।" },
            ],
          },
          {
            layout: "twoLists",
            title: "कब फ़ायदा होता है, और कब नहीं",
            lists: [
              {
                title: "फ़ायदा होता है जब",
                points: [
                  "नई दर उन कर्ज़ों की दरों से कम है जिन्हें आप बंद कर रहे हैं।",
                  "अवधि लगभग उतनी ही रहती है, ताकि ब्याज बस ज़्यादा सालों में न फैल जाए।",
                  "कई तारीख़ों की वजह से भुगतान छूट रहे हैं, और एक EMI से यह ठीक हो जाता है।",
                ],
              },
              {
                title: "फ़ायदा नहीं होता जब",
                points: [
                  "नई दर उतनी ही या उससे ज़्यादा है।",
                  "बहुत लंबी अवधि से EMI तो घटती है, पर कुल भुगतान बढ़ जाता है।",
                  "नए लोन की फ़ीस और पुराने कर्ज़ बंद करने के चार्ज बचत को ख़त्म कर देते हैं।",
                  "आप ख़ाली हुए क्रेडिट कार्ड फिर इस्तेमाल करते रहते हैं और लोन के साथ कार्ड का नया बकाया भी हो जाता है।",
                ],
              },
            ],
          },
          {
            layout: "prose",
            title: "कम EMI के पीछे क्या छिपा हो सकता है",
            paragraphs: [
              "कंसोलिडेशन लोन की मासिक EMI सिर्फ़ इसलिए भी कम दिख सकती है कि वह ज़्यादा समय तक चलता है। यह राहत शायद वही हो जो आपको चाहिए, पर EMI के साथ कुल भुगतान भी देखें। नीचे की टेबल दिखाती है कि सिर्फ़ दर बदलने से उसी लोन की लागत कितनी बदल जाती है।",
            ],
          },
          {
            layout: "checklist",
            title: "कंसोलिडेशन के बाद",
            items: [
              "पुराने कर्ज़ तुरंत बंद करें और हर लेंडर से लिखित पुष्टि लें।",
              "कार्ड की ख़ाली हुई लिमिट को फ़ालतू पैसा न समझें।",
              "इकलौती EMI हर महीने समय पर दें। अच्छा भुगतान रिकॉर्ड आम तौर पर आगे बेहतर दर दिलाता है।",
            ],
          },
        ],
        exampleTitle: "उदाहरण: {amount}, {months} महीने, चार अलग-अलग दरों पर",
        exampleNote: "रकम वही, अवधि वही: सिर्फ़ दर बदलती है। इसीलिए आपको मिलने वाली दर ही तय करती है कि कंसोलिडेशन फ़ायदेमंद है या नहीं।",
        faqTitle: "डेट कंसोलिडेशन: आम सवाल",
        faqs: [
          { q: "डेट कंसोलिडेशन लोन क्या है?", a: "यह एक पर्सनल लोन है जिससे कई मौजूदा कर्ज़ चुकाए जाते हैं, और फिर सिर्फ़ एक लोन चुकाना रह जाता है। SwiftLoan.ai पर यह पर्सनल लोन है, कोई अलग प्रोडक्ट नहीं।" },
          { q: "क्या कंसोलिडेशन से हमेशा पैसा बचता है?", a: "नहीं। पैसा तभी बचता है जब नए लोन का कुल भुगतान, फ़ीस मिलाकर, उससे कम हो जो आप पुराने कर्ज़ों पर चुकाते।" },
          { q: "क्या लेंडर मेरे पुराने कर्ज़ सीधे चुका देगा?", a: "यह लेंडर पर निर्भर है, इसलिए स्वीकार करने से पहले पूछ लें। अगर पैसा आपके बैंक खाते में आता है, तो पुराने कर्ज़ तुरंत ख़ुद बंद करें।" },
          { q: "क्या ऑफर्स देखने से मेरा क्रेडिट स्कोर ख़राब होगा?", a: "नहीं। यह सॉफ्ट चेक है। हार्ड इन्क्वायरी बाद में, आपकी सहमति से, सिर्फ़ तब होती है जब आप किसी लेंडर के पास आवेदन करते हैं।" },
          { q: "क्या कम क्रेडिट स्कोर पर कंसोलिडेशन हो सकता है?", a: "आप फिर भी जाँच सकते हैं, क्योंकि यह सॉफ्ट चेक है और हर लेंडर अपने मापदंड तय करता है। अगर आपको मिलने वाली दर मौजूदा कर्ज़ों से कम नहीं है, तो कंसोलिडेशन से पैसा नहीं बचेगा।" },
        ],
        ctaTitle: "देखें आप किस दर पर कर्ज़ एक जगह कर सकते हैं",
        ctaBody: "मैच किए गए ऑफर्स साथ-साथ कम्पेयर करें: दर, EMI, फ़ीस और अवधि। सॉफ्ट क्रेडिट चेक।",
        disclaimer: "SwiftLoan.ai आपको लेंडर्स से मिलाता है, ख़ुद लोन नहीं देता। दर, फ़ीस, अमाउंट और अवधि लेंडर तय करता है, और इन्हीं से तय होता है कि कंसोलिडेशन से पैसा बचेगा या नहीं।",
      },
    },
  },
  te: {
    home: "హోమ్",
    personalLoan: "పర్సనల్ లోన్",
    emiLink: "ముందు మీ EMI లెక్కించుకోండి",
    ctaButton: "నా ఆఫర్స్ చూడండి",
    cols: { tenure: "కాలవ్యవధి", rate: "వడ్డీ రేటు", emi: "నెలవారీ EMI", interest: "మొత్తం వడ్డీ", total: "మొత్తం చెల్లింపు" },
    months: "నెలలు",
    illustration: "ఈ టేబుల్ లోని రేటు లెక్క అర్థం కావడానికి ఇచ్చిన ఉదాహరణ మాత్రమే. ఇది ఆఫర్ కాదు; మీ రేటు లెండర్ నిర్ణయిస్తారు.",
    relatedTitle: "ఇంకా చదవండి",
    relatedPersonal: "పర్సనల్ లోన్: వివరాలు, డాక్యుమెంట్స్, ఇది ఎలా పనిచేస్తుంది",
    relatedEmi: "EMI క్యాల్క్యులేటర్",
    pages: {
      wedding: {
        breadcrumb: "పెళ్లి",
        linkLabel: "పెళ్లి కోసం పర్సనల్ లోన్",
        h1: "పెళ్లి ఖర్చుల కోసం పర్సనల్ లోన్: బుకింగ్ కి ముందే EMI ప్లాన్ చేసుకోండి",
        intro:
          "వెడ్డింగ్ లోన్ అంటే పెళ్లి ఖర్చులకు వాడుకునే పర్సనల్ లోన్ మాత్రమే. దీనికి ఎలాంటి సెక్యూరిటీ అక్కర్లేదు, SwiftLoan.ai లో సాఫ్ట్ క్రెడిట్ చెక్ తో మీ అర్హత తెలుసుకుని RBI-రిజిస్టర్డ్ లెండింగ్ పార్టనర్స్ నుండి మ్యాచ్ అయిన ఆఫర్స్ కంపేర్ చేయవచ్చు. మొత్తాన్ని అతిథుల లిస్ట్ బట్టి కాదు, మీరు కట్టగలిగే EMI బట్టి నిర్ణయించుకోండి.",
        factsTitle: "మీరు వాడబోయే పర్సనల్ లోన్",
        factsNote: "ఇవి SwiftLoan.ai అంతటా చూపించే పర్సనల్ లోన్ నిబంధనలే. ప్రత్యేకంగా వెడ్డింగ్ లోన్ అనే ప్రోడక్ట్ లేదు, మీ తుది నిబంధనలు లెండర్ నిర్ణయిస్తారు.",
        sections: [
          {
            layout: "steps",
            title: "పెళ్లికి ఎంత లోన్ తీసుకోవాలి",
            items: [
              { title: "ముందు మీ దగ్గర ఉన్నది చూడండి", body: "ముందుగా పొదుపు, కుటుంబం ఇచ్చే మొత్తం కలపండి. లోన్ మిగిలిన లోటుకు మాత్రమే ఉండాలి." },
              { title: "ఖరారైన ఖర్చుల లిస్ట్ రాయండి", body: "పక్కా కొటేషన్ ఉన్న ఖర్చులు రాసుకోండి. ఇష్టంతో చేసే అదనపు ఖర్చులను లోన్ లో కలపకండి." },
              { title: "EMI నుండి వెనక్కి లెక్కించండి", body: "అద్దె, బిల్లులు, ఇప్పటికే ఉన్న EMI ల తర్వాత సులభంగా కట్టగలిగే నెలవారీ EMI ఎంచుకుని, దానికి ఎంత మొత్తం, ఎంత కాలవ్యవధి వస్తుందో చూడండి." },
              { title: "బఫర్ చిన్నదిగా ఉంచండి", body: "పెళ్లి బడ్జెట్ తరచుగా పెరుగుతుంది. కొద్దిపాటి బఫర్ మంచిదే; ప్లాన్ కంటే చాలా ఎక్కువ అప్పు తీసుకోవడం మంచిది కాదు." },
            ],
          },
          {
            layout: "cards",
            title: "ఆఫర్స్ లో ఏమి కంపేర్ చేయాలి",
            items: [
              { title: "వడ్డీ రేటు", body: "రేటు తక్కువైతే EMI తక్కువ, మొత్తం లోన్ పై వడ్డీ కూడా తక్కువ." },
              { title: "ప్రాసెసింగ్ ఫీజు", body: "ఇది లెండర్ తీసుకుంటారు, మీరు ఒప్పుకునే ముందు Key Fact Statement లో చూపిస్తారు. ఒకే రేటు ఉన్న రెండు ఆఫర్స్ ఖర్చు వేరుగా ఉండవచ్చు." },
              { title: "కాలవ్యవధి", body: "కాలవ్యవధి ఎక్కువైతే EMI తగ్గుతుంది, కానీ మొత్తం వడ్డీ పెరుగుతుంది." },
              { title: "మొత్తం చెల్లింపు", body: "అన్ని EMI లు, ఫీజులు కలిపితేనే లోన్ అసలు ధర. Key Fact Statement లో అన్నీ కలిపిన APR ఉంటుంది, దానితో ఆఫర్స్ కంపేర్ చేయడం సులభం." },
            ],
          },
          {
            layout: "prose",
            title: "ఒక జాగ్రత్త",
            paragraphs: [
              "పెళ్లి కొన్ని రోజులే; EMI మొత్తం కాలవ్యవధి అంతా ఉంటుంది. వేడుక కోసం అప్పు తీసుకోవడం అవసరం కాదు, ఒక ఎంపిక. కాబట్టి లోన్ దొరకకపోతే ఏ ఖర్చు తగ్గించేవారో ఆలోచించండి.",
              "EMI కట్టాక నిత్యావసరాలకు లేదా అత్యవసరానికి డబ్బు తక్కువైతే, చిన్న వేడుక లేదా ఇంకొంత కాలం పొదుపు చేయడం సురక్షితం. EMI లు మీ ఇద్దరి బడ్జెట్ నుండే పోతాయి కాబట్టి, పెళ్లికి ముందే ఇద్దరూ కలిసి తిరిగి చెల్లించే ప్లాన్ నిర్ణయించుకోండి.",
            ],
          },
          {
            layout: "checklist",
            title: "అప్లై చేయడానికి కావాల్సినవి",
            items: ["PAN", "Aadhaar ఆధారిత eKYC లేదా DigiLocker", "ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్"],
            note: "మొదట మ్యాచ్ అయిన ఆఫర్స్ చూడటానికి ఎలాంటి డాక్యుమెంట్స్ అక్కర్లేదు.",
          },
        ],
        exampleTitle: "ఉదాహరణ: {amount}, ఏడాదికి {rate}% రేటుతో",
        exampleNote: "ఒకే లోన్, నాలుగు కాలవ్యవధులు: కాలవ్యవధి పెరిగితే EMI తగ్గుతుంది, మొత్తం వడ్డీ పెరుగుతుంది.",
        faqTitle: "వెడ్డింగ్ లోన్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "ప్రత్యేకంగా వెడ్డింగ్ లోన్ ఉంటుందా?", a: "SwiftLoan.ai లో లేదు. ఇది పెళ్లి ఖర్చులకు వాడుకునే పర్సనల్ లోన్. మొత్తం, రేటు, కాలవ్యవధి పర్సనల్ లోన్ వే, వాటిని లెండర్ నిర్ణయిస్తారు." },
          { q: "సెక్యూరిటీ లేదా గ్యారంటర్ కావాలా?", a: "అక్కర్లేదు. పర్సనల్ లోన్ కి ఎలాంటి సెక్యూరిటీ లేదా గ్యారంటర్ అక్కర్లేదు. లెండర్ మీ ఆదాయం, క్రెడిట్ చరిత్ర ఆధారంగా నిర్ణయిస్తారు." },
          { q: "వెడ్డింగ్ లోన్ ఆఫర్స్ చూస్తే నా క్రెడిట్ స్కోర్ పై ప్రభావం ఉంటుందా?", a: "లేదు. ఇది సాఫ్ట్ చెక్. హార్డ్ ఎంక్వైరీ తర్వాత, మీ అనుమతితో, మీరు లెండర్ దగ్గర అప్లై చేసినప్పుడు మాత్రమే జరుగుతుంది." },
          { q: "ఎప్పుడు అప్లై చేయాలి?", a: "ఖర్చులు ఖరారై, ఎంత మొత్తం కావాలో తెలిసినప్పుడు. లోన్ చేతికి వచ్చిన వెంటనే వడ్డీ మొదలవుతుంది, కాబట్టి నెలల ముందే తీసుకుంటే ఇంకా వాడని డబ్బుపై వడ్డీ కట్టాల్సి వస్తుంది. ఆమోదం, డబ్బు లెండర్ ఇస్తారు." },
          { q: "లోన్ ముందుగానే తీర్చేయవచ్చా?", a: "అది లెండర్ పై ఆధారపడి ఉంటుంది. ఫోర్‌క్లోజర్, పార్ట్-ప్రీపేమెంట్ నిబంధనలు Key Fact Statement లో ఉంటాయి, కాబట్టి ముందుగా తీర్చాలనుకుంటే ఒప్పుకునే ముందు అవి చదవండి." },
        ],
        ctaTitle: "మీ పెళ్లికి పర్సనల్ లోన్ ఎంత పడుతుందో చూడండి",
        ctaBody: "సాఫ్ట్ క్రెడిట్ చెక్, 100% పేపర్‌లెస్, సుమారు 3 నిమిషాలు.",
        disclaimer: "SwiftLoan.ai ఒక Lending Service Provider, లెండర్ కాదు. లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
      },
      medical: {
        breadcrumb: "మెడికల్ ఎమర్జెన్సీ",
        linkLabel: "మెడికల్ ఎమర్జెన్సీ కోసం పర్సనల్ లోన్",
        h1: "మెడికల్ ఎమర్జెన్సీ కోసం పర్సనల్ లోన్: సమయం తక్కువగా ఉన్నప్పుడు ఏమి చూడాలి",
        intro:
          "హాస్పిటల్ బిల్లు ఆగలేనప్పుడు, దాన్ని కట్టడానికి పర్సనల్ లోన్ ఒక మార్గం: దీనికి ఎలాంటి సెక్యూరిటీ అక్కర్లేదు, ప్రక్రియ అంతా పేపర్‌లెస్. SwiftLoan.ai సాఫ్ట్ క్రెడిట్ చెక్ తర్వాత మిమ్మల్ని RBI-రిజిస్టర్డ్ లెండింగ్ పార్టనర్స్ తో కలుపుతుంది, కాబట్టి క్రెడిట్ స్కోర్ పై ప్రభావం లేకుండా ఆఫర్స్ చూడవచ్చు. ఆమోదం, డబ్బు లెండర్ ఇస్తారు.",
        factsTitle: "పర్సనల్ లోన్ నిబంధనలు ఒక్క చూపులో",
        factsNote: "వైద్య ఖర్చుల లోన్ కూడా పర్సనల్ లోనే. మీకు నిజంగా ఎంత మొత్తం, ఏ రేటు, ఎంత కాలవ్యవధి వస్తుందో లెండర్ నిర్ణయిస్తారు.",
        sections: [
          {
            layout: "checklist",
            title: "అప్పు తీసుకునే ముందు ఇవి చూడండి",
            intro: "లోన్ కి వడ్డీ కట్టాలి. వీటిపై కొన్ని నిమిషాలు వెచ్చిస్తే మీకు కావాల్సిన మొత్తం తగ్గవచ్చు.",
            items: [
              "హెల్త్ ఇన్సూరెన్స్: మీ పాలసీలో ఏమి కవర్ అవుతుందో, క్లెయిమ్ ఎలా జరుగుతుందో హాస్పిటల్ ఇన్సూరెన్స్ డెస్క్ ని లేదా మీ ఇన్సూరెన్స్ కంపెనీని అడగండి.",
              "కంపెనీ కవర్: మీరు సాలరీడ్ అయితే, మీ కంపెనీ మెడికల్ కవర్ ఇస్తుందేమో చూడండి.",
              "అత్యవసర పొదుపు: దీని కోసమే దాచిన డబ్బు వాడండి, మిగిలిన మొత్తానికి మాత్రమే అప్పు తీసుకోండి.",
              "రాతపూర్వక ఎస్టిమేట్: హాస్పిటల్ ని అడగండి, అప్పుడు ఖచ్చితమైన మొత్తమే తీసుకోవచ్చు.",
            ],
            note: "ఇన్సూరెన్స్ డబ్బు తర్వాత వస్తుందంటే, ఆ డబ్బుతో లోన్ తీర్చేలా ప్లాన్ చేసుకోండి, ముందుగా Key Fact Statement లో ప్రీపేమెంట్ నిబంధనలు చూడండి.",
          },
          {
            layout: "prose",
            title: "ఎంత త్వరగా అవుతుంది, ఎవరు నిర్ణయిస్తారు",
            paragraphs: [
              "SwiftLoan.ai లో అప్లికేషన్ కి సుమారు 3 నిమిషాలు పడుతుంది, అది పూర్తవగానే మ్యాచ్ అయిన ఆఫర్స్ కనిపిస్తాయి. పేపర్‌లెస్ eKYC తో ఆమోదం నిమిషాల్లో రావచ్చు, ఆమోదించిన డబ్బు సాధారణంగా అదే రోజు లేదా తర్వాతి పనిదినంలో మీ బ్యాంక్ ఖాతాలో జమ అవుతుంది, ఇది లెండర్ పై ఆధారపడి ఉంటుంది.",
              "సమయం గురించి ఎవరూ మాట ఇవ్వలేరు, ఎందుకంటే లెండర్ మీ వివరాలు పరిశీలించి నిర్ణయం తీసుకుంటారు. మీ చేతిలో ఉన్నది సిద్ధంగా ఉండటమే.",
            ],
          },
          {
            layout: "cards",
            title: "ఆలస్యం కాకుండా ఇవి సిద్ధంగా ఉంచుకోండి",
            items: [
              { title: "PAN", body: "నంబర్ లేదా కార్డ్ దగ్గర ఉంచుకోండి." },
              { title: "Aadhaar ఆధారిత eKYC లేదా DigiLocker", body: "కాగితాలు లేకుండా మీ గుర్తింపు దీని ద్వారానే వెరిఫై అవుతుంది." },
              { title: "బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్", body: "ఇటీవలివి, లెండర్ మీ ఆదాయం చూడటానికి." },
              { title: "మీ బ్యాంక్ ఖాతా", body: "ఆమోదించిన డబ్బు నేరుగా మీ బ్యాంక్ ఖాతాలో జమ అవుతుంది." },
            ],
          },
          {
            layout: "prose",
            title: "బిల్లుకు సరిపడా మాత్రమే తీసుకోండి",
            paragraphs: [
              "అత్యవసరంలో మొదటి ఆఫర్ నే ఒప్పుకోవాలని లేదా మొత్తం పెంచి తీసుకోవాలని అనిపిస్తుంది. మీకు చూపించిన ఆఫర్స్ రేటు, ప్రాసెసింగ్ ఫీజు, మొత్తం చెల్లింపు కంపేర్ చేయడానికి రెండు నిమిషాలు తీసుకోండి, కోలుకునే సమయంలో కూడా కట్టగలిగే EMI వచ్చే కాలవ్యవధి ఎంచుకోండి.",
              "ఏ ఆఫర్ నచ్చకపోతే తీసుకోవాల్సిన అవసరం లేదు. చెక్ చేయడానికి ఖర్చు లేదు, సాఫ్ట్ చెక్ వల్ల మీ క్రెడిట్ స్కోర్ మారదు.",
            ],
          },
        ],
        exampleTitle: "ఉదాహరణ: {amount}, ఏడాదికి {rate}% రేటుతో",
        exampleNote: "తక్కువ కాలవ్యవధిలో లోన్ త్వరగా తీరుతుంది, వడ్డీ తక్కువ పడుతుంది. మీరు కట్టగలిగే EMI వచ్చే అతి తక్కువ కాలవ్యవధి ఎంచుకోండి.",
        faqTitle: "మెడికల్ ఎమర్జెన్సీ లోన్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "మెడికల్ ఎమర్జెన్సీకి డబ్బు ఎంత త్వరగా వస్తుంది?", a: "అప్లికేషన్ కి సుమారు 3 నిమిషాలు పడుతుంది. పేపర్‌లెస్ eKYC తో ఆమోదం నిమిషాల్లో రావచ్చు, ఆమోదించిన డబ్బు సాధారణంగా అదే రోజు లేదా తర్వాతి పనిదినంలో జమ అవుతుంది, ఇది లెండర్ పై ఆధారపడి ఉంటుంది. నిర్ణయం లెండర్ దే కాబట్టి సమయం గురించి మాట ఇవ్వలేం." },
          { q: "ఇన్సూరెన్స్ వాడాలా, లోన్ తీసుకోవాలా?", a: "ముందు ఇన్సూరెన్స్ చూడండి, ఎందుకంటే అది తిరిగి కట్టాల్సిన పని లేదు. ఇన్సూరెన్స్, పొదుపు సరిపోని భాగానికి మాత్రమే లోన్." },
          { q: "కుటుంబ సభ్యుల చికిత్స కోసం నేను అప్లై చేయవచ్చా?", a: "లోన్ అప్లై చేసిన వ్యక్తినే అంచనా వేస్తారు, వారే తిరిగి చెల్లించాలి. కుటుంబ సభ్యుల చికిత్స కోసం మీరు అప్లై చేస్తే, లెండర్ మీ ఆదాయం, క్రెడిట్ చరిత్ర చూస్తారు, EMI లు మీవే." },
          { q: "SwiftLoan.ai ఏమైనా ఛార్జ్ చేస్తుందా?", a: "లేదు. అప్పు తీసుకునే వారి నుండి మేము ఏమీ తీసుకోం. ప్రాసెసింగ్ ఫీజు వంటి లెండర్ ఛార్జీలు మీరు ఒప్పుకునే ముందు ప్రతి లెండర్ Key Fact Statement లో చూపిస్తారు." },
          { q: "నా క్రెడిట్ స్కోర్ తక్కువగా ఉంటే?", a: "అయినా చెక్ చేయవచ్చు. ఇది సాఫ్ట్ చెక్, కాబట్టి మీ ఆప్షన్స్ చూడటం వల్ల క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు. ప్రతి లెండర్ తన సొంత ప్రమాణాలు పెట్టుకుంటారు." },
        ],
        ctaTitle: "ఈరోజు మీకు ఏ ఆఫర్స్ వస్తాయో చూడండి",
        ctaBody: "సాఫ్ట్ క్రెడిట్ చెక్, పేపర్‌లెస్, సుమారు 3 నిమిషాలు. చెక్ చేయడానికి ఛార్జ్ లేదు.",
        disclaimer: "SwiftLoan.ai లెండర్ కాదు. ఆమోదం, లోన్ అమౌంట్, రేటు, ఫీజులు, డబ్బు వచ్చే సమయం లెండర్ నిర్ణయిస్తారు.",
      },
      travel: {
        breadcrumb: "ప్రయాణం",
        linkLabel: "ప్రయాణం కోసం పర్సనల్ లోన్",
        h1: "ప్రయాణం కోసం పర్సనల్ లోన్: ట్రిప్ బుక్ చేసే ముందు EMI నిర్ణయించుకోండి",
        intro:
          "ట్రావెల్ లోన్ అంటే ట్రిప్ ఖర్చులకు వాడుకునే పర్సనల్ లోన్. దీనికి ఎలాంటి సెక్యూరిటీ అక్కర్లేదు, సాఫ్ట్ క్రెడిట్ చెక్ తర్వాత SwiftLoan.ai లో మ్యాచ్ అయిన ఆఫర్స్ కంపేర్ చేయవచ్చు. విహారయాత్ర అవసరం కాదు, ఒక కోరిక. కాబట్టి ఈ పేజీ అప్పు ఎలా తీసుకోవాలో ఎంత చెబుతుందో, ఎప్పుడు తీసుకోకూడదో కూడా అంతే చెబుతుంది.",
        factsTitle: "పర్సనల్ లోన్ లో ఏమి ఉంటుంది",
        factsNote: "ప్రత్యేకంగా ట్రావెల్ లోన్ లేదు. ఇవి పర్సనల్ లోన్ నిబంధనలు, మీకు ఏవి వస్తాయో లెండర్ నిర్ణయిస్తారు.",
        sections: [
          {
            layout: "prose",
            title: "మొదటి ప్రశ్న: ఈ ట్రిప్ అప్పుతో చేయాలా?",
            paragraphs: [
              "ట్రిప్ కొన్ని రోజుల్లో లేదా వారాల్లో ముగుస్తుంది; ఇంటికి వచ్చాక కూడా EMI లు కొనసాగుతాయి. వడ్డీ వల్ల ట్రిప్ దాని అసలు ధర కంటే ఎక్కువ పడుతుంది. ఇంకొన్ని నెలలు పొదుపు చేసి మొత్తం కట్టగలిగితే, వడ్డీ అసలే ఉండదు.",
            ],
          },
          {
            layout: "twoLists",
            title: "ఎప్పుడు అప్పు తీసుకోవచ్చు, ఎప్పుడు ఆగడం మంచిది",
            lists: [
              {
                title: "ఇలా ఉంటే తీసుకోవచ్చు",
                points: [
                  "తేదీలు మార్చలేనప్పుడు, ఉదాహరణకు తప్పక వెళ్లాల్సిన కుటుంబ కార్యక్రమం.",
                  "ఇప్పటికే ఉన్న EMI లతో పాటు ఈ EMI కూడా మీ నెలవారీ బడ్జెట్ లో సులభంగా సరిపోయినప్పుడు.",
                  "తక్కువ కాలవ్యవధిలో తీర్చేయగలిగినప్పుడు.",
                ],
              },
              {
                title: "ఇలా ఉంటే ఆగడం మంచిది",
                points: [
                  "ఇప్పుడున్న EMI లు లేదా కార్డ్ బిల్లులు కట్టడమే కష్టంగా ఉన్నప్పుడు.",
                  "అత్యవసరాల కోసం ఉంచుకున్న వెసులుబాటును లోన్ మింగేసేటప్పుడు.",
                  "అతి ఎక్కువ కాలవ్యవధి తీసుకుంటేనే EMI బడ్జెట్ లో సరిపోయేటప్పుడు.",
                ],
              },
            ],
          },
          {
            layout: "steps",
            title: "ట్రావెల్ లోన్ చిన్నదిగా ఉంచడం ఎలా",
            items: [
              { title: "ముందు ట్రిప్ ఖర్చు లెక్కించండి", body: "టికెట్లు, బస, రోజువారీ ఖర్చులను అసలు కొటేషన్ల నుండి కలపండి, అప్పుడు మొత్తం ఊహ కాదు, ఒక ఖచ్చితమైన సంఖ్య అవుతుంది." },
              { title: "కొంత భాగం పొదుపు నుండి కట్టండి", body: "లోటుకు మాత్రమే అప్పు తీసుకోండి. లోటు చిన్నదైతే, ఇంకొంత కాలం పొదుపు చేయడం లోన్ కంటే సులభం కావచ్చు." },
              { title: "కట్టగలిగినంత తక్కువ కాలవ్యవధి తీసుకోండి", body: "EMI ఎక్కువ అవుతుంది, వడ్డీ తక్కువ పడుతుంది, తర్వాతి ట్రిప్ కి ముందే లోన్ తీరిపోతుంది." },
              { title: "ఒప్పుకునే ముందు కంపేర్ చేయండి", body: "ప్రతి లెండర్ Key Fact Statement లో రేటు, ప్రాసెసింగ్ ఫీజు, మొత్తం చెల్లింపు చూడండి." },
            ],
          },
        ],
        exampleTitle: "ఉదాహరణ: {amount}, ఏడాదికి {rate}% రేటుతో",
        exampleNote: "తక్కువ కాలవ్యవధిలో వడ్డీ తక్కువగా ఉంటుంది. EMI కట్టాక మీ రోజువారీ బిల్లులకు వెసులుబాటు ఉందో లేదో చూసుకోండి.",
        faqTitle: "ట్రావెల్ లోన్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "ట్రావెల్ లోన్ పర్సనల్ లోన్ కంటే వేరా?", a: "కాదు. ఇది ట్రిప్ కోసం వాడుకునే పర్సనల్ లోన్. మొత్తం, రేటు, కాలవ్యవధిని లెండర్ మీ ఆదాయం, క్రెడిట్ చరిత్ర ఆధారంగా నిర్ణయిస్తారు." },
          { q: "ఆఫర్స్ చూస్తే లోన్ తీసుకోవాల్సిందేనా?", a: "లేదు. ఇది సాఫ్ట్ చెక్, మీ క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు, SwiftLoan.ai కి మీరు ఏమీ కట్టరు. లెండర్ తో ముందుకు వెళ్లాలో లేదో మీరే నిర్ణయించుకుంటారు." },
          { q: "ట్రావెల్ లోన్ కి ఏ కాలవ్యవధి ఎంచుకోవాలి?", a: "మీరు సులభంగా కట్టగలిగే EMI వచ్చే అతి తక్కువ కాలవ్యవధి. కాలవ్యవధి ఎక్కువైతే EMI తగ్గుతుంది, కానీ మొత్తం వడ్డీ పెరుగుతుంది." },
          { q: "లోన్ ఆమోదం రాకముందే బుక్ చేయవచ్చా?", a: "ఇంకా చేతికి రాని డబ్బుపై ఆధారపడకపోవడమే సురక్షితం. ఆమోదం, డబ్బు ఇవ్వడం లెండర్ నిర్ణయిస్తారు, కాబట్టి డబ్బు మీ ఖాతాలో పడే వరకు నాన్-రిఫండబుల్ బుకింగ్స్ చేయకండి." },
          { q: "వడ్డీ కాకుండా వేరే ఛార్జీలు ఉన్నాయా?", a: "లెండర్స్ ప్రాసెసింగ్ ఫీజు తీసుకోవచ్చు. దాన్ని, అన్నీ కలిపిన APR తో పాటు, మీరు ఒప్పుకునే ముందు Key Fact Statement లో చూపిస్తారు. SwiftLoan.ai అప్పు తీసుకునే వారి నుండి ఏమీ తీసుకోదు." },
        ],
        ctaTitle: "EMI లో ఈ ట్రిప్ ఎంత పడుతుందో చూడండి",
        ctaBody: "మ్యాచ్ అయిన పర్సనల్ లోన్ ఆఫర్స్ కంపేర్ చేయండి. సాఫ్ట్ క్రెడిట్ చెక్, సుమారు 3 నిమిషాలు.",
        disclaimer: "లోన్ ఇచ్చేది లెండర్, SwiftLoan.ai కాదు. తుది అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి లెండర్ నిర్ణయిస్తారు.",
      },
      education: {
        breadcrumb: "చదువు",
        linkLabel: "చదువు కోసం పర్సనల్ లోన్",
        h1: "చదువు ఖర్చుల కోసం పర్సనల్ లోన్: ఇది ఏమిటి, ఏది కాదు",
        intro:
          "ఫీజులు, పుస్తకాలు లేదా ల్యాప్‌టాప్ వంటి చదువు ఖర్చులకు పర్సనల్ లోన్ వాడటం గురించి ఈ పేజీ. ఇది ఎడ్యుకేషన్ లోన్ కాదు: చదువుకునే కాలంలో EMI ఆగదు, వడ్డీపై సబ్సిడీ ఉండదు. అయినా, మీకు క్రమమైన ఆదాయం ఉండి, సెక్యూరిటీ లేని లోన్ కావాలంటే ఇది ఉపయోగపడుతుంది.",
        factsTitle: "ఇక్కడ వర్తించే పర్సనల్ లోన్ నిబంధనలు",
        factsNote: "ఇవి పర్సనల్ లోన్ నిబంధనలు, ఎడ్యుకేషన్ లోన్ వి కావు. మీ తుది మొత్తం, రేటు, కాలవ్యవధి లెండర్ నిర్ణయిస్తారు.",
        sections: [
          {
            layout: "twoLists",
            title: "పర్సనల్ లోన్, ఎడ్యుకేషన్ లోన్ మధ్య తేడా",
            lists: [
              {
                title: "చదువు కోసం తీసుకున్న పర్సనల్ లోన్",
                points: [
                  "లోన్ చేతికి రాగానే EMI లు మొదలవుతాయి. కోర్సు సమయంలో మారటోరియం ఉండదు.",
                  "ఎలాంటి సెక్యూరిటీ లేదా గ్యారంటర్ అక్కర్లేదు.",
                  "లెండర్ కోర్సును కాదు, అప్పు తీసుకునే వారి ఆదాయం, క్రెడిట్ చరిత్రను చూస్తారు.",
                ],
              },
              {
                title: "ఎడ్యుకేషన్ లోన్",
                points: [
                  "కోర్సుకు తగ్గట్టుగా ఉంటుంది, తిరిగి చెల్లింపు తరచుగా చదువు పూర్తయ్యాక మొదలవుతుంది.",
                  "పర్సనల్ లోన్ లో లేని స్కీమ్స్ లేదా సబ్సిడీలు ఇందులో ఉండవచ్చు.",
                  "SwiftLoan.ai దీన్ని మ్యాచ్ చేయదు. ఆ సదుపాయాలు కావాలంటే నేరుగా బ్యాంక్ ని అడగండి.",
                ],
              },
            ],
          },
          {
            layout: "prose",
            title: "ఇది ఎవరికి సరిపోతుంది",
            paragraphs: [
              "EMI లు వెంటనే మొదలవుతాయి కాబట్టి, అప్పు తీసుకునే వారికి ఇప్పుడే క్రమమైన ఆదాయం ఉండాలి. పార్ట్-టైమ్ కోర్సు లేదా సర్టిఫికేషన్ చేసే ఉద్యోగులకు, లేదా పిల్లల ఖర్చులు భరించే సాలరీడ్ లేదా సెల్ఫ్-ఎంప్లాయ్డ్ తల్లిదండ్రులకు ఇది సాధారణంగా సరిపోతుంది.",
              "ఆదాయం లేని ఫుల్-టైమ్ స్టూడెంట్ సాధారణంగా స్వయంగా అప్లై చేయరు.",
            ],
          },
          {
            layout: "cards",
            title: "అప్పు తీసుకునే ముందు ఈ ఖర్చులు లెక్కించండి",
            intro: "పేరు, మొత్తం చెప్పగలిగే ఖర్చులకు మాత్రమే అప్పు తీసుకోండి.",
            items: [
              { title: "కోర్సు లేదా కోచింగ్ ఫీజులు", body: "సంస్థను ఫీజు షెడ్యూల్ అడగండి. ఫీజు విడతలుగా కడితే, మొత్తం ఒకేసారి అవసరం ఉండకపోవచ్చు." },
              { title: "పుస్తకాలు, ల్యాప్‌టాప్, పరికరాలు", body: "అసలు ధరలు తెలుసుకోండి. ఇవి ఒకసారి అయ్యే ఖర్చులు, కాబట్టి సాధారణంగా తక్కువ కాలవ్యవధి సరిపోతుంది." },
              { title: "పరీక్ష, అప్లికేషన్ ఫీజులు", body: "ఇవి తరచుగా లోన్ లేకుండా పొదుపు నుండే కట్టగలిగేంత చిన్నవి." },
              { title: "చదువుకునే సమయంలో జీవన ఖర్చులు", body: "వీటిని అంచనా వేయడం అన్నిటికంటే కష్టం. నెలనెలా బడ్జెట్ వేసుకోండి, తీర్చగలిగే దానికంటే ఎక్కువ అప్పు తీసుకోకండి." },
            ],
          },
          {
            layout: "steps",
            title: "తిరిగి చెల్లింపు ప్లాన్",
            items: [
              { title: "EMI ని ఇప్పటి ఆదాయంతో పోల్చండి", body: "తిరిగి చెల్లింపు భవిష్యత్తు జీతం కోసం ఆగదు, కాబట్టి EMI మీ ఇప్పటి సంపాదనలో సరిపోవాలి." },
              { title: "ఆఫర్స్ కంపేర్ చేయండి", body: "రేటు, ప్రాసెసింగ్ ఫీజు, కాలవ్యవధి, మొత్తం చెల్లింపు లెండర్ ని బట్టి మారుతాయి." },
              { title: "Key Fact Statement చదవండి", body: "మీరు ఒప్పుకునే ముందు అన్నీ కలిపిన APR, ఫోర్‌క్లోజర్, ప్రీపేమెంట్ నిబంధనలు ఇందులో ఉంటాయి." },
            ],
          },
        ],
        exampleTitle: "ఉదాహరణ: {amount}, ఏడాదికి {rate}% రేటుతో",
        exampleNote: "కోర్సు పూర్తయినా కాకపోయినా, లోన్ వచ్చిన కొద్ది కాలానికే మొదటి EMI కట్టాలి.",
        faqTitle: "చదువు కోసం పర్సనల్ లోన్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "ఇది ఎడ్యుకేషన్ లోనా?", a: "కాదు. ఇది చదువు ఖర్చులకు వాడుకునే పర్సనల్ లోన్. కోర్సు సమయంలో మారటోరియం ఉండదు, వడ్డీపై సబ్సిడీ ఉండదు; లోన్ వచ్చాక EMI లు మొదలవుతాయి." },
          { q: "స్టూడెంట్ అప్లై చేయవచ్చా?", a: "లెండర్స్ క్రమమైన ఆదాయం చూస్తారు, ప్రతి లెండర్ వయసు, ఆదాయం, క్రెడిట్ కి తన సొంత ప్రమాణాలు పెట్టుకుంటారు. ఆదాయం లేని స్టూడెంట్ కోసం సాధారణంగా సంపాదించే తల్లిదండ్రులు లేదా సంరక్షకులు అప్పు తీసుకుంటారు." },
          { q: "ముందు ఎడ్యుకేషన్ లోన్ చూడాలా?", a: "ఎక్కువ కాలం కోర్సుకు పెద్ద మొత్తం కావాలంటే, ఇంకా ఆదాయం లేకపోతే, ముందు బ్యాంక్ ని ఎడ్యుకేషన్ లోన్ గురించి అడగడం మంచిది, ఎందుకంటే అది దాని కోసమే ఉంది. ఇప్పటి నుండే తీర్చగలిగే చిన్న, దగ్గరి ఖర్చులకు పర్సనల్ లోన్ సరిపోతుంది." },
          { q: "ఏ డాక్యుమెంట్స్ కావాలి?", a: "చాలా పర్సనల్ లోన్లకు: PAN, Aadhaar ఆధారిత eKYC లేదా DigiLocker, ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్. మొదట మ్యాచ్ అయిన ఆఫర్స్ చూడటానికి ఎలాంటి డాక్యుమెంట్స్ అక్కర్లేదు." },
          { q: "SwiftLoan.ai లోన్ ఇస్తుందా?", a: "లేదు. SwiftLoan.ai ఒక Lending Service Provider: మేము మిమ్మల్ని RBI-రిజిస్టర్డ్ లెండింగ్ పార్టనర్స్ తో కలుపుతాం, లోన్ లెండర్ ఇస్తారు." },
        ],
        ctaTitle: "మీ చదువు ఖర్చులకు పర్సనల్ లోన్ ఆఫర్స్ చూడండి",
        ctaBody: "సాఫ్ట్ క్రెడిట్ చెక్, కాబట్టి క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు. సుమారు 3 నిమిషాలు.",
        disclaimer: "ఇది పర్సనల్ లోన్, ఎడ్యుకేషన్ లోన్ కాదు. లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
      },
      debt: {
        breadcrumb: "అప్పుల ఏకీకరణ",
        linkLabel: "అప్పులు ఒకే చోటికి తేవడానికి పర్సనల్ లోన్",
        h1: "డెట్ కన్సాలిడేషన్ కోసం పర్సనల్ లోన్: అనేక EMI ల బదులు ఒకే EMI",
        intro:
          "డెట్ కన్సాలిడేషన్ అంటే ఒక పర్సనల్ లోన్ తీసుకుని, దానితో క్రెడిట్ కార్డ్ బకాయిలు లేదా చిన్న లోన్లు వంటి అనేక అప్పులు తీర్చేయడం. అప్పుడు మీకు ఒకే EMI, ఒకే తేదీ, ఒకే రేటు మిగులుతాయి. కొత్త లోన్ మొత్తం ఖర్చు పాత అప్పుల కంటే తక్కువైతేనే డబ్బు ఆదా అవుతుంది, కాబట్టి సౌలభ్యం కంటే లెక్కే ముఖ్యం.",
        factsTitle: "మీ అప్పులు కలిపే లోన్",
        factsNote: "SwiftLoan.ai లో కన్సాలిడేషన్ లోన్ అంటే పర్సనల్ లోనే. దాని రేటు మీ ఇప్పటి అప్పుల కంటే తక్కువ అవుతుందా అనేది లెండర్ మీకు ఇచ్చే ఆఫర్ పై ఆధారపడి ఉంటుంది.",
        sections: [
          {
            layout: "steps",
            title: "అప్లై చేసే ముందు లెక్క వేయండి",
            items: [
              { title: "ప్రతి అప్పు లిస్ట్ రాయండి", body: "ప్రతిదానికి బకాయి మొత్తం, వడ్డీ రేటు, నెలవారీ చెల్లింపు, మిగిలిన నెలలు రాసుకోండి." },
              { title: "ఏమీ మార్చకపోతే అయ్యే ఖర్చు కలపండి", body: "అన్నిటిపై ఇంకా కట్టాల్సిన చెల్లింపులు కలపండి. కొత్త లోన్ ఈ సంఖ్య కంటే తక్కువ పడాలి." },
              { title: "మూసివేత ఛార్జీలు అడగండి", body: "మీ ఇప్పటి లెండర్స్ ఫోర్‌క్లోజర్ లేదా ప్రీపేమెంట్ ఫీజు తీసుకోవచ్చు. నిర్ణయించే ముందు తెలుసుకోండి." },
              { title: "కొత్త లోన్ తో కంపేర్ చేయండి", body: "కొత్త లోన్ మొత్తం చెల్లింపుకు దాని ప్రాసెసింగ్ ఫీజు, మూసివేత ఛార్జీలు కలపండి. ఫలితం స్పష్టంగా తక్కువ కాకపోతే, కన్సాలిడేషన్ వల్ల డబ్బు ఆదా కావడం లేదు." },
            ],
          },
          {
            layout: "twoLists",
            title: "ఎప్పుడు లాభం, ఎప్పుడు కాదు",
            lists: [
              {
                title: "ఇలా ఉంటే లాభం",
                points: [
                  "మీరు తీర్చేస్తున్న అప్పుల రేట్ల కంటే కొత్త రేటు తక్కువగా ఉన్నప్పుడు.",
                  "కాలవ్యవధి దాదాపు అంతే ఉండి, వడ్డీ ఎక్కువ సంవత్సరాలకు విస్తరించనప్పుడు.",
                  "అనేక తేదీల వల్ల చెల్లింపులు తప్పిపోతూ, ఒకే EMI తో అది సరి అయినప్పుడు.",
                ],
              },
              {
                title: "ఇలా ఉంటే లాభం లేదు",
                points: [
                  "కొత్త రేటు అంతే లేదా ఎక్కువగా ఉన్నప్పుడు.",
                  "చాలా ఎక్కువ కాలవ్యవధి వల్ల EMI తగ్గినా, మొత్తం చెల్లింపు పెరిగినప్పుడు.",
                  "కొత్త లోన్ ఫీజులు, పాత అప్పుల మూసివేత ఛార్జీలు ఆదాను మింగేసినప్పుడు.",
                  "ఖాళీ అయిన క్రెడిట్ కార్డ్స్ మళ్లీ వాడుతూ, లోన్ తో పాటు కొత్త కార్డ్ బకాయిలు కూడా వచ్చినప్పుడు.",
                ],
              },
            ],
          },
          {
            layout: "prose",
            title: "తక్కువ EMI వెనుక ఏముండవచ్చు",
            paragraphs: [
              "కన్సాలిడేషన్ లోన్ ఎక్కువ కాలం నడవడం వల్ల మాత్రమే దాని నెలవారీ EMI తక్కువగా కనిపించవచ్చు. ఆ వెసులుబాటే మీకు కావాల్సింది కావచ్చు, కానీ EMI తో పాటు మొత్తం చెల్లింపు కూడా చూడండి. కేవలం రేటు మారితే అదే లోన్ ఖర్చు ఎంత మారుతుందో కింది టేబుల్ చూపిస్తుంది.",
            ],
          },
          {
            layout: "checklist",
            title: "కన్సాలిడేషన్ తర్వాత",
            items: [
              "పాత అప్పులు వెంటనే తీర్చేసి, ప్రతి లెండర్ నుండి రాతపూర్వక ధృవీకరణ తీసుకోండి.",
              "ఖాళీ అయిన కార్డ్ లిమిట్ ని అదనపు డబ్బుగా భావించకండి.",
              "ఒక్క EMI ని ప్రతి నెలా సమయానికి కట్టండి. మంచి చెల్లింపు చరిత్ర ఉంటే సాధారణంగా తర్వాత మంచి రేటు వస్తుంది.",
            ],
          },
        ],
        exampleTitle: "ఉదాహరణ: {amount}, {months} నెలలు, నాలుగు వేర్వేరు రేట్లతో",
        exampleNote: "మొత్తం అదే, కాలవ్యవధి అదే: రేటు మాత్రమే మారుతుంది. అందుకే మీకు వచ్చే రేటే కన్సాలిడేషన్ లాభమా కాదా అని నిర్ణయిస్తుంది.",
        faqTitle: "డెట్ కన్సాలిడేషన్: సాధారణ ప్రశ్నలు",
        faqs: [
          { q: "డెట్ కన్సాలిడేషన్ లోన్ అంటే ఏమిటి?", a: "అనేక అప్పులు తీర్చడానికి వాడే పర్సనల్ లోన్ ఇది, ఆ తర్వాత ఒకే లోన్ తీర్చాలి. SwiftLoan.ai లో ఇది పర్సనల్ లోన్, ప్రత్యేక ప్రోడక్ట్ కాదు." },
          { q: "కన్సాలిడేషన్ తో ఎప్పుడూ డబ్బు ఆదా అవుతుందా?", a: "లేదు. కొత్త లోన్ మొత్తం చెల్లింపు, ఫీజులతో కలిపి, పాత అప్పులపై మీరు కట్టే దానికంటే తక్కువైతేనే ఆదా అవుతుంది." },
          { q: "లెండర్ నా పాత అప్పులు నేరుగా తీరుస్తారా?", a: "అది లెండర్ పై ఆధారపడి ఉంటుంది, కాబట్టి ఒప్పుకునే ముందు అడగండి. డబ్బు మీ బ్యాంక్ ఖాతాలో జమ అయితే, పాత అప్పులు వెంటనే మీరే తీర్చేయండి." },
          { q: "ఆఫర్స్ చూస్తే నా క్రెడిట్ స్కోర్ తగ్గుతుందా?", a: "లేదు. ఇది సాఫ్ట్ చెక్. హార్డ్ ఎంక్వైరీ తర్వాత, మీ అనుమతితో, మీరు లెండర్ దగ్గర అప్లై చేసినప్పుడు మాత్రమే జరుగుతుంది." },
          { q: "క్రెడిట్ స్కోర్ తక్కువగా ఉన్నా కన్సాలిడేషన్ చేయవచ్చా?", a: "అయినా చెక్ చేయవచ్చు, ఎందుకంటే ఇది సాఫ్ట్ చెక్, ప్రతి లెండర్ తన సొంత ప్రమాణాలు పెట్టుకుంటారు. మీకు వచ్చే రేటు ఇప్పటి అప్పుల కంటే తక్కువ కాకపోతే, కన్సాలిడేషన్ వల్ల డబ్బు ఆదా కాదు." },
        ],
        ctaTitle: "మీరు ఏ రేటుతో అప్పులు కలపగలరో చూడండి",
        ctaBody: "మ్యాచ్ అయిన ఆఫర్స్ పక్కపక్కనే కంపేర్ చేయండి: రేటు, EMI, ఫీజులు, కాలవ్యవధి. సాఫ్ట్ క్రెడిట్ చెక్.",
        disclaimer: "SwiftLoan.ai మిమ్మల్ని లెండర్స్ తో కలుపుతుంది, లోన్ ఇవ్వదు. రేటు, ఫీజులు, అమౌంట్, కాలవ్యవధి లెండర్ నిర్ణయిస్తారు, కన్సాలిడేషన్ వల్ల డబ్బు ఆదా అవుతుందా అనేది వీటిపైనే ఆధారపడి ఉంటుంది.",
      },
    },
  },
});
