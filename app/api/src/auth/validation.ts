// Email and password rules (F1.R2, F1.R3). Plain functions, no I/O.

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

// Copy from docs/specs/features/F1-registration-and-login.md, "States & errors".
export const MESSAGES = {
  emailEmpty: 'Enter your email address.',
  emailInvalid: 'Enter a valid email address, like name@example.com.',
  passwordEmpty: 'Enter your password.',
  passwordTooShort: 'Password must be at least 15 characters. A short phrase is easy to remember.',
  passwordTooLong: 'Password must be 128 characters or fewer.',
} as const;

// Simple shape check: something, an @, something, a dot, something. No spaces or extra @.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailResult =
  | { ok: true; email: string }
  | { ok: false; field: 'email'; message: string };

export type PasswordResult =
  | { ok: true; password: string }
  | { ok: false; field: 'password'; message: string };

/** Trims spaces at both ends and lowercases. Stored and compared in this form (F1.R2). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Checks a normalized email: format and length of at most 254 characters (F1.R2, F1.AC4). */
export function validateEmail(normalized: string): EmailResult {
  if (normalized === '') {
    return { ok: false, field: 'email', message: MESSAGES.emailEmpty };
  }
  if (normalized.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalized)) {
    return { ok: false, field: 'email', message: MESSAGES.emailInvalid };
  }
  return { ok: true, email: normalized };
}

/**
 * Checks the password length (F1.R3, F1.AC3, F1.AC16).
 * Converts to NFC, never trims, and counts Unicode code points.
 * The returned password is the NFC form, which is what gets hashed.
 */
export function validatePasswordLength(password: string): PasswordResult {
  const nfc = password.normalize('NFC');
  if (nfc === '') {
    return { ok: false, field: 'password', message: MESSAGES.passwordEmpty };
  }
  const length = [...nfc].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return { ok: false, field: 'password', message: MESSAGES.passwordTooShort };
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return { ok: false, field: 'password', message: MESSAGES.passwordTooLong };
  }
  return { ok: true, password: nfc };
}
