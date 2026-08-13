import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { ConsentRow, PrimaryButton, StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api } from '../api/client';

export default function BasicPan() {
  const { state, set, go, showToast } = useStore();
  const [busy, setBusy] = React.useState(false);

  const onContinue = async () => {
    if (!state.panConsent) {
      showToast('Please accept the soft-enquiry consent.');
      return;
    }
    setBusy(true);
    try {
      if (state.applicationId && state.panNumber) {
        await api.updateApplication(state.applicationId, { panNumber: state.panNumber }).catch(() => {});
      }
      go('moredetails');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={2} of={4} label="PAN" />
        <StepDots total={4} active={2} />
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>Verify your PAN</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          Upload a clear photo of your PAN card — we'll read the number automatically.
        </Text>

        <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginTop: 22, marginBottom: 8 }]}>
          PAN card <Text style={{ color: colors.red }}>*</Text>
        </Text>
        <Pressable style={styles.upload} onPress={() => showToast('Camera — demo environment.')}>
          <View style={styles.badgeIcon}>
            <Icon name="badge" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>Upload PAN photo</Text>
            <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>JPG or PNG, front side</Text>
          </View>
          <Icon name="photo_camera" size={22} color={colors.textSoft} />
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={[font(600), { fontSize: 10.5, letterSpacing: 0.5, color: colors.muted }]}>OR ENTER MANUALLY</Text>
          <View style={styles.orLine} />
        </View>

        <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginBottom: 8 }]}>
          PAN number <Text style={{ color: colors.red }}>*</Text>
        </Text>
        <View style={styles.panRow}>
          <TextInput
            style={[styles.panInput, font(700)]}
            placeholder="ABCDE1234F"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            maxLength={10}
            value={state.panNumber}
            onChangeText={v => set({ panNumber: v.toUpperCase().slice(0, 10) })}
          />
          <Icon name="edit" size={18} color={colors.muted} />
        </View>
        <Text style={[font(400), { fontSize: 11.5, color: colors.muted, marginTop: 6 }]}>Type your PAN, or upload the card above to auto-fill it.</Text>

        <View style={styles.consentBox}>
          <ConsentRow voiceId="Accept terms and consent" checked={state.panConsent} onChange={v => set({ panConsent: v })}>
            <Text style={[font(700), { color: colors.text }]}>🔒 This will NOT affect your credit score{'\n'}</Text>
            We run a soft enquiry only — it does not hit your CIBIL or impact your score in any way. I authorise SwiftLoan to share these details with its lending partners to find the best offers for me.
          </ConsentRow>
        </View>

        <View style={{ height: 20 }} />
        <PrimaryButton label={busy ? 'Submitting…' : 'Upload PAN & accept to continue'} icon={null} disabled={busy} onPress={onContinue} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  upload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  badgeIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  panRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  panInput: { flex: 1, fontSize: 16, letterSpacing: 2, color: colors.text, paddingVertical: 13 },
  consentBox: {
    marginTop: 18,
    backgroundColor: 'rgba(47,177,131,0.07)',
    borderRadius: 14,
    padding: 14,
  },
});
