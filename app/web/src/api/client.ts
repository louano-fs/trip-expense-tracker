// Client for the F1 auth endpoints. Uses the browser's fetch; the session
// lives in an HttpOnly cookie, so only the response shape is handled here.

export interface UserSummary {
  id: number;
  email: string;
}

export type ApiField = 'email' | 'password';

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  readonly field: ApiField | null;

  constructor(status: number, message: string, retryAfterSeconds: number | null, field: ApiField | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.field = field;
  }
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}

function readField(value: unknown): ApiField | null {
  return value === 'email' || value === 'password' ? value : null;
}

// Reads the error body defensively. A body that is not JSON falls back to the
// generic message instead of failing again.
async function toApiError(response: Response): Promise<ApiError> {
  let message = GENERIC_MESSAGE;
  let field: ApiField | null = null;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      if (typeof record.error === 'string' && record.error.length > 0) {
        message = record.error;
      }
      field = readField(record.field);
    }
  } catch {
    // Not JSON: keep the generic message. The body is never logged.
  }
  return new ApiError(
    response.status,
    message,
    parseRetryAfter(response.headers.get('Retry-After')),
    field,
  );
}

async function post(path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return fetch(path, init);
}

async function readUser(response: Response): Promise<UserSummary> {
  if (!response.ok) {
    throw await toApiError(response);
  }
  const body = (await response.json()) as { user: UserSummary };
  return body.user;
}

export async function register(email: string, password: string): Promise<UserSummary> {
  return readUser(await post('/api/register', { email, password }));
}

export async function login(email: string, password: string): Promise<UserSummary> {
  return readUser(await post('/api/login', { email, password }));
}

export async function logout(): Promise<void> {
  const response = await post('/api/logout');
  if (!response.ok) {
    throw await toApiError(response);
  }
}
