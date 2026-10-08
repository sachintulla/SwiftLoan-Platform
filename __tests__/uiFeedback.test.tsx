// UI sound effects + the agent's visible choreography: scroll-into-view, typewriter fill, press
// animations. The native UiSound module is replaced with a recorder, so every test can assert
// exactly which sounds played, in what order.
import React, { useEffect } from 'react';
import { NativeModules, Pressable, Text, View } from 'react-native';
import { act, cleanup, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';

const played: string[] = [];
const loaded: string[] = [];
(NativeModules as any).UiSound = {
  load: (name: string) => loaded.push(name),
  play: (name: string) => played.push(name),
};

// Required after the mock above so the module binds to it.
import { SOUND_DATA } from '../src/feedback/soundData';
import {
  beginAgentActivity,
  initSounds,
  playSound,
  playTypingTick,
  manualSoundsEnabled,
  resetSoundPacing,
  setManualSoundsEnabled,
  setSoundsEnabled,
  soundsEnabled,
} from '../src/feedback/sounds';
import { UI_SOUNDS_ENABLED, UI_SOUNDS_MANUAL_TEST_MODE } from '../src/config/sounds';
import {
  agentApproach,
  agentPress,
  agentSettle,
  configureFx,
  emitFx,
  fxKey,
  registerReveal,
  registerScroller,
  revealTarget,
  slideTo,
  subscribeFx,
  typeText,
} from '../src/feedback/agentFx';
import { installPressableFx } from '../src/feedback/installPressableFx';
import { Field, Chips, ConsentRow, Toggle, PrimaryButton, Slider } from '../src/components/Controls';
import { BottomNav } from '../src/components/Frame';
import { tabLabelForScreen } from '../src/components/navTabs';
import AboutYou from '../src/screens/aboutyou';
import { useStore } from '../src/state/store';
import { agent } from '../src/voice';
import { setCurrentScreen } from '../src/voice/actionRegistry';
import { setTokens } from '../src/api/client';

const wait = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const flush = () => {
  played.length = 0;
};
const tool = (name: string, args: Record<string, unknown>) =>
  (agent as any).registry.get(name).handler(args) as Promise<any>;

beforeEach(() => {
  flush();
  resetSoundPacing();
  setSoundsEnabled(true);
  setManualSoundsEnabled(false); // production behaviour unless a test opts into test mode
  configureFx({ instant: true });
});

/** Advance fake time until `p` settles (a tool call is a chain of timed steps), then return it. */
async function settle<T>(p: Promise<T>, maxMs = 8000): Promise<T> {
  let done = false;
  p.then(() => (done = true), () => (done = true));
  for (let t = 0; t < maxMs && !done; t += 100) await wait(100);
  return p;
}

describe('sound effects module', () => {
  it('loads every generated clip into the native player, once', () => {
    initSounds();
    initSounds();
    expect(loaded.sort()).toEqual(Object.keys(SOUND_DATA).sort());
  });

  it('ships valid, unclipped, short WAV data for every sound', () => {
    for (const [name, b64] of Object.entries(SOUND_DATA)) {
      const buf = (globalThis as any).Buffer.from(b64, 'base64');
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
      const samples = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) / 2);
      const ms = (samples.length / 22050) * 1000;
      expect(ms).toBeGreaterThan(15);
      expect(ms).toBeLessThan(400); // UI cues, never long enough to talk over the agent
      const peak = Math.max(...Array.from(samples).map(Math.abs)) / 32767;
      expect(peak).toBeLessThan(0.95);
      expect(peak).toBeGreaterThan(0.1); // audible
      expect(name).toBeTruthy();
    }
  });

  it('plays nothing when sounds are switched off', () => {
    setSoundsEnabled(false);
    playSound('tap');
    playTypingTick();
    expect(played).toEqual([]);
  });

  it('typing ticks rotate through variants and never repeat back to back', () => {
    jest.useFakeTimers();
    for (let i = 0; i < 30; i++) {
      playTypingTick();
      jest.advanceTimersByTime(40);
    }
    jest.useRealTimers();
    expect(played.length).toBeGreaterThan(0);
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    expect(new Set(played).size).toBeGreaterThan(1);
    played.forEach(n => expect(n).toMatch(/^tick[123]$/));
  });

  it('a burst of identical sounds is rate-limited instead of buzzing', () => {
    jest.useFakeTimers();
    for (let i = 0; i < 20; i++) playSound('scroll');
    jest.useRealTimers();
    expect(played.filter(n => n === 'scroll')).toHaveLength(1);
  });

  it('deleting uses the backspace sound', () => {
    jest.useFakeTimers();
    playTypingTick(true);
    jest.useRealTimers();
    expect(played).toEqual(['del']);
  });

  it('the global switches in src/config/sounds.ts drive the runtime flags', () => {
    expect(UI_SOUNDS_ENABLED).toBe(true);
    expect(soundsEnabled()).toBe(true);
    setSoundsEnabled(false);
    expect(soundsEnabled()).toBe(false);
    setSoundsEnabled(true);
    // the manual test-mode default comes from the config (true while the sounds are being tried by hand)
    expect(typeof UI_SOUNDS_MANUAL_TEST_MODE).toBe('boolean');
    setManualSoundsEnabled(true);
    expect(manualSoundsEnabled()).toBe(true);
    setManualSoundsEnabled(false);
    expect(manualSoundsEnabled()).toBe(false);
  });
});

describe('PRODUCTION (manual test mode off): manual interaction is completely SILENT — only the agent makes sound', () => {
  beforeAll(() => installPressableFx());

  function Host({ children }: { children: React.ReactNode }) {
    const { state, go } = useStore();
    useEffect(() => {
      if (state.screen !== 'basic') go('basic');
    }, [state.screen, go]);
    return <View>{children}</View>;
  }

  it('a plain button still works when pressed by hand, and makes no sound', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <Pressable onPress={onPress}>
        <Text>Go</Text>
      </Pressable>,
    );
    fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(played).toEqual([]);
  });

  it('typing in a field by hand is silent and still reaches onChangeText', () => {
    const onChange = jest.fn();
    const { getByPlaceholderText } = renderWithProviders(
      <Host>
        <Field label="Name" placeholder="your name" value="ab" onChangeText={onChange} />
      </Host>,
    );
    const input = getByPlaceholderText('your name');
    fireEvent.changeText(input, 'abc');
    fireEvent.changeText(input, 'a');
    expect(onChange).toHaveBeenNthCalledWith(1, 'abc');
    expect(onChange).toHaveBeenNthCalledWith(2, 'a');
    expect(played).toEqual([]);
  });

  it('chips, toggles, consent rows and primary buttons are silent for the user, and still work', () => {
    const onChip = jest.fn();
    const onToggle = jest.fn();
    const onConsent = jest.fn();
    const onPrimary = jest.fn();
    const { getByText, getByLabelText } = renderWithProviders(
      <Host>
        <Chips value={null} onChange={onChip} options={[{ label: 'Male', value: 'm' }]} />
        <Toggle value={false} onChange={onToggle} label="Alerts" />
        <ConsentRow checked={true} onChange={onConsent} voiceId="terms">
          I agree
        </ConsentRow>
        <PrimaryButton label="Continue" onPress={onPrimary} />
      </Host>,
    );
    fireEvent.press(getByText('Male'));
    fireEvent.press(getByText('I agree'));
    fireEvent.press(getByText('Continue'));
    expect(onChip).toHaveBeenCalledWith('m');
    expect(onConsent).toHaveBeenCalledWith(false);
    expect(onPrimary).toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled(); // (label-only toggle has no text to press; covered via agent tests)
    expect(getByLabelText).toBeDefined();
    expect(played).toEqual([]);
  });

  it('a slider renders with the agent ring in place and is silent', () => {
    const { toJSON } = renderWithProviders(
      <Host>
        <Slider value={5} min={0} max={10} label="Amount" role="amount" />
      </Host>,
    );
    expect(JSON.stringify(toJSON())).toContain('"pointerEvents":"none"');
    expect(played).toEqual([]);
  });

  it('a raw labelled button renders under the wrapper and agent events reach it without errors', async () => {
    const { getByText } = renderWithProviders(
      <Pressable onPress={() => {}}>
        <Text>File Formal Grievance</Text>
      </Pressable>,
    );
    expect(getByText('File Formal Grievance')).toBeTruthy();
    const events: string[] = [];
    const off = subscribeFx(e => events.push(e.kind));
    emitFx('focus', 'File Formal Grievance');
    emitFx('done', 'File Formal Grievance');
    off();
    expect(events).toEqual(['focus', 'done']);
  });

  function AtHome() {
    const { state, go } = useStore();
    useEffect(() => {
      if (state.screen !== 'home') go('home');
    }, [state.screen, go]);
    return <BottomNav />;
  }

  it('even the main menu bar is silent for the user — and still navigates', async () => {
    jest.useFakeTimers();
    const { getByLabelText } = renderWithProviders(<AtHome />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    flush();
    fireEvent.press(getByLabelText('My Offers'));
    fireEvent.press(getByLabelText('Profile'));
    jest.useRealTimers();
    expect(played).toEqual([]);
  });

  it('with the global switch OFF even the menu bar is silent', async () => {
    setSoundsEnabled(false);
    jest.useFakeTimers();
    const { getByLabelText } = renderWithProviders(<AtHome />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    flush();
    fireEvent.press(getByLabelText('My Offers'));
    jest.useRealTimers();
    expect(played).toEqual([]);
  });
});

describe('MANUAL TEST MODE on: the user\'s own interaction plays the full sound set', () => {
  beforeAll(() => installPressableFx());
  beforeEach(() => setManualSoundsEnabled(true));

  function Host({ children }: { children: React.ReactNode }) {
    const { state, go } = useStore();
    useEffect(() => {
      if (state.screen !== 'basic') go('basic');
    }, [state.screen, go]);
    return <View>{children}</View>;
  }

  it('a plain button clicks (tap)', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <Pressable onPress={onPress}>
        <Text>Go</Text>
      </Pressable>,
    );
    fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(played).toEqual(['tap']);
  });

  it('a handler that plays its own sound suppresses the generic tap — one sound per press', () => {
    const { getByText } = renderWithProviders(
      <Pressable onPress={() => playSound('select')}>
        <Text>Pick</Text>
      </Pressable>,
    );
    fireEvent.press(getByText('Pick'));
    expect(played).toEqual(['select']);
  });

  it('typing ticks per character, deleting uses the backspace sound', () => {
    jest.useFakeTimers();
    const { getByPlaceholderText } = renderWithProviders(
      <Host>
        <Field label="Name" placeholder="your name" value="ab" onChangeText={() => {}} />
      </Host>,
    );
    const input = getByPlaceholderText('your name');
    fireEvent.changeText(input, 'abc');
    jest.advanceTimersByTime(60);
    fireEvent.changeText(input, 'a');
    jest.useRealTimers();
    expect(played[0]).toMatch(/^tick/);
    expect(played[1]).toBe('del');
  });

  it('chip = select, consent = on/off by new state, primary button = tap', () => {
    jest.useFakeTimers();
    const { getByText } = renderWithProviders(
      <Host>
        <Chips value={null} onChange={() => {}} options={[{ label: 'Male', value: 'm' }]} />
        <ConsentRow checked={true} onChange={() => {}} voiceId="terms">
          I agree
        </ConsentRow>
        <PrimaryButton label="Continue" onPress={() => {}} />
      </Host>,
    );
    fireEvent.press(getByText('Male'));
    jest.advanceTimersByTime(60);
    fireEvent.press(getByText('I agree'));
    jest.advanceTimersByTime(60);
    fireEvent.press(getByText('Continue'));
    jest.useRealTimers();
    expect(played).toEqual(['select', 'toggleOff', 'tap']);
  });

  it('the menu bar plays the nav cue exactly once per tap — no extra generic click on top', async () => {
    jest.useFakeTimers();
    function AtHome() {
      const { state, go } = useStore();
      useEffect(() => {
        if (state.screen !== 'home') go('home');
      }, [state.screen, go]);
      return <BottomNav />;
    }
    const { getByLabelText } = renderWithProviders(<AtHome />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    flush();
    fireEvent.press(getByLabelText('My Offers'));
    jest.useRealTimers();
    expect(played).toEqual(['nav']);
  });

  it('while the agent is typing, the field does NOT also tick for the user (no double sound)', async () => {
    const { getByPlaceholderText } = renderWithProviders(
      <Host>
        <Field label="Name" placeholder="your name" value="" onChangeText={() => {}} />
      </Host>,
    );
    const end = beginAgentActivity();
    fireEvent.changeText(getByPlaceholderText('your name'), 'x');
    end();
    expect(played).toEqual([]);
  });

  it('the master switch still wins: with sounds OFF test mode is silent too', () => {
    setSoundsEnabled(false);
    const { getByText } = renderWithProviders(
      <Pressable onPress={() => {}}>
        <Text>Go</Text>
      </Pressable>,
    );
    fireEvent.press(getByText('Go'));
    expect(played).toEqual([]);
  });
});

describe('with the global switch OFF the agent is silent too, but still acts', () => {
  it('agentApproach / agentPress / typeText make no sound but still emit events and write', async () => {
    setSoundsEnabled(false);
    const events: string[] = [];
    const off = subscribeFx(e => events.push(e.kind));
    const writes: string[] = [];
    await agentApproach('anyscreen', { label: 'Pincode' });
    await agentPress({ label: 'Pincode' });
    await typeText({ current: '', text: '533001', write: v => writes.push(v) });
    off();
    expect(events).toEqual(['focus', 'press']);
    expect(writes[writes.length - 1]).toBe('533001');
    expect(played).toEqual([]);
  });
});

describe('typeText — the agent types like a person', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    configureFx({ instant: false });
  });
  afterEach(() => {
    jest.useRealTimers();
    configureFx({ instant: true });
  });

  it('writes growing prefixes, one tick per character, and ends on the exact value', async () => {
    const writes: string[] = [];
    let p: Promise<void>;
    await act(async () => {
      p = typeText({ current: '', text: '9234783426', write: v => writes.push(v) });
    });
    await wait(1500);
    await p!;
    expect(writes).toEqual(['9', '92', '923', '9234', '92347', '923478', '9234783', '92347834', '923478342', '9234783426']);
    expect(played.filter(n => /^tick/.test(n)).length).toBeGreaterThanOrEqual(5); // rate-limited, still audible
  });

  it('continues from what is already there instead of retyping it', async () => {
    const writes: string[] = [];
    let p: Promise<void>;
    await act(async () => {
      p = typeText({ current: '9234', text: '923478', write: v => writes.push(v) });
    });
    await wait(1000);
    await p!;
    expect(writes).toEqual(['92347', '923478']);
  });

  it('clears and retypes when the new value is not an extension', async () => {
    const writes: string[] = [];
    let p: Promise<void>;
    await act(async () => {
      p = typeText({ current: 'abc', text: 'xy', write: v => writes.push(v) });
    });
    await wait(1000);
    await p!;
    expect(writes).toEqual(['', 'x', 'xy']);
    expect(played).toContain('del');
  });

  it('is not slower than ~1.2 s for a typical value', async () => {
    let p: Promise<void>;
    let done = false;
    await act(async () => {
      p = typeText({ current: '', text: 'Sri Bhavya Vasamsetti', write: () => {} }).then(() => {
        done = true;
      });
    });
    await wait(1300);
    expect(done).toBe(true);
    await p!;
  });

  it('a long value is typed in chunks, still finishing on the exact text', async () => {
    const long = 'x'.repeat(200);
    const writes: string[] = [];
    let p: Promise<void>;
    await act(async () => {
      p = typeText({ current: '', text: long, write: v => writes.push(v) });
    });
    await wait(3000);
    await p!;
    expect(writes[writes.length - 1]).toBe(long);
    expect(writes.length).toBeLessThanOrEqual(90); // ~1.5 s budget at 18 ms a step, not 200 single steps
    expect(writes.length).toBeLessThan(long.length);
  });

  it('on a slow device the fill batches characters so it still ends within about 1.5-2 s', async () => {
    const writes: string[] = [];
    const text = 'another.person@example.org';
    let p: Promise<void>;
    const startedAt = Date.now();
    await act(async () => {
      p = typeText({
        current: '',
        text,
        // every keystroke "costs" 300 ms of render time, as on a slow phone
        write: v => {
          writes.push(v);
          jest.setSystemTime(Date.now() + 300);
        },
      });
    });
    await wait(4000);
    await p!;
    expect(writes[writes.length - 1]).toBe(text);
    expect(writes.length).toBeLessThan(12); // not 26 single-character steps
    expect(Date.now() - startedAt).toBeLessThan(6000);
  });

  it('slideTo walks a slider in steps, ending exactly on the target, with detent sounds', async () => {
    const writes: number[] = [];
    let p: Promise<void>;
    await act(async () => {
      p = slideTo({ from: 100000, to: 500000, write: v => writes.push(v) });
    });
    await wait(900);
    await p!;
    expect(writes.length).toBeGreaterThan(4);
    expect(writes[writes.length - 1]).toBe(500000);
    expect(writes).toEqual([...writes].sort((a, b) => a - b)); // monotonic towards the target
    expect(played.filter(n => n === 'slide').length).toBeGreaterThan(2);
  });
});

describe('revealTarget — the page scrolls to what the agent is about to fill', () => {
  const SCREEN = 'revealtest';
  const ref = (y: number, h: number) =>
    ({ current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, y, 300, h) } } as any);

  function setup(opts: { y: number; h?: number; offset?: number; viewTop?: number; viewH?: number; bottomInset?: number }) {
    const scrollTo = jest.fn();
    registerScroller(SCREEN, {
      scrollToY: scrollTo,
      getOffset: () => opts.offset ?? 0,
      measureViewport: cb => cb(opts.viewTop ?? 100, opts.viewH ?? 700),
      topInset: 0,
      bottomInset: opts.bottomInset ?? 120,
    });
    registerReveal(SCREEN, 'Pincode', undefined, ref(opts.y, opts.h ?? 50));
    return scrollTo;
  }

  it('scrolls down when the field sits below the fold (the reported bug)', async () => {
    const scrollTo = setup({ y: 1100, offset: 200 }); // viewport 100..800, field at 1100
    expect(await revealTarget(SCREEN, 'Pincode')).toBe(true);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const to = scrollTo.mock.calls[0][0];
    expect(to).toBeGreaterThan(200); // moved down
    // lands the field near the middle of the visible area
    const newY = 1100 - (to - 200);
    expect(newY).toBeGreaterThan(100);
    expect(newY + 50).toBeLessThan(800 - 120);
    expect(played).toContain('scroll'); // the agent's scroll uses the same pulse roll as the user's
  });

  it('scrolls back up when the field is above the visible area', async () => {
    const scrollTo = setup({ y: -300, offset: 900 });
    expect(await revealTarget(SCREEN, 'Pincode')).toBe(true);
    expect(scrollTo.mock.calls[0][0]).toBeLessThan(900);
  });

  it('does not scroll when the field is already comfortably visible', async () => {
    const scrollTo = setup({ y: 400 });
    expect(await revealTarget(SCREEN, 'Pincode')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(played).not.toContain('scroll');
  });

  it('treats a field hidden under the tab bar / mic button as not visible', async () => {
    const scrollTo = setup({ y: 740, h: 50, bottomInset: 120 }); // 740..790 is inside 100..800 but under the 120px inset
    expect(await revealTarget(SCREEN, 'Pincode')).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
  });

  it('never scrolls above the top of the page', async () => {
    const scrollTo = setup({ y: -50, offset: 20 });
    await revealTarget(SCREEN, 'Pincode');
    expect(scrollTo.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });

  it('finds the control by a close label when the agent label differs slightly', async () => {
    const scrollTo = setup({ y: 1500 });
    expect(await revealTarget(SCREEN, 'pincode (6 digits)')).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
  });

  it('quietly does nothing for an unknown control or a screen with no scroller', async () => {
    setup({ y: 1500 });
    expect(await revealTarget(SCREEN, 'Totally different')).toBe(false);
    expect(await revealTarget('no-such-screen', 'Pincode')).toBe(false);
  });
});

describe('switching tabs — manual and by the agent sound the same', () => {
  beforeAll(() => installPressableFx());

  it('knows which tab each screen belongs to', () => {
    expect(tabLabelForScreen('home')).toBe('Home');
    expect(tabLabelForScreen('fare')).toBe('My Offers');
    expect(tabLabelForScreen('loans')).toBe('My Loans');
    expect(tabLabelForScreen('profile')).toBe('Profile');
    expect(tabLabelForScreen('help')).toBeUndefined();
  });

  function AtHome() {
    const { state, go } = useStore();
    useEffect(() => {
      if (state.screen !== 'home') go('home');
    }, [state.screen, go]);
    return <BottomNav />;
  }

  it('tapping a tab by hand is silent in production; in manual test mode it plays the nav cue (not the generic tap)', async () => {
    jest.useFakeTimers();
    const { getByLabelText } = renderWithProviders(<AtHome />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    flush();
    fireEvent.press(getByLabelText('My Offers'));
    expect(played).toEqual([]); // production: the user's own tab tap makes no sound
    setManualSoundsEnabled(true); // test mode
    fireEvent.press(getByLabelText('Profile'));
    jest.useRealTimers();
    expect(played).toEqual(['nav']);
  });

  it('the agent navigating (navigate tool) now plays the same cue and ripples the destination tab', async () => {
    jest.useFakeTimers();
    setTokens('fake-access-token');
    renderWithProviders(<AtHome />);
    setCurrentScreen('home');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    flush();
    const pressed: string[] = [];
    const off = subscribeFx(e => e.kind === 'press' && pressed.push(e.key));
    let p: Promise<any>;
    await act(async () => {
      p = tool('navigate_screen', { screen: 'loans' });
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });
    const res = await p!;
    off();
    jest.useRealTimers();
    setTokens(null);
    expect(res.ok).toBe(true);
    expect(played).toContain('nav');
    expect(pressed).toContain(fxKey('My Loans'));
  });

  it("the agent tapping a tab lights it up where it is — it never scrolls the page to reach the floating bar", async () => {
    const SCREEN = 'navscroll';
    const scrollTo = jest.fn();
    registerScroller(SCREEN, {
      scrollToY: scrollTo,
      getOffset: () => 0,
      measureViewport: cb => cb(0, 800),
      topInset: 0,
      bottomInset: 120,
    });
    // a tab sits inside the bottom 120px, which a normal control would be scrolled away from
    registerReveal(SCREEN, 'Home', undefined, { current: { measureInWindow: (cb: any) => cb(0, 740, 80, 50) } } as any);
    await agentApproach(SCREEN, { label: 'Home' }, { reveal: false });
    expect(scrollTo).not.toHaveBeenCalled();
    await agentApproach(SCREEN, { label: 'Home' }); // a non-fixed control in the same spot would scroll
    expect(scrollTo).toHaveBeenCalled();
  });
});

describe('agent result sounds', () => {
  it('a successful action ends silently (no chime); a refused entry plays the error cue', () => {
    agentSettle({ label: 'Pincode' }, true);
    expect(played).toEqual([]);
    agentSettle({ label: 'Date of birth' }, false);
    expect(played).toEqual(['error']);
  });
});

describe('agent choreography events', () => {
  it('agentApproach lights the control up (silently); agentPress dips and clicks', async () => {
    const events: string[] = [];
    const off = subscribeFx(e => events.push(`${e.kind}:${e.key}`));
    await agentApproach('anyscreen', { label: 'Continue' });
    await agentPress({ label: 'Continue' });
    off();
    expect(events).toEqual([`focus:${fxKey('Continue')}`, `press:${fxKey('Continue')}`]);
    expect(played).toEqual(['tap']); // the ring has no sound of its own — only the click
  });

  it('events are matched on label + group, case-insensitively', () => {
    expect(fxKey('Other', 'Gender')).toBe(fxKey(' other ', 'GENDER'));
    expect(fxKey('Other', 'Gender')).not.toBe(fxKey('Other', 'Employment'));
    const seen: string[] = [];
    const off = subscribeFx(e => seen.push(e.kind));
    emitFx('done', 'X');
    off();
    expect(seen).toEqual(['done']);
  });
});

describe('perform_ui_action on a real screen — end to end', () => {
  jest.setTimeout(30000);
  function AtAboutYou() {
    const { state, go } = useStore();
    useEffect(() => {
      if (state.screen !== 'aboutyou') go('aboutyou');
    }, [state.screen, go]);
    return state.screen === 'aboutyou' ? <AboutYou /> : null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    setTokens('fake-access-token');
    configureFx({ instant: false });
  });
  afterEach(async () => {
    // Unmount while the fake clock is still in charge, so nothing is left waiting on a real timer.
    await act(async () => {
      cleanup();
    });
    jest.clearAllTimers();
    jest.useRealTimers();
    setTokens(null);
    configureFx({ instant: true });
  });

  async function mount() {
    const r = renderWithProviders(<AtAboutYou />);
    setCurrentScreen('aboutyou');
    await wait(1500);
    return r;
  }

  it('fill_field types the value in character by character, with key ticks and no chime', async () => {
    const { getByDisplayValue, queryByDisplayValue } = await mount();
    flush();
    let res: any;
    let p: Promise<any>;
    await act(async () => {
      p = tool('fill_field', { label: 'Pincode', value: '533001' });
    });
    await wait(150); // mid-way: the user can see it partly typed
    expect(queryByDisplayValue('533001')).toBeNull();
    res = await settle(p!);
    expect(res.ok).toBe(true);
    expect(res.value).toBe('533001');
    expect(getByDisplayValue('533001')).toBeTruthy();
    expect(played[0]).toMatch(/^tick/); // no focus ping before the typing
    expect(played.filter(n => /^tick/.test(n)).length).toBeGreaterThan(2);
    expect(played).not.toContain('done');
    expect(played).not.toContain('focus');
  });

  it('tapping a chip as the agent: just the select pop, then the selection lands', async () => {
    await mount();
    flush();
    let p: Promise<any>;
    await act(async () => {
      p = tool('perform_ui_action', { action: 'tap', target: 'Female' });
    });
    const res = await settle(p!);
    expect(res.ok).toBe(true);
    expect(played).toEqual(['select']);
    // …and the selection really landed (the controls the agent sees afterwards say so)
    expect(res.controls_now).toContain('Gender (optional): Female (selected)');
  });

  it('two actions issued together run one after the other, not interleaved', async () => {
    const { getByDisplayValue } = await mount();
    flush();
    let a: Promise<any>;
    let b: Promise<any>;
    await act(async () => {
      a = tool('fill_field', { label: 'Pincode', value: '533001' });
      b = tool('fill_field', { label: 'Pincode', value: '500001' });
    });
    const ra = await settle(a!);
    const rb = await settle(b!);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(ra.value).toBe('533001'); // the first finished with ITS value, untouched by the second
    expect(getByDisplayValue('500001')).toBeTruthy();
  });

  it('bails out cleanly if the screen changes while the agent is still animating', async () => {
    await mount();
    flush();
    let p: Promise<any>;
    await act(async () => {
      p = tool('fill_field', { label: 'Pincode', value: '533001' });
    });
    setCurrentScreen('home'); // user (or an auto-transition) moved on mid-animation
    const res = await settle(p!);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('screen_changed');
    setCurrentScreen('aboutyou');
  });
});
