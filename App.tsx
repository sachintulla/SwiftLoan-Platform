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
import { nudgeFor, DEFAULT_TIMERS, NudgeTimers } from './src/voice/nudges';
import { trackEvent, api, NudgeConfigDTO } from './src/api/client';
import { loadNudgeTimers, saveNudgeTimers } from './src/state/session';

const toTimers = (d: NudgeConfigDTO): NudgeTimers => ({
  enabled: d.nudgeEnabled,
  idleMs: d.nudgeIdleMs,
  dropoffMs: d.nudgeDropoffMs,
  eligibleMs: d.nudgeEligibleMs,
});

// Voice FAB is hidden by default and revealed via a hidden gesture (tap the
// Personal details header 5× in a row on Profile → state.voiceFabUnlocked).
function VoiceFabGate() {
  const { state } = useStore();
  return state.voiceFabUnlocked ? <VoiceWidget /> : null;
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
 * Proactive-help idle detector. Any touch (capture phase) re-arms a per-screen
 * timer; if the user stalls past the screen's threshold (see nudgeFor), we fire
 * a nudge — the VoiceWidget then vibrates, wiggles the Ruby FAB and shows a
 * contextual label — and emit a `nudge` tracking event for backend follow-up
 * (callback/SMS/admin alert). One nudge per screen visit, so it never nags.
 */
function AppShell() {
  const { state, set } = useStore();
  const screen = state.screen;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeIdRef = useRef(0);
  const nudgeCountRef = useRef(0);
  const nudgedScreenRef = useRef<string | null>(null);
  // Latest set/screen kept in refs so `armIdle` can be STABLE — otherwise it
  // changes identity on every store re-render (animated screens re-render a
  // lot), which would clear + restart the idle timer and it'd never elapse.
  const setRef = useRef(set); setRef.current = set;
  const screenRef = useRef(screen); screenRef.current = screen;
  // Admin-tuned timers (from the backend); falls back to built-in defaults.
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

  const armIdle = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const scr = screenRef.current;
    const cfg = nudgeFor(scr, timersRef.current);
    if (!cfg || nudgedScreenRef.current === scr) return;
    timerRef.current = setTimeout(() => {
      nudgedScreenRef.current = scr;
      nudgeIdRef.current += 1;
      const label = cfg.labels[nudgeCountRef.current % cfg.labels.length];
      nudgeCountRef.current += 1;
      setRef.current({ voiceFabUnlocked: true, voiceNudge: { id: nudgeIdRef.current, label, reason: cfg.reason } });
      trackEvent('nudge', cfg.reason, scr, { label });
    }, cfg.timeoutMs);
  }, []);

  // Re-arm only when the screen actually changes (fresh visit → nudge allowed).
  useEffect(() => {
    nudgedScreenRef.current = null;
    armIdle();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [screen, armIdle]);

  const onTouchCapture = useCallback(() => { armIdle(); return false; }, [armIdle]);

  return (
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={onTouchCapture}>
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
