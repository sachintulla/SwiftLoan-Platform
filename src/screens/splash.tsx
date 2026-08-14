import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Screen } from '../components/Frame';
import { font, heroGradient } from '../theme/tokens';

const AnimatedLG = Animated.createAnimatedComponent(LinearGradient);
const { width: SCREEN_W } = Dimensions.get('window');
const TILE = 128;

/**
 * Creative animated splash built around the SwiftLoan app icon (₹ + speed
 * lines). The mark springs in with a glow, motion "speed streaks" whoosh past
 * it (echoing the logo's own speed lines), a light sweeps across the tile, then
 * the wordmark reveals word-by-word and the tagline expands — all resolving
 * within the 2.6s splash→language auto-transition.
 */
export default function Splash() {
  const tileScale = useRef(new Animated.Value(0.6)).current;
  const tileOpacity = useRef(new Animated.Value(0)).current;
  const tileX = useRef(new Animated.Value(-40)).current; // slides in from the left, like it's speeding in
  const glow = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const wSwift = useRef(new Animated.Value(0)).current;
  const wLoan = useRef(new Animated.Value(0)).current;
  const tag = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  const streaks = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const orbs = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Mark speeds in from the left + pops
    Animated.parallel([
      Animated.timing(tileOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(tileScale, { toValue: 1, friction: 6, tension: 65, useNativeDriver: true }),
      Animated.spring(tileX, { toValue: 0, friction: 7, tension: 55, useNativeDriver: true }),
    ]).start();

    // Speed streaks whoosh past (staggered), echoing the logo's motion lines
    streaks.forEach((v, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(200 + i * 180),
          Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(600),
        ]),
      ).start();
    });

    // Light sweep across the tile, twice
    Animated.sequence([
      Animated.delay(520),
      Animated.timing(shine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(shine, { toValue: 2, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();

    // Wordmark reveals word-by-word, then tagline expands
    Animated.sequence([
      Animated.delay(700),
      Animated.stagger(150, [
        Animated.spring(wSwift, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.spring(wLoan, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      ]),
      Animated.timing(tag, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    // Continuous glow, float, dual rings
    loop(glow, 1300);
    loop(float, 1800);
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(spin2, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true })).start();
    orbs.forEach((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 260),
          Animated.timing(v, { toValue: 1, duration: 2600 + i * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 2600 + i * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loop(v: Animated.Value, dur: number) {
    Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.35] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] });
  const shineX = shine.interpolate({ inputRange: [0, 1, 2], outputRange: [-TILE, TILE, TILE] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spin2Deg = spin2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <Screen scroll={false} padded={false} variant="plain">
      <LinearGradient colors={[...heroGradient, '#0CB6A6']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fill}>
        {/* Ambient drifting orbs */}
        {orbs.map((v, i) => {
          const cfg = ORB_CFG[i];
          const ty = v.interpolate({ inputRange: [0, 1], outputRange: [0, cfg.travel] });
          const op = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [cfg.min, cfg.max, cfg.min] });
          return (
            <Animated.View
              key={i}
              style={[styles.orb, { width: cfg.size, height: cfg.size, borderRadius: cfg.size / 2, left: cfg.left, top: cfg.top, backgroundColor: cfg.color, opacity: op, transform: [{ translateY: ty }] }]}
            />
          );
        })}

        <View style={styles.center}>
          {/* Speed streaks flying past behind the mark */}
          <View style={styles.streakWrap} pointerEvents="none">
            {streaks.map((v, i) => {
              const tx = v.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_W * 0.5, SCREEN_W * 0.6] });
              const op = v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.9, 0.9, 0] });
              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.streak,
                    { top: i * 22 - 22, width: STREAK_W[i], opacity: op, transform: [{ translateX: tx }] },
                  ]}
                />
              );
            })}
          </View>

          {/* Logo mark (app icon) with glow, float, slide-in + shine */}
          <Animated.View style={{ opacity: tileOpacity, transform: [{ translateX: tileX }, { translateY: floatY }, { scale: tileScale }] }}>
            <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
            <View style={styles.tileClip}>
              <Image source={require('../../assets/brand/logo.png')} resizeMode="contain" style={styles.mark} />
              <Animated.View style={[styles.shineWrap, { transform: [{ translateX: shineX }, { rotate: '18deg' }] }]}>
                <AnimatedLG colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.shine} />
              </Animated.View>
            </View>
          </Animated.View>

          {/* Wordmark — word by word */}
          <View style={styles.word}>
            <Animated.Text style={[font(800), styles.wordText, { color: '#FFFFFF' }, { opacity: wSwift, transform: [{ translateY: wSwift.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
              Swift
            </Animated.Text>
            <Animated.Text style={[font(800), styles.wordText, { color: '#BFF3E6' }, { opacity: wLoan, transform: [{ translateY: wLoan.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
              Loan
            </Animated.Text>
          </View>

          {/* Tagline — fades + rises in */}
          <Animated.Text style={[font(600), styles.tag, { opacity: tag, transform: [{ translateY: tag.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
            FAST · FAIR · SECURE
          </Animated.Text>

          {/* Dual-ring loader — part of the centered group so the whole block
              sits together rather than leaving a big gap to the bottom edge. */}
          <View style={styles.loader}>
            <Animated.View style={[styles.ring, { borderTopColor: 'transparent', transform: [{ rotate: spinDeg }] }]} />
            <Animated.View style={[styles.ring2, { borderBottomColor: 'transparent', transform: [{ rotate: spin2Deg }] }]} />
          </View>
        </View>
      </LinearGradient>
    </Screen>
  );
}

const STREAK_W = [120, 86, 150];
const ORB_CFG = [
  { size: 220, left: -70, top: 90, travel: 40, color: 'rgba(47,177,131,0.22)', min: 0.05, max: 0.28 },
  { size: 150, left: SCREEN_W - 90, top: 60, travel: -34, color: 'rgba(12,182,166,0.22)', min: 0.04, max: 0.24 },
  { size: 120, left: SCREEN_W - 140, top: 560, travel: 30, color: 'rgba(191,243,230,0.16)', min: 0.03, max: 0.2 },
  { size: 90, left: 30, top: 620, travel: -26, color: 'rgba(255,255,255,0.1)', min: 0.03, max: 0.16 },
];

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute' },
  streakWrap: { position: 'absolute', width: SCREEN_W, height: 120, alignItems: 'center', justifyContent: 'center' },
  streak: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  glow: {
    position: 'absolute', top: -TILE * 0.3, left: -TILE * 0.3,
    width: TILE * 1.6, height: TILE * 1.6, borderRadius: TILE * 0.8, backgroundColor: '#2FB183',
  },
  tileClip: { width: TILE, height: TILE, borderRadius: TILE * 0.29, overflow: 'hidden' },
  mark: { width: TILE, height: TILE },
  shineWrap: { position: 'absolute', top: -TILE * 0.4, height: TILE * 1.8, width: TILE * 0.5 },
  shine: { flex: 1, width: '100%' },
  word: { flexDirection: 'row', marginTop: 26 },
  wordText: { fontSize: 44, letterSpacing: -1.4, lineHeight: 46 },
  tag: { fontSize: 11.5, color: '#8FD9C9', marginTop: 12, letterSpacing: 3.5 },
  loader: { marginTop: 32, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: '#BFF3E6' },
  ring2: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)' },
});
