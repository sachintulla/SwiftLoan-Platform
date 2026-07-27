import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { GhostButton, PrimaryButton } from '../../components/Controls';
import { colors, font } from '../../theme/tokens';
import { useT } from '../../state/store';
import { subscribeConfirmationRequests } from './confirmationBridge';

/** Allow/Deny modal for requiresConfirmation tools — shows ONLY confirmationMessage, never description. */
export default function ConfirmationSheet() {
  const t = useT();
  const [req, setReq] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);

  useEffect(() => subscribeConfirmationRequests(setReq), []);

  if (!req) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => req.resolve(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={[font(700), styles.message]}>{req.message}</Text>
          <View style={styles.row}>
            <GhostButton label={t.voiceConfirmDeny} onPress={() => req.resolve(false)} style={styles.half} />
            <PrimaryButton label={t.voiceConfirmAllow} onPress={() => req.resolve(true)} icon={null} style={styles.half} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16 },
  message: { fontSize: 16, color: colors.text, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
