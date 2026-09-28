import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from './Icon';
import { colors, font, heroGradient } from '../theme/tokens';
import { useT } from '../state/store';

const STEP_MS = 1100; // pace while waiting on the API
const FINISH_MS = 280; // pace of the fast-forward once it has answered
const SLOW_MS = 8000; // after this, reassure that it's still working

const CARD_W = 200;
const CARD_H = 124;

/**
 * "Verifying your PAN" — rendered in place of the PAN form while the PAN
 * Comprehensive call runs (same design as the website's loader).
 *
 * Hero: a PAN card with a scanning beam inside pulsing viewfinder brackets
 * and a spinning "verifying" badge. Below, three steps: the active one gets
 * a spinning ring, completed ones pop into a green tick, and the connector
 * fills as they complete.
 *
 * Timing follows the real API call: while waiting, steps advance every
 * STEP_MS and the last one spins as long as it takes. When the caller flips
 * `done`, any remaining steps tick off quickly, all three show complete, and
 * `onFinished` fires — so a 2s, 4s or 16s response all end on a full set of
 * ticks. (On failure the caller just unmounts this; it never fakes success.)
 */
export function PanVerifyingLoader({ done = false, onFinished }: { done?: boolean; onFinished?: () => void }) {
  const t = useT();
  const STEPS = [
    { icon: 'document_scanner', label: t.panStepRead, hint: t.panStepReadHint },
    { icon: 'verified_user', label: t.panStepVerify, hint: t.panStepVerifyHint },
    { icon: 'how_to_reg', label: t.panStepFetch, hint: t.panStepFetchHint },
  ];
  // step === STEPS.length means every step is complete.
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    if (done) return;
    const iv = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => { clearInterval(iv); clearTimeout(slowTimer); };
  }, [done, STEPS.length]);

  useEffect(() => {
    if (!done) return;
    if (step < STEPS.length) {
      const tm = setTimeout(() => setStep(s => s + 1), FINISH_MS);
      return () => clearTimeout(tm);
    }
    // All ticked — hold a beat so the last tick is seen, then hand off.
    const tm = setTimeout(() => finished.current?.(), 450);
    return () => clearTimeout(tm);
  }, [done, step, STEPS.length]);

  const allDone = step >= STEPS.length;

  return (
    <View style={styles.wrap} accessible accessibilityRole="progressbar" accessibilityLabel={t.panVerifyingTitle}>
      <PanScanHero done={allDone} />

      <View style={{ alignItems: 'center', marginTop: 26 }}>
        <Text style={[font(800), styles.title]}>{allDone ? t.panVerifiedTitle : t.panVerifyingTitle}</Text>
        <Text style={[font(400), styles.sub]}>
          {allDone ? t.panVerifiedSub : slow ? t.panVerifySlow : t.panVerifyingSub}
        </Text>
      </View>

      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <StepRow key={s.label} {...s} state={i < step ? 'done' : i === step ? 'active' : 'todo'} last={i === STEPS.length - 1} doneLabel={t.panStepDone} />
        ))}
      </View>

      <View style={styles.safe}>
        <View style={styles.safeIc}><Icon name="lock" size={18} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>{t.panSafeTitle}</Text>
          <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft, marginTop: 1 }]}>{t.panSafeSub}</Text>
        </View>
      </View>
    </View>
  );
}

function useSpin(active: boolean, ms = 900) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    v.setValue(0);
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, ms, v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
}

/** A green tick that pops in (scale overshoot). */
function PopCheck({ size, iconSize }: { size: number; iconSize: number }) {
  const s = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [s]);
  return (
    <Animated.View style={[styles.check, { width: size, height: size, borderRadius: size / 2, transform: [{ scale: s }] }]}>
      <Icon name="check" size={iconSize} color="#fff" />
    </Animated.View>
  );
}

/** Partial ring that spins — the "working on it" indicator. */
function SpinRing({ size, color, width = 2.5 }: { size: number; color: string; width?: number }) {
  const rot = useSpin(true);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: width,
        borderColor: 'transparent', borderTopColor: color, borderRightColor: color,
        transform: [{ rotate: rot }],
      }}
    />
  );
}

function StepRow({ icon, label, hint, state, last, doneLabel }: {
  icon: string; label: string; hint: string; state: 'done' | 'active' | 'todo'; last: boolean; doneLabel: string;
}) {
  const fill = useRef(new Animated.Value(state === 'done' ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: state === 'done' ? 1 : 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [state, fill]);
  return (
    <View style={[styles.row, !last && { paddingBottom: 22 }]}>
      {!last ? (
        <View style={styles.connector}>
          <Animated.View style={{ width: '100%', backgroundColor: colors.mint, height: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>
      ) : null}
      <View style={styles.dotWrap}>
        {state === 'active' ? <SpinRing size={44} color={colors.primary} /> : null}
        {state === 'done' ? (
          <PopCheck size={36} iconSize={20} />
        ) : (
          <View style={[styles.dot, state === 'active' ? { backgroundColor: '#E1F3F3' } : { backgroundColor: '#EEF3F3' }]}>
            <Icon name={icon} size={18} color={state === 'active' ? colors.primary : colors.muted} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, paddingTop: 5, opacity: state === 'todo' ? 0.45 : 1 }}>
        <Text style={[font(state === 'active' ? 800 : 600), { fontSize: 14, color: colors.text }]}>{label}</Text>
        <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 1 }]}>
          {state === 'done' ? doneLabel : state === 'active' ? `${hint}…` : hint}
        </Text>
      </View>
    </View>
  );
}

/** Stylised PAN card being scanned, inside viewfinder brackets, with a verifying badge. */
function PanScanHero({ done }: { done: boolean }) {
  const scan = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (done) return;
    const l1 = Animated.loop(Animated.sequence([
      Animated.timing(scan, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(scan, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const l2 = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, [done, scan, pulse]);
  const beamY = scan.interpolate({ inputRange: [0, 1], outputRange: [6, CARD_H - 8] });
  const bracketScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const badgeRot = useSpin(!done, 1100);

  return (
    <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.halo, { opacity: haloOpacity }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: bracketScale }] }]}>
        <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 16 }]} />
        <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 16 }]} />
        <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 16 }]} />
        <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 16 }]} />
      </Animated.View>

      {/* the card */}
      <View style={styles.card}>
        <LinearGradient colors={[heroGradient[0], heroGradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={[styles.bar, { width: 80, opacity: 0.6 }]} />
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <View style={{ width: 44, height: 52, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
            <View style={[styles.bar, { width: '100%', opacity: 0.55 }]} />
            <View style={[styles.bar, { width: '80%', opacity: 0.4 }]} />
            <View style={[styles.bar, { width: '60%', opacity: 0.4 }]} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' }} />
          ))}
        </View>
        {/* scanning beam (stops once verified) */}
        {!done ? (
          <Animated.View pointerEvents="none" style={[styles.beamWrap, { transform: [{ translateY: beamY }] }]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)']} style={{ height: 30, marginTop: -30 }} />
            <View style={styles.beam} />
          </Animated.View>
        ) : null}
      </View>

      {/* verifying badge → green tick once verified */}
      <View style={styles.badgePos}>
        {done ? (
          <PopCheck size={48} iconSize={26} />
        ) : (
          <View style={styles.badge}>
            <Animated.View
              style={{
                position: 'absolute', width: 48, height: 48, borderRadius: 24, borderWidth: 3,
                borderColor: 'transparent', borderTopColor: colors.mint, transform: [{ rotate: badgeRot }],
              }}
            />
            <Icon name="verified_user" size={20} color={colors.primary} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 18, paddingBottom: 12 },
  title: { fontSize: 23, color: colors.text, letterSpacing: -0.4 },
  sub: { fontSize: 13.5, color: colors.textSoft, marginTop: 6, textAlign: 'center' },
  steps: { width: '100%', maxWidth: 360, marginTop: 28 },
  row: { flexDirection: 'row', gap: 16 },
  connector: { position: 'absolute', left: 21, top: 46, bottom: 2, width: 2, borderRadius: 1, backgroundColor: colors.line, overflow: 'hidden' },
  dotWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  check: { backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  safe: {
    flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%', maxWidth: 360,
    marginTop: 28, padding: 14, borderRadius: 16, backgroundColor: '#E1F3F3',
  },
  safeIc: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(47,177,131,0.2)', alignItems: 'center', justifyContent: 'center' },

  hero: { width: 260, height: 190, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 224, height: 160, borderRadius: 40, backgroundColor: 'rgba(47,177,131,0.15)' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.primary },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 16, padding: 14, overflow: 'hidden',
    shadowColor: '#0A3F41', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
  beamWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  beam: {
    height: 2, marginHorizontal: 8, borderRadius: 1, backgroundColor: '#fff',
    shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  badgePos: { position: 'absolute', right: 12, bottom: 8 },
  badge: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0A3F41', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
});
