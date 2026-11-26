import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Header } from './Header';

// Mocked fetch: no real network is used.
const fetchMock = vi.fn<typeof fetch>();

// Renders the header on /trips, with a probe route for /login to check navigation.
function renderHeader(props: { loggedIn: boolean; onLoggedOut?: () => void }) {
  render(
    <MemoryRouter initialEntries={['/trips']}>
      <Routes>
        <Route path="/trips" element={<Header {...props} />} />
        <Route path="/login" element={<h2>Log in screen</h2>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F1 Header', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('F1.AC7 clicking Log out calls logout and navigates to the Log in screen', async () => {
    const user = userEvent.setup();
    const onLoggedOut = vi.fn();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    renderHeader({ loggedIn: true, onLoggedOut });

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in screen' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }));
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it('F1.AC7 the Log out button is absent when logged out', () => {
    renderHeader({ loggedIn: false });

    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('F1.AC7 a failed logout shows an error and stays on the page', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    renderHeader({ loggedIn: true });

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Something went wrong. Please try again.');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Log in screen' })).toBeNull();
  });
});
