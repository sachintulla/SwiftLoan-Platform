import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import { Wordmark } from '../components/Logo';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

const GREETINGS = [
  'Welcome to SwiftLoan',
  'SwiftLoan में आपका स्वागत है',
  'SwiftLoan కి స్వాగతం',
  'SwiftLoan mein swagat hai',
  'SwiftLoan ki swagatham',
];

const LANGS = [
  { label: 'English', sub: 'Get a loan that fits your life', selected: 'English', lang: 'en' },
  { label: 'हिन्दी', sub: 'अपनी ज़रूरत के हिसाब से लोन पाएं', selected: 'हिन्दी', lang: 'hi' },
  { label: 'తెలుగు', sub: 'మీ అవసరాలకు తగిన లోన్ పొందండి', selected: 'తెలుగు', lang: null },
  { label: 'Hinglish', sub: 'Apni zaroorat ke hisaab se loan paayen', selected: 'Hinglish', lang: null },
  { label: 'Tenglish', sub: 'Mee avasaraaniki taggattu loan pondandi', selected: 'Tenglish', lang: null },
];

export default function Language() {
  const { state, set, go } = useStore();
  const [gi, setGi] = React.useState(0);

  useEffect(() => {
    const id = setInterval(() => setGi(i => (i + 1) % 5), 2600);
    return () => clearInterval(id);
  }, []);

  const contEnabled = !!state.selectedLang;

  return (
    <Screen bottomNav={false} scroll padded={false}>
      {/* header */}
      <View style={styles.header}>
        <Pressable onPress={() => go('splash')} style={styles.backCircle} hitSlop={8}>
          <Icon name="arrow_back" size={22} color={colors.text} />
        </Pressable>
        <Wordmark size={20} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'center', marginBottom: 22, minHeight: 62 }}>
          <Text style={[font(800), { fontSize: 25, letterSpacing: -0.5, textAlign: 'center', color: colors.text }]}>
            {GREETINGS[gi]}
          </Text>
          <Text style={[font(400), { fontSize: 13.5, color: '#6E8080', marginTop: 6 }]}>
            Choose your language / अपनी भाषा चुनें
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {LANGS.map(l => {
            const on = state.selectedLang === l.selected;
            return (
              <Pressable
                key={l.label}
                onPress={() => set({ selectedLang: l.selected, lang: l.lang ?? state.lang })}
                style={[styles.langCard, on ? styles.langOn : styles.langOff]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[font(800), { fontSize: 17, color: colors.text }]}>{l.label}</Text>
                  {on ? <Icon name="check_circle" size={22} color={colors.primary} /> : null}
                </View>
                <Text style={[font(400), { fontSize: 12.5, color: '#7A8A8A', marginTop: 2 }]}>{l.sub}</Text>
              </Pressable>
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
          onPress={() => contEnabled && go('intro')}
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
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langCard: { borderRadius: 16, borderWidth: 1.5, padding: 16 },
  langOn: { backgroundColor: 'rgba(7,159,160,0.12)', borderColor: colors.primary },
  langOff: { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.85)' },
});
