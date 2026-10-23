import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { useStore, Screen as ScreenName } from './state/store';
import { font } from './theme/tokens';
import { SCREENS } from './screens';
import { Screen } from './components/Frame';

function Placeholder({ name }: { name: string }) {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 200 }}>
        <Text style={[font(700), { fontSize: 18 }]}>{name}</Text>
        <Text style={[font(400), { marginTop: 6, color: '#889' }]}>screen coming up</Text>
      </View>
    </Screen>
  );
}

export default function Router() {
  const { state } = useStore();
  const Comp = SCREENS[state.screen as ScreenName];

  // Animate every screen change with a subtle zoom-settle. The incoming screen
  // stays fully OPAQUE and scales from 1.03 → 1 (always ≥ viewport, so it fully
  // covers the background) — no opacity fade, so there's no flash of the
  // window's background colour between screens.
  const anim = useRef(new Animated.Value(1)).current;
  const prev = useRef(state.screen);
  useEffect(() => {
    if (prev.current === state.screen) return;
    prev.current = state.screen;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state.screen, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] });

  const content = Comp ? <Comp /> : <Placeholder name={state.screen} />;

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      {content}
    </Animated.View>
  );
}
