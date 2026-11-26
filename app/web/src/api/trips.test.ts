import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { createTrip, deleteTrip, getTrip, listTrips } from './trips';

// fetch is mocked for every test. No real network is used.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const LISBON = { id: 7, name: 'Lisbon', createdAt: '2026-11-15T23:30:00.000Z' };

describe('F2 trip API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('F2.AC5 listTrips returns the trips in the order the server sent them', async () => {
    const trips = [
      { id: 3, name: 'Newest', createdAt: '2026-11-03T10:00:00.000Z' },
      { id: 2, name: 'Middle', createdAt: '2026-11-02T10:00:00.000Z' },
      { id: 1, name: 'Oldest', createdAt: '2026-11-01T10:00:00.000Z' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { trips }));

    const result = await listTrips();

    expect(result).toEqual(trips);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/trips');
    expect(init.credentials).toBe('same-origin');
  });

  it('F2.AC9 listTrips with a 401 throws ApiError with status 401 and no trip data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized', reason: 'expired' }));

    const error = await listTrips().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe('Unauthorized');
  });

  it('F2.AC1 createTrip posts the name with same-origin credentials and returns the new trip', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { trip: LISBON }));

    const result = await createTrip('Lisbon');

    expect(result).toEqual({ ok: true, trip: LISBON });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/trips');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Lisbon' });
  });

  it('F2.AC2 createTrip maps a 400 for a blank name to the name field and "Enter a trip name."', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { field: 'name', message: 'Enter a trip name.' }));

    const result = await createTrip('   ');

    expect(result).toEqual({ ok: false, field: 'name', message: 'Enter a trip name.' });
  });

  it('F2.AC3 createTrip maps a 400 for a name over 100 characters to the name field and its message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { field: 'name', message: 'Trip name must be 100 characters or fewer.' }),
    );

    const result = await createTrip('x'.repeat(101));

    expect(result).toEqual({
      ok: false,
      field: 'name',
      message: 'Trip name must be 100 characters or fewer.',
    });
  });

  it('F2.AC9 createTrip with a 401 throws ApiError with status 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    const error = await createTrip('Lisbon').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it('F2.AC12 getTrip returns the trip when it exists', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { trip: LISBON }));

    const result = await getTrip(7);

    expect(result).toEqual(LISBON);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/trips/7');
    expect(init.credentials).toBe('same-origin');
  });

  it('F2.AC12 getTrip returns not-found when the server answers 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Trip not found' }));

    const result = await getTrip(7);

    expect(result).toBe('not-found');
  });

  it('F2.AC9 getTrip with a 401 throws ApiError with status 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    const error = await getTrip(7).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it('F2.AC11 deleteTrip sends DELETE with same-origin credentials and resolves deleted on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteTrip(7);

    expect(result).toBe('deleted');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/trips/7');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('same-origin');
  });

  it('F2.AC12 deleteTrip returns not-found when the server answers 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Trip not found' }));

    const result = await deleteTrip(7);

    expect(result).toBe('not-found');
  });

  it('F2.AC9 deleteTrip with a 401 throws ApiError with status 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    const error = await deleteTrip(7).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  // Not an AC: a 500 is an unexpected server error, so it is thrown for the screen to show its generic message.
  it('F2 States: a 500 from deleteTrip throws ApiError with the generic message', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 500 }));

    const error = await deleteTrip(7).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).toBe('Something went wrong. Please try again.');
  });
});
