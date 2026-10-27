import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../../theme/tokens';
import Icon from '../../components/Icon';
import { useT } from '../../state/store';
import { ConfirmationOptions, subscribeConfirmationRequests } from './confirmationBridge';

// Animated.loop spins on Jest's faked 0 ms rAF clock, so the loop is left
// un-started under Jest (same guard the rest of the app uses).
const UNDER_JEST = typeof process !== 'undefined' && !!(process as { env?: Record<string, string | undefined> }).env?.JEST_WORKER_ID;

function useYoyo(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (UNDER_JEST) return undefined;
    const a = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [v, duration, delay]);
  return v;
}

/** A looping "this is about to happen" illustration — a tinted icon that gently
 *  pulses inside outward-expanding rings. Teal for logout, red for delete. */
function AlertArt({ kind }: { kind: 'logout' | 'delete' }) {
  const danger = kind === 'delete';
  const accent = danger ? colors.redDeep : colors.primary;
  const r1 = useYoyo(1400, 0);
  const r2 = useYoyo(1400, 700);
  const pulse = useYoyo(1200);
  const ringStyle = (v: Animated.Value) => ({
    borderColor: accent,
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.6] }) }],
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
  });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] });
  return (
    <View style={styles.artBox}>
      <Animated.View style={[styles.ring, ringStyle(r1)]} />
      <Animated.View style={[styles.ring, ringStyle(r2)]} />
      <View style={[styles.artCircle, { backgroundColor: danger ? 'rgba(214,76,63,0.12)' : 'rgba(7,159,160,0.12)' }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Icon name={danger ? 'delete' : 'logout'} size={34} color={accent} />
        </Animated.View>
      </View>
    </View>
  );
}

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
          {req.options?.art ? <AlertArt kind={req.options.art} /> : null}
          <Text style={[font(700), styles.message, req.options?.art && { textAlign: 'center' }]}>{req.message}</Text>
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
  artBox: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: -4 },
  artCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 82, height: 82, borderRadius: 41, borderWidth: 3 },
  message: { fontSize: 16, color: colors.text, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontSize: 15 },
  btnCancel: { backgroundColor: colors.primary },
  btnConfirm: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.line },
});
