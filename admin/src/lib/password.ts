// Client-side mirror of the server's password policy (server rejects with a 400 and
// the reason). These are hints only — the server stays the authority.

export interface PasswordRule { key: string; label: string; ok: boolean }

const PREDICTABLE = [
  'password', 'passw0rd', 'admin', 'swiftloan', 'qwerty', 'letmein',
  'welcome', 'iloveyou', 'changeme', 'abc123', '123456', 'monkey', 'dragon',
];

function looksPredictable(pw: string) {
  const low = pw.toLowerCase();
  if (PREDICTABLE.some((p) => low.includes(p))) return true;
  // long runs of sequential or repeated characters read as predictable too
  if (/(.)\1{3,}/.test(low)) return true;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf)/.test(low)) return true;
  return false;
}

export function passwordRules(pw: string): PasswordRule[] {
  return [
    { key: 'len', label: 'At least 12 characters', ok: pw.length >= 12 },
    { key: 'upper', label: 'An uppercase letter', ok: /[A-Z]/.test(pw) },
    { key: 'lower', label: 'A lowercase letter', ok: /[a-z]/.test(pw) },
    { key: 'digit', label: 'A number', ok: /\d/.test(pw) },
    { key: 'predictable', label: 'Not a predictable word or sequence', ok: pw.length > 0 && !looksPredictable(pw) },
  ];
}

export function passwordOk(pw: string) {
  return passwordRules(pw).every((r) => r.ok);
}
