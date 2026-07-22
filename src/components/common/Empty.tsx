import React from 'react';
import { View, Text } from 'react-native';
import Icon from '../Icon';
import { colors, font } from '../../theme/tokens';

/** Empty state for lists that can be empty. */
export function Empty({
  icon = 'inbox',
  title = 'Nothing here yet',
  message,
}: {
  icon?: string;
  title?: string;
  message?: string;
}) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 10, paddingHorizontal: 24 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(120,150,148,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={28} color={colors.muted} />
      </View>
      <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{title}</Text>
      {message ? <Text style={[font(400), { fontSize: 13, color: colors.textSoft, textAlign: 'center', lineHeight: 19 }]}>{message}</Text> : null}
    </View>
  );
}
