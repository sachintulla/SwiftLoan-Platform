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

  // Animate every screen change: the incoming screen settles in with a quick
  // fade + subtle zoom-out. Kept opaque enough (starts at 0.2, scale 1.03) that
  // full-screen backgrounds stay covered — no gap or hard cut.
  const anim = useRef(new Animated.Value(1)).current;
  const prev = useRef(state.screen);
  useEffect(() => {
    if (prev.current === state.screen) return;
    prev.current = state.screen;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state.screen, anim]);

  const opacity = anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 0.9, 1] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] });

  const content = Comp ? <Comp /> : <Placeholder name={state.screen} />;

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ scale }] }}>
      {content}
    </Animated.View>
  );
}
