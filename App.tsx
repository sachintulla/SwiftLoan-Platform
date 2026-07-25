/**
 * SwiftLoan — native React Native port of the SwiftLoan design bundle.
 * A faithful, screen-for-screen mirror with the original navigation flow.
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from './src/state/store';
import Router from './src/Router';
import ContextBanner from './src/components/ContextBanner';

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Router />
        <ContextBanner />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
