import { describe, it, expect } from 'vitest';
import { journeyNameFor, APP_EVENT_TO_JOURNEY, APP_COMPLETION_EVENTS } from './appEventMap.js';
import { JOURNEY_EVENTS, stageForEvent } from './journey.js';

/**
 * The mobile app's funnel-event names are a contract with this map. A name the app
 * emits but this map does not know becomes an ActivityEvent only — invisible to the
 * journey timeline, the stage machine and every stall rule. That is not a loud
 * failure; it is silence, and it has already happened once (three of six stall rules
 * could not fire because no canonical event ever arrived from a handset).
 *
 * The list below mirrors FUNNEL_EVENTS + the lifecycle events in
 * src/state/store.ts of the mobile app. The app has the reverse assertion in
 * __tests__/store.test.ts, so a rename on either side breaks a test rather than
 * quietly dropping events.
 */
const APP_EMITS_AS_FUNNEL_STEPS = [
  // lifecycle
  'app_opened',
  'language_selected',
  // application funnel — canonical names the app sends today…
  'eligibility_started',
  'offer_viewed',
  'offer_selected',
  'kyc_started',
  'kyc_submitted',
  'application_submitted',
  'loan_disbursed',
  // …and the legacy names still arriving from already-installed handsets.
  'application_started',
  'prequalify_started',
  'offers_viewed',
];

/** Names the app deliberately keeps as telemetry — these must NOT reach the funnel. */
const TELEMETRY_ONLY = ['pan_submitted', 'repayment_viewed', 'credit_score_viewed'];

describe('appEventMap covers everything the mobile app emits', () => {
  it.each(APP_EMITS_AS_FUNNEL_STEPS)('translates %s', (name) => {
    expect(journeyNameFor(name)).not.toBeNull();
  });

  it.each(TELEMETRY_ONLY)('leaves %s as telemetry', (name) => {
    expect(journeyNameFor(name)).toBeNull();
  });

  it('accepts the canonical name for every event it maps to', () => {
    // Identity coverage. Without it the app cannot be migrated to the canonical
    // vocabulary: `eligibility_started` was mapped to by two legacy keys but was not
    // itself a key, so an app emitting it would have dropped out of the funnel.
    const targets = new Set(
      [...Object.values(APP_EVENT_TO_JOURNEY), ...Object.values(APP_COMPLETION_EVENTS)],
    );
    const missing = [...targets].filter((canonical) => journeyNameFor(canonical) === null);
    expect(missing).toEqual([]);
  });

  it('maps each name to a real journey event', () => {
    const known = new Set<string>(Object.values(JOURNEY_EVENTS));
    for (const name of APP_EMITS_AS_FUNNEL_STEPS) {
      expect(known.has(String(journeyNameFor(name)))).toBe(true);
    }
  });

  it('a single KYC document reports KYC_STARTED, never KYC_COMPLETED', () => {
    // The app fires kyc_submitted from each document screen. Treating one document as
    // completion would satisfy the "KYC started but never finished" rule and hide the
    // customer it exists to catch.
    expect(journeyNameFor('kyc_submitted')).toBe(JOURNEY_EVENTS.KYC_STARTED);
  });

  it('the stage-advancing names actually move the stage machine', () => {
    // A mapped name that no stage responds to would still leave the funnel stuck.
    for (const name of ['offer_viewed', 'offer_selected', 'application_submitted', 'kyc_completed', 'loan_disbursed']) {
      const canonical = journeyNameFor(name);
      expect(canonical).not.toBeNull();
      expect(stageForEvent(String(canonical))).not.toBeNull();
    }
  });

  it('"started" events land on the timeline without advancing a stage', () => {
    // Deliberate: only completion moves the funnel. If `eligibility_started` advanced
    // the stage, arriving on the loan-basics form would count as having passed the
    // eligibility check and would silence the rule that chases people who never
    // finished it. It still appears on the 360 timeline.
    expect(journeyNameFor('eligibility_started')).toBe(JOURNEY_EVENTS.ELIGIBILITY_STARTED);
    expect(stageForEvent(JOURNEY_EVENTS.ELIGIBILITY_STARTED)).toBeNull();
    expect(stageForEvent(JOURNEY_EVENTS.KYC_STARTED)).not.toBeNull(); // kyc_started IS a stage
  });
});
