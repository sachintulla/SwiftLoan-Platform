import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from '../Icon';
import { colors, font } from '../../theme/tokens';

/** Error state with a retry action. */
export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12, paddingHorizontal: 24 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(239,106,94,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="error" size={28} color={colors.red} />
      </View>
      <Text style={[font(700), { fontSize: 15, color: colors.text, textAlign: 'center' }]}>Couldn't load this</Text>
      <Text style={[font(400), { fontSize: 13, color: colors.textSoft, textAlign: 'center', lineHeight: 19 }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, height: 44, justifyContent: 'center' }}
        >
          <Icon name="refresh" size={18} color="#fff" />
          <Text style={[font(700), { color: '#fff', fontSize: 14 }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
