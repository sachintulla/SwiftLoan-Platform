import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { useDrive } from '../utils/useDrive';

const FEATURES = [
  { icon: 'bolt', tile: '#E1F3F3', tint: '#079FA0', title: 'Check eligibility in minutes', desc: "A few questions and you'll see where you stand — no branch visits." },
  { icon: 'handshake', tile: '#E3F6EE', tint: '#2FB183', title: 'Compare partner offers', desc: 'Transparent offers from regulated partners, ranked by what costs you least.' },
  { icon: 'lock', tile: '#E1F3F3', tint: '#079FA0', title: 'Your data, your consent', desc: 'Nothing is shared with any partner until you explicitly approve it.' },
];

export default function Intro() {
  const { go } = useStore();
  const t = useDrive(1000);
  const partners = Math.round(15 * t);

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }} padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('language')} title={<View />} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 4 }}>
        <View style={styles.badge}>
          <Icon name="verified_user" size={15} color={colors.primary} />
          <Text style={[font(700), { fontSize: 11.5, color: '#0B6E6F' }]}>Licensed loan marketplace</Text>
        </View>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.6, lineHeight: 30, color: colors.text }]}>
          Loans made simple, in your language.
        </Text>
        <Text style={[font(400), { fontSize: 14, lineHeight: 21, color: '#6E8080', marginTop: 6, marginBottom: 14 }]}>
          Check your eligibility, compare real offers, and stay in control of your data — all in a few taps.
        </Text>

        <View>
          {FEATURES.map((f, i) => (
            <View
              key={f.title}
              style={[styles.feat, i < FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(120,150,148,0.16)' }]}
            >
              <View style={[styles.tile, { backgroundColor: f.tile }]}>
                <Icon name={f.icon} size={22} color={f.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[font(800), { fontSize: 15, color: colors.text, letterSpacing: -0.15 }]}>{f.title}</Text>
                <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: '#6E8080', marginTop: 2 }]}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 'auto', paddingTop: 18 }}>
          <View style={styles.statCard}>
            {[
              { v: `${partners}+`, l: 'Lending partners' },
              { v: '2 min', l: 'To first offer' },
              { v: '0', l: 'Score impact' },
            ].map((s, idx) => (
              <React.Fragment key={s.l}>
                {idx > 0 ? <View style={styles.statDiv} /> : null}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[font(800), { fontSize: 20, color: colors.primary }]}>{s.v}</Text>
                  <Text style={[font(500), { fontSize: 11, color: '#6E8080', marginTop: 2, textAlign: 'center' }]}>{s.l}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
          <View style={{ height: 14 }} />
          <PrimaryButton label="Get Started" onPress={() => go('mobile')} />
          <Text style={[font(400), { fontSize: 10.5, lineHeight: 15, color: colors.muted, textAlign: 'center', marginTop: 14 }]}>
            © 2026 SwiftLoan Fintech · Licensed mediator. Loans are provided by regulated lending partners; SwiftLoan is not the lender.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(7,159,160,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(7,159,160,0.18)',
    borderRadius: 9999,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 13,
    marginBottom: 14,
  },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 13 },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statDiv: { width: 1, height: 34, backgroundColor: 'rgba(120,150,148,0.2)' },
});
