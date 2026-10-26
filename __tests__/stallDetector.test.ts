import { StallDetector, peakOfPcm16Base64, IDLE_CHECKIN_MAX } from '../src/voice/stallDetector';

const speak = (d: StallDetector, from: number, to: number) => {
  for (let t = from; t <= to; t += 40) d.noteMicPeak(t, 9000);
};

describe('StallDetector', () => {
  it('reports when the user has been speaking and the server has said nothing for 15 s', () => {
    const d = new StallDetector();
    d.reset(0);
    d.noteServerFrame(1000);
    speak(d, 5000, 6000); // you clearly spoke…
    expect(d.check(10000)).toBe(false); // …only 9 s of silence so far
    expect(d.check(17000)).toBe(true); // 16 s of silence, speech 11 s ago
  });

  it('stays quiet when the user is not speaking (the agent simply waiting is not a stall)', () => {
    const d = new StallDetector();
    d.reset(0);
    for (let t = 0; t < 60000; t += 40) d.noteMicPeak(t, 300); // room noise only
    expect(d.check(60000)).toBe(false);
  });

  it('stays quiet when the server keeps answering', () => {
    const d = new StallDetector();
    d.reset(0);
    speak(d, 5000, 6000);
    d.noteServerFrame(16000);
    expect(d.check(20000)).toBe(false);
  });

  it('needs more than one loud chunk (a single click or cough is not speech)', () => {
    const d = new StallDetector();
    d.reset(0);
    d.noteMicPeak(5000, 9000);
    expect(d.check(30000)).toBe(false);
  });

  it('reports once, then not again until the cooldown has passed', () => {
    const d = new StallDetector();
    d.reset(0);
    speak(d, 5000, 6000);
    expect(d.check(16000)).toBe(true); // 16 s of silence, speech 10 s ago
    speak(d, 21000, 22000);
    expect(d.check(25000)).toBe(false);
    speak(d, 48000, 49000);
    expect(d.check(52000)).toBe(true);
  });

  it('a new call starts clean', () => {
    const d = new StallDetector();
    d.reset(0);
    speak(d, 5000, 6000);
    d.reset(30000);
    expect(d.check(31000)).toBe(false);
  });
});

describe('peakOfPcm16Base64', () => {
  const b64 = (samples: number[]) => {
    const bytes = new Uint8Array(samples.length * 2);
    samples.forEach((s, i) => {
      const v = s < 0 ? s + 65536 : s;
      bytes[i * 2] = v & 0xff;
      bytes[i * 2 + 1] = (v >> 8) & 0xff;
    });
    let bin = '';
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin);
  };
  it('finds the loudest sample, positive or negative', () => {
    const quiet = new Array(40).fill(10);
    expect(peakOfPcm16Base64(b64(quiet))).toBe(10);
    const loud = new Array(40).fill(0);
    loud[8] = -9000; // sampled positions are every 4th sample: index 8 qualifies
    expect(peakOfPcm16Base64(b64(loud))).toBe(9000);
  });
  it('is 0 for garbage rather than throwing', () => {
    expect(peakOfPcm16Base64('%%%not base64%%%')).toBe(0);
  });
});

describe('idle check-in (nobody has said anything)', () => {
  it('asks for a check-in after 15 s of quiet from both sides, with the seconds of quiet', () => {
    const d = new StallDetector();
    d.reset(0);
    d.noteServerFrame(1000);
    expect(d.idleCheck(10000)).toBeNull();
    expect(d.idleCheck(16500)).toBe(16); // 15.5 s since the agent's last frame
  });

  it('never while the user is speaking — that is a stall, not quiet', () => {
    const d = new StallDetector();
    d.reset(0);
    for (let t = 5000; t < 6000; t += 40) d.noteMicPeak(t, 9000);
    expect(d.idleCheck(16000)).toBeNull();
  });

  it('at most twice in one quiet stretch, 20 s apart — the agent\'s own reply does not buy it more', () => {
    const d = new StallDetector();
    d.reset(0);
    expect(d.idleCheck(16000)).not.toBeNull();
    expect(d.idleCheck(25000)).toBeNull(); // too soon after the first
    d.noteServerFrame(26000); // the agent answered the check-in…
    expect(d.idleCheck(37000)).toBeNull(); // …gap and 15 s not yet up
    expect(d.idleCheck(42000)).not.toBeNull(); // second and last
    d.noteServerFrame(43000);
    expect(d.idleCheck(80000)).toBeNull(); // no third, however long it stays quiet
    expect(IDLE_CHECKIN_MAX).toBe(2);
  });

  it('the user speaking again starts a fresh allowance', () => {
    const d = new StallDetector();
    d.reset(0);
    d.idleCheck(16000);
    d.idleCheck(40000);
    expect(d.idleCheck(80000)).toBeNull();
    d.noteUserActivity();
    d.noteServerFrame(81000);
    expect(d.idleCheck(97000)).not.toBeNull();
  });
});
