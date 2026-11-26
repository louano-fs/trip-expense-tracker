import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { deleteTrip } from '../api/trips';

// Copy for the delete dialog (F2.R8, F2.R10). Added in F2.T9 (new copy, for review).
// copy.ts is outside this task's file list, so the strings are kept here.
// Wording from docs/specs/features/F2-trips.md "States & errors".
const deleteCopy = {
  title: (name: string) => `Delete “${name}”?`,
  warning: "This deletes the trip and all its people, expenses and payments. This can't be undone.",
  cancel: 'Cancel',
  confirm: 'Delete trip',
  failed: "Couldn't delete the trip. Please try again.",
} as const;

export interface DeleteTripDialogProps {
  tripId: number;
  tripName: string;
  /** Called on Cancel or Escape. The parent closes the dialog. No delete request is made. */
  onCancel: () => void;
  /** Called after the trip is deleted. The parent navigates to the Trips list (F2.R10). */
  onDeleted: () => void;
  /** Called when the trip is missing or belongs to someone else (F2.R12). The parent shows not-found. */
  onNotFound: () => void;
}

// Confirmation dialog for deleting a trip (F2.R8, F2.AC10, F2.AC11, F2.AC12). It is modal:
// focus starts on Cancel, Tab moves only between the two buttons, and Escape acts as Cancel.
// While the delete request runs both buttons are disabled, so a second request cannot start.
export function DeleteTripDialog({ tripId, tripName, onCancel, onDeleted, onNotFound }: DeleteTripDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus moves to Cancel when the dialog opens (accessibility).
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Escape is ignored while the request runs, because the buttons are disabled then.
      if (!inFlight.current) onCancel();
      return;
    }
    if (event.key === 'Tab') {
      // Only two buttons are in the dialog, so Tab and Shift+Tab move between them.
      event.preventDefault();
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
      next?.focus();
    }
  }

  async function handleConfirm() {
    // The guard ref stops a second request while one is running (F2.AC11).
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await deleteTrip(tripId);
      if (result === 'not-found') {
        onNotFound();
        return;
      }
      onDeleted();
    } catch {
      // Server or network error (F2 States & errors). The trip is unchanged, and the dialog stays open.
      inFlight.current = false;
      setBusy(false);
      setError(deleteCopy.failed);
      confirmRef.current?.focus();
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <h2 id={titleId}>{deleteCopy.title(tripName)}</h2>
      <p>{deleteCopy.warning}</p>
      {error !== null && <p role="alert">{error}</p>}
      <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}>
        {deleteCopy.cancel}
      </button>
      <button ref={confirmRef} type="button" onClick={() => void handleConfirm()} disabled={busy}>
        {deleteCopy.confirm}
      </button>
    </div>
  );
}
