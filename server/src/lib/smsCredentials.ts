/**
 * Which Vox credentials the SMS (stuck-stage, reminder, "you applied", drop-off) are sent with.
 *
 * WhatsApp lives on one Vox project and the login OTP SMS on another. The SMS sender (PTSLA), its DLT templates and the SMS route are
 * on the OTP project (Narendra), not on the project WhatsApp uses, so Vox refuses SMS sent as the WhatsApp project with
 * "Error mapping routing strategy". With `smsUseOtpCredentials` on, SMS go out with the OTP project's token and project ID (the
 * `VOX_AUTH_TOKEN` and `VOX_PROJECT_ID` already on the server for the OTP) and WhatsApp is not touched. Off (the default) keeps the
 * integration's own credentials.
 */
export interface SmsCreds { token: string; projectId: string; source: 'otp' | 'integration' }

const truthy = (v: unknown) => v === true || String(v ?? '').trim().toLowerCase() === 'true';

export function smsCredentials(
  settings: Record<string, unknown>,
  secrets: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env,
): SmsCreds {
  const otpToken = String(env.VOX_AUTH_TOKEN ?? '').trim();
  const otpProject = String(env.VOX_PROJECT_ID ?? '').trim();
  if (truthy(settings.smsUseOtpCredentials) && otpToken && otpProject) return { token: otpToken, projectId: otpProject, source: 'otp' };
  return {
    token: String(secrets.authToken ?? secrets.apiKey ?? '').trim(),
    projectId: String(settings.projectId ?? '').trim(),
    source: 'integration',
  };
}
