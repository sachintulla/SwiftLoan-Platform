import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, PanResponder, Platform, Pressable, StyleSheet, Text, Vibration, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { activateKeepAwake, deactivateKeepAwake } from '@sayem314/react-native-keep-awake';
import Icon from '../../components/Icon';
import { colors, font } from '../../theme/tokens';
import { useStore, useT, SCREENS_WITH_FOOTER_CTA } from '../../state/store';
import { loadVoiceFabSide, saveVoiceFabSide, markIntroPitchHeard } from '../../state/session';
import { agent } from '../index';
import { ELLO_CONFIGURED } from '../config';
import { vlog } from '../log';
import { fetchUserContext } from '../../api/client';
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
 * Stylized voice-activity bars — not literally driven by mic/speaker audio
 * levels (no PCM level access is wired to this component), just a loop that
 * reads as "something is actively happening" in place of a static icon.
 */
function EqualizerBars({ color }: { color: string }) {
  const bars = useRef([0, 1, 2, 3].map(() => new Animated.Value(0.35))).current;

  useEffect(() => {
    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(v, { toValue: 1, duration: 260 + i * 40, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0.3, duration: 260 + i * 40, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [bars]);

  return (
    <View style={styles.eqRow}>
      {bars.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.eqBar, { backgroundColor: color, height: v.interpolate({ inputRange: [0, 1], outputRange: [6, 22] }) }]}
        />
      ))}
    </View>
  );
}

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
 * In-call "liquid ring" — translucent teal/mint ribbons (app theme) that wave around the avatar,
 * each a closed loop whose radius ripples with its own wave count, speed and
 * phase, so they cross and weave like a living ring, over a thin dark core
 * line and a soft glow. Only rendered while a call is live; the idle avatar is
 * still and the animation loop is fully stopped.
 *
 * State-driven (this client has no PCM level access):
 *   connecting → nearly round, slowly rotating (dialling)
 *   listening  → gentle, slow undulation
 *   speaking   → deep, fast waves — the ring "talks" with Ruby
 *   executing  → calm waves with a warm gold ribbon (working on it)
 */
const RIBBONS: { k: number; speed: number; phase: number; width: number; color: string; opacity: number }[] = [
  // App theme: primary teal, mint, and a light aqua tint of the primary.
  { k: 5, speed: 1.0, phase: 0, width: 5, color: colors.primary, opacity: 0.28 },
  { k: 6, speed: -1.35, phase: 1.3, width: 3.5, color: colors.mint, opacity: 0.45 },
  { k: 4, speed: 0.8, phase: 2.6, width: 2.8, color: colors.primary, opacity: 0.42 },
  { k: 7, speed: -1.1, phase: 4.1, width: 2, color: '#7FD6D0', opacity: 0.55 },
];

const MOTION: Record<'connecting' | 'listening' | 'speaking' | 'executingTool', { amp: number; tempo: number; spin: number }> = {
  connecting: { amp: 0.8, tempo: 0.6, spin: 1.2 },
  listening: { amp: 2.2, tempo: 0.9, spin: 0.25 },
  speaking: { amp: 4.2, tempo: 2.4, spin: 0.5 },
  executingTool: { amp: 1.8, tempo: 1.1, spin: 0.35 },
};

/** Closed wavy loop: r(θ) = R + A·sin(kθ + φ), sampled finely enough to read as a smooth curve. */
function wavyPath(cx: number, cy: number, R: number, A: number, k: number, phase: number, rot: number): string {
  const N = 96;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = R + A * Math.sin(k * t + phase);
    const x = cx + r * Math.cos(t + rot);
    const y = cy + r * Math.sin(t + rot);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d + 'Z';
}

function SiriGlow({ status, scale }: { status: AgentStatus; scale: Animated.AnimatedInterpolation<number> | Animated.Value }) {
  const live = status !== 'idle' && status !== 'ended';
  const show = useRef(new Animated.Value(0)).current;
  const [t, setT] = useState(0);
  // Eased amplitude/tempo so switching listening ⇄ speaking morphs, not snaps.
  const motion = useRef({ amp: 0, tempo: 0, spin: 0 });

  useEffect(() => {
    Animated.timing(show, { toValue: live ? 1 : 0, duration: live ? 380 : 280, useNativeDriver: true }).start();
  }, [live, show]);

  useEffect(() => {
    if (!live) return undefined;
    let raf = 0;
    let last = Date.now();
    let clock = 0;
    let lastPaint = 0;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = MOTION[status as keyof typeof MOTION] ?? MOTION.listening;
      const m = motion.current;
      const ease = 1 - Math.pow(0.02, dt); // ~0.2s settle
      m.amp += (target.amp - m.amp) * ease;
      m.tempo += (target.tempo - m.tempo) * ease;
      m.spin += (target.spin - m.spin) * ease;
      clock += dt;
      if (now - lastPaint >= 33) { lastPaint = now; setT(clock); } // ~30fps repaint
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, status]);

  if (!live && t === 0) return null;
  const m = motion.current;
  const tool = status === 'executingTool';
  const S = GLOW_SIZE;
  const c = S / 2;
  // Geometry is in the ball's base (floating) size; the whole ring is then
  // scaled with the ball (see `scale`), so it hugs it at every size.
  const R = FAB_SIZE / 2 + 5;
  const beat = 1 + (status === 'speaking' ? 0.08 : 0.03) * Math.sin(t * (status === 'speaking' ? 7 : 2.4));

  return (
    <Animated.View pointerEvents="none" style={[styles.glowWrap, { opacity: show, transform: [{ scale }] }]}>
      <View style={[styles.glowBlob, { shadowColor: tool ? '#F4B45C' : colors.primary, transform: [{ scale: beat }] }]} />
      <Svg width={S} height={S}>
        <Defs>
          <SvgGradient id="core" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.inkDeep} stopOpacity="0.95" />
            <Stop offset="0.5" stopColor={colors.ink} stopOpacity="0.9" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0.95" />
          </SvgGradient>
        </Defs>
        {RIBBONS.map((rb, idx) => (
          <Path
            key={idx}
            d={wavyPath(c, c, R * beat, m.amp * (0.7 + 0.3 * ((idx % 2) + 1) / 2), rb.k, rb.phase + t * m.tempo * rb.speed, t * m.spin * (idx % 2 ? -1 : 1))}
            stroke={tool && idx === 2 ? '#F4B45C' : rb.color}
            strokeOpacity={rb.opacity}
            strokeWidth={rb.width}
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        <Path
          d={wavyPath(c, c, R * beat, m.amp * 0.55, 5, t * m.tempo * 0.9 + 0.7, t * m.spin * 0.5)}
          stroke="url(#core)"
          strokeWidth={1.6}
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/** Floating mic FAB — a constant-color button; bars + ripple carry all state color. */
export default function VoiceWidget() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { state, set, showToast } = useStore();
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
  const expand = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(expand, { toValue: expanded ? 1 : 0, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [expanded, expand]);

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
    if (live) activateKeepAwake();
    else deactivateKeepAwake();
    if (!live) {
      // Every call starts collapsed and unmuted — don't carry either state
      // over into the next session.
      setExpanded(false);
      expand.setValue(0);
      setMuted(false);
      agent.setMuted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // Call duration shown in the expanded panel (mm:ss) — counts from 0 each
  // time a call goes live, stops (but doesn't reset the display) on end.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    // `active` isn't computed until after this component's early-return guard
    // below, so this checks status directly rather than depending on it.
    if (status === 'idle' || status === 'ended') { setElapsedSec(0); return undefined; }
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

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
  const refreshSessionContext = () => {
    fetchUserContext()
      .then(ctx => { if (ctx?.hasHistory) set({ userContext: ctx }); })
      .catch(() => undefined);
  };

  // Start a voice session (shared by the FAB tap and the dashboard's "Ask Ruby").
  const startAgent = () => {
    refreshSessionContext();
    agent.start(state.authUser?.phone).then(() => {
      // Runs after voice-session-start (and this call's own first
      // page_context, carrying whatever heard_intro_pitch was at the time)
      // has already gone out — marking it here can't affect THIS call's own
      // pitch decision, only every call after it.
      if (!state.introPitchHeard) {
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

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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

  // Proactive-help nudge (idle / drop-off / eligible-but-didn't-apply): vibrate,
  // wiggle the FAB and show a contextual label — but DON'T start a session (the
  // user taps to ask). The label auto-dismisses after a few seconds.
  const [nudgeLabel, setNudgeLabel] = useState<string | null>(null);
  const lastNudgeId = useRef(0);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const n = state.voiceNudge;
    if (!n || n.id === lastNudgeId.current) return;
    lastNudgeId.current = n.id;
    if (active) return; // never interrupt a live session
    playAttention();
    setNudgeLabel(n.label);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudgeLabel(null), 9000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.voiceNudge]);

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
  // Always show the Ruby avatar — same face in the notch and floating in the
  // corner — so the FAB is visually consistent across every screen.
  const showRuby = true;
  // The expanded call panel grows directly out of the FAB circle, anchored on
  // whichever edge touches it (transformOrigin), and switches orientation with
  // where the FAB itself lives: nested in the tab-bar notch (main dashboard,
  // `isTab`) it's dead centre, so the panel opens upward, vertically; docked to
  // a screen edge (e.g. mid-application screens) it opens sideways, horizontally,
  // same as the FAB itself only ever sits at a left/right edge there.
  const isHorizontal = !isTab;
  const panelOpacity = expand.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const panelScale = expand.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const panelSlide = expand.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  // On screens with a pinned bottom CTA bar (the Screen `footer`), lift the
  // floating FAB above that bar so the button and the FAB never overlap.
  const footerLift = SCREENS_WITH_FOOTER_CTA.has(state.screen) ? FOOTER_CTA_LIFT : 0;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { right: EDGE_MARGIN, bottom: 24 + insets.bottom + footerLift, transform: [{ translateX }, { translateY }] }]}
    >
      {/* Proactive-help label — an informational speech bubble above the FAB.
          Not tappable: it's just a hint, starting a call is the FAB's job. */}
      {nudgeLabel && !active ? (
        <View style={styles.nudgeBubble} accessibilityLabel={nudgeLabel} pointerEvents="none">
          <Text style={styles.nudgeText}>{nudgeLabel}</Text>
          <View style={styles.nudgeTail} />
        </View>
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
        {/* Same size transform as the ball (notch 70pt ⇄ floating 50/60pt),
            so the ring shrinks and grows with it instead of staying notch-sized. */}
        <SiriGlow status={status} scale={Animated.multiply(sizeScale, entranceScale)} />
        {/* Call panel — status/timer + mic/end-call. Only exists during a live
            call; grows directly out of the FAB circle it's anchored to
            (transformOrigin), horizontally when the FAB floats at a screen
            edge, vertically (opening upward) when nested in the dashboard's
            tab-bar notch. */}
        {active ? (
          <Animated.View
            pointerEvents={expanded ? 'auto' : 'none'}
            style={[
              styles.callPanel,
              isHorizontal ? styles.callPanelHorizontal : styles.callPanelVertical,
              {
                opacity: panelOpacity,
                transformOrigin: isHorizontal ? 'right center' : 'center bottom',
                transform: [
                  { scale: panelScale },
                  isHorizontal ? { translateX: panelSlide } : { translateY: panelSlide },
                ],
              },
            ]}
          >
            {/* The bars already say "something's happening" — a "Listening…"
                label next to them is redundant, so the meta block is just
                level + timer. Vertical stacks the timer under the bars;
                horizontal keeps them side by side (see styles). */}
            <View style={isHorizontal ? styles.callPanelMetaHorizontal : styles.callPanelMetaVertical}>
              <EqualizerBars color={colors.mint} />
              <Text style={styles.callPanelTimer}>{formatElapsed(elapsedSec)}</Text>
            </View>
            <Pressable
              onPress={toggleMute}
              accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
              accessibilityRole="button"
              style={[styles.callPanelBtn, muted ? styles.callPanelBtnMuted : styles.callPanelBtnGray]}
            >
              <Icon name={muted ? 'mic_off' : 'mic'} size={17} color={muted ? '#fff' : colors.ink} />
            </Pressable>
            <Pressable onPress={endCall} accessibilityLabel="End call" accessibilityRole="button" style={[styles.callPanelBtn, styles.endCallBtn]}>
              <Icon name="call_end" size={17} color="#fff" />
            </Pressable>
          </Animated.View>
        ) : null}
        <Pressable onPress={onPress} accessibilityLabel={a11yLabel} accessibilityRole="button" style={styles.pressable}>
          <Animated.View style={[styles.fabRing, { opacity: entranceOpacity, transform: [{ scale: Animated.multiply(Animated.multiply(Animated.multiply(pulse, sizeScale), entranceScale), attentionScale) }, { rotate: roll }, { rotate: entranceRotate }, { rotate: attentionRotate }] }]}>
            <LinearGradient colors={FAB_GRADIENT} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fab}>
              {showRuby ? (
                <Image source={require('../../../assets/brand/agent-ruby.png')} style={styles.fabAvatar} resizeMode="cover" />
              ) : (
                <Icon name="headset_mic" size={MIC_ICON_SIZE} color="#fff" />
              )}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Vertical centre of the tab-bar notch, measured up from just above the home
// indicator (i.e. excluding insets.bottom). Tuned so the FAB nests in the notch
// exactly where the old raised avatar sat. (Bar height is 66.)
const TAB_NOTCH_CENTER = 65;
// How far to raise the floating FAB on screens that pin a bottom CTA bar, so the
// FAB clears the footer (button 54 + ~20 padding + a gap) and never overlaps it.
const FOOTER_CTA_LIFT = 78;
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
// The panel's "cross-axis" size: its height when horizontal, its width when
// vertical — the dimension perpendicular to how its contents stack.
const CALL_PANEL_CROSS = 52;
const CALL_BTN_SIZE = 38;

const styles = StyleSheet.create({
  glowWrap: { position: 'absolute', width: GLOW_SIZE, height: GLOW_SIZE, alignItems: 'center', justifyContent: 'center' },
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
  nudgeBubble: {
    maxWidth: 216, marginBottom: 12, marginRight: 4,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: colors.line,
    paddingVertical: 9, paddingHorizontal: 13,
    shadowColor: '#0A3F41', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  nudgeText: { ...font(700), fontSize: 12.5, color: colors.text, lineHeight: 17 },
  nudgeTail: {
    position: 'absolute', right: 22, bottom: -6, width: 12, height: 12,
    backgroundColor: '#fff', borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.line,
    transform: [{ rotate: '45deg' }],
  },
  fabZone: { width: HALO_SIZE, height: HALO_SIZE, alignItems: 'center', justifyContent: 'center' },
  pressable: { alignItems: 'center', justifyContent: 'center' },
  // The frosted "growing out of the FAB" panel. No native blur view is wired
  // up in this project (see CLAUDE.md — no Expo, and no
  // @react-native-community/blur dependency either), so this approximates
  // frosted glass with a translucent light-gray fill instead of a real blur.
  callPanel: {
    position: 'absolute',
    backgroundColor: 'rgba(244,247,246,0.97)',
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  callPanelHorizontal: {
    right: HALO_SIZE,
    top: (HALO_SIZE - CALL_PANEL_CROSS) / 2,
    height: CALL_PANEL_CROSS,
    borderRadius: CALL_PANEL_CROSS / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  callPanelVertical: {
    bottom: HALO_SIZE,
    right: (HALO_SIZE - CALL_PANEL_CROSS) / 2,
    width: CALL_PANEL_CROSS,
    borderRadius: CALL_PANEL_CROSS / 2,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  // Horizontal: bars beside the timer, both beside the buttons. Vertical: the
  // timer sits directly under the bars, stacked as one small block above the
  // mic/end-call buttons.
  callPanelMetaHorizontal: { flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 34 },
  callPanelMetaVertical: { flexDirection: 'column', alignItems: 'center', gap: 3, marginBottom: 14 },
  callPanelTimer: { ...font(600), fontSize: 10.5, color: colors.muted },
  callPanelBtn: {
    width: CALL_BTN_SIZE,
    height: CALL_BTN_SIZE,
    borderRadius: CALL_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callPanelBtnGray: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  callPanelBtnMuted: { backgroundColor: colors.amber },
  endCallBtn: { backgroundColor: colors.redDeep },
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
  eqRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 },
  eqBar: { width: 3.5, borderRadius: 2 },
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
