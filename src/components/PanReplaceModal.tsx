import React from 'react';
import { Modal, View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors, font } from '../theme/tokens';
import { useVoiceTarget } from '../voice/useVoiceTarget';

/**
 * "Replace PAN on file?" confirm — an animated card-swap that shows the PAN already
 * stored in SwiftLoan (masked) being swapped for the new one the user just entered,
 * over a SwiftLoan badge, so it's clear the PAN on record is about to change. Replaces
 * the plain native alert for this one decision. The agent sees the Replace button while
 * it's up (content inside a Modal is otherwise invisible to the screen walker).
 */
export function PanReplaceModal({
  visible,
  masked,
  title,
  body,
  replaceLabel,
  cancelLabel,
  onReplace,
  onCancel,
}: {
  visible: boolean;
  masked: string;
  title: string;
  body: string;
  replaceLabel: string;
  cancelLabel: string;
  onReplace: () => void;
  onCancel: () => void;
}) {
  const v = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!visible) return;
    v.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, v]);

  // Expose the primary action to the voice agent while the modal is open.
  useVoiceTarget(visible ? replaceLabel : undefined, { kind: 'button', onTap: onReplace }, [visible, onReplace]);

  const oldOpacity = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  const oldShift = v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const oldRot = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-7deg'] });
  const newOpacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const newScale = v.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] });
  const swapScale = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.92, 1.1, 0.92] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.card} accessibilityRole="alert">
          {/* Animated PAN swap */}
          <View style={styles.stage}>
            <Animated.View style={[styles.pan, styles.panOld, { opacity: oldOpacity, transform: [{ translateX: oldShift }, { rotate: oldRot }] }]}>
              <View style={[styles.chip, { backgroundColor: 'rgba(10,63,65,0.18)' }]} />
              <Text style={styles.panLblOld}>PAN ON FILE</Text>
              <Text style={styles.panNumOld}>{masked || 'XXXXXX000X'}</Text>
            </Animated.View>

            <Animated.View style={[styles.swap, { transform: [{ scale: swapScale }] }]}>
              <Icon name="swap_horiz" size={18} color="#fff" />
            </Animated.View>

            <Animated.View style={[styles.pan, styles.panNew, { opacity: newOpacity, transform: [{ scale: newScale }] }]}>
              <View style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />
              <Text style={styles.panLblNew}>NEW PAN</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="credit_card" size={14} color="#fff" />
                <Text style={styles.panNumNew}>••••••</Text>
              </View>
            </Animated.View>
          </View>

          <View style={styles.badge}>
            <Icon name="verified_user" size={14} color={colors.mint} />
            <Text style={styles.badgeTxt}>SwiftLoan</Text>
          </View>

          <Text style={[font(800), styles.title]}>{title}</Text>
          <Text style={[font(400), styles.body]}>{body}</Text>

          <Pressable onPress={onReplace} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.9 }]} accessibilityRole="button">
            <Text style={[font(800), { color: '#fff', fontSize: 15 }]}>{replaceLabel}</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button">
            <Text style={[font(700), { color: colors.textSoft, fontSize: 13.5 }]}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 24, padding: 24, alignItems: 'center' },
  stage: { height: 86, width: 248, alignItems: 'center', justifyContent: 'center' },
  pan: { position: 'absolute', top: 7, width: 124, height: 72, borderRadius: 12, borderWidth: 1, padding: 11, justifyContent: 'center', gap: 4 },
  panOld: { left: 6, borderColor: colors.line, backgroundColor: '#EEF2F2' },
  panNew: { right: 6, borderColor: 'rgba(7,159,160,0.4)', backgroundColor: colors.primary },
  chip: { position: 'absolute', top: 10, right: 12, width: 18, height: 13, borderRadius: 3 },
  panLblOld: { ...font(800), fontSize: 9, letterSpacing: 0.6, color: colors.textSoft },
  panNumOld: { ...font(800), fontSize: 13, letterSpacing: 1.5, color: colors.text },
  panLblNew: { ...font(800), fontSize: 9, letterSpacing: 0.6, color: 'rgba(255,255,255,0.9)' },
  panNumNew: { ...font(800), fontSize: 13, letterSpacing: 1.5, color: '#fff' },
  swap: { zIndex: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeTxt: { ...font(800), fontSize: 11, color: colors.textSoft },
  title: { fontSize: 18, color: colors.text, textAlign: 'center', marginTop: 14 },
  body: { fontSize: 13.5, color: colors.textSoft, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  primary: { marginTop: 20, alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  cancel: { marginTop: 8, alignSelf: 'stretch', height: 42, alignItems: 'center', justifyContent: 'center' },
});
