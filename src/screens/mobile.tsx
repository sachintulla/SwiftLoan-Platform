import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, ApiError } from '../api/client';
import { upshotIdentify, upshotEvent } from '../analytics/upshot';

export default function Mobile() {
  const { state, set, go, showToast } = useStore();
  const otpSent = state.otpSent;
  const [otpSeconds, setOtpSeconds] = useState(29);
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxes = useRef<Array<TextInput | null>>([]);

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
      setErr(e instanceof ApiError ? e.message : 'Could not send OTP. Check the API server.');
    } finally {
      setBusy(false);
    }
  };

  // Verify the code with the backend; on success we hold a JWT session.
  const verify = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api.verifyOtp(state.mobileVal, otp.join(''));
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

      go('permissions');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Verification failed.');
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
  const skip = () => go('home');

  useEffect(() => {
    if (!otpSent) return;
    setOtpSeconds(29);
    const id = setInterval(() => setOtpSeconds(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [otpSent]);

  const masked =
    state.mobileVal.length >= 4
      ? '+91 ' + state.mobileVal.slice(0, 2) + '•••• ••' + state.mobileVal.slice(-2)
      : '+91 ••••••••••';
  const timerText = otpSeconds > 0 ? `(in 0:${otpSeconds < 10 ? '0' : ''}${otpSeconds})` : '(Ready now)';

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    // Functional update: several digits can be set back-to-back in the same
    // tick (the voice agent fills all 6 boxes in one batch), and building
    // `next` off the `otp` closure instead of the latest pending state meant
    // each call clobbered the previous one — only the last-applied digit
    // ever stuck. This composes correctly regardless of call order/timing.
    setOtp(prev => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < 5) boxes.current[i + 1]?.focus();
  };

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
            <Text style={styles.h1}>Enter your mobile number</Text>
            <Text style={styles.sub}>We'll send a 6-digit OTP to verify.</Text>

            <Text style={[font(600), styles.label]}>Mobile Number</Text>
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
            <Text style={styles.hint}>Used for secure login and loan updates.</Text>

            <Pressable style={styles.terms} onPress={() => set({ terms: !state.terms })}>
              <View style={[styles.box, state.terms && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {state.terms ? <Icon name="check" size={14} color="#fff" /> : null}
              </View>
              <Text style={[font(500), { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textSoft }]}>
                I agree to the <Text style={{ color: colors.primary }}>Terms of Service</Text> and{' '}
                <Text style={{ color: colors.primary }}>Privacy Policy</Text>.
              </Text>
            </Pressable>

            <View style={styles.secureNote}>
              <Icon name="verified_user" size={16} color={colors.mint} />
              <Text style={styles.secureText}>
                Your information is encrypted. By proceeding you authorize a soft credit check that will not affect your credit score.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.h1}>Verify your number</Text>
            <Text style={styles.sub}>
              Enter the 6-digit code sent to <Text style={font(700)}>{masked}</Text>
            </Text>
            <Pressable style={styles.editRow} onPress={() => { setErr(null); set({ otpSent: false }); }}>
              <Icon name="edit" size={16} color={colors.primary} />
              <Text style={[font(600), { color: colors.primary, fontSize: 13 }]}>Edit phone number</Text>
            </Pressable>

            <View style={styles.otpRow}>
              {otp.map((d, i) => (
                <TextInput
                  key={i}
                  ref={el => {
                    boxes.current[i] = el;
                  }}
                  style={[styles.otpBox, font(700), d ? { borderColor: colors.primary } : null]}
                  keyboardType="number-pad"
                  maxLength={1}
                  // Marks these as a one-time code: enables OS autofill, and makes
                  // the voice layer treat them as sensitive so the agent will not
                  // fill them. The user types the OTP; the agent taps Verify.
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  accessibilityLabel={`OTP digit ${i + 1}`}
                  value={d}
                  onChangeText={v => setDigit(i, v)}
                />
              ))}
            </View>

            <Pressable style={{ alignSelf: 'center', marginTop: 14 }} onPress={resend}>
              <Text style={[font(600), { color: colors.textSoft, fontSize: 13 }]}>
                Resend code <Text style={{ color: colors.muted }}>{timerText}</Text>
              </Text>
            </Pressable>

            <View style={styles.secureNote}>
              <Icon name="verified_user" size={16} color={colors.mint} />
              <Text style={styles.secureText}>Your connection is secure and encrypted.</Text>
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
          <PrimaryButton label={busy ? 'Sending…' : 'Send OTP'} disabled={!sendEnabled} onPress={sendOtp} />
        ) : (
          <PrimaryButton label={busy ? 'Verifying…' : 'Verify & Continue'} disabled={busy || otp.join('').length < 6} onPress={verify} />
        )}

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={[font(500), { color: colors.muted, fontSize: 12 }]}>or</Text>
          <View style={styles.orLine} />
        </View>

        <Pressable style={styles.googleBtn} onPress={() => showToast('Continuing with Google…')}>
          <Text style={[font(800), { color: '#4285F4', fontSize: 16 }]}>G</Text>
          <Text style={[font(600), { color: colors.text, fontSize: 15 }]}>Continue with Google</Text>
        </Pressable>

        <Pressable style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }} onPress={skip}>
          <Text style={[font(600), { color: colors.textSoft, fontSize: 13.5 }]}>Skip for now — explore the app</Text>
          <Icon name="arrow_forward" size={16} color={colors.textSoft} />
        </Pressable>
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
    textAlign: 'center',
    fontSize: 22,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
  errBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,106,94,0.1)', borderRadius: 12, padding: 12, marginTop: 4 },
});
