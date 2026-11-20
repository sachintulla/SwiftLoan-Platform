import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Screen, AppHeader, RUBY_CLEARANCE } from '../components/Frame';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const SHRINK_TEXT_JS = `(function(){var s=document.createElement('style');s.innerHTML='html{font-size:87.5% !important;-webkit-text-size-adjust:87.5% !important;text-size-adjust:87.5% !important}';document.head.appendChild(s);})();true;`;

/**
 * The website page is shown INSIDE the app here, so two things of the website's must not appear:
 *  - its ads-measurement consent banner ("Help us measure our ads"). It is pinned to the bottom of
 *    the page, where the app's floating Ruby covered its "Allow" button, and the app is not the
 *    place to ask for website ad consent anyway. Answered "denied" before the page starts (the
 *    privacy-preserving answer: the website's Pixel simply stays off in this WebView);
 *  - the website's own floating assistant button, which would sit under the app's Ruby.
 * A page drawn in a WebView cannot be layered against app views, so hiding is the only fix.
 * The user-agent marker lets the website do the same on its side.
 */
const IN_APP_USER_AGENT = 'SwiftLoanApp';
const IN_APP_PAGE_JS = `(function(){try{if(!localStorage.getItem('sl_meta_consent'))localStorage.setItem('sl_meta_consent','denied');}catch(e){}try{var s=document.createElement('style');s.innerHTML='.sl-fab-anchor,#sl-voice-error{display:none !important}';(document.head||document.documentElement).appendChild(s);}catch(e){}})();true;`;

export default function Legal() {
  const { state } = useStore();
  const key: LegalDocKey = (state.legalDoc as LegalDocKey) || 'privacy';
  const doc = LEGAL_DOCS[key] ?? LEGAL_DOCS.privacy;

  const insets = useSafeAreaInsets();
  const [webFailed, setWebFailed] = useState(false);
  const [webLoading, setWebLoading] = useState(true);

  // Privacy Policy → the hosted page (unless it failed, then fall through to the
  // built-in copy below).
  if (key === 'privacy' && !webFailed) {
    return (
      <Screen scroll={false} padded={false} contentStyle={{ paddingBottom: RUBY_CLEARANCE + insets.bottom }}>
        <View style={{ paddingHorizontal: 20 }}>
          <AppHeader title={doc.title} />
        </View>
        <View style={{ flex: 1 }}>
          <WebView
            // `?embed=app` tells the website it is shown inside the app: no consent banner, no ad pixel,
            // no second Ruby (website-next/src/lib/embed.ts). Harmless on a website that predates it.
            source={{ uri: `${PRIVACY_POLICY_URL}?embed=app` }}
            // The website's type is sized for a desktop page; scale it down to
            // read like the rest of the app on a phone.
            injectedJavaScript={SHRINK_TEXT_JS}
            injectedJavaScriptBeforeContentLoaded={IN_APP_PAGE_JS}
            applicationNameForUserAgent={IN_APP_USER_AGENT}
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

      <Text style={[font(500), { fontSize: 12.5, lineHeight: 18, color: colors.textMid, marginTop: 14 }]}>{doc.intro}</Text>

      <View style={{ marginTop: 8 }}>
        {doc.sections.map(s => (
          <View key={s.title} style={{ marginTop: 14 }}>
            <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>{s.title}</Text>
            <Text style={[font(400), { fontSize: 12, lineHeight: 18, color: colors.textSoft, marginTop: 4 }]}>{s.body}</Text>
          </View>
        ))}
      </View>
      <View style={{ height: 24 }} />
    </Screen>
  );
}
