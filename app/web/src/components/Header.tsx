import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api/client';
import { copy } from '../copy';

export interface HeaderProps {
  /** True while the app knows the browser holds a live session. Log out is shown only then (F1.AC7). */
  loggedIn: boolean;
  /** Called after a successful log out so the app clears its logged-in state. */
  onLoggedOut?: () => void;
}

// Top bar. Shows "Log out" only when logged in (F1.AC7 UI). Logging out ends the
// session in this browser (F1.R8) and then shows the Log in screen.
export function Header({ loggedIn, onLoggedOut }: HeaderProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function handleLogOut() {
    setError(null);
    try {
      await logout();
    } catch {
      // The request failed, so the session may still be live. Show the error and stay on the page.
      setError(copy.genericError);
      return;
    }
    onLoggedOut?.();
    navigate('/login', { replace: true });
  }

  return (
    <header>
      {error !== null && <p role="alert">{error}</p>}
      {loggedIn && (
        <button type="button" onClick={handleLogOut}>
          Log out
        </button>
      )}
    </header>
  );
}
