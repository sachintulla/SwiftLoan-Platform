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
import { Image, Platform } from 'react-native';
import { createSound } from 'react-native-nitro-sound';
import { vlog } from '../voice/log';

export type SfxName = 'dock' | 'undock' | 'tap' | 'intro' | 'welcome';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SOURCES: Record<SfxName, number> = {
  dock: require('../../assets/sfx/fab_dock.mp3'),
  undock: require('../../assets/sfx/fab_undock.mp3'),
  tap: require('../../assets/sfx/fab_tap.mp3'),
  intro: require('../../assets/sfx/intro.mp3'),
  // Spoken brand welcome ("Welcome to SwiftLoan") with a soft chime lead-in.
  welcome: require('../../assets/sfx/welcome.mp3'),
};

// Relative volume per effect (0…1). The morph whooshes sit low so they read as
// a subtle accent, not an alert; the tap is barely-there; the intro brand chime
// is the one moment we let it be a touch fuller.
const VOLUME: Record<SfxName, number> = {
  dock: 0.55,
  undock: 0.5,
  tap: 0.35,
  intro: 0.8,
  welcome: 1.0,
};

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
