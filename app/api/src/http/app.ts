// Builds the Express app. No port is opened here; index.ts calls listen.
import express, { type Express } from 'express';
import { createErrorHandler, type ErrorLogger } from './errors.ts';
import { loginRoute, logoutRoute, registerRoute, type AuthRouteDeps } from './routes/auth.ts';
import { tripPlaceholderRoute, type PlaceholderDeps } from './routes/trips-placeholder.ts';

export interface AppDeps {
  auth: AuthRouteDeps;
  /** The session store and clock for the guarded trip placeholder (F1.R10). Required so the gate is never unmounted. */
  trips: PlaceholderDeps;
  logger: ErrorLogger;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.post('/api/register', registerRoute(deps.auth));
  app.post('/api/login', loginRoute(deps.auth));
  app.post('/api/logout', logoutRoute(deps.auth));
  // Guarded placeholder: apiGuard runs before any trip data is read (F1.R10). F2 replaces it.
  app.get('/api/trips/:id', tripPlaceholderRoute(deps.trips));

  // Must come last so it catches errors from every route above (project rules: no swallowed errors).
  app.use(createErrorHandler(deps.logger));
  return app;
}
