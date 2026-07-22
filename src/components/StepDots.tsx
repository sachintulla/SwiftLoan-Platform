import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme/tokens';

/** Segmented step-progress bar (e.g. 4 segments, N filled). */
export function StepDots({ total, active }: { total: number; active: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < active ? colors.primary : 'rgba(120,150,148,0.22)',
          }}
        />
      ))}
    </View>
  );
}
