/**
 * Password policy shared by every form that sets a password. Mirrors the
 * server-side rule in app/Rules/StrongPassword.php -- the server is the
 * authority, this just gives instant feedback before the request is sent.
 *
 *   8+ characters (max 64), at least one lowercase, one uppercase, one digit and
 *   one special character, no spaces.
 */
export const PASSWORD_MIN = 8;
// 64 is a sanity cap (bcrypt only uses the first 72 bytes anyway).
export const PASSWORD_MAX = 64;

export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 8 characters and include a lowercase letter, an uppercase letter, a number, and a special character (no spaces).";

export interface PasswordCheck {
  key: "length" | "lower" | "upper" | "number" | "special";
  label: string;
  ok: boolean;
}

export function checkPassword(pw: string): PasswordCheck[] {
  return [
    { key: "length", label: `At least ${PASSWORD_MIN} characters, no spaces`, ok: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX && !/\s/.test(pw) },
    { key: "lower", label: "Lowercase letter (a-z)", ok: /[a-z]/.test(pw) },
    { key: "upper", label: "Uppercase letter (A-Z)", ok: /[A-Z]/.test(pw) },
    { key: "number", label: "Number (0-9)", ok: /\d/.test(pw) },
    { key: "special", label: "Special character (!@#$%…)", ok: /[^A-Za-z0-9\s]/.test(pw) },
  ];
}

export const isStrongPassword = (pw: string): boolean => checkPassword(pw).every((c) => c.ok);
