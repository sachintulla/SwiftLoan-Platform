import React from 'react';
import { Text, TextStyle, StyleProp, Platform } from 'react-native';
import { MATERIAL_FONT } from '../theme/tokens';

/**
 * Material Symbols icon, rendered from the exact icon font extracted from the design
 * bundle. The font uses ligatures, so the icon *name* (e.g. "chevron_right") is typed
 * directly as the glyph text — identical to the source prototype.
 */
export function Icon({
  name,
  size = 24,
  color = '#000',
  style,
  weight,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  weight?: number;
}) {
  return (
    <Text
      allowFontScaling={false}
      suppressHighlighting
      style={[
        {
          fontFamily: MATERIAL_FONT,
          fontSize: size,
          lineHeight: size,
          color,
          // keep ligatures intact; avoid letter spacing
          letterSpacing: 0,
          ...Platform.select({ android: { includeFontPadding: false } }),
        },
        weight != null ? { fontWeight: String(weight) as TextStyle['fontWeight'] } : null,
        style,
      ]}
    >
      {name}
    </Text>
  );
}

export default Icon;
