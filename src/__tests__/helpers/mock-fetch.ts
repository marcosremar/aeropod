import { vi } from "vitest";

/**
 * Helpers for stubbing global.fetch in component tests.
 */

type JsonInit = { status?: number; ok?: boolean; headers?: Record<string, string> };

/** Build a Response-like object resolving to the given JSON. */
export function jsonResponse(data: unknown, init: JsonInit = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob([JSON.stringify(data)]),
  } as unknown as Response;
}

/**
 * Install a fetch mock that routes by a (method, urlSubstring) -> response map,
 * or a single function handler `(url, init) => Response`.
 */
export function mockFetch(
  handler:
    | ((url: string, init?: RequestInit) => unknown)
    | Record<string, unknown>
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (typeof handler === "function") {
      const res = handler(url, init);
      return res instanceof Promise ? await res : res;
    }
    // map mode: keys are url substrings
    for (const key of Object.keys(handler)) {
      if (url.includes(key)) {
        const v = handler[key];
        return v instanceof Promise ? await v : v;
      }
    }
    return jsonResponse({}, { status: 404, ok: false });
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** Restore fetch after tests. */
export function restoreFetch(): void {
  vi.restoreAllMocks();
}
