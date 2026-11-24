import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LogIn } from './LogIn';
import { Trips } from './Trips';

// Builds a JSON response for the mocked fetch. No real network is used.
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// Renders the Log in screen at /login. The optional state mimics a redirect
// from a trip page (F1.R9).
function renderLogIn(state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LogIn />} />
        <Route path="/trips" element={<Trips />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('F1 LogIn screen', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('F1.AC13 after a redirect from a trip page, a successful login lands on the Trips screen', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(200, { user: { id: 1, email: 'sam@mail.com' } }));
    renderLogIn({ from: '/trips/1' });

    await fillAndSubmit(user, 'sam@mail.com', 'my secret phrase here');

    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST' }));
  });

  it('F1.AC6 a wrong login shows the general message, keeps the email and clears the password', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Email or password is incorrect.' }));
    renderLogIn();

    await fillAndSubmit(user, 'sam@mail.com', 'wrong password here');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Email or password is incorrect.');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('sam@mail.com');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeTruthy();
  });

  it('F1.AC19 a throttled login shows the wait message and clears the password', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: 'Too many failed attempts.' }, { 'Retry-After': '30' }),
    );
    renderLogIn();

    await fillAndSubmit(user, 'sam@mail.com', 'my secret phrase here');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Too many failed attempts. Try again in 30 seconds.');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('F1 Loading: Submit is disabled while the request runs, so a double click sends one request', async () => {
    // Not an AC: this checks the Loading rule in the spec's States & errors section.
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));
    renderLogIn();

    await fillAndSubmit(user, 'sam@mail.com', 'my secret phrase here');

    const button = screen.getByRole('button', { name: 'Logging in...' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('F1 Accessibility: empty fields show errors linked with aria-describedby, focus the email field, and send no request', async () => {
    // Not an AC: this checks the Accessibility rule that errors link to their field
    // and that focus moves to the first field with an error.
    const user = userEvent.setup();
    renderLogIn();

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(email.getAttribute('aria-describedby')).toBe('login-email-error');
    expect(password.getAttribute('aria-describedby')).toBe('login-password-error');
    expect(document.activeElement).toBe(email);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('F1.AC23 after an expired session, the Log in screen shows the expired notice', () => {
    renderLogIn({ notice: 'expired' });

    expect(screen.getByText('Your session has expired. Please log in again.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeTruthy();
  });

  it('F1.AC9 a redirect with no notice shows the Log in screen without the expired notice', () => {
    renderLogIn();

    expect(screen.queryByText('Your session has expired. Please log in again.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeTruthy();
  });
});
