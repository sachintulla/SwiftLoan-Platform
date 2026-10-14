import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Share, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api } from '../api/client';

interface Friend { id: string; name: string; status: 'signed_up' | 'applied' | 'disbursed'; createdAt: string }
interface Summary {
  code: string;
  shareUrl: string;
  stats: { invited: number; applied: number; disbursed: number };
  referrals: Friend[];
}

const STATUS_KEY = { signed_up: 'refStatusSignedUp', applied: 'refStatusApplied', disbursed: 'refStatusDisbursed' } as const;
const STATUS_COLOR = { signed_up: colors.textSoft, applied: colors.primary, disbursed: colors.mint } as const;

/**
 * Refer a friend — reached from Profile. Shows the user's personal code, shares the
 * /dl?ref=CODE link through the native share sheet, and lists the friends who joined
 * with how far each has got. Tracking only: no reward is promised anywhere here.
 */
export default function Referral() {
  const t = useT();
  const { back } = useStore();
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    api.referralMe()
      .then((r: any) => setData(r?.data ?? null))
      .catch(() => setErr(t.refLoadError))
      .finally(() => setLoading(false));
  }, [t.refLoadError]);

  useEffect(load, [load]);

  const share = () => {
    if (!data) return;
    Share.share({ message: `${t.refShareMsg} ${data.shareUrl}` }).catch(() => undefined);
  };

  return (
    <Screen scroll bottomNav padded>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={10} style={styles.back} accessibilityLabel="Back">
          <Icon name="arrow_back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[font(800), styles.title]}>{t.refTitle}</Text>
          <Text style={[font(400), styles.sub]}>{t.refSub}</Text>
        </View>
      </View>

      {loading ? (
        <Loading />
      ) : err || !data ? (
        <ErrorState message={err || t.refLoadError} onRetry={load} />
      ) : (
        <>
          <View style={styles.codeCard}>
            <Text style={[font(600), { fontSize: 12, color: 'rgba(255,255,255,0.8)' }]}>{t.refYourCode}</Text>
            <Text style={[font(800), styles.code]} selectable>{data.code}</Text>
            <PrimaryButton label={t.refShare} icon="share" onPress={share} solid style={{ marginTop: 14 }} />
          </View>

          <View style={styles.stats}>
            {([['refInvited', data.stats.invited], ['refApplied', data.stats.applied], ['refDisbursed', data.stats.disbursed]] as const).map(([k, n]) => (
              <View key={k} style={styles.stat}>
                <Text style={[font(800), { fontSize: 22, color: colors.text }]}>{n}</Text>
                <Text style={[font(500), { fontSize: 11.5, color: colors.textSoft, marginTop: 2 }]}>{(t as any)[k]}</Text>
              </View>
            ))}
          </View>

          <Text style={[font(700), { fontSize: 14, color: colors.textMid, marginTop: 20 }]}>{t.refFriends}</Text>
          {data.referrals.length === 0 ? (
            <Text style={[font(400), { fontSize: 13, color: colors.textSoft, marginTop: 8 }]}>{t.refNone}</Text>
          ) : (
            <View style={[styles.card, { padding: 6, marginTop: 8 }]}>
              {data.referrals.map((f, i) => (
                <View key={f.id} style={[styles.row, i < data.referrals.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.lineSoft }]}>
                  <Icon name="person" size={20} color={colors.textMid} />
                  <Text style={[font(600), { flex: 1, fontSize: 14, color: colors.text }]}>{f.name}</Text>
                  <Text style={[font(700), { fontSize: 12, color: STATUS_COLOR[f.status] ?? colors.textSoft }]}>{(t as any)[STATUS_KEY[f.status] ?? 'refStatusSignedUp']}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[font(400), { fontSize: 11.5, lineHeight: 16, color: colors.muted, marginTop: 16 }]}>{t.refNote}</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { fontSize: 24, letterSpacing: -0.4, color: colors.text },
  sub: { fontSize: 13, color: colors.textSoft, marginTop: 2 },
  codeCard: { backgroundColor: colors.primary, borderRadius: 20, padding: 20, alignItems: 'center' },
  code: { fontSize: 32, letterSpacing: 4, color: '#fff', marginTop: 6 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12 },
});
