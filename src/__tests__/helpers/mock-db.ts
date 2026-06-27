import { vi } from "vitest";

/**
 * Reusable chainable mock for the Drizzle query builder used across API routes.
 *
 * The real `db` exposes a fluent builder where every method returns `this`
 * (so calls can be chained) and the builder itself is "thenable" — awaiting it
 * resolves to a result array. This helper reproduces that shape and lets each
 * test control what the terminal `await` resolves to, while capturing the
 * values passed to `.insert().values()` / `.update().set()` for assertions.
 *
 * Usage:
 *   const { mockDb, setResult, queueResults, captured } = createMockDb();
 *   vi.mock("@/lib/db", () => ({ db: mockDb, ...tableStubs }));
 *   setResult([{ id: "1" }]);
 */
export interface MockDbController {
  /** The object to return as `db` from the `@/lib/db` mock. */
  mockDb: Record<string, (...args: unknown[]) => unknown>;
  /** Set the array every awaited chain resolves to (until changed). */
  setResult: (rows: unknown[]) => void;
  /** Queue results consumed FIFO, one per awaited chain (overrides setResult). */
  queueResults: (...batches: unknown[][]) => void;
  /** Captured arguments for inspection. */
  captured: {
    inserts: unknown[];
    updates: unknown[];
    values: unknown[];
    sets: unknown[];
    deletes: number;
  };
  /** Reset captured state and queued results. */
  reset: () => void;
}

export function createMockDb(initialResult: unknown[] = []): MockDbController {
  let defaultResult: unknown[] = initialResult;
  let queue: unknown[][] | null = null;

  const captured = {
    inserts: [] as unknown[],
    updates: [] as unknown[],
    values: [] as unknown[],
    sets: [] as unknown[],
    deletes: 0,
  };

  const resolveResult = (): unknown[] => {
    if (queue && queue.length > 0) {
      return queue.shift() as unknown[];
    }
    return defaultResult;
  };

  // A chain object: every builder method returns the same chain, and the chain
  // is awaitable (thenable) resolving to the current result array.
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};

    const builderMethods = [
      "select",
      "selectDistinct",
      "from",
      "where",
      "orderBy",
      "limit",
      "offset",
      "groupBy",
      "having",
      "leftJoin",
      "rightJoin",
      "innerJoin",
      "fullJoin",
      "returning",
      "onConflictDoNothing",
      "onConflictDoUpdate",
      "for",
    ];

    for (const m of builderMethods) {
      chain[m] = vi.fn(() => chain);
    }

    chain.insert = vi.fn((table: unknown) => {
      captured.inserts.push(table);
      return chain;
    });
    chain.update = vi.fn((table: unknown) => {
      captured.updates.push(table);
      return chain;
    });
    chain.delete = vi.fn(() => {
      captured.deletes += 1;
      return chain;
    });
    chain.values = vi.fn((v: unknown) => {
      captured.values.push(v);
      return chain;
    });
    chain.set = vi.fn((v: unknown) => {
      captured.sets.push(v);
      return chain;
    });

    // Make the chain thenable so `await db.select()...` resolves to rows.
    chain.then = (
      onFulfilled?: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => {
      try {
        const rows = resolveResult();
        return Promise.resolve(rows).then(onFulfilled, onRejected);
      } catch (err) {
        return Promise.reject(err).then(onFulfilled, onRejected);
      }
    };
    chain.execute = vi.fn(() => Promise.resolve(resolveResult()));

    // Transaction support: db.transaction(async (tx) => ...) — pass the chain as tx.
    chain.transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(chain));

    return chain;
  };

  const mockDb = makeChain() as MockDbController["mockDb"];

  return {
    mockDb,
    setResult: (rows: unknown[]) => {
      defaultResult = rows;
    },
    queueResults: (...batches: unknown[][]) => {
      queue = batches;
    },
    captured,
    reset: () => {
      captured.inserts = [];
      captured.updates = [];
      captured.values = [];
      captured.sets = [];
      captured.deletes = 0;
      queue = null;
    },
  };
}

/**
 * Stub table objects so `import { projects, users } from "@/lib/db"` resolves.
 * Tables are only used as opaque references in drizzle calls, so empty objects
 * (with a name marker) are sufficient for route-level tests.
 */
export function tableStubs(...names: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of names) {
    out[n] = { _: { name: n } };
  }
  return out;
}
