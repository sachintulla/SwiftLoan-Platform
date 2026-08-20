import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, PanResponder, Platform, Pressable, StyleSheet, Text, Vibration, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors, font } from '../../theme/tokens';
import { useStore, useT } from '../../state/store';
import { loadVoiceFabSide, saveVoiceFabSide } from '../../state/session';
import { agent } from '../index';
import { ELLO_CONFIGURED } from '../config';
import { vlog } from '../log';
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
const SCREENS_WITH_BOTTOM_NAV = new Set(['explore', 'fare', 'help', 'home', 'loans', 'profile']);

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
 * A slow, continuous "breathing" halo — plays even at rest, before the user
 * has ever tapped the button, so the button reads as an interactive,
 * always-listening assistant rather than a static icon.
 */
function IdleHalo() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.06] });
  return <Animated.View style={[styles.halo, { transform: [{ scale }], opacity }]} pointerEvents="none" />;
}

/** One expanding-and-fading ring, looped with a start delay for a staggered ripple — only while active. */
function Ripple({ active, delay, color }: { active: boolean; delay: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); v.setValue(0); };
  }, [active, delay, v]);

  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] });
  return <Animated.View style={[styles.ripple, { backgroundColor: color, transform: [{ scale }], opacity }]} pointerEvents="none" />;
}

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

/** Floating mic FAB — a constant-color button; bars + ripple carry all state color. */
export default function VoiceWidget() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { state } = useStore();
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

  useEffect(() => agent.on('statusChange', setStatus), []);

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
  // On bottom-nav screens the assistant lives in the tab bar (the Ruby tab), so
  // the floating FAB only shows on the pre-dashboard screens (onboarding/funnel).
  if (SCREENS_WITH_BOTTOM_NAV.has(state.screen)) return null;

  // 'connecting' counts as active so a second tap hangs up mid-dial rather than
  // being ignored (agent.start() unwinds via its start-token check).
  const active = status !== 'idle' && status !== 'ended';
  const showBars = status === 'listening' || status === 'speaking' || status === 'executingTool';
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

  const onPress = () => {
    // Android: the voice FAB is intentionally a no-op for now — tapping it does
    // nothing (voice is iOS-only until the Android audio path is ready).
    if (Platform.OS === 'android') return;
    vlog('FAB tapped; status=', status, 'active=', active);
    Vibration.vibrate(20); // small haptic to confirm the tap registered
    if (active) {
      agent.stop().catch(e => vlog('agent.stop() rejected:', e?.message || String(e)));
    } else {
      agent.start().catch(e => vlog('agent.start() rejected:', e?.message || String(e)));
    }
  };

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
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { right: EDGE_MARGIN, bottom: 24 + insets.bottom }]}
    >
      {/* Always-visible status so the user knows when it's connected & their turn. */}
      {active ? (
        <View style={styles.statusPill} pointerEvents="none">
          <View style={[styles.statusDot, { backgroundColor: status === 'listening' ? colors.green : accent }]} />
          <Text style={styles.statusText}>{a11yLabel}</Text>
        </View>
      ) : null}
      <View style={styles.fabZone}>
        <IdleHalo />
        <Ripple active={showBars} delay={0} color={accent} />
        <Ripple active={showBars} delay={550} color={accent} />
        <Pressable onPress={onPress} accessibilityLabel={a11yLabel} accessibilityRole="button" style={styles.pressable}>
          <Animated.View style={[styles.fabRing, { transform: [{ scale: pulse }] }]}>
            <LinearGradient colors={FAB_GRADIENT} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fab}>
              {active ? (
                // Same pattern as the tab-bar Ruby FAB: headphones at idle, and
                // when the session is live Ruby's portrait takes over the circle.
                <Image source={require('../../../assets/brand/agent-ruby.png')} style={styles.fabAvatar} resizeMode="cover" />
              ) : (
                <Icon name="headset_mic" size={MIC_ICON_SIZE} color="#fff" />
              )}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// iOS renders this FAB visibly larger than Android at the same point size.
const FAB_SIZE = Platform.OS === 'ios' ? 50 : 60;
const MIC_ICON_SIZE = Platform.OS === 'ios' ? 21 : 25;
const RIPPLE_SIZE = FAB_SIZE + 8;
const HALO_SIZE = FAB_SIZE + 20;
const ROBOT_HEAD_W = Platform.OS === 'ios' ? 24 : 28;
const ROBOT_HEAD_H = Platform.OS === 'ios' ? 20 : 24;

const styles = StyleSheet.create({
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
  fabZone: { width: HALO_SIZE, height: HALO_SIZE, alignItems: 'center', justifyContent: 'center' },
  pressable: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: colors.primary,
  },
  ripple: {
    position: 'absolute',
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
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
