import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './App';

// This task proves no acceptance criterion. It is a smoke test that the root
// component renders. Named with the task ID, as the plan requires.
describe('F1.T1 root component', () => {
  afterEach(() => {
    cleanup();
  });

  it('F1.T1 renders the root component without error', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Trip Expense Tracker' })).toBeTruthy();
  });
});

// Builds a JSON response for the mocked fetch. No real network is used.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('F1 Trips route guard in the app', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/trips');
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('F1.AC9 a logged-out visitor opening /trips is redirected to Log in and sees no trip content', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Trips' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/trips', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('F1.AC9 a live session opening /trips shows the Trips screen', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { trips: [] }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
  });
});
