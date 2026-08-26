import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { LogoMark, Wordmark } from '../components/Logo';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api } from '../api/client';
import { saveOffersCache } from '../state/session';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

// Center logo tile size + where each of the three speed lines sits within it
// (offsets from the tile centre), measured from the logo's own static lines so
// the animated streaks land exactly over them. Same geometry as the splash.
const TILE = 128;
const LINES = [
  { tx: -34, ty: -18, w: 32 },
  { tx: -38, ty: 0, w: 34 },
  { tx: -32, ty: 18, w: 32 },
];

/** A four-point twinkle star. */
function Sparkle({ size, color = colors.mint }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z"
        fill={color}
      />
    </Svg>
  );
}

export default function Finding() {
  const { state, go, set, mergeApiContext } = useStore();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const tw1 = useRef(new Animated.Value(0)).current;
  const tw2 = useRef(new Animated.Value(0)).current;
  const streaks = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  // Run the real prequalification (generates partner offers) while the loader
  // animates, then advance to the offers screen. Keeps a ~2.6s minimum on screen.
  useEffect(() => {
    let done = false;
    const started = Date.now();
    // On success (offers returned) go straight to My Offers, which now shows the
    // results — the old "Review your offers" screen is only used for the
    // error/empty case. Keeps a ~2.6s minimum on the loader.
    const finish = (hasOffers: boolean) => {
      if (done) return;
      done = true;
      const wait = Math.max(0, 2600 - (Date.now() - started));
      setTimeout(() => go(hasOffers ? 'fare' : 'offers'), wait);
    };
    if (state.applicationId) {
      api.prequalify(state.applicationId)
        .then((res: any) => {
          const { offers, friendlyError } = res as any;
          const list = offers || [];
          set({ offersError: friendlyError || '' });
          mergeApiContext({ prequalifyResult: { offers, friendlyError } });
          if (list.length > 0) {
            // Cache so My Offers renders instantly (before its own re-fetch).
            saveOffersCache({ applicationId: state.applicationId!, savedAt: Date.now(), offers: list });
          }
          finish(list.length > 0);
        })
        .catch(() => {
          set({ offersError: 'We couldn’t reach our lending partners just now. Please check your connection and try again.' });
          finish(false);
        });
    } else {
      setTimeout(() => finish(false), 100); // demo path (no live application)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    const twinkle = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
    twinkle(tw1, 0).start();
    twinkle(tw2, 500).start();
    // Speed lines repeatedly rush in from the left over the mark — conveys the
    // "swift" motion while offers load. Staggered so they read as a whoosh.
    streaks.forEach((v, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.delay(360 - i * 160),
        ]),
      ).start();
    });
    Animated.timing(prog, { toValue: 1, duration: 2600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pulse, prog, spin, tw1, tw2, streaks]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const width = prog.interpolate({ inputRange: [0, 1], outputRange: ['6%', '100%'] });

  return (
    <Screen variant="app" scroll={false} padded={false}>
      <View style={[styles.wrap, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
        {/* brand lockup */}
        <View style={styles.brand}>
          <View style={styles.lockup}>
            <LogoMark size={40} style={{ borderRadius: 12 }} />
            <Wordmark size={28} />
          </View>
          <Text style={[font(500), styles.tagline]}>Smart loans. Swift solutions.</Text>
        </View>

        {/* orbiting logo */}
        <View style={styles.stage}>
          <AnimatedSvg
            width={260}
            height={260}
            viewBox="0 0 260 260"
            style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
          >
            <Circle
              cx={130}
              cy={130}
              r={116}
              fill="none"
              stroke={colors.mint}
              strokeOpacity={0.4}
              strokeWidth={2}
              strokeDasharray="1 10"
              strokeLinecap="round"
            />
            <Circle cx={130} cy={14} r={5} fill={colors.mint} />
          </AnimatedSvg>

          <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale }] }]} />
          <Animated.View style={{ transform: [{ scale }] }}>
            <View style={styles.tile}>
              <Image source={require('../../assets/brand/logo.png')} resizeMode="contain" style={styles.mark} />
              {/* animated speed lines sweeping in over the mark's static lines */}
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {streaks.map((v, i) => {
                  const L = LINES[i];
                  const flyX = v.interpolate({ inputRange: [0, 0.55, 1], outputRange: [-40, 0, 0] });
                  const op = v.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: [0, 1, 1, 0] });
                  return (
                    <Animated.View
                      key={i}
                      style={[
                        styles.streak,
                        { width: L.w, left: TILE / 2 + L.tx - L.w / 2, top: TILE / 2 + L.ty - 3, opacity: op, transform: [{ translateX: flyX }] },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          </Animated.View>

          <Animated.View style={[styles.sparkle, { top: 22, right: 24, opacity: tw1, transform: [{ scale: tw1 }] }]}>
            <Sparkle size={22} />
          </Animated.View>
          <Animated.View style={[styles.sparkle, { top: 118, left: 8, opacity: tw2, transform: [{ scale: tw2 }] }]}>
            <Sparkle size={16} color={colors.primary} />
          </Animated.View>
        </View>

        {/* copy */}
        <Text style={[font(800), styles.title]}>Finding your personalised offers…</Text>
        <Text style={[font(400), styles.sub]}>Connecting to bureaus securely</Text>

        {/* progress */}
        <View style={styles.track}>
          <Animated.View style={{ width, height: '100%' }}>
            <LinearGradient
              colors={[colors.mint, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fill}
            />
          </Animated.View>
        </View>

        <View style={styles.stepRow}>
          <View style={styles.shield}>
            <Icon name="verified_user" size={18} color="#fff" />
          </View>
          <Text style={[font(700), styles.stepText]}>Checking your eligibility</Text>
        </View>

        <View style={{ flex: 1 }} />

        {/* safe-data card */}
        <View style={styles.safeCard}>
          <View style={styles.lockCircle}>
            <Icon name="lock" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), styles.safeTitle]}>Your data is safe with us</Text>
            <Text style={[font(400), styles.safeBody]}>
              We run a soft enquiry only · does not affect your credit score
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginTop: 8 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tagline: { fontSize: 14, color: '#7E9291', marginTop: 12 },
  stage: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },
  halo: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: 'rgba(47,177,131,0.12)',
  },
  sparkle: { position: 'absolute' },
  tile: {
    width: TILE,
    height: TILE,
    shadowColor: '#2FB183',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  mark: { width: TILE, height: TILE },
  streak: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.92)' },
  title: {
    fontSize: 23,
    letterSpacing: -0.4,
    color: colors.text,
    marginTop: 24,
    textAlign: 'center',
  },
  sub: { fontSize: 14.5, color: colors.textSoft, marginTop: 10, textAlign: 'center' },
  track: {
    width: '86%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(120,150,148,0.18)',
    marginTop: 26,
    overflow: 'hidden',
  },
  fill: { flex: 1, borderRadius: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  shield: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 15, color: colors.text },
  safeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    backgroundColor: 'rgba(47,177,131,0.08)',
    borderRadius: 18,
    padding: 16,
  },
  lockCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(47,177,131,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeTitle: { fontSize: 14.5, color: colors.text },
  safeBody: { fontSize: 12.5, color: colors.textSoft, marginTop: 3, lineHeight: 18 },
});
