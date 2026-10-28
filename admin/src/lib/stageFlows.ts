// The App and Website tabs of Stage outreach. The server sends each flow as an ordered list of steps (server/src/lib/stageOutreach.ts
// FLOW_STEPS); each step stands on one stage, where the rules, templates and schedules are stored. This turns the server's stages
// into what one tab shows: the step's plain name, and only the follow-ups that apply to that side. Pure, so it is unit-tested.

export type FlowKey = 'app' | 'website';
export type RuleSurface = 'all' | 'app' | 'website';
export const FLOWS: readonly FlowKey[] = ['app', 'website'];
export const FLOW_LABEL: Record<FlowKey, string> = { app: 'App', website: 'Website' };
export const SURFACE_LABEL: Record<RuleSurface, string> = { all: 'App and website', app: 'App only', website: 'Website only' };

export interface FlowStep { key: string; label: string; description: string }

export const ALL_CHANNELS = ['whatsapp', 'sms', 'email', 'voice', 'push'] as const;
type Ch = (typeof ALL_CHANNELS)[number];

/** A follow-up for both sides shows on both tabs; a one-sided one only on its own. */
export function ruleBelongsTo(surface: string | null | undefined, flow: FlowKey): boolean {
  return !surface || surface === 'all' || surface === flow;
}

interface StageLike {
  key: string; label: string; description: string; surface: string;
  activities: Array<{ channel: string; surface?: string }>;
  missingChannels: string[];
}

/**
 * The stages one tab shows, in that flow's order and in its words. A channel can be added on a tab when no follow-up that already
 * covers that side (its own, or one for both) exists on it; adding one beside an 'all' follow-up would send twice to the same person.
 */
export function stagesForFlow<T extends StageLike>(flow: FlowKey, steps: readonly FlowStep[], stages: readonly T[]): T[] {
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const out: T[] = [];
  for (const step of steps) {
    const s = byKey.get(step.key);
    if (!s) continue;
    const activities = s.activities.filter((a) => ruleBelongsTo(a.surface, flow));
    const covered = new Set<string>(activities.map((a) => a.channel));
    out.push({
      ...s,
      label: step.label,
      description: step.description,
      surface: FLOW_LABEL[flow],
      activities,
      missingChannels: (ALL_CHANNELS as readonly Ch[]).filter((c) => !covered.has(c)),
    });
  }
  return out;
}
