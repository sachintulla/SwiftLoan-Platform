import React from 'react';
import { View, Text, Image, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import { colors, font } from '../theme/tokens';

/** The SwiftLoan glyph (the "swift" arrow + ledger lines), ported from the design SVG. */
export function LogoGlyph({ size = 52, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M10 30 L22 30" stroke="rgba(255,255,255,0.55)" strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M8 37 L18 37" stroke="rgba(255,255,255,0.32)" strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M15 32 L31 12 L27 25 L39 25" fill="none" stroke={color} strokeWidth={4.2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M31 12 L31 22 L23 20 Z" fill={color} />
    </Svg>
  );
}

/** The SwiftLoan app-icon mark (₹ + speed lines) rendered from the brand asset. */
export function LogoMark({ size = 96, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require('../../assets/brand/logo.png')}
      resizeMode="contain"
      style={[
        {
          width: size,
          height: size,
          shadowColor: '#2FB183',
          shadowOpacity: 0.45,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 14 },
        },
        style,
      ]}
    />
  );
}

/** "SwiftLoan" wordmark (Swift = teal, Loan = ink), or all-white on hero grounds. */
export function Wordmark({ size = 42, light = false }: { size?: number; light?: boolean }) {
  return (
    <Text style={[font(800), { fontSize: size, letterSpacing: -size * 0.035, lineHeight: size * 1.02 }]}>
      <Text style={{ color: light ? '#fff' : colors.primary }}>Swift</Text>
      <Text style={{ color: light ? '#fff' : colors.text }}>Loan</Text>
    </Text>
  );
}

/** Small horizontal lockup (mark + wordmark) used in headers. */
export function LogoLockup({ size = 26, light = false }: { size?: number; light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LogoMark size={size} style={{ borderRadius: size * 0.3 }} />
      <Wordmark size={size * 0.72} light={light} />
    </View>
  );
}

export function Tagline({ color = '#7E9291' }: { color?: string }) {
  return (
    <Text style={[font(600), { fontSize: 11, letterSpacing: 3.2, color, marginTop: 10 }]}>
      FAST · FAIR · SECURE
    </Text>
  );
}
