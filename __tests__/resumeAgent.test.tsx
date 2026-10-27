import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, waitFor, act } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { useStore } from '../src/state/store';
import { setTokens } from '../src/api/client';
import ResumePrompt from '../src/components/ResumePrompt';
import { agent } from '../src/voice';
import { hintResume, type Resume } from '../src/utils/resume';

// The mic button only shows when the voice agent is configured; force that on for these tests.
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  claimInstall: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/voice', () => ({
  ...jest.requireActual('../src/voice'),
  ELLO_CONFIGURED: true,
}));

// The language a previous test saved would otherwise be restored over this test's own seed.
beforeEach(async () => { await AsyncStorage.clear(); });
afterEach(() => {
  setTokens(null);
  jest.restoreAllMocks();
});

const RESUME: Resume = { token: 'AB12CD34', firstName: 'Priya', phone: '9876543210', lastStep: 'pan_done', source: 'link' };

function Probe({ seed, go: target }: { seed?: Record<string, unknown>; go?: string }) {
  const { state, set, go } = useStore();
  React.useEffect(() => {
    if (seed) set(seed);
    if (target) go(target as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Text testID="probe">{`${state.screen}|${state.mobileVal}|${String(state.terms)}|${String(state.resumeStage)}`}</Text>;
}
const probe = (getByTestId: (id: string) => any) => String(getByTestId('probe').props.children).split('|');

describe('"Take help from agent"', () => {
  it('opens the pre-filled login (consent unticked), marks the agent stage, and starts the agent', async () => {
    const start = jest.spyOn(agent, 'start').mockResolvedValue(undefined);
    const { getByText, getByTestId } = renderWithProviders(
      <><Probe seed={{ resume: RESUME, resumePrompt: 'welcome', resumeStage: 'pre_login' }} go="language" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Take help from agent')).toBeTruthy());
    fireEvent.press(getByText('Take help from agent'));
    await waitFor(() => expect(probe(getByTestId).slice(0, 4)).toEqual(['mobile', '9876543210', 'false', 'pre_login']));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(); // no phone is handed to the agent session before login
  });

  it('for a same-network guess it keeps the hint stage and pre-fills nothing', async () => {
    const start = jest.spyOn(agent, 'start').mockResolvedValue(undefined);
    const { getByText, getByTestId } = renderWithProviders(
      <><Probe seed={{ resume: hintResume(), resumePrompt: 'welcome', resumeStage: 'pre_login_hint' }} go="language" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Take help from agent')).toBeTruthy());
    fireEvent.press(getByText('Take help from agent'));
    await waitFor(() => expect(probe(getByTestId).slice(0, 4)).toEqual(['mobile', '', 'false', 'pre_login_hint']));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1)); // let its delayed start happen inside this test
  });

  it('"Okay, continue" never starts the agent', async () => {
    const start = jest.spyOn(agent, 'start').mockResolvedValue(undefined);
    const { getByText } = renderWithProviders(
      <><Probe seed={{ resume: RESUME, resumePrompt: 'welcome', resumeStage: 'pre_login' }} go="language" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Okay, continue')).toBeTruthy());
    fireEvent.press(getByText('Okay, continue'));
    await act(async () => { await new Promise<void>((r) => setTimeout(() => r(), 600)); });
    expect(start).not.toHaveBeenCalled();
  });

  it('a failed agent start shows a toast instead of crashing, and the login is still usable', async () => {
    jest.spyOn(agent, 'start').mockRejectedValue(new Error('boom'));
    const { getByText, getByTestId } = renderWithProviders(
      <><Probe seed={{ resume: RESUME, resumePrompt: 'welcome', resumeStage: 'pre_login' }} go="language" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText('Take help from agent')).toBeTruthy());
    fireEvent.press(getByText('Take help from agent'));
    await act(async () => { await new Promise<void>((r) => setTimeout(() => r(), 700)); });
    expect(probe(getByTestId)[0]).toBe('mobile');
  });
});

describe('what the voice agent is told (page_context.journey_resume)', () => {
  const pageContext = () => (agent as unknown as { pageContextFn?: () => Record<string, any> }).pageContextFn?.() ?? {};

  it('carries stage, first name and last step, and never the phone number', async () => {
    renderWithProviders(<Probe seed={{ resume: RESUME, resumePrompt: 'welcome', resumeStage: 'pre_login' }} go="language" />);
    await waitFor(() => expect(pageContext().journey_resume).toBeTruthy());
    const ctx = pageContext();
    expect(ctx.journey_resume).toEqual({ stage: 'pre_login', first_name: 'Priya', last_step: 'pan_done', phone_prefilled: true });
    expect(JSON.stringify(ctx)).not.toContain('9876543210');
  });

  it.each([
    ['resumed_at_step_2', false],
    ['offer_start_application', false],
  ])('stage %s is passed on, with phone_prefilled %s', async (stage, prefilled) => {
    renderWithProviders(<Probe seed={{ resume: RESUME, resumeStage: stage }} go="language" />);
    await waitFor(() => expect(pageContext().journey_resume?.stage).toBe(stage));
    expect(pageContext().journey_resume.phone_prefilled).toBe(prefilled);
    expect(JSON.stringify(pageContext())).not.toContain('9876543210');
  });

  it('for a same-network guess: stage pre_login_hint, no name, step unknown, nothing prefilled', async () => {
    renderWithProviders(<Probe seed={{ resume: hintResume(), resumeStage: 'pre_login_hint' }} go="language" />);
    await waitFor(() => expect(pageContext().journey_resume?.stage).toBe('pre_login_hint'));
    expect(pageContext().journey_resume).toEqual({ stage: 'pre_login_hint', first_name: null, last_step: 'unknown', phone_prefilled: false });
  });

  it('is absent when there is nothing to resume', async () => {
    renderWithProviders(<Probe go="language" />);
    await act(async () => { await new Promise<void>((r) => setTimeout(() => r(), 50)); });
    expect(pageContext().journey_resume).toBeUndefined();
  });
});

describe('translated pop-up copy', () => {
  it.each([
    ['hi', 'ठीक है, आगे बढ़ें', 'एजेंट की मदद लें'],
    ['te', 'సరే, కొనసాగించండి', 'ఏజెంట్ సహాయం తీసుకోండి'],
  ])('%s shows both buttons in that language', async (lang, cont, agentLabel) => {
    const { getByText } = renderWithProviders(
      <><Probe seed={{ lang, resume: RESUME, resumePrompt: 'welcome' }} go="language" /><ResumePrompt /></>,
    );
    await waitFor(() => expect(getByText(cont)).toBeTruthy());
    expect(getByText(agentLabel)).toBeTruthy();
  });
});
