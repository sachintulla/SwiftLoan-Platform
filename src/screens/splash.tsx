import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions, Image, StatusBar } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { font } from '../theme/tokens';
import { reportHandoffSource } from '../utils/handoff';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE = 128;

// The splash background is the SAME green as the logo's tile, so the tile blends
// into the screen and the whole thing reads as the brand mark. Sampled from the
// app-icon tile (TL → BR).
const SPLASH_BG: string[] = ['#10B6A3', '#20B395', '#2EB184'];

// Where each speed line lands (offset in the 128-tile from centre) + width/colour,
// measured from the logo's own static lines so the flown-in lines complete the mark.
const LINES = [
  { tx: -34, ty: -18, w: 32, color: 'rgb(98,205,189)' },
  { tx: -38, ty: 0, w: 34, color: 'rgb(152,220,210)' },
  { tx: -32, ty: 18, w: 32, color: 'rgb(214,241,236)' },
];

/**
 * Brand splash with a mark-assembly animation: the base is the logo WITHOUT its
 * speed lines; the three lines rush in from the left and land exactly where the
 * static lines sit — assembling the ₹ mark — as "SwiftLoan" + FAST·FAIR·SECURE
 * reveal. The native launch screen shows the same lines-less mark, so the launch
 * → JS splash hand-off flows straight into the assembly. The mark and wordmark
 * are also handed off to the next screen (privacy / language).
 */
export default function Splash() {
  const float = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  const orbs = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const streaks = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const pop = useRef(new Animated.Value(0)).current; // subtle mark pop as lines land
  const glow = useRef(new Animated.Value(0)).current; // continuous pulsing halo
  const breathe = useRef(new Animated.Value(0)).current; // continuous gentle scale
  const wSwift = useRef(new Animated.Value(0)).current;
  const wLoan = useRef(new Animated.Value(0)).current;
  const tagWords = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const logoRef = useRef<View>(null);
  const wordRef = useRef<View>(null);

  useEffect(() => {
    // Speed lines rush in from the left (staggered) and decelerate onto the mark.
    streaks.forEach((v, i) => {
      Animated.sequence([
        Animated.delay(140 + i * 150),
        Animated.timing(v, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
    // A small clean scale-pop of the mark once the lines have landed.
    Animated.sequence([
      Animated.delay(720),
      Animated.timing(pop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pop, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();

    // "SwiftLoan" reveals (word by word) as the lines reach the mark.
    Animated.sequence([
      Animated.delay(480),
      Animated.stagger(150, [
        Animated.spring(wSwift, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.spring(wLoan, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      ]),
    ]).start();
    // FAST · FAIR · SECURE — one word appears as each speed line lands.
    tagWords.forEach((v, i) => {
      Animated.sequence([
        Animated.delay(820 + i * 150),
        Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });

    // Continuous life so the splash never reads as static: a breathing mark and
    // a pulsing halo that keep going until the auto-transition to the next screen.
    loop(breathe, 2200);
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(200),
      ]),
    ).start();

    // Gentle continuous float + dual-ring loader + ambient orbs.
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

    // Record the mark + wordmark positions for the magic-move to the next screen.
    const t = setTimeout(() => {
      reportHandoffSource('logo', logoRef);
      reportHandoffSource('wordmark', wordRef);
    }, 1300);
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
  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.55] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spin2Deg = spin2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View style={styles.fill}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
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
          {/* Logo mark — lines-less base + the three lines flown in on top. */}
          <Animated.View style={{ transform: [{ translateY: floatY }, { scale: Animated.multiply(popScale, breatheScale) }] }}>
            {/* Continuous pulsing halo behind the mark. */}
            <Animated.View pointerEvents="none" style={[styles.halo, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
            <View style={styles.tileClip} ref={logoRef}>
              <Image source={require('../../assets/brand/logo_nolines.png')} resizeMode="contain" style={styles.mark} />
            </View>
            {/* Speed lines rush in and land on the mark (on top of the tile). */}
            <View style={styles.streakLayer} pointerEvents="none">
              {streaks.map((v, i) => {
                const L = LINES[i];
                const flyX = v.interpolate({ inputRange: [0, 1], outputRange: [-210, 0] });
                const op = v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] });
                return (
                  <Animated.View
                    key={i}
                    style={[styles.streak, { width: L.w, backgroundColor: L.color, left: TILE / 2 + L.tx - L.w / 2, top: TILE / 2 + L.ty - 3, opacity: op, transform: [{ translateX: flyX }] }]}
                  />
                );
              })}
            </View>
          </Animated.View>

          {/* Wordmark — reveals as the lines land */}
          <View style={styles.word} ref={wordRef}>
            <Animated.Text style={[font(800), styles.wordText, { color: '#FFFFFF' }, { opacity: wSwift, transform: [{ translateY: wSwift.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>Swift</Animated.Text>
            <Animated.Text style={[font(800), styles.wordText, { color: '#DFF6EC' }, { opacity: wLoan, transform: [{ translateY: wLoan.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>Loan</Animated.Text>
          </View>

          {/* Tagline — one word per speed line landing */}
          <View style={styles.tagRow}>
            {['FAST', 'FAIR', 'SECURE'].map((w, i) => (
              <React.Fragment key={w}>
                {i > 0 ? <Animated.Text style={[font(600), styles.tag, styles.tagDot, { opacity: tagWords[i] }]}>·</Animated.Text> : null}
                <Animated.Text style={[font(600), styles.tag, { opacity: tagWords[i], transform: [{ translateY: tagWords[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{w}</Animated.Text>
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
  streakLayer: { position: 'absolute', top: 0, left: 0, width: TILE, height: TILE },
  streak: { position: 'absolute', height: 6, borderRadius: 3 },
  halo: { position: 'absolute', width: 190, height: 190, borderRadius: 95, left: (TILE - 190) / 2, top: (TILE - 190) / 2, backgroundColor: 'rgba(234,251,243,0.55)' },
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
