import React, { useCallback, useRef, useState } from 'react';
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
// A lender page reaching one of these URLs is a positive terminal — the
// application went through. Reported to the agent as a 'completed' flow so it
// can congratulate the user instead of nudging them to keep going.
const SUCCESS_URL = /(success|approved|complete|thank|congrat|disburs|submitted)/i;

/**
 * Injected into the lender page so the app can read what the page is actually
 * showing — its title, a short text snapshot, and any in-page script error.
 * This is what lets the Ello voice agent describe the live web flow ("the
 * lender is asking for your bank details", "the page hit an error") instead of
 * only knowing the load succeeded. Posts structured messages on the standard
 * ReactNativeWebView channel; handleMessage routes them into lenderWebFlow.
 */
const INJECTED_BRIDGE = `
(function () {
  try {
    var post = function (o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} };
    var snapshot = function (reason) {
      var body = (document.body && document.body.innerText) || '';
      post({ type: 'FLOW_SNAPSHOT', reason: reason, title: document.title || '', url: location.href, text: body.replace(/\\s+/g, ' ').trim().slice(0, 600) });
    };
    window.addEventListener('error', function (e) {
      post({ type: 'FLOW_ERROR', message: (e && e.message) || 'script error', url: location.href });
    }, true);
    if (document.readyState === 'complete') snapshot('ready');
    else window.addEventListener('load', function () { snapshot('load'); });
  } catch (e) {}
  true;
})();
`;

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
  const lender = state.webTitle || 'the lender';

  // Live status of the lender web flow, mirrored into apiContext so the Ello
  // voice agent can speak about what's happening ("the page is loading", "it
  // hit an error", "you're back — the application went through"). Every webview
  // event funnels through here. De-duped on status+reason so we don't re-send
  // the page_context to the agent for no-op repeats.
  const lastFlowRef = useRef<string>('');
  // Narrate the FIRST load ("opening the lender's page") but stay quiet on the
  // subsequent step-to-step loads inside the flow — those refresh context
  // silently. Success/failure always narrate regardless.
  const narratedFirstLoadRef = useRef(false);
  // `narrate: true` marks a transition the agent should SPEAK about the moment it
  // arrives (loading → success/failed), not just quietly absorb — a whitelisted
  // proactive moment per the prompt. Terminal + first-load transitions narrate;
  // intermediate snapshots and repeats stay silent so the agent isn't chatty.
  const pushFlow = useCallback((status: string, narrate: boolean, extra?: Record<string, unknown>) => {
    const sig = status + '|' + (extra?.reason ?? '') + '|' + (extra?.url ?? '');
    if (lastFlowRef.current === sig) return;
    lastFlowRef.current = sig;
    mergeApiContext({
      lenderWebFlow: {
        status,           // loading | loaded | page_error | http_error | crashed | failed | completed
        lender,
        narrate,
        // A monotonically-changing marker so the agent can tell a genuinely new
        // transition from a re-sent context (it should narrate each new one once).
        seq: sig,
        ...extra,
      },
    });
  }, [mergeApiContext, lender]);

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
      // The injected bridge reporting what the lender page is showing — this is
      // the detail the agent speaks from. Not a terminal event; just context.
      case 'FLOW_SNAPSHOT':
        // Context only — a fresh look at what the page shows, not a spoken beat.
        pushFlow(failed ? 'failed' : 'loaded', false, {
          pageTitle: message.title || undefined,
          pageSnippet: message.text || undefined,
          url: message.url || undefined,
        });
        return;
      case 'FLOW_ERROR':
        // A script error inside the page isn't necessarily fatal to the flow —
        // surface it as context, but don't mark the application failed or speak.
        pushFlow('page_error', false, { reason: message.message || 'page script error', url: message.url || undefined });
        return;
      case 'NAVIGATE':
        pushFlow('completed', true, { reason: 'lender returned control to the app' });
        go('loans');
        break;
      default:
        // Any other control message also returns to the native app.
        pushFlow('completed', true, { reason: 'lender flow finished' });
        go('loans');
        break;
    }
  };

  // Fire-and-forget: record the app-side outcome (internalStatus) for this
  // lender application. success | failed | error — shown as its own state in My
  // Loans, independent of the webhook-driven lender status.
  const reportOutcome = (outcome: 'success' | 'failed' | 'error', reason?: string) => {
    if (state.applicationId && state.selectedOfferId) {
      api.reportLenderOutcome(state.applicationId, state.selectedOfferId, outcome, reason, state.selectedLenderApplicationId)
        .then((res: any) => mergeApiContext({ offerOutcomeResult: res }))
        .catch(() => {});
    }
  };

  // A terminal bad end to the web flow. `kind` splits a plain dead-end
  // ('failed' — user cancelled/declined/fail redirect) from a technical problem
  // ('error' — crash, HTTP error, load failure), mirrored into internalStatus.
  const markFailed = (reason: string, kind: 'failed' | 'error' = 'failed') => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    setFailed(reason);
    pushFlow(kind === 'error' ? 'error' : 'failed', true, { reason });
    reportOutcome(kind, reason);
  };

  // The web flow completed successfully (reached a success page). Records
  // internalStatus='success'; the lender status still advances via the webhook.
  const markSuccess = (reason: string) => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    pushFlow('completed', true, { reason });
    reportOutcome('success', reason);
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
              // Inject the page-reader bridge on every document so the agent gets
              // a fresh snapshot (title + visible text) as the user moves through
              // the lender's steps.
              injectedJavaScript={INJECTED_BRIDGE}
              onLoadStart={() => {
                setLoading(true);
                if (!failed) {
                  const first = !narratedFirstLoadRef.current;
                  narratedFirstLoadRef.current = true;
                  pushFlow('loading', first, { url });
                }
              }}
              onLoadEnd={() => { setLoading(false); if (!failed) pushFlow('loaded', false, { url }); }}
              startInLoadingState
              style={styles.web}
              // Hard load failure (DNS, TLS, no route, connection reset).
              onError={(e) => markFailed(`Web flow load error: ${e.nativeEvent.description || 'unknown'}`, 'error')}
              // Main-document HTTP error (lender's server returned 4xx/5xx).
              onHttpError={(e) => {
                const { statusCode, url: u } = e.nativeEvent;
                if (statusCode >= 400 && (!u || u === url)) markFailed(`Lender page returned HTTP ${statusCode}`, 'error');
              }}
              // Web content process died (Android/iOS).
              onRenderProcessGone={() => markFailed('The lender page crashed (render process gone)', 'error')}
              onContentProcessDidTerminate={() => markFailed('The lender page stopped responding', 'error')}
              // Parse redirects — a success URL is a positive terminal, a
              // failure/cancel URL means the flow dead-ended.
              onNavigationStateChange={(nav) => {
                if (!nav.url) return;
                if (FAIL_URL.test(nav.url)) markFailed(`Lender flow ended at: ${nav.url.slice(0, 120)}`, 'failed');
                else if (SUCCESS_URL.test(nav.url)) markSuccess(`reached a success page: ${nav.url.slice(0, 120)}`);
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
