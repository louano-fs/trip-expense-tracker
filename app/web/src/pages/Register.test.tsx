import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Register } from './Register';
import { Trips } from './Trips';

// Builds a JSON response for the mocked fetch. No real network is used.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderRegister() {
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<p>Log in page</p>} />
        <Route path="/trips" element={<Trips />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F1 Register screen', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('F1.AC1 a successful registration lands on the Trips screen', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(201, { user: { id: 1, email: 'sam@mail.com' } }));
    renderRegister();

    await user.type(screen.getByLabelText('Email'), 'sam@mail.com');
    await user.type(screen.getByLabelText('Password'), 'my secret phrase here');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/register', expect.objectContaining({ method: 'POST' }));
  });

  it('F1.AC24 "Show password" changes the input type and the label to "Hide password"', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Password'), 'my secret phrase here');
    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });

  it('F1.AC24 does not block paste: the paste event is not prevented', () => {
    renderRegister();

    const notPrevented = fireEvent.paste(screen.getByLabelText('Password'), {
      clipboardData: { getData: () => 'my secret phrase here' },
    });

    expect(notPrevented).toBe(true);
  });

  it('F1.AC24 pasted text is kept in the Password field', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByLabelText('Password'));
    await user.paste('my secret phrase here');

    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('my secret phrase here');
  });

  it('F1.R3 shows the length hint under the Password field, linked with aria-describedby', () => {
    renderRegister();

    const hint = screen.getByText('At least 15 characters');
    const password = screen.getByLabelText('Password');
    expect(hint.id).toBe('register-password-hint');
    expect(password.getAttribute('aria-describedby')).toContain('register-password-hint');
  });

  it('F1.AC2 a registration with an email that has an account shows the taken message with a Log in link', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: 'An account with this email already exists. Log in instead.',
        field: 'email',
      }),
    );
    renderRegister();

    await user.type(screen.getByLabelText('Email'), 'SAM@Mail.com');
    await user.type(screen.getByLabelText('Password'), 'my secret phrase here');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const email = screen.getByLabelText('Email');
    await screen.findByText(/already exists/);
    expect(email.getAttribute('aria-describedby')).toBe('register-email-error');
    const errorText = document.getElementById('register-email-error');
    expect(errorText).not.toBeNull();
    expect(within(errorText as HTMLElement).getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
    expect((email as HTMLInputElement).value).toBe('SAM@Mail.com');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('F1.AC3 a password the server rejects as too short is shown on the Password field and cleared', async () => {
    const user = userEvent.setup();
    const message = 'Password must be at least 15 characters. A short phrase is easy to remember.';
    fetchMock.mockResolvedValue(jsonResponse(400, { error: message, field: 'password' }));
    renderRegister();

    await user.type(screen.getByLabelText('Email'), 'sam@mail.com');
    await user.type(screen.getByLabelText('Password'), 'too short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await screen.findByText(message);
    const password = screen.getByLabelText('Password');
    expect(password.getAttribute('aria-describedby')).toContain('register-password-error');
    expect((password as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('sam@mail.com');
  });

  it('F1 Accessibility: empty fields show errors, focus the email field, and send no request', async () => {
    // Not an AC: this checks the Accessibility rule that errors link to their field
    // and that focus moves to the first field with an error.
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const email = screen.getByLabelText('Email');
    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(email.getAttribute('aria-describedby')).toBe('register-email-error');
    expect(document.activeElement).toBe(email);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
