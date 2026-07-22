import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { colors, font } from '../../theme/tokens';

/** Centered loading state for data screens. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 60, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[font(500), { color: colors.textSoft, fontSize: 13 }]}>{label}</Text>
    </View>
  );
}

/** Inline skeleton block (for card placeholders). */
export function Skeleton({ height = 72, style }: { height?: number; style?: any }) {
  return (
    <View
      style={[
        { height, borderRadius: 16, backgroundColor: 'rgba(120,150,148,0.12)', marginBottom: 12 },
        style,
      ]}
    />
  );
}
