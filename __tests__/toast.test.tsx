import React from 'react';
import { Text, Pressable } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { useStore } from '../src/state/store';

// UC-N15: every toast is mirrored into apiContext.lastToast for the voice agent.
function Probe() {
  const { state, showToast } = useStore();
  return (
    <>
      <Pressable onPress={() => showToast('This email is already in use by another account.')}><Text>fire</Text></Pressable>
      <Pressable onPress={() => showToast('hello', { silentToAgent: true })}><Text>quiet</Text></Pressable>
      <Text testID="seen">{JSON.stringify((state.apiContext as any).lastToast ?? null)}</Text>
    </>
  );
}

describe('UC-N15 toast reaches the voice agent', () => {
  it('copies the toast message into apiContext.lastToast', () => {
    const { getByText, getByTestId } = renderWithProviders(<Probe />);
    expect(getByTestId('seen').props.children).toBe('null');
    act(() => { fireEvent.press(getByText('fire')); });
    expect(getByTestId('seen').props.children).toContain('already in use');
  });
  it('does not copy a silentToAgent toast', () => {
    const { getByText, getByTestId } = renderWithProviders(<Probe />);
    act(() => { fireEvent.press(getByText('quiet')); });
    expect(getByTestId('seen').props.children).toBe('null');
  });
});
