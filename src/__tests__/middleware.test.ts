/**
 * Unit tests for src/middleware.ts.
 *
 * The middleware function is a pure async function that receives a NextRequest and returns
 * a NextResponse. We exercise each routing branch without needing a real HTTP server.
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../../src/middleware";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(path: string, options: { cookie?: string; searchParams?: Record<string, string> } = {}): NextRequest {
  const url = new URL(`http://localhost${path}`);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }
  const headers: HeadersInit = {};
  if (options.cookie) {
    headers["cookie"] = options.cookie;
  }
  return new NextRequest(url.toString(), { headers });
}

function isNextResponse(response: Response): boolean {
  // A "pass-through" response from NextResponse.next() has no Location header
  return !response.headers.get("location");
}

function getRedirectTarget(response: Response): string | null {
  return response.headers.get("location");
}

// ─── Demo mode ───────────────────────────────────────────────────────────────

describe("middleware – demo mode (?demo=true)", () => {
  it("redirects to /api/auth/demo when ?demo=true is present", async () => {
    const request = makeRequest("/dashboard", { searchParams: { demo: "true" } });
    const response = await middleware(request);
    const location = getRedirectTarget(response);
    expect(location).not.toBeNull();
    expect(location).toContain("/api/auth/demo");
  });

  it("passes the original pathname as a redirect param", async () => {
    const request = makeRequest("/editor", { searchParams: { demo: "true" } });
    const response = await middleware(request);
    const location = getRedirectTarget(response);
    expect(location).not.toBeNull();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.searchParams.get("redirect")).toBe("/editor");
  });

  it("does NOT redirect when demo param is absent", async () => {
    const request = makeRequest("/dashboard");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("does NOT redirect when demo param is 'false'", async () => {
    const request = makeRequest("/dashboard", { searchParams: { demo: "false" } });
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });
});

// ─── Auth routes ─────────────────────────────────────────────────────────────

describe("middleware – auth routes", () => {
  it("allows /api/auth/login without redirect", async () => {
    const request = makeRequest("/api/auth/login");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /api/auth/logout without redirect", async () => {
    const request = makeRequest("/api/auth/logout");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /api/auth/me without redirect", async () => {
    const request = makeRequest("/api/auth/me");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /api/auth/demo without redirect", async () => {
    const request = makeRequest("/api/auth/demo");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows sub-paths under /api/auth/login without redirect", async () => {
    const request = makeRequest("/api/auth/login/extra");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });
});

// ─── Public routes ───────────────────────────────────────────────────────────

describe("middleware – public routes (exact match)", () => {
  it("allows / (root) without redirect", async () => {
    const request = makeRequest("/");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /dashboard without redirect", async () => {
    const request = makeRequest("/dashboard");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /editor without redirect", async () => {
    const request = makeRequest("/editor");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /api/waitlist without redirect", async () => {
    const request = makeRequest("/api/waitlist");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });
});

describe("middleware – public routes (prefix/subroute match)", () => {
  it("allows /dashboard/settings (sub-path of /dashboard)", async () => {
    const request = makeRequest("/dashboard/settings");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /editor/project-id (sub-path of /editor)", async () => {
    const request = makeRequest("/editor/some-project-id");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /api/waitlist/confirm (sub-path of /api/waitlist)", async () => {
    const request = makeRequest("/api/waitlist/confirm");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("does NOT match /dashboardextra as a subroute of /dashboard", async () => {
    // /dashboardextra does not start with '/dashboard/', so it falls through
    // but since protectedRoutes is empty, it should still pass through
    const request = makeRequest("/dashboardextra");
    const response = await middleware(request);
    // falls through to NextResponse.next() at the bottom
    expect(isNextResponse(response)).toBe(true);
  });
});

// ─── Static files / Next.js internals ────────────────────────────────────────

describe("middleware – static files and Next.js internals", () => {
  it("allows /_next/... paths without redirect", async () => {
    const request = makeRequest("/_next/static/chunks/app.js");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows /static/... paths without redirect", async () => {
    const request = makeRequest("/static/images/logo.png");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows paths containing a dot (file extension) without redirect", async () => {
    const request = makeRequest("/favicon.ico");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("allows image files without redirect", async () => {
    const request = makeRequest("/uploads/my-audio.mp3");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });
});

// ─── Unprotected unknown routes ───────────────────────────────────────────────

describe("middleware – unprotected unknown routes", () => {
  it("passes through unknown routes since protectedRoutes is empty", async () => {
    const request = makeRequest("/some/unknown/route");
    const response = await middleware(request);
    // protectedRoutes = [] so no route is protected; falls through to NextResponse.next()
    expect(isNextResponse(response)).toBe(true);
  });

  it("passes through /api/projects without redirect", async () => {
    const request = makeRequest("/api/projects");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });

  it("passes through /api/upload without redirect", async () => {
    const request = makeRequest("/api/upload");
    const response = await middleware(request);
    expect(isNextResponse(response)).toBe(true);
  });
});
