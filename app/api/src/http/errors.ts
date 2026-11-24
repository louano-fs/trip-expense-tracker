// Express error handler (project rules: errors reach the handler, never get swallowed).

/** The only message a client sees for an unexpected failure. */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** The message a client sees when express.json() cannot parse the body. */
export const MALFORMED_JSON_MESSAGE = 'Request body must be valid JSON.';

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
 * True for the error express.json() (body-parser) raises for a malformed body:
 * status 400 and type 'entity.parse.failed'.
 */
function isMalformedJson(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const { status, type } = err as { status?: unknown; type?: unknown };
  return status === 400 && type === 'entity.parse.failed';
}

/**
 * Builds the 4-argument error middleware Express needs (Express finds error handlers by arity).
 * Logs the error with the method and path only. The request body and cookies are never logged.
 * A malformed JSON body gets 400; the parse error carries the raw body, so it is not logged.
 */
export function createErrorHandler(
  logger: ErrorLogger,
): (err: unknown, req: ErrorRequest, res: ErrorResponse, next: (err: unknown) => void) => void {
  return (err, req, res, next) => {
    const malformed = isMalformedJson(err);
    logger.error(
      malformed
        ? { method: req.method, path: req.path, reason: 'entity.parse.failed' }
        : { err, method: req.method, path: req.path },
      'Request failed',
    );
    if (res.headersSent) {
      next(err);
      return;
    }
    if (malformed) {
      res.status(400);
      res.json({ error: MALFORMED_JSON_MESSAGE });
      return;
    }
    res.status(500);
    res.json({ error: GENERIC_ERROR_MESSAGE });
  };
}
