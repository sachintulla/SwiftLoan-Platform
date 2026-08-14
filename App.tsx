/**
 * SwiftLoan — native React Native port of the SwiftLoan design bundle.
 * A faithful, screen-for-screen mirror with the original navigation flow.
 */
import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/state/store';
import Router from './src/Router';
import ContextBanner from './src/components/ContextBanner';
import VoiceWidget from './src/voice/ui/VoiceWidget';
import ConfirmationSheet from './src/voice/ui/ConfirmationSheet';

// Voice FAB visibility. Enabled for the TestFlight build.
const SHOW_VOICE_FAB = true;

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

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Router />
        <ContextBanner />
        {SHOW_VOICE_FAB && <VoiceWidget />}
        <ConfirmationSheet />
        <BackHandlerBridge />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
