/**
 * Reusable Drizzle-ORM mock for testing API route handlers without a real DB.
 *
 * Drizzle query builders are chainable and thenable:
 *   await db.select().from(t).where(...).limit(n)        -> rows
 *   await db.insert(t).values(v).returning()             -> rows
 *   await db.update(t).set(v).where(...)                 -> rows
 *   await db.delete(t).where(...)                        -> rows
 *
 * This mock returns a single Proxy for every chain. The Proxy is thenable and
 * resolves to the next queued result set (or the default). It also records the
 * values passed to .values() / .set() and counts deletes so tests can assert
 * on what was written.
 *
 * Usage inside a test file:
 *
 *   import { mockDb, resetDb, queueResults, getInserts } from "../helpers/mock-db";
 *   vi.mock("@/lib/db", async (importOriginal) => {
 *     const actual = await importOriginal<typeof import("@/lib/db")>();
 *     return { ...actual, db: mockDb, getDb: () => mockDb };
 *   });
 *   beforeEach(() => resetDb());
 *   queueResults([{ id: "1" }]); // first await resolves to this
 */

interface MockState {
  queue: unknown[][];
  default: unknown[];
  inserts: unknown[];
  updates: unknown[];
  deletes: number;
}

const state: MockState = {
  queue: [],
  default: [],
  inserts: [],
  updates: [],
  deletes: 0,
};

/** Reset all recorded calls and queued results. Call in beforeEach(). */
export function resetDb(): void {
  state.queue = [];
  state.default = [];
  state.inserts = [];
  state.updates = [];
  state.deletes = 0;
}

/** Queue one or more result sets, consumed in order by successive awaits. */
export function queueResults(...results: unknown[][]): void {
  state.queue.push(...results);
}

/** Set the fallback result returned once the queue is exhausted. */
export function setDefaultResult(rows: unknown[]): void {
  state.default = rows;
}

/** Values captured from .values() calls (inserts). */
export function getInserts(): unknown[] {
  return state.inserts;
}

/** Values captured from .set() calls (updates). */
export function getUpdates(): unknown[] {
  return state.updates;
}

/** Number of db.delete(...) chains created. */
export function getDeleteCount(): number {
  return state.deletes;
}

function nextResult(): unknown[] {
  if (state.queue.length > 0) {
    return state.queue.shift() as unknown[];
  }
  return state.default;
}

function makeChain(): unknown {
  const handler: ProxyHandler<() => void> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown[]) => void) => resolve(nextResult());
      }
      if (prop === "catch" || prop === "finally") {
        return () => proxy;
      }
      if (prop === "values") {
        return (v: unknown) => {
          state.inserts.push(v);
          return proxy;
        };
      }
      if (prop === "set") {
        return (v: unknown) => {
          state.updates.push(v);
          return proxy;
        };
      }
      // Any other chain method (from/where/limit/orderBy/innerJoin/returning/...)
      return () => proxy;
    },
  };
  const proxy: unknown = new Proxy(function () {}, handler);
  return proxy;
}

/** The mock db object. Override `db` from "@/lib/db" with this. */
export const mockDb = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "delete") {
        return () => {
          state.deletes++;
          return makeChain();
        };
      }
      // select / insert / update / transaction / execute etc.
      return () => makeChain();
    },
  }
) as Record<string, (...args: unknown[]) => unknown>;
