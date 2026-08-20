import React, { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Screen, AppHeader } from '../components/Frame';
import { Icon } from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

/**
 * In-app browser for a lender's application page. When a user taps "Continue" on
 * an offer that carries a redirection URL (e.g. Aurix's OfferRedirectionUrl),
 * we open it here inside the app rather than kicking out to Safari, so the user
 * stays in the SwiftLoan shell and can back out to their offers.
 */
export default function LenderWeb() {
  const { state, go } = useStore();
  const url = state.webUrl;
  const [loading, setLoading] = useState(true);
  // After the lender web flow, land on My Loans so the user sees the
  // application they just submitted (and can track its status), rather than
  // going back to the offers list.
  const toLoans = () => go('loans');

  return (
    <Screen variant="plain" scroll={false}>
      <AppHeader
        onBack={toLoans}
        title={state.webTitle || 'Complete your application'}
        right={
          url ? (
            <Pressable hitSlop={10} onPress={() => Linking.openURL(url).catch(() => {})}>
              <Icon name="open_in_new" size={22} color={colors.text} />
            </Pressable>
          ) : undefined
        }
      />
      <View style={styles.body}>
        {url ? (
          <>
            <WebView
              source={{ uri: url }}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              startInLoadingState
              style={styles.web}
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
