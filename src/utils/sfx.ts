// Multilingual, situational UI sound cues for the assistant.
//
// Cues are pre-generated per language (en/hi/te) and bundled natively — iOS in a
// `Cues` folder reference inside the app bundle, Android in res/raw — so they
// play in both debug and release without Metro. We pick the file for the user's
// current language and a contextually-appropriate cue per situation.
//
// IMPORTANT — these cues run on nitro-sound's OWN audio session (.playback),
// which is SEPARATE from the voice agent's mic/playback session (.playAndRecord
// in VoiceAudioModule). If a cue's session overlaps the voice session, iOS kills
// Ruby's playback AND the mic (observed: "can't hear Ruby / not listening / the
// volume HUD shows"). Two rules keep them apart:
//   1) setVoiceBusy(true) for the whole live session → NO cue plays during a call.
//   2) The connect cue is sequenced: agent.start() runs only AFTER the cue has
//      finished playing (playConnectThen), never overlapping. The stop cue plays
//      only after the session is fully torn down.
import { NativeModules, Platform } from 'react-native';
import { createSound } from 'react-native-nitro-sound';
import { vlog } from '../voice/log';

export type Lang = 'en' | 'hi' | 'te';

// Concept keys — a bundled file exists for each as cue_<key>_<lang>.mp3.
export type Cue =
  | 'uh_huh' | 'ah' | 'oh' | 'well' | 'hey' | 'yo' | 'ha' | 'wow' | 'hurrah'
  | 'yup' | 'absolute' | 'ok' | 'oops' | 'oh_oops' | 'oh_no' | 'so_sorry'
  | 'oh_whats_happening' | 'try_again' | 'lets_try_again' | 'one_more_time'
  | 'no_worries' | 'meet_ruby' | 'let_ruby_help' | 'ask_ruby'
  | 'getting_ready' | 'thanks';

const ANDROID_APP_ID = 'com.swiftloan.ai';
// iOS app bundle path (exposed by the native VoiceAudioModule) → the bundled
// "Cues" folder reference lives at <bundle>/Cues/.
const IOS_BUNDLE_PATH: string | undefined = NativeModules?.VoiceAudioModule?.bundlePath;

let currentLang: Lang = 'en';
/** Set the language used for spoken cues; call when the user's language changes. */
export function setSfxLang(l: string | null | undefined) {
  currentLang = l === 'hi' || l === 'te' ? (l as Lang) : 'en';
}

let enabled = true;
/** Master switch — mute all cues. */
export function setSfxEnabled(on: boolean) {
  enabled = on;
}

// While a live voice session is up (connecting/listening/speaking), UI cues must
// NOT play — see the header note. Suppress every cue for the session's duration.
let voiceBusy = false;
export function setVoiceBusy(on: boolean) {
  voiceBusy = on;
}

// Build the native URI for a base file name (no extension).
function uriForFile(base: string): string | undefined {
  if (Platform.OS === 'android') return `android.resource://${ANDROID_APP_ID}/raw/${base}`;
  if (Platform.OS === 'ios' && IOS_BUNDLE_PATH) return `${IOS_BUNDLE_PATH}/Cues/${base}.mp3`;
  return undefined;
}

// One reusable player per file so overlapping/rapid cues don't clobber each other.
const players: Record<string, ReturnType<typeof createSound>> = {};
function getPlayer(base: string) {
  let p = players[base];
  if (!p) {
    p = createSound();
    players[base] = p;
  }
  return p;
}

function playFile(base: string, volume = 1) {
  if (!enabled || voiceBusy) return;
  try {
    const uri = uriForFile(base);
    if (!uri) return;
    const player = getPlayer(base);
    player
      .stopPlayer()
      .catch(() => undefined)
      .finally(() => {
        player
          .startPlayer(uri)
          .then(() => player.setVolume(volume))
          .catch((err: unknown) => vlog('sfx.play failed', base, Platform.OS, String(err)));
      });
  } catch (err) {
    vlog('sfx error', base, String(err));
  }
}

/** Play a spoken cue in the current language. */
export function playCue(cue: Cue) {
  playFile(`cue_${cue}_${currentLang}`);
}

/** The brand welcome (English; plays on the splash before a language is chosen). */
export function playWelcome() {
  playFile('welcome');
}

// ── Situational, varied selection — the "smart" layer ─────────────────────────
type Ring = { i: number };
function next(arr: Cue[], r: Ring): Cue {
  const v = arr[r.i % arr.length];
  r.i += 1;
  return v;
}
const ARRIVE: Cue[] = ['hey', 'uh_huh', 'ah', 'oh', 'ha']; // FAB docks / arrives
const LEAVE: Cue[] = ['well', 'ok', 'yo']; // FAB floats out
const ERROR: Cue[] = ['oh_no', 'oops', 'so_sorry']; // something failed
const RETRY: Cue[] = ['try_again', 'lets_try_again', 'one_more_time'];
const SUCCESS: Cue[] = ['wow', 'hurrah', 'ha', 'absolute'];
const rings: Record<string, Ring> = {
  arrive: { i: 0 }, leave: { i: 0 }, error: { i: 0 }, retry: { i: 0 }, success: { i: 0 },
};

/** FAB moving: a friendly cue when it arrives (docks), a light one when it leaves. */
export function playFabMove(arriving: boolean) {
  playCue(arriving ? next(ARRIVE, rings.arrive) : next(LEAVE, rings.leave));
}

// Upper bound (ms) per language for the connect line, used only as a safety
// fallback if the playback-finished event never arrives.
const CONNECT_MAX_MS: Record<Lang, number> = { en: 6000, hi: 7000, te: 7500 };

/**
 * Play the connect cue ("Hi, I'm Ruby. I'm connecting now…") and invoke `onEnd`
 * exactly once, when the cue has FINISHED playing — so the voice session starts
 * strictly after the cue's audio session is done, never overlapping it (the
 * overlap is what killed Ruby's playback + mic on iOS). Falls back to a timeout
 * if no finish event arrives, and fires immediately if cues are unavailable.
 */
export function playConnectThen(onEnd: () => void) {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    try { onEnd(); } catch { /* caller handles its own errors */ }
  };
  // Connect/disconnect lines are ALWAYS English, regardless of the app language.
  const CONNECT_BASE = 'cue_getting_ready_en';
  const uri = uriForFile(CONNECT_BASE);
  if (!enabled || voiceBusy || !uri) { fire(); return; }
  try {
    const player = getPlayer(CONNECT_BASE);
    const done = () => {
      try { (player as any).removePlayBackListener?.(); } catch { /* noop */ }
      fire();
    };
    player.stopPlayer().catch(() => undefined).finally(() => {
      const guard = setTimeout(done, CONNECT_MAX_MS.en);
      try {
        (player as any).addPlayBackListener?.((e: any) => {
          const dur = Number(e?.duration) || 0;
          const pos = Number(e?.currentPosition) || 0;
          if (e?.isFinished || (dur > 0 && pos >= dur - 60)) {
            clearTimeout(guard);
            done();
          }
        });
      } catch { /* listener optional */ }
      player
        .startPlayer(uri)
        .then(() => player.setVolume(1))
        .catch((err: unknown) => {
          vlog('sfx.connect play failed', Platform.OS, String(err));
          clearTimeout(guard);
          done();
        });
    });
  } catch (err) {
    vlog('sfx.connect error', String(err));
    fire();
  }
}

/** FAB tapped OFF → "thank you" (always English). Call only after the session is fully stopped. */
export function playFabOff() {
  playFile('cue_thanks_en');
}
/** Something went wrong (offer error, failure, …). */
export function playError() {
  playCue(next(ERROR, rings.error));
}
/** Nudge to retry. */
export function playRetry() {
  playCue(next(RETRY, rings.retry));
}
/** Celebrate a success (offers found, approved, disbursed). */
export function playSuccess() {
  playCue(next(SUCCESS, rings.success));
}
