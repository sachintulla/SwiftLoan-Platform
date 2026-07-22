import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../src/state/store';

/** Render a screen/component inside the app's providers. */
export function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <StoreProvider>{ui}</StoreProvider>
    </SafeAreaProvider>,
  );
}
