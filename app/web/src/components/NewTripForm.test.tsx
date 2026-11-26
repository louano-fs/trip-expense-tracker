import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { createTrip } from '../api/trips';
import { ApiError } from '../api/client';
import { NewTripForm } from './NewTripForm';

// The trip API is mocked, so no real network is used.
vi.mock('../api/trips', () => ({
  createTrip: vi.fn(),
}));

const createTripMock = vi.mocked(createTrip);

// Stands in for the trip page route, showing the id it was opened with.
function TripStub() {
  const { id } = useParams();
  return <h2>Trip page {id}</h2>;
}

function renderForm(onCancel: () => void = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<NewTripForm onCancel={onCancel} />} />
        <Route path="/trips/:id" element={<TripStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

function nameField() {
  return screen.getByLabelText('Trip name') as HTMLInputElement;
}

describe('F2 New trip form', () => {
  beforeEach(() => {
    createTripMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('F2.AC1 moves focus to the Trip name field when the form opens', () => {
    renderForm();

    expect(document.activeElement).toBe(nameField());
  });

  it('F2.AC1 a valid name calls createTrip and navigates to the new trip page', async () => {
    const user = userEvent.setup();
    createTripMock.mockResolvedValue({
      ok: true,
      trip: { id: 7, name: 'Lisbon', createdAt: '2026-11-24T10:00:00Z' },
    });
    renderForm();

    await user.type(nameField(), 'Lisbon');
    await user.click(screen.getByRole('button', { name: 'Create trip' }));

    expect(createTripMock).toHaveBeenCalledWith('Lisbon');
    expect(await screen.findByRole('heading', { name: 'Trip page 7' })).toBeTruthy();
  });

  it('F2.AC1 pressing Enter in the field submits the form', async () => {
    const user = userEvent.setup();
    createTripMock.mockResolvedValue({
      ok: true,
      trip: { id: 8, name: 'Porto', createdAt: '2026-11-24T10:00:00Z' },
    });
    renderForm();

    await user.type(nameField(), 'Porto{Enter}');

    expect(createTripMock).toHaveBeenCalledWith('Porto');
    expect(await screen.findByRole('heading', { name: 'Trip page 8' })).toBeTruthy();
  });

  it('F2.AC1 Cancel calls onCancel and does not create a trip', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderForm(onCancel);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(createTripMock).not.toHaveBeenCalled();
  });

  it('F2.AC2 a blank name shows "Enter a trip name." linked to the field, calls nothing, and keeps focus on the field', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Create trip' }));

    const error = await screen.findByText('Enter a trip name.');
    expect(createTripMock).not.toHaveBeenCalled();
    expect(nameField().getAttribute('aria-describedby')).toBe(error.id);
    expect(document.activeElement).toBe(nameField());
  });

  it('F2.AC2 a name of only spaces shows "Enter a trip name." and calls nothing', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), '     {Enter}');

    expect(await screen.findByText('Enter a trip name.')).toBeTruthy();
    expect(createTripMock).not.toHaveBeenCalled();
  });

  it('F2.AC2 a name with spaces around it is sent trimmed', async () => {
    const user = userEvent.setup();
    createTripMock.mockResolvedValue({
      ok: true,
      trip: { id: 2, name: 'Lisbon', createdAt: '2026-11-24T10:00:00Z' },
    });
    renderForm();

    await user.type(nameField(), '  Lisbon  {Enter}');

    expect(createTripMock).toHaveBeenCalledWith('Lisbon');
  });

  it('F2.AC2 a server rejection shows its message under the field and keeps the typed name', async () => {
    const user = userEvent.setup();
    createTripMock.mockResolvedValue({ ok: false, field: 'name', message: 'Enter a trip name.' });
    renderForm();

    await user.type(nameField(), 'Lisbon{Enter}');

    const error = await screen.findByText('Enter a trip name.');
    expect(nameField().getAttribute('aria-describedby')).toBe(error.id);
    expect(nameField().value).toBe('Lisbon');
  });

  it('F2.AC3 101 characters shows "Trip name must be 100 characters or fewer." and calls nothing', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(nameField(), 'a'.repeat(101));
    await user.click(screen.getByRole('button', { name: 'Create trip' }));

    expect(await screen.findByText('Trip name must be 100 characters or fewer.')).toBeTruthy();
    expect(createTripMock).not.toHaveBeenCalled();
  });

  it('F2.AC3 exactly 100 characters is sent to createTrip', async () => {
    const user = userEvent.setup();
    const name = 'a'.repeat(100);
    createTripMock.mockResolvedValue({
      ok: true,
      trip: { id: 3, name, createdAt: '2026-11-24T10:00:00Z' },
    });
    renderForm();

    await user.type(nameField(), `${name}{Enter}`);

    expect(createTripMock).toHaveBeenCalledWith(name);
  });

  it('F2.AC4 two trips named "Ski weekend" both reach the API, with no duplicate block', async () => {
    const user = userEvent.setup();
    createTripMock.mockResolvedValue({
      ok: true,
      trip: { id: 1, name: 'Ski weekend', createdAt: '2026-11-24T10:00:00Z' },
    });

    renderForm();
    await user.type(nameField(), 'Ski weekend{Enter}');
    await screen.findByRole('heading', { name: 'Trip page 1' });
    cleanup();

    renderForm();
    await user.type(nameField(), 'Ski weekend{Enter}');
    await screen.findByRole('heading', { name: 'Trip page 1' });

    expect(createTripMock).toHaveBeenCalledTimes(2);
    expect(createTripMock).toHaveBeenNthCalledWith(1, 'Ski weekend');
    expect(createTripMock).toHaveBeenNthCalledWith(2, 'Ski weekend');
  });

  it('F2.AC1 a double click sends one request and the button is disabled with a busy label while creating', async () => {
    const user = userEvent.setup();
    createTripMock.mockReturnValue(new Promise(() => undefined));
    renderForm();

    await user.type(nameField(), 'Lisbon');
    await user.dblClick(screen.getByRole('button', { name: 'Create trip' }));

    const busy = await screen.findByRole('button', { name: 'Creating trip...' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(createTripMock).toHaveBeenCalledTimes(1);
  });

  it('F2.AC1 a network error shows the generic message and keeps the typed name', async () => {
    const user = userEvent.setup();
    createTripMock.mockRejectedValue(new TypeError('network down'));
    renderForm();

    await user.type(nameField(), 'Lisbon{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Something went wrong. Please try again.');
    expect(nameField().value).toBe('Lisbon');
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Create trip' }) as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('F2.AC1 a server error (ApiError 500) shows the generic message and keeps the typed name', async () => {
    const user = userEvent.setup();
    createTripMock.mockRejectedValue(new ApiError(500, 'Something went wrong. Please try again.', null, null));
    renderForm();

    await user.type(nameField(), 'Lisbon{Enter}');

    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
    expect(nameField().value).toBe('Lisbon');
  });
});
