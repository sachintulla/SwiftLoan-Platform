import React from 'react';
import { View, StyleSheet, Pressable, Linking } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import { Icon } from '../components/Icon';
import { colors } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api } from '../api/client';
import AltOfferWebView from '../components/AltOfferWebView';

/**
 * Pushed-screen host for the Yubi Markets (YMPL) alternative-offers journey,
 * opened from the "Alternative offers" tile. The WebView + prefill + Proceed
 * detection live in the reusable <AltOfferWebView> (also used by the My Offers
 * "Yubi" tab). When the applicant taps Proceed on YMPL's offers page, we record
 * the application (POST …/alt-offer/applied) so it appears in My Loans.
 */
export default function AltWeb() {
  const { state, back } = useStore();
  const t = useT();
  const url = state.webUrl;
  const title = state.webTitle || t.altOffersTitle;

  const onProceed = () => {
    // The Proceed button's own text isn't a lender name — record without it so
    // the My Loans card reads "Yubi Markets".
    if (state.applicationId) api.altOfferApplied(state.applicationId).catch(() => {});
  };

  return (
    <Screen variant="plain" scroll={false}>
      <AppHeader
        onBack={back}
        title={title}
        right={
          url ? (
            <Pressable hitSlop={10} onPress={() => Linking.openURL(url).catch(() => {})}>
              <Icon name="open_in_new" size={22} color={colors.text} />
            </Pressable>
          ) : undefined
        }
      />
      <View style={styles.body}>
        <AltOfferWebView url={url} prefill={state.altPrefill} onProceed={onProceed} onBack={back} waitForOffers={state.altResumeToOffers} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { flex: 1 } });
