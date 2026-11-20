import type { PublicPage } from './seoTypes';

/**
 * Documents and eligibility pages (SEO phase 2, item 2). One entry per page; the body copy is in
 * i18n/docs-pages.ts. Like that copy, titles and descriptions state only facts the site already states.
 */
export const DOCS_PAGES: PublicPage[] = [
  {
    path: '/personal-loan-documents',
    title: 'Documents required for personal loan: checklist | SwiftLoan.ai',
    description:
      'Documents required for a personal loan: PAN, Aadhaar-based eKYC or DigiLocker, and recent bank statements or salary slips. No documents needed to see offers.',
    priority: 0.8,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'पर्सनल लोन के लिए ज़रूरी डॉक्युमेंट्स: चेकलिस्ट | SwiftLoan.ai',
        description:
          'पर्सनल लोन के लिए ज़रूरी डॉक्युमेंट्स: PAN, Aadhaar आधारित eKYC या DigiLocker, और हाल के बैंक स्टेटमेंट या सैलरी स्लिप। ऑफर्स देखने के लिए कोई डॉक्युमेंट नहीं चाहिए।',
      },
      te: {
        title: 'పర్సనల్ లోన్ కి కావాల్సిన డాక్యుమెంట్స్: చెక్‌లిస్ట్ | SwiftLoan.ai',
        description:
          'పర్సనల్ లోన్ కి కావాల్సిన డాక్యుమెంట్స్: PAN, Aadhaar ఆధారిత eKYC లేదా DigiLocker, బ్యాంక్ స్టేట్‌మెంట్స్ లేదా సాలరీ స్లిప్స్. ఆఫర్స్ చూడటానికి డాక్యుమెంట్స్ అవసరం లేదు.',
      },
    },
  },
  {
    path: '/business-loan-documents',
    title: 'Documents required for business loan: checklist | SwiftLoan.ai',
    description:
      'Documents required for a business loan: PAN, GST returns, business bank statements and basic vintage details, with what each shows and how to prepare it.',
    priority: 0.8,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'बिज़नेस लोन के लिए ज़रूरी डॉक्युमेंट्स: चेकलिस्ट | SwiftLoan.ai',
        description:
          'बिज़नेस लोन के लिए ज़रूरी डॉक्युमेंट्स: PAN, GST रिटर्न, बिज़नेस बैंक स्टेटमेंट और बिज़नेस की उम्र की जानकारी। हर डॉक्युमेंट क्या दिखाता है और उसे कैसे तैयार करें।',
      },
      te: {
        title: 'బిజినెస్ లోన్ కి కావాల్సిన డాక్యుమెంట్స్: చెక్‌లిస్ట్ | SwiftLoan.ai',
        description:
          'బిజినెస్ లోన్ కి కావాల్సిన డాక్యుమెంట్స్: PAN, GST రిటర్న్స్, బిజినెస్ బ్యాంక్ స్టేట్‌మెంట్స్, బిజినెస్ వయసు వివరాలు. ప్రతిదీ ఏం చూపిస్తుంది, ఎలా సిద్ధం చేయాలి.',
      },
    },
  },
  {
    path: '/personal-loan-eligibility',
    title: 'Personal loan eligibility: who can apply | SwiftLoan.ai',
    description:
      'Personal loan eligibility: who can apply, what lenders look at, and how to check your matched offers with a soft check that does not affect your score.',
    priority: 0.8,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'पर्सनल लोन पात्रता: कौन आवेदन कर सकता है | SwiftLoan.ai',
        description:
          'पर्सनल लोन पात्रता: कौन आवेदन कर सकता है, लेंडर क्या देखते हैं, और सॉफ्ट चेक से अपने ऑफर्स कैसे जाँचें, क्रेडिट स्कोर पर असर डाले बिना।',
      },
      te: {
        title: 'పర్సనల్ లోన్ అర్హత: ఎవరు అప్లై చేయవచ్చు | SwiftLoan.ai',
        description:
          'పర్సనల్ లోన్ అర్హత: ఎవరు అప్లై చేయవచ్చు, లెండర్స్ ఏం చూస్తారు, క్రెడిట్ స్కోర్ పై ప్రభావం లేని సాఫ్ట్ చెక్ తో మీ ఆఫర్స్ ఎలా చూడాలి.',
      },
    },
  },
  {
    path: '/personal-loan-for-self-employed',
    title: 'Personal loan for self employed: compare offers | SwiftLoan.ai',
    description:
      'Personal loan for self-employed people: bank statements in place of salary slips, how it differs from a business loan, and matched offers with a soft check.',
    priority: 0.8,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'सेल्फ-एम्प्लॉयड के लिए पर्सनल लोन: ऑफर्स कम्पेयर करें | SwiftLoan.ai',
        description:
          'सेल्फ-एम्प्लॉयड के लिए पर्सनल लोन: सैलरी स्लिप की जगह बैंक स्टेटमेंट, बिज़नेस लोन से फ़र्क, और सॉफ्ट चेक के साथ मैच किए गए ऑफर्स।',
      },
      te: {
        title: 'సెల్ఫ్-ఎంప్లాయ్డ్ కోసం పర్సనల్ లోన్: ఆఫర్స్ కంపేర్ చేయండి | SwiftLoan.ai',
        description:
          'సెల్ఫ్-ఎంప్లాయ్డ్ కోసం పర్సనల్ లోన్: సాలరీ స్లిప్స్ బదులు బ్యాంక్ స్టేట్‌మెంట్స్, బిజినెస్ లోన్ తో తేడా, సాఫ్ట్ చెక్ తో మ్యాచ్ అయిన ఆఫర్స్.',
      },
    },
  },
];
