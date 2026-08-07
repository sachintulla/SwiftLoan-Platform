import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors } from '../../theme/tokens';
import { useT } from '../../state/store';
import { agent } from '../index';
import { ELLO_CONFIGURED } from '../config';
import { vlog } from '../log';
import type { AgentStatus } from '../types';

// The button itself is always the same brand gradient — only the bars (and
// the fast ripple while active) change color, so the circle reads as one
// consistent "this is the assistant" affordance rather than something that
// looks different every time you glance at it.
const FAB_GRADIENT: [string, string] = [colors.primary, '#0CB6A6'];

// Listening (the user's turn) and speaking (the agent's turn) are deliberately
// different hues — mint vs. blue — not just shades of one color, since that's
// the one distinction that matters most to see at a glance.
const STATE_ACCENT: Record<AgentStatus, string> = {
  idle: '#fff',
  connecting: colors.amber,
  listening: colors.mint,
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

/** Floating mic FAB — a constant-color button; bars + ripple carry all state color. */
export default function VoiceWidget() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [status, setStatus] = useState<AgentStatus>('idle');
  const pulse = useRef(new Animated.Value(1)).current;

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
    vlog('FAB tapped; status=', status, 'active=', active);
    if (active) {
      agent.stop().catch(e => vlog('agent.stop() rejected:', e?.message || String(e)));
    } else {
      agent.start().catch(e => vlog('agent.start() rejected:', e?.message || String(e)));
    }
  };

  // Fixed high offset so the FAB clears both BottomNav (~90pt) and Toast
  // (anchored at 104+insets.bottom) on every screen without needing to know
  // per-screen whether either is present.
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: 176 + insets.bottom }]}>
      <View style={styles.fabZone}>
        <IdleHalo />
        <Ripple active={showBars} delay={0} color={accent} />
        <Ripple active={showBars} delay={550} color={accent} />
        <Pressable onPress={onPress} accessibilityLabel={a11yLabel} accessibilityRole="button" style={styles.pressable}>
          <Animated.View style={[styles.fabRing, { transform: [{ scale: pulse }] }]}>
            <LinearGradient colors={FAB_GRADIENT} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fab}>
              {showBars ? <EqualizerBars color={accent} /> : <Icon name={active ? 'call_end' : 'mic'} size={25} color="#fff" />}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const FAB_SIZE = 60;
const RIPPLE_SIZE = FAB_SIZE + 8;
const HALO_SIZE = FAB_SIZE + 20;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 18, alignItems: 'center' },
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
  },
  eqRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 },
  eqBar: { width: 3.5, borderRadius: 2 },
});
