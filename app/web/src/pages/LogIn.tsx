import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, login } from '../api/client';
import { PasswordField } from '../components/PasswordField';
import { copy, throttledMessage } from '../copy';

interface LogInErrors {
  email?: string;
  password?: string;
  form?: string;
}

// Checks the fields before any request is sent.
function checkFields(email: string, password: string): LogInErrors {
  const errors: LogInErrors = {};
  if (email.trim() === '') errors.email = copy.emailEmpty;
  if (password === '') errors.password = copy.passwordEmpty;
  return errors;
}

// Turns a failed login request into the one message the screen shows.
// A wrong email and a wrong password give the same message (F1.R6).
function formErrorFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return copy.loginFailed;
    if (error.status === 429 && error.retryAfterSeconds !== null) {
      return throttledMessage(error.retryAfterSeconds);
    }
  }
  return copy.genericError;
}

// Log in screen (F1.R6). After a successful login it always goes to Trips,
// even when the visitor was redirected here from another page (F1.AC13).
export function LogIn() {
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LogInErrors>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const fieldErrors = checkFields(email, password);
    if (fieldErrors.email !== undefined || fieldErrors.password !== undefined) {
      setErrors(fieldErrors);
      (fieldErrors.email !== undefined ? emailRef : passwordRef).current?.focus();
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await login(email, password);
      navigate('/trips', { replace: true });
    } catch (error) {
      // Keep the typed email, clear the password, and move focus to it.
      setErrors({ form: formErrorFor(error) });
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>{copy.logInHeading}</h2>
      <form onSubmit={handleSubmit} noValidate>
        {errors.form !== undefined && (
          <p role="alert" id="login-form-error">
            {errors.form}
          </p>
        )}
        <div>
          <label htmlFor="login-email">{copy.emailLabel}</label>
          <input
            id="login-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errors.email !== undefined}
            aria-describedby={errors.email !== undefined ? 'login-email-error' : undefined}
          />
          {errors.email !== undefined && <p id="login-email-error">{errors.email}</p>}
        </div>
        <div>
          <PasswordField
            id="login-password"
            label={copy.passwordLabel}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            inputRef={passwordRef}
            invalid={errors.password !== undefined}
            describedBy={errors.password !== undefined ? 'login-password-error' : undefined}
          />
          {errors.password !== undefined && <p id="login-password-error">{errors.password}</p>}
        </div>
        <button type="submit" disabled={busy}>
          {busy ? copy.logInBusy : copy.logInSubmit}
        </button>
      </form>
      <p>
        {copy.logInPrompt} <Link to="/register">{copy.linkToRegister}</Link>
      </p>
    </section>
  );
}
