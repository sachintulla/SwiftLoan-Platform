// Single switch for the whole voice/Ruby UI — the floating FAB (App.tsx) AND the
// Ruby tab in the bottom nav (Frame.tsx) both read this. Flip to false to hide
// voice everywhere (e.g. Play Store builds while voice is being finalised).
export const SHOW_VOICE_FAB = true;

// An install matched to a website visitor's own link (see utils/resume.ts): start the voice agent by itself on
// first launch, instead of showing the "Okay, continue / Take help from agent" pop-up. The agent greets the person
// as an existing customer, says where they stopped, and asks for their mobile number. If the agent cannot start
// (offline, no microphone), the pop-up's "Okay, continue" behaviour is the fallback. false = always show the pop-up.
export const RESUME_AUTO_AGENT = true;
