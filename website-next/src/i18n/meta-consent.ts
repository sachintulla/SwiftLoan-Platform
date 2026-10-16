import { defineCopy } from "@/lib/i18n";

/**
 * Copy for the ad-measurement consent banner (Meta Pixel). The wording promises only what
 * the code does: three funnel moments, no personal or loan details, off unless accepted.
 * Brand/technical terms stay in Latin script.
 */
export const metaConsentCopy = defineCopy({
  en: {
    title: "Help us measure our ads",
    body: "With your OK, SwiftLoan shares anonymous visit and sign-up signals with Meta (Facebook) so we can tell which ads work. We never share your PAN, income, loan or contact details.",
    accept: "Allow",
    decline: "No thanks",
    more: "Privacy policy",
    label: "Advertising measurement choice",
  },
  hi: {
    title: "हमारे विज्ञापनों को मापने में मदद करें",
    body: "आपकी अनुमति से, SwiftLoan कौन से विज्ञापन काम करते हैं यह जानने के लिए Meta (Facebook) के साथ अनाम विज़िट और साइन-अप संकेत साझा करता है। हम आपका PAN, आय, लोन या संपर्क विवरण कभी साझा नहीं करते।",
    accept: "अनुमति दें",
    decline: "नहीं, धन्यवाद",
    more: "गोपनीयता नीति",
    label: "विज्ञापन मापन का विकल्प",
  },
  te: {
    title: "మా ప్రకటనలను కొలవడానికి సహాయం చేయండి",
    body: "మీ అనుమతితో, ఏ ప్రకటనలు పనిచేస్తున్నాయో తెలుసుకోవడానికి SwiftLoan అనామక సందర్శన మరియు సైన్-అప్ సంకేతాలను Meta (Facebook)తో పంచుకుంటుంది. మీ PAN, ఆదాయం, లోన్ లేదా సంప్రదింపు వివరాలను మేము ఎప్పుడూ పంచుకోము.",
    accept: "అనుమతించు",
    decline: "వద్దు",
    more: "గోప్యతా విధానం",
    label: "ప్రకటనల కొలత ఎంపిక",
  },
});
