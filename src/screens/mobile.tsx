import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform, Linking, Keyboard } from 'react-native';
import { PRIVACY_POLICY_URL } from '../content/legal';
import { getScroller } from '../feedback/agentFx';
import { Screen } from '../components/Frame';
import { WelcomeHero } from '../components/LoginHero';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, ApiError } from '../api/client';
import { upshotIdentify, upshotEvent, registerUpshotPush } from '../analytics/upshot';
import { useVoiceTarget } from '../voice/useVoiceTarget';
import { VoiceHidden } from '../voice/screenGraph';
import { setScreenHint } from '../voice/actionRegistry';
import { agent } from '../voice';
import { parseResume, resumeDestination } from '../utils/resume';

// Real Indian mobile numbers start with 6-9 and aren't just one digit repeated
// ("0000000000", "9999999999") — the server's own phoneSchema only checked
// length (`^\d{10}$`), so those sailed straight through to a real OTP send.
function isValidMobile(v: string): boolean {
  return /^[6-9]\d{9}$/.test(v) && !/^(\d)\1{9}$/.test(v);
}

export default function Mobile() {
  const { state, set, go, markUrgentContext, refreshUserContext } = useStore();
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
  // The "I agree" consent row sits just below the phone field. On this New-Architecture
  // build the Screen's generic focus-lift can't find the focused field, so lift the
  // consent into view ourselves: when the keyboard opens on the number step, measure
  // the consent and scroll the page so its bottom clears the keyboard (and the pinned
  // Send OTP bar that lifts onto the keyboard's top edge).
  const consentRef = useRef<View>(null);
  useEffect(() => {
    if (otpSent) return undefined;
    const sub = Keyboard.addListener('keyboardDidShow', e => {
      const kbTop = e.endCoordinates.screenY;
      // Defer: the Screen adds its keyboard bottom-padding on this same event, so we
      // measure and scroll only after that padding (the scroll room) has been applied.
      setTimeout(() => {
        const sc = getScroller('mobile');
        const node = consentRef.current;
        if (!sc || !node?.measureInWindow) return;
        node.measureInWindow((_x, y, _w, h) => {
          if (!Number.isFinite(y) || h <= 0) return;
          // Keep the consent's bottom this far above the keyboard: the pinned Send OTP
          // bar (~96pt) rides on the keyboard's top edge, plus a little breathing room.
          const RESERVE = 108;
          const delta = (y + h) - (kbTop - RESERVE);
          if (delta > 0) sc.scrollToY(sc.getOffset() + delta);
        });
      }, 180);
    });
    return () => sub.remove();
  }, [otpSent]);

  // Re-focus the hidden OTP field on tap. On Android, once the soft keyboard
  // is dismissed by the user (back button, swipe-down, tapping outside) the
  // TextInput itself never actually loses native focus — RN's `.focus()` is
  // then a no-op (Android's View.requestFocus() short-circuits when the view
  // already reports focused), so the keyboard never reappears and the boxes
  // look permanently "stuck". Forcing a real blur → focus transition makes
  // Android re-request the IME. iOS re-opens the keyboard from a bare
  // .focus() just fine, so it's untouched there.
  const refocusOtp = () => {
    if (Platform.OS === 'android') {
      hiddenOtpInput.current?.blur();
      setTimeout(() => hiddenOtpInput.current?.focus(), 50);
    } else {
      hiddenOtpInput.current?.focus();
    }
  };

  const mobileLen = state.mobileVal.length;
  const mobileInvalid = mobileLen === 10 && !isValidMobile(state.mobileVal);
  const sendEnabled = mobileLen === 10 && isValidMobile(state.mobileVal) && state.terms && !busy;

  // Request an OTP from the backend, then reveal the code entry.
  const sendOtp = async () => {
    setErr(null);
    if (!isValidMobile(state.mobileVal)) {
      setErr(t.mobileErrInvalid);
      return;
    }
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
      // api.verifyOtp() already clears the intro-pitch-heard flag and the
      // saved applicant-details draft from AsyncStorage (new phone number =
      // genuinely new person), but that only touches storage — this app
      // session's in-memory state.introPitchHeard/savedApplicantDraft is left
      // over from before this login (e.g. an earlier call this session, or a
      // previous account on a shared device) and must be reset here too, or
      // the very next page_context still reports heard_intro_pitch: true and
      // Ruby skips the first-time pitch for someone who's never heard it.
      //
      // Exception: a call that is LIVE right now. The person logging in is the one
      // already on that call, and has heard (or is hearing) the pitch — resetting
      // it mid-call made every later page_context say heard_intro_pitch:false, so
      // Ruby greeted them again on Home. Only reset between calls.
      const callLive = (() => {
        const s = agent.getStatus();
        return s !== 'idle' && s !== 'ended';
      })();
      set({
        authUser: r.user,
        // otpSent stays true until we navigate (reset alongside each go() below). Resetting it here
        // flipped this screen back to "enter your number" for the 1-3 s the lookups below take.
        priorInquiries: r.priorInquiries,
        ...(callLive ? {} : { introPitchHeard: false }),
        savedApplicantDraft: null,
      });

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
      // The first authentication result of the call, branching where the
      // user lands next — at least as consequential as finding.tsx's
      // offers-found case, and Ruby may still be mid-sentence about the OTP
      // when it arrives. Same reasoning for a wrong code below: she needs to
      // know it failed the instant it's known, not after finishing whatever
      // she's already saying.
      // Load this account's history first, so the urgent update that tells the agent who just
      // logged in also says whether an application is under review (about 0.3s, capped at 1.5s).
      await refreshUserContext();
      markUrgentContext();
      // Returning users never see the Permissions screen, which is where push is normally
      // requested — so request it here. iOS only shows its prompt once (when the choice is
      // still undetermined), and nothing is shown if they already decided.
      if (alreadyOnboarded) registerUpshotPush();

      // Website drop-off recovery: this person may have left an application unfinished on the website.
      // The server's answer for THIS account is the authority (it knows whether step 1 is really done);
      // the install link's own hint is only used if it is for the same number and the lookup fails.
      const fromLink = state.resume && state.resume.phone === state.mobileVal ? state.resume : null;
      const lookedUp = await Promise.race([
        api.journeyResume().catch(() => null),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 1500)),
      ]);
      const resume = parseResume(lookedUp, 'login') ?? fromLink;
      const dest = resumeDestination(resume, alreadyOnboarded);

      if (resume && dest === 'step2') {
        // Step 1 (PAN) was done on the website: pick up the verified details (never the PAN itself) and go
        // straight to step 2. If the server no longer has them, fall back to offering the application from Home.
        const onFile = await api.panOnFile().catch(() => null);
        if (onFile?.onFile && onFile.maskedPan) {
          set({
            resume, resumePrompt: null, resumeStage: 'resumed_at_step_2', otpSent: false,
            panNumber: onFile.maskedPan,
            panPrefill: { pan: onFile.maskedPan, prefill: onFile.prefill ?? {}, aadhaarLinked: onFile.aadhaarLinked ?? null },
          });
          registerUpshotPush();
          markUrgentContext();
          go('basic');
          return;
        }
      }
      if (resume && (dest === 'home_offer' || dest === 'step2')) {
        // Returning website visitor (OTP verified on the site, or PAN done without a usable
        // on-file record). Don't interrupt with a "you already have an account" pop-up — just
        // carry their first name so the dashboard greets them (their loan amount fills in from
        // their own application, which Home fetches), keep the resume context for the voice
        // agent, and land on Home with the normal "Apply for a loan" CTA.
        set({
          resume, resumePrompt: null, resumeStage: 'offer_start_application', otpSent: false,
          ...(resume.firstName ? { pdName: resume.firstName } : {}),
        });
        registerUpshotPush();
        markUrgentContext();
        go('home');
        return;
      }
      // Nothing to resume (or it was for someone else's number): forget it, so another visitor's phone number and
      // name never linger in memory.
      set({ resume: null, resumePrompt: null, resumeStage: null, otpSent: false });
      // Skip the permissions screen entirely — go straight to the dashboard after OTP.
      // Still register for push here (the permissions screen used to do it), so
      // skipping that screen doesn't silently drop notification registration.
      registerUpshotPush();
      go('home');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.mobileErrVerify);
      markUrgentContext();
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

  // Auto-continue: the moment all 6 digits are in — the iOS keyboard's
  // one-time-code suggestion, Android's SMS autofill, a paste, or typing —
  // verify straight away instead of waiting for the Verify tap. Each code is
  // auto-submitted at most once, so a wrong code shows its error and waits
  // for an edit rather than looping; the button still works for a retry.
  const autoSubmitted = useRef<string | null>(null);
  useEffect(() => {
    if (!otpSent || busy || otpCode.length !== 6 || autoSubmitted.current === otpCode) return;
    autoSubmitted.current = otpCode;
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode, otpSent, busy]);
  useEffect(() => { if (!otpSent) autoSubmitted.current = null; }, [otpSent]);

  // The OTP entry is one hidden TextInput behind 6 decorative digit boxes (see
  // hiddenOtpInput above) — the element-tree walk in screenGraph.ts can't
  // describe it correctly: it classifies the wrapping Pressable as a `button`
  // and mislabels it "OTP digit 1" (the first box's accessibilityLabel), while
  // the real hidden field falls back to the nearest preceding label-like text
  // ("Edit phone number"). Registering it explicitly here overrides that with
  // a correctly-labelled, directly fillable `field:OTP` target.
  // The code-entry step is the same screen as number entry (`otpSent`), so tell the agent which one it is
  // on — it was told "Enter Mobile Number / the user enters their mobile number" while waiting for a code.
  useEffect(() => {
    setScreenHint(
      'mobile',
      otpSent ? { screen_title: 'Verify OTP', screen_purpose: 'The user enters the OTP sent by SMS to verify their number.' } : null,
    );
    return () => setScreenHint('mobile', null);
  }, [otpSent]);

  useVoiceTarget(
    otpSent ? 'OTP' : undefined,
    { kind: 'field', getValue: () => otpCode, setValue: v => onOtpChange(String(v)) },
    [otpCode, otpSent],
  );

  // The terms Pressable below is hand-rolled, not the shared ConsentRow (which
  // registers its own voiceId) — the element-tree walk auto-discovers it from
  // its own first text fragment (t.termsAgreePrefix), which is "I agree to the"
  // in English but collapses to a bare "నేను" ("I") in Telugu, an unusable
  // voice label. Confirmed live: available_actions showed "button:నేను" on this
  // screen. Explicit registration gives it a stable label in every language,
  // without touching the visual markup.
  useVoiceTarget(
    !otpSent ? 'Accept terms and privacy policy' : undefined,
    { kind: 'consent', getValue: () => state.terms, setValue: v => set({ terms: !!v }) },
    [state.terms],
  );

  return (
    <Screen
      variant="plain"
      scroll
      padded={false}
      statusBar="light-content"
      contentStyle={{ paddingTop: 0, backgroundColor: '#fff' }}
      // On the number-entry step, the "I agree" consent sits just below the focused
      // phone field. Reserve enough space above the keyboard (footer height + the
      // hint + consent rows) so focusing the field scrolls the consent into view
      // above the keyboard too — not just the field. The OTP step has nothing
      // below its field, so the default footer reserve is fine there.
      footerReserve={!otpSent ? 184 : undefined}
      // Pin the primary action to the bottom so it's always visible — the intro
      // pitch merged under the form would otherwise push "Send OTP" below the fold.
      footer={
        !otpSent ? (
          <PrimaryButton label={busy ? t.mobileSending : 'Send OTP & Check Offers'} disabled={!sendEnabled} onPress={sendOtp} />
        ) : (
          <PrimaryButton label={busy ? t.otpVerifying : t.otpVerify} disabled={busy || otpCode.length < 6} onPress={verify} />
        )
      }
    >
      {/* Dark welcome header on both steps. The OTP step adds a back arrow (returns
          to number entry) and swaps the value badge for the verification context;
          no back on number entry — the privacy gate is accepted once at first launch
          and never reshown. */}
      {otpSent ? (
        <WelcomeHero
          onBack={() => { setErr(null); set({ otpSent: false }); }}
          badge={{ icon: 'lock', label: 'Secure mobile verification' }}
          showChips={false}
        />
      ) : (
        <WelcomeHero />
      )}

      {!otpSent ? (
        // White "verify" sheet overlapping the hero's wave.
        <View style={styles.sheet}>
          <View style={styles.grab} />
          {/* On-screen instructions are for the user's eyes: hidden from the agent so
              it asks for the number naturally instead of reading them aloud. */}
          <VoiceHidden>
            <Text style={styles.h1}>Welcome to SwiftLoan</Text>
            <Text style={styles.sub}>
              Enter your mobile number to check pre-approved loan offers from our{' '}
              <Text style={[font(700), { color: colors.text }]}>RBI-regulated lending partners</Text>.
            </Text>
          </VoiceHidden>

          {/* The real label string (shown uppercase by the style) so the agent addresses the field as "Mobile Number". */}
          <Text style={styles.fieldLabel}>{t.mobileNumberLabel}</Text>
          <View style={[styles.phoneRow, mobileLen === 10 && !mobileInvalid && styles.phoneRowOk]}>
            {/* Flag + "+91" are decoration: hidden from the agent, or the flag emoji became the field's label. */}
            <VoiceHidden>
              <View style={styles.ccBox}>
                <Text style={{ fontSize: 18, marginRight: 6 }}>🇮🇳</Text>
                <Text style={[font(700), { fontSize: 15, color: colors.text, marginRight: 2 }]}>+91</Text>
                <Icon name="expand_more" size={18} color={colors.muted} />
              </View>
            </VoiceHidden>
            <View style={styles.ccDivider} />
            <TextInput
              style={[styles.phoneInput, font(600)]}
              placeholder="98765 43210"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={10}
              value={state.mobileVal}
              onChangeText={v => set({ mobileVal: v.replace(/\D/g, '').slice(0, 10) })}
            />
            {mobileLen === 10 && !mobileInvalid ? (
              <View style={styles.okCircle}><Icon name="check" size={15} color="#fff" /></View>
            ) : null}
          </View>
          {/* On-screen instruction for the user's eyes: hidden from the agent so it doesn't read it aloud. */}
          <VoiceHidden>
            <View style={styles.otpNote}>
              <Icon name="lock" size={14} color={colors.mint} />
              <Text style={styles.otpNoteText}>We'll send a 6-digit OTP to verify securely</Text>
            </View>
          </VoiceHidden>
          {mobileInvalid ? (
            <Text style={[font(500), { fontSize: 12, color: colors.redDeep, marginTop: 6 }]}>{t.mobileErrInvalid}</Text>
          ) : null}

          {/* Soft-credit-check reassurance: fixed text for the user's eyes, hidden from the agent (it is sent on
              every update of this screen and the agent's own pitch already covers it). */}
          <VoiceHidden>
            <View style={styles.softCard}>
              <View style={styles.softIcon}><Icon name="shield" size={18} color={colors.mint} /></View>
              <Text style={styles.softText}>
                <Text style={[font(700), { color: colors.text }]}>Soft Credit Check Only: </Text>
                Checking your pre-approved limit does not affect your credit score. RBI regulated lending partners.
              </Text>
            </View>
          </VoiceHidden>

          {/* Hidden from the agent: the explicit "Accept terms and privacy policy" consent target (registered
              above) is the one control for this row. Left visible, the walker listed it a second time as the
              button "By proceeding, you agree to our", which continue_next once mis-tapped (un-ticking terms). */}
          <VoiceHidden>
          <Pressable ref={consentRef} style={styles.terms} onPress={() => set({ terms: !state.terms })}>
            <View style={[styles.box, state.terms && { backgroundColor: colors.mint, borderColor: colors.mint }]}>
              {state.terms ? <Icon name="check" size={14} color="#fff" /> : null}
            </View>
            <Text style={[font(500), styles.consentText]}>
              By proceeding, you agree to our{' '}
              {/* onPress on these inner Text spans opens the link and does not bubble to
                  the row Pressable, so tapping a link never toggles consent. */}
              <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>Terms of Service</Text>,{' '}
              <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>Privacy Policy</Text>
              {' '}&amp; allow WhatsApp updates.
            </Text>
          </Pressable>
          </VoiceHidden>

          {err ? (
            <View style={styles.errBox}>
              <Icon name="error" size={16} color={colors.redDeep} />
              <Text style={[font(500), { flex: 1, fontSize: 12.5, color: colors.redDeep }]}>{err}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <>
            {/* Same here: "enter the 6-digit code…" is a UI instruction the agent must not parrot
                (it was read out in Telugu on a live call). It asks for the OTP its own way. */}
            <VoiceHidden>
              <Text style={styles.h1}>{t.otpTitle}</Text>
              <Text style={styles.sub}>
                {t.otpSub} <Text style={font(700)}>{masked}</Text>
              </Text>
            </VoiceHidden>
            <Pressable style={styles.editRow} onPress={() => { setErr(null); set({ otpSent: false }); }}>
              <Icon name="edit" size={16} color={colors.primary} />
              <Text style={[font(600), { color: colors.primary, fontSize: 13 }]}>{t.otpEditPhone}</Text>
            </Pressable>

            {/* VoiceHidden: the digit boxes and the hidden input are exposed to the agent by the
                explicit `OTP` field registered above. Left visible, the walker listed them again
                as a button "OTP digit 1" and a second field mislabelled with the "change phone
                number" button text (both holding the same code). */}
            <VoiceHidden>
            <Pressable style={styles.otpRow} onPress={refocusOtp}>
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
                  OS autofill suggestion as a single 6-char value. Voice-fillable
                  as `field:OTP` via the explicit useVoiceTarget registration
                  above — the element-tree walk can't see/label this correctly
                  on its own (see the comment there). */}
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
            </VoiceHidden>

            <Pressable style={{ alignSelf: 'center', marginTop: 14, flexDirection: 'row' }} onPress={resend}>
              <Text style={[font(600), { color: colors.textSoft, fontSize: 13 }]}>{t.otpResend}</Text>
              {/* The countdown ticks every second (setInterval above) — a
                  string that changes that often was landing as new
                  screen_overview content every second and prompting a fresh
                  spoken response each time (same root cause as the language
                  screen's rotating greeting). VoiceHidden only takes effect
                  when the walker visits a node directly; nesting it inside
                  the button's own label Text wouldn't work (label collection
                  reads through VoiceHidden), so this has to be a sibling Text
                  node, not a child of the one above. The button's own label
                  still resolves to the stable "Resend OTP" text, unaffected. */}
              <VoiceHidden>
                <Text style={{ color: colors.muted, fontSize: 13 }}> {timerText}</Text>
              </VoiceHidden>
            </Pressable>

            <VoiceHidden>
              <View style={styles.secureNote}>
                <Icon name="verified_user" size={16} color={colors.mint} />
                <Text style={styles.secureText}>{t.otpSecureNote}</Text>
              </View>
            </VoiceHidden>

            {err ? (
              <View style={styles.errBox}>
                <Icon name="error" size={16} color={colors.redDeep} />
                <Text style={[font(500), { flex: 1, fontSize: 12.5, color: colors.redDeep }]}>{err}</Text>
              </View>
            ) : null}
          </>
        </View>
      )}
      {/* The Send OTP / Verify button is pinned in the Screen footer (above),
          so it stays visible at the bottom — no inline copy here. */}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // White "verify" sheet that overlaps the dark welcome header.
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -24,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#E2E9E7', alignSelf: 'center', marginBottom: 16 },
  h1: { ...font(800), fontSize: 27, letterSpacing: -0.6, color: colors.text },
  sub: { ...font(400), fontSize: 14.5, color: '#6E8080', marginTop: 8, lineHeight: 21 },
  fieldLabel: { ...font(700), fontSize: 12, letterSpacing: 0.8, color: colors.textMid, marginTop: 22, marginBottom: 10, textTransform: 'uppercase' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 8,
    height: 58,
    backgroundColor: '#fff',
  },
  phoneRowOk: { borderColor: colors.mint, borderWidth: 2 },
  ccBox: { flexDirection: 'row', alignItems: 'center' },
  ccDivider: { width: 1, height: 28, backgroundColor: colors.line, marginHorizontal: 10 },
  phoneInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 14, letterSpacing: 1 },
  okCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  otpNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  otpNoteText: { ...font(500), fontSize: 12.5, color: colors.textSoft },
  // Soft-credit-check card
  softCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 18,
    backgroundColor: 'rgba(47,177,131,0.08)', borderWidth: 1, borderColor: 'rgba(47,177,131,0.2)',
    borderRadius: 14, padding: 14,
  },
  softIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(47,177,131,0.15)', alignItems: 'center', justifyContent: 'center' },
  softText: { flex: 1, ...font(500), fontSize: 13, lineHeight: 19, color: colors.textSoft },
  consentText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: colors.textSoft },
  link: { ...font(700), color: colors.mint, textDecorationLine: 'underline' },
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
  // Intro pitch merged into the mobile screen (below the number entry).
  introWrap: { marginTop: 0 },
  introBadge: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(7,159,160,0.1)', borderWidth: 1, borderColor: 'rgba(7,159,160,0.18)',
    borderRadius: 9999, paddingVertical: 6, paddingLeft: 10, paddingRight: 13, marginBottom: 10,
  },
  introCard: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 18,
    paddingHorizontal: 14,
  },
  introFeat: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  introTile: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  introStatCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 22,
    paddingVertical: 16, paddingHorizontal: 8, marginTop: 14,
  },
  introStatDiv: { width: 1, height: 34, backgroundColor: 'rgba(120,150,148,0.2)' },
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
