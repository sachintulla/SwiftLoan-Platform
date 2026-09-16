import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { colors, font } from '../theme/tokens';
import { useT } from '../state/store';
import { subscribeOfflineAttempts } from '../state/offlineBridge';

// How long the banner stays up after one internet-dependent action fails.
// Long enough to read and act on, short enough not to linger once the user
// has moved on to something that doesn't need the network.
const ATTEMPT_FLASH_MS = 6000;

/**
 * Non-blocking top banner — never a modal, never shown just because the
 * device happens to be offline. Most of SwiftLoan needs no network at all
 * (choosing a language, browsing loan types, filling in a draft form), so an
 * ambient "you're offline" banner would nag about something that doesn't
 * matter yet. Instead this only appears the moment an internet-dependent
 * action actually fails — tapping the voice agent, sending/verifying an OTP,
 * submitting the application, etc. — all of which funnel through either
 * src/api/client.ts's request() or the voice agent, both of which call
 * reportOfflineAttempt() (see src/state/offlineBridge.ts) when they can't
 * reach the network. @react-native-community/netinfo backs the connectivity
 * checks those call sites make, and covers Android + iOS from one JS API, so
 * this single component (mounted once in App.tsx) needs no per-platform code.
 */
export default function OfflineNotice() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(
    () =>
      subscribeOfflineAttempts(() => {
        setVisible(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => dismiss(), ATTEMPT_FLASH_MS);
      }),
    [],
  );
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  function dismiss() {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Animated.View
        style={[
          styles.banner,
          {
            marginTop: insets.top + 8,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          },
        ]}
      >
        <View style={styles.iconCircle}>
          <Icon name="error" size={17} color={colors.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t.networkOfflineTitle}</Text>
          <Text style={styles.message} numberOfLines={2}>
            {t.networkOfflineMessage}
          </Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.dismiss}>{t.networkOfflineDismiss}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 460,
    marginHorizontal: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: colors.inkDeep,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(245,166,36,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 13, lineHeight: 17, ...font(800) },
  message: { color: '#B9D3D2', fontSize: 12, lineHeight: 16, marginTop: 1, ...font(400) },
  dismiss: { color: colors.mint, fontSize: 12.5, paddingLeft: 4, ...font(800) },
});
