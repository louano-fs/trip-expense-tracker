import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTrip } from '../api/trips';
import { copy } from '../copy';
import { checkTripName } from '../trips/tripName';

// Labels for this form. Kept here because copy.ts is outside this task's file list.
// Wording from docs/specs/features/F2-trips.md.
const newTripCopy = {
  nameLabel: 'Trip name',
  submit: 'Create trip',
  submitBusy: 'Creating trip...',
  cancel: 'Cancel',
} as const;

export interface NewTripFormProps {
  /** Called when the user cancels. The parent hides the form. */
  onCancel: () => void;
}

// New trip form (F2.R1 to F2.R4). The field is checked here for instant feedback, and the
// server checks it again (F2.R2). Each rejection shows under the field and focus stays there.
// A guard ref stops a second request while one is running (F2.AC1, double click).
export function NewTripForm({ onCancel }: NewTripFormProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "New trip" moves focus to the Trip name field (accessibility).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    setFormError(null);
    const checked = checkTripName(name);
    if (!checked.ok) {
      setNameError(checked.message);
      inputRef.current?.focus();
      return;
    }
    setNameError(null);

    inFlight.current = true;
    setBusy(true);
    try {
      const result = await createTrip(checked.name);
      if (result.ok) {
        // F2.R4: the user lands on the new trip's page.
        navigate(`/trips/${result.trip.id}`);
        return;
      }
      setNameError(result.message);
      inputRef.current?.focus();
    } catch {
      // Network or server error (F2 States & errors). The typed name is kept.
      setFormError(copy.genericError);
      inputRef.current?.focus();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError !== null && <p role="alert">{formError}</p>}
      <div>
        <label htmlFor="new-trip-name">{newTripCopy.nameLabel}</label>
        <input
          id="new-trip-name"
          ref={inputRef}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError !== null}
          aria-describedby={nameError !== null ? 'new-trip-name-error' : undefined}
        />
        {nameError !== null && <p id="new-trip-name-error">{nameError}</p>}
      </div>
      <button type="submit" disabled={busy}>
        {busy ? newTripCopy.submitBusy : newTripCopy.submit}
      </button>
      <button type="button" onClick={onCancel} disabled={busy}>
        {newTripCopy.cancel}
      </button>
    </form>
  );
}
