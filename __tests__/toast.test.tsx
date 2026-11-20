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

// UC-N16: the toast sits at the TOP right (under the top bar), not at the bottom where the
// Ruby button and her tip bubble used to cover it.
describe('UC-N16 toast placement', () => {
  const { Screen, AppHeader } = require('../src/components/Frame');
  const { StyleSheet } = require('react-native');
  const LONG = 'Please fill Desired loan amount to continue.';
  function Fire() {
    const { showToast } = useStore();
    return <Pressable onPress={() => showToast(LONG)}><Text>warn</Text></Pressable>;
  }
  const wrapStyleOf = (node: any) => {
    // The alert pill's parent is the positioned wrapper.
    let n = node;
    while (n && !(StyleSheet.flatten(n.props?.style) || {}).position) n = n.parent;
    return StyleSheet.flatten(n.props.style);
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('is anchored to the top right and shows the whole message', () => {
    const r = renderWithProviders(<Screen><Fire /></Screen>);
    expect(r.queryByText(LONG)).toBeNull();
    act(() => { fireEvent.press(r.getByText('warn')); });
    const text = r.getByText(LONG);
    expect(text.props.numberOfLines).toBeUndefined();   // wraps, never cut off
    const wrap = wrapStyleOf(text);
    expect(wrap.position).toBe('absolute');
    expect(wrap.bottom).toBeUndefined();
    expect(wrap.top).toBe(47 + 8);                      // status-bar inset + 8
    expect(wrap.alignItems).toBe('flex-end');
    r.unmount();
  });

  it('sits below a pinned top bar, so it never covers Back / Continue', () => {
    const r = renderWithProviders(<Screen header={<AppHeader title="Tell us about yourself" />}><Fire /></Screen>);
    act(() => { fireEvent.press(r.getByText('warn')); });
    const wrap = wrapStyleOf(r.getByText(LONG));
    expect(wrap.bottom).toBeUndefined();
    expect(wrap.top).toBeGreaterThan(47 + 40);          // below the inset + the bar itself
    r.unmount();
  });

  // UC-N17: the card is always white; the icon, text and time bar take the colour of the kind.
  function Kinds() {
    const { showToast } = useStore();
    return (
      <>
        <Pressable onPress={() => showToast('Could not save.', { kind: 'error' })}><Text>err</Text></Pressable>
        <Pressable onPress={() => showToast('Please enter your PAN.', { kind: 'warning' })}><Text>warn2</Text></Pressable>
        <Pressable onPress={() => showToast('Saved.', { kind: 'success' })}><Text>ok</Text></Pressable>
        <Pressable onPress={() => showToast('Coming soon.')}><Text>note</Text></Pressable>
      </>
    );
  }
  const flat = (node: any) => StyleSheet.flatten(node.props.style) || {};
  const cardStyleOf = (node: any) => {
    let n = node;
    while (n && !flat(n).backgroundColor) n = n.parent;
    return flat(n);
  };

  it.each([
    ['err', 'Could not save.', 'error', '#D64C3F'],            // danger: red
    ['warn2', 'Please enter your PAN.', 'warning', '#A16500'],  // warning: amber
    ['ok', 'Saved.', 'check_circle', '#0E8C7E'],                // success: green
    ['note', 'Coming soon.', 'info', '#0A3F41'],                // note: deep teal
  ])('%s: icon and inside colour follow the kind, on a white card', (button, message, icon, colour) => {
    const r = renderWithProviders(<Screen><Kinds /></Screen>);
    act(() => { fireEvent.press(r.getByText(button)); });
    const text = r.getByText(message);
    expect(flat(text).color).toBe(colour);
    expect(flat(r.getByText(icon)).color).toBe(colour);         // Material Symbols ligature
    expect(cardStyleOf(text).backgroundColor).toBe('#FFFFFF');
    r.unmount();
  });

  it('is compact: small text and a narrow card', () => {
    const r = renderWithProviders(<Screen><Kinds /></Screen>);
    act(() => { fireEvent.press(r.getByText('err')); });
    const text = r.getByText('Could not save.');
    expect(flat(text).fontSize).toBeLessThanOrEqual(13);
    expect(cardStyleOf(text).maxWidth).toBeLessThanOrEqual(300);
    r.unmount();
  });

  it('an error stays up longer than a note, and nothing stays longer than 3 seconds', () => {
    const { toastDurationMs, TOAST_MAX_MS } = require('../src/state/store');
    expect(TOAST_MAX_MS).toBe(3000);
    for (const kind of ['error', 'warning', 'success', 'info']) {
      expect(toastDurationMs(kind)).toBeLessThanOrEqual(3000);
    }
    const r = renderWithProviders(<Screen><Kinds /></Screen>);
    act(() => { fireEvent.press(r.getByText('err')); });
    act(() => { jest.advanceTimersByTime(2500); });
    expect(r.getByText('Could not save.')).toBeTruthy();   // a note would be gone by now
    act(() => { jest.advanceTimersByTime(600); });           // 3 s reached: it starts to leave
    act(() => { jest.advanceTimersByTime(250); });           // the slide out
    expect(r.queryByText('Could not save.')).toBeNull();
    r.unmount();
  });

  it('the × closes it early, as a bare touch responder (no press-rect measuring)', () => {
    const r = renderWithProviders(<Screen><Kinds /></Screen>);
    act(() => { fireEvent.press(r.getByText('err')); });
    const close = r.getByLabelText('Dismiss');
    expect(close.props.onStartShouldSetResponder()).toBe(true);
    expect(close.props.onPress).toBeUndefined();
    act(() => { close.props.onResponderRelease(); });
    // Still mounted while it slides out (it must never unmount and remount mid-way: that froze
    // the card on screen), then removed by a timer.
    expect(r.getByText('Could not save.')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(250); });
    expect(r.queryByText('Could not save.')).toBeNull();
    r.unmount();
  });

  it('closing early and showing another toast straight away keeps the new one', () => {
    const r = renderWithProviders(<Screen><Kinds /></Screen>);
    act(() => { fireEvent.press(r.getByText('err')); });
    act(() => { r.getByLabelText('Dismiss').props.onResponderRelease(); });
    act(() => { jest.advanceTimersByTime(100); });           // still sliding out
    act(() => { fireEvent.press(r.getByText('ok')); });
    act(() => { jest.advanceTimersByTime(400); });           // the old removal must not take it
    expect(r.getByText('Saved.')).toBeTruthy();
    expect(r.queryByText('Could not save.')).toBeNull();
    r.unmount();
  });

  it('goes away when the toast clears', () => {
    const r = renderWithProviders(<Screen><Fire /></Screen>);
    act(() => { fireEvent.press(r.getByText('warn')); });
    expect(r.getByText(LONG)).toBeTruthy();
    act(() => { jest.advanceTimersByTime(2500); });          // its time is up: it starts to leave
    act(() => { jest.advanceTimersByTime(250); });           // the slide out
    expect(r.queryByText(LONG)).toBeNull();
    r.unmount();
  });
});
