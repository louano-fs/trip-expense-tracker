import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, login, logout, register } from './client';

// fetch is mocked for every test. No real network is used.
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('F1 API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('F1.AC1 register posts email and password with same-origin credentials', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { user: { id: 1, email: 'sam@mail.com' } }));

    const user = await register('sam@mail.com', 'a long enough phrase');

    expect(user).toEqual({ id: 1, email: 'sam@mail.com' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/register');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'sam@mail.com',
      password: 'a long enough phrase',
    });
  });

  it('F1.AC5 login posts to /api/login with same-origin credentials and returns the user', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { user: { id: 2, email: 'sam@mail.com' } }));

    const user = await login('SAM@mail.com', 'a long enough phrase');

    expect(user).toEqual({ id: 2, email: 'sam@mail.com' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/login');
    expect(init.credentials).toBe('same-origin');
  });

  it('F1.AC6 maps a 401 to ApiError with the status and no retry seconds', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Email or password is incorrect.' }));

    const error = await login('sam@mail.com', 'wrong').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe('Email or password is incorrect.');
    expect((error as ApiError).retryAfterSeconds).toBeNull();
  });

  it('F1.AC19 maps a 429 to ApiError with the retry seconds from Retry-After', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: 'Too many failed attempts.' }, { 'Retry-After': '30' }),
    );

    const error = await login('sam@mail.com', 'wrong').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).retryAfterSeconds).toBe(30);
  });

  it('F1.AC4 maps a 400 to ApiError carrying the failing field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: 'Enter a valid email address, like name@example.com.', field: 'email' }),
    );

    const error = await register('bad', 'a long enough phrase').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).field).toBe('email');
  });

  it('F1.AC7 logout posts with same-origin credentials and resolves on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(logout()).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/logout');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
  });

  // Not an AC: this checks the generic server-error copy from the spec's States section.
  it('F1 States: a server error with no JSON body uses the generic message', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 500 }));

    const error = await logout().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).toBe('Something went wrong. Please try again.');
  });
});
