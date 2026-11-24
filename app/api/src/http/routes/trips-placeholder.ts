// Placeholder for the trip endpoints until F2 adds them (F1.R10). It only shows the login gate in front of a trip route.
// Every trip endpoint runs apiGuard before any trip data is read; F1 has no trips, so a live session gets 404.
import { apiGuard } from '../../auth/guards.ts';
import type { Clock, SessionStore } from '../../auth/sessions.ts';
import { readSessionToken } from '../cookies.ts';
import type { RouteResponse } from './auth.ts';

/** The request fields the placeholder reads. Express's Request satisfies this. */
export interface PlaceholderRequest {
  headers: { cookie?: string | undefined };
}

export interface PlaceholderDeps {
  sessions: SessionStore;
  clock: Clock;
}

/**
 * GET /api/trips/:id: 401 with no data when logged out or expired (F1.R10); 404 otherwise, since F1 has no trips.
 * The 401 body has `reason: 'expired'` only when a session cookie was sent but no live session matched,
 * so the web app can show the expired notice (F1.R7, F1.AC23). With no cookie there is no reason key.
 */
export function tripPlaceholderRoute(deps: PlaceholderDeps): (req: PlaceholderRequest, res: RouteResponse) => void {
  return (req, res) => {
    const token = readSessionToken(req.headers.cookie);
    const guard = apiGuard({
      token,
      sessions: deps.sessions,
      clock: deps.clock,
    });
    if (!guard.ok) {
      res.status(guard.status);
      res.json(token === undefined ? { error: 'Unauthorized' } : { error: 'Unauthorized', reason: 'expired' });
      return;
    }
    res.status(404);
    res.json({ error: 'Trip not found.' });
  };
}
