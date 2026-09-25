import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Animated, ActivityIndicator, Alert, Modal } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { ConsentRow, HeaderCta, StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, ApiError, isAuthed } from '../api/client';
import { PanVerifyingLoader } from '../components/PanVerifyingLoader';
import { scanPanFromCamera, scanPanFromLibrary, panOcrAvailable, type PanScanResult } from '../utils/panOcr';

// Real PAN structure, not just "5 letters + 4 digits + 1 letter" — that bare
// shape alone lets through obvious placeholders like "AAAAA0000A". The 4th
// character is a real holder-type code (P=Individual, C=Company, H=HUF,
// A=AOP, B=BOI, G=Government, J=Artificial Judicial Person, L=Local
// Authority, F=Firm, T=Trust) — every genuine PAN has one of these there.
const PAN_HOLDER_CODES = 'ABCFGHJLPT';
function isValidPan(v: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) && PAN_HOLDER_CODES.includes(v[3]);
}

type PanAlert = { tone: 'error' | 'warning'; message: string };

export default function BasicPan() {
  const { state, set, mergeApiContext, go, showToast, markUrgentContext } = useStore();
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  // Set once the API has verified the PAN: the loader finishes its ticks,
  // then hands off to the details step.
  const [verified, setVerified] = React.useState(false);
  // Popup content comes straight from the API response — only the icon tone
  // is chosen here: red when the PAN itself failed, amber when the service
  // couldn't be reached / retry is the answer.
  const [alert, setAlert] = React.useState<PanAlert | null>(null);
  const [scanning, setScanning] = React.useState(false);
  // Field highlight that pulses while the scanned PAN types itself in.
  const glow = React.useRef(new Animated.Value(0)).current;
  const typeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (typeTimer.current) clearTimeout(typeTimer.current); }, []);

  // Returning applicant ("Update details", a second loan): start from the PAN
  // already on their profile. Re-verifying it is served from the server's PAN
  // cache, so it never costs a second paid Aurix call.
  React.useEffect(() => {
    if (!isAuthed() || state.panNumber) return;
    api.me().then((r: any) => {
      const saved = r?.user?.panNumber;
      if (saved) set({ panNumber: String(saved) });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const pan = state.panNumber.trim().toUpperCase();
    if (!isValidPan(pan)) {
      showToast(t.panValidate);
      // A toast is UI-only — same reasoning as profile.tsx's
      // profileSaveResult. Without this, a voice-driven continue just does
      // nothing with no way for the agent to know why, and it either
      // repeats the same failing tap or tells the user it worked.
      mergeApiContext({ panValidationResult: { ok: false, error: t.panValidate } });
      return;
    }
    if (!state.panConsent) {
      showToast(t.panConsentValidate);
      mergeApiContext({ panValidationResult: { ok: false, error: t.panConsentValidate } });
      return;
    }
    if (!isAuthed()) {
      showToast(t.basicValMobile);
      go('mobile');
      return;
    }
    setBusy(true);
    setVerified(false);
    let succeeded = false;
    try {
      // PAN Comprehensive (server-cached) → pre-fill for the details step.
      // The loader runs for exactly as long as this takes, then finishes its ticks.
      const result = await api.verifyPan(pan);
      mergeApiContext({ panValidationResult: { ok: result.verified, ...(result.verified ? {} : { error: result.message }) } });
      if (!result.verified) {
        setAlert({ tone: 'error', message: result.message || t.panVerifyFail });
        return;
      }
      set({ panNumber: pan, panPrefill: { pan, prefill: result.prefill ?? {}, aadhaarLinked: result.aadhaarLinked ?? null } });
      // An application already in progress (back from a later step): keep its PAN in sync.
      if (state.applicationId) {
        api.updateApplication(state.applicationId, { panNumber: pan }).catch(() => {});
      }
      succeeded = true;
      setVerified(true); // loader completes → go('basic')
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const message = e instanceof ApiError && e.message ? e.message : t.panVerifyFail;
      setAlert({ tone: status === 400 || status === 409 ? 'error' : 'warning', message });
      // A real async failure needs to reach api_context, and urgently: Ruby
      // may still be mid "let me verify that" when it lands.
      mergeApiContext({ panValidationResult: { ok: false, error: message } });
      markUrgentContext();
    } finally {
      // On success the loader stays up until it hands off to the details step.
      if (!succeeded) setBusy(false);
    }
  };

  // Only gates the button once a full, confidently-wrong PAN is typed — matches
  // this screen's existing convention of otherwise leaving Continue tappable
  // (empty PAN, missing consent) and explaining what's missing via toast.
  const panTyped = state.panNumber.trim().toUpperCase();
  const panInvalid = panTyped.length === 10 && !isValidPan(panTyped);

  const borderColor = glow.interpolate({ inputRange: [0, 1], outputRange: [colors.line, colors.primary] });
  const bg = glow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.7)', 'rgba(7,159,160,0.10)'] });

  // While verifying, the loader replaces the form on the same screen.
  if (busy) {
    return (
      <Screen scroll padded={false}>
        <View style={{ paddingHorizontal: 20 }}>
          <AppHeader title={<View />} />
          <StepBadge step={1} of={3} label="PAN" />
          <StepDots total={3} active={1} />
          <PanVerifyingLoader done={verified} onFinished={() => { setBusy(false); setVerified(false); go('basic'); }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader
          title={<View />}
          right={<HeaderCta label={t.panVerifyBtn} disabled={busy || panInvalid} onPress={onContinue} />}
        />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={1} of={3} label="PAN" />
        <StepDots total={3} active={1} />
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
            placeholder="AAAPL1234C"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            maxLength={10}
            value={state.panNumber}
            onChangeText={v => set({ panNumber: v.toUpperCase().slice(0, 10) })}
          />
          <Icon name="edit" size={18} color={colors.muted} />
        </Animated.View>
        <Text style={[font(400), { fontSize: 11.5, color: colors.muted, marginTop: 6 }]}>{t.panHint}</Text>
        {panInvalid ? (
          <Text style={[font(500), { fontSize: 12, color: colors.red, marginTop: 4 }]}>{t.panValidate}</Text>
        ) : null}

        <View style={styles.consentBox}>
          <ConsentRow voiceId="Accept terms and consent" checked={state.panConsent} onChange={v => set({ panConsent: v })}>
            <Text style={[font(700), { color: colors.text }]}>🔒 {t.panConsentTitle}{'\n'}</Text>
            {t.panConsentBody}
          </ConsentRow>
        </View>

        <View style={{ height: 12 }} />
      </View>
      <PanAlertModal alert={alert} okLabel={t.panErrOk} onClose={() => setAlert(null)} />
    </Screen>
  );
}

/** The PAN error popup — the API's own message, red (PAN failed) or amber (retry). */
function PanAlertModal({ alert, okLabel, onClose }: { alert: PanAlert | null; okLabel: string; onClose: () => void }) {
  const red = alert?.tone === 'error';
  return (
    <Modal visible={!!alert} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.alertCard} accessibilityRole="alert">
          <View style={[styles.alertIc, { backgroundColor: red ? '#FDE8E8' : '#FCEFD9' }]}>
            <Icon name={red ? 'error' : 'warning'} size={28} color={red ? colors.red : '#B4740A'} />
          </View>
          <Text style={[font(600), styles.alertMsg]}>{alert?.message}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.alertBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <Text style={[font(800), { color: '#fff', fontSize: 15 }]}>{okLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  alertCard: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 22, padding: 22, alignItems: 'center' },
  alertIc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  alertMsg: { fontSize: 15, color: colors.text, textAlign: 'center', marginTop: 14, lineHeight: 21 },
  alertBtn: { marginTop: 20, alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  consentBox: {
    marginTop: 18,
    backgroundColor: 'rgba(47,177,131,0.07)',
    borderRadius: 14,
    padding: 14,
  },
});
