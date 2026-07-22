import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { Screen } from '../components/Frame';
import { LogoMark, Wordmark, Tagline } from '../components/Logo';
import { colors } from '../theme/tokens';

export default function Splash() {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    ).start();
  }, [opacity, scale, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ alignItems: 'center', opacity, transform: [{ scale }] }}>
          <LogoMark size={96} />
          <View style={{ height: 20 }} />
          <Wordmark size={42} />
          <Tagline />
        </Animated.View>
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 80,
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 3,
            borderColor: colors.mint,
            borderTopColor: 'transparent',
            transform: [{ rotate }],
          }}
        />
      </View>
    </Screen>
  );
}
