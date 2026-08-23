import React, { useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { Screen } from '../components/Frame';
import { PrimaryButton, ConsentRow } from '../components/Controls';
import { LogoMark } from '../components/Logo';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { useHandoffIn } from '../utils/handoff';
import { savePrivacyAccepted } from '../state/session';
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_POLICY_VERSION } from '../content/privacyPolicy';

/**
 * First-launch Privacy Policy consent gate. The user must read and accept before
 * using the app; acceptance is persisted so it's shown only once. Content is the
 * approved SwiftLoan Privacy Policy (DPDP Act / IT Act SPDI Rules / RBI Digital
 * Lending Guidelines).
 */
export default function Privacy() {
  const { state, set, go } = useStore();
  const [agreed, setAgreed] = useState(false);
  // The rupee logo travels here from the splash screen.
  const logoHandoff = useHandoffIn('logo');

  const onAccept = async () => {
    await savePrivacyAccepted().catch(() => {});
    set({ privacyAccepted: true });
    // Continue where the boot flow would have gone: straight to home if already
    // signed in, otherwise into language selection / onboarding.
    go(state.authUser ? 'home' : 'language');
  };

  return (
    <Screen
      scroll
      padded
      footer={
        <View style={{ gap: 8 }}>
          <ConsentRow voiceId="Accept privacy policy" checked={agreed} onChange={setAgreed}>
            <Text style={[font(600), { color: colors.text }]}>I have read and accept the Privacy Policy.</Text>
            {'\n'}I consent to SwiftLoan processing my data as described, and to sharing it with a Lending Partner only when I choose to apply.
          </ConsentRow>
          <PrimaryButton label="Accept & Continue" icon={null} disabled={!agreed} onPress={onAccept} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
        <Animated.View ref={logoHandoff.ref} onLayout={logoHandoff.onLayout} style={logoHandoff.style}>
          <LogoMark size={56} />
        </Animated.View>
      </View>
      <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, textAlign: 'center' }]}>Privacy Policy</Text>
      <Text style={[font(400), { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 4 }]}>
        Version {PRIVACY_POLICY_VERSION} · DPDP Act · RBI Digital Lending Guidelines
      </Text>

      <Text style={[font(500), { fontSize: 13.5, lineHeight: 20, color: colors.textMid, marginTop: 16 }]}>{PRIVACY_INTRO}</Text>

      <View style={{ marginTop: 8 }}>
        {PRIVACY_SECTIONS.map(s => (
          <View key={s.title} style={{ marginTop: 18 }}>
            <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{s.title}</Text>
            <Text style={[font(400), { fontSize: 13, lineHeight: 20, color: colors.textSoft, marginTop: 5 }]}>{s.body}</Text>
          </View>
        ))}
      </View>
      <View style={{ height: 8 }} />
    </Screen>
  );
}
