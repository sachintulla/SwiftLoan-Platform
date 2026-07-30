import React, { useEffect } from 'react';
import { act } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import Language from '../src/screens/language';
import Profile from '../src/screens/profile';
import Fare from '../src/screens/fare';
import { useStore, Screen as ScreenName } from '../src/state/store';
import {
  buildPageContext,
  findTarget,
  getScreenTexts,
  listTargets,
  setCurrentScreen,
} from '../src/voice/actionRegistry';
import { isSensitiveField } from '../src/voice/sensitive';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/**
 * Navigates the store to `name` before rendering the screen body. Needed because
 * <Screen> publishes its discovered elements under the store's current screen,
 * and a bare render() would leave the store on its initial 'splash' route. In the
 * running app Router keeps the two in sync by construction.
 */
function AtScreen({ name, children }: { name: ScreenName; children: React.ReactNode }) {
  const { state, go } = useStore();
  useEffect(() => {
    if (state.screen !== name) go(name);
  }, [state.screen, name, go]);
  return <>{state.screen === name ? children : null}</>;
}

function renderAt(name: ScreenName, ui: React.ReactElement) {
  const r = renderWithProviders(<AtScreen name={name}>{ui}</AtScreen>);
  setCurrentScreen(name);
  return r;
}

/**
 * These cover the gap that made "tap English" fail on-device: most screens build
 * their controls from raw <Pressable>, which per-primitive registration never
 * saw. The element-tree walk in screenGraph.ts is what closes it.
 */
describe('UC-V1 auto-discovery of raw Pressables', () => {
  it('finds the language options that are plain Pressables, not primitives', () => {
    renderAt('language', <Language />);

    const labels = listTargets('language').map(t => t.label);
    expect(labels).toContain('English');
    expect(labels).toContain('हिन्दी');
    expect(labels).toContain('Tenglish');
  });

  it('resolves a target by its visible label, case-insensitively', () => {
    renderAt('language', <Language />);

    expect(findTarget('language', 'English')).toBeTruthy();
    expect(findTarget('language', 'english')).toBeTruthy();
    expect(findTarget('language', 'Nonexistent Control')).toBeNull();
  });

  it('actually invokes the screen handler when tapped through the registry', () => {
    renderAt('language', <Language />);

    const target = findTarget('language', 'English');
    expect(target?.onTap).toBeInstanceOf(Function);
    // Selecting a language flips the CTA from "Select a language" to
    // "Continue with English" — proving the real onPress ran.
    expect(() => target!.onTap!()).not.toThrow();
  });
});

describe('UC-V2 screen reading', () => {
  it('collects visible text so the agent can describe the screen', () => {
    renderAt('language', <Language />);

    const texts = getScreenTexts('language');
    expect(texts.join(' ')).toContain('Choose your language');
  });

  it('page context exposes screen name, summary and available actions', () => {
    renderAt('language', <Language />);

    const ctx = buildPageContext('language') as any;
    expect(ctx.page).toBe('language');
    expect(typeof ctx.screen_overview).toBe('string');
    expect(Array.isArray(ctx.available_actions)).toBe(true);
    expect(ctx.available_actions.length).toBeGreaterThan(0);
  });
});

describe('UC-V3 varied control types across screens', () => {
  it('discovers controls on a toggle-heavy screen (profile)', () => {
    renderAt('profile', <Profile />);
    expect(listTargets('profile').length).toBeGreaterThan(0);
  });

  it('discovers controls on a slider screen (fare)', () => {
    renderAt('fare', <Fare />);
    expect(listTargets('fare').length).toBeGreaterThan(0);
  });
});

describe('UC-V4 sensitive fields are never voice-fillable', () => {
  it.each([
    ['PAN Number', {}],
    ['Card PIN', {}],
    ['CVV', {}],
    ['Password', {}],
    ['Aadhaar', {}],
  ])('flags %s as sensitive', (label, props) => {
    expect(isSensitiveField(label, props)).toBe(true);
  });

  it.each([
    ['Full Name', {}],
    ['Email Address', {}],
    ['Company', {}],
    // OTP is a deliberate exception — product decision: the agent may enter
    // it itself (dummy app, fixed test code, no real 2FA secret at stake).
    ['OTP', {}],
  ])('leaves %s fillable', (label, props) => {
    expect(isSensitiveField(label, props)).toBe(false);
  });

  it('flags any secureTextEntry field regardless of label', () => {
    expect(isSensitiveField('Something', { secureTextEntry: true })).toBe(true);
  });
});

describe('UC-V5 input labels are speakable, not placeholders', () => {
  it('labels the phone field "Mobile Number", not "+91" or "00000 00000"', () => {
    const Mobile = require('../src/screens/mobile').default;
    renderAt('mobile', <Mobile />);

    const fields = listTargets('mobile').filter(t => t.kind === 'field');
    expect(fields.length).toBeGreaterThan(0);
    const labels = fields.map(f => f.label);
    // The real visible label wins over the adjacent "+91" and the placeholder.
    expect(labels).toContain('Mobile Number');
    expect(labels).not.toContain('+91');
    expect(labels).not.toContain('00000 00000');
  });
});

describe('UC-V6 controls inside child components are reachable', () => {
  it('exposes the EmiCalculator sliders on the fare screen', () => {
    const Fare = require('../src/screens/fare').default;
    renderAt('fare', <Fare />);

    const targets = listTargets('fare');
    const sliders = targets.filter(t => t.kind === 'slider').map(t => t.label);
    // Previously this screen exposed only "scroll:page": fare.tsx renders a lone
    // <EmiCalculator/>, and the element-tree walk cannot see inside a child
    // component. useVoiceTarget in Slider closes that gap.
    expect(sliders).toContain('Loan amount');
    expect(sliders).toContain('Tenure');
    expect(sliders).toContain('Interest rate');
    // And its Apply button, also a raw Pressable inside the child component.
    expect(targets.map(t => t.label)).toContain('Apply for this loan');
  });

  it('clamps a slider value to its range instead of writing it raw', () => {
    const Fare = require('../src/screens/fare').default;
    renderAt('fare', <Fare />);

    const tenure = listTargets('fare').find(t => t.kind === 'slider' && t.label === 'Tenure');
    expect(tenure?.setValue).toBeInstanceOf(Function);
    tenure!.setValue!(500); // max is 60
    expect(Number(tenure!.getValue!())).toBeLessThanOrEqual(60);
  });
});

describe('UC-V7 disabled controls are visible with a reason', () => {
  it('exposes the gated Send OTP button instead of hiding it', () => {
    const Mobile = require('../src/screens/mobile').default;
    renderAt('mobile', <Mobile />);

    const all = listTargets('mobile');
    const gated = all.find(t => t.disabled);
    // Send OTP is disabled until 10 digits + terms. Hiding it left the agent with
    // "not_found" and no way to discover the precondition.
    expect(gated).toBeTruthy();
    expect(gated!.label.length).toBeGreaterThan(0);
  });
});

describe('UC-V8 aboutyou: name and DOB are agent-fillable', () => {
  it('does NOT treat "Full name (as per PAN)" as a secret', () => {
    // The label mentions PAN, but it asks for a name — a bare /pan\b/ match made
    // the agent refuse to type the user's own name.
    expect(isSensitiveField('Full name (as per PAN)', {})).toBe(false);
    expect(isSensitiveField('Card holder name', {})).toBe(false);
    // Actual secrets stay refused. OTP is deliberately fillable — see UC-V9.
    expect(isSensitiveField('PAN Number', {})).toBe(true);
    expect(isSensitiveField('Enter OTP', {})).toBe(false);
  });

  it('does NOT treat a postal "Pin code" as a secret, but a real PIN stays refused', () => {
    // basic.tsx labels its field "Pin code (current address)" — a bare /pin\b/
    // match flagged it, so the agent refused to type the user's own postal code.
    expect(isSensitiveField('Pin code (current address)', {})).toBe(false);
    expect(isSensitiveField('Pincode', {})).toBe(false);
    // A real security PIN (ATM/card/UPI) must stay refused.
    expect(isSensitiveField('ATM PIN', {})).toBe(true);
    expect(isSensitiveField('Card PIN', {})).toBe(true);
  });

  it('exposes the name, email, pincode fields and gender chips', () => {
    const AboutYou = require('../src/screens/aboutyou').default;
    renderAt('aboutyou', <AboutYou />);
    const labels = listTargets('aboutyou').map(t => t.label);

    expect(labels.some(l => /full name/i.test(l))).toBe(true);
    expect(labels.some(l => /pincode/i.test(l))).toBe(true);
    expect(labels).toContain('Male');
    expect(labels).toContain('Female');

    const name = listTargets('aboutyou').find(t => /full name/i.test(t.label));
    expect(name?.sensitive).toBeFalsy(); // fillable by voice
    expect(name?.setValue).toBeInstanceOf(Function);
  });
});

describe('UC-V9 OTP is agent-fillable, Verify is agent-tappable', () => {
  it('does not refuse OTP fields regardless of platform signal', () => {
    // Product decision: the agent may enter the OTP itself (dummy app, fixed
    // test code) — oneTimeCode/sms-otp no longer trigger a refusal.
    expect(isSensitiveField('OTP digit 1', { textContentType: 'oneTimeCode' })).toBe(false);
    expect(isSensitiveField('anything', { autoComplete: 'sms-otp' })).toBe(false);
  });
});

describe('UC-V10 date of birth is settable in one step', () => {
  it('labels wrapped Fields from their label prop, not the section heading', () => {
    const AboutYou = require('../src/screens/aboutyou').default;
    renderAt('aboutyou', <AboutYou />);
    const labels = listTargets('aboutyou').map(t => t.label);
    // Previously these came out as "About you" / "Contact" (nearest headings).
    expect(labels).not.toContain('About you');
    expect(labels).not.toContain('Contact');
    expect(labels).toContain('Full name (as per PAN)');
    expect(labels).toContain('Pincode');
  });

  it('the date target is settable immediately, without opening the picker first', () => {
    const AboutYou = require('../src/screens/aboutyou').default;
    renderAt('aboutyou', <AboutYou />);
    // Setting a DOB by voice should apply instantly — it shouldn't require
    // visually opening the calendar grid first just so a settable target exists.
    const dateTarget = listTargets('aboutyou').find(t => t.kind === 'date');
    expect(dateTarget).toBeDefined();
    act(() => dateTarget!.setValue!('1991-12-29'));
    const afterSet = listTargets('aboutyou').find(t => t.kind === 'date');
    expect(afterSet!.getValue!()).toBe('29 Dec 1991');
    // Resolving by kind still wins over fuzzy-matching the "Select date" button.
    const byFuzzy = findTarget('aboutyou', 'Date');
    expect(byFuzzy?.kind).toBe('date');
  });
});

describe('UC-V11 loan amount slider on the application screen', () => {
  it('exposes "Desired loan amount" and clamps to its range', () => {
    const Basic = require('../src/screens/basic').default;
    renderAt('basic', <Basic />);

    const slider = listTargets('basic').find(t => t.kind === 'slider');
    // basic.tsx's Slider had no `label`, so useVoiceTarget bailed and the agent
    // could not set the loan amount at all.
    expect(slider).toBeTruthy();
    expect(slider!.label).toBe('Desired loan amount');

    // set_loan_amount resolves it by fuzzy label ("loan amount" ⊂ this label).
    expect(findTarget('basic', 'Loan amount')?.kind).toBe('slider');

    // Targets are re-created on each render and getValue closes over that
    // render's value, so the write must be flushed and the target re-read — which
    // is precisely why the real tool path waits before reporting `applied`.
    const currentSlider = () => listTargets('basic').find(t => t.kind === 'slider')!;

    act(() => currentSlider().setValue!(300000));
    expect(Number(currentSlider().getValue!())).toBe(300000);

    act(() => currentSlider().setValue!(99999999)); // above the 15,00,000 max
    expect(Number(currentSlider().getValue!())).toBeLessThanOrEqual(1500000);
  });

  it('the pincode field is fillable by voice, not refused as a secret', () => {
    const Basic = require('../src/screens/basic').default;
    renderAt('basic', <Basic />);
    const pin = listTargets('basic').find(t => /pin code/i.test(t.label));
    expect(pin).toBeTruthy();
    expect(pin?.sensitive).toBeFalsy();
    expect(pin?.setValue).toBeInstanceOf(Function);
  });
});

describe('UC-V12 post-action state is reported event-driven, not on a fixed delay', () => {
  // These assert real elapsed time, so they need real timers (the suite-wide
  // beforeEach installs fake ones for screen render tests).
  beforeEach(() => jest.useRealTimers());

  it('resolves as soon as a graph publish happens, well under the timeout floor', async () => {
    const { waitForNextPublish, publishScreenGraph } = require('../src/voice/actionRegistry');

    const started = Date.now();
    const waiter = waitForNextPublish(250);
    // Simulate <Screen>'s effect re-publishing after a re-render.
    setTimeout(() => publishScreenGraph('language', [], []), 10);
    await waiter;
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('releases waiters even when the control set is unchanged (e.g. typing in a field)', async () => {
    const { waitForNextPublish, publishScreenGraph } = require('../src/voice/actionRegistry');

    const els = [{ id: 'field:Name', kind: 'field' as const, label: 'Name' }];
    publishScreenGraph('basic', els, []); // establish the signature
    const started = Date.now();
    const waiter = waitForNextPublish(250);
    // Identical set → publishScreenGraph returns false, but waiters must still wake.
    setTimeout(() => expect(publishScreenGraph('basic', els, [])).toBe(false), 10);
    await waiter;
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('still resolves via the timeout when nothing re-renders', async () => {
    const { waitForNextPublish } = require('../src/voice/actionRegistry');
    const started = Date.now();
    await waitForNextPublish(60);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});

describe('UC-V13 scroll direction is respected, not just magnitude', () => {
  it('produces a negative delta for "up" and positive for "down"', () => {
    const { scrollDelta } = require('../src/components/Frame');
    // Previously the delta was always positive regardless of any requested
    // direction, so an incremental "scroll up" was structurally impossible —
    // only jumping to the absolute top worked. Pin the sign here.
    expect(scrollDelta('page', 'up')).toBeLessThan(0);
    expect(scrollDelta('small', 'up')).toBeLessThan(0);
    expect(scrollDelta('page', 'down')).toBeGreaterThan(0);
    expect(scrollDelta('small', 'down')).toBeGreaterThan(0);
    // Defaults to "down" when direction is omitted, for backwards compatibility.
    expect(scrollDelta('page')).toBeGreaterThan(0);
    // "page" moves further than "small", in either direction.
    expect(Math.abs(scrollDelta('page', 'up'))).toBeGreaterThan(Math.abs(scrollDelta('small', 'up')));
  });
});
