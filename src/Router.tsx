import React from 'react';
import { View, Text } from 'react-native';
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
  if (!Comp) return <Placeholder name={state.screen} />;
  return <Comp />;
}
