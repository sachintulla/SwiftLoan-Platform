import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

type Step = {
  icon: string;
  title: string;
  desc: string;
  state: 'done' | 'active' | 'pending';
  time?: string;
  chip?: string;
  sub?: { icon: string; title: string; value: string };
};

const STEPS: Step[] = [
  { icon: 'check', title: 'Application Submitted', desc: 'Your application and initial documents were successfully received.', state: 'done', time: 'Oct 12, 2023 • 10:24 AM' },
  { icon: 'more_horiz', title: 'Under Review', desc: 'Our financial analysts are verifying your business tax returns and credit history. This usually takes 2-3 business days.', state: 'active', chip: 'In Progress', sub: { icon: 'description', title: 'KYC Documents', value: 'Verified' } },
  { icon: 'task_alt', title: 'Final Approval', desc: 'You will receive an offer letter once the internal credit review is finalized.', state: 'pending' },
  { icon: 'payments', title: 'Funds Disbursed', desc: 'Funds will be credited to your linked business account ending in ••4291.', state: 'pending' },
];

export default function Status() {
  const { go, showToast } = useStore();
  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('home')} title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[font(600), { fontSize: 12, letterSpacing: 0.3, color: colors.primary }]}>Loan Reference: SL-884021</Text>
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 4 }]}>Business Expansion Loan</Text>
        <Text style={[font(400), { fontSize: 13.5, lineHeight: 20, color: colors.textSoft, marginTop: 6 }]}>
          We're currently reviewing your application. You'll be notified of any required documents or next steps here.
        </Text>

        {/* Timeline */}
        <View style={{ marginTop: 22 }}>
          {STEPS.map((s, i) => {
            const last = i === STEPS.length - 1;
            const done = s.state === 'done';
            const active = s.state === 'active';
            const tint = done ? colors.mint : active ? colors.amber : colors.muted;
            return (
              <View key={s.title} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.node, { backgroundColor: done || active ? tint : '#EDF1F0' }]}>
                    <Icon name={s.icon} size={18} color={done || active ? '#fff' : colors.muted} />
                  </View>
                  {!last ? <View style={[styles.line, { backgroundColor: done ? colors.mint : colors.line }]} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
                  {s.chip ? (
                    <View style={styles.chip}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />
                      <Text style={[font(600), { fontSize: 10.5, color: colors.amber }]}>{s.chip}</Text>
                    </View>
                  ) : null}
                  <Text style={[font(700), { fontSize: 15, color: s.state === 'pending' ? colors.muted : colors.text, marginTop: s.chip ? 4 : 0 }]}>{s.title}</Text>
                  <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: colors.textSoft, marginTop: 2 }]}>{s.desc}</Text>
                  {s.time ? <Text style={[font(500), { fontSize: 11, color: colors.muted, marginTop: 4 }]}>{s.time}</Text> : null}
                  {s.sub ? (
                    <View style={styles.subCard}>
                      <Icon name={s.sub.icon} size={18} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[font(700), { fontSize: 13, color: colors.text }]}>{s.sub.title}</Text>
                        <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft }]}>{s.sub.value}</Text>
                      </View>
                      <Icon name="verified" size={18} color={colors.mint} />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* Loan partner */}
        <View style={styles.partner}>
          <View style={styles.avatar}>
            <Text style={[font(700), { color: '#fff', fontSize: 18 }]}>SM</Text>
            <View style={styles.onlineDot} />
          </View>
          <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 10 }]}>Sarah Mitchell</Text>
          <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft }]}>Dedicated Loan Partner</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable style={styles.partnerBtn} onPress={() => showToast('Chat — coming soon.')}>
              <Icon name="chat" size={18} color={colors.primary} />
              <Text style={[font(600), { color: colors.text, fontSize: 14 }]}>Message</Text>
            </Pressable>
            <Pressable style={styles.partnerBtn} onPress={() => showToast('Callback requested.')}>
              <Icon name="call" size={18} color={colors.primary} />
              <Text style={[font(600), { color: colors.text, fontSize: 14 }]}>Callback</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.verified}>
          <Icon name="verified_user" size={16} color={colors.mint} />
          <Text style={[font(400), { flex: 1, fontSize: 11, lineHeight: 16, color: colors.muted }]}>
            SwiftLoan Verified Partner. All communications are monitored for security and regulatory compliance.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  node: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginVertical: 4 },
  chip: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,166,36,0.14)', borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 3 },
  subCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginTop: 10 },
  partner: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 18, padding: 18, marginTop: 24 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.mint, borderWidth: 2, borderColor: '#fff' },
  partnerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#fff' },
  verified: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14 },
});
