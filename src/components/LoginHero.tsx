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
export function HeroIllustration({ size = 150 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <SvgGrad id="phone" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#EAF7F5" />
        </SvgGrad>
        <SvgGrad id="shield" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3FC59B" />
          <Stop offset="1" stopColor="#12A594" />
        </SvgGrad>
        <RadialGradient id="pedestal" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#CFEDE7" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#CFEDE7" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* soft pedestal */}
      <Ellipse cx="104" cy="168" rx="86" ry="22" fill="url(#pedestal)" />
      <Ellipse cx="104" cy="164" rx="60" ry="13" fill="#FFFFFF" opacity="0.75" />

      {/* motion / connection lines streaming in from the left */}
      <G stroke="#8FD9C9" strokeLinecap="round" fill="none">
        <Path d="M6 78 C 34 66, 52 70, 74 60" strokeWidth="3" opacity="0.9" />
        <Path d="M2 96 C 32 88, 54 92, 78 84" strokeWidth="3" opacity="0.6" strokeDasharray="1 9" />
        <Path d="M10 112 C 36 108, 56 112, 76 106" strokeWidth="3" opacity="0.4" strokeDasharray="1 9" />
      </G>
      <Circle cx="6" cy="78" r="3.5" fill="#3FC59B" />
      <Circle cx="24" cy="128" r="2.6" fill="#8FD9C9" opacity="0.8" />

      {/* phone, slightly tilted */}
      <G rotation="-8" origin="112, 96">
        <Rect x="80" y="34" width="66" height="124" rx="14" fill="url(#phone)" stroke="#D7EEE9" strokeWidth="1.5" />
        <Rect x="88" y="46" width="50" height="100" rx="8" fill="#F4FBF9" />
        {/* speaker notch */}
        <Rect x="104" y="40" width="18" height="3.5" rx="1.75" fill="#D7EEE9" />
        {/* ₹ on screen */}
        <G fill={colors.primary}>
          <Rect x="99" y="66" width="30" height="6" rx="3" />
          <Rect x="99" y="78" width="30" height="6" rx="3" />
          <Path d="M104 72 q11 0 11 11 q0 11 -11 11 l14 16 h-9 l-14 -16 v-7 h9 q4 0 4 -4 q0 -4 -4 -4 h-10 v-6z" />
        </G>
        {/* faint list rows below */}
        <Rect x="97" y="120" width="34" height="4" rx="2" fill="#CDE9E3" />
        <Rect x="97" y="130" width="24" height="4" rx="2" fill="#DCEFEB" />
      </G>

      {/* secure shield with check, resting against the phone */}
      <G>
        <Path
          d="M150 96 l22 8 v20 c0 18 -12 28 -22 33 c-10 -5 -22 -15 -22 -33 v-20 z"
          fill="url(#shield)"
        />
        <Path
          d="M139 130 l7 7 l14 -15"
          stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
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
