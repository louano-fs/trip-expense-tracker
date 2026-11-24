// Builds the Express app. No port is opened here; index.ts calls listen.
import express, { type Express } from 'express';
import { createErrorHandler, type ErrorLogger } from './errors.ts';
import { loginRoute, logoutRoute, registerRoute, type AuthRouteDeps } from './routes/auth.ts';

export interface AppDeps {
  auth: AuthRouteDeps;
  logger: ErrorLogger;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.post('/api/register', registerRoute(deps.auth));
  app.post('/api/login', loginRoute(deps.auth));
  app.post('/api/logout', logoutRoute(deps.auth));

  // Must come last so it catches errors from every route above (project rules: no swallowed errors).
  app.use(createErrorHandler(deps.logger));
  return app;
}
