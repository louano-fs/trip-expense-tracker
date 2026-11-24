import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, register } from '../api/client';
import { PasswordField } from '../components/PasswordField';
import { copy } from '../copy';

// Message for a 409 (email already has an account). "Log in" links to the Log in screen.
const emailTakenMessage: ReactNode = (
  <>
    {copy.emailTakenBefore}
    <Link to="/login">{copy.linkToLogIn}</Link>
    {copy.emailTakenAfter}
  </>
);

// Register screen (F1.R1 to F1.R5). The server checks the rules; this screen
// shows each rejection next to its field. Only empty fields are checked here.
export interface RegisterProps {
  /** Called after a successful registration so the app knows a session is live (F1.AC1). */
  onRegistered?: () => void;
}

export function Register({ onRegistered }: RegisterProps = {}) {
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<ReactNode>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const emailMissing = email.trim() === '';
    const passwordMissing = password === '';
    setFormError(null);
    setEmailError(emailMissing ? copy.emailEmpty : null);
    setPasswordError(passwordMissing ? copy.passwordEmpty : null);
    if (emailMissing || passwordMissing) {
      (emailMissing ? emailRef : passwordRef).current?.focus();
      return;
    }

    setBusy(true);
    try {
      await register(email, password);
      onRegistered?.();
      navigate('/trips', { replace: true });
    } catch (error) {
      // The server rejected the registration. Show the reason next to its field,
      // keep the typed email, clear the password, and move focus to the first error.
      let focusEmail = false;
      setEmailError(null);
      setPasswordError(null);
      setFormError(null);
      if (error instanceof ApiError && error.status === 409) {
        setEmailError(emailTakenMessage);
        focusEmail = true;
      } else if (error instanceof ApiError && error.status === 400 && error.field === 'email') {
        setEmailError(error.message);
        focusEmail = true;
      } else if (error instanceof ApiError && error.status === 400 && error.field === 'password') {
        setPasswordError(error.message);
      } else {
        setFormError(copy.genericError);
      }
      setPassword('');
      (focusEmail ? emailRef : passwordRef).current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const passwordDescribedBy = ['register-password-hint', passwordError !== null ? 'register-password-error' : null]
    .filter((id): id is string => id !== null)
    .join(' ');

  return (
    <section>
      <h2>{copy.registerHeading}</h2>
      <form onSubmit={handleSubmit} noValidate>
        {formError !== null && (
          <p role="alert" id="register-form-error">
            {formError}
          </p>
        )}
        <div>
          <label htmlFor="register-email">{copy.emailLabel}</label>
          <input
            id="register-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError !== null}
            aria-describedby={emailError !== null ? 'register-email-error' : undefined}
          />
          {emailError !== null && <p id="register-email-error">{emailError}</p>}
        </div>
        <div>
          <PasswordField
            id="register-password"
            label={copy.passwordLabel}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            inputRef={passwordRef}
            invalid={passwordError !== null}
            describedBy={passwordDescribedBy}
          />
          <p id="register-password-hint">{copy.passwordLengthHint}</p>
          {passwordError !== null && <p id="register-password-error">{passwordError}</p>}
        </div>
        <button type="submit" disabled={busy}>
          {busy ? copy.registerBusy : copy.registerSubmit}
        </button>
      </form>
      <p>
        {copy.registerPrompt} <Link to="/login">{copy.linkToLogIn}</Link>
      </p>
    </section>
  );
}
