import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { listTrips, type Trip } from '../api/trips';
import { ApiError } from '../api/client';
import { Trips } from './Trips';

// The list API is mocked, so no real network is used. The gate's fetch is stubbed too.
vi.mock('../api/trips', () => ({
  listTrips: vi.fn(),
}));

const listTripsMock = vi.mocked(listTrips);

// Noon UTC keeps the expected day the same in every common viewer zone.
const TRIPS: Trip[] = [
  { id: 3, name: 'Lisbon', createdAt: '2026-11-20T12:00:00Z' },
  { id: 2, name: 'Ski weekend', createdAt: '2026-11-15T12:00:00Z' },
  { id: 1, name: 'Porto', createdAt: '2026-10-01T12:00:00Z' },
];

// Builds a JSON response for the stubbed gate fetch.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Renders the Trips route at /trips with a stub Log in route at /login.
function renderTrips(onSessionChange?: (live: boolean) => void) {
  render(
    <MemoryRouter initialEntries={['/trips']}>
      <Routes>
        <Route path="/trips" element={<Trips onSessionChange={onSessionChange} />} />
        <Route path="/login" element={<h2>Log in</h2>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Renders /trips as if the trip page had just navigated there after a delete (F2.R10).
function renderTripsAfterDelete(deletedTripName: string) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/trips', state: { deletedTripName } }]}>
      <Routes>
        <Route path="/trips" element={<Trips />} />
        <Route path="/login" element={<h2>Log in</h2>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F2 Trips list screen', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    // The gate (RequireSession) answers 200 by default, so the page can load the list.
    fetchMock.mockImplementation(async () => jsonResponse(200, { trips: [] }));
    vi.stubGlobal('fetch', fetchMock);
    listTripsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('F2.R5 shows Loading trips… while the list request runs', async () => {
    listTripsMock.mockReturnValue(new Promise<Trip[]>(() => undefined));

    renderTrips();

    expect(await screen.findByText('Loading trips…')).toBeTruthy();
  });

  it('F2.AC5 three trips render in the order the service returned, each with its name and created date', async () => {
    listTripsMock.mockResolvedValue(TRIPS);

    renderTrips();

    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Lisbon Created 20 Nov 2026',
      'Ski weekend Created 15 Nov 2026',
      'Porto Created 1 Oct 2026',
    ]);
  });

  it('F2.AC5 each trip row is one link to its trip page, named by the trip name and created date', async () => {
    listTripsMock.mockResolvedValue(TRIPS);

    renderTrips();

    const link = await screen.findByRole('link', { name: 'Ski weekend Created 15 Nov 2026' });
    expect(link.getAttribute('href')).toBe('/trips/2');
  });

  it('F2.AC6 an empty list shows the empty text and a New trip button', async () => {
    listTripsMock.mockResolvedValue([]);

    renderTrips();

    expect(await screen.findByText('No trips yet. Create your first trip to start tracking shared costs.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New trip' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('F2.R5 a failed list load shows the alert and a Try again button', async () => {
    listTripsMock.mockRejectedValue(new ApiError(500, 'Something went wrong. Please try again.', null, null));

    renderTrips();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't load your trips.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('F2.R5 Try again reloads the list and shows the trips when it works', async () => {
    const user = userEvent.setup();
    listTripsMock.mockRejectedValueOnce(new TypeError('network down'));
    listTripsMock.mockResolvedValueOnce(TRIPS);

    renderTrips();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByRole('list')).toBeTruthy());
    expect(listTripsMock).toHaveBeenCalledTimes(2);
  });

  it('F2.AC11 after a delete the Trips list shows the notice with the deleted trip name in a status element', async () => {
    listTripsMock.mockResolvedValue(TRIPS);

    renderTripsAfterDelete('Lisbon');

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe('Trip “Lisbon” deleted.');
  });

  it('F2.AC11 the Trips list shows no notice when it is opened without a delete', async () => {
    listTripsMock.mockResolvedValue(TRIPS);

    renderTrips();

    await screen.findByRole('list');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('F2.AC9 a 401 from the gate redirects to Log in and does not request the list', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: 'Unauthorized' }));

    renderTrips();

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(listTripsMock).not.toHaveBeenCalled();
  });

  it('F2.AC9 a 401 from the list redirects to Log in and tells the app the session ended', async () => {
    const onSessionChange = vi.fn();
    listTripsMock.mockRejectedValue(new ApiError(401, 'Unauthorized', null, null));

    renderTrips(onSessionChange);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSessionChange).toHaveBeenCalledWith(false);
  });
});
