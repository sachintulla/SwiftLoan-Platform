import React, { useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable, Linking } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Screen, AppHeader } from '../components/Frame';
import { Icon } from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api } from '../api/client';

// URL fragments that a lender's page uses to signal the flow ended badly —
// the user cancelled, was declined, or hit an error page. Matched against the
// navigated URL so we can mark the application failed even when the webhook
// never tells us (many lender web flows only redirect, they don't call back).
const FAIL_URL = /(fail|failure|error|cancel|declin|reject|abort|timeout|expired)/i;

/**
 * In-app browser for a lender's application page. Opened when a user applies to
 * an offer that carries a redirection URL (e.g. Aurix's OfferRedirectionUrl).
 *
 * We parse the web flow's activity — load errors, HTTP errors, a crashed web
 * content process, and failure/cancel redirect URLs — and, on any of those,
 * mark THAT lender's per-lender application as failed (POST …/offers/:id/fail),
 * since the KFT webhook doesn't report these client-side dead-ends. Returning
 * lands the user on My Loans, where the lender now shows "Failed".
 */
export default function LenderWeb() {
  const { state, mergeApiContext, go } = useStore();
  const url = state.webUrl;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  // Report at most once per visit — several webview callbacks can fire for one
  // failure (onError + onHttpError, etc.).
  const reportedRef = useRef(false);

  const toLoans = () => go('loans');

  // KFT / lender pages signal "flow finished, take the user back to the app" via
  // window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NAVIGATE' })).
  // We land on My Loans (the natural home for a submitted application); the
  // status then updates via the lender webhook + My Loans' background poll.
  const handleMessage = (event: WebViewMessageEvent) => {
    let message: any;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      // Many web SDKs post non-JSON noise on the same channel — ignore it.
      return;
    }
    switch (message?.type) {
      case 'NAVIGATE':
        go('loans');
        break;
      default:
        // Any other control message also returns to the native app.
        go('loans');
        break;
    }
  };

  const markFailed = (reason: string) => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    setFailed(reason);
    // Fire-and-forget: record the failure against this lender's application.
    if (state.applicationId && state.selectedOfferId) {
      api.failApplication(state.applicationId, state.selectedOfferId, reason)
        .then((res: any) => mergeApiContext({ offerFailResult: res }))
        .catch(() => {});
    }
  };

  return (
    <Screen variant="plain" scroll={false}>
      <AppHeader
        onBack={toLoans}
        title={state.webTitle || 'Complete your application'}
        right={
          url && !failed ? (
            <Pressable hitSlop={10} onPress={() => Linking.openURL(url).catch(() => {})}>
              <Icon name="open_in_new" size={22} color={colors.text} />
            </Pressable>
          ) : undefined
        }
      />
      <View style={styles.body}>
        {failed ? (
          <View style={styles.loader}>
            <Icon name="error" size={40} color={colors.red} />
            <Text style={[font(700), { fontSize: 16, color: colors.text, marginTop: 12, textAlign: 'center' }]}>
              Application couldn’t be completed
            </Text>
            <Text style={[font(400), { fontSize: 13, color: colors.textMid, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }]}>
              We couldn’t complete this application on the lender’s page. It’s been marked as failed in My Loans — you can try another lender.
            </Text>
            <Pressable style={styles.backBtn} onPress={toLoans}>
              <Text style={[font(700), { color: '#fff' }]}>Go to My Loans</Text>
            </Pressable>
          </View>
        ) : url ? (
          <>
            <WebView
              source={{ uri: url }}
              // Navigation back from the KFT / lender page into native screens.
              onMessage={handleMessage}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              startInLoadingState
              style={styles.web}
              // Hard load failure (DNS, TLS, no route, connection reset).
              onError={(e) => markFailed(`Web flow load error: ${e.nativeEvent.description || 'unknown'}`)}
              // Main-document HTTP error (lender's server returned 4xx/5xx).
              onHttpError={(e) => {
                const { statusCode, url: u } = e.nativeEvent;
                if (statusCode >= 400 && (!u || u === url)) markFailed(`Lender page returned HTTP ${statusCode}`);
              }}
              // Web content process died (Android/iOS).
              onRenderProcessGone={() => markFailed('The lender page crashed (render process gone)')}
              onContentProcessDidTerminate={() => markFailed('The lender page stopped responding')}
              // Parse redirects — a failure/cancel URL means the flow dead-ended.
              onNavigationStateChange={(nav) => {
                if (nav.url && FAIL_URL.test(nav.url)) markFailed(`Lender flow ended at: ${nav.url.slice(0, 120)}`);
              }}
            />
            {loading && (
              <View style={styles.loader} pointerEvents="none">
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[font(500), { color: colors.textMid, marginTop: 12 }]}>
                  Loading lender page…
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.loader}>
            <Text style={[font(600), { color: colors.textMid }]}>No lender page to open.</Text>
            <Pressable style={styles.backBtn} onPress={toLoans}>
              <Text style={[font(700), { color: '#fff' }]}>Go to My Loans</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  web: { flex: 1, backgroundColor: '#fff' },
  loader: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
});
