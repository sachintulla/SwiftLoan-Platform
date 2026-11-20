import { defineCopy } from "@/lib/copy"; // server-safe: the pages' structured data reads this on the server

/**
 * The /personal-loan and /business-loan pages. The key facts (amounts, rate, tenure) and the uses are
 * NOT repeated here: they are read from the home page's loan cards (offers.ts) so the two can never
 * disagree. Nothing here states a figure the site does not already state; eligibility is described
 * in general terms because the lenders set their own criteria.
 */
interface LoanPage {
  breadcrumb: string;
  h1: string;
  intro: string;
  factsTitle: string;
  usesTitle: string;
  whoTitle: string;
  who: string[];
  docsTitle: string;
  docs: string[];
  stepsTitle: string;
  steps: { title: string; body: string }[];
  emiLink: string;
  faqTitle: string;
  faqs: { q: string; a: string }[];
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
  disclaimer: string;
}
interface LoanPagesCopy {
  home: string;
  personal: LoanPage;
  business: LoanPage;
}

export const loanPagesCopy = defineCopy<LoanPagesCopy>({
  en: {
    home: "Home",
    personal: {
      breadcrumb: "Personal loan",
      h1: "Personal loan: compare offers from RBI-registered lenders",
      intro:
        "Collateral-free personal loans for weddings, medical needs, travel, education or debt consolidation. Check your eligibility with a soft credit check and compare matched offers in about 3 minutes.",
      factsTitle: "Personal loan at a glance",
      usesTitle: "What people use it for",
      whoTitle: "Who can apply",
      who: [
        "Indian residents with a regular income, salaried or self-employed.",
        "Each lender sets its own age, income and credit-score criteria; our match shows only offers that fit your profile.",
        "A good repayment history usually means a better rate.",
      ],
      docsTitle: "Documents you will need",
      docs: ["PAN", "Aadhaar-based eKYC or DigiLocker", "Recent bank statements or salary slips"],
      stepsTitle: "How it works",
      steps: [
        { title: "Check eligibility", body: "Share a few details. It is a soft check, so your credit score is not affected." },
        { title: "Compare offers", body: "See matched offers side by side: rate, EMI, fees and tenure." },
        { title: "Apply with the lender", body: "Pick an offer and finish with the lender. Approval and disbursal are done by the lender." },
      ],
      emiLink: "Work out your EMI first",
      faqTitle: "Personal loan: common questions",
      faqs: [
        { q: "Is a personal loan collateral-free?", a: "Yes. A personal loan needs no security or guarantor. The lender decides based on your income and credit history." },
        { q: "Does checking my eligibility affect my credit score?", a: "No. It is a soft check. A hard enquiry happens only later, with your consent, when you apply to a lender." },
        { q: "Does SwiftLoan.ai give the loan?", a: "No. SwiftLoan.ai is a Lending Service Provider: we match you with RBI-registered lending partners, and the loan is given by the lender." },
        { q: "Are there charges for using SwiftLoan.ai?", a: "No. Borrowers pay us nothing. Lender charges such as processing fees are shown in each lender's Key Fact Statement before you accept." },
      ],
      ctaTitle: "See the personal loan offers you can get",
      ctaBody: "Soft credit check, 100% paperless, about 3 minutes.",
      ctaButton: "Check my offers",
      disclaimer: "Loan amount, rate, fees and tenure are set by the lender based on your profile.",
    },
    business: {
      breadcrumb: "Business loan",
      h1: "Business loan for MSMEs, startups and the self-employed",
      intro:
        "Working capital and growth funding for inventory, equipment, expansion or payroll, matched to your business's cash flow. Compare offers from RBI-registered lending partners with a soft credit check.",
      factsTitle: "Business loan at a glance",
      usesTitle: "What businesses use it for",
      whoTitle: "Who can apply",
      who: [
        "MSMEs, startups and self-employed professionals with a running business.",
        "Lenders look at business vintage, turnover, bank statements and credit history; each sets its own criteria.",
        "Rates are tailored to your business's vintage and turnover.",
      ],
      docsTitle: "Documents you will need",
      docs: ["PAN", "GST returns", "Business bank statements", "Basic business vintage details"],
      stepsTitle: "How it works",
      steps: [
        { title: "Check eligibility", body: "Share your business details. It is a soft check, so your credit score is not affected." },
        { title: "Compare offers", body: "See matched offers side by side: rate, EMI, fees and tenure." },
        { title: "Apply with the lender", body: "Pick an offer and finish with the lender, who assesses GST and bank statements and disburses." },
      ],
      emiLink: "Work out your EMI first",
      faqTitle: "Business loan: common questions",
      faqs: [
        { q: "Who can get a business loan through SwiftLoan.ai?", a: "MSMEs, startups and self-employed professionals. Each lending partner sets its own criteria for vintage, turnover and credit history." },
        { q: "How is my business assessed?", a: "Lenders mainly look at your GST returns and bank statements to understand your cash flow." },
        { q: "Does checking my eligibility affect my credit score?", a: "No. It is a soft check. A hard enquiry happens only later, with your consent, when you apply to a lender." },
        { q: "Does SwiftLoan.ai give the loan?", a: "No. SwiftLoan.ai is a Lending Service Provider: we match you with RBI-registered lending partners, and the loan is given by the lender." },
      ],
      ctaTitle: "See the business loan offers you can get",
      ctaBody: "Soft credit check, 100% paperless, matched to your cash flow.",
      ctaButton: "Check my offers",
      disclaimer: "Loan amount, rate, fees and tenure are set by the lender based on your business profile.",
    },
  },
  hi: {
    home: "होम",
    personal: {
      breadcrumb: "पर्सनल लोन",
      h1: "पर्सनल लोन: RBI-रजिस्टर्ड लेंडर्स के ऑफर्स कम्पेयर करें",
      intro:
        "शादी, इलाज, यात्रा, पढ़ाई या कर्ज़ चुकाने के लिए बिना गारंटी का पर्सनल लोन। सॉफ्ट क्रेडिट चेक से अपनी पात्रता जानें और करीब 3 मिनट में मैच किए गए ऑफर्स कम्पेयर करें।",
      factsTitle: "पर्सनल लोन एक नज़र में",
      usesTitle: "लोग इसे किसलिए लेते हैं",
      whoTitle: "कौन आवेदन कर सकता है",
      who: [
        "नियमित आय वाले भारतीय निवासी, सैलरीड या सेल्फ-एम्प्लॉयड।",
        "हर लेंडर उम्र, आय और क्रेडिट स्कोर के अपने मापदंड तय करता है; हमारा मैच सिर्फ़ आपकी प्रोफ़ाइल के हिसाब से ऑफर्स दिखाता है।",
        "अच्छा भुगतान रिकॉर्ड आम तौर पर बेहतर दर दिलाता है।",
      ],
      docsTitle: "ज़रूरी डॉक्युमेंट्स",
      docs: ["PAN", "Aadhaar आधारित eKYC या DigiLocker", "हाल के बैंक स्टेटमेंट या सैलरी स्लिप"],
      stepsTitle: "यह कैसे काम करता है",
      steps: [
        { title: "पात्रता जाँचें", body: "कुछ जानकारी दें। यह सॉफ्ट चेक है, इससे आपके क्रेडिट स्कोर पर असर नहीं पड़ता।" },
        { title: "ऑफर्स कम्पेयर करें", body: "मैच किए गए ऑफर्स साथ-साथ देखें: दर, EMI, फ़ीस और अवधि।" },
        { title: "लेंडर के साथ आवेदन करें", body: "एक ऑफर चुनें और लेंडर के साथ आगे बढ़ें। मंज़ूरी और पैसा लेंडर देता है।" },
      ],
      emiLink: "पहले अपनी EMI निकालें",
      faqTitle: "पर्सनल लोन: आम सवाल",
      faqs: [
        { q: "क्या पर्सनल लोन बिना गारंटी का होता है?", a: "हाँ। पर्सनल लोन के लिए कोई सिक्योरिटी या गारंटर नहीं चाहिए। लेंडर आपकी आय और क्रेडिट हिस्ट्री के आधार पर फ़ैसला करता है।" },
        { q: "क्या पात्रता जाँचने से मेरा क्रेडिट स्कोर प्रभावित होता है?", a: "नहीं। यह सॉफ्ट चेक है। हार्ड इन्क्वायरी बाद में, आपकी सहमति से, सिर्फ़ तब होती है जब आप किसी लेंडर के पास आवेदन करते हैं।" },
        { q: "क्या SwiftLoan.ai लोन देता है?", a: "नहीं। SwiftLoan.ai एक Lending Service Provider है: हम आपको RBI-रजिस्टर्ड लेंडिंग पार्टनर्स से मिलाते हैं, और लोन लेंडर देता है।" },
        { q: "क्या SwiftLoan.ai इस्तेमाल करने का कोई चार्ज है?", a: "नहीं। उधार लेने वालों से हम कुछ नहीं लेते। लेंडर के चार्ज, जैसे प्रोसेसिंग फ़ीस, स्वीकार करने से पहले हर लेंडर के Key Fact Statement में दिखाए जाते हैं।" },
      ],
      ctaTitle: "देखें आपको कौन से पर्सनल लोन ऑफर्स मिल सकते हैं",
      ctaBody: "सॉफ्ट क्रेडिट चेक, 100% पेपरलेस, करीब 3 मिनट।",
      ctaButton: "मेरे ऑफर्स देखें",
      disclaimer: "लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपकी प्रोफ़ाइल के आधार पर तय करता है।",
    },
    business: {
      breadcrumb: "बिज़नेस लोन",
      h1: "MSME, स्टार्टअप और सेल्फ-एम्प्लॉयड के लिए बिज़नेस लोन",
      intro:
        "स्टॉक, मशीनरी, विस्तार या सैलरी के लिए वर्किंग कैपिटल और ग्रोथ फ़ंडिंग, आपके बिज़नेस के कैश फ़्लो के हिसाब से। सॉफ्ट क्रेडिट चेक के साथ RBI-रजिस्टर्ड लेंडिंग पार्टनर्स के ऑफर्स कम्पेयर करें।",
      factsTitle: "बिज़नेस लोन एक नज़र में",
      usesTitle: "बिज़नेस इसे किसलिए लेते हैं",
      whoTitle: "कौन आवेदन कर सकता है",
      who: [
        "चल रहे बिज़नेस वाले MSME, स्टार्टअप और सेल्फ-एम्प्लॉयड प्रोफ़ेशनल्स।",
        "लेंडर बिज़नेस की उम्र, टर्नओवर, बैंक स्टेटमेंट और क्रेडिट हिस्ट्री देखते हैं; हर लेंडर अपने मापदंड तय करता है।",
        "दरें आपके बिज़नेस की उम्र और टर्नओवर के हिसाब से तय होती हैं।",
      ],
      docsTitle: "ज़रूरी डॉक्युमेंट्स",
      docs: ["PAN", "GST रिटर्न", "बिज़नेस बैंक स्टेटमेंट", "बिज़नेस की उम्र की बुनियादी जानकारी"],
      stepsTitle: "यह कैसे काम करता है",
      steps: [
        { title: "पात्रता जाँचें", body: "अपने बिज़नेस की जानकारी दें। यह सॉफ्ट चेक है, इससे आपके क्रेडिट स्कोर पर असर नहीं पड़ता।" },
        { title: "ऑफर्स कम्पेयर करें", body: "मैच किए गए ऑफर्स साथ-साथ देखें: दर, EMI, फ़ीस और अवधि।" },
        { title: "लेंडर के साथ आवेदन करें", body: "एक ऑफर चुनें और लेंडर के साथ आगे बढ़ें, जो GST और बैंक स्टेटमेंट देखकर पैसा देता है।" },
      ],
      emiLink: "पहले अपनी EMI निकालें",
      faqTitle: "बिज़नेस लोन: आम सवाल",
      faqs: [
        { q: "SwiftLoan.ai से बिज़नेस लोन किसे मिल सकता है?", a: "MSME, स्टार्टअप और सेल्फ-एम्प्लॉयड प्रोफ़ेशनल्स। हर लेंडिंग पार्टनर बिज़नेस की उम्र, टर्नओवर और क्रेडिट हिस्ट्री के अपने मापदंड तय करता है।" },
        { q: "मेरे बिज़नेस का आकलन कैसे होता है?", a: "लेंडर मुख्य रूप से आपके GST रिटर्न और बैंक स्टेटमेंट से आपका कैश फ़्लो समझते हैं।" },
        { q: "क्या पात्रता जाँचने से मेरा क्रेडिट स्कोर प्रभावित होता है?", a: "नहीं। यह सॉफ्ट चेक है। हार्ड इन्क्वायरी बाद में, आपकी सहमति से, सिर्फ़ तब होती है जब आप किसी लेंडर के पास आवेदन करते हैं।" },
        { q: "क्या SwiftLoan.ai लोन देता है?", a: "नहीं। SwiftLoan.ai एक Lending Service Provider है: हम आपको RBI-रजिस्टर्ड लेंडिंग पार्टनर्स से मिलाते हैं, और लोन लेंडर देता है।" },
      ],
      ctaTitle: "देखें आपको कौन से बिज़नेस लोन ऑफर्स मिल सकते हैं",
      ctaBody: "सॉफ्ट क्रेडिट चेक, 100% पेपरलेस, आपके कैश फ़्लो के हिसाब से।",
      ctaButton: "मेरे ऑफर्स देखें",
      disclaimer: "लोन अमाउंट, दर, फ़ीस और अवधि लेंडर आपके बिज़नेस की प्रोफ़ाइल के आधार पर तय करता है।",
    },
  },
  te: {
    home: "హోమ్",
    personal: {
      breadcrumb: "పర్సనల్ లోన్",
      h1: "పర్సనల్ లోన్: RBI-రిజిస్టర్డ్ లెండర్స్ ఆఫర్స్ కంపేర్ చేయండి",
      intro:
        "పెళ్లి, వైద్యం, ప్రయాణం, చదువు లేదా అప్పులు తీర్చడానికి ఎలాంటి హామీ లేని పర్సనల్ లోన్. సాఫ్ట్ క్రెడిట్ చెక్ తో మీ అర్హత తెలుసుకోండి, సుమారు 3 నిమిషాల్లో మ్యాచ్ అయిన ఆఫర్స్ కంపేర్ చేయండి.",
      factsTitle: "పర్సనల్ లోన్ ఒక్క చూపులో",
      usesTitle: "దేనికి తీసుకుంటారు",
      whoTitle: "ఎవరు అప్లై చేయవచ్చు",
      who: [
        "క్రమమైన ఆదాయం ఉన్న భారతీయ నివాసులు, సాలరీడ్ లేదా సెల్ఫ్-ఎంప్లాయ్డ్.",
        "ప్రతి లెండర్ వయసు, ఆదాయం, క్రెడిట్ స్కోర్ కి తన సొంత ప్రమాణాలు పెట్టుకుంటారు; మా మ్యాచ్ మీ ప్రొఫైల్ కి సరిపడే ఆఫర్స్ మాత్రమే చూపిస్తుంది.",
        "మంచి చెల్లింపు చరిత్ర ఉంటే సాధారణంగా మంచి రేటు వస్తుంది.",
      ],
      docsTitle: "కావాల్సిన డాక్యుమెంట్స్",
      docs: ["PAN", "Aadhaar ఆధారిత eKYC లేదా DigiLocker", "ఇటీవలి బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్"],
      stepsTitle: "ఇది ఎలా పనిచేస్తుంది",
      steps: [
        { title: "అర్హత చెక్ చేయండి", body: "కొన్ని వివరాలు ఇవ్వండి. ఇది సాఫ్ట్ చెక్, మీ క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు." },
        { title: "ఆఫర్స్ కంపేర్ చేయండి", body: "మ్యాచ్ అయిన ఆఫర్స్ పక్కపక్కనే చూడండి: రేటు, EMI, ఫీజులు, కాలవ్యవధి." },
        { title: "లెండర్ దగ్గర అప్లై చేయండి", body: "ఒక ఆఫర్ ఎంచుకుని లెండర్ దగ్గర పూర్తి చేయండి. ఆమోదం, డబ్బు లెండర్ ఇస్తారు." },
      ],
      emiLink: "ముందు మీ EMI లెక్కించుకోండి",
      faqTitle: "పర్సనల్ లోన్: సాధారణ ప్రశ్నలు",
      faqs: [
        { q: "పర్సనల్ లోన్ కి హామీ అవసరం లేదా?", a: "అవసరం లేదు. పర్సనల్ లోన్ కి ఎలాంటి సెక్యూరిటీ లేదా గ్యారంటర్ అక్కర్లేదు. లెండర్ మీ ఆదాయం, క్రెడిట్ చరిత్ర ఆధారంగా నిర్ణయిస్తారు." },
        { q: "అర్హత చెక్ చేస్తే నా క్రెడిట్ స్కోర్ పై ప్రభావం ఉంటుందా?", a: "లేదు. ఇది సాఫ్ట్ చెక్. హార్డ్ ఎంక్వైరీ తర్వాత, మీ అనుమతితో, మీరు లెండర్ దగ్గర అప్లై చేసినప్పుడు మాత్రమే జరుగుతుంది." },
        { q: "SwiftLoan.ai లోన్ ఇస్తుందా?", a: "లేదు. SwiftLoan.ai ఒక Lending Service Provider: మేము మిమ్మల్ని RBI-రిజిస్టర్డ్ లెండింగ్ పార్టనర్స్ తో కలుపుతాం, లోన్ లెండర్ ఇస్తారు." },
        { q: "SwiftLoan.ai వాడటానికి ఏమైనా ఛార్జీలు ఉన్నాయా?", a: "లేవు. అప్పు తీసుకునే వారి నుండి మేము ఏమీ తీసుకోం. ప్రాసెసింగ్ ఫీజు వంటి లెండర్ ఛార్జీలు మీరు ఒప్పుకునే ముందు ప్రతి లెండర్ Key Fact Statement లో చూపిస్తారు." },
      ],
      ctaTitle: "మీకు ఏ పర్సనల్ లోన్ ఆఫర్స్ వస్తాయో చూడండి",
      ctaBody: "సాఫ్ట్ క్రెడిట్ చెక్, 100% పేపర్‌లెస్, సుమారు 3 నిమిషాలు.",
      ctaButton: "నా ఆఫర్స్ చూడండి",
      disclaimer: "లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
    },
    business: {
      breadcrumb: "బిజినెస్ లోన్",
      h1: "MSME లు, స్టార్టప్స్, సెల్ఫ్-ఎంప్లాయ్డ్ కోసం బిజినెస్ లోన్",
      intro:
        "స్టాక్, పరికరాలు, విస్తరణ లేదా జీతాల కోసం వర్కింగ్ క్యాపిటల్, గ్రోత్ ఫండింగ్, మీ బిజినెస్ క్యాష్ ఫ్లోకి తగ్గట్టుగా. సాఫ్ట్ క్రెడిట్ చెక్ తో RBI-రిజిస్టర్డ్ లెండింగ్ పార్టనర్స్ ఆఫర్స్ కంపేర్ చేయండి.",
      factsTitle: "బిజినెస్ లోన్ ఒక్క చూపులో",
      usesTitle: "బిజినెస్ లు దేనికి తీసుకుంటాయి",
      whoTitle: "ఎవరు అప్లై చేయవచ్చు",
      who: [
        "నడుస్తున్న బిజినెస్ ఉన్న MSME లు, స్టార్టప్స్, సెల్ఫ్-ఎంప్లాయ్డ్ ప్రొఫెషనల్స్.",
        "లెండర్స్ బిజినెస్ వయసు, టర్నోవర్, బ్యాంక్ స్టేట్‌మెంట్స్, క్రెడిట్ చరిత్ర చూస్తారు; ప్రతి లెండర్ తన సొంత ప్రమాణాలు పెట్టుకుంటారు.",
        "రేట్లు మీ బిజినెస్ వయసు, టర్నోవర్ ఆధారంగా నిర్ణయిస్తారు.",
      ],
      docsTitle: "కావాల్సిన డాక్యుమెంట్స్",
      docs: ["PAN", "GST రిటర్న్స్", "బిజినెస్ బ్యాంక్ స్టేట్‌మెంట్స్", "బిజినెస్ వయసు ప్రాథమిక వివరాలు"],
      stepsTitle: "ఇది ఎలా పనిచేస్తుంది",
      steps: [
        { title: "అర్హత చెక్ చేయండి", body: "మీ బిజినెస్ వివరాలు ఇవ్వండి. ఇది సాఫ్ట్ చెక్, మీ క్రెడిట్ స్కోర్ పై ప్రభావం ఉండదు." },
        { title: "ఆఫర్స్ కంపేర్ చేయండి", body: "మ్యాచ్ అయిన ఆఫర్స్ పక్కపక్కనే చూడండి: రేటు, EMI, ఫీజులు, కాలవ్యవధి." },
        { title: "లెండర్ దగ్గర అప్లై చేయండి", body: "ఒక ఆఫర్ ఎంచుకుని లెండర్ దగ్గర పూర్తి చేయండి; GST, బ్యాంక్ స్టేట్‌మెంట్స్ చూసి లెండర్ డబ్బు ఇస్తారు." },
      ],
      emiLink: "ముందు మీ EMI లెక్కించుకోండి",
      faqTitle: "బిజినెస్ లోన్: సాధారణ ప్రశ్నలు",
      faqs: [
        { q: "SwiftLoan.ai ద్వారా బిజినెస్ లోన్ ఎవరికి వస్తుంది?", a: "MSME లు, స్టార్టప్స్, సెల్ఫ్-ఎంప్లాయ్డ్ ప్రొఫెషనల్స్. ప్రతి లెండింగ్ పార్టనర్ బిజినెస్ వయసు, టర్నోవర్, క్రెడిట్ చరిత్రకు తన సొంత ప్రమాణాలు పెట్టుకుంటారు." },
        { q: "నా బిజినెస్ ని ఎలా అంచనా వేస్తారు?", a: "లెండర్స్ ముఖ్యంగా మీ GST రిటర్న్స్, బ్యాంక్ స్టేట్‌మెంట్స్ ద్వారా మీ క్యాష్ ఫ్లో అర్థం చేసుకుంటారు." },
        { q: "అర్హత చెక్ చేస్తే నా క్రెడిట్ స్కోర్ పై ప్రభావం ఉంటుందా?", a: "లేదు. ఇది సాఫ్ట్ చెక్. హార్డ్ ఎంక్వైరీ తర్వాత, మీ అనుమతితో, మీరు లెండర్ దగ్గర అప్లై చేసినప్పుడు మాత్రమే జరుగుతుంది." },
        { q: "SwiftLoan.ai లోన్ ఇస్తుందా?", a: "లేదు. SwiftLoan.ai ఒక Lending Service Provider: మేము మిమ్మల్ని RBI-రిజిస్టర్డ్ లెండింగ్ పార్టనర్స్ తో కలుపుతాం, లోన్ లెండర్ ఇస్తారు." },
      ],
      ctaTitle: "మీకు ఏ బిజినెస్ లోన్ ఆఫర్స్ వస్తాయో చూడండి",
      ctaBody: "సాఫ్ట్ క్రెడిట్ చెక్, 100% పేపర్‌లెస్, మీ క్యాష్ ఫ్లోకి తగ్గట్టుగా.",
      ctaButton: "నా ఆఫర్స్ చూడండి",
      disclaimer: "లోన్ అమౌంట్, రేటు, ఫీజులు, కాలవ్యవధి మీ బిజినెస్ ప్రొఫైల్ ఆధారంగా లెండర్ నిర్ణయిస్తారు.",
    },
  },
});
