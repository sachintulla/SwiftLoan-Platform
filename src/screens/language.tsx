import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Screen } from '../components/Frame';
import { Wordmark } from '../components/Logo';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { useHandoffIn } from '../utils/handoff';
import { trackEvent } from '../api/client';
import { VoiceHidden } from '../voice/screenGraph';
import { registerTarget } from '../voice/actionRegistry';

const GREETINGS = [
  'Welcome to SwiftLoan',
  'SwiftLoan में आपका स्वागत है',
  'SwiftLoan కి స్వాగతం',
];

const LANGS = [
  { label: 'English', sub: 'Get a loan that fits your life', selected: 'English', lang: 'en' },
  { label: 'हिन्दी', sub: 'अपनी ज़रूरत के हिसाब से लोन पाएं', selected: 'हिन्दी', lang: 'hi' },
  { label: 'తెలుగు', sub: 'మీ అవసరాలకు తగిన లోన్ పొందండి', selected: 'తెలుగు', lang: 'te' },
];

export default function Language() {
  const { state, set, go } = useStore();
  const [gi, setGi] = React.useState(0);
  // The "SwiftLoan" wordmark travels here from the splash screen.
  const wordHandoff = useHandoffIn('wordmark');

  useEffect(() => {
    const id = setInterval(() => setGi(i => (i + 1) % 3), 2600);
    return () => clearInterval(id);
  }, []);

  const contEnabled = !!state.selectedLang;

  // Tell the voice agent which language card is picked. The cards only show a tick icon,
  // so without this the agent saw three identical buttons and asked "which language?" even
  // when the user had already chosen one before starting the call.
  useEffect(() => {
    const unregisters = LANGS.map(l =>
      registerTarget(state.screen, `chip:Language:${l.label}`, {
        kind: 'chips',
        label: l.label,
        group: 'Language',
        getValue: () => state.selectedLang === l.selected,
        onTap: () => set({ selectedLang: l.selected, lang: l.lang ?? state.lang }),
      }),
    );
    return () => unregisters.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen, state.selectedLang, state.lang]);

  return (
    <Screen bottomNav={false} scroll padded={false}>
      {/* header — no back arrow: splash auto-advances here and there's
          nothing upstream worth returning to. */}
      <View style={styles.header}>
        <Animated.View ref={wordHandoff.ref} onLayout={wordHandoff.onLayout} style={wordHandoff.style}>
          <Wordmark size={20} />
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {/* This rotates every 2.6s (setInterval above) purely as a marketing
            flourish — cycling the greeting through English/Hindi/Telugu.
            VoiceHidden keeps it out of screen_overview: a genuinely-different
            string landing every few seconds isn't caught by the "unchanged,
            don't resend" dedup (it's real new content, not a duplicate), so
            each rotation was triggering a fresh page_context send and, with
            it, a real spoken response — confirmed live as Ruby re-nudging
            "please pick a language" three times over ~18s with no user input
            between them, just this banner quietly cycling underneath. */}
        <VoiceHidden>
          <View style={{ alignItems: 'center', marginBottom: 22, minHeight: 62 }}>
            <Text style={[font(800), { fontSize: 25, letterSpacing: -0.5, textAlign: 'center', color: colors.text }]}>
              {GREETINGS[gi]}
            </Text>
            <Text style={[font(400), { fontSize: 13.5, color: '#6E8080', marginTop: 6 }]}>
              Choose your language / अपनी भाषा चुनें
            </Text>
          </View>
        </VoiceHidden>

        <View style={{ gap: 12 }}>
          {LANGS.map(l => {
            const on = state.selectedLang === l.selected;
            // VoiceHidden: the card is exposed to the agent by the "Language" options registered
            // above (which carry the selected state), so the plain button must not be listed too.
            return (
              <VoiceHidden key={l.label}>
                <Pressable
                  onPress={() => set({ selectedLang: l.selected, lang: l.lang ?? state.lang })}
                  style={[styles.langCard, on ? styles.langOn : styles.langOff]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[font(800), { fontSize: 17, color: colors.text }]}>{l.label}</Text>
                    {on ? <Icon name="check_circle" size={22} color={colors.primary} /> : null}
                  </View>
                  <Text style={[font(400), { fontSize: 12.5, color: '#7A8A8A', marginTop: 2 }]}>{l.sub}</Text>
                </Pressable>
              </VoiceHidden>
            );
          })}
        </View>

        <Text style={[font(400), { fontSize: 11, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: 18 }]}>
          By continuing, you agree to receive communications in your selected language.{' '}
          <Text style={{ color: colors.primary }}>View Policy</Text>
        </Text>

        <View style={{ height: 22 }} />
        <PrimaryButton
          label={contEnabled ? `Continue with ${state.selectedLang}` : 'Select a language'}
          disabled={!contEnabled}
          onPress={() => {
            if (!contEnabled) return;
            // WS5: the language event used to fire on arrival at this screen,
            // before anything was picked, and never carried which language.
            trackEvent('onboarding', 'language_selected', 'language', {
              language: state.lang ?? 'en',
              label: state.selectedLang,
            });
            go('intro');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  langCard: { borderRadius: 16, borderWidth: 1.5, padding: 16 },
  langOn: { backgroundColor: 'rgba(7,159,160,0.12)', borderColor: colors.primary },
  langOff: { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.85)' },
});
