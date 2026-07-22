import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';

const TOPICS = [
  { icon: 'payments', key: 'catRepay', sub: 'catRepaySub' },
  { icon: 'description', key: 'catDocs', sub: 'catDocsSub' },
  { icon: 'shield_person', key: 'catPrivacy', sub: 'catPrivacySub' },
  { icon: 'account_balance_wallet', key: 'catDisburse', sub: 'catDisburseSub' },
];

export default function Help() {
  const t = useT();
  const { showToast } = useStore();
  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8 }}>
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text }]}>{t.helpTitle}</Text>
        <View style={styles.search}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput style={[styles.searchInput, font(500)]} placeholder={t.searchPlaceholder} placeholderTextColor={colors.muted} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Text style={[font(600), { fontSize: 12, color: colors.textSoft, alignSelf: 'center' }]}>{t.popular}</Text>
          {[t.popRepay, t.popPrivacy, t.popFees].map(p => (
            <Pressable key={p} onPress={() => showToast(t.tSoon)} style={styles.pop}>
              <Text style={[font(600), { fontSize: 12, color: colors.primary }]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* AI assistant */}
      <View style={styles.aiCard}>
        <View style={styles.aiBadge}>
          <Icon name="bolt" size={13} color="#fff" />
          <Text style={[font(700), { fontSize: 10, color: '#fff', letterSpacing: 0.3 }]}>{t.aiBadge}</Text>
        </View>
        <Text style={[font(800), { fontSize: 20, color: '#fff', marginTop: 10 }]}>{t.aiTitle}</Text>
        <Text style={[font(400), { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)', marginTop: 6 }]}>{t.aiDesc}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Pressable style={styles.chatBtn} onPress={() => showToast(t.tChat)}>
            <Text style={[font(700), { fontSize: 14, color: colors.primary }]}>{t.startChat}</Text>
            <Icon name="arrow_forward" size={16} color={colors.primary} />
          </Pressable>
          <Pressable style={styles.ticketBtn} onPress={() => showToast(t.tTickets)}>
            <Text style={[font(600), { fontSize: 14, color: '#fff' }]}>{t.pastTickets}</Text>
          </Pressable>
        </View>
      </View>

      {/* Grievance */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.gavelIcon}><Icon name="gavel" size={20} color={colors.primary} /></View>
          <Text style={[font(800), { fontSize: 16, color: colors.text }]}>{t.grievanceTitle}</Text>
        </View>
        <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: colors.textSoft, marginTop: 10 }]}>{t.grievanceDesc}</Text>
        <View style={styles.turnaround}>
          <Text style={[font(500), { fontSize: 12, color: colors.textSoft }]}>{t.turnaround}</Text>
          <Text style={[font(700), { fontSize: 12.5, color: colors.text }]}>{t.turnaroundVal}</Text>
        </View>
        <Pressable style={styles.grievanceBtn} onPress={() => showToast(t.tGrievance)}>
          <Text style={[font(700), { fontSize: 14, color: colors.primary }]}>{t.fileGrievance}</Text>
        </Pressable>
      </View>

      {/* Browse topics */}
      <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 24, marginBottom: 12 }]}>{t.browseTopics}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {TOPICS.map(tp => (
          <Pressable key={tp.key} onPress={() => showToast(t.tSoon)} style={styles.topic}>
            <View style={styles.topicIcon}><Icon name={tp.icon} size={20} color={colors.primary} /></View>
            <Text style={[font(700), { fontSize: 14, color: colors.text, marginTop: 8 }]}>{(t as any)[tp.key]}</Text>
            <Text style={[font(400), { fontSize: 11, color: colors.textSoft, marginTop: 1 }]}>{(t as any)[tp.sub]}</Text>
          </Pressable>
        ))}
      </View>

      {/* Compliance & rights */}
      <View style={styles.card}>
        <Text style={[font(800), { fontSize: 16, color: colors.text }]}>{t.complianceTitle}</Text>
        <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: colors.textSoft, marginTop: 6 }]}>{t.complianceDesc}</Text>
        <View style={{ gap: 12, marginTop: 12 }}>
          <RightRow icon="verified_user" title={t.rightErasure} sub={t.rightErasureSub} />
          <RightRow icon="visibility" title={t.rightTransparency} sub={t.rightTransparencySub} />
        </View>
        <View style={styles.rbi}>
          <Icon name="account_balance" size={16} color={colors.primary} />
          <Text style={[font(700), { fontSize: 12, color: colors.text }]}>{t.rbiBadge}</Text>
        </View>
      </View>

      {/* Contact */}
      <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 24, marginBottom: 12 }]}>{t.contactTitle}</Text>
      <View style={{ gap: 10 }}>
        <ContactRow icon="call" title={t.callUs} value={t.callVal} onPress={() => showToast(t.tSoon)} />
        <ContactRow icon="mail" title={t.emailUs} value={t.emailVal} onPress={() => showToast(t.tSoon)} />
        <ContactRow icon="location_on" title={t.headOffice} value={t.officeVal} onPress={() => showToast(t.tSoon)} />
      </View>
    </Screen>
  );
}

function RightRow({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <Icon name={icon} size={20} color={colors.mint} />
      <View style={{ flex: 1 }}>
        <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>{title}</Text>
        <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft }]}>{sub}</Text>
      </View>
    </View>
  );
}
function ContactRow({ icon, title, value, onPress }: { icon: string; title: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.contact}>
      <View style={styles.contactIcon}><Icon name={icon} size={20} color={colors.primary} /></View>
      <View>
        <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>{title}</Text>
        <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>{value}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, marginTop: 16 },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 14 },
  pop: { backgroundColor: 'rgba(7,159,160,0.1)', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
  aiCard: { backgroundColor: colors.ink, borderRadius: 22, padding: 20, marginTop: 20, overflow: 'hidden' },
  aiBadge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, backgroundColor: colors.mint, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 18, height: 44, justifyContent: 'center' },
  ticketBtn: { justifyContent: 'center', borderRadius: 12, paddingHorizontal: 18, height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  card: { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 20, padding: 16, marginTop: 16 },
  gavelIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  turnaround: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceSoft, borderRadius: 12, padding: 12, marginTop: 12 },
  grievanceBtn: { height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  topic: { width: '47.5%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 14 },
  topicIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  rbi: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(7,159,160,0.08)', borderRadius: 12, padding: 12, marginTop: 14 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: 14 },
  contactIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
});
