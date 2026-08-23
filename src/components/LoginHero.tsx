import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs, LinearGradient as SvgGrad, RadialGradient, Stop, Path, Rect, G, Circle, Ellipse,
} from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import { colors, font } from '../theme/tokens';
import Icon from './Icon';
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
 * The full login hero header: mint gradient with a soft wave bottom, the
 * SwiftLoan lockup + tagline on the left, and the illustration on the right.
 */
export function LoginHero({ onBack }: { onBack?: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const H = insets.top + 224;
  return (
    <View style={{ width, height: H }}>
      <LinearGradient
        colors={['#DFF3EE', '#EAF7F4', '#F7FBFA']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* wave divider at the bottom */}
      <Svg width={width} height={64} viewBox={`0 0 ${width} 64`} style={{ position: 'absolute', bottom: -1 }}>
        <Path d={`M0 26 C ${width * 0.3} 2, ${width * 0.62} 58, ${width} 20 L ${width} 64 L 0 64 Z`} fill="#F7FBFA" />
      </Svg>

      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={[styles.back, { top: insets.top + 6 }]}>
          <Icon name="arrow_back" size={24} color={colors.text} />
        </Pressable>
      ) : null}

      <View style={[styles.heroRow, { paddingTop: insets.top + 46 }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LogoMark size={40} style={{ borderRadius: 12 }} />
            <Wordmark size={26} />
          </View>
          <Text style={[font(500), styles.tagline]}>Smart loans. Swift solutions.</Text>
        </View>
        <HeroIllustration size={150} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    paddingBottom: 30,
  },
  tagline: { fontSize: 13.5, color: '#5A7873', marginTop: 10 },
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
