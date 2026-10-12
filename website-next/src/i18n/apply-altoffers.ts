import { defineCopy } from '@/lib/i18n';

/**
 * Alternative-offers (partner lender) tile, the "did you proceed?" question and
 * the My Applications row. Same SwiftLoan-branded wording as the mobile app
 * (src/i18n/strings.ts altOffers*) — no partner names. Brand/technical terms stay in Latin script.
 */
export const altOffersCopy = defineCopy({
  en: {
    getMoreOffers: 'Get more offers',
    redirecting: 'Taking you to our partner…',
    tileTitle: 'More offers',
    tileSub: 'Explore more lender offers picked for you',
    emptyTitle: 'Other offers',
    emptySub: 'No matches here right now — explore alternative lender offers',
    cta: 'View',
    openFailed: "Couldn't open partner offers. Please try again.",
    // after coming back from the partner's page
    confirmTitle: 'Did you proceed with an offer?',
    confirmBody:
      "If you chose an offer on our partner's page, we'll add it to My Applications so you can track it.",
    confirmYes: 'Yes, I proceeded',
    confirmNo: 'Not yet',
    added: 'Added to My Applications — track it there.',
    // My Applications row
    rowTitle: 'Additional lenders',
    rowLabel: 'Alternative offers',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    statusInProgress: 'In progress',
    reopen: 'Open partner offers',
    // /partner/return
    returnTitle: 'Welcome back',
    returnBody: 'Did you proceed with an offer on our partner’s page?',
    returnYes: 'Yes, add it to My Applications',
    returnNo: 'No, back to my offers',
    returnGo: 'Go to My Applications',
  },
  hi: {
    getMoreOffers: 'और ऑफ़र पाएँ',
    redirecting: 'आपको हमारे पार्टनर के पास ले जा रहे हैं…',
    tileTitle: 'और ऑफ़र',
    tileSub: 'आपके लिए चुने गए और लेंडर ऑफ़र देखें',
    emptyTitle: 'अन्य ऑफ़र',
    emptySub: 'अभी यहाँ कोई मैच नहीं — वैकल्पिक लेंडर ऑफ़र देखें',
    cta: 'देखें',
    openFailed: 'पार्टनर ऑफ़र नहीं खुल सके। कृपया फिर से कोशिश करें।',
    confirmTitle: 'क्या आपने किसी ऑफ़र पर आगे बढ़ना चुना?',
    confirmBody:
      'अगर आपने हमारे पार्टनर के पेज पर कोई ऑफ़र चुना है, तो हम उसे मेरे आवेदनों में जोड़ देंगे ताकि आप उसे ट्रैक कर सकें।',
    confirmYes: 'हाँ, मैं आगे बढ़ा',
    confirmNo: 'अभी नहीं',
    added: 'मेरे आवेदनों में जोड़ा गया — वहाँ ट्रैक करें।',
    rowTitle: 'अतिरिक्त लेंडर',
    rowLabel: 'वैकल्पिक ऑफ़र',
    statusApproved: 'स्वीकृत',
    statusRejected: 'अस्वीकृत',
    statusInProgress: 'प्रगति में',
    reopen: 'पार्टनर ऑफ़र खोलें',
    returnTitle: 'वापसी पर स्वागत है',
    returnBody: 'क्या आपने हमारे पार्टनर के पेज पर किसी ऑफ़र पर आगे बढ़ना चुना?',
    returnYes: 'हाँ, इसे मेरे आवेदनों में जोड़ें',
    returnNo: 'नहीं, मेरे ऑफ़र पर वापस जाएँ',
    returnGo: 'मेरे आवेदनों पर जाएँ',
  },
  te: {
    getMoreOffers: 'మరిన్ని ఆఫర్లు పొందండి',
    redirecting: 'మిమ్మల్ని మా పార్టనర్ వద్దకు తీసుకెళ్తున్నాం…',
    tileTitle: 'మరిన్ని ఆఫర్లు',
    tileSub: 'మీ కోసం ఎంచుకున్న మరిన్ని లెండర్ ఆఫర్లను చూడండి',
    emptyTitle: 'ఇతర ఆఫర్లు',
    emptySub: 'ప్రస్తుతం ఇక్కడ మ్యాచ్‌లు లేవు — ప్రత్యామ్నాయ లెండర్ ఆఫర్లను చూడండి',
    cta: 'చూడండి',
    openFailed: 'పార్టనర్ ఆఫర్లను తెరవలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.',
    confirmTitle: 'మీరు ఏదైనా ఆఫర్‌తో ముందుకు వెళ్లారా?',
    confirmBody:
      'మా పార్టనర్ పేజీలో మీరు ఆఫర్‌ను ఎంచుకుంటే, దాన్ని ట్రాక్ చేయడానికి నా దరఖాస్తులలో చేరుస్తాం.',
    confirmYes: 'అవును, ముందుకు వెళ్లాను',
    confirmNo: 'ఇంకా లేదు',
    added: 'నా దరఖాస్తులలో చేర్చాం — అక్కడ ట్రాక్ చేయండి.',
    rowTitle: 'అదనపు లెండర్లు',
    rowLabel: 'ప్రత్యామ్నాయ ఆఫర్లు',
    statusApproved: 'ఆమోదించబడింది',
    statusRejected: 'తిరస్కరించబడింది',
    statusInProgress: 'ప్రగతిలో ఉంది',
    reopen: 'పార్టనర్ ఆఫర్లను తెరవండి',
    returnTitle: 'తిరిగి స్వాగతం',
    returnBody: 'మా పార్టనర్ పేజీలో మీరు ఏదైనా ఆఫర్‌తో ముందుకు వెళ్లారా?',
    returnYes: 'అవును, దీన్ని నా దరఖాస్తులలో చేర్చండి',
    returnNo: 'లేదు, నా ఆఫర్లకు తిరిగి వెళ్లండి',
    returnGo: 'నా దరఖాస్తులకు వెళ్లండి',
  },
});
