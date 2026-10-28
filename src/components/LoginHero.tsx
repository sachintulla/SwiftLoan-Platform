import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs, LinearGradient as SvgGrad, RadialGradient, Stop, Path, Rect, G, Circle, Ellipse,
} from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import { colors, font } from '../theme/tokens';
import Icon from './Icon';
import { useVoiceTarget } from '../voice/useVoiceTarget';
import { LogoMark, Wordmark } from './Logo';

/**
 * Phone + secure-shield illustration for the login hero — a clean vector build
 * (no bitmap) in the SwiftLoan mint palette: a tilted phone showing the ₹ mark,
 * a green check-shield resting against it on a soft pedestal, with motion lines
 * streaming in. Scales crisply at any size.
 */
export function HeroIllustration({ size = 160 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <SvgGrad id="phone" x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor="#F3FBF9" />
          <Stop offset="1" stopColor="#E3F3EF" />
        </SvgGrad>
        <SvgGrad id="screen" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F7FCFB" />
          <Stop offset="1" stopColor="#E9F6F2" />
        </SvgGrad>
        <SvgGrad id="shield" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#5CD3AC" />
          <Stop offset="0.5" stopColor="#2FBF9A" />
          <Stop offset="1" stopColor="#0E9F8C" />
        </SvgGrad>
        <SvgGrad id="podTop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E7F4F0" />
        </SvgGrad>
        <SvgGrad id="swoosh" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#8FD9C9" stopOpacity="0" />
          <Stop offset="1" stopColor="#4FC6A6" stopOpacity="0.95" />
        </SvgGrad>
        <RadialGradient id="floorShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#9FC9C0" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#9FC9C0" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* ground shadow */}
      <Ellipse cx="100" cy="176" rx="90" ry="20" fill="url(#floorShadow)" />

      {/* curved motion swooshes streaming off to the right (behind the phone) */}
      <G fill="none" strokeLinecap="round">
        <Path d="M120 60 C 150 54, 178 60, 196 52" stroke="url(#swoosh)" strokeWidth="4" />
        <Path d="M124 72 C 152 68, 180 74, 200 66" stroke="url(#swoosh)" strokeWidth="4" opacity="0.7" />
        <Path d="M122 84 C 150 82, 176 88, 198 82" stroke="url(#swoosh)" strokeWidth="4" opacity="0.45" />
      </G>
      <Circle cx="150" cy="54" r="2.6" fill="#4FC6A6" opacity="0.8" />
      <Circle cx="176" cy="49" r="2" fill="#8FD9C9" opacity="0.7" />

      {/* layered podium (stacked discs) */}
      <Ellipse cx="100" cy="168" rx="66" ry="17" fill="#DDF0EB" />
      <Ellipse cx="100" cy="163" rx="66" ry="16" fill="url(#podTop)" />
      <Ellipse cx="100" cy="156" rx="46" ry="12" fill="#EFF9F6" />
      <Ellipse cx="100" cy="152" rx="46" ry="11" fill="url(#podTop)" />

      {/* phone, slightly tilted, floating on the podium */}
      <Ellipse cx="104" cy="150" rx="34" ry="7" fill="#B9DAD3" opacity="0.5" />
      <G rotation="-9" origin="108, 92">
        <Rect x="78" y="26" width="60" height="118" rx="15" fill="url(#phone)" stroke="#DCEFEA" strokeWidth="1.5" />
        {/* side buttons */}
        <Rect x="75.5" y="52" width="3" height="16" rx="1.5" fill="#D3EAE4" />
        <Rect x="75.5" y="72" width="3" height="10" rx="1.5" fill="#D3EAE4" />
        {/* screen */}
        <Rect x="85" y="36" width="46" height="98" rx="9" fill="url(#screen)" />
        <Rect x="100" y="31" width="16" height="3" rx="1.5" fill="#DCEFEA" />
        {/* glossy diagonal highlight */}
        <Path d="M85 44 L131 36 V60 L85 78 Z" fill="#FFFFFF" opacity="0.35" />
        {/* big ₹ on screen */}
        <G fill={colors.primary}>
          <Rect x="96" y="58" width="26" height="5.5" rx="2.75" />
          <Rect x="96" y="69" width="26" height="5.5" rx="2.75" />
          <Path d="M100 64 q10 0 10 10 q0 10 -10 10 l13 15 h-8 l-13 -15 v-6 h8 q4 0 4 -4 q0 -4 -4 -4 h-9 v-6z" />
        </G>
        <Rect x="94" y="110" width="30" height="4" rx="2" fill="#CDE9E3" />
        <Rect x="94" y="119" width="21" height="4" rx="2" fill="#DCEFEB" />
      </G>

      {/* glossy secure shield, front-right */}
      <G>
        <Ellipse cx="150" cy="162" rx="24" ry="5" fill="#9FC9C0" opacity="0.35" />
        <Path d="M150 92 l24 9 v20 c0 20 -13 31 -24 36 c-11 -5 -24 -16 -24 -36 v-20 z" fill="url(#shield)" />
        {/* top-left gloss */}
        <Path d="M150 92 l24 9 v10 c-8 -6 -16 -9 -24 -9 z" fill="#FFFFFF" opacity="0.22" />
        <Path d="M137 130 l8 8 l16 -17" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </Svg>
  );
}

/**
 * The compact OTP-step hero: mint gradient with a soft wave bottom, the SwiftLoan
 * lockup + tagline on the left, the illustration on the right, and a back arrow
 * that returns to number entry.
 */
export function LoginHero({ onBack }: { onBack?: () => void }) {
  // The back arrow is a bare icon, so go_back could not find it on the login screen.
  useVoiceTarget(onBack ? 'Back' : undefined, { kind: 'button', onTap: onBack }, [onBack]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const H = insets.top + 150;
  return (
    <View style={{ width, height: H }}>
      <LinearGradient
        colors={['#DFF3EE', '#EAF7F4', '#F7FBFA']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* wave divider at the bottom */}
      <Svg width={width} height={36} viewBox={`0 0 ${width} 36`} style={{ position: 'absolute', bottom: -1 }}>
        <Path d={`M0 16 C ${width * 0.3} 2, ${width * 0.62} 32, ${width} 12 L ${width} 36 L 0 36 Z`} fill="#F7FBFA" />
      </Svg>

      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={[styles.back, { top: insets.top + 4 }]}>
          <Icon name="arrow_back" size={24} color={colors.text} />
        </Pressable>
      ) : null}

      <View style={[styles.heroRow, { paddingTop: insets.top + 36 }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LogoMark size={38} style={{ borderRadius: 12 }} />
            <Wordmark size={25} />
          </View>
          <Text style={[font(500), styles.tagline]}>Smart loans. Swift solutions.</Text>
        </View>
        <HeroIllustration size={116} />
      </View>
    </View>
  );
}

/** The marketing feature chips that scroll under the step indicator. */
const FEATURES: { icon: string; label: string }[] = [
  { icon: 'bolt', label: 'Instant Approval in 3 Mins' },
  { icon: 'description', label: '100% Paperless' },
  { icon: 'savings', label: 'Lowest Rates' },
];

// Animated.loop spins on Jest's faked 0 ms rAF clock, so the marquee is left
// un-started under Jest (same guard the rest of the app uses).
const UNDER_JEST = typeof process !== 'undefined' && !!(process as { env?: Record<string, string | undefined> }).env?.JEST_WORKER_ID;

function FeatureChip({ f }: { f: { icon: string; label: string } }) {
  return (
    <View style={[styles.featChip, { marginRight: 10 }]}>
      <Icon name={f.icon} size={15} color={colors.mint} />
      <Text style={[font(600), { color: 'rgba(255,255,255,0.9)', fontSize: 12.5 }]}>{f.label}</Text>
    </View>
  );
}

/**
 * The trust chips as a continuously scrolling marquee — the row glides right→left
 * and loops seamlessly (two identical copies; when the first has fully scrolled
 * off, the animation resets to 0 where the second copy sits, so there's no jump).
 */
function FeatureMarquee() {
  const [setW, setSetW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!setW || UNDER_JEST) return undefined;
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, { toValue: -setW, duration: setW * 24, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [setW, x]);
  return (
    <View style={{ marginTop: 14, marginHorizontal: -20, overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', paddingLeft: 20, transform: [{ translateX: x }] }}>
        <View style={{ flexDirection: 'row' }} onLayout={e => setSetW(e.nativeEvent.layout.width)}>
          {FEATURES.map(f => <FeatureChip key={f.label} f={f} />)}
        </View>
        {/* second identical copy for the seamless loop */}
        <View style={{ flexDirection: 'row' }}>
          {FEATURES.map(f => <FeatureChip key={`dup-${f.label}`} f={f} />)}
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Dark welcome header for the number-entry step (matches the SwiftLoan onboarding
 * mock): a deep-teal gradient carrying the SwiftLoan lockup + Help pill, the
 * "Step 1 of 3" indicator and a scrollable strip of trust chips. The white form
 * sheet (rendered by the screen) overlaps its rounded top below.
 */
export function WelcomeHero({
  onBack,
  badge,
  showChips = true,
}: {
  onBack?: () => void;
  badge?: { icon: string; label: string };
  showChips?: boolean;
}) {
  // The back arrow is a bare icon, so the voice "go_back" tool can find it by name.
  useVoiceTarget(onBack ? 'Back' : undefined, { kind: 'button', onTap: onBack }, [onBack]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const b = badge ?? { icon: 'storefront', label: 'Compare offers from top lenders' };
  return (
    <View style={{ width, paddingBottom: 30 }}>
      <LinearGradient
        colors={['#0A2C2E', '#0E3B3A', '#114440']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.hdrBack}>
            <Icon name="arrow_back" size={24} color="#fff" />
          </Pressable>
        ) : null}
        {/* logo lockup + RBI badge */}
        <View style={styles.hdrTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LogoMark size={40} style={{ borderRadius: 12 }} />
            <View>
              <Text style={[font(800), { fontSize: 22, letterSpacing: -0.6 }]}>
                <Text style={{ color: '#fff' }}>Swift</Text>
                <Text style={{ color: colors.mint }}>Loan</Text>
              </Text>
              <Text style={[font(500), { fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.3, marginTop: 1 }]}>
                Digital Lending Marketplace
              </Text>
            </View>
          </View>
          <View style={styles.rbiPill}>
            <Icon name="verified_user" size={14} color={colors.mint} />
            <Text style={[font(600), { color: '#fff', fontSize: 12.5 }]}>RBI Regulated</Text>
          </View>
        </View>

        {/* value badge (no step count — there is no real multi-step flow here) */}
        <View style={styles.stepPill}>
          <View style={styles.stepNum}>
            <Icon name={b.icon} size={14} color="#06201F" />
          </View>
          <Text style={[font(600), { color: colors.mint, fontSize: 13 }]}>{b.label}</Text>
        </View>

        {/* trust chips — continuously scrolling marquee */}
        {showChips ? <FeatureMarquee /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Dark header
  hdrBack: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8, marginBottom: 2 },
  hdrTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rbiPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(47,177,131,0.12)', borderWidth: 1, borderColor: 'rgba(47,177,131,0.4)',
    borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13,
  },
  stepPill: {
    flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', marginTop: 18,
    backgroundColor: 'rgba(47,177,131,0.1)', borderWidth: 1, borderColor: 'rgba(47,177,131,0.4)',
    borderRadius: 999, paddingVertical: 6, paddingLeft: 6, paddingRight: 14,
  },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  featChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingVertical: 9, paddingHorizontal: 13,
  },
  // OTP-step hero
  heroRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 10,
    paddingBottom: 18,
  },
  tagline: { fontSize: 13.5, color: '#5A7873', marginTop: 8 },
  back: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
