import { defineCopy } from "@/lib/copy"; // server-safe: the page's FAQ structured data reads this on the server

/**
 * The /emi-calculator page: everything around the calculator itself (which keeps its own copy in
 * emi-calculator.ts). Written to answer what people search for: how EMI is worked out, what
 * changes it, and the common questions. Numbers in the example table are computed, not written here.
 */
export const emiPageCopy = defineCopy({
  en: {
    breadcrumbHome: "Home",
    breadcrumbHere: "EMI calculator",
    h1: "EMI Calculator for personal and business loans",
    intro:
      "Work out your monthly loan EMI, the total interest and the total amount you repay, for any loan amount, interest rate and tenure. Free, instant, and no sign-up needed.",
    formulaTitle: "How EMI is calculated",
    formulaIntro: "EMI (Equated Monthly Instalment) is the fixed amount you pay every month. It is worked out with this formula:",
    formula: "EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1)",
    formulaTerms: [
      "P is the loan amount (principal).",
      "r is the monthly interest rate: the yearly rate ÷ 12 ÷ 100. For 12% a year, r = 0.01.",
      "n is the tenure in months.",
    ],
    formulaNote:
      "Each EMI is part interest and part principal. Early EMIs are mostly interest; later ones mostly repay the principal.",
    exampleTitle: "Example: ₹5,00,000 at 11.5% a year",
    exampleCols: { tenure: "Tenure", emi: "Monthly EMI", interest: "Total interest", total: "Total repayment" },
    months: "months",
    exampleNote: "A longer tenure lowers the EMI but raises the total interest you pay.",
    tipsTitle: "How to lower your EMI",
    tips: [
      { title: "Choose a longer tenure", body: "Spreading the loan over more months lowers each EMI, though you pay more interest in total." },
      { title: "Compare interest rates", body: "Even 1% less a year makes a real difference. Compare offers from several lenders before you choose." },
      { title: "Keep a good credit score", body: "Paying bills and existing EMIs on time helps lenders offer you a lower rate." },
      { title: "Borrow only what you need", body: "A smaller loan amount means a smaller EMI and less interest." },
    ],
    faqTitle: "EMI calculator: common questions",
    faqs: [
      {
        q: "What is an EMI?",
        a: "An EMI (Equated Monthly Instalment) is the fixed amount you pay your lender every month until the loan is repaid. It covers both the interest and part of the loan amount.",
      },
      {
        q: "Is the EMI from this calculator exact?",
        a: "It is an estimate using the standard reducing-balance formula. Your actual EMI depends on the rate, fees and tenure the lender finally approves.",
      },
      {
        q: "Does a longer tenure always save money?",
        a: "No. A longer tenure lowers the monthly EMI, but you pay interest for longer, so the total interest goes up.",
      },
      {
        q: "Are processing fees included in the EMI?",
        a: "No. Processing fees and GST are usually deducted from the loan amount or paid separately. They are shown in each lender's Key Fact Statement.",
      },
      {
        q: "Does checking my EMI affect my credit score?",
        a: "No. Using the calculator needs no personal details and has no effect on your credit score. Checking your eligibility on SwiftLoan.ai is a soft check too.",
      },
    ],
    ctaTitle: "Know your EMI? See the offers you can get.",
    ctaBody: "Compare matched offers from RBI-registered lending partners. Soft credit check, about 3 minutes.",
    ctaButton: "Check my offers",
    disclaimer: "Figures are indicative. The final rate, fees and EMI are set by the lender.",
  },
  hi: {
    breadcrumbHome: "होम",
    breadcrumbHere: "EMI कैलकुलेटर",
    h1: "पर्सनल और बिज़नेस लोन के लिए EMI कैलकुलेटर",
    intro:
      "किसी भी लोन अमाउंट, ब्याज दर और अवधि के लिए अपनी मासिक EMI, कुल ब्याज और कुल चुकाई जाने वाली रकम जानें। मुफ़्त, तुरंत, बिना साइन-अप के।",
    formulaTitle: "EMI कैसे निकाली जाती है",
    formulaIntro: "EMI (Equated Monthly Instalment) वह तय रकम है जो आप हर महीने चुकाते हैं। इसे इस फ़ॉर्मूले से निकाला जाता है:",
    formula: "EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1)",
    formulaTerms: [
      "P लोन अमाउंट (मूलधन) है।",
      "r मासिक ब्याज दर है: सालाना दर ÷ 12 ÷ 100। 12% सालाना पर r = 0.01।",
      "n महीनों में अवधि है।",
    ],
    formulaNote: "हर EMI में कुछ ब्याज और कुछ मूलधन होता है। शुरुआती EMI में ज़्यादातर ब्याज होता है, बाद की EMI में ज़्यादातर मूलधन।",
    exampleTitle: "उदाहरण: ₹5,00,000, 11.5% सालाना ब्याज पर",
    exampleCols: { tenure: "अवधि", emi: "मासिक EMI", interest: "कुल ब्याज", total: "कुल भुगतान" },
    months: "महीने",
    exampleNote: "लंबी अवधि से EMI कम होती है, लेकिन कुल ब्याज बढ़ जाता है।",
    tipsTitle: "अपनी EMI कैसे कम करें",
    tips: [
      { title: "लंबी अवधि चुनें", body: "लोन को ज़्यादा महीनों में बाँटने से हर EMI कम होती है, हालाँकि कुल ब्याज ज़्यादा लगता है।" },
      { title: "ब्याज दरें कम्पेयर करें", body: "सालाना 1% कम दर भी बड़ा फ़र्क डालती है। चुनने से पहले कई लेंडर्स के ऑफर्स देखें।" },
      { title: "अच्छा क्रेडिट स्कोर रखें", body: "बिल और मौजूदा EMI समय पर चुकाने से लेंडर्स कम दर दे पाते हैं।" },
      { title: "उतना ही लें जितनी ज़रूरत हो", body: "कम लोन अमाउंट का मतलब कम EMI और कम ब्याज।" },
    ],
    faqTitle: "EMI कैलकुलेटर: आम सवाल",
    faqs: [
      { q: "EMI क्या है?", a: "EMI (Equated Monthly Instalment) वह तय रकम है जो आप लोन पूरा होने तक हर महीने लेंडर को चुकाते हैं। इसमें ब्याज और लोन अमाउंट का हिस्सा दोनों शामिल होते हैं।" },
      { q: "क्या इस कैलकुलेटर की EMI बिल्कुल सही है?", a: "यह स्टैंडर्ड रिड्यूसिंग-बैलेंस फ़ॉर्मूले से निकाला गया अनुमान है। असली EMI लेंडर की अंतिम मंज़ूर दर, फ़ीस और अवधि पर निर्भर करती है।" },
      { q: "क्या लंबी अवधि से हमेशा पैसे बचते हैं?", a: "नहीं। लंबी अवधि से मासिक EMI कम होती है, लेकिन ब्याज ज़्यादा समय तक लगता है, इसलिए कुल ब्याज बढ़ जाता है।" },
      { q: "क्या प्रोसेसिंग फ़ीस EMI में शामिल है?", a: "नहीं। प्रोसेसिंग फ़ीस और GST आम तौर पर लोन अमाउंट से काटे जाते हैं या अलग से दिए जाते हैं। ये हर लेंडर के Key Fact Statement में दिखाए जाते हैं।" },
      { q: "क्या EMI चेक करने से मेरा क्रेडिट स्कोर प्रभावित होता है?", a: "नहीं। कैलकुलेटर के लिए कोई निजी जानकारी नहीं चाहिए और इसका क्रेडिट स्कोर पर कोई असर नहीं होता। SwiftLoan.ai पर पात्रता जाँच भी सॉफ्ट चेक है।" },
    ],
    ctaTitle: "EMI पता चल गई? अब देखें आपको कौन से ऑफर्स मिल सकते हैं।",
    ctaBody: "RBI-रेगुलेटेड लेंडिंग पार्टनर्स के मैच किए गए ऑफर्स कम्पेयर करें। सॉफ्ट क्रेडिट चेक, करीब 3 मिनट।",
    ctaButton: "मेरे ऑफर्स देखें",
    disclaimer: "आँकड़े अनुमानित हैं। अंतिम दर, फ़ीस और EMI लेंडर तय करता है।",
  },
  te: {
    breadcrumbHome: "హోమ్",
    breadcrumbHere: "EMI కాలిక్యులేటర్",
    h1: "పర్సనల్ మరియు బిజినెస్ లోన్ల కోసం EMI కాలిక్యులేటర్",
    intro:
      "ఏ లోన్ అమౌంట్, వడ్డీ రేటు, కాలవ్యవధికైనా మీ నెలవారీ EMI, మొత్తం వడ్డీ, మొత్తం చెల్లించాల్సిన మొత్తం తెలుసుకోండి. ఉచితం, వెంటనే, సైన్-అప్ అవసరం లేదు.",
    formulaTitle: "EMI ఎలా లెక్కిస్తారు",
    formulaIntro: "EMI (Equated Monthly Instalment) అంటే మీరు ప్రతి నెలా చెల్లించే స్థిరమైన మొత్తం. దీన్ని ఈ ఫార్ములాతో లెక్కిస్తారు:",
    formula: "EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1)",
    formulaTerms: [
      "P అంటే లోన్ అమౌంట్ (అసలు).",
      "r అంటే నెలవారీ వడ్డీ రేటు: సంవత్సర రేటు ÷ 12 ÷ 100. సంవత్సరానికి 12% అయితే r = 0.01.",
      "n అంటే నెలల్లో కాలవ్యవధి.",
    ],
    formulaNote: "ప్రతి EMI లో కొంత వడ్డీ, కొంత అసలు ఉంటాయి. మొదటి EMI లలో ఎక్కువ భాగం వడ్డీ, తర్వాతి వాటిలో ఎక్కువ భాగం అసలు.",
    exampleTitle: "ఉదాహరణ: ₹5,00,000, సంవత్సరానికి 11.5% వడ్డీ",
    exampleCols: { tenure: "కాలవ్యవధి", emi: "నెలవారీ EMI", interest: "మొత్తం వడ్డీ", total: "మొత్తం చెల్లింపు" },
    months: "నెలలు",
    exampleNote: "ఎక్కువ కాలవ్యవధితో EMI తగ్గుతుంది, కానీ మొత్తం వడ్డీ పెరుగుతుంది.",
    tipsTitle: "మీ EMI ఎలా తగ్గించుకోవాలి",
    tips: [
      { title: "ఎక్కువ కాలవ్యవధి ఎంచుకోండి", body: "లోన్ ని ఎక్కువ నెలలకు పంచితే ప్రతి EMI తగ్గుతుంది, కానీ మొత్తం వడ్డీ ఎక్కువ అవుతుంది." },
      { title: "వడ్డీ రేట్లు కంపేర్ చేయండి", body: "సంవత్సరానికి 1% తక్కువ రేటు కూడా పెద్ద తేడా చేస్తుంది. ఎంచుకునే ముందు చాలా లెండర్స్ ఆఫర్స్ చూడండి." },
      { title: "మంచి క్రెడిట్ స్కోర్ ఉంచుకోండి", body: "బిల్లులు, ఇప్పటి EMI లు సమయానికి కడితే లెండర్స్ తక్కువ రేటు ఇవ్వగలరు." },
      { title: "అవసరమైనంత మాత్రమే తీసుకోండి", body: "తక్కువ లోన్ అమౌంట్ అంటే తక్కువ EMI, తక్కువ వడ్డీ." },
    ],
    faqTitle: "EMI కాలిక్యులేటర్: సాధారణ ప్రశ్నలు",
    faqs: [
      { q: "EMI అంటే ఏమిటి?", a: "EMI (Equated Monthly Instalment) అంటే లోన్ పూర్తిగా తీరే వరకు మీరు ప్రతి నెలా లెండర్ కి చెల్లించే స్థిరమైన మొత్తం. ఇందులో వడ్డీ, లోన్ అమౌంట్ లో కొంత భాగం రెండూ ఉంటాయి." },
      { q: "ఈ కాలిక్యులేటర్ చూపే EMI ఖచ్చితమైనదా?", a: "ఇది స్టాండర్డ్ రెడ్యూసింగ్-బ్యాలెన్స్ ఫార్ములాతో లెక్కించిన అంచనా. అసలు EMI లెండర్ చివరికి ఆమోదించే రేటు, ఫీజులు, కాలవ్యవధిపై ఆధారపడి ఉంటుంది." },
      { q: "ఎక్కువ కాలవ్యవధితో ఎప్పుడూ డబ్బు ఆదా అవుతుందా?", a: "లేదు. ఎక్కువ కాలవ్యవధితో నెలవారీ EMI తగ్గుతుంది, కానీ ఎక్కువ కాలం వడ్డీ కడతారు కాబట్టి మొత్తం వడ్డీ పెరుగుతుంది." },
      { q: "ప్రాసెసింగ్ ఫీజు EMI లో కలిసి ఉంటుందా?", a: "లేదు. ప్రాసెసింగ్ ఫీజు, GST సాధారణంగా లోన్ అమౌంట్ నుండి తీసేస్తారు లేదా విడిగా కడతారు. ఇవి ప్రతి లెండర్ Key Fact Statement లో చూపిస్తారు." },
      { q: "EMI చెక్ చేస్తే నా క్రెడిట్ స్కోర్ పై ప్రభావం ఉంటుందా?", a: "లేదు. కాలిక్యులేటర్ కి ఎలాంటి వ్యక్తిగత వివరాలు అవసరం లేదు, క్రెడిట్ స్కోర్ పై ఎలాంటి ప్రభావం ఉండదు. SwiftLoan.ai లో అర్హత చెక్ కూడా సాఫ్ట్ చెక్ మాత్రమే." },
    ],
    ctaTitle: "EMI తెలిసిందా? మీకు ఏ ఆఫర్స్ వస్తాయో చూడండి.",
    ctaBody: "RBI-రెగ్యులేటెడ్ లెండింగ్ పార్టనర్స్ నుండి మ్యాచ్ అయిన ఆఫర్స్ కంపేర్ చేయండి. సాఫ్ట్ క్రెడిట్ చెక్, సుమారు 3 నిమిషాలు.",
    ctaButton: "నా ఆఫర్స్ చూడండి",
    disclaimer: "అంకెలు అంచనా మాత్రమే. చివరి రేటు, ఫీజులు, EMI లెండర్ నిర్ణయిస్తారు.",
  },
});
