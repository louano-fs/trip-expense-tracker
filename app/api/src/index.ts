import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { openDatabase } from './db/open.ts';
import { applyMigrations, loadMigrations, MIGRATIONS_DIR } from './db/migrate.ts';
import { findUserByEmail, insertUser, type NewUser } from './db/repositories/users.ts';
import { deleteSession, findSessionByHash, insertSession } from './db/repositories/sessions.ts';
import { getThrottle, saveThrottle } from './db/repositories/throttle.ts';
import {
  deleteTripById,
  findTripForOwner,
  insertTrip,
  listTripsByOwner,
} from './db/repositories/trips.ts';
import type { TripStore } from './trips/store.ts';
import { buildBlocklist, STARTER_BLOCKLIST } from './auth/blocklist.ts';
import { hashPassword, verifyPassword } from './auth/password.ts';
import { register } from './auth/register.ts';
import { login } from './auth/login.ts';
import { createLoginThrottle } from './auth/throttle.ts';
import { endSession, type Clock, type RandomSource, type SessionStore } from './auth/sessions.ts';
import { createApp } from './http/app.ts';
import { tripRouteService } from './http/routes/trips.ts';

const logger = createLogger();

try {
  const config = loadConfig(process.env);

  // Open and migrate the database before the server accepts any request.
  const db = openDatabase(config.databasePath);
  applyMigrations(db, loadMigrations(MIGRATIONS_DIR), () => new Date());

  const clock: Clock = { now: () => new Date() };
  const random: RandomSource = (size) => randomBytes(size);
  // The starter list lives in code (see auth/blocklist.README.md), so there is no blocklist file to read.
  const blocklist = buildBlocklist(STARTER_BLOCKLIST);

  // Runs the work in one transaction. The work is synchronous, so no await runs inside it.
  const transaction = <T>(work: () => T): T => {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (err: unknown) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  // Store adapters: each maps the repository functions onto a service store interface.
  const sessions: SessionStore = {
    insert: (session) => insertSession(db, session),
    findByHash: (idHash) => findSessionByHash(db, idHash),
    delete: (idHash) => deleteSession(db, idHash),
  };
  const throttle = createLoginThrottle({
    store: {
      get: (email) => getThrottle(db, email),
      save: (state) => saveThrottle(db, state),
    },
    clock,
  });
  const registerDeps = {
    users: { insert: (user: NewUser) => insertUser(db, user) },
    sessions,
    hashPassword,
    blocklist,
    clock,
    random,
    transaction,
  };
  const loginDeps = {
    users: { findByEmail: (email: string) => findUserByEmail(db, email) },
    sessions,
    throttle,
    verifyPassword,
    clock,
    random,
    transaction,
  };

  // Trip store adapter: maps the trip repository onto the service store. Lookups filter by owner in the
  // query (F1.R11, F2.R11), and the service checks the owner again. The delete runs in one transaction (F2.R9).
  const tripStore: TripStore = {
    insertTrip: (trip) => insertTrip(db, trip),
    listTripsByOwner: (ownerId) =>
      listTripsByOwner(db, ownerId).map((trip) => ({
        id: trip.id,
        owner_id: ownerId,
        name: trip.name,
        createdAt: trip.createdAt,
      })),
    findTrip: (id, ownerId) => {
      const trip = findTripForOwner(db, id, ownerId);
      if (trip === undefined) {
        return undefined;
      }
      return { id: trip.id, owner_id: ownerId, name: trip.name, createdAt: trip.createdAt };
    },
    deleteTrip: (id, ownerId) => deleteTripById(db, id, ownerId),
    transaction,
  };

  const app = createApp({
    logger,
    auth: {
      register: (input) => register(input, registerDeps),
      login: (input) => login(input, loginDeps),
      endSession: (token) => endSession({ token, store: sessions }),
      cookieSecure: config.cookieSecure,
    },
    trips: {
      sessions,
      clock,
      service: tripRouteService({ store: tripStore, clock }),
    },
  });

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API listening');
  });
} catch (err) {
  logger.error({ err }, 'API failed to start');
  process.exitCode = 1;
}
