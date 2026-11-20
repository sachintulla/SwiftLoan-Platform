import type { PublicPage } from './seoTypes';

/**
 * Loan-purpose pages (SEO phase 2, item 3). One entry per page. Each is a personal loan USED FOR
 * that purpose, and the titles say "personal loan" so nobody reads them as separate products.
 * Paths must match PURPOSE_PATH in src/i18n/purpose-pages.ts (a test checks it).
 */
export const PURPOSE_PAGES: PublicPage[] = [
  {
    path: '/wedding-loan',
    title: 'Personal loan for wedding: plan the EMI first | SwiftLoan.ai',
    description:
      'Using a personal loan for wedding costs: how much to borrow, what to compare between offers and a worked EMI example. Soft credit check, no collateral.',
    priority: 0.7,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'शादी के लिए पर्सनल लोन: पहले EMI तय करें | SwiftLoan.ai',
        description:
          'शादी के खर्च के लिए पर्सनल लोन: कितना उधार लें, ऑफर्स में क्या कम्पेयर करें और EMI का उदाहरण। सॉफ्ट क्रेडिट चेक, बिना सिक्योरिटी।',
      },
      te: {
        title: 'పెళ్లి కోసం పర్సనల్ లోన్: ముందు EMI ప్లాన్ చేయండి | SwiftLoan.ai',
        description:
          'పెళ్లి ఖర్చులకు పర్సనల్ లోన్: ఎంత తీసుకోవాలి, ఆఫర్స్ లో ఏమి కంపేర్ చేయాలి, EMI ఉదాహరణ. సాఫ్ట్ క్రెడిట్ చెక్, సెక్యూరిటీ అక్కర్లేదు.',
      },
    },
  },
  {
    path: '/medical-loan',
    title: 'Personal loan for medical emergency: what to check | SwiftLoan.ai',
    description:
      'Paying a hospital bill with a personal loan: check insurance first, keep documents ready and compare offers. Paperless, soft credit check, lender decides.',
    priority: 0.7,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'मेडिकल इमरजेंसी के लिए पर्सनल लोन: क्या जाँचें | SwiftLoan.ai',
        description:
          'अस्पताल के बिल के लिए पर्सनल लोन: पहले इंश्योरेंस देखें, डॉक्युमेंट्स तैयार रखें और ऑफर्स कम्पेयर करें। पेपरलेस, सॉफ्ट क्रेडिट चेक।',
      },
      te: {
        title: 'మెడికల్ ఎమర్జెన్సీ కోసం పర్సనల్ లోన్: ఏమి చూడాలి | SwiftLoan.ai',
        description:
          'హాస్పిటల్ బిల్లుకు పర్సనల్ లోన్: ముందు ఇన్సూరెన్స్ చూడండి, డాక్యుమెంట్స్ సిద్ధంగా ఉంచండి, ఆఫర్స్ కంపేర్ చేయండి. పేపర్‌లెస్, సాఫ్ట్ క్రెడిట్ చెక్.',
      },
    },
  },
  {
    path: '/travel-loan',
    title: 'Personal loan for travel: decide the EMI first | SwiftLoan.ai',
    description:
      'Thinking of a personal loan for travel? When borrowing for a trip is reasonable, when to wait, how to keep the loan small, and a worked EMI example.',
    priority: 0.7,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'यात्रा के लिए पर्सनल लोन: बुकिंग से पहले EMI तय करें | SwiftLoan.ai',
        description:
          'यात्रा के लिए पर्सनल लोन लेने की सोच रहे हैं? कब उधार लेना ठीक है, कब रुकना बेहतर है, लोन छोटा कैसे रखें, और EMI का उदाहरण।',
      },
      te: {
        title: 'ప్రయాణం కోసం పర్సనల్ లోన్: బుకింగ్ కి ముందు EMI చూడండి | SwiftLoan.ai',
        description:
          'ప్రయాణానికి పర్సనల్ లోన్ తీసుకోవాలా? ఎప్పుడు తీసుకోవచ్చు, ఎప్పుడు ఆగాలి, లోన్ చిన్నదిగా ఎలా ఉంచాలి, EMI ఉదాహరణ.',
      },
    },
  },
  {
    path: '/education-loan',
    title: 'Personal loan for education costs: what it is | SwiftLoan.ai',
    description:
      'A personal loan used for fees, books or a laptop. Not a dedicated education loan: EMIs start at once, with no moratorium or subsidy. See who it suits.',
    priority: 0.7,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'पढ़ाई के खर्च के लिए पर्सनल लोन: क्या है, क्या नहीं | SwiftLoan.ai',
        description:
          'फ़ीस, किताबों या लैपटॉप के लिए पर्सनल लोन। यह एजुकेशन लोन नहीं है: EMI तुरंत शुरू होती है, न मोरेटोरियम, न सब्सिडी। देखें यह किसके लिए ठीक है।',
      },
      te: {
        title: 'చదువు ఖర్చుల కోసం పర్సనల్ లోన్: ఏమిటి, ఏది కాదు | SwiftLoan.ai',
        description:
          'ఫీజులు, పుస్తకాలు, ల్యాప్‌టాప్ కోసం పర్సనల్ లోన్. ఇది ఎడ్యుకేషన్ లోన్ కాదు: EMI వెంటనే మొదలవుతుంది, మారటోరియం, సబ్సిడీ ఉండవు.',
      },
    },
  },
  {
    path: '/debt-consolidation-loan',
    title: 'Personal loan for debt consolidation: one EMI | SwiftLoan.ai',
    description:
      'Replace several debts with one personal loan and one EMI. How to check whether consolidation really saves money, when it does not, and an EMI example.',
    priority: 0.7,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'डेट कंसोलिडेशन के लिए पर्सनल लोन: एक EMI | SwiftLoan.ai',
        description:
          'कई कर्ज़ों की जगह एक पर्सनल लोन और एक EMI। कैसे जाँचें कि कंसोलिडेशन से सच में पैसा बचता है, कब नहीं बचता, और EMI का उदाहरण।',
      },
      te: {
        title: 'డెట్ కన్సాలిడేషన్ కోసం పర్సనల్ లోన్: ఒకే EMI | SwiftLoan.ai',
        description:
          'అనేక అప్పుల బదులు ఒకే పర్సనల్ లోన్, ఒకే EMI. కన్సాలిడేషన్ తో నిజంగా డబ్బు ఆదా అవుతుందా, ఎప్పుడు కాదు, EMI ఉదాహరణ.',
      },
    },
  },
];
