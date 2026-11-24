// Express error handler (project rules: errors reach the handler, never get swallowed).

/** The only message a client sees for an unexpected failure. */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** The logger methods the handler uses. The project logger satisfies this. */
export interface ErrorLogger {
  error(obj: object, msg: string): void;
}

/** The request fields the handler may log. The body and cookies are never read here. */
export interface ErrorRequest {
  method: string;
  path: string;
}

export interface ErrorResponse {
  headersSent: boolean;
  status(code: number): void;
  json(body: unknown): void;
}

/**
 * Builds the 4-argument error middleware Express needs (Express finds error handlers by arity).
 * Logs the error with the method and path only. The request body and cookies are never logged.
 */
export function createErrorHandler(
  logger: ErrorLogger,
): (err: unknown, req: ErrorRequest, res: ErrorResponse, next: (err: unknown) => void) => void {
  return (err, req, res, next) => {
    logger.error({ err, method: req.method, path: req.path }, 'Request failed');
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500);
    res.json({ error: GENERIC_ERROR_MESSAGE });
  };
}
