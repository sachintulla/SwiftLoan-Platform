import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import Icon from './Icon';
import { LogoMark } from './Logo';
import { PrimaryButton } from './Controls';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api } from '../api/client';
import AltOfferWebView from './AltOfferWebView';

/**
 * The "Yubi" tab inside My Offers: hosts the Yubi Markets (YMPL) alternative-
 * offers journey inline. On mount it mints a fresh redirect URL + prefill
 * bundle (POST /applications/:id/alt-offer) and renders the journey in an
 * embedded WebView. When the applicant taps Proceed on YMPL's offers page, it
 * records the application (→ My Loans). Needs an applicationId (an eligibility
 * run) to refer; without one it prompts the user to apply first.
 */
export default function YubiOffersTab({ onApply }: { onApply: () => void }) {
  const { state, showToast } = useStore();
  const t = useT();
  const appId = state.applicationId;
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [url, setUrl] = useState('');
  const [prefill, setPrefill] = useState<Record<string, string | number | null>>({});
  const [resumeToOffers, setResumeToOffers] = useState(false);

  const load = useCallback(async () => {
    if (!appId) { setPhase('error'); return; }
    setPhase('loading');
    try {
      const r = await api.altOfferRedirect(appId);
      const alt = r?.altOffer;
      if (alt?.available && alt.redirectUrl) {
        setUrl(alt.redirectUrl);
        setPrefill(alt.prefill || (alt.pan ? { pan: alt.pan } : {}));
        setResumeToOffers(!!alt.resumeToOffers);
        setPhase('ready');
      } else {
        setPhase('error');
      }
    } catch {
      setPhase('error');
    }
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  const onProceed = () => {
    if (!appId) return;
    // Don't pass the button's own text ("proceed") as the lender — we don't
    // reliably know which lender they picked, so the card shows "Yubi Markets".
    // Idempotent: only toast the first time (the partner resume re-emits Proceed).
    api.altOfferApplied(appId).then(r => { if (!r.alreadyApplied) showToast(t.altAddedToLoans); }).catch(() => {});
  };

  // No eligibility run yet → nothing to refer. Prompt to apply.
  if (!appId) {
    return (
      <View style={styles.center}>
        <View style={styles.iconWrap}><Icon name="storefront" size={34} color={colors.primary} /></View>
        <Text style={[font(800), styles.title]}>{t.altOffersTileTitle}</Text>
        <Text style={[font(400), styles.sub]}>{t.yubiTabApplyFirst}</Text>
        <View style={{ width: '100%', marginTop: 20 }}>
          <PrimaryButton label={t.applyForLoan} icon="arrow_forward" onPress={onApply} />
        </View>
      </View>
    );
  }

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <LogoMark size={56} />
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
        <Text style={[font(600), { color: colors.textMid, marginTop: 12, fontSize: 13.5 }]}>{t.altOffersLoading}</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Icon name="public_off" size={38} color={colors.red} />
        <Text style={[font(700), styles.title]}>{t.altOffersErrorTitle}</Text>
        <Text style={[font(400), styles.sub]}>{t.altOffersErrorBody}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Icon name="refresh" size={18} color="#fff" />
          <Text style={[font(700), { color: '#fff' }]}>{t.retryLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return <AltOfferWebView url={url} prefill={prefill} onProceed={onProceed} onBack={load} waitForOffers={resumeToOffers} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 6 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 18, color: colors.text, marginTop: 8, textAlign: 'center' },
  sub: { fontSize: 13.5, color: colors.textSoft, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
});
