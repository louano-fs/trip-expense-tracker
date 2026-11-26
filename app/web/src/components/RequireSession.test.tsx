import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LogIn } from '../pages/LogIn';
import { TripPage } from '../pages/TripPage';
import { RequireSession } from './RequireSession';

// A trip name that only the trip page renders. The tests check it never appears on a 401.
const TRIP_NAME = 'Lisbon';
const EXPIRED_TEXT = 'Your session has expired. Please log in again.';

// Builds a JSON response for the mocked fetch. No real network is used.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Renders the trip route at /trips/1 with the real Log in screen at /login.
function renderTripRoute(onSessionChange?: (live: boolean) => void) {
  render(
    <MemoryRouter initialEntries={['/trips/1']}>
      <Routes>
        <Route path="/trips/:id" element={<TripPage onSessionChange={onSessionChange} />} />
        <Route path="/login" element={<LogIn />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F1 RequireSession route guard', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('F1.AC9 a 401 with no reason redirects to the Log in screen and renders no trip content', async () => {
    const onSessionChange = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    renderTripRoute(onSessionChange);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: TRIP_NAME })).toBeNull();
    expect(screen.queryByText(EXPIRED_TEXT)).toBeNull();
    expect(onSessionChange).toHaveBeenCalledWith(false);
  });

  it('F1.AC9 renders no child content before the API answers', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));

    renderTripRoute();

    expect(screen.queryByRole('heading', { name: TRIP_NAME })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('F1.AC23 a 401 with reason expired redirects to the Log in screen with the expired notice', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized', reason: 'expired' }));

    renderTripRoute();

    expect(await screen.findByText(EXPIRED_TEXT)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: TRIP_NAME })).toBeNull();
  });

  it('F1.AC9 a 401 whose body is not JSON redirects without the expired notice', async () => {
    fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    renderTripRoute();

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByText(EXPIRED_TEXT)).toBeNull();
    expect(screen.queryByRole('heading', { name: TRIP_NAME })).toBeNull();
  });

  it('F1.AC10 a live session shows the trip page, does not redirect, and calls the trip route', async () => {
    const onSessionChange = vi.fn();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { trip: { id: 1, name: TRIP_NAME, createdAt: '2026-11-15T10:00:00.000Z' } }),
    );

    renderTripRoute(onSessionChange);

    expect(await screen.findByRole('heading', { name: TRIP_NAME })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
    expect(onSessionChange).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trips',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('F1.AC9 a 404 from the trip route shows an error and renders no trip content', async () => {
    const onSessionChange = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Trip not found.' }));

    renderTripRoute(onSessionChange);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Something went wrong. Please try again.');
    expect(screen.queryByRole('heading', { name: TRIP_NAME })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
    expect(onSessionChange).not.toHaveBeenCalledWith(true);
  });

  it('F1.AC9 a failed request shows an error and renders no trip content', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));

    renderTripRoute();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Something went wrong. Please try again.');
    expect(screen.queryByRole('heading', { name: TRIP_NAME })).toBeNull();
  });

  it('F1.AC9 RequireSession passes children through once the load resolves live', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    render(
      <RequireSession load={() => fetchMock('/api/trips/1')}>
        <p>Guarded content</p>
      </RequireSession>,
    );

    expect(await screen.findByText('Guarded content')).toBeTruthy();
  });
});
