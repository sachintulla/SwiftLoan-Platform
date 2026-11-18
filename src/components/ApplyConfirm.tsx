import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Image, Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors, font } from '../theme/tokens';
import { useT } from '../state/store';
import { useVoiceTarget } from '../voice/useVoiceTarget';

/**
 * "You are about to apply with <lender>" pop-up, shown after Apply Now and BEFORE anything is sent to the
 * lender. One instance is mounted in App.tsx; `confirmApply()` opens it from anywhere (the shared
 * useOfferSelect hook) and resolves true on Proceed, false on Cancel / close / Android back.
 */
export interface ApplyConfirmRequest {
  lenderName: string;
  logoUrl?: string | null;
}

type Pending = ApplyConfirmRequest & { resolve: (ok: boolean) => void };

let pending: Pending | null = null;
let listener: ((p: Pending | null) => void) | null = null;

/** Ask the customer to confirm. With no pop-up mounted (tests of a lone screen) it resolves true, as before. */
export function confirmApply(req: ApplyConfirmRequest): Promise<boolean> {
  if (!listener) return Promise.resolve(true);
  // A second Apply tap while one is open replaces it; the first is treated as cancelled.
  pending?.resolve(false);
  return new Promise<boolean>(resolve => {
    pending = { ...req, resolve };
    listener?.(pending);
  });
}

/** Two letters for a lender with no logo: "IDFC FIRST Bank" → "IF". */
export function lenderInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ApplyConfirm() {
  const t = useT();
  const [req, setReq] = useState<Pending | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    listener = p => { setLogoFailed(false); setReq(p); };
    return () => {
      listener = null;
      pending?.resolve(false);
      pending = null;
    };
  }, []);

  const finish = useCallback((ok: boolean) => {
    const p = pending;
    pending = null;
    setReq(null);
    p?.resolve(ok);
  }, []);
  const proceed = useCallback(() => finish(true), [finish]);
  const cancel = useCallback(() => finish(false), [finish]);

  // Content inside a Modal is invisible to the agent's screen walker, so register both buttons while it is up.
  const open = !!req;
  useVoiceTarget(open ? t.applyConfirmProceed : undefined, { kind: 'button', onTap: proceed }, [open, proceed]);
  useVoiceTarget(open ? t.cancel : undefined, { kind: 'button', onTap: cancel }, [open, cancel]);

  if (!req) return null;
  const showLogo = !!req.logoUrl && !logoFailed;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <Pressable style={styles.scrim} onPress={cancel} accessible={false}>
        {/* Taps on the card itself must not close it. */}
        <Pressable style={styles.card} onPress={() => {}} accessible={false}>
          <Pressable onPress={cancel} style={styles.close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t.cancel}>
            <Icon name="close" size={20} color={colors.textSoft} />
          </Pressable>

          <View style={[styles.logo, showLogo && styles.logoWhite]}>
            {showLogo ? (
              <Image source={{ uri: req.logoUrl! }} style={styles.logoImg} resizeMode="contain" onError={() => setLogoFailed(true)} />
            ) : (
              <Text style={[font(800), styles.initials]}>{lenderInitials(req.lenderName)}</Text>
            )}
          </View>

          <Text style={[font(800), styles.title]} accessibilityRole="header">{req.lenderName}</Text>
          <Text style={[font(400), styles.body]}>{t.applyConfirmBody.replace('{lender}', req.lenderName)}</Text>

          <Pressable onPress={proceed} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={t.applyConfirmProceed}>
            <Text style={[font(800), { color: '#fff', fontSize: 15 }]}>{t.applyConfirmProceed}</Text>
            <Icon name="arrow_forward" size={17} color="#fff" />
          </Pressable>
          <Pressable onPress={cancel} style={styles.cancel} accessibilityRole="button" accessibilityLabel={t.cancel}>
            <Text style={[font(700), { color: colors.textSoft, fontSize: 13.5 }]}>{t.cancel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(10, 63, 65, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 24, padding: 24, paddingTop: 30, alignItems: 'center' },
  close: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoWhite: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  logoImg: { width: 56, height: 56 },
  initials: { fontSize: 24, color: '#fff', letterSpacing: 0.5 },
  title: { fontSize: 19, color: colors.text, textAlign: 'center', marginTop: 14, letterSpacing: -0.2 },
  body: { fontSize: 14, color: colors.textSoft, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  primary: { marginTop: 22, alignSelf: 'stretch', height: 50, borderRadius: 25, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  cancel: { marginTop: 8, alignSelf: 'stretch', height: 42, alignItems: 'center', justifyContent: 'center' },
});
