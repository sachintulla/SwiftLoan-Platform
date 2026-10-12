import React from 'react';
import { View, Text } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { LEGAL_DOCS, type LegalDocKey } from '../content/legal';

/**
 * In-app viewer for the legal documents reachable from Profile (and Help):
 * Privacy Policy, Terms of Service, Lending Disclosures, and Grievance &
 * Consent Withdrawal. Which document is shown is held in `state.legalDoc`
 * (set by the caller before go('legal')). These must be real, reachable
 * destinations for App Store / Play Store review — not "coming soon" toasts.
 */
export default function Legal() {
  const { state } = useStore();
  const key: LegalDocKey = (state.legalDoc as LegalDocKey) || 'privacy';
  const doc = LEGAL_DOCS[key] ?? LEGAL_DOCS.privacy;

  return (
    <Screen scroll padded>
      <AppHeader title={doc.title} />
      <Text style={[font(400), { fontSize: 12, color: colors.muted, marginTop: 2 }]}>{doc.subtitle}</Text>

      <Text style={[font(500), { fontSize: 13.5, lineHeight: 20, color: colors.textMid, marginTop: 16 }]}>{doc.intro}</Text>

      <View style={{ marginTop: 8 }}>
        {doc.sections.map(s => (
          <View key={s.title} style={{ marginTop: 18 }}>
            <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{s.title}</Text>
            <Text style={[font(400), { fontSize: 13, lineHeight: 20, color: colors.textSoft, marginTop: 5 }]}>{s.body}</Text>
          </View>
        ))}
      </View>
      <View style={{ height: 24 }} />
    </Screen>
  );
}
