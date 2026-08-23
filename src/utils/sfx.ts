// Multilingual, situational UI sound cues for the assistant.
//
// Cues are pre-generated per language (en/hi/te) and bundled natively — iOS in a
// `Cues` folder reference inside the app bundle, Android in res/raw — so they
// play in both debug and release without Metro. We select the file for the
// user's current language at play time and pick a contextually-appropriate,
// varied cue per situation (the "smart" layer).
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

// Build the native URI for a base file name (no extension).
function uriForFile(base: string): string | undefined {
  if (Platform.OS === 'android') return `android.resource://${ANDROID_APP_ID}/raw/${base}`;
  if (Platform.OS === 'ios' && IOS_BUNDLE_PATH) return `${IOS_BUNDLE_PATH}/Cues/${base}.mp3`;
  return undefined;
}

// One reusable player per file so overlapping/rapid cues don't clobber each other.
const players: Record<string, ReturnType<typeof createSound>> = {};
function playFile(base: string, volume = 1) {
  if (!enabled) return;
  try {
    const uri = uriForFile(base);
    if (!uri) return;
    let p = players[base];
    if (!p) {
      p = createSound();
      players[base] = p;
    }
    const player = p;
    player
      .stopPlayer()
      .catch(() => undefined)
      .finally(() => {
        player
          .startPlayer(uri)
          .then(() => player.setVolume(volume))
          .catch(err => vlog('sfx.play failed', base, Platform.OS, String(err)));
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
// Approx durations (ms) of the connect line per language, so the caller can wait
// for it to finish before starting the mic session (nitro's playback session and
// the mic's playAndRecord session must not overlap, or the mic gets cut).
const CONNECT_MS: Record<Lang, number> = { en: 4500, hi: 5550, te: 6150 };
/** How long the current-language connect line runs, plus a small margin. */
export function connectCueDurationMs(): number {
  return CONNECT_MS[currentLang] + 350;
}

/** FAB tapped ON → connecting the assistant ("Hi, I'm Ruby. I'm connecting now…"). */
export function playFabConnect() {
  playCue('getting_ready');
}
/** FAB tapped OFF → "thank you". */
export function playFabOff() {
  playCue('thanks');
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
