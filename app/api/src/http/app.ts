// Builds the Express app. No port is opened here; index.ts calls listen.
import express, { type Express } from 'express';
import { createErrorHandler, type ErrorLogger } from './errors.ts';
import { loginRoute, logoutRoute, registerRoute, type AuthRouteDeps } from './routes/auth.ts';
import {
  createTripHandler,
  deleteTripHandler,
  getTripHandler,
  listTripsHandler,
  type TripRouteDeps,
} from './routes/trips.ts';

export interface AppDeps {
  auth: AuthRouteDeps;
  /** The session store, clock and trip service for the trip routes. Each route runs the login gate (F1.R10). */
  trips: TripRouteDeps;
  logger: ErrorLogger;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.post('/api/register', registerRoute(deps.auth));
  app.post('/api/login', loginRoute(deps.auth));
  app.post('/api/logout', logoutRoute(deps.auth));
  // Trip routes: each runs the login gate before any trip data is read (F1.R10, F2.AC9).
  app.get('/api/trips', listTripsHandler(deps.trips));
  app.post('/api/trips', createTripHandler(deps.trips));
  app.get('/api/trips/:id', getTripHandler(deps.trips));
  app.delete('/api/trips/:id', deleteTripHandler(deps.trips));

  // Must come last so it catches errors from every route above (project rules: no swallowed errors).
  app.use(createErrorHandler(deps.logger));
  return app;
}
