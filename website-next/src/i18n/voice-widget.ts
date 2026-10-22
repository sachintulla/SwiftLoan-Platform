import type { Lang } from '@/lib/i18n';

/** Text of the floating voice launcher (built outside React, so it can't use useCopy). */
export interface VoiceWidgetCopy {
  talk: string;
  assistant: string;
  connecting: string;
  listening: string;
  speaking: string;
  working: string;
  launcherAria: string;
  inCallAria: string;
  talkAria: string;
  callControls: string;
  hideControls: string;
  showControls: string;
  mute: string;
  unmute: string;
  endCall: string;
}

export const voiceWidgetCopy: Record<Lang, VoiceWidgetCopy> = {
  en: {
    talk: 'Talk to Ruby',
    assistant: 'SwiftLoan assistant',
    connecting: 'Connecting…',
    listening: 'Listening…',
    speaking: 'Speaking…',
    working: 'Working on it…',
    launcherAria: 'Talk to SwiftLoan — voice guide',
    inCallAria: 'In a call with SwiftLoan — click to end',
    talkAria: 'Talk to Ruby, the SwiftLoan assistant',
    callControls: 'Call controls',
    hideControls: 'Hide call controls',
    showControls: 'Show call controls',
    mute: 'Mute microphone',
    unmute: 'Unmute microphone',
    endCall: 'End call',
  },
  hi: {
    talk: 'रूबी से बात करें',
    assistant: 'SwiftLoan असिस्टेंट',
    connecting: 'कनेक्ट हो रहा है…',
    listening: 'सुन रही हूँ…',
    speaking: 'बोल रही हूँ…',
    working: 'काम हो रहा है…',
    launcherAria: 'SwiftLoan से बात करें — वॉइस गाइड',
    inCallAria: 'SwiftLoan के साथ कॉल जारी है — समाप्त करने के लिए क्लिक करें',
    talkAria: 'रूबी, SwiftLoan असिस्टेंट से बात करें',
    callControls: 'कॉल नियंत्रण',
    hideControls: 'कॉल नियंत्रण छिपाएँ',
    showControls: 'कॉल नियंत्रण दिखाएँ',
    mute: 'माइक म्यूट करें',
    unmute: 'माइक अनम्यूट करें',
    endCall: 'कॉल समाप्त करें',
  },
  te: {
    talk: 'రూబీతో మాట్లాడండి',
    assistant: 'SwiftLoan అసిస్టెంట్',
    connecting: 'కనెక్ట్ అవుతోంది…',
    listening: 'వింటున్నాను…',
    speaking: 'మాట్లాడుతున్నాను…',
    working: 'పని జరుగుతోంది…',
    launcherAria: 'SwiftLoan తో మాట్లాడండి — వాయిస్ గైడ్',
    inCallAria: 'SwiftLoan తో కాల్‌లో ఉన్నారు — ముగించడానికి క్లిక్ చేయండి',
    talkAria: 'రూబీ, SwiftLoan అసిస్టెంట్‌తో మాట్లాడండి',
    callControls: 'కాల్ నియంత్రణలు',
    hideControls: 'కాల్ నియంత్రణలను దాచండి',
    showControls: 'కాల్ నియంత్రణలను చూపండి',
    mute: 'మైక్ మ్యూట్ చేయండి',
    unmute: 'మైక్ అన్‌మ్యూట్ చేయండి',
    endCall: 'కాల్ ముగించండి',
  },
};
