import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, PanResponder, Platform, Pressable, StyleSheet, Text, Vibration, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { activateKeepAwake, deactivateKeepAwake } from '@sayem314/react-native-keep-awake';
import Icon from '../../components/Icon';
import { colors, font, navGradient } from '../../theme/tokens';
import { useStore, useT, SCREENS_WITH_FOOTER_CTA } from '../../state/store';
import { loadVoiceFabSide, saveVoiceFabSide, markIntroPitchHeard } from '../../state/session';
import { agent } from '../index';

// Keep-awake is an OPTIONAL native module (@sayem314/react-native-keep-awake)
// that stops the screen sleeping mid-call. It may be absent from a given binary
// (e.g. an older build whose pods predate it, or a stripped build) — in which
// case referencing it throws a TurboModule "could not be found" error. Load it
// lazily and swallow that, so activating the voice agent never crashes over a
// non-critical feature; the call just runs without the stay-awake guarantee.
function keepAwake(on: boolean) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ka = require('@sayem314/react-native-keep-awake');
    if (on) ka.activateKeepAwake?.();
    else ka.deactivateKeepAwake?.();
  } catch {
    /* native module not in this binary — skip keep-awake */
  }
}
import { ELLO_CONFIGURED } from '../config';
import { vlog } from '../log';
import { nudgeRotateMs, snoozeNudges } from '../nudges';
import type { AgentStatus } from '../types';

// Deliberately more than a typical FAB margin: anything much closer to the
// bezel sits inside Android's edge back-gesture zone (MIUI/Xiaomi devices
// extend this further than stock Android), so a drag starting there gets
// hijacked by the OS "swipe from edge = go back" gesture before this
// component's PanResponder ever sees the touch — the button then looks
// "stuck" when dragging away from whichever edge it's docked to.
const EDGE_MARGIN = 32;

// Screens that render <BottomNav> (grep `bottomNav` across src/screens) — the
// FAB needs extra clearance only on these; everywhere else it should sit
// close to the bottom edge like a normal FAB, not float above empty space.
const SCREENS_WITH_BOTTOM_NAV = new Set(['fare', 'help', 'home', 'loans', 'profile']);

// Plays the FAB's grand entrance only once per app session (survives navigation;
// resets on a full JS reload).
let fabEntrancePlayed = false;

// The button itself is always the same brand gradient — only the bars (and
// the fast ripple while active) change color, so the circle reads as one
// consistent "this is the assistant" affordance rather than something that
// looks different every time you glance at it.
const FAB_GRADIENT: [string, string] = [colors.primary, '#0CB6A6'];

// Listening (the user's turn) and speaking (the agent's turn) are deliberately
// different hues — mint vs. blue — not just shades of one color, since that's
// the one distinction that matters most to see at a glance.
// Listening intentionally stays white rather than mint — mint against this
// button's teal gradient is two close shades of green, too low-contrast to
// read clearly. White reads clearly against any state; speaking's blue still
// carries the real listening-vs-speaking distinction.
const STATE_ACCENT: Record<AgentStatus, string> = {
  idle: '#fff',
  connecting: colors.amber,
  listening: '#fff',
  speaking: colors.blue,
  executingTool: colors.amber,
  ended: '#fff',
};

/**
 * Idle-state icon: a small animated robot head, replacing the static mic
 * glyph. `phase` drives both the head sway and the antenna sway off one
 * shared 2.4s loop (they're just different curves over the same value) —
 * the tip pulse and the blink run on their own independent, shorter loops.
 */
function RobotHead() {
  const phase = useRef(new Animated.Value(0)).current;
  const tip = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const headLoop = Animated.loop(
      Animated.timing(phase, { toValue: 4, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    );
    const tipLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(tip, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(tip, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 2992, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 136, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0, duration: 272, useNativeDriver: true }),
      ]),
    );
    headLoop.start();
    tipLoop.start();
    blinkLoop.start();
    return () => {
      headLoop.stop();
      tipLoop.stop();
      blinkLoop.stop();
      phase.setValue(0);
      tip.setValue(0);
      blink.setValue(0);
    };
  }, [phase, tip, blink]);

  const rotate = phase.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: ['0deg', '-6deg', '0deg', '6deg', '0deg'] });
  const translateY = phase.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: [0, -1, -3, -1, 0] });
  const antennaRotate = phase.interpolate({ inputRange: [0, 2, 4], outputRange: ['-8deg', '8deg', '-8deg'] });
  const tipOpacity = tip.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });
  const eyeScaleY = blink.interpolate({ inputRange: [0, 1], outputRange: [1, 0.15] });

  return (
    <Animated.View style={{ width: ROBOT_HEAD_W, height: ROBOT_HEAD_H, transform: [{ rotate }, { translateY }] }}>
      <Animated.View style={[styles.robotAntennaStem, { transform: [{ rotate: antennaRotate }] }]} />
      <Animated.View style={[styles.robotAntennaTip, { opacity: tipOpacity }]} />
      <View style={styles.robotFace}>
        <Animated.View style={[styles.robotEye, { transform: [{ scaleY: eyeScaleY }] }]} />
        <Animated.View style={[styles.robotEye, { transform: [{ scaleY: eyeScaleY }] }]} />
      </View>
    </Animated.View>
  );
}

/**
 * Soft green glow behind the FAB while a call is live — gives the sonar rings
 * (SonarRings) something to radiate from. Gently pulses (a touch stronger while
 * speaking). The old weaving "liquid ring" was removed in favour of the cleaner
 * sonar ripple that matches the reference.
 */
function SiriGlow({ status, scale }: { status: AgentStatus; scale: Animated.AnimatedInterpolation<number> | Animated.Value }) {
  const live = status !== 'idle' && status !== 'ended';
  const tool = status === 'executingTool';
  const show = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(show, { toValue: live ? 1 : 0, duration: live ? 380 : 280, useNativeDriver: true }).start();
  }, [live, show]);

  useEffect(() => {
    if (!live) { beat.stopAnimation(() => beat.setValue(0)); return undefined; }
    const d = status === 'speaking' ? 520 : 1300; // breathes faster while talking
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, status, beat]);

  if (!live) return null;
  const blobScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + (status === 'speaking' ? 0.1 : 0.04)] });

  return (
    <Animated.View pointerEvents="none" style={[styles.glowWrap, { opacity: show, transform: [{ scale }] }]}>
      <Animated.View style={[styles.glowBlob, { shadowColor: tool ? '#F4B45C' : colors.primary, transform: [{ scale: blobScale }] }]} />
    </Animated.View>
  );
}

/**
 * Sonar rings — concentric teal rings that expand outward from the avatar and fade,
 * like the reference. Only while a call is live. The spread differs by turn:
 *   speaking  → rings travel FAR and fast (Ruby is talking)
 *   listening → rings stay CLOSE and gentle (less spread, waiting on the user)
 * Native-driven (scale + opacity), staggered so it reads as a continuous ripple.
 */
const SONAR_COUNT = 3;
function SonarRings({ status, scale, isTab }: { status: AgentStatus; scale: Animated.AnimatedInterpolation<number> | Animated.Value; isTab?: boolean }) {
  const live = status !== 'idle' && status !== 'ended';
  const speaking = status === 'speaking';
  const rings = useRef(Array.from({ length: SONAR_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!live) {
      rings.forEach((r) => { r.stopAnimation(() => r.setValue(0)); });
      return undefined;
    }
    const dur = speaking ? 1500 : 2300; // speaking ripples faster
    const loops = rings.map((r, i) => {
      r.setValue(0);
      return Animated.loop(
        Animated.sequence([
          Animated.delay((i * dur) / SONAR_COUNT),
          Animated.timing(r, { toValue: 1, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // Restart with new pacing/spread when the turn flips listening ⇄ speaking.
  }, [live, speaking, rings]);

  // Nested in the tab-bar notch there's no room to radiate: Ruby is 1.4x here and
  // the tab label ("Listening…"/"Speaking…") sits only ~18pt below her, so the
  // expanding rings wash straight over it. Suppress the wide ripple there — the
  // FAB pulse, the soft glow and the changing tab label already signal activity.
  // The full sonar still plays on the floating corner, where there is space.
  if (!live || isTab) return null;
  // Speaking spreads wide; listening stays tight (the requested difference).
  const maxScale = speaking ? 2.9 : 1.85;
  const startOpacity = speaking ? 0.5 : 0.4;

  return (
    <Animated.View pointerEvents="none" style={[styles.glowWrap, { transform: [{ scale }] }]}>
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          style={[
            styles.sonarRing,
            {
              opacity: r.interpolate({ inputRange: [0, 1], outputRange: [startOpacity, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale] }) }],
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

/** Floating mic FAB — a constant-color button; bars + ripple carry all state color. */
export default function VoiceWidget() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { state, set, showToast, refreshUserContext } = useStore();
  const t = useT();
  const [status, setStatus] = useState<AgentStatus>('idle');
  // Which edge the FAB is docked to — persisted so the user's choice survives
  // app restarts. Defaults to right (today's fixed spot) for first launch.
  const [side, setSide] = useState<'left' | 'right'>('right');
  // Live horizontal offset while a drag is in progress, applied as a
  // transform on top of whichever edge it's currently docked to — so the
  // button visually follows the finger without needing separate absolute-
  // position math per screen width.
  const [dragX, setDragX] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  // Whether the end-call/mute controls are fanned out. Only meaningful while a
  // session is active — reset the moment the call ends (see the statusChange
  // effect below) so a fresh call always starts collapsed.
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  // Two roll-out controls (mute + end). Each spins out of Ruby's circle, bumps
  // into its flank position, and spins back in on close — one Animated value per
  // button so the end button can TRAIL the mute on the way out (a cascade),
  // while both close together with no lag. A spring's natural overshoot past 1
  // gives the arrival its little bounce; the rotate interpolation turns the
  // travel into a roll. Placement differs by where the FAB lives: a shallow arc
  // above Ruby in the tab-bar notch, an up-left flank in the floating corner.
  const mOut = useRef(new Animated.Value(0)).current;
  const eOut = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (expanded) {
      // Roll OUT: spin + bump; end trails mute slightly so they cascade.
      Animated.spring(mOut, { toValue: 1, friction: 6, tension: 72, useNativeDriver: true }).start();
      Animated.spring(eOut, { toValue: 1, friction: 6, tension: 72, delay: 90, useNativeDriver: true }).start();
    } else {
      // Roll IN together — one smooth continuous spin that settles with a gentle
      // bounce (slightly springy), no stagger between the two.
      Animated.spring(mOut, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true }).start();
      Animated.spring(eOut, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true }).start();
    }
  }, [expanded, mOut, eOut]);

  // One-time GRAND ENTRANCE the first time the FAB appears: it springs in from
  // nothing with a spin + overshoot while a ring bursts out around it.
  const entrance = useRef(new Animated.Value(fabEntrancePlayed ? 1 : 0)).current;
  const burst = useRef(new Animated.Value(fabEntrancePlayed ? 1 : 0)).current;
  // "Look at me" flourish fired by the dashboard's "Ask Ruby" (state.voiceTrigger).
  const attention = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Hold the FAB hidden on the splash; play the grand entrance the first time
    // the user lands on a real screen, so it's actually seen.
    if (fabEntrancePlayed || state.screen === 'splash') return;
    fabEntrancePlayed = true;
    Animated.sequence([
      Animated.delay(320),
      Animated.parallel([
        Animated.spring(entrance, { toValue: 1, friction: 5, tension: 65, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, [state.screen, entrance, burst]);

  // Position morph. `move` 0 = floating bottom-right (full/non-tab screens),
  // 1 = nested in the tab-bar notch (tab screens). A single persistent FAB
  // springs + rolls between the two while the tab bar itself slides down/up.
  const isTab = SCREENS_WITH_BOTTOM_NAV.has(state.screen);
  const move = useRef(new Animated.Value(isTab ? 1 : 0)).current;
  useEffect(() => {
    // Move silently — no cue while the FAB travels (docks/undocks). Only the
    // connect/disconnect cues have audio (see onPress).
    Animated.spring(move, { toValue: isTab ? 1 : 0, useNativeDriver: true, friction: 8, tension: 62 }).start();
  }, [isTab, move]);

  useEffect(() => {
    loadVoiceFabSide().then(saved => { if (saved) setSide(saved); });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Only claim the gesture once it's clearly a horizontal drag — a plain
      // tap (dx ~0) must still reach the Pressable underneath untouched.
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_evt, g) => setDragX(g.dx),
      onPanResponderRelease: (evt) => {
        const newSide: 'left' | 'right' = evt.nativeEvent.pageX < screenWidth / 2 ? 'left' : 'right';
        setSide(newSide);
        setDragX(0);
        saveVoiceFabSide(newSide);
      },
      onPanResponderTerminate: () => setDragX(0),
    }),
  ).current;

  useEffect(() => agent.on('statusChange', (s) => {
    setStatus(s);
    const live = s !== 'idle' && s !== 'ended';
    // The screen locking mid-call kills the mic/socket on most OEMs — a call
    // needs the same "stay awake" guarantee a phone call gets, for its whole
    // lifetime (connecting through executingTool), not just while speaking.
    keepAwake(live);
    if (!live) {
      // Every call starts collapsed and unmuted — don't carry either state
      // over into the next session.
      setExpanded(false);
      mOut.setValue(0);
      eOut.setValue(0);
      setMuted(false);
      agent.setMuted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => {
    if (status === 'listening' || status === 'speaking') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 480, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(1);
    return undefined;
  }, [status, pulse]);

  if (!ELLO_CONFIGURED) return null;
  // Rendered on every screen now — it animates between the tab-bar notch and the
  // floating bottom-right corner instead of being a separate per-screen element.

  // 'connecting' counts as active so a second tap hangs up mid-dial rather than
  // being ignored (agent.start() unwinds via its start-token check).
  const active = status !== 'idle' && status !== 'ended';
  const accent = STATE_ACCENT[status];

  // Not rendered as visible text anymore, but kept for screen readers.
  const a11yLabel =
    status === 'connecting'
      ? t.voiceStatusConnecting
      : status === 'listening'
        ? t.voiceStatusListening
        : status === 'speaking'
          ? t.voiceStatusSpeaking
          : status === 'executingTool'
            ? t.voiceStatusExecuting
            : t.voiceStatusIdle;

  // Fresh, per-call-open read of where this user actually is in the funnel —
  // refetched here rather than relying on store.ts's once-at-login snapshot,
  // which goes stale the moment the user progresses (or stalls) mid-session.
  // Fire-and-forget, fired alongside agent.start(): GET /context/me is a
  // single small authenticated read, lighter than the voice REST+WebSocket
  // handshake agent.start() itself has to complete before it builds its
  // first page_context payload, so this almost always lands first. If it
  // doesn't, the agent falls back to whatever snapshot it already had.
  // The context is now awaited (see startAgent), not fire-and-forget: the agent's first
  // page_context has to carry `account_summary`, or it opens without knowing about an
  // application that is under review.
  // Start a voice session (shared by the FAB tap and the dashboard's "Ask Ruby").
  const startAgent = () => {
    // Never start a call while the Ruby welcome intro is playing — the GIF has its
    // own voice-over, so a live agent would talk over it. The FAB tap and "Ask Ruby"
    // already guard on welcomePending; this is the shared belt-and-suspenders so any
    // path into startAgent (e.g. the voiceTrigger attention effect) is covered too.
    if (state.welcomePending) return;
    (state.authUser ? refreshUserContext() : Promise.resolve()).then(() => agent.start(state.authUser?.phone)).then(() => {
      // Runs after voice-session-start (and this call's own first
      // page_context, carrying whatever heard_intro_pitch was at the time)
      // has already gone out — marking it here can't affect THIS call's own
      // pitch decision, only every call after it.
      // start() also resolves (without throwing) when the user hangs up while it
      // is still connecting — no greeting was ever spoken then, so don't record
      // the pitch as heard (and persist it) for a call that never started.
      const connected = agent.getStatus() !== 'idle' && agent.getStatus() !== 'ended';
      if (connected && !state.introPitchHeard) {
        set({ introPitchHeard: true });
        markIntroPitchHeard();
      }
    }).catch(e => {
      vlog('agent.start() rejected:', e?.message || String(e));
      // Offline failures already get the dedicated OfflineNotice banner (see
      // agent.ts) — don't also toast those. Everything else previously failed
      // silently from the user's point of view (no banner, no toast), which
      // read as the button just not working.
      const message: string = e?.message || '';
      if (message.startsWith('offline:')) return;
      showToast(e?.code === 'session_busy' ? t.voiceStartFailedCall : t.voiceStartFailed);
    });
  };

  // Tapping the FAB itself never hangs up directly anymore — while a call is
  // live it just fans the end-call/mute controls in or out, so a stray tap
  // mid-call can't drop it. Ending the call is now only reachable through the
  // dedicated end-call button (see endCall below).
  const onPress = () => {
    // Frozen while the Ruby welcome intro plays — the FAB (Support) can't be tapped.
    if (state.welcomePending) return;
    vlog('FAB tapped; status=', status, 'active=', active, 'expanded=', expanded);
    setNudgeLabel(null); // clear any proactive-help label once the user engages
    Vibration.vibrate(20); // small haptic to confirm the tap registered
    if (active) {
      setExpanded(e => !e);
    } else {
      startAgent();
    }
  };

  const endCall = () => {
    Vibration.vibrate(20);
    agent.stop().catch(e => vlog('agent.stop() rejected:', e?.message || String(e)));
  };

  const toggleMute = () => {
    Vibration.vibrate(15);
    setMuted(m => {
      const next = !m;
      agent.setMuted(next);
      return next;
    });
  };

  // Shared "look at me" flourish: a quick spring wiggle + a burst ring.
  const playAttention = (onDone?: () => void) => {
    Animated.sequence([
      Animated.timing(burst, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.parallel([
        Animated.sequence([
          Animated.spring(attention, { toValue: 1, friction: 3.5, tension: 90, useNativeDriver: true }),
          Animated.spring(attention, { toValue: 0, friction: 4, tension: 80, useNativeDriver: true }),
        ]),
        Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start(() => onDone && onDone());
  };

  // "Ask Ruby" on the dashboard bumps state.voiceTrigger: draw attention to the
  // FAB, then start the session once the flourish has played. Skipped on the
  // initial mount (trigger 0) and while a session is already live. Starts at 0
  // (not the current value) so an unlock+trigger in the same update still fires.
  const lastTrigger = useRef(0);
  useEffect(() => {
    if (state.voiceTrigger === lastTrigger.current) return;
    lastTrigger.current = state.voiceTrigger;
    if (active) return;
    playAttention(() => startAgent());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.voiceTrigger]);

  // Proactive-help tips: the bubble above the FAB. App.tsx sets state.voiceNudge
  // 5s after the user lands on a screen; here the bubble pops in, then each tip
  // slides up out of the bottom of the bubble to replace the previous one (which
  // lifts away and fades) every NUDGE_ROTATE_MS. It stays up (no auto-hide) until
  // the screen changes (voiceNudge cleared) or a call starts, and never starts a
  // session itself.
  const [nudgeLabel, setNudgeLabel] = useState<string | null>(null);
  const lastNudgeId = useRef(0);
  const bubbleIn = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const n = state.voiceNudge;
    if (!n) { setNudgeLabel(null); return undefined; }
    if (active) {
      // Never over a live session — and don't bring it back after the call.
      setNudgeLabel(null);
      set({ voiceNudge: null });
      return undefined;
    }
    let cancelled = false;
    let i = 0;
    setNudgeLabel(n.labels[0] ?? null);
    textY.setValue(0);
    textOpacity.setValue(1);
    if (n.id !== lastNudgeId.current) {
      lastNudgeId.current = n.id;
      // The bubble itself pops up out of the Ruby button; then the button wiggles.
      bubbleIn.setValue(0);
      Animated.spring(bubbleIn, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
      playAttention();
    } else {
      bubbleIn.setValue(1);
    }
    // The whole bubble closes (shrinks toward the Ruby button and fades), the
    // sentence is swapped while it is shut, then it springs back open and the new
    // sentence rises in from the bottom of the bubble.
    const swapTo = (next: string) => {
      Animated.timing(bubbleIn, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
        if (cancelled) return;
        setNudgeLabel(next);
        textY.setValue(14);
        textOpacity.setValue(0);
        Animated.parallel([
          Animated.spring(bubbleIn, { toValue: 1, friction: 6, tension: 95, useNativeDriver: true }),
          Animated.timing(textY, { toValue: 0, duration: 360, delay: 90, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
          Animated.timing(textOpacity, { toValue: 1, duration: 240, delay: 90, useNativeDriver: true }),
        ]).start();
      });
    };
    let rotate: ReturnType<typeof setInterval> | undefined;
    if (n.labels.length > 1) {
      rotate = setInterval(() => {
        i = (i + 1) % n.labels.length;
        swapTo(n.labels[i]);
      }, nudgeRotateMs());
    }
    return () => {
      cancelled = true;
      if (rotate) clearInterval(rotate);
      textY.stopAnimation();
      textOpacity.stopAnimation();
      bubbleIn.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.voiceNudge, active]);

  // Two fixed offsets, not one — screens with a BottomNav pill need real
  // clearance above it; screens without one (intro, language, etc.) should
  // sit close to the bottom edge like a normal FAB instead of floating over
  // empty space. Either way it's a constant per screen type, not derived
  // from window height, so it never drifts with screen size. Horizontal side
  // is the one thing left to the user: drag the button past the midline and
  // it docks to that edge, remembered for next time.
  // Pinned to a fixed bottom-right spot on every screen that shows it, so the
  // assistant never appears to "move" between screens. (Dragging is disabled —
  // it caused the button to jump sides across navigations.)
  // Anchor maths (transforms → native driver, 60fps). The wrap is pinned at the
  // floating bottom-right anchor; `move` translates it up+left into the tab-bar
  // notch centre and rolls it a full turn along the way.
  // The FAB circle is centred inside a HALO_SIZE-wide zone that's right-aligned
  // at EDGE_MARGIN — so its true centre is measured with HALO_SIZE/2, not
  // FAB_SIZE/2. Using the wrong half-width left it ~10px off-centre in the notch.
  const floatCenterX = screenWidth - EDGE_MARGIN - HALO_SIZE / 2;
  const deltaToCentreX = screenWidth / 2 - floatCenterX; // negative → left toward notch
  const floatCenterYFromBottom = 24 + insets.bottom + HALO_SIZE / 2;
  const notchCenterYFromBottom = (insets.bottom || 14) + TAB_NOTCH_CENTER;
  const translateX = move.interpolate({ inputRange: [0, 1], outputRange: [0, deltaToCentreX] });
  const translateY = move.interpolate({ inputRange: [0, 1], outputRange: [0, -(notchCenterYFromBottom - floatCenterYFromBottom)] });
  // Roll: a full turn as it travels out to the corner (0 in the notch → 360 at
  // the corner), so it visibly "rolls" to its spot and unrolls on the way back.
  const roll = move.interpolate({ inputRange: [0, 1], outputRange: ['-360deg', '0deg'] });
  // Grow to the old notch-avatar size when nested; normal size when floating.
  const sizeScale = move.interpolate({ inputRange: [0, 1], outputRange: [1, NOTCH_SCALE] });
  // Grand-entrance transforms.
  const entranceScale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const entranceRotate = entrance.interpolate({ inputRange: [0, 1], outputRange: ['-220deg', '0deg'] });
  const entranceOpacity = entrance.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.8] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.5, 0] });
  const attentionScale = attention.interpolate({ inputRange: [0, 1], outputRange: [1, 1.32] });
  const attentionRotate = attention.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-12deg', '10deg'] });
  // The FAB crossfades between the Ruby avatar and a plain support (headset) icon.
  // `rubyPresence`: 1 = Ruby seated in the icon, 0 = she's "stepped out" (presenting
  // in the welcome intro) and only the support glyph remains. It eases out when she
  // leaves and springs back with a little pop when she returns — so it reads as
  // Ruby climbing out of the round icon and later sitting back into it.
  const rubyPresence = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state.welcomePending) {
      Animated.timing(rubyPresence, { toValue: 0, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.spring(rubyPresence, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    }
  }, [state.welcomePending, rubyPresence]);
  const rubyOpacity = rubyPresence.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  const rubyScale = rubyPresence.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }); // springs past 1 → tiny pop
  const supportOpacity = rubyPresence.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0, 0] });
  const supportScale = rubyPresence.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35], extrapolate: 'clamp' });
  // The expanded call panel grows directly out of the FAB circle, anchored on
  // whichever edge touches it (transformOrigin), and switches orientation with
  // where the FAB itself lives: nested in the tab-bar notch (main dashboard,
  // `isTab`) it's dead centre, so the panel opens upward, vertically; docked to
  // a screen edge (e.g. mid-application screens) it opens sideways, horizontally,
  // same as the FAB itself only ever sits at a left/right edge there.
  // Where the two controls roll OUT to, measured from the FAB centre (negative
  // y = up, negative x = left). Notch screens: a shallow arc above Ruby, clear
  // of the greyed tab labels (#2). Corner screens: an up-left flank into the
  // screen, away from the edge (#7) — mirrored when the FAB is docked left.
  // End-call always sits to the LEFT, mute to the RIGHT. Notch: a flat arc
  // directly above Ruby. Corner: a diagonal flank suited to the screen edge —
  // mute up (right), end up-left (left) — mirrored when the FAB is docked left.
  const dir = (!isTab && side === 'left') ? -1 : 1;
  const ctl = isTab
    ? { mx: 44, my: -52, ex: -44, ey: -52 }
    : { mx: 0, my: -60, ex: -52 * dir, ey: -30 };
  // Turn one spring value (0→1, overshooting past 1 on the way out) into the
  // roll: translate to the offset, a full 360° spin, scale up from a dot. The
  // overshoot carries translate/rotate/scale slightly past target → the bump.
  const rollStyle = (val: Animated.Value, ox: number, oy: number) => ({
    opacity: val.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateX: val.interpolate({ inputRange: [0, 1], outputRange: [0, ox] }) },
      { translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, oy] }) },
      { rotate: val.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
      { scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) },
    ],
  });
  // Screen dims behind the controls (greys the tab bar); tapping it dismisses.
  const scrimOpacity = mOut.interpolate({ inputRange: [0, 1], outputRange: [0, 0.42], extrapolate: 'clamp' });

  // On screens with a pinned bottom CTA bar (the Screen `footer`), lift the
  // floating FAB above that bar so the button and the FAB never overlap.
  const footerLift = SCREENS_WITH_FOOTER_CTA.has(state.screen) ? FOOTER_CTA_LIFT : 0;

  return (
    <>
      {/* Full-screen dim behind the open controls — greys the whole screen
          (the tab bar included, since it sits over everything), so a live call
          reads as "focused". Tapping the dimmed area dismisses the controls.
          Only mounted during a live call; invisible + non-interactive until the
          controls are opened. */}
      {active ? (
        <Animated.View
          pointerEvents={expanded ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { setExpanded(false); Vibration.vibrate(10); }}
            accessibilityLabel="Close call controls"
            accessibilityRole="button"
          />
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents="box-none"
        style={[styles.wrap, { right: EDGE_MARGIN, bottom: 24 + insets.bottom + footerLift, transform: [{ translateX }, { translateY }] }]}
      >
      {/* Proactive-help label — an informational speech bubble above the FAB.
          The bubble body isn't tappable (starting a call is the FAB's job); only the
          ✕ badge is, to dismiss the tip for this screen. */}
      {nudgeLabel && !active && !state.welcomePending ? (
        <Animated.View
          style={[
            styles.nudgeWrap,
            // In the tab-bar notch the avatar is dead centre (and 1.4x bigger), so
            // centre the bubble on it and lift it clear; floating in the corner it
            // stays right-aligned over the avatar.
            isTab && styles.nudgeWrapNotch,
            {
              opacity: bubbleIn,
              transformOrigin: isTab ? 'center bottom' : 'right bottom',
              transform: [
                { translateY: bubbleIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                { scale: bubbleIn.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
              ],
            },
          ]}
          accessibilityLabel={nudgeLabel}
          pointerEvents="box-none"
        >
          <View style={styles.nudgeBubble} pointerEvents="none">
            {/* Brand teal -> mint gradient (the same one as the active tab pill), white text. */}
            <LinearGradient colors={[...navGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nudgeGradient} pointerEvents="none" />
            {/* Padding lives on a plain view: the native gradient ignores its own
                padding, which left the gradient inset inside a solid teal shell. */}
            <View style={styles.nudgeBody}>
              {/* Fixed two-line window that clips the sentence while it slides, so the
                  bubble keeps one stable size instead of jumping between tips. */}
              <View style={styles.nudgeClip}>
                <Animated.Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.nudgeText, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>
                  {nudgeLabel}
                </Animated.Text>
              </View>
            </View>
            <View style={[styles.nudgeTail, isTab && styles.nudgeTailNotch]} />
          </View>
          <Pressable
            onPress={() => { snoozeNudges(); set({ voiceNudge: null }); }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss tip"
            style={styles.nudgeClose}
          >
            <Icon name="close" size={11} color="#fff" />
          </Pressable>
        </Animated.View>
      ) : null}
      {/* Status pill only while floating and collapsed — once the panel opens
          it carries the same status text itself, so showing both would be
          redundant (on tab screens the tab label carries it either way). */}
      {active && !isTab && !expanded ? (
        <View style={styles.statusPill} pointerEvents="none">
          <View style={[styles.statusDot, { backgroundColor: status === 'listening' ? colors.green : accent }]} />
          <Text style={styles.statusText}>{a11yLabel}</Text>
        </View>
      ) : null}
      <View style={styles.fabZone}>
        {/* Grand-entrance burst ring — expands + fades once as the FAB pops in. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.entranceBurst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
        />
        {/* Sonar ripple (reference video): expanding rings, wide while speaking,
            tight while listening. Behind the glow/avatar so it radiates from under. */}
        <SonarRings status={status} scale={Animated.multiply(sizeScale, entranceScale)} isTab={isTab} />
        {/* Same size transform as the ball (notch 70pt ⇄ floating 50/60pt),
            so the ring shrinks and grows with it instead of staying notch-sized. */}
        <SiriGlow status={status} scale={Animated.multiply(sizeScale, entranceScale)} />
        {/* Roll-out controls — just mute + end, kept small so they never cover
            the screen. Each rolls out of the FAB circle with a spin + bump and
            rolls back in on close. Placement set by `ctl`: a shallow arc above
            Ruby in the tab-bar notch, an up-left flank in the floating corner.
            Rendered before the FAB Pressable so they emerge from behind Ruby and
            are only tappable once rolled clear of her. */}
        {active ? (
          <>
            <Animated.View
              pointerEvents={expanded ? 'auto' : 'none'}
              style={[styles.rollBtn, rollStyle(mOut, ctl.mx, ctl.my)]}
            >
              <Pressable
                onPress={toggleMute}
                hitSlop={8}
                accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
                accessibilityRole="button"
                style={[styles.rollBtnInner, muted ? styles.rollBtnMuted : styles.rollBtnGray]}
              >
                <Icon name={muted ? 'mic_off' : 'mic'} size={18} color={muted ? '#fff' : colors.ink} />
              </Pressable>
            </Animated.View>
            <Animated.View
              pointerEvents={expanded ? 'auto' : 'none'}
              style={[styles.rollBtn, rollStyle(eOut, ctl.ex, ctl.ey)]}
            >
              <Pressable
                onPress={endCall}
                hitSlop={8}
                accessibilityLabel="End call"
                accessibilityRole="button"
                style={[styles.rollBtnInner, styles.rollBtnEnd]}
              >
                <Icon name="call_end" size={18} color="#fff" />
              </Pressable>
            </Animated.View>
          </>
        ) : null}
        <Pressable onPress={onPress} accessibilityLabel={a11yLabel} accessibilityRole="button" style={styles.pressable}>
          <Animated.View style={[styles.fabRing, styles.fabRingBare, { opacity: entranceOpacity, transform: [{ scale: Animated.multiply(Animated.multiply(Animated.multiply(pulse, sizeScale), entranceScale), attentionScale) }, { rotate: roll }, { rotate: entranceRotate }, { rotate: attentionRotate }] }]}>
            {/* Support glyph — the "empty seat" shown while Ruby is out presenting. */}
            <Animated.View style={[styles.fabSwapLayer, { opacity: supportOpacity, transform: [{ scale: supportScale }] }]} pointerEvents="none">
              <LinearGradient colors={FAB_GRADIENT} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fabSupportBall}>
                <Icon name="headset_mic" size={MIC_ICON_SIZE} color="#fff" />
              </LinearGradient>
            </Animated.View>
            {/* Ruby as a free-standing person — the transparent cutout floating on
                the screen. While muted she's shown desaturated inside a soft round
                disc (which also crops her flat cutout bottom cleanly) with a red
                mic-off badge, so the muted state reads at a glance even collapsed.
                box-none so the unmute badge is tappable while taps elsewhere still
                reach the FAB Pressable underneath. */}
            <Animated.View style={[styles.fabSwapLayer, { opacity: rubyOpacity, transform: [{ scale: rubyScale }] }]} pointerEvents="box-none">
              <View style={[styles.fabPerson, muted && styles.fabPersonMuted]}>
                <Image
                  source={muted ? require('../../../assets/brand/agent-ruby-gray.png') : require('../../../assets/brand/agent-ruby.png')}
                  style={styles.fabPersonImg}
                  resizeMode="contain"
                />
              </View>
              {muted && !expanded ? (
                <Pressable
                  onPress={toggleMute}
                  hitSlop={8}
                  accessibilityLabel="Unmute microphone"
                  accessibilityRole="button"
                  style={styles.mutedBadge}
                >
                  <Icon name="mic_off" size={13} color="#fff" />
                </Pressable>
              ) : null}
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
      </Animated.View>
    </>
  );
}

// Vertical centre of the tab-bar notch, measured up from just above the home
// indicator (i.e. excluding insets.bottom). Tuned so the FAB nests in the notch
// exactly where the old raised avatar sat. (Bar height is 66.)
const TAB_NOTCH_CENTER = 65;
// How far to raise the floating FAB on screens that pin a bottom CTA bar, so the
// FAB clears the footer (button 54 + ~20 padding + a gap) and never overlaps it.
const FOOTER_CTA_LIFT = 78;
// Width of the proactive-help bubble.
const NUDGE_W = 176;
// iOS renders this FAB visibly larger than Android at the same point size.
const FAB_SIZE = Platform.OS === 'ios' ? 50 : 60;
// The original notch avatar was ~70pt; scale the FAB up to that size when it's
// nested in the notch so it matches the previous look, and back to normal when
// floating in the corner.
const NOTCH_SCALE = 70 / FAB_SIZE;
const MIC_ICON_SIZE = Platform.OS === 'ios' ? 21 : 25;
const HALO_SIZE = FAB_SIZE + 20;
// Canvas for the in-call liquid ring at base size (ribbons reach ~FAB radius + 12);
// scaled together with the ball.
const GLOW_SIZE = FAB_SIZE + 32;
const ROBOT_HEAD_W = Platform.OS === 'ios' ? 24 : 28;
const ROBOT_HEAD_H = Platform.OS === 'ios' ? 20 : 24;
// Diameter of each roll-out control (mute / end).
const CALL_BTN_SIZE = 38;

const styles = StyleSheet.create({
  glowWrap: { position: 'absolute', width: GLOW_SIZE, height: GLOW_SIZE, alignItems: 'center', justifyContent: 'center' },
  // One sonar ring at rest hugs the ball; it scales up + fades as it radiates.
  sonarRing: {
    position: 'absolute',
    width: FAB_SIZE + 6,
    height: FAB_SIZE + 6,
    borderRadius: (FAB_SIZE + 6) / 2,
    borderWidth: 2.5,
    borderColor: colors.primary,
  },
  glowBlob: {
    position: 'absolute', width: FAB_SIZE + 12, height: FAB_SIZE + 12, borderRadius: (FAB_SIZE + 12) / 2,
    backgroundColor: 'rgba(7,159,160,0.14)', // primary, soft
    shadowOpacity: 0.85, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 0,
  },
  wrap: { position: 'absolute', alignItems: 'flex-end' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,42,43,0.92)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 8,
    marginRight: 2,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...font(600), fontSize: 11.5, color: '#fff' },
  // The bubble itself carries the shadow (and a solid fill so Android's elevation
  // shadow renders); the gradient sits inside it, clipped to the same radius.
  // Right edge is flush with the Ruby circle (not the wider halo), and it sits just
  // above it, so the bubble reads as attached to the button.
  nudgeWrap: {
    width: NUDGE_W, marginBottom: 2, marginRight: (HALO_SIZE - FAB_SIZE) / 2,
  },
  // Centred on the avatar: its centre is HALO_SIZE/2 from the wrapper's right edge,
  // so shift the bubble's right edge by (HALO_SIZE - NUDGE_W)/2. The extra bottom
  // margin clears the avatar's notch-size growth (NOTCH_SCALE).
  nudgeWrapNotch: {
    marginRight: (HALO_SIZE - NUDGE_W) / 2,
    marginBottom: 2 + (FAB_SIZE * (NOTCH_SCALE - 1)) / 2,
  },
  nudgeBubble: {
    backgroundColor: colors.primary, borderRadius: 14,
    shadowColor: colors.ink, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  nudgeGradient: { ...StyleSheet.absoluteFill, borderRadius: 14, overflow: 'hidden' },
  nudgeBody: {
    borderRadius: 14, paddingVertical: 7, paddingLeft: 11, paddingRight: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  nudgeClip: { height: 32, justifyContent: 'center', overflow: 'hidden' },
  nudgeText: { ...font(700), fontSize: 11.5, color: '#fff', lineHeight: 15 },
  // ✕ badge tucked into the bubble's top-right corner, fully inside its frame.
  nudgeClose: {
    position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,63,65,0.28)',
  },
  // Points at the Ruby button's centre; the gradient ends in mint at the bottom-right.
  nudgeTail: {
    position: 'absolute', right: FAB_SIZE / 2 - 5, bottom: -5, width: 10, height: 10,
    backgroundColor: colors.mint, borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  nudgeTailNotch: { right: NUDGE_W / 2 - 5 },
  fabZone: { width: HALO_SIZE, height: HALO_SIZE, alignItems: 'center', justifyContent: 'center' },
  pressable: { alignItems: 'center', justifyContent: 'center' },
  // Full-screen dim behind the open controls — focuses the call and greys the
  // tab bar. Taps on it (anywhere outside the controls/FAB) dismiss. No zIndex:
  // it's rendered BEFORE the FAB wrap, so the wrap (and its roll-out buttons)
  // naturally paint and receive touches on top of it — a zIndex here would lift
  // the scrim above the wrap and swallow the buttons' taps.
  scrim: { backgroundColor: '#0A1E1E' },
  // Roll-out control wrapper: centred on the FAB, moved to its flank by the
  // per-button transform. CALL_BTN_SIZE circle.
  rollBtn: {
    position: 'absolute',
    left: (HALO_SIZE - CALL_BTN_SIZE) / 2,
    top: (HALO_SIZE - CALL_BTN_SIZE) / 2,
    width: CALL_BTN_SIZE,
    height: CALL_BTN_SIZE,
    borderRadius: CALL_BTN_SIZE / 2,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  rollBtnInner: {
    flex: 1,
    borderRadius: CALL_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollBtnGray: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  rollBtnMuted: { backgroundColor: colors.amber },
  rollBtnEnd: { backgroundColor: colors.redDeep },
  // Fills `.fab` exactly (which already clips to a circle via overflow:hidden)
  // — a translucent dark scrim plus a gray icon, not a separate badge shape.
  entranceBurst: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  fabRing: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#0A3F41',
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  fab: {
    width: FAB_SIZE - 3,
    height: FAB_SIZE - 3,
    borderRadius: (FAB_SIZE - 3) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fabAvatar: { width: '100%', height: '100%', borderRadius: (FAB_SIZE - 3) / 2 },
  // Ruby-as-person FAB: no circular ring/background, just the floating cutout.
  fabRingBare: { borderWidth: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  // Both FAB faces (Ruby cutout / support glyph) stack in the same spot so they can
  // crossfade; each fills the ring and centres its content.
  fabSwapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // The support "ball" carries its own ring border + shadow (the bare ring has none)
  // so the headset state looks like the original raised FAB button.
  fabSupportBall: {
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#0A3F41', shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  fabPerson: { width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center' },
  // Muted look: a soft round disc that holds the desaturated Ruby and crops her
  // flat cutout bottom into a clean circle.
  fabPersonMuted: { borderRadius: FAB_SIZE / 2, backgroundColor: '#C3CFCD', overflow: 'hidden' },
  // Red mic-off badge tucked into Ruby's lower-right while muted (tap to unmute).
  mutedBadge: {
    position: 'absolute', right: -1, bottom: -1,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.redDeep,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  fabPersonImg: {
    width: '122%', height: '122%',
    // No drop shadow: Ruby's cutout is cropped flat across the bottom, so ANY
    // shadow (even a centred blur) traced that straight edge and read as a faint
    // squared-off box under her. Her dark hair + teal kurta have enough contrast
    // on the notch bar and on light content to stand on their own.
  },
  robotFace: {
    width: ROBOT_HEAD_W,
    height: ROBOT_HEAD_H,
    borderRadius: 7,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ROBOT_HEAD_W * 0.25,
  },
  robotEye: { width: 4, height: 4, borderRadius: 1, backgroundColor: colors.primary },
  robotAntennaStem: {
    position: 'absolute',
    top: -9,
    left: ROBOT_HEAD_W / 2 - 1,
    width: 2,
    height: 6,
    backgroundColor: '#fff',
    transformOrigin: 'bottom center',
  },
  robotAntennaTip: {
    position: 'absolute',
    top: -12,
    left: ROBOT_HEAD_W / 2 - 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});
