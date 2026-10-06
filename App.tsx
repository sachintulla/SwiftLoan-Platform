/**
 * SwiftLoan — native React Native port of the SwiftLoan design bundle.
 * A faithful, screen-for-screen mirror with the original navigation flow.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/state/store';
import Router from './src/Router';
import { BottomNav } from './src/components/Frame';
import ContextBanner from './src/components/ContextBanner';
import OfflineNotice from './src/components/OfflineNotice';
import VoiceWidget from './src/voice/ui/VoiceWidget';
import ConfirmationSheet from './src/voice/ui/ConfirmationSheet';
import { nudgeFor, DEFAULT_TIMERS, NudgeTimers, NUDGE_START_MS, nudgeSnoozeRemaining, onNudgeWake } from './src/voice/nudges';
import { trackEvent, api, isAuthed, NudgeConfigDTO } from './src/api/client';
import { loadNudgeTimers, saveNudgeTimers } from './src/state/session';
import { agent } from './src/voice';

const toTimers = (d: NudgeConfigDTO): NudgeTimers => ({
  enabled: d.nudgeEnabled,
  idleMs: d.nudgeIdleMs,
  dropoffMs: d.nudgeDropoffMs,
  eligibleMs: d.nudgeEligibleMs,
});

// Voice FAB is shown on every screen except the splash and the first-launch
// privacy/terms screen. VoiceWidget also self-hides when Ello isn't configured. The `voiceFabUnlocked` flag (and
// the Profile 5-tap gesture / nudge that set it) are retained but no longer gate
// visibility.
function VoiceFabGate() {
  const { state } = useStore();
  // Hidden on the first-launch Terms & Privacy screen: accepting them is the user's
  // own act, so the assistant isn't available there (and not on the splash before
  // it). It appears on the language screen, right after "Accept & Continue".
  if (state.screen === 'splash' || state.screen === 'privacy') return null;
  return <VoiceWidget />;
}

/**
 * Without this, the hardware/gesture back button on Android has nothing to
 * pop — there's no navigation stack, just one Activity — so it fell through
 * to the OS default of closing the app instead of going to the previous
 * screen. On `home` (the app's root), let the default behavior through so
 * back still exits normally; every other screen navigates back in-app.
 */
function BackHandlerBridge() {
  const { state, back } = useStore();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.screen === 'home' || state.screen === 'splash') return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [state.screen, back]);
  return null;
}

/**
 * Proactive-help tips. NUDGE_START_MS after the user lands on a screen — touched
 * or not — the Ruby button gets a tip bubble that cycles through that screen's
 * tips and stays until the screen changes or a call starts (see nudges.ts and
 * VoiceWidget). One `nudge` tracking event per screen visit.
 */
function AppShell() {
  const { state, set } = useStore();
  const screen = state.screen;
  const nudgeIdRef = useRef(0);
  const setRef = useRef(set); setRef.current = set;
  // Tip language. On the language picker, until the user actually taps a language
  // (selectedLang), the saved `lang` is just a leftover from a previous session, so
  // the tip stays English (the default) instead of showing e.g. Telugu unprompted.
  const tipLang = screen === 'language' && !state.selectedLang ? null : state.lang;
  const langRef = useRef(tipLang); langRef.current = tipLang;
  const nudgeRef = useRef(state.voiceNudge); nudgeRef.current = state.voiceNudge;
  // Admin on/off switch (from the backend); timing itself is hard-coded.
  const timersRef = useRef<NudgeTimers>(DEFAULT_TIMERS);

  // Load the last-known config instantly, then fetch fresh; re-fetch on every
  // foreground so an admin change is picked up without an app restart.
  const refreshConfig = useCallback(async () => {
    try {
      const r = await api.nudgeConfig();
      if (r?.data) { timersRef.current = toTimers(r.data); saveNudgeTimers(timersRef.current); }
    } catch { /* keep current timers on failure */ }
  }, []);
  useEffect(() => {
    loadNudgeTimers<NudgeTimers>().then((t) => { if (t) timersRef.current = t; });
    refreshConfig();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshConfig(); });
    return () => sub.remove();
  }, [refreshConfig]);

  // New screen: drop the previous screen's tip and start a fresh clock.
  useEffect(() => {
    setRef.current({ voiceNudge: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      // The user closed the bubble recently: wait out the snooze (the wake
      // listener below also fires this the moment it ends).
      const snoozed = nudgeSnoozeRemaining();
      if (snoozed > 0) { timer = setTimeout(fire, snoozed); return; }
      // Never show (or track) a tip during a live call; try again shortly so a
      // call that ends on this same screen still gets its tip.
      const status = agent.getStatus();
      if (status !== 'idle' && status !== 'ended') { timer = setTimeout(fire, 3000); return; }
      const cfg = nudgeFor(screen, timersRef.current, isAuthed(), langRef.current);
      if (!cfg) return;
      nudgeIdRef.current += 1;
      setRef.current({ voiceFabUnlocked: true, voiceNudge: { id: nudgeIdRef.current, labels: cfg.labels, reason: cfg.reason } });
      trackEvent('nudge', cfg.reason, screen, { label: cfg.labels[0] });
    };
    timer = setTimeout(fire, NUDGE_START_MS);
    const offWake = onNudgeWake(() => { if (timer) clearTimeout(timer); fire(); });
    return () => { if (timer) clearTimeout(timer); offWake(); };
  }, [screen]);

  // The user switched language (e.g. on the language picker) while a tip is up:
  // re-word the visible bubble in the new language. Same id/reason, so the bubble
  // swaps its text in place instead of popping up again or logging a new event.
  useEffect(() => {
    const cur = nudgeRef.current;
    if (!cur) return;
    const cfg = nudgeFor(screen, timersRef.current, isAuthed(), tipLang);
    if (cfg && cfg.reason === cur.reason && cfg.labels[0] !== cur.labels[0]) {
      setRef.current({ voiceNudge: { ...cur, labels: cfg.labels } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipLang]);

  return (
    <View style={{ flex: 1 }}>
      <Router />
      <ContextBanner />
      {/* Persistent tab bar + FAB (rendered above the screens): the bar slides
          down/up and the FAB rolls between the notch and the corner. */}
      <BottomNav />
      <VoiceFabGate />
      <ConfirmationSheet />
      <OfflineNotice />
      <BackHandlerBridge />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
