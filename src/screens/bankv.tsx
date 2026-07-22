import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { KycScaffold, TrustBadges } from '../components/Kyc';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

const BANKS = ['Choose from list', 'HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Other Banks'];

export default function Bankv() {
  const { go, showToast } = useStore();
  const [bankIdx, setBankIdx] = useState(0);
  const [open, setOpen] = useState(false);

  return (
    <KycScaffold title="Bank Verification" subtitle="Verify your income to unlock higher loan limits up to ₹10,00,000.">
      <View style={styles.card}>
        <View style={styles.recTag}><Text style={[font(700), { fontSize: 10, color: '#fff', letterSpacing: 0.3 }]}>RECOMMENDED</Text></View>
        <Text style={[font(800), { fontSize: 15, color: colors.text, marginTop: 6 }]}>Upload Bank Statements</Text>

        <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginTop: 14, marginBottom: 8 }]}>Select your Bank</Text>
        <Pressable style={styles.select} onPress={() => setOpen(!open)}>
          <Text style={[font(500), { fontSize: 15, color: bankIdx === 0 ? colors.muted : colors.text }]}>{BANKS[bankIdx]}</Text>
          <Icon name="expand_more" size={20} color={colors.textSoft} />
        </Pressable>
        {open ? (
          <View style={styles.dropdown}>
            {BANKS.slice(1).map((b, i) => (
              <Pressable key={b} style={styles.option} onPress={() => { setBankIdx(i + 1); setOpen(false); }}>
                <Text style={[font(500), { fontSize: 14, color: colors.text }]}>{b}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable style={styles.upload} onPress={() => showToast('Upload — demo environment.')}>
          <Icon name="upload_file" size={24} color={colors.primary} />
          <Text style={[font(700), { fontSize: 14, color: colors.text, marginTop: 6 }]}>Upload PDF Statements</Text>
          <Text style={[font(400), { fontSize: 11.5, color: colors.muted }]}>Drag and drop or tap to browse</Text>
        </Pressable>

        <View style={styles.infoRow}>
          <Icon name="info" size={15} color={colors.blue} />
          <Text style={[font(400), { flex: 1, fontSize: 11.5, lineHeight: 16, color: colors.textSoft }]}>
            Upload last 6 months' statements in PDF format. Ensure the file is not password protected for faster processing.
          </Text>
        </View>

        <Pressable style={styles.submitBtn} onPress={() => go('kyc')}>
          <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>Upload PDF</Text>
          <Icon name="arrow_forward" size={18} color="#fff" />
        </Pressable>
      </View>

      <TrustBadges />
      <Text style={[font(400), { fontSize: 11, lineHeight: 16, color: colors.muted, textAlign: 'center', marginTop: 14 }]}>
        Your data is safe with us. We use bank-grade encryption to ensure your financial information remains private and secure.
      </Text>
    </KycScaffold>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 18, padding: 16, paddingTop: 22 },
  recTag: { position: 'absolute', top: -1, left: 16, backgroundColor: colors.mint, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff' },
  dropdown: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, marginTop: 6, backgroundColor: '#fff', overflow: 'hidden' },
  option: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  upload: { alignItems: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 14, paddingVertical: 20, marginTop: 14, backgroundColor: '#fff' },
  infoRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, backgroundColor: colors.primary, marginTop: 14 },
});
