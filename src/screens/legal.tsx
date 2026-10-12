import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Screen, AppHeader } from '../components/Frame';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { LEGAL_DOCS, PRIVACY_POLICY_URL, type LegalDocKey } from '../content/legal';

/**
 * In-app viewer for the legal documents reachable from Profile (and Help):
 * Privacy Policy, Terms of Service, Lending Disclosures, and Grievance &
 * Consent Withdrawal. Which document is shown is held in `state.legalDoc`
 * (set by the caller before go('legal')). These must be real, reachable
 * destinations for App Store / Play Store review — not "coming soon" toasts.
 *
 * The Privacy Policy loads the HOSTED webpage (swiftloan.ai/privacy-policy) in a
 * WebView so the app and website never drift; if it can't load (offline or not
 * yet reachable) it falls back to the built-in copy so the policy is always
 * viewable. The other docs render their built-in content directly.
 */
export default function Legal() {
  const { state } = useStore();
  const key: LegalDocKey = (state.legalDoc as LegalDocKey) || 'privacy';
  const doc = LEGAL_DOCS[key] ?? LEGAL_DOCS.privacy;

  const [webFailed, setWebFailed] = useState(false);
  const [webLoading, setWebLoading] = useState(true);

  // Privacy Policy → the hosted page (unless it failed, then fall through to the
  // built-in copy below).
  if (key === 'privacy' && !webFailed) {
    return (
      <Screen scroll={false} padded={false}>
        <View style={{ paddingHorizontal: 20 }}>
          <AppHeader title={doc.title} />
        </View>
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: PRIVACY_POLICY_URL }}
            onError={() => setWebFailed(true)}
            onHttpError={() => setWebFailed(true)}
            onLoadEnd={() => setWebLoading(false)}
            startInLoadingState
            renderLoading={() => (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            style={{ flex: 1, backgroundColor: 'transparent' }}
          />
          {webLoading ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      </Screen>
    );
  }

  // Built-in content (Terms / Lending / Grievance, and Privacy offline fallback).
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
