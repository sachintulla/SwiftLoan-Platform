import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { Field, Toggle } from '../components/Controls';
import { Calendar, formatDob as formatDobParts, useDobVoiceTarget } from '../components/Calendar';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, ApiError, isAuthed, uploadAvatar } from '../api/client';
import { requestConfirmation } from '../voice/ui/confirmationBridge';

const AVATAR_MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function initials(name: string) {
  return (name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
}

function formatDob(dob: string): string {
  if (!dob) return 'Not set';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const LINKS = [
  { icon: 'help', key: 'linkFaqs', help: true },
  { icon: 'shield_person', key: 'linkPrivacy' },
  { icon: 'description', key: 'linkTerms' },
  { icon: 'account_balance', key: 'linkLending' },
  { icon: 'gavel', key: 'linkGrievance' },
  { icon: 'delete', key: 'linkDelete' },
];

export default function Profile() {
  const t = useT();
  const { state, set, go, showToast, reset } = useStore();
  const [loading, setLoading] = useState(isAuthed());
  const [err, setErr] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  // Local {y,m,d} mirror of state.pdDob (a plain ISO string) — the shared
  // Calendar picker + its voice target both work in this shape (see
  // aboutyou.tsx, which wires DOB the same way). Synced from pdDob whenever
  // edit mode opens, written back into pdDob on save.
  const [dob, setDob] = useState<{ y: number; m: number; d: number } | null>(null);
  useDobVoiceTarget(dob, setDob);
  // Seed the voice-visible `dob` from the persisted pdDob as soon as it loads,
  // not just when edit mode opens — otherwise the voice agent's "Date" target
  // reads empty even though a DOB is already on file and shown read-only above.
  useEffect(() => {
    if (dob || !state.pdDob) return;
    const d = new Date(state.pdDob);
    if (!Number.isNaN(d.getTime())) setDob({ y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() });
  }, [state.pdDob, dob]);

  // Hidden gesture: tapping the "Personal details" header 5× in a row (each tap
  // within 1.5s of the last) reveals the voice assistant FAB. See App.tsx.
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSecretTap = useCallback(() => {
    if (state.voiceFabUnlocked) return;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapCount.current += 1;
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      set({ voiceFabUnlocked: true });
      showToast('Voice assistant unlocked');
      return;
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
  }, [state.voiceFabUnlocked, set, showToast]);

  // Load the profile from the backend (when signed in) and hydrate the store.
  const load = useCallback(async () => {
    if (!isAuthed()) { setLoading(false); return; }
    setErr(null); setLoading(true);
    try {
      const { user }: any = await api.me();
      set({
        authUser: user,
        pdName: user.fullName || user.firstName || state.pdName,
        pdEmail: user.email || state.pdEmail,
        pdPhone: user.phone ? `+91 ${user.phone}` : state.pdPhone,
        pdDob: user.dob ? new Date(user.dob).toISOString().slice(0, 10) : state.pdDob,
        // Keep the locally chosen language; don't let a stale backend `lang`
        // overwrite a fresh selection when Profile loads (bug: Telugu reverted
        // to English after visiting Profile).
        lang: state.lang || user.lang,
        notif: { loan: user.notifyLoanUpdates, security: user.notifySecurityAlerts, promo: user.notifyPromoOffers },
      });
    } catch (e: any) {
      // An expired/invalid session (401) must not strand the user on an error
      // screen — the logout button lives in the profile body, which never
      // renders while `err` is set, so a stale token made "log out" unreachable.
      // Treat it as a logout: clear the dead session and return to the start.
      if (e instanceof ApiError && e.status === 401) {
        await api.logout().catch(() => {});
        reset();
        return;
      }
      setErr(e?.message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    if (!isAuthed()) { set({ pdEdit: false }); return; }
    try {
      const { user }: any = await api.updateProfile({
        fullName: state.pdName,
        email: state.pdEmail,
        ...(dob ? { dob: new Date(Date.UTC(dob.y, dob.m, dob.d)).toISOString() } : {}),
      });
      set({
        pdEdit: false,
        pdDob: user.dob ? new Date(user.dob).toISOString().slice(0, 10) : state.pdDob,
        authUser: user,
      });
      showToast(t.tSaved);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    }
  };
  // Enter edit mode, seeding the local DOB picker from whatever's already on
  // file (pdDob is a plain ISO string; the picker/voice-target need {y,m,d}).
  const startEditingProfile = () => {
    if (state.pdDob) {
      const d = new Date(state.pdDob);
      if (!Number.isNaN(d.getTime())) setDob({ y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() });
    }
    set({ pdEdit: true });
  };
  const changeLang = async (code: string) => {
    const prevLang = state.lang;
    set({ lang: code });
    if (!isAuthed()) return;
    try {
      await api.setLanguage(code);
    } catch {
      set({ lang: prevLang });
      showToast('Could not save your language. Please try again.');
    }
  };
  const changeNotif = async (patch: Partial<{ loan: boolean; security: boolean; promo: boolean }>, on: boolean) => {
    const prevNotif = state.notif;
    set({ notif: { ...state.notif, ...patch } });
    if (!isAuthed()) { showToast(on ? t.tOn : t.tOff); return; }
    const map: any = {};
    if ('loan' in patch) map.loanUpdates = patch.loan;
    if ('security' in patch) map.securityAlerts = patch.security;
    if ('promo' in patch) map.promoOffers = patch.promo;
    try {
      await api.setNotifications(map);
      showToast(on ? t.tOn : t.tOff);
    } catch {
      set({ notif: prevNotif });
      showToast('Could not save. Please try again.');
    }
  };
  // Manual tap must ask before acting — the voice agent's `logout` tool
  // already gates on the same on-screen confirmation (see the prompt's
  // "sensitive actions" rule); the manual buttons here had no equivalent, so
  // a stray tap signed people out immediately with no way to back out. Uses
  // our own branded ConfirmationSheet (via requestConfirmation), not the
  // native OS Alert, so this reads identically whether the agent or the
  // user's own tap triggered it.
  const logout = async () => {
    const allowed = await requestConfirmation(
      "Log out? You'll need to verify your mobile number again to sign back in.",
      { confirmLabel: 'Log out', cancelLabel: 'Cancel' },
    );
    if (!allowed) return;
    await api.logout().catch(() => {});
    reset();
  };

  const deleteAccount = async () => {
    if (!isAuthed()) { showToast('Please verify your mobile number first.'); return; }
    const allowed = await requestConfirmation(
      'Delete your account? This permanently removes your profile, applications, loans, and KYC records. This cannot be undone.',
      { confirmLabel: 'Delete', cancelLabel: 'Cancel' },
    );
    if (!allowed) return;
    try {
      await api.deleteAccount();
      reset();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not delete your account. Please try again.');
    }
  };

  const uploadPickedAsset = async (asset: Asset) => {
    if (!asset.uri) return;
    const ext = (asset.fileName?.split('.').pop() || asset.type?.split('/').pop() || 'jpg').toLowerCase();
    const mime = AVATAR_MIME[ext] || 'image/jpeg';
    setAvatarBusy(true);
    try {
      const user = await uploadAvatar(asset.uri, mime);
      set({ authUser: user });
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not upload photo. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      const user = await api.updateProfile({ avatarUrl: null });
      set({ authUser: user });
      showToast('Photo removed.');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not remove photo. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const pickAvatar = () => {
    if (!isAuthed()) { showToast('Please verify your mobile number first.'); return; }
    const hasPhoto = !!state.authUser?.avatarUrl;
    Alert.alert('Profile photo', undefined, [
      {
        text: hasPhoto ? 'Take New Photo' : 'Take Photo',
        onPress: () => launchCamera({ mediaType: 'photo', quality: 0.8 }, res => {
          if (res.assets?.[0]) uploadPickedAsset(res.assets[0]);
        }),
      },
      {
        text: 'Choose from Library',
        onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, res => {
          if (res.assets?.[0]) uploadPickedAsset(res.assets[0]);
        }),
      },
      // Delete option — only when a photo is actually set.
      ...(hasPhoto ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: removeAvatar }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  if (loading) {
    return (
      <Screen scroll={false} bottomNav padded>
        <Loading label="Loading your account…" />
      </Screen>
    );
  }
  if (err) {
    return (
      <Screen scroll={false} bottomNav padded>
        <ErrorState message={err} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8 }}>
        <Text style={[font(800), { fontSize: 25, letterSpacing: -0.5, color: colors.text }]}>{t.pageTitle}</Text>
        <Text style={[font(400), { fontSize: 13.5, lineHeight: 20, color: colors.textSoft, marginTop: 4 }]}>{t.pageSub}</Text>
      </View>

      {/* Member card */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable style={styles.avatar} onPress={pickAvatar}>
            {avatarBusy ? (
              <ActivityIndicator color="#fff" />
            ) : state.authUser?.avatarUrl ? (
              <Image source={{ uri: state.authUser.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={[font(700), { color: '#fff', fontSize: 18 }]}>{initials(state.pdName)}</Text>
            )}
            <View style={styles.avatarBadge}><Icon name="photo_camera" size={11} color="#fff" /></View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[font(800), { fontSize: 17, color: colors.text }]}>{state.pdName}</Text>
              <Icon name="verified" size={16} color={colors.mint} />
            </View>
            <Text style={[font(500), { fontSize: 12, color: colors.textSoft }]}>{t.memberBadge}</Text>
          </View>
          <Pressable onPress={startEditingProfile} style={styles.editIcon} accessibilityLabel="Edit profile"><Icon name="edit" size={18} color={colors.textSoft} /></Pressable>
        </View>
        <View style={styles.statsRow}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="event_available" size={18} color={colors.mint} />
            <Text style={[font(600), { fontSize: 12, color: colors.textMid }]}>
              {state.authUser?.createdAt ? `Member since ${new Date(state.authUser.createdAt).getFullYear()}` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Personal details */}
      <SectionCard>
        <SectionHead icon="person" title={t.personalDetails} onTitlePress={onSecretTap}
          right={
            <Pressable onPress={() => { if (state.pdEdit) saveProfile(); else startEditingProfile(); }} style={styles.editBtn}>
              <Icon name={state.pdEdit ? 'check' : 'edit'} size={15} color={colors.primary} />
              <Text style={[font(600), { fontSize: 12.5, color: colors.primary }]}>{state.pdEdit ? t.saveChanges : t.edit}</Text>
            </Pressable>
          }
        />
        {!state.pdEdit ? (
          <View style={{ marginTop: 12 }}>
            <DetailRow label={t.fullName} value={state.pdName} accessibilityLabel={`${t.fullName}: ${state.pdName}`} />
            <DetailRow label={t.email} value={state.pdEmail} accessibilityLabel={`${t.email}: ${state.pdEmail}`} />
            <DetailRow label={t.phone} value={state.pdPhone} accessibilityLabel={`${t.phone}: ${state.pdPhone}`} />
            <DetailRow label={t.dob} value={formatDob(state.pdDob)} accessibilityLabel={`${t.dob}: ${formatDob(state.pdDob)}`} last />
          </View>
        ) : (
          <View style={{ gap: 14, marginTop: 12 }}>
            <Field label={t.fullName} value={state.pdName} onChangeText={v => set({ pdName: v })} />
            <Field label={t.email} value={state.pdEmail} onChangeText={v => set({ pdEmail: v })} autoCapitalize="none" />
            <Field label={t.phone} value={state.pdPhone} onChangeText={v => set({ pdPhone: v })} />
            <View style={{ gap: 6 }}>
              <Text style={[font(600), { color: colors.textMid, fontSize: 13 }]}>{t.dobLabel}</Text>
              <Pressable style={styles.dobBtn} onPress={() => set({ dobOpen: !state.dobOpen })}>
                <Text style={[font(500), { fontSize: 15, color: dob ? colors.text : colors.muted }]}>
                  {dob ? formatDobParts(dob.y, dob.m, dob.d) : t.selectDate}
                </Text>
                <Icon name="calendar_month" size={20} color={colors.textSoft} />
              </Pressable>
              {state.dobOpen ? (
                <Calendar
                  year={dob?.y ?? state.calY}
                  month={dob?.m ?? state.calM}
                  selectedDay={dob?.d}
                  onSelect={(y, m, d) => {
                    setDob({ y, m, d });
                    set({ dobOpen: false });
                  }}
                />
              ) : null}
            </View>
          </View>
        )}
      </SectionCard>

      {/* Display language */}
      <SectionCard>
        <SectionHead icon="language" title={t.displayLanguage} />
        <View style={{ marginTop: 10, gap: 8 }}>
          {[{ label: 'English', code: 'en' }, { label: 'हिन्दी (Hindi)', code: 'hi' }, { label: 'తెలుగు (Telugu)', code: 'te' }].map(l => {
            const on = (state.lang ?? 'en') === l.code;
            return (
              <Pressable key={l.code} onPress={() => changeLang(l.code)} style={[styles.langRow, on && { borderColor: colors.primary, backgroundColor: 'rgba(7,159,160,0.07)' }]}>
                <Text style={[font(600), { fontSize: 14.5, color: colors.text }]}>{l.label}</Text>
                {on ? <Icon name="check_circle" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      {/* Notifications */}
      <SectionCard>
        <SectionHead icon="notifications_active" title={t.notifications} />
        <View style={{ marginTop: 8 }}>
          <ToggleRow title={t.loanUpdates} sub={t.loanUpdatesSub} value={state.notif.loan} onChange={v => changeNotif({ loan: v }, v)} />
          <ToggleRow title={t.securityAlerts} sub={t.securityAlertsSub} value={state.notif.security} onChange={v => changeNotif({ security: v }, v)} />
          <ToggleRow title={t.promoOffers} sub={t.promoOffersSub} value={state.notif.promo} onChange={v => changeNotif({ promo: v }, v)} last />
        </View>
      </SectionCard>

      {/* Consent & privacy */}
      <SectionCard>
        <SectionHead icon="verified_user" title={t.consentPrivacy} />
        <View style={styles.protected}>
          <View style={styles.shieldIcon}><Icon name="shield" size={20} color={colors.primary} /></View>
          <Text style={[font(700), { fontSize: 14, color: colors.text, marginTop: 8 }]}>{t.protectedTitle}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <Icon name="check_circle" size={14} color={colors.mint} />
            <Text style={[font(600), { fontSize: 11.5, color: colors.greenDeep }]}>{t.consentStatus}</Text>
          </View>
        </View>
        <Text style={[font(400), { fontSize: 12, lineHeight: 18, color: colors.textSoft, marginTop: 12 }]}>{t.dataSharingBody}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Pressable style={styles.partnerBtn} onPress={() => showToast(t.tSoon)}><Text style={[font(600), { fontSize: 12.5, color: colors.text }]}>{t.managePartners}</Text></Pressable>
          <Pressable style={styles.partnerBtn} onPress={() => showToast(t.tSoon)}><Text style={[font(600), { fontSize: 12.5, color: colors.text }]}>{t.requestExport}</Text></Pressable>
        </View>
        <Text style={[font(400), { fontSize: 10.5, lineHeight: 15, color: colors.muted, marginTop: 12 }]}>{t.privacyNote} <Text style={{ color: colors.primary }}>{t.privacyPolicy}</Text>.</Text>
      </SectionCard>

      {/* Links */}
      <View style={[styles.card, { padding: 6, marginTop: 16 }]}>
        {LINKS.map((l, i) => (
          <Pressable
            key={l.key}
            onPress={() => (l.help ? go('help') : l.key === 'linkDelete' ? deleteAccount() : showToast(t.tSoon))}
            style={[styles.linkRow, i < LINKS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.lineSoft }]}
          >
            <Icon name={l.icon} size={20} color={colors.textMid} />
            <Text style={[font(600), { flex: 1, fontSize: 14, color: colors.text }]}>{(t as any)[l.key]}</Text>
            <Icon name="chevron_right" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>

      {/* About */}
      <View style={{ marginTop: 20 }}>
        <Text style={[font(700), { fontSize: 13, color: colors.textMid }]}>{t.aboutTitle}</Text>
        <Text style={[font(400), { fontSize: 12, lineHeight: 18, color: colors.textSoft, marginTop: 4 }]}>{t.aboutBody}</Text>
        <Text style={[font(400), { fontSize: 11.5, lineHeight: 16, color: colors.muted, marginTop: 8 }]}>{t.aboutGrievance}</Text>
      </View>

      <Pressable style={styles.logoutBtn} onPress={logout}>
        <Text style={[font(700), { fontSize: 15, color: colors.redDeep }]}>{t.logout}</Text>
      </Pressable>
      <Pressable style={{ paddingVertical: 12, alignItems: 'center' }} onPress={logout}>
        <Text style={[font(500), { fontSize: 13, color: colors.muted }]}>{t.startFresh}</Text>
      </Pressable>
      <Text style={[font(400), { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 4 }]}>v0.1.0</Text>
    </Screen>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={[styles.card, { marginTop: 16 }]}>{children}</View>;
}
function SectionHead({ icon, title, right, onTitlePress }: { icon: string; title: string; right?: React.ReactNode; onTitlePress?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable onPress={onTitlePress} disabled={!onTitlePress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={20} color={colors.primary} />
        <Text style={[font(800), { fontSize: 15.5, color: colors.text }]}>{title}</Text>
      </Pressable>
      {right}
    </View>
  );
}
// `accessibilityLabel` is declared here (unused internally — the View below
// already computes its own from `label`/`value`) purely so callers can pass
// one on the `<DetailRow .../>` element itself. The voice screen-scraper
// (src/voice/screenGraph.ts:collectText) walks the *unrendered* element tree
// via props.children — it never actually executes DetailRow, so it can only
// see props declared at the call site, not anything this component renders
// internally. Without a prop set there, DetailRow's content (name/email/DOB
// on the profile screen) was invisible to screen_overview.
function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean; accessibilityLabel?: string }) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.detailRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.lineSoft }]}
    >
      <Text style={[font(500), { fontSize: 12.5, color: colors.textSoft }]}>{label}</Text>
      <Text style={[font(600), { fontSize: 13.5, color: colors.text }]}>{value}</Text>
    </View>
  );
}
function ToggleRow({ title, sub, value, onChange, last }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View style={[styles.toggleRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.lineSoft }]}>
      <View style={{ flex: 1 }}>
        <Text style={[font(600), { fontSize: 14, color: colors.text }]}>{title}</Text>
        <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft }]}>{sub}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 20, padding: 16, marginTop: 20 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 54, height: 54, borderRadius: 27 },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  editIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  statDiv: { width: 1, height: 32, backgroundColor: colors.lineSoft, marginHorizontal: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(7,159,160,0.1)', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
  dobBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  protected: { alignItems: 'center', backgroundColor: 'rgba(7,159,160,0.06)', borderRadius: 14, padding: 16, marginTop: 12 },
  shieldIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(7,159,160,0.12)', alignItems: 'center', justifyContent: 'center' },
  partnerBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 15 },
  logoutBtn: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(214,76,63,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 24, backgroundColor: 'rgba(239,106,94,0.06)' },
});
