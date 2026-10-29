// Tells when the agent is audibly talking, from the WebRTC receiver's stats.
//
// The websocket transport knows this from its own audio chunks, and the app depends on it: a page-context update
// that lands while the agent is mid-sentence is treated by the server as a barge-in and cuts it off, so updates are
// held back while the status is 'speaking' (ElloAgent.flushPageContext). Over WebRTC the audio never passes through
// JS, so the level has to be read from getStats(). Pure so it is unit-tested.

/** Reads the remote (agent) audio level, 0..1, from an RTCStatsReport. Null when the report has no usable audio stat. */
export class RemoteAudioLevel {
  private prevEnergy: number | null = null;
  private prevDuration: number | null = null;

  reset(): void {
    this.prevEnergy = null;
    this.prevDuration = null;
  }

  read(report: unknown): number | null {
    const stats: any[] = [];
    const r = report as any;
    if (r && typeof r.forEach === 'function') r.forEach((v: any) => stats.push(v));
    else if (r && typeof r === 'object') stats.push(...Object.values(r));
    const inbound = stats.find(s => s && s.type === 'inbound-rtp' && (s.kind === 'audio' || s.mediaType === 'audio'));
    if (!inbound) return null;
    if (typeof inbound.audioLevel === 'number') return Math.max(0, Math.min(1, inbound.audioLevel));
    // No instantaneous level on this platform: derive one from the energy counters between two reads.
    const e = inbound.totalAudioEnergy;
    const d = inbound.totalSamplesDuration;
    if (typeof e !== 'number' || typeof d !== 'number') return null;
    const pe = this.prevEnergy;
    const pd = this.prevDuration;
    this.prevEnergy = e;
    this.prevDuration = d;
    if (pe === null || pd === null || d <= pd) return null;
    return Math.max(0, Math.min(1, Math.sqrt(Math.max(0, e - pe) / (d - pd))));
  }
}

/** Debounces a level into speaking / quiet: loud counts at once, quiet only after `hangMs` without anything loud. */
export class SpeakingMeter {
  private speaking = false;
  private lastLoud = 0;

  constructor(private threshold = 0.01, private hangMs = 700) {}

  reset(): void {
    this.speaking = false;
    this.lastLoud = 0;
  }

  /** Returns the NEW state (true = started speaking, false = went quiet) when it changed, otherwise null. */
  push(level: number, now: number): boolean | null {
    if (level >= this.threshold) {
      this.lastLoud = now;
      if (!this.speaking) {
        this.speaking = true;
        return true;
      }
      return null;
    }
    if (this.speaking && now - this.lastLoud >= this.hangMs) {
      this.speaking = false;
      return false;
    }
    return null;
  }
}
