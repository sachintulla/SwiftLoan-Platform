import { pickIceServers, isIceServer, hasRelay } from '../src/voice/transports/webrtc/iceServers';
import { SpeakingMeter, RemoteAudioLevel } from '../src/voice/transports/webrtc/speakingMeter';

describe('WebRTC ICE servers', () => {
  const TURN = { urls: 'turns:relay.example.com:443?transport=tcp', username: 'u', credential: 'c' };

  it('a release build with nothing configured is STUN only: never the free public relay', () => {
    const s = pickIceServers(undefined, false);
    expect(s).toHaveLength(1);
    expect(hasRelay(s)).toBe(false);
    expect(JSON.stringify(s)).not.toContain('openrelay');
  });

  it('a debug build gets the public relay as a convenience', () => {
    const s = pickIceServers(undefined, true);
    expect(hasRelay(s)).toBe(true);
    expect(JSON.stringify(s)).toContain('openrelay');
  });

  it('a configured list replaces the defaults, in release and debug alike', () => {
    for (const dev of [true, false]) {
      const s = pickIceServers([{ urls: 'stun:stun.example.com:3478' }, TURN], dev);
      expect(s).toEqual([{ urls: 'stun:stun.example.com:3478' }, TURN]);
      expect(JSON.stringify(s)).not.toContain('openrelay');
      expect(hasRelay(s)).toBe(true);
    }
  });

  it('ignores malformed entries, and falls back when none are valid', () => {
    expect(pickIceServers([{ urls: 5 }, null, 'x', { urls: [] }, { urls: 'turn:a', username: 3 }], false)).toHaveLength(1);
    expect(pickIceServers('not a list', false)).toHaveLength(1);
    expect(pickIceServers([{ urls: 'stun:ok' }, { nope: true }], false)).toEqual([{ urls: 'stun:ok' }]);
  });

  it('validates shape', () => {
    expect(isIceServer({ urls: ['turn:a', 'turns:b'], username: 'u', credential: 'c' })).toBe(true);
    expect(isIceServer({ urls: '' })).toBe(false);
    expect(isIceServer(undefined)).toBe(false);
  });
});

describe('SpeakingMeter', () => {
  it('starts speaking at once on a loud sample, and goes quiet only after the hang time', () => {
    const m = new SpeakingMeter(0.01, 700);
    expect(m.push(0, 0)).toBeNull();
    expect(m.push(0.2, 100)).toBe(true);
    expect(m.push(0.3, 350)).toBeNull(); // still speaking: no repeat
    expect(m.push(0.0, 600)).toBeNull(); // a short gap between words does not end it
    expect(m.push(0.0, 1000)).toBeNull(); // 650 ms since the last loud sample
    expect(m.push(0.0, 1100)).toBe(false); // 750 ms: quiet
    expect(m.push(0.0, 1500)).toBeNull();
  });

  it('a loud sample inside the hang time keeps it speaking', () => {
    const m = new SpeakingMeter(0.01, 700);
    m.push(0.5, 0);
    m.push(0, 500);
    m.push(0.5, 600);
    expect(m.push(0, 1200)).toBeNull();
    expect(m.push(0, 1400)).toBe(false);
  });

  it('reset forgets the state', () => {
    const m = new SpeakingMeter();
    m.push(0.5, 0);
    m.reset();
    expect(m.push(0.5, 10)).toBe(true);
  });
});

describe('RemoteAudioLevel', () => {
  const report = (stat: Record<string, unknown>) => new Map<string, any>([['a', { type: 'candidate-pair' }], ['b', stat]]);

  it('reads audioLevel from the inbound audio stat, clamped to 0..1', () => {
    const r = new RemoteAudioLevel();
    expect(r.read(report({ type: 'inbound-rtp', kind: 'audio', audioLevel: 0.25 }))).toBe(0.25);
    expect(r.read(report({ type: 'inbound-rtp', kind: 'audio', audioLevel: 7 }))).toBe(1);
  });

  it('accepts the legacy mediaType field and a plain object report', () => {
    const r = new RemoteAudioLevel();
    expect(r.read({ x: { type: 'inbound-rtp', mediaType: 'audio', audioLevel: 0.1 } })).toBe(0.1);
  });

  it('ignores video and non-inbound stats', () => {
    const r = new RemoteAudioLevel();
    expect(r.read(report({ type: 'inbound-rtp', kind: 'video', audioLevel: 0.9 }))).toBeNull();
    expect(r.read(report({ type: 'outbound-rtp', kind: 'audio', audioLevel: 0.9 }))).toBeNull();
    expect(r.read(null)).toBeNull();
  });

  it('without audioLevel it derives a level from the energy counters between two reads', () => {
    const r = new RemoteAudioLevel();
    const at = (energy: number, dur: number) => report({ type: 'inbound-rtp', kind: 'audio', totalAudioEnergy: energy, totalSamplesDuration: dur });
    expect(r.read(at(0.0, 1))).toBeNull(); // first read has nothing to compare against
    const loud = r.read(at(0.04, 1.25));
    expect(loud).toBeCloseTo(Math.sqrt(0.04 / 0.25), 5);
    expect(r.read(at(0.04, 1.5))).toBe(0); // no new energy: silent
  });
});
