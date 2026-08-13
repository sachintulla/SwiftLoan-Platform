import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api } from '../api/client';

export default function Finding() {
  const { state, go, set } = useStore();
  const pulse = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;

  // Run the real prequalification (generates partner offers) while the loader
  // animates, then advance to the offers screen. Keeps a ~2.6s minimum on screen.
  useEffect(() => {
    let done = false;
    const started = Date.now();
    const finish = () => {
      if (done) return;
      done = true;
      const wait = Math.max(0, 2600 - (Date.now() - started));
      setTimeout(() => go('offers'), wait);
    };
    if (state.applicationId) {
      api.prequalify(state.applicationId)
        .then((res) => {
          // Carry any lender-side guidance to the offers screen's empty state.
          set({ offersError: (res as any)?.friendlyError || '' });
          finish();
        })
        .catch(() => {
          set({ offersError: 'We couldn’t reach our lending partners just now. Please check your connection and try again.' });
          finish();
        });
    } else {
      setTimeout(finish, 100); // demo path (no live application)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    Animated.timing(prog, { toValue: 1, duration: 2600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pulse, prog]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const width = prog.interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] });

  return (
    <Screen scroll={false} padded>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[styles(colors).orb, { transform: [{ scale }] }]}>
          <Icon name="description" size={44} color="#fff" />
        </Animated.View>
        <Text style={[font(800), { fontSize: 22, letterSpacing: -0.4, color: colors.text, marginTop: 30, textAlign: 'center' }]}>
          Finding your personalised offers…
        </Text>
        <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 8 }]}>Connecting to bureaus…</Text>

        <View style={styles(colors).progTrack}>
          <Animated.View style={[styles(colors).progFill, { width }]} />
        </View>
        <Text style={[font(600), { fontSize: 12.5, color: colors.textMid, marginTop: 12 }]}>Checking your eligibility</Text>
        <Text style={[font(400), { fontSize: 11.5, color: colors.muted, marginTop: 20 }]}>
          Soft enquiry only · does not affect your credit score
        </Text>
      </View>
    </Screen>
  );
}

const styles = (c: typeof colors) => ({
  orb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: c.primary,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  progTrack: { width: 220, height: 6, borderRadius: 3, backgroundColor: 'rgba(120,150,148,0.2)', marginTop: 28, overflow: 'hidden' as const },
  progFill: { height: 6, borderRadius: 3, backgroundColor: c.mint },
});
