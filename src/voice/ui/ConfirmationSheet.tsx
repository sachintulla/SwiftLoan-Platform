import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../../theme/tokens';
import { useT } from '../../state/store';
import { ConfirmationOptions, subscribeConfirmationRequests } from './confirmationBridge';

/** Confirm/cancel modal for requiresConfirmation tools and manual destructive
 *  actions (logout, delete account) — shows ONLY the message, never a
 *  description. Button labels default to the generic voice "Allow"/"Deny"
 *  but callers can pass specific verbs via ConfirmationOptions.
 *
 *  Deliberately NOT PrimaryButton/GhostButton — those two have different
 *  hardcoded heights/radii (54/16 vs 50/14) and looked visibly mismatched
 *  side by side here. These two buttons share one style, sized identically.
 *  Cancel gets the colored, inviting background; the (often destructive)
 *  confirm action stays plain — the safe choice should look the easier one,
 *  not the action you're actually here to gate. */
export default function ConfirmationSheet() {
  const t = useT();
  const [req, setReq] = useState<{ message: string; options?: ConfirmationOptions; resolve: (v: boolean) => void } | null>(null);

  useEffect(() => subscribeConfirmationRequests(setReq), []);

  if (!req) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => req.resolve(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={[font(700), styles.message]}>{req.message}</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => req.resolve(false)}
              style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && { opacity: 0.85 }]}
            >
              <Text style={[font(700), styles.btnLabel, { color: '#fff' }]}>
                {req.options?.cancelLabel ?? t.voiceConfirmDeny}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => req.resolve(true)}
              style={({ pressed }) => [styles.btn, styles.btnConfirm, pressed && { opacity: 0.7 }]}
            >
              <Text style={[font(700), styles.btnLabel, { color: colors.text }]}>
                {req.options?.confirmLabel ?? t.voiceConfirmAllow}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,30,30,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  sheet: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 16 },
  message: { fontSize: 16, color: colors.text, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontSize: 15 },
  btnCancel: { backgroundColor: colors.primary },
  btnConfirm: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.line },
});
