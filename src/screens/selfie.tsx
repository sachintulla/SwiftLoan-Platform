import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { KycScaffold } from '../components/Kyc';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

export default function Selfie() {
  const { go } = useStore();
  return (
    <KycScaffold title="Live Selfie" subtitle="We need to confirm your identity with a quick selfie.">
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <View style={styles.oval}>
          <Icon name="person" size={90} color={colors.muted} />
        </View>
      </View>

      <View style={styles.tipRow}>
        <View style={styles.tipIcon}><Icon name="center_focus_strong" size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Position face</Text>
          <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>Ensure your head is within the oval guide.</Text>
        </View>
      </View>
      <View style={styles.tipRow}>
        <View style={styles.tipIcon}><Icon name="wb_sunny" size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Good lighting</Text>
          <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>Avoid bright backlights and dark rooms.</Text>
        </View>
      </View>

      <Pressable style={styles.captureBtn} onPress={() => go('kyc')}>
        <Icon name="photo_camera" size={20} color="#fff" />
        <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>Capture Selfie</Text>
      </Pressable>
      <Text style={[font(400), { fontSize: 11, lineHeight: 16, color: colors.muted, textAlign: 'center', marginTop: 14 }]}>
        Your data is encrypted and handled securely in accordance with regulatory standards.
      </Text>
    </KycScaffold>
  );
}

const styles = StyleSheet.create({
  oval: {
    width: 180,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(7,159,160,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 14, padding: 14, marginTop: 12 },
  tipIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  captureBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, backgroundColor: colors.primary, marginTop: 20 },
});
