// RN replacement for @ello/agent-sdk's security/sensitive.ts. The web version
// sniffs DOM attributes (type=password, autocomplete, name/id/aria-label); RN
// has no DOM, but Field already forwards real TextInput signals
// (secureTextEntry/textContentType/autoComplete), which are more reliable than
// the web version's string-sniffing ever was.
const SENSITIVE_LABEL_RE = /otp|one.?time.?code|pin\b|cvv|cvc|password|passcode|pan\b|aadhaar|card.?number/i;

/**
 * Labels that merely *mention* a sensitive document while asking for something
 * harmless. "Full name (as per PAN)" is a name field, not a PAN number — but a
 * bare /pan\b/ match flagged it, so the agent refused to type the user's own name.
 */
const NOT_ACTUALLY_SECRET_RE = /\b(name|holder|as per)\b/i;

export interface SensitiveFieldProps {
  secureTextEntry?: boolean;
  textContentType?: string;
  autoComplete?: string;
}

export function isSensitiveField(label: string, props: SensitiveFieldProps): boolean {
  // Explicit platform signals are authoritative and always win.
  if (props.secureTextEntry) return true;
  if (props.textContentType && /password|oneTimeCode/i.test(props.textContentType)) return true;
  if (props.autoComplete && /password|sms-otp|one-time-code/i.test(props.autoComplete)) return true;
  // A field asking for a NAME is never the secret itself.
  if (NOT_ACTUALLY_SECRET_RE.test(label)) return false;
  return SENSITIVE_LABEL_RE.test(label);
}

// Same refusal-result shape as the web SDK's FillResult, for parity.
export interface FillResult {
  ok: boolean;
  refused?: true;
  reason?: 'sensitive_field' | 'not_found' | 'not_fillable';
}
