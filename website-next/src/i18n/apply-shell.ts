import { defineCopy } from "@/lib/i18n";

/**
 * Copy for the shared /apply + /account chrome: the brand-pitch rail, the
 * stepper, the account sidebar / logout modal, the PAN-verifying loader and
 * the default labels of the shared primitives. Page-specific strings (passed
 * in as props such as `backLabel` / `stepLabel`) live with the page owners.
 */
export const applyShellCopy = defineCopy({
  en: {
    // ApplyShell brand rail
    brandHeading: "Smarter borrowing starts here",
    brandBody:
      "We compare offers from 12+ RBI-registered lending partners to find your best rate — no paperwork, no branch visits.",
    brandPoints: [
      "Bank-grade 256-bit encryption on every step",
      "100% digital — no physical paperwork",
      "Most applicants get offers in under 5 minutes",
    ],
    brandPill: "Trusted by 50,000+ borrowers across India",
    back: "Back",
    stepper: ["PAN & consent", "Basics", "More details"],

    // Account rail / mobile top bar
    navApplications: "My Applications",
    navOffers: "My Offers",
    navProfile: "Profile",
    navSupport: "Support",
    logOut: "Log out",
    guestName: "there",
    closeMenu: "Close menu",
    openMenu: "Open menu",
    logoutTitle: "Log out?",
    logoutBody: "You'll need to verify your mobile number again to sign back in.",
    cancel: "Cancel",
    loggingOut: "Logging out…",

    // Shared primitives
    ok: "OK",
    pleaseWait: "Please wait…",

    // useApplyToOffer
    applyFailed: "Could not apply to this offer. Please try again.",

    // PanVerifyingLoader
    panSteps: [
      { label: "Reading your PAN", hint: "Checking the number format" },
      { label: "Verifying your identity", hint: "Matching against PAN records" },
      { label: "Fetching your details", hint: "Preparing your application" },
    ],
    panAriaLabel: "Verifying your PAN",
    panVerified: "PAN verified",
    panVerifying: "Verifying your PAN",
    panTakingYou: "Taking you to your details…",
    panStillWorking: "Still working on it — almost there",
    panHangTight: "Hang tight — this usually takes a few seconds",
    panDone: "Done",
    panSafeTitle: "Your data is safe with us",
    panSafeBody: "Encrypted end to end · never shared without your consent",
  },
  hi: {
    brandHeading: "समझदारी से लोन लेने की शुरुआत यहीं से",
    brandBody:
      "हम 12+ RBI-रजिस्टर्ड लेंडिंग पार्टनर्स के ऑफ़र की तुलना करके आपके लिए सबसे अच्छी दर ढूंढते हैं — न कागज़ी कार्रवाई, न ब्रांच के चक्कर।",
    brandPoints: [
      "हर चरण पर बैंक-ग्रेड 256-बिट एन्क्रिप्शन",
      "100% डिजिटल — कोई कागज़ी कार्रवाई नहीं",
      "ज़्यादातर आवेदकों को 5 मिनट से कम में ऑफ़र मिल जाते हैं",
    ],
    brandPill: "पूरे भारत में 50,000+ उधारकर्ताओं का भरोसा",
    back: "वापस",
    stepper: ["PAN और सहमति", "बुनियादी जानकारी", "अधिक विवरण"],

    navApplications: "मेरे आवेदन",
    navOffers: "मेरे ऑफ़र",
    navProfile: "प्रोफ़ाइल",
    navSupport: "सपोर्ट",
    logOut: "लॉग आउट",
    guestName: "अतिथि",
    closeMenu: "मेन्यू बंद करें",
    openMenu: "मेन्यू खोलें",
    logoutTitle: "लॉग आउट करें?",
    logoutBody: "दोबारा साइन इन करने के लिए आपको अपना मोबाइल नंबर फिर से वेरिफ़ाई करना होगा।",
    cancel: "रद्द करें",
    loggingOut: "लॉग आउट हो रहा है…",

    ok: "ठीक है",
    pleaseWait: "कृपया प्रतीक्षा करें…",

    applyFailed: "इस ऑफ़र के लिए आवेदन नहीं हो सका। कृपया फिर से प्रयास करें।",

    panSteps: [
      { label: "आपका PAN पढ़ा जा रहा है", hint: "नंबर का फ़ॉर्मेट जांचा जा रहा है" },
      { label: "आपकी पहचान सत्यापित की जा रही है", hint: "PAN रिकॉर्ड से मिलान किया जा रहा है" },
      { label: "आपका विवरण लाया जा रहा है", hint: "आपका आवेदन तैयार किया जा रहा है" },
    ],
    panAriaLabel: "आपका PAN सत्यापित किया जा रहा है",
    panVerified: "PAN सत्यापित हो गया",
    panVerifying: "आपका PAN सत्यापित किया जा रहा है",
    panTakingYou: "आपको आपके विवरण पर ले जा रहे हैं…",
    panStillWorking: "अभी प्रक्रिया जारी है — बस थोड़ा और",
    panHangTight: "कृपया रुकें — इसमें आमतौर पर कुछ सेकंड लगते हैं",
    panDone: "पूरा हुआ",
    panSafeTitle: "आपका डेटा हमारे पास सुरक्षित है",
    panSafeBody: "एंड-टू-एंड एन्क्रिप्टेड · आपकी सहमति के बिना कभी साझा नहीं किया जाता",
  },
  te: {
    brandHeading: "తెలివైన రుణం ఇక్కడ నుండే మొదలవుతుంది",
    brandBody:
      "మీకు ఉత్తమ రేటు అందించడానికి మేము 12+ RBI-రిజిస్టర్డ్ లెండింగ్ భాగస్వాముల ఆఫర్లను పోల్చుతాము — పేపర్‌వర్క్ లేదు, బ్రాంచ్‌కు వెళ్లాల్సిన అవసరం లేదు.",
    brandPoints: [
      "ప్రతి దశలో బ్యాంక్-గ్రేడ్ 256-బిట్ ఎన్‌క్రిప్షన్",
      "100% డిజిటల్ — భౌతిక పేపర్‌వర్క్ లేదు",
      "చాలా మంది దరఖాస్తుదారులకు 5 నిమిషాల్లోపే ఆఫర్లు లభిస్తాయి",
    ],
    brandPill: "భారతదేశమంతటా 50,000+ రుణగ్రహీతల నమ్మకం",
    back: "వెనుకకు",
    stepper: ["PAN & అంగీకారం", "ప్రాథమిక వివరాలు", "మరిన్ని వివరాలు"],

    navApplications: "నా దరఖాస్తులు",
    navOffers: "నా ఆఫర్లు",
    navProfile: "ప్రొఫైల్",
    navSupport: "సపోర్ట్",
    logOut: "లాగ్ అవుట్",
    guestName: "అతిథి",
    closeMenu: "మెనూ మూసివేయండి",
    openMenu: "మెనూ తెరవండి",
    logoutTitle: "లాగ్ అవుట్ చేయాలా?",
    logoutBody: "మళ్లీ సైన్ ఇన్ చేయడానికి మీరు మీ మొబైల్ నంబర్‌ను మళ్లీ ధృవీకరించాల్సి ఉంటుంది.",
    cancel: "రద్దు చేయండి",
    loggingOut: "లాగ్ అవుట్ అవుతోంది…",

    ok: "సరే",
    pleaseWait: "దయచేసి వేచి ఉండండి…",

    applyFailed: "ఈ ఆఫర్‌కు దరఖాస్తు చేయడం సాధ్యం కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.",

    panSteps: [
      { label: "మీ PAN చదువుతున్నాము", hint: "నంబర్ ఫార్మాట్‌ను తనిఖీ చేస్తున్నాము" },
      { label: "మీ గుర్తింపును ధృవీకరిస్తున్నాము", hint: "PAN రికార్డులతో సరిపోల్చుతున్నాము" },
      { label: "మీ వివరాలను తెస్తున్నాము", hint: "మీ దరఖాస్తును సిద్ధం చేస్తున్నాము" },
    ],
    panAriaLabel: "మీ PAN ధృవీకరిస్తున్నాము",
    panVerified: "PAN ధృవీకరించబడింది",
    panVerifying: "మీ PAN ధృవీకరిస్తున్నాము",
    panTakingYou: "మిమ్మల్ని మీ వివరాల పేజీకి తీసుకువెళ్తున్నాము…",
    panStillWorking: "ఇంకా పని జరుగుతోంది — దాదాపు పూర్తయింది",
    panHangTight: "దయచేసి వేచి ఉండండి — దీనికి సాధారణంగా కొన్ని సెకన్లు పడుతుంది",
    panDone: "పూర్తయింది",
    panSafeTitle: "మీ డేటా మా వద్ద సురక్షితంగా ఉంది",
    panSafeBody: "ఎండ్-టు-ఎండ్ ఎన్‌క్రిప్ట్ చేయబడింది · మీ అనుమతి లేకుండా ఎప్పుడూ షేర్ చేయబడదు",
  },
});
