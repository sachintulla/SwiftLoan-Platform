import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { ConsentRow, PrimaryButton, StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, isAuthed } from '../api/client';

const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

export default function BasicPan() {
  const { state, set, go, showToast } = useStore();
  const t = useT();
  const [busy, setBusy] = React.useState(false);

  const onContinue = async () => {
    // PAN is the FIRST step now (before details), so the application doesn't
    // exist yet — capture the PAN into state and persist it once the details
    // step creates the application. Just validate + advance here.
    const pan = state.panNumber.trim().toUpperCase();
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      showToast(t.panValidate);
      return;
    }
    if (!state.panConsent) {
      showToast(t.panConsentValidate);
      return;
    }
    setBusy(true);
    // If this PAN already has offers pulled (this user, prior application), skip
    // the details form and jump straight to the saved offers.
    if (isAuthed()) {
      try {
        const { applications }: any = await api.listApplications();
        const match = (applications || []).find(
          (a: any) => (a.panNumber || '').toUpperCase() === pan &&
            (a.offers?.length ?? 0) > 0 && OFFER_STATUSES.includes(a.status),
        );
        if (match) {
          set({ applicationId: match.id, loanId: match.loan?.id ?? null, hasSavedOffers: true });
          setBusy(false);
          go('offers');
          return;
        }
      } catch {
        /* fall through to the details step */
      }
    }
    go('basic');
    setBusy(false);
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={1} of={4} label="PAN" />
        <StepDots total={4} active={1} />
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>{t.panTitle}</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          {t.panSub}
        </Text>

        <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginTop: 22, marginBottom: 8 }]}>
          {t.panCardLabel} <Text style={{ color: colors.red }}>*</Text>
        </Text>
        <Pressable style={styles.upload} onPress={() => showToast(t.panCameraDemo)}>
          <View style={styles.badgeIcon}>
            <Icon name="badge" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>{t.panUploadTitle}</Text>
            <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>{t.panUploadHint}</Text>
          </View>
          <Icon name="photo_camera" size={22} color={colors.textSoft} />
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={[font(600), { fontSize: 10.5, letterSpacing: 0.5, color: colors.muted }]}>{t.panOrManual}</Text>
          <View style={styles.orLine} />
        </View>

        <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginBottom: 8 }]}>
          {t.panNumberLabel} <Text style={{ color: colors.red }}>*</Text>
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
        <Text style={[font(400), { fontSize: 11.5, color: colors.muted, marginTop: 6 }]}>{t.panHint}</Text>

        <View style={styles.consentBox}>
          <ConsentRow voiceId="Accept terms and consent" checked={state.panConsent} onChange={v => set({ panConsent: v })}>
            <Text style={[font(700), { color: colors.text }]}>🔒 {t.panConsentTitle}{'\n'}</Text>
            {t.panConsentBody}
          </ConsentRow>
        </View>

        <View style={{ height: 20 }} />
        <PrimaryButton label={busy ? t.submitting : t.panContinue} icon={null} disabled={busy} onPress={onContinue} />
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
