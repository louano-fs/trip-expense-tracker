// Screen copy for F1, from the "States & errors" and "Accessibility" sections of
// docs/specs/features/F1-registration-and-login.md. Keep wording identical to the spec.

export const copy = {
  emailEmpty: 'Enter your email address.',
  emailInvalid: 'Enter a valid email address, like name@example.com.',
  passwordEmpty: 'Enter your password.',
  passwordTooShort: 'Password must be at least 15 characters. A short phrase is easy to remember.',
  passwordTooLong: 'Password must be 128 characters or fewer.',
  passwordTooCommon: 'This password is too common or easy to guess. Choose a different one.',
  emailTaken: 'An account with this email already exists. Log in instead.',
  loginFailed: 'Email or password is incorrect.',
  sessionExpired: 'Your session has expired. Please log in again.',
  genericError: 'Something went wrong. Please try again.',
  throttledPrefix: 'Too many failed attempts. Try again in ',
  passwordLengthHint: 'At least 15 characters',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  // Added in F1.T11 for the Log in, Register and Trips screens (new copy, for review).
  emailLabel: 'Email',
  passwordLabel: 'Password',
  logInHeading: 'Log in',
  logInSubmit: 'Log in',
  logInBusy: 'Logging in...',
  logInPrompt: 'New here?',
  linkToRegister: 'Create an account',
  registerHeading: 'Create an account',
  registerSubmit: 'Create account',
  registerBusy: 'Creating account...',
  registerPrompt: 'Already have an account?',
  linkToLogIn: 'Log in',
  // emailTaken is split around the "Log in" link on the Register screen.
  emailTakenBefore: 'An account with this email already exists. ',
  emailTakenAfter: ' instead.',
  tripsHeading: 'Trips',
  tripsPlaceholder: 'Your trips will show up here soon.',
} as const;

// Builds the throttle message. The wait is rounded up, as the spec requires:
// "30 seconds", "2 minutes", "1 hour".
export function throttledMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  let wait: string;
  if (seconds >= 3600) {
    wait = '1 hour';
  } else if (seconds > 60) {
    const minutes = Math.ceil(seconds / 60);
    wait = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  } else {
    wait = seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  return `${copy.throttledPrefix}${wait}.`;
}
