import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../state/store';

// WS3: a dismissible banner shown when the app was opened from a tracked link
// with saved context. Renders above every screen (mounted in App, inside the
// store provider) so it never touches the design-locked screen components.
export default function ContextBanner() {
  const { state } = useStore();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);

  if (!state.contextLoaded || !state.contextData || dismissed) return null;
  const ctx = state.contextData;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.banner, { marginTop: insets.top + 8 }]}>
        <View style={styles.dot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Continuing your journey</Text>
          <Text style={styles.msg} numberOfLines={3}>{ctx.greeting}</Text>
        </View>
        <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, alignItems: 'center' },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    maxWidth: 460, marginHorizontal: 12, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#0A3F41', borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#2FB183' },
  title: { color: '#8FD8D4', fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  msg: { color: '#fff', fontSize: 13.5, marginTop: 2, lineHeight: 18 },
  close: { color: '#7FB3B3', fontSize: 15, paddingLeft: 4 },
});
