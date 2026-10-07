// When a new agent line starts, the unplayed rest of the previous line must be dropped so the
// new line plays immediately (Ello sends audio faster than it plays, so old audio can still be
// queued when the next line arrives).
import { agent } from '../src/voice';
import { setCurrentScreen } from '../src/voice/actionRegistry';

const chunk = () => (agent as any).handleMessage({ type: 'voice-audio-output', audio: 'AAAA', format: 'pcm_16000' });
const agentText = () =>
  (agent as any).handleMessage({
    type: 'conversation-text',
    data: { text: 'Shall we get started?', source: 'agent', is_interim: false },
  });
const userText = () =>
  (agent as any).handleMessage({ type: 'conversation-text', data: { text: 'yes', source: 'user', is_interim: false } });

let purge: jest.SpyInstance;
let play: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  purge = jest.spyOn((agent as any).player, 'purge').mockImplementation(() => undefined);
  play = jest.spyOn((agent as any).player, 'playChunk').mockImplementation(() => undefined);
  (agent as any).lastAudioChunkAt = 0;
  (agent as any).agentTextSinceAudio = false;
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('agent audio: a new line cuts the old one', () => {
  it('drops the previous line\'s queued audio when its text has arrived and a pause follows', () => {
    chunk();
    agentText(); // the first line is complete
    jest.advanceTimersByTime(2000); // a pause, then the next line begins
    chunk();
    expect(purge).toHaveBeenCalledTimes(1);
    // The purge happens BEFORE the new line's first chunk is played.
    expect(purge.mock.invocationCallOrder[0]).toBeLessThan(play.mock.invocationCallOrder[1]);
  });

  it('does not cut a line that is still streaming (no text yet)', () => {
    chunk();
    jest.advanceTimersByTime(2000);
    chunk();
    expect(purge).not.toHaveBeenCalled();
  });

  it('does not cut when the next chunk follows immediately, even after text', () => {
    chunk();
    agentText();
    jest.advanceTimersByTime(50); // no real pause — same stream
    chunk();
    expect(purge).not.toHaveBeenCalled();
  });

  it('ignores the user\'s own transcript', () => {
    chunk();
    userText();
    jest.advanceTimersByTime(2000);
    chunk();
    expect(purge).not.toHaveBeenCalled();
  });

  it('only cuts once per new line, not on every chunk of it', () => {
    chunk();
    agentText();
    jest.advanceTimersByTime(1000);
    chunk();
    jest.advanceTimersByTime(200);
    chunk();
    jest.advanceTimersByTime(200);
    chunk();
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('cuts the audio of a "no speech" marker turn so it is not heard', () => {
    chunk();
    (agent as any).handleMessage({
      type: 'conversation-text',
      data: { text: '(No speech)', source: 'agent', is_interim: false },
    });
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('cuts "<no speech>{pause}" too, but not an ordinary agent line or the user\'s words', () => {
    (agent as any).handleMessage({ type: 'conversation-text', data: { text: '<no speech>{pause}', source: 'agent', is_interim: false } });
    expect(purge).toHaveBeenCalledTimes(1);
    purge.mockClear();
    agentText();
    (agent as any).handleMessage({ type: 'conversation-text', data: { text: 'There is no speech limit.', source: 'agent', is_interim: false } });
    (agent as any).handleMessage({ type: 'conversation-text', data: { text: '(No speech)', source: 'user', is_interim: false } });
    expect(purge).not.toHaveBeenCalled();
  });
});

describe('already_introduced', () => {
  beforeEach(() => { (agent as any).signedInLineSpoken = false; });
  const say = (text: string, source = 'agent') =>
    (agent as any).handleMessage({ type: 'conversation-text', data: { text, source, is_interim: false } });

  it('is false for lines spoken during sign-in, true once a line is spoken on a signed-in screen', () => {
    setCurrentScreen('language');
    say('Which language would you like to continue in?');
    setCurrentScreen('otp');
    say('What is the OTP?');
    expect(agent.hasIntroducedThisCall()).toBe(false);
    setCurrentScreen('home');
    say('Hi Charan, I am Ruby from SwiftLoan.');
    expect(agent.hasIntroducedThisCall()).toBe(true);
  });

  it('is not set by a silent-turn marker, an empty line, or the user\'s own words', () => {
    setCurrentScreen('home');
    say('(No speech)');
    say('   ');
    say('hello', 'user');
    expect(agent.hasIntroducedThisCall()).toBe(false);
  });
});
