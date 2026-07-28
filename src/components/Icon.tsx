import React from 'react';
import { Text, TextStyle, StyleProp, Platform } from 'react-native';
import { MATERIAL_FONT } from '../theme/tokens';

/**
 * Material Symbols icon, rendered from the exact icon font extracted from the design
 * bundle. The font uses ligatures, so the icon *name* (e.g. "chevron_right") is typed
 * directly as the glyph text — identical to the source prototype.
 *
 * Never apply a custom fontWeight here: only one static weight was extracted into
 * assets/fonts (no bold companion), so requesting e.g. 700 makes Android fall back
 * off this custom typeface entirely — the glyph then renders as literal text
 * ("check") instead of the ligature-substituted icon.
 */
export function Icon({
  name,
  size = 24,
  color = '#000',
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
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
        style,
      ]}
    >
      {name}
    </Text>
  );
}

export default Icon;
