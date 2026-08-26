import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Animated, ActivityIndicator, Alert } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { ConsentRow, PrimaryButton, StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, isAuthed } from '../api/client';
import { scanPanFromCamera, scanPanFromLibrary, panOcrAvailable, type PanScanResult } from '../utils/panOcr';

const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

export default function BasicPan() {
  const { state, set, go, showToast } = useStore();
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  // Field highlight that pulses while the scanned PAN types itself in.
  const glow = React.useRef(new Animated.Value(0)).current;
  const typeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (typeTimer.current) clearTimeout(typeTimer.current); }, []);

  // Type the recognized PAN in character-by-character, then pulse the field so
  // the auto-fill is visible and feels deliberate.
  const animatePanFill = (pan: string) => {
    if (typeTimer.current) clearTimeout(typeTimer.current);
    set({ panNumber: '' });
    glow.setValue(0);
    Animated.timing(glow, { toValue: 1, duration: 220, useNativeDriver: false }).start();
    let i = 0;
    const step = () => {
      i += 1;
      set({ panNumber: pan.slice(0, i) });
      if (i < pan.length) {
        typeTimer.current = setTimeout(step, 70);
      } else {
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 120, useNativeDriver: false }),
          Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: false }),
        ]).start();
      }
    };
    typeTimer.current = setTimeout(step, 120);
  };

  const handleResult = (res: PanScanResult) => {
    if (res.pan !== null) {
      animatePanFill(res.pan);
      set({ panConsent: true });
      showToast(t.panReadOk);
    } else if (res.reason === 'cancelled' || res.reason === 'no_image') {
      // user backed out — stay silent
    } else if (res.reason === 'unavailable') {
      showToast(t.panOcrUnavailable);
    } else {
      showToast(t.panReadFail);
    }
  };

  const runScan = async (from: 'camera' | 'library') => {
    setScanning(true);
    try {
      const res = await (from === 'camera' ? scanPanFromCamera() : scanPanFromLibrary());
      handleResult(res);
    } finally {
      setScanning(false);
    }
  };

  const onUpload = () => {
    if (scanning) return;
    if (!panOcrAvailable()) {
      showToast(t.panOcrUnavailable);
      return;
    }
    Alert.alert(t.panPickSource, t.panPickSourceHint, [
      { text: t.panFromCamera, onPress: () => runScan('camera') },
      { text: t.panFromLibrary, onPress: () => runScan('library') },
      { text: t.panCancel, style: 'cancel' },
    ]);
  };

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

  const borderColor = glow.interpolate({ inputRange: [0, 1], outputRange: [colors.line, colors.primary] });
  const bg = glow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.7)', 'rgba(7,159,160,0.10)'] });

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
        <Pressable style={[styles.upload, scanning && { opacity: 0.85 }]} onPress={onUpload} disabled={scanning}>
          <View style={styles.badgeIcon}>
            {scanning ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Icon name="badge" size={22} color={colors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>
              {scanning ? t.panScanning : t.panUploadTitle}
            </Text>
            <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>{t.panUploadHint}</Text>
          </View>
          {!scanning && <Icon name="photo_camera" size={22} color={colors.textSoft} />}
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={[font(600), { fontSize: 10.5, letterSpacing: 0.5, color: colors.muted }]}>{t.panOrManual}</Text>
          <View style={styles.orLine} />
        </View>

        <Text style={[font(600), { color: colors.textMid, fontSize: 13, marginBottom: 8 }]}>
          {t.panNumberLabel} <Text style={{ color: colors.red }}>*</Text>
        </Text>
        <Animated.View style={[styles.panRow, { borderColor, backgroundColor: bg }]}>
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
        </Animated.View>
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
