import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { useStore } from '../src/state/store';
import { api, setTokens } from '../src/api/client';
import ResumePrompt from '../src/components/ResumePrompt';
import Mobile from '../src/screens/mobile';
import {
  parseResume, resumeDestination, isMaskedPan, agentResumeContext, hintResume, resumePatchFromClaim, type Resume,
} from '../src/utils/resume';

jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  claimInstall: jest.fn().mockResolvedValue(null),
}));

afterEach(() => {
  setTokens(null);
  jest.restoreAllMocks();
});

const RAW = { token: 'AB12CD34', first_name: 'Priya', phone: '9876543210', last_step: 'pan_done' };
const RESUME: Resume = { token: 'AB12CD34', firstName: 'Priya', phone: '9876543210', lastStep: 'pan_done', source: 'link' };

describe('parseResume', () => {
  it('accepts the server payload', () => {
    expect(parseResume(RAW, 'link')).toEqual(RESUME);
  });
  it('keeps a missing name as null', () => {
    expect(parseResume({ ...RAW, first_name: null }, 'login')?.firstName).toBeNull();
  });
  it('rejects anything malformed instead of trusting it', () => {
    expect(parseResume(null, 'link')).toBeNull();
    expect(parseResume({ ...RAW, phone: '12345' }, 'link')).toBeNull();
    expect(parseResume({ ...RAW, phone: '0000000000' }, 'link')).toBeNull();
    expect(parseResume({ ...RAW, last_step: 'done' }, 'link')).toBeNull();
    expect(parseResume({ ...RAW, token: 5 }, 'link')).toBeNull();
  });
});

describe('resumeDestination', () => {
  it('PAN done goes to step 2', () => expect(resumeDestination(RESUME, false)).toBe('step2'));
  it('only OTP done goes to Home with an offer', () => {
    expect(resumeDestination({ ...RESUME, lastStep: 'otp_only' }, false)).toBe('home_offer');
  });
  it('an existing application, nothing to resume, or an already onboarded user uses the normal flow', () => {
    expect(resumeDestination({ ...RESUME, lastStep: 'application_started' }, false)).toBe('normal');
    expect(resumeDestination(null, false)).toBe('normal');
    expect(resumeDestination(RESUME, true)).toBe('normal');
  });
});

describe('helpers', () => {
  it('recognises only the masked PAN the server returns', () => {
    expect(isMaskedPan('XXXXXX234A')).toBe(true);
    expect(isMaskedPan('ABCPE1234F')).toBe(false);
    expect(isMaskedPan('')).toBe(false);
    expect(isMaskedPan(null)).toBe(false);
  });
  it('tells the agent the stage and never the phone number', () => {
    const ctx = agentResumeContext(RESUME, 'pre_login');
    expect(ctx).toEqual({ stage: 'pre_login', first_name: 'Priya', last_step: 'pan_done', phone_prefilled: true });
    expect(JSON.stringify(ctx)).not.toContain('9876543210');
    expect(agentResumeContext(RESUME, 'resumed_at_step_2')?.phone_prefilled).toBe(false);
    expect(agentResumeContext(null, 'pre_login')).toBeUndefined();
  });
  it('a same-network guess knows nothing about the person and is never taken from the server as a real resume', () => {
    expect(hintResume()).toEqual({ token: '', firstName: null, phone: '', lastStep: 'unknown', source: 'hint' });
    expect(agentResumeContext(hintResume(), 'pre_login_hint')).toEqual({ stage: 'pre_login_hint', first_name: null, last_step: 'unknown', phone_prefilled: false });
    expect(parseResume({ ...RAW, last_step: 'unknown' }, 'link')).toBeNull(); // 'unknown' is only ever made locally
    expect(resumeDestination(hintResume(), false)).toBe('normal');
  });
});

function Probe({ seed, go: target }: { seed?: Record<string, unknown>; go?: string }) {
  const { state, set, go } = useStore();
  React.useEffect(() => {
    if (seed) set(seed);
    if (target) go(target as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Text testID="probe">{`${state.screen}|${state.mobileVal}|${String(state.terms)}|${String(state.resumePrompt)}|${String(state.resumeStage)}|${state.panNumber}`}</Text>
    </>
  );
}
const probe = (getByTestId: (id: string) => any) => String(getByTestId('probe').props.children).split('|');

describe('ResumePrompt (before login)', () => {
  it('stays hidden on the splash and privacy screens', () => {
    const { queryByText } = renderWithProviders(<><Probe seed={{ resume: RESUME, resumePrompt: 'welcome', resumeStage: 'pre_login' }} go="privacy" /><ResumePrompt /></>);
    expect(queryByText('Okay, continue')).toBeNull();
  });

  it('greets by name, and "Okay, continue" opens the login with the number filled and consent still unticked', async () => {
    const { getByText, getByTestId } = renderWithProviders(
      <><Probe seed={{ resume: RESUME, resumePrompt: 'welcome', resumeStage: 'pre_login' }} go="language" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Okay, continue')).toBeTruthy());
    expect(getByText('You left off on the website')).toBeTruthy();
    expect(getByText(/Hi Priya/)).toBeTruthy();
    fireEvent.press(getByText('Okay, continue'));
    await waitFor(() => expect(probe(getByTestId).slice(0, 4)).toEqual(['mobile', '9876543210', 'false', 'null']));
    expect(probe(getByTestId)[4]).toBe('null'); // no agent stage: the person chose to go it alone
  });

  it('without a name it uses the plain wording', async () => {
    const { getByText, queryByText } = renderWithProviders(
      <><Probe seed={{ resume: { ...RESUME, firstName: null }, resumePrompt: 'welcome' }} go="language" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Okay, continue')).toBeTruthy());
    expect(queryByText(/Hi /)).toBeNull();
    expect(getByText('Shall we continue your loan application where you left off?')).toBeTruthy();
  });
});

describe('ResumePrompt (after login, only the OTP was done)', () => {
  it('"Start application" opens the application at step 1', async () => {
    setTokens('test-token');
    const { getByText, getByTestId } = renderWithProviders(
      <><Probe seed={{ resume: { ...RESUME, lastStep: 'otp_only' }, resumePrompt: 'start', resumeStage: 'offer_start_application' }} go="home" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Start application')).toBeTruthy());
    expect(getByText('You already have an account on the website')).toBeTruthy();
    fireEvent.press(getByText('Start application'));
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('basicpan'));
  });

  it('"Not now" just closes it', async () => {
    setTokens('test-token');
    const { getByText, queryByText, getByTestId } = renderWithProviders(
      <><Probe seed={{ resume: { ...RESUME, lastStep: 'otp_only' }, resumePrompt: 'start', resumeStage: 'offer_start_application' }} go="home" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Not now')).toBeTruthy());
    fireEvent.press(getByText('Not now'));
    await waitFor(() => expect(queryByText('Not now')).toBeNull());
    expect(probe(getByTestId)[0]).toBe('home');
  });
});

describe('install claim to pop-up', () => {
  const CLAIM = { matched: true, method: 'ip_window', resume: null, resume_hint: true };
  it('a deterministic match offers the visitor\'s own details', () => {
    expect(resumePatchFromClaim({ resume: RAW })).toMatchObject({ resumePrompt: 'welcome', resumeStage: 'pre_login', resume: { firstName: 'Priya', phone: '9876543210', source: 'link' } });
  });
  it('a same-network match only asks, with nothing about the person', () => {
    expect(resumePatchFromClaim(CLAIM)).toEqual({ resume: hintResume(), resumePrompt: 'welcome', resumeStage: 'pre_login_hint' });
  });
  it('a deterministic match wins over a hint, and no hint and no resume means no pop-up', () => {
    expect(resumePatchFromClaim({ resume: RAW, resume_hint: true })?.resumeStage).toBe('pre_login');
    expect(resumePatchFromClaim({ ...CLAIM, resume_hint: false })).toBeNull();
    expect(resumePatchFromClaim({ resume: { phone: 'x' }, resume_hint: false })).toBeNull();
    expect(resumePatchFromClaim(null)).toBeNull();
    expect(resumePatchFromClaim({})).toBeNull();
  });
});

describe('ResumePrompt for a same-network guess (no name, no number)', () => {
  const HINT = { resume: hintResume(), resumePrompt: 'welcome', resumeStage: 'pre_login_hint' };

  it('asks instead of telling, and "Okay, continue" opens an EMPTY login with consent unticked', async () => {
    const { getByText, queryByText, getByTestId } = renderWithProviders(<><Probe seed={HINT} go="language" /><ResumePrompt /></>);
    await waitFor(() => expect(getByText('Okay, continue')).toBeTruthy());
    expect(getByText('Did you start an application on our website?')).toBeTruthy();
    expect(queryByText('You left off on the website')).toBeNull();
    expect(queryByText(/Hi /)).toBeNull();
    fireEvent.press(getByText('Okay, continue'));
    await waitFor(() => expect(probe(getByTestId).slice(0, 5)).toEqual(['mobile', '', 'false', 'null', 'null']));
  });
});

describe('login routing for a resumed visitor', () => {
  async function loginWith(seed: Record<string, unknown>) {
    jest.spyOn(api, 'verifyOtp').mockImplementation(async () => {
      setTokens('session-token');
      return { user: { id: 'u1', phone: '9876543210' }, priorInquiries: [] } as never;
    });
    const utils = renderWithProviders(<><Probe seed={{ mobileVal: '9876543210', terms: true, otpSent: true, ...seed }} /><Mobile /></>);
    const input = await waitFor(() => utils.UNSAFE_getByProps({ autoComplete: 'sms-otp' }));
    await act(async () => { fireEvent.changeText(input, '123456'); });
    return utils;
  }

  it('PAN done on the website: straight to step 2 with the PAN on file (masked) and its details', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(RAW);
    const onFile = jest.spyOn(api, 'panOnFile').mockResolvedValue({
      onFile: true, maskedPan: 'XXXXXX234A', aadhaarLinked: true, prefill: { firstName: 'PRIYA' },
    });
    const { getByTestId } = await loginWith({});
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('basic'));
    expect(onFile).toHaveBeenCalled();
    expect(probe(getByTestId)[4]).toBe('resumed_at_step_2');
    expect(probe(getByTestId)[5]).toBe('XXXXXX234A');
  });

  it('PAN done but the server no longer has the details: straight to Home, no pop-up, resume kept for the agent', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(RAW);
    jest.spyOn(api, 'panOnFile').mockResolvedValue({ onFile: false });
    const { getByTestId } = await loginWith({});
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('home'));
    expect(probe(getByTestId)[3]).toBe('null'); // develop dropped the "you already have an account" pop-up
  });

  it('only the OTP was done: straight to Home, no pop-up, resume kept for the agent (permissions and About You are skipped)', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue({ ...RAW, last_step: 'otp_only' });
    const { getByTestId } = await loginWith({});
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('home'));
    expect(probe(getByTestId)[3]).toBe('null'); // develop dropped the "you already have an account" pop-up
    expect(probe(getByTestId)[4]).toBe('offer_start_application');
  });

  it('nothing to resume: straight to Home (permissions screen skipped)', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(null);
    const { getByTestId } = await loginWith({});
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('home'));
    expect(probe(getByTestId)[3]).toBe('null');
  });

  it('a returning, already-onboarded user goes straight Home: no resume routing, no pop-up', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(RAW);
    jest.spyOn(api, 'verifyOtp').mockImplementation(async () => {
      setTokens('session-token');
      return { user: { id: 'u1', phone: '9876543210', fullName: 'Priya Sharma', pincode: '500034' }, priorInquiries: [] } as never;
    });
    const utils = renderWithProviders(<><Probe seed={{ mobileVal: '9876543210', terms: true, otpSent: true }} /><Mobile /></>);
    const input = await waitFor(() => utils.UNSAFE_getByProps({ autoComplete: 'sms-otp' }));
    await act(async () => { fireEvent.changeText(input, '123456'); });
    await waitFor(() => expect(probe(utils.getByTestId)[0]).toBe('home'));
    expect(probe(utils.getByTestId)[3]).toBe('null');
  });

  it('forgets the install link\'s data when it was for someone else\'s number', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(null);
    const { getByTestId } = await loginWith({ resume: { ...RESUME, phone: '9123456789' } });
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('home'));
    // no stage and no leftover data
    expect(probe(getByTestId)[4]).toBe('null');
  });

  it('a same-network guess: the account\'s own journey decides (PAN done goes to step 2, with the real stage)', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(RAW);
    jest.spyOn(api, 'panOnFile').mockResolvedValue({ onFile: true, maskedPan: 'XXXXXX234A', aadhaarLinked: true, prefill: { firstName: 'PRIYA' } });
    const { getByTestId } = await loginWith({ resume: hintResume(), resumeStage: 'pre_login_hint' });
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('basic'));
    expect(probe(getByTestId)[4]).toBe('resumed_at_step_2');
  });

  it('a same-network guess that was wrong (this account has no website journey): the hint is dropped, normal flow', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(null);
    const { getByTestId } = await loginWith({ resume: hintResume(), resumeStage: 'pre_login_hint' });
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('home'));
    expect(probe(getByTestId)[3]).toBe('null');
    expect(probe(getByTestId)[4]).toBe('null');
  });

  it('the install link\'s hint is ignored when they log in with a different number', async () => {
    jest.spyOn(api, 'journeyResume').mockResolvedValue(null);
    const { getByTestId } = await loginWith({ resume: { ...RESUME, phone: '9123456789' } });
    await waitFor(() => expect(probe(getByTestId)[0]).toBe('home'));
  });
});
