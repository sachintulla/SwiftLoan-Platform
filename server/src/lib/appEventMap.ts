/**
 * WS11 — translate the mobile app's telemetry names into canonical journey events.
 *
 * The gap this closes: the app has always sent its funnel events to
 * `/api/track/event`, but that endpoint only ever wrote an `ActivityEvent`. The
 * admin funnel, the stage progression and every stall rule read `JourneyEvent`,
 * so from their point of view the app had produced nothing — verified against the
 * database, where *every* canonical event came from the server and none from a
 * handset. Three of six stall rules could therefore never fire, including the
 * voice-call rule for incomplete KYC, which would have sat enabled and silent.
 *
 * The names also differ (`offers_viewed` vs `offer_viewed`, `kyc_submitted` vs
 * `kyc_completed`), so a rename alone would not have been enough.
 *
 * Mapping here rather than in the app matters: it works for handsets already
 * installed, with no store release.
 */
import { JOURNEY_EVENTS } from './journey.js';

/**
 * app telemetry name → canonical journey event.
 *
 * Only events that mean a real funnel step are mapped. Screen views, page views
 * and diagnostics stay telemetry-only: promoting those would inflate the funnel
 * and, worse, satisfy a stall rule's "expected" event so a genuinely stuck
 * customer would look like they had moved on.
 */
export const APP_EVENT_TO_JOURNEY: Record<string, string> = {
  // ── onboarding ──
  app_opened: JOURNEY_EVENTS.APP_OPENED,
  language_selected: JOURNEY_EVENTS.LANGUAGE_SELECTED,

  // ── application funnel ──
  // `eligibility_started` is the canonical name and is accepted as-is. It was missing:
  // every key that mapped to ELIGIBILITY_STARTED was a legacy app name, so a handset
  // emitting the canonical vocabulary would have fallen through to telemetry-only and
  // stopped advancing the eligibility stage. Identity entries let the map accept both
  // the legacy and the canonical name, which is what makes migrating the app safe
  // without stranding handsets that are already installed.
  eligibility_started: JOURNEY_EVENTS.ELIGIBILITY_STARTED,
  application_started: JOURNEY_EVENTS.ELIGIBILITY_STARTED,
  prequalify_started: JOURNEY_EVENTS.ELIGIBILITY_STARTED,
  // Reaching the offers screen means pre-qualification produced something.
  offers_viewed: JOURNEY_EVENTS.OFFER_VIEWED,
  offer_viewed: JOURNEY_EVENTS.OFFER_VIEWED,
  offer_selected: JOURNEY_EVENTS.OFFER_SELECTED,

  // ── KYC ──
  kyc_started: JOURNEY_EVENTS.KYC_STARTED,
  // The app fires `kyc_submitted` from each individual document screen
  // (aadhaar / pan / bank / selfie). Submitting one document is not completing
  // KYC, so it maps to STARTED — otherwise arriving on the Aadhaar screen would
  // instantly satisfy "KYC started but not completed" and silence the rule that
  // exists to catch exactly that person.
  kyc_submitted: JOURNEY_EVENTS.KYC_STARTED,

  // ── outcome ──
  application_submitted: JOURNEY_EVENTS.APPLICATION_SUBMITTED,
  loan_disbursed: JOURNEY_EVENTS.LOAN_DISBURSED,
};

/**
 * Events that genuinely COMPLETE a step.
 *
 * Kept separate and deliberately small. Completion is what stall rules look for,
 * so a wrong entry here permanently hides a drop-off — a much worse failure than
 * a missing one, which merely leaves a rule quiet.
 */
export const APP_COMPLETION_EVENTS: Record<string, string> = {
  eligibility_completed: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED,
  kyc_completed: JOURNEY_EVENTS.KYC_COMPLETED,
  loan_approved: JOURNEY_EVENTS.LOAN_APPROVED,
};

/** Canonical name for an app telemetry event, or null to leave it as telemetry. */
export function journeyNameFor(appEventName: string): string | null {
  const key = String(appEventName ?? '').trim().toLowerCase();
  return APP_COMPLETION_EVENTS[key] ?? APP_EVENT_TO_JOURNEY[key] ?? null;
}
