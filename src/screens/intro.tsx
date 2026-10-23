import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { useDrive } from '../utils/useDrive';

const FEATURES = [
  { icon: 'bolt', tile: '#E1F3F3', tint: '#079FA0', titleKey: 'introFeat1Title', descKey: 'introFeat1Desc' },
  { icon: 'handshake', tile: '#E3F6EE', tint: '#2FB183', titleKey: 'introFeat2Title', descKey: 'introFeat2Desc' },
  { icon: 'lock', tile: '#E1F3F3', tint: '#079FA0', titleKey: 'introFeat3Title', descKey: 'introFeat3Desc' },
];

export default function Intro() {
  const { go } = useStore();
  const t = useT();
  const drive = useDrive(1000);
  const partners = Math.round(15 * drive);

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }} padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('language')} title={<View />} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 4 }}>
        <View style={styles.badge}>
          <Icon name="verified_user" size={15} color={colors.primary} />
          <Text style={[font(700), { fontSize: 11.5, color: '#0B6E6F' }]}>{t.introBadge}</Text>
        </View>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.6, lineHeight: 30, color: colors.text }]}>
          {t.introTitle}
        </Text>
        <Text style={[font(400), { fontSize: 14, lineHeight: 21, color: '#6E8080', marginTop: 6, marginBottom: 14 }]}>
          {t.introDesc}
        </Text>

        <View>
          {FEATURES.map((f, i) => (
            <View
              key={f.titleKey}
              style={[styles.feat, i < FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(120,150,148,0.16)' }]}
            >
              <View style={[styles.tile, { backgroundColor: f.tile }]}>
                <Icon name={f.icon} size={22} color={f.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[font(800), { fontSize: 15, color: colors.text, letterSpacing: -0.15 }]}>{t[f.titleKey]}</Text>
                <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: '#6E8080', marginTop: 2 }]}>{t[f.descKey]}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 'auto', paddingTop: 18 }}>
          <View style={styles.statCard}>
            {[
              { v: `${partners}+`, l: t.introStat1 },
              { v: '2 min', l: t.introStat2 },
              { v: '0', l: t.introStat3 },
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
          <PrimaryButton label={t.getStarted} onPress={() => go('mobile')} />
          <Text style={[font(400), { fontSize: 10.5, lineHeight: 15, color: colors.muted, textAlign: 'center', marginTop: 14 }]}>
            {t.introFooter}
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
