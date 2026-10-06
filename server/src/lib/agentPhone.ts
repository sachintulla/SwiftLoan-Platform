/**
 * Reads the phone number an Ello agent tool sends us.
 *
 * Ello fills a tool's request body from its own call variables. When a call has no phone
 * yet (a visitor who has not signed in, or a call started before OTP), the variable is not
 * substituted and our API receives the literal template text — e.g.
 * `{"phone_number":"{context_data.phone_number}"}` — which used to be answered with
 * 400 "phone is required". That fails the agent's tool call and derails the conversation,
 * although nothing is actually wrong: there is simply no phone *yet*.
 *
 *   ok       a usable number (last 10 digits are used, so +91 / spaces / dashes are fine)
 *   pending  nothing sent, or an unfilled template/null placeholder -> "no phone yet"
 *   invalid  something was sent but it is not a 10-digit number -> a real client error
 */
export type AgentPhone =
  | { kind: 'ok'; phone: string }
  | { kind: 'pending' }
  | { kind: 'invalid' };

const PLACEHOLDER = /^\s*\{\{?[^{}]*\}?\}\s*$/; // {x}, {{x}}, {context_data.phone_number}
const NULLISH = /^\s*(null|undefined|none|nan)?\s*$/i;

export function parseAgentPhone(raw: unknown): AgentPhone {
  if (raw === undefined || raw === null) return { kind: 'pending' };
  const text = String(raw);
  if (NULLISH.test(text) || PLACEHOLDER.test(text)) return { kind: 'pending' };
  const digits = text.replace(/\D/g, '');
  return digits.length >= 10 ? { kind: 'ok', phone: digits.slice(-10) } : { kind: 'invalid' };
}
