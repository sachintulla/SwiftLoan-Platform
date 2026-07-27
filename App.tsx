/**
 * SwiftLoan — native React Native port of the SwiftLoan design bundle.
 * A faithful, screen-for-screen mirror with the original navigation flow.
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from './src/state/store';
import Router from './src/Router';
import VoiceWidget from './src/voice/ui/VoiceWidget';
import ConfirmationSheet from './src/voice/ui/ConfirmationSheet';

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Router />
        <VoiceWidget />
        <ConfirmationSheet />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
