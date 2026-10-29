/**
 * "Continue where you left off": what the website journey tells the app about a visitor, and where
 * that sends them after login. Pure, so the routing rules are unit-tested (__tests__/resume.test.ts).
 *
 * The server builds the payload (server/src/lib/journeyResume.ts). The PAN is never part of it.
 */
export type ResumeStep = 'otp_only' | 'pan_done' | 'application_started' | 'unknown';

export interface Resume {
  token: string;
  firstName: string | null;
  /** 10-digit mobile, used to pre-fill the login. */
  phone: string;
  lastStep: ResumeStep;
  /** `link`: the install was matched to the visitor's own link. `login`: found by phone after login.
   *  `network`: matched by network address only (a strong guess, not proof): the step they reached, but no phone or name. */
  source: 'link' | 'login' | 'network';
}

const STEPS: readonly string[] = ['otp_only', 'pan_done', 'application_started']; // 'unknown' is only ever made locally

/** Validate the server's snake_case payload; anything malformed is ignored rather than trusted. */
export function parseResume(raw: unknown, source: Resume['source']): Resume | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const phone = typeof r.phone === 'string' ? r.phone.replace(/\D/g, '').slice(-10) : '';
  const lastStep = typeof r.last_step === 'string' ? r.last_step : '';
  if (!/^[6-9]\d{9}$/.test(phone) || !STEPS.includes(lastStep) || typeof r.token !== 'string') return null;
  const name = typeof r.first_name === 'string' ? r.first_name.trim().slice(0, 40) : '';
  return { token: r.token, firstName: name || null, phone, lastStep: lastStep as ResumeStep, source };
}

/**
 * The install matched a link by network address only (the server's `resume_hint`). The server sends the step that
 * journey reached (`hint_last_step`) but no phone and no name, so the login stays empty and the agent can say where they
 * stopped and ask for the number. The real journey, and whether it is theirs, is looked up for the account that signs in.
 */
export const networkResume = (lastStep: ResumeStep): Resume => ({ token: '', firstName: null, phone: '', lastStep, source: 'network' });

/**
 * What a first-launch install claim means for the app:
 *  - a deterministic match (clipboard / Play referrer) carries the visitor's own details;
 *  - a same-network match carries only the step reached;
 *  - anything else: null, and the app behaves as for any new person (the normal introduction). The app never asks
 *    "did you start something on our website?" as a guess.
 */
export function resumePatchFromClaim(claim: { resume?: unknown; resume_hint?: boolean; hint_last_step?: unknown } | null | undefined) {
  const resume = parseResume(claim?.resume, 'link');
  if (resume) return { resume, resumePrompt: 'welcome' as const, resumeStage: 'pre_login' as ResumeStage };
  const step = typeof claim?.hint_last_step === 'string' ? claim.hint_last_step : '';
  if (claim?.resume_hint === true && STEPS.includes(step)) {
    return { resume: networkResume(step as ResumeStep), resumePrompt: 'welcome' as const, resumeStage: 'pre_login_ask_number' as ResumeStage };
  }
  return null;
}

/**
 * Where a resumed visitor lands right after OTP:
 *  - PAN done on the website → step 2 (the details screen), PAN already on file.
 *  - Only the OTP was done → Home, and we offer to start the application.
 *  - An application already exists (or nothing to resume) → the normal flow.
 */
export type ResumeDestination = 'step2' | 'home_offer' | 'normal';

export function resumeDestination(resume: Resume | null, alreadyOnboarded: boolean): ResumeDestination {
  if (!resume || alreadyOnboarded) return 'normal';
  if (resume.lastStep === 'pan_done') return 'step2';
  if (resume.lastStep === 'otp_only') return 'home_offer';
  return 'normal';
}

/** The masked PAN the server returns for a PAN already on file ("XXXXXX234A"): never a real PAN. */
export const isMaskedPan = (v: string | null | undefined) => /^X{6}\d{3}[A-Z]$/.test(String(v ?? ''));

/**
 * What the voice agent is told, so it speaks to the right moment of the journey.
 * `pre_login`: the login already has the number. `pre_login_ask_number`: the agent started by itself on a deterministic
 * link match and the login is empty: it greets by name, says where they stopped, and asks for the number.
 */
export type ResumeStage = 'pre_login' | 'pre_login_ask_number' | 'resumed_at_step_2' | 'offer_start_application';

export function agentResumeContext(
  resume: Resume | null,
  stage: ResumeStage,
): { stage: ResumeStage; first_name: string | null; last_step: ResumeStep; phone_prefilled: boolean } | undefined {
  if (!resume) return undefined;
  return { stage, first_name: resume.firstName, last_step: resume.lastStep, phone_prefilled: stage === 'pre_login' };
}
