import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { deleteTrip, getTrip, listTrips, type Trip } from '../api/trips';
import { ApiError } from '../api/client';
import { DeleteTripDialog } from './DeleteTripDialog';
import { TripPage } from '../pages/TripPage';
import { Trips } from '../pages/Trips';

// The trip API is mocked, so no real network is used. The gate's fetch is stubbed too.
vi.mock('../api/trips', () => ({
  getTrip: vi.fn(),
  deleteTrip: vi.fn(),
  listTrips: vi.fn(),
}));

const getTripMock = vi.mocked(getTrip);
const deleteTripMock = vi.mocked(deleteTrip);
const listTripsMock = vi.mocked(listTrips);

// Noon UTC keeps the expected day the same in every common viewer zone.
const TRIP: Trip = { id: 5, name: 'Lisbon', createdAt: '2026-11-15T12:00:00Z' };

const WARNING = "This deletes the trip and all its people, expenses and payments. This can't be undone.";

// Builds a JSON response for the stubbed gate fetch.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Stands in for the trip page: a "Delete trip" button opens the dialog, and Cancel closes it.
function OpenHarness({ onDeleted, onNotFound }: { onDeleted: () => void; onNotFound: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete trip
      </button>
      {open && (
        <DeleteTripDialog
          tripId={5}
          tripName="Lisbon"
          onCancel={() => setOpen(false)}
          onDeleted={onDeleted}
          onNotFound={onNotFound}
        />
      )}
    </>
  );
}

// Renders the real trip page and Trips list, so a delete can be followed to its notice.
function renderTripFlow() {
  render(
    <MemoryRouter initialEntries={['/trips/5']}>
      <Routes>
        <Route path="/trips/:id" element={<TripPage />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/login" element={<h2>Log in</h2>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F2 delete trip dialog', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { trips: [] }));
    vi.stubGlobal('fetch', fetchMock);
    getTripMock.mockReset();
    deleteTripMock.mockReset();
    listTripsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  async function openDialog(user: ReturnType<typeof userEvent.setup>, onDeleted = vi.fn(), onNotFound = vi.fn()) {
    render(<OpenHarness onDeleted={onDeleted} onNotFound={onNotFound} />);
    await user.click(screen.getByRole('button', { name: 'Delete trip' }));
    return screen.getByRole('dialog', { name: 'Delete “Lisbon”?' });
  }

  it('F2.AC10 the dialog is modal, is labelled by its title, names the trip and warns about its contents', async () => {
    const user = userEvent.setup();

    const dialog = await openDialog(user);

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { name: 'Delete “Lisbon”?' })).toBeTruthy();
    expect(within(dialog).getByText(WARNING)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Delete trip' })).toBeTruthy();
  });

  it('F2.AC10 focus moves to Cancel when the dialog opens', async () => {
    const user = userEvent.setup();

    const dialog = await openDialog(user);

    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('F2.AC10 Tab moves only between Cancel and Delete trip inside the dialog', async () => {
    const user = userEvent.setup();

    const dialog = await openDialog(user);
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete trip' });

    await user.tab();
    expect(document.activeElement).toBe(confirm);
    await user.tab();
    expect(document.activeElement).toBe(cancel);
  });

  it('F2.AC10 Cancel closes the dialog and makes no delete call', async () => {
    const user = userEvent.setup();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteTripMock).not.toHaveBeenCalled();
  });

  it('F2.AC10 Escape closes the dialog as Cancel and makes no delete call', async () => {
    const user = userEvent.setup();

    await openDialog(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteTripMock).not.toHaveBeenCalled();
  });

  it('F2.AC11 confirming calls deleteTrip once with the trip ID and reports the trip as deleted', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    deleteTripMock.mockResolvedValue('deleted');

    const dialog = await openDialog(user, onDeleted);
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    expect(deleteTripMock).toHaveBeenCalledTimes(1);
    expect(deleteTripMock).toHaveBeenCalledWith(5);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('F2.AC11 both buttons are disabled while the delete request runs', async () => {
    const user = userEvent.setup();
    deleteTripMock.mockReturnValue(new Promise<'deleted'>(() => undefined));

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Delete trip' }) as HTMLButtonElement).disabled).toBe(true);
    expect(deleteTripMock).toHaveBeenCalledTimes(1);
  });

  it('F2.AC12 deleting a missing trip reports not-found and shows no error in the dialog', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onNotFound = vi.fn();
    deleteTripMock.mockResolvedValue('not-found');

    const dialog = await openDialog(user, onDeleted, onNotFound);
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('F2.AC12 a failed delete shows the error in the dialog, keeps it open, and does not navigate or report deletion', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onNotFound = vi.fn();
    deleteTripMock.mockRejectedValue(new ApiError(500, 'Something went wrong. Please try again.', null, null));

    const dialog = await openDialog(user, onDeleted, onNotFound);
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe("Couldn't delete the trip. Please try again.");
    expect(screen.getByRole('dialog', { name: 'Delete “Lisbon”?' })).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();
    expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('F2 delete flow from the trip page', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { trips: [] }));
    vi.stubGlobal('fetch', fetchMock);
    getTripMock.mockReset();
    deleteTripMock.mockReset();
    listTripsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('F2.AC11 confirming the delete goes to the Trips list with the notice naming the trip', async () => {
    const user = userEvent.setup();
    getTripMock.mockResolvedValue(TRIP);
    deleteTripMock.mockResolvedValue('deleted');
    listTripsMock.mockResolvedValue([]);

    renderTripFlow();
    await user.click(await screen.findByRole('button', { name: 'Delete trip' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Lisbon”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeTruthy();
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe('Trip “Lisbon” deleted.');
    expect(deleteTripMock).toHaveBeenCalledWith(5);
  });

  it('F2.AC12 deleting a trip that is already gone shows the not-found state and no error page', async () => {
    const user = userEvent.setup();
    getTripMock.mockResolvedValue(TRIP);
    deleteTripMock.mockResolvedValue('not-found');

    renderTripFlow();
    await user.click(await screen.findByRole('button', { name: 'Delete trip' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Lisbon”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    expect(await screen.findByRole('heading', { name: 'Trip not found' })).toBeTruthy();
    expect(screen.getByText('It may have been deleted, or the link is wrong.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByText('Lisbon')).toBeNull();
  });

  it('F2.AC10 closing the dialog without deleting returns focus to Delete trip', async () => {
    const user = userEvent.setup();
    getTripMock.mockResolvedValue(TRIP);

    renderTripFlow();
    await user.click(await screen.findByRole('button', { name: 'Delete trip' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteTripMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete trip' }));
  });
});
