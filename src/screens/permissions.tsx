import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import { Wordmark } from '../components/Logo';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

const PERMS = [
  { icon: 'notifications', title: 'Notifications', desc: 'Stay updated on your EMIs, offers and application status.' },
  { icon: 'sms', title: 'SMS', desc: 'We read transaction SMS from 6-digit sender IDs for credit-risk assessment. Collected one time only.' },
  { icon: 'photo_camera', title: 'Camera', desc: 'To capture your selfie and documents for KYC and underwriting.' },
  { icon: 'location_on', title: 'Location', desc: 'For profile enrichment and fraud checks. Collected one time only.' },
];

export default function Permissions() {
  const { go } = useStore();
  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Wordmark size={20} />
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>Permissions</Text>
        <Text style={[font(400), { fontSize: 14, lineHeight: 21, color: '#6E8080', marginTop: 6, marginBottom: 20 }]}>
          To assess your eligibility and complete KYC securely, SwiftLoan needs a few permissions.
        </Text>

        <View style={{ gap: 14 }}>
          {PERMS.map(p => (
            <View key={p.title} style={styles.row}>
              <View style={styles.tile}>
                <Icon name={p.icon} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[font(800), { fontSize: 15, color: colors.text }]}>{p.title}</Text>
                <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: '#6E8080', marginTop: 2 }]}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.lockNote}>
          <Icon name="lock" size={16} color={colors.textSoft} />
          <Text style={[font(500), { flex: 1, fontSize: 11.5, lineHeight: 17, color: '#4A6360' }]}>
            Your data is encrypted and used only for your loan application. You can review or withdraw consent anytime in Profile.
          </Text>
        </View>

        <View style={{ height: 24 }} />
        <PrimaryButton label="Allow permissions" icon={null} onPress={() => go('aboutyou')} />
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
