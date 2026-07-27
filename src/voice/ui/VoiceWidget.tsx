import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { colors, font } from '../../theme/tokens';
import { useT } from '../../state/store';
import { agent } from '../index';
import { ELLO_CONFIGURED } from '../config';
import { vlog } from '../log';
import type { AgentStatus } from '../types';

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
          Animated.timing(pulse, { toValue: 1.22, duration: 480, useNativeDriver: true }),
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
      <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button">
        <Animated.View
          style={[styles.fab, { transform: [{ scale: pulse }], backgroundColor: active ? colors.mint : colors.primary }]}
        >
          <Icon name={active ? 'call_end' : 'mic'} size={24} color="#fff" />
        </Animated.View>
      </Pressable>
      <Text style={[font(600), styles.statusText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 18, alignItems: 'flex-end' },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#143C3A',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  statusText: { fontSize: 10, color: colors.textSoft, marginTop: 4, marginRight: 4 },
});
