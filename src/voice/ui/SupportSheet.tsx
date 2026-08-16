import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from '../../components/Icon';
import { colors, font } from '../../theme/tokens';
import { useStore } from '../../state/store';
import { agent } from '../index';
import type { AgentStatus } from '../types';

/** One tappable support option row (icon tile + title + subtitle + chevron). */
function OptionRow({
  icon, tile, bg, title, sub, onPress,
}: { icon: string; tile: string; bg: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable style={styles.optRow} onPress={onPress} accessibilityLabel={title}>
      <View style={[styles.optTile, { backgroundColor: bg }]}>
        <Icon name={icon} size={22} color={tile} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{title}</Text>
        <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 2 }]}>{sub}</Text>
      </View>
      <Icon name="chevron_right" size={22} color={colors.muted} />
    </Pressable>
  );
}

/** Ruby portrait in a breathing gradient ring — the live-voice indicator. */
function VoiceOrb({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    l.start();
    return () => l.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [active ? 0.45 : 0.22, 0] });
  return (
    <View style={styles.orbWrap}>
      <Animated.View style={[styles.orbPulse, { transform: [{ scale }], opacity }]} pointerEvents="none" />
      <LinearGradient colors={[colors.primary, colors.mint]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.orbRing}>
        <View style={styles.orbAvatar}>
          <Image source={require('../../../assets/brand/agent-ruby.png')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      </LinearGradient>
    </View>
  );
}

/**
 * Support sheet (store.supportOpen). A bottom sheet with 3 help options + a
 * rating row. "Talk to us" starts the Ruby voice session and switches to a
 * status view that walks the user through initialising → connecting → listening
 * → speaking, so they stay engaged until Ruby actually starts talking.
 */
export default function SupportSheet() {
  const { state, set, go } = useStore();
  const insets = useSafeAreaInsets();
  const open = state.supportOpen;
  const slide = useRef(new Animated.Value(0)).current;
  const [mode, setMode] = useState<'menu' | 'voice'>('menu');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [initialising, setInitialising] = useState(false);
  const [rating, setRating] = useState(0);

  useEffect(() => agent.on('statusChange', setStatus), []);

  useEffect(() => {
    Animated.timing(slide, { toValue: open ? 1 : 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (open) setMode('menu');
  }, [open, slide]);

  // If the session ends while we're in the voice view, fall back to the menu.
  useEffect(() => {
    if (mode === 'voice' && !initialising && (status === 'idle' || status === 'ended')) setMode('menu');
  }, [status, mode, initialising]);

  if (!open) return null;

  const close = () => {
    if (status !== 'idle' && status !== 'ended') agent.stop().catch(() => {});
    set({ supportOpen: false });
  };
  const talkToUs = () => {
    setMode('voice');
    setInitialising(true);
    agent.start().catch(() => {}).finally(() => setInitialising(false));
  };
  const endVoice = () => { agent.stop().catch(() => {}); setMode('menu'); };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] });
  const backdropOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const statusText =
    initialising ? 'Initialising…'
      : status === 'connecting' ? 'Connecting…'
        : status === 'listening' ? 'Listening…'
          : status === 'speaking' ? 'Ruby is speaking…'
            : status === 'executingTool' ? 'Working on it…'
              : 'Connecting…';
  const statusSub =
    status === 'listening' ? 'Go ahead — I’m listening.'
      : status === 'speaking' ? 'Ruby is responding to you.'
        : 'Ruby is getting ready to help you.';

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close support" onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 18, transform: [{ translateY }] }]}>
        <View style={styles.grabber} />

        {mode === 'menu' ? (
          <>
            <Text style={[font(800), { fontSize: 20, color: colors.text }]}>Hi! How can I help you today?</Text>
            <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4, marginBottom: 14 }]}>
              Our AI Support is here to assist you 24/7
            </Text>

            <OptionRow icon="headset_mic" tile={colors.primary} bg="#E1F3F3" title="Talk to us" sub="Connect with our support executive" onPress={talkToUs} />
            <OptionRow icon="chat" tile={colors.blue} bg="#E6F0F6" title="Chat with AI Assistant" sub="Get instant answers to your queries" onPress={talkToUs} />
            <OptionRow icon="help" tile="#7A5AF8" bg="#EEEAFE" title="Need help with a loan?" sub="We'll guide you step by step" onPress={() => { set({ supportOpen: false }); go('help'); }} />

            <Text style={[font(600), { fontSize: 13, color: colors.textMid, textAlign: 'center', marginTop: 16 }]}>How was your experience?</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`Rate ${n} star`}>
                  <Icon name="star" size={30} color={n <= rating ? colors.gold : colors.trackOff} />
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <VoiceOrb active={status === 'listening' || status === 'speaking'} />
            <Text style={[font(800), { fontSize: 19, color: colors.text, marginTop: 18 }]}>{statusText}</Text>
            <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 6, textAlign: 'center' }]}>{statusSub}</Text>
            <Pressable onPress={endVoice} style={styles.endBtn} accessibilityLabel="End call">
              <Icon name="call_end" size={18} color="#fff" />
              <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>End</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(10,42,43,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.trackOff, marginBottom: 16 },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  optTile: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10 },
  orbWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  orbPulse: { position: 'absolute', width: 84, height: 84, borderRadius: 42, backgroundColor: colors.mint },
  orbRing: { width: 84, height: 84, borderRadius: 42, padding: 4, alignItems: 'center', justifyContent: 'center' },
  orbAvatar: { width: '100%', height: '100%', borderRadius: 38, overflow: 'hidden', backgroundColor: colors.chip },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.redDeep,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 22,
  },
});
