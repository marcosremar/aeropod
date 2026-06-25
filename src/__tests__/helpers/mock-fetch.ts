/**
 * Helpers for mocking global.fetch in component tests.
 */
import { vi } from "vitest";

export interface RouteResponse {
  status?: number;
  ok?: boolean;
  json?: unknown;
}

/**
 * Install a global.fetch mock that routes by URL substring.
 * Each handler is matched in insertion order; the first substring match wins.
 *
 *   mockFetchRoutes({
 *     "/api/projects/1/clips": { json: { success: true, clips: [] } },
 *     "/api/projects/1/enhance": { json: { success: true, presets: [] } },
 *   });
 */
export function mockFetchRoutes(
  routes: Record<string, RouteResponse | ((url: string, init?: RequestInit) => RouteResponse)>
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, resp] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        const r = typeof resp === "function" ? resp(url, init) : resp;
        return makeResponse(r);
      }
    }
    // Default: empty 200
    return makeResponse({ json: {} });
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function makeResponse(r: RouteResponse): Response {
  const status = r.status ?? 200;
  const ok = r.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: async () => r.json ?? {},
    text: async () => JSON.stringify(r.json ?? {}),
  } as Response;
}

/** Restore fetch after tests. */
export function restoreFetch(): void {
  vi.restoreAllMocks();
}
