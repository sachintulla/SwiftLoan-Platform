import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions, Image, StatusBar } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { font } from '../theme/tokens';
import { playSfx } from '../utils/sfx';
import { reportHandoffSource } from '../utils/handoff';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE = 128;

// The splash background is the SAME green as the logo's tile, so the tile blends
// into the screen and the whole thing reads as the brand mark, not a tile
// floating on a contrasting ground. Sampled from the app-icon tile (TL → BR).
const SPLASH_BG: string[] = ['#10B6A3', '#20B395', '#2EB184'];

/**
 * Brand splash: the full SwiftLoan lockup (mark + wordmark + tagline) on the
 * brand-green ground, matching the native launch screen exactly so the launch →
 * JS splash hand-off is seamless. A gentle float + a dual-ring loader keep it
 * feeling alive while the app boots; ambient orbs drift behind. The mark and
 * wordmark are also handed off to the next screen (privacy / language).
 */
export default function Splash() {
  const float = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  const orbs = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  // Refs used to hand the logo/wordmark off to the next screen (magic-move).
  const logoRef = useRef<View>(null);
  const wordRef = useRef<View>(null);

  useEffect(() => {
    // Spoken brand welcome ("Welcome to SwiftLoan", with a soft chime lead-in) —
    // the earliest point audio can start (the static launch screen can't).
    playSfx('welcome');

    // Gentle continuous float + dual-ring loader.
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

    // Record the mark + wordmark positions so the next screen animates the same
    // element in from here (magic-move).
    const t = setTimeout(() => {
      reportHandoffSource('logo', logoRef);
      reportHandoffSource('wordmark', wordRef);
    }, 400);
    return () => clearTimeout(t);
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

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spin2Deg = spin2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View style={styles.fill}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* Full-bleed green gradient — matches the logo tile so the mark blends in. */}
      <LinearGradient colors={SPLASH_BG} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill}>
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
          {/* Logo mark (full app icon) with a gentle float. */}
          <Animated.View style={{ transform: [{ translateY: floatY }] }}>
            <View style={styles.tileClip} ref={logoRef}>
              <Image source={require('../../assets/brand/logo.png')} resizeMode="contain" style={styles.mark} />
            </View>
          </Animated.View>

          {/* Wordmark */}
          <View style={styles.word} ref={wordRef}>
            <Animated.Text style={[font(800), styles.wordText, { color: '#FFFFFF' }]}>Swift</Animated.Text>
            <Animated.Text style={[font(800), styles.wordText, { color: '#DFF6EC' }]}>Loan</Animated.Text>
          </View>

          {/* Tagline */}
          <View style={styles.tagRow}>
            {['FAST', 'FAIR', 'SECURE'].map((w, i) => (
              <React.Fragment key={w}>
                {i > 0 ? <Animated.Text style={[font(600), styles.tag, styles.tagDot]}>·</Animated.Text> : null}
                <Animated.Text style={[font(600), styles.tag]}>{w}</Animated.Text>
              </React.Fragment>
            ))}
          </View>

          {/* Dual-ring loader */}
          <View style={styles.loader}>
            <Animated.View style={[styles.ring, { borderTopColor: 'transparent', transform: [{ rotate: spinDeg }] }]} />
            <Animated.View style={[styles.ring2, { borderBottomColor: 'transparent', transform: [{ rotate: spin2Deg }] }]} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const ORB_CFG = [
  { size: 220, left: -70, top: 90, travel: 40, color: 'rgba(47,177,131,0.16)', min: 0.05, max: 0.2 },
  { size: 150, left: SCREEN_W - 90, top: 60, travel: -34, color: 'rgba(12,182,166,0.16)', min: 0.04, max: 0.18 },
  { size: 120, left: SCREEN_W - 140, top: 560, travel: 30, color: 'rgba(191,243,230,0.12)', min: 0.03, max: 0.16 },
  { size: 90, left: 30, top: 620, travel: -26, color: 'rgba(255,255,255,0.08)', min: 0.03, max: 0.12 },
];

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute' },
  tileClip: { width: TILE, height: TILE, borderRadius: TILE * 0.29, overflow: 'hidden' },
  mark: { width: TILE, height: TILE },
  word: { flexDirection: 'row', marginTop: 26 },
  wordText: { fontSize: 44, letterSpacing: -1.4, lineHeight: 46 },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  tag: { fontSize: 11.5, color: '#DFF6EC', letterSpacing: 3.5 },
  tagDot: { marginHorizontal: 5, letterSpacing: 0 },
  loader: { marginTop: 32, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: '#EAFBF3' },
  ring2: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
});
