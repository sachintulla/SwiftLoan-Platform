import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { KycScaffold, TrustBadges } from '../components/Kyc';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

export default function Aadhaar() {
  const { go, showToast } = useStore();
  return (
    <KycScaffold title="Aadhaar Verification" subtitle="Choose a method to verify your identity securely.">
      {/* DigiLocker */}
      <View style={styles.recCard}>
        <View style={styles.recTag}><Text style={[font(700), { fontSize: 10, color: '#fff', letterSpacing: 0.3 }]}>RECOMMENDED</Text></View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={styles.boltIcon}><Icon name="bolt" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[font(800), { fontSize: 15, color: colors.text }]}>Fast Track with DigiLocker</Text>
            <Text style={[font(400), { fontSize: 12, lineHeight: 17, color: colors.textSoft, marginTop: 2 }]}>Instant, paperless verification. Most users get approved in under 60 seconds.</Text>
          </View>
        </View>
        <Pressable style={styles.digiBtn} onPress={() => go('kyc')}>
          <Icon name="lock" size={18} color="#fff" />
          <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>Connect DigiLocker Account</Text>
        </Pressable>
      </View>

      <Divider />

      {/* Manual */}
      <View style={styles.block}>
        <View style={styles.blockHead}><Icon name="keyboard" size={18} color={colors.textMid} /><Text style={styles.blockTitle}>Manual Aadhaar Entry</Text></View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TextInput style={[styles.input, font(500), { flex: 1 }]} placeholder="12-digit Aadhaar Number" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={12} />
          <Pressable style={styles.verifyBtn} onPress={() => go('kyc')}><Text style={[font(700), { color: '#fff', fontSize: 14 }]}>Verify</Text></Pressable>
        </View>
        <View style={styles.infoRow}><Icon name="info" size={15} color={colors.blue} /><Text style={styles.infoText}>OTP will be sent to your Aadhaar-linked mobile number</Text></View>
      </View>

      {/* Upload */}
      <View style={styles.block}>
        <View style={styles.blockHead}><Icon name="photo_camera" size={18} color={colors.textMid} /><Text style={styles.blockTitle}>Upload ID Photos</Text></View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          {[{ t: 'Front Side', s: 'Clear view of photo' }, { t: 'Back Side', s: 'Address details' }].map(u => (
            <Pressable key={u.t} style={styles.uploadTile} onPress={() => showToast('Camera — demo environment.')}>
              <Icon name="add_a_photo" size={24} color={colors.primary} />
              <Text style={[font(700), { fontSize: 12.5, color: colors.text, marginTop: 6 }]}>{u.t}</Text>
              <Text style={[font(400), { fontSize: 10.5, color: colors.muted }]}>{u.s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <TrustBadges />
      <Text style={styles.footer}>Your data is encrypted and used only for verification. By continuing, you agree to our <Text style={{ color: colors.primary }}>Terms</Text> & <Text style={{ color: colors.primary }}>Privacy Policy</Text>.</Text>
      <Text style={[styles.footer, { marginTop: 6 }]}>Having trouble? <Text style={{ color: colors.primary }}>Chat with support</Text></Text>
    </KycScaffold>
  );
}

function Divider() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text style={[font(600), { fontSize: 11, color: colors.muted }]}>OR</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

const styles = StyleSheet.create({
  recCard: { backgroundColor: 'rgba(47,177,131,0.08)', borderWidth: 1.5, borderColor: colors.mint, borderRadius: 18, padding: 16, paddingTop: 22 },
  recTag: { position: 'absolute', top: -1, left: 16, backgroundColor: colors.mint, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  boltIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  digiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, backgroundColor: colors.primary, marginTop: 14 },
  block: { backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 14, marginBottom: 14 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockTitle: { ...font(700), fontSize: 14.5, color: colors.text },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  verifyBtn: { paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  infoText: { ...font(400), flex: 1, fontSize: 11.5, color: colors.textSoft },
  uploadTile: { flex: 1, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 14, paddingVertical: 18, alignItems: 'center', backgroundColor: '#fff' },
  footer: { ...font(400), fontSize: 11, lineHeight: 16, color: colors.muted, textAlign: 'center', marginTop: 14 },
});
