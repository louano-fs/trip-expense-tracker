import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { getTrip, type Trip } from '../api/trips';
import { ApiError } from '../api/client';
import { TripPage } from './TripPage';

// The trip API is mocked, so no real network is used. The gate's fetch is stubbed too.
vi.mock('../api/trips', () => ({
  getTrip: vi.fn(),
}));

const getTripMock = vi.mocked(getTrip);

// Noon UTC keeps the expected day the same in every common viewer zone.
const TRIP: Trip = { id: 5, name: 'Lisbon', createdAt: '2026-11-15T12:00:00Z' };

// Builds a JSON response for the stubbed gate fetch.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Renders the trip route at /trips/5, with stub Trips and Log in routes.
function renderTripPage(onSessionChange?: (live: boolean) => void) {
  render(
    <MemoryRouter initialEntries={['/trips/5']}>
      <Routes>
        <Route path="/trips/:id" element={<TripPage onSessionChange={onSessionChange} />} />
        <Route path="/trips" element={<h2>Trips list</h2>} />
        <Route path="/login" element={<h2>Log in</h2>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F2 trip page shell and not-found state', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    // The gate (RequireSession) answers 200 by default, so the page can load the trip.
    fetchMock.mockImplementation(async () => jsonResponse(200, { trip: TRIP }));
    vi.stubGlobal('fetch', fetchMock);
    getTripMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('F2.R7 shows Loading trip… while the trip request runs', async () => {
    getTripMock.mockReturnValue(new Promise(() => undefined));

    renderTripPage();

    expect(await screen.findByText('Loading trip…')).toBeTruthy();
  });

  it('F2.R7 a found trip shows its name as the h1', async () => {
    getTripMock.mockResolvedValue(TRIP);

    renderTripPage();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Lisbon' });
    expect(heading).toBeTruthy();
    expect(getTripMock).toHaveBeenCalledWith(5);
  });

  it('F2.R7 a found trip shows its created date', async () => {
    getTripMock.mockResolvedValue(TRIP);

    renderTripPage();

    expect(await screen.findByText('Created 15 Nov 2026')).toBeTruthy();
  });

  it('F2.R7 a found trip shows the placeholder text, Delete trip and Back to trips', async () => {
    getTripMock.mockResolvedValue(TRIP);

    renderTripPage();

    expect(await screen.findByText('People, expenses and balances will appear here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete trip' })).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Back to trips' });
    expect(back.getAttribute('href')).toBe('/trips');
  });

  it('F2.AC12 a not-found trip shows the not-found heading, text and Back to trips link', async () => {
    getTripMock.mockResolvedValue('not-found');

    renderTripPage();

    expect(await screen.findByRole('heading', { name: 'Trip not found' })).toBeTruthy();
    expect(screen.getByText('It may have been deleted, or the link is wrong.')).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Back to trips' });
    expect(back.getAttribute('href')).toBe('/trips');
  });

  it('F2.AC12 a not-found trip shows no trip data and no page content', async () => {
    getTripMock.mockResolvedValue('not-found');

    renderTripPage();

    await screen.findByRole('heading', { name: 'Trip not found' });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByText('Lisbon')).toBeNull();
    expect(screen.queryByText(/Created/)).toBeNull();
    expect(screen.queryByText('People, expenses and balances will appear here.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete trip' })).toBeNull();
  });

  it('F2.R7 a failed trip load shows the alert and no trip data', async () => {
    getTripMock.mockRejectedValue(new ApiError(500, 'Something went wrong. Please try again.', null, null));

    renderTripPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Something went wrong. Please try again.');
    expect(screen.queryByRole('button', { name: 'Delete trip' })).toBeNull();
  });

  it('F2.R7 a response with no trip object shows the alert and no trip data', async () => {
    // The API typing says Trip or 'not-found'. This fake returns null to test the runtime guard.
    getTripMock.mockResolvedValue(null as unknown as Trip);

    renderTripPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('F2.AC9 a 401 from the gate redirects to Log in and does not request the trip', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: 'Unauthorized' }));

    renderTripPage();

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(getTripMock).not.toHaveBeenCalled();
  });

  it('F2.AC9 a 401 from the trip request redirects to Log in and tells the app the session ended', async () => {
    const onSessionChange = vi.fn();
    getTripMock.mockRejectedValue(new ApiError(401, 'Unauthorized', null, null));

    renderTripPage(onSessionChange);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSessionChange).toHaveBeenCalledWith(false);
  });
});
