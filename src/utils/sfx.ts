// Lightweight UI sound-effects helper.
//
// Plays short, bundled sound effects for the FAB/tab-bar morph. Built on
// react-native-nitro-sound (New-Architecture native audio) — we use a separate
// `createSound()` instance per effect so effects can overlap and never clobber
// each other (or the voice player). Every call is fire-and-forget and fully
// swallowed on error: SFX must never block the UI or crash a transition.
//
// Assets are `require()`d so Metro bundles them. In debug they're served over
// Metro's HTTP asset server (nitro-sound plays that URL directly); the release
// bundling path is handled at build time.
import { Image, NativeModules, Platform } from 'react-native';
import { createSound } from 'react-native-nitro-sound';
import { vlog } from '../voice/log';

export type SfxName =
  | 'dock' | 'undock' | 'tap' | 'intro' | 'welcome'
  // Spoken female (Tara) voice cues for the assistant FAB.
  | 'here' | 'back' | 'connecting' | 'bye'
  // Short natural vocalizations for the FAB moving around.
  | 'mmhmm' | 'aha' | 'oh' | 'oof' | 'hup' | 'phew';

// Debug fallback: Metro serves these require()'d assets over HTTP. In release
// builds Metro is gone, so we play the natively-bundled copies instead (Android
// res/raw, iOS app bundle) — see FILES + uriFor below.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SOURCES: Record<SfxName, number> = {
  dock: require('../../assets/sfx/fab_dock.mp3'),
  undock: require('../../assets/sfx/fab_undock.mp3'),
  tap: require('../../assets/sfx/fab_tap.mp3'),
  intro: require('../../assets/sfx/intro.mp3'),
  // Spoken brand welcome ("Welcome to SwiftLoan") with a soft chime lead-in.
  welcome: require('../../assets/sfx/welcome.mp3'),
  here: require('../../assets/sfx/fab_here.mp3'),
  back: require('../../assets/sfx/fab_back.mp3'),
  connecting: require('../../assets/sfx/fab_connecting.mp3'),
  bye: require('../../assets/sfx/fab_bye.mp3'),
  mmhmm: require('../../assets/sfx/voc_mmhmm.mp3'),
  aha: require('../../assets/sfx/voc_aha.mp3'),
  oh: require('../../assets/sfx/voc_oh.mp3'),
  oof: require('../../assets/sfx/voc_oof.mp3'),
  hup: require('../../assets/sfx/voc_hup.mp3'),
  phew: require('../../assets/sfx/voc_phew.mp3'),
};

// Native resource base names (Android res/raw name; iOS bundled file stem).
const FILES: Record<SfxName, string> = {
  dock: 'fab_dock',
  undock: 'fab_undock',
  tap: 'fab_tap',
  intro: 'intro',
  welcome: 'welcome',
  here: 'fab_here',
  back: 'fab_back',
  connecting: 'fab_connecting',
  bye: 'fab_bye',
  mmhmm: 'voc_mmhmm',
  aha: 'voc_aha',
  oh: 'voc_oh',
  oof: 'voc_oof',
  hup: 'voc_hup',
  phew: 'voc_phew',
};

const ANDROID_APP_ID = 'com.swiftloan.ai';
// iOS app bundle path, exposed by the native VoiceAudioModule.
const IOS_BUNDLE_PATH: string | undefined = NativeModules?.VoiceAudioModule?.bundlePath;

// Relative volume per effect (0…1). The morph whooshes sit low so they read as
// a subtle accent, not an alert; the tap is barely-there; the intro brand chime
// is the one moment we let it be a touch fuller.
const VOLUME: Record<SfxName, number> = {
  dock: 0.55,
  undock: 0.5,
  tap: 0.35,
  intro: 0.8,
  welcome: 1.0,
  here: 1.0,
  back: 1.0,
  connecting: 1.0,
  bye: 1.0,
  mmhmm: 0.9,
  aha: 0.9,
  oh: 0.9,
  oof: 0.9,
  hup: 0.9,
  phew: 0.9,
};

// Short vocalizations for the FAB moving — a positive one when it arrives
// (docks) and an "effort" one when it leaves (undocks). Rotated for variety.
const VOC_ARRIVE: SfxName[] = ['mmhmm', 'aha', 'oh'];
const VOC_LEAVE: SfxName[] = ['oof', 'hup', 'phew'];
let vocArriveIdx = 0;
let vocLeaveIdx = 0;
/** Play a short, varied vocalization for the FAB moving (dock=true → arriving). */
export function playMoveVocalization(arriving: boolean) {
  if (arriving) {
    playSfx(VOC_ARRIVE[vocArriveIdx % VOC_ARRIVE.length]);
    vocArriveIdx += 1;
  } else {
    playSfx(VOC_LEAVE[vocLeaveIdx % VOC_LEAVE.length]);
    vocLeaveIdx += 1;
  }
}

let enabled = true;
/** Master switch — call once (e.g. from a settings toggle) to mute all SFX. */
export function setSfxEnabled(on: boolean) {
  enabled = on;
}

// One reusable player per effect, created lazily on first use.
type Player = ReturnType<typeof createSound>;
const players: Partial<Record<SfxName, Player>> = {};

function uriFor(name: SfxName): string | undefined {
  try {
    // Prefer the natively-bundled copy so it works in release (no Metro).
    if (Platform.OS === 'android') {
      return `android.resource://${ANDROID_APP_ID}/raw/${FILES[name]}`;
    }
    if (Platform.OS === 'ios' && IOS_BUNDLE_PATH) {
      return `${IOS_BUNDLE_PATH}/${FILES[name]}.mp3`;
    }
    // Fallback (e.g. iOS without the native constant): Metro-served asset (debug).
    const src = Image.resolveAssetSource(SOURCES[name]);
    return src?.uri;
  } catch {
    return undefined;
  }
}

/**
 * Play a UI sound effect. Fire-and-forget: returns immediately and never
 * throws — any failure (asset missing, native module absent in a non-rebuilt
 * binary, audio session busy) is logged and ignored.
 */
export function playSfx(name: SfxName): void {
  if (!enabled) return;
  try {
    const uri = uriFor(name);
    if (!uri) return;
    let p = players[name];
    if (!p) {
      p = createSound();
      players[name] = p;
    }
    const player = p;
    // Restart from the top if it's already mid-play (rapid re-trigger).
    player
      .stopPlayer()
      .catch(() => undefined)
      .finally(() => {
        player
          .startPlayer(uri)
          .then(() => player.setVolume(VOLUME[name]))
          .catch(err => vlog('sfx.play failed', name, Platform.OS, String(err)));
      });
  } catch (err) {
    vlog('sfx error', name, String(err));
  }
}
