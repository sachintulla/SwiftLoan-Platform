import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { Screen } from '../components/Frame';
import { Wordmark } from '../components/Logo';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { registerUpshotPush } from '../analytics/upshot';

// Only the permissions the app genuinely uses are shown — and tapping Agree
// actually requests them, then the funnel moves on (in sync with the flow):
//   • Notifications — loan-status updates (registerUpshotPush).
//   • Camera — PAN scan + profile photo.
// Microphone is NOT shown here: it's requested in context only if the user opens
// the optional voice assistant. SMS and Location are not used at all (both are
// restricted for personal-loan apps on Play), so neither is shown or requested.
const PERMS = [
  { icon: 'notifications', titleKey: 'notifications', descKey: 'permNotifDesc' },
  { icon: 'photo_camera', titleKey: 'permCamera', descKey: 'permCameraDesc' },
];

export default function Permissions() {
  const { go } = useStore();
  const t = useT();
  const [busy, setBusy] = useState(false);

  // Agree = grant the required permissions, then continue. Each request is
  // best-effort: a denial never blocks the funnel (the feature re-asks in
  // context later), so the user always moves forward.
  const allow = async () => {
    setBusy(true);
    try {
      registerUpshotPush(); // notifications (both platforms)
      if (Platform.OS === 'android') {
        // Android needs an explicit runtime grant; iOS prompts for camera in
        // context (the PAN scanner / photo picker) per iOS best practice.
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).catch(() => {});
      }
    } finally {
      setBusy(false);
      // 'aboutyou' (name) was removed from onboarding — the name now comes from PAN
      // on the details step — so go straight to Home.
      go('home');
    }
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Wordmark size={20} />
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>{t.permTitle}</Text>
        <Text style={[font(400), { fontSize: 14, lineHeight: 21, color: '#6E8080', marginTop: 6, marginBottom: 20 }]}>
          {t.permSub}
        </Text>

        <View style={{ gap: 14 }}>
          {PERMS.map(p => (
            <View key={p.titleKey} style={styles.row}>
              <View style={styles.tile}>
                <Icon name={p.icon} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[font(800), { fontSize: 15, color: colors.text }]}>{t[p.titleKey]}</Text>
                <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: '#6E8080', marginTop: 2 }]}>{t[p.descKey]}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.lockNote}>
          <Icon name="lock" size={16} color={colors.textSoft} />
          <Text style={[font(500), { flex: 1, fontSize: 11.5, lineHeight: 17, color: '#4A6360' }]}>
            {t.permLockNote}
          </Text>
        </View>

        <View style={{ height: 24 }} />
        <PrimaryButton label={busy ? t.permRequesting : t.permAllow} icon={null} disabled={busy} onPress={allow} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 16,
    padding: 14,
  },
  tile: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  lockNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 18,
    backgroundColor: 'rgba(120,150,148,0.1)',
    borderRadius: 12,
    padding: 12,
  },
});
