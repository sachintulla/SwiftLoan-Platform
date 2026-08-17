import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, ApiError } from '../api/client';
import { upshotIdentify, upshotEvent } from '../analytics/upshot';

export default function Mobile() {
  const { state, set, go } = useStore();
  const t = useT();
  const otpSent = state.otpSent;
  const [otpSeconds, setOtpSeconds] = useState(29);
  // Single hidden field is the source of truth (see hiddenOtpInput below) — the
  // 6 visible boxes are just a display of it, not separate inputs. Distributing
  // OS autofill across 6 real TextInputs is unreliable (iOS/Android autofill
  // targets one focused field with the whole code, not one keystroke per box).
  const [otpCode, setOtpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hiddenOtpInput = useRef<TextInput>(null);

  const mobileLen = state.mobileVal.length;
  const sendEnabled = mobileLen === 10 && state.terms && !busy;

  // Request an OTP from the backend, then reveal the code entry.
  const sendOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.requestOtp(state.mobileVal);
      set({ otpSent: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.mobileErrSend);
    } finally {
      setBusy(false);
    }
  };

  // Verify the code with the backend; on success we hold a JWT session.
  const verify = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api.verifyOtp(state.mobileVal, otpCode);
      set({ authUser: r.user, otpSent: false, priorInquiries: r.priorInquiries });

      // Upshot: this is the first moment we know who this person is. Identify
      // with the same E.164 phone the website and server use, so all three
      // resolve to one Upshot profile rather than three.
      upshotIdentify({
        userId: String(r.user?.id ?? state.mobileVal),
        phone: state.mobileVal,
        name: (r.user?.fullName as string | undefined) ?? null,
        email: (r.user?.email as string | undefined) ?? null,
      });
      upshotEvent('otp_verified', { priorInquiryCount: r.priorInquiries?.length ?? 0 });

      // Returning user who already completed About You in a previous session
      // (fullName + pincode on file) — skip the permissions explainer and
      // About You form entirely and land straight on the dashboard.
      const alreadyOnboarded = !!(r.user?.fullName && r.user?.pincode);
      go(alreadyOnboarded ? 'home' : 'permissions');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.mobileErrVerify);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setOtpSeconds(29);
    await api.requestOtp(state.mobileVal).catch(() => {});
  };

  // Browse without signing in. No session is created — screens that need auth
  // (starting an application, profile, loans) prompt for real verification
  // when the user actually reaches them.

  useEffect(() => {
    if (!otpSent) return;
    setOtpSeconds(29);
    setOtpCode('');
    // Autofocus so the keyboard (and the OS autofill suggestion) appears
    // immediately once the code-entry step is shown, no tap needed.
    const focusTimer = setTimeout(() => hiddenOtpInput.current?.focus(), 50);
    const id = setInterval(() => setOtpSeconds(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      clearInterval(id);
      clearTimeout(focusTimer);
    };
  }, [otpSent]);

  const masked =
    state.mobileVal.length >= 4
      ? '+91 ' + state.mobileVal.slice(0, 2) + '•••• ••' + state.mobileVal.slice(-2)
      : '+91 ••••••••••';
  const timerText = otpSeconds > 0 ? `(${t.otpTimerIn} 0:${otpSeconds < 10 ? '0' : ''}${otpSeconds})` : `(${t.otpReadyNow})`;

  const onOtpChange = (v: string) => setOtpCode(v.replace(/\D/g, '').slice(0, 6));

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('intro')} title={<View />} />
      </View>

      <View style={{ paddingHorizontal: 24, alignItems: 'center', marginTop: 6, marginBottom: 18 }}>
        <View style={styles.phoneCircle}>
          <Icon name="stay_current_portrait" size={30} color={colors.primary} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {!otpSent ? (
          <>
            <Text style={styles.h1}>{t.mobileTitle}</Text>
            <Text style={styles.sub}>{t.mobileSub}</Text>

            <Text style={[font(600), styles.label]}>{t.mobileNumberLabel}</Text>
            <View style={styles.phoneRow}>
              <Text style={[font(700), { fontSize: 16, color: colors.text, marginRight: 8 }]}>+91</Text>
              <TextInput
                style={[styles.phoneInput, font(600)]}
                placeholder="00000 00000"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={10}
                value={state.mobileVal}
                onChangeText={v => set({ mobileVal: v.replace(/\D/g, '').slice(0, 10) })}
              />
            </View>
            <Text style={styles.hint}>{t.mobileHint}</Text>

            <Pressable style={styles.terms} onPress={() => set({ terms: !state.terms })}>
              <View style={[styles.box, state.terms && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {state.terms ? <Icon name="check" size={14} color="#fff" /> : null}
              </View>
              <Text style={[font(500), { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textSoft }]}>
                {t.termsAgreePrefix} <Text style={{ color: colors.primary }}>{t.linkTerms}</Text> {t.termsAgreeMid}{' '}
                <Text style={{ color: colors.primary }}>{t.linkPrivacy}</Text>{t.termsAgreeSuffix}
              </Text>
            </Pressable>

            <View style={styles.secureNote}>
              <Icon name="verified_user" size={16} color={colors.mint} />
              <Text style={styles.secureText}>
                {t.mobileSecureNote}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.h1}>{t.otpTitle}</Text>
            <Text style={styles.sub}>
              {t.otpSub} <Text style={font(700)}>{masked}</Text>
            </Text>
            <Pressable style={styles.editRow} onPress={() => { setErr(null); set({ otpSent: false }); }}>
              <Icon name="edit" size={16} color={colors.primary} />
              <Text style={[font(600), { color: colors.primary, fontSize: 13 }]}>{t.otpEditPhone}</Text>
            </Pressable>

            <Pressable style={styles.otpRow} onPress={() => hiddenOtpInput.current?.focus()}>
              {Array.from({ length: 6 }, (_, i) => (
                <View
                  key={i}
                  style={[styles.otpBox, otpCode[i] ? { borderColor: colors.primary } : null]}
                  accessibilityLabel={`OTP digit ${i + 1}`}
                >
                  <Text style={[font(700), styles.otpDigit]}>{otpCode[i] ?? ''}</Text>
                </View>
              ))}
              {/* The real input: one field, off-screen but focusable, catches the
                  OS autofill suggestion as a single 6-char value. Marks itself
                  sensitive to the voice layer so the agent will not fill it —
                  the user types the OTP; the agent taps Verify. */}
              <TextInput
                ref={hiddenOtpInput}
                style={styles.otpHiddenInput}
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                value={otpCode}
                onChangeText={onOtpChange}
              />
            </Pressable>

            <Pressable style={{ alignSelf: 'center', marginTop: 14 }} onPress={resend}>
              <Text style={[font(600), { color: colors.textSoft, fontSize: 13 }]}>
                {t.otpResend} <Text style={{ color: colors.muted }}>{timerText}</Text>
              </Text>
            </Pressable>

            <View style={styles.secureNote}>
              <Icon name="verified_user" size={16} color={colors.mint} />
              <Text style={styles.secureText}>{t.otpSecureNote}</Text>
            </View>
          </>
        )}

        {err ? (
          <View style={styles.errBox}>
            <Icon name="error" size={16} color={colors.redDeep} />
            <Text style={[font(500), { flex: 1, fontSize: 12.5, color: colors.redDeep }]}>{err}</Text>
          </View>
        ) : null}

        <View style={{ height: 22 }} />
        {!otpSent ? (
          <PrimaryButton label={busy ? t.mobileSending : t.mobileSendOtp} disabled={!sendEnabled} onPress={sendOtp} />
        ) : (
          <PrimaryButton label={busy ? t.otpVerifying : t.otpVerify} disabled={busy || otpCode.length < 6} onPress={verify} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  phoneCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E1F3F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: { ...font(800), fontSize: 24, letterSpacing: -0.5, color: colors.text },
  sub: { ...font(400), fontSize: 14, color: '#6E8080', marginTop: 6, lineHeight: 20 },
  label: { fontSize: 13, color: colors.textMid, marginTop: 20, marginBottom: 8 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  phoneInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 14, letterSpacing: 1 },
  hint: { ...font(400), fontSize: 11.5, color: colors.muted, marginTop: 6 },
  terms: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 18 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  secureNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 18,
    backgroundColor: 'rgba(47,177,131,0.08)',
    borderRadius: 12,
    padding: 12,
  },
  secureText: { ...font(500), flex: 1, fontSize: 11.5, lineHeight: 17, color: '#4A6360' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  otpBox: {
    width: 46,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: 22, color: colors.text },
  otpHiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0.01 },
  errBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,106,94,0.1)', borderRadius: 12, padding: 12, marginTop: 4 },
});
