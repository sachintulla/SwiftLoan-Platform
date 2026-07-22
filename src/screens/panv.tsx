import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { KycScaffold } from '../components/Kyc';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

export default function Panv() {
  const { go, showToast } = useStore();
  return (
    <KycScaffold title="PAN Verification" subtitle="Verify your Permanent Account Number for tax and credit checks.">
      <View style={styles.secure}>
        <Icon name="shield" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Secure Data Encryption</Text>
          <Text style={[font(400), { fontSize: 12, lineHeight: 17, color: colors.textSoft, marginTop: 2 }]}>Your PAN details are encrypted and shared directly with verified credit bureaus.</Text>
        </View>
      </View>

      <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginTop: 20, marginBottom: 8 }]}>Enter PAN Number</Text>
      <TextInput style={[styles.input, font(700)]} placeholder="e.g. ABCDE1234F" placeholderTextColor={colors.muted} autoCapitalize="characters" maxLength={10} />
      <Pressable style={styles.verifyBtn} onPress={() => go('kyc')}>
        <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>Verify</Text>
        <Icon name="check_circle" size={18} color="#fff" />
      </Pressable>
      <Text style={[font(400), { fontSize: 11.5, color: colors.muted, marginTop: 8, textAlign: 'center' }]}>Example: First 5 letters, 4 digits, 1 letter</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        <Text style={[font(600), { fontSize: 11, color: colors.muted }]}>OR</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      </View>

      <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginBottom: 8 }]}>Photo Upload</Text>
      <Pressable style={styles.upload} onPress={() => showToast('Upload — demo environment.')}>
        <Icon name="upload_file" size={22} color={colors.primary} />
        <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Upload Front Side</Text>
      </Pressable>
    </KycScaffold>
  );
}

const styles = StyleSheet.create({
  secure: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(7,159,160,0.07)', borderRadius: 14, padding: 14 },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, letterSpacing: 2, color: colors.text, backgroundColor: '#fff' },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, backgroundColor: colors.primary, marginTop: 12 },
  upload: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 14, paddingVertical: 18, backgroundColor: '#fff' },
});
