import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors, font } from '../../theme/tokens';
import { useT } from '../../state/store';
import { agent } from '../index';
import { ELLO_CONFIGURED } from '../config';
import { vlog } from '../log';
import type { AgentStatus } from '../types';

const STATUS_DOT: Record<AgentStatus, string> = {
  idle: colors.muted,
  connecting: colors.amber,
  listening: colors.mint,
  speaking: colors.mint,
  executingTool: colors.amber,
  ended: colors.muted,
};

/** One expanding-and-fading ring, looped with a start delay for a staggered ripple. */
function Ripple({ active, delay }: { active: boolean; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); v.setValue(0); };
  }, [active, delay, v]);

  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] });
  return <Animated.View style={[styles.ripple, { transform: [{ scale }], opacity }]} pointerEvents="none" />;
}

/** Floating mic FAB — the RN replacement for the browser SDK's Shadow-DOM widget. */
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
          Animated.timing(pulse, { toValue: 1.1, duration: 480, useNativeDriver: true }),
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
  const rippling = status === 'listening' || status === 'speaking' || status === 'executingTool';
  const label =
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
        <Ripple active={rippling} delay={0} />
        <Ripple active={rippling} delay={550} />
        <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button" style={styles.pressable}>
          <Animated.View style={[styles.fabRing, { transform: [{ scale: pulse }] }]}>
            <LinearGradient
              colors={active ? [colors.mint, colors.greenDeep] : [colors.primary, '#0CB6A6']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.fab}
            >
              <Icon name={active ? 'call_end' : 'mic'} size={25} color="#fff" />
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
      <View style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: STATUS_DOT[status] }]} />
        <Text style={[font(600), styles.statusText]}>{label}</Text>
      </View>
    </View>
  );
}

const FAB_SIZE = 60;
const RIPPLE_SIZE = FAB_SIZE + 8;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 18, alignItems: 'center' },
  fabZone: { width: RIPPLE_SIZE, height: RIPPLE_SIZE, alignItems: 'center', justifyContent: 'center' },
  pressable: { alignItems: 'center', justifyContent: 'center' },
  ripple: {
    position: 'absolute',
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
    backgroundColor: colors.mint,
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    backgroundColor: 'rgba(10,63,65,0.82)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10.5, color: '#fff' },
});
