/**
 * Unit tests for src/lib/auth/session.ts
 * Mocks next/headers, @/lib/db, and @/lib/db/schema so no real I/O occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks ─────────────────────────────────────────────────────────────

const { mockCookieGet, mockCookieSet, mockCookieDelete, mockCookies } =
  vi.hoisted(() => {
    const mockCookieGet = vi.fn();
    const mockCookieSet = vi.fn();
    const mockCookieDelete = vi.fn();
    const mockCookieStore = {
      get: mockCookieGet,
      set: mockCookieSet,
      delete: mockCookieDelete,
    };
    const mockCookies = vi.fn().mockResolvedValue(mockCookieStore);
    return { mockCookieGet, mockCookieSet, mockCookieDelete, mockCookies };
  });

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("@/lib/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert },
}));

vi.mock("@/lib/db/schema", () => ({
  users: "users_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import {
  generateSessionId,
  getSession,
  setSession,
  clearSession,
  getOrCreateUser,
} from "@/lib/auth/session";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_COOKIE_NAME = "aeropod_session";

const SAMPLE_USER = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  plan: "free",
};

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildInsertChain(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeValidCookieValue(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    userId: SAMPLE_USER.id,
    email: SAMPLE_USER.email,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateSessionId", () => {
  it("returns a 64-character hex string", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value each call", () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe("getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no session cookie is present", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const result = await getSession();

    expect(result).toBeNull();
    expect(mockCookieGet).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("returns null when cookie value is empty", async () => {
    mockCookieGet.mockReturnValue({ value: "" });

    const result = await getSession();

    expect(result).toBeNull();
  });

  it("returns null and clears session when session is expired", async () => {
    const expired = makeValidCookieValue({ expiresAt: Date.now() - 1000 });
    mockCookieGet.mockReturnValue({ value: expired });

    const result = await getSession();

    expect(result).toBeNull();
    expect(mockCookieDelete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("returns null and clears session when user does not exist in DB", async () => {
    mockCookieGet.mockReturnValue({ value: makeValidCookieValue() });
    mockDbSelect.mockReturnValue(buildSelectChain([]));

    const result = await getSession();

    expect(result).toBeNull();
    expect(mockCookieDelete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("returns session data when cookie is valid and user exists", async () => {
    mockCookieGet.mockReturnValue({ value: makeValidCookieValue() });
    mockDbSelect.mockReturnValue(buildSelectChain([SAMPLE_USER]));

    const result = await getSession();

    expect(result).toEqual({
      userId: SAMPLE_USER.id,
      email: SAMPLE_USER.email,
      name: SAMPLE_USER.name,
      plan: SAMPLE_USER.plan,
    });
  });

  it("omits name and plan when user has null values", async () => {
    mockCookieGet.mockReturnValue({ value: makeValidCookieValue() });
    mockDbSelect.mockReturnValue(
      buildSelectChain([{ ...SAMPLE_USER, name: null, plan: null }])
    );

    const result = await getSession();

    expect(result?.name).toBeUndefined();
    expect(result?.plan).toBeUndefined();
  });

  it("returns null and does not throw when cookies() rejects", async () => {
    mockCookies.mockRejectedValueOnce(new Error("Headers unavailable"));

    const result = await getSession();

    expect(result).toBeNull();
  });

  it("returns null and does not throw when JSON.parse fails", async () => {
    mockCookieGet.mockReturnValue({ value: "not-json" });

    const result = await getSession();

    expect(result).toBeNull();
  });

  it("proceeds normally when session has no expiresAt field", async () => {
    const noExpiry = JSON.stringify({
      userId: SAMPLE_USER.id,
      email: SAMPLE_USER.email,
    });
    mockCookieGet.mockReturnValue({ value: noExpiry });
    mockDbSelect.mockReturnValue(buildSelectChain([SAMPLE_USER]));

    const result = await getSession();

    expect(result).not.toBeNull();
    expect(result?.userId).toBe(SAMPLE_USER.id);
  });
});

// ---------------------------------------------------------------------------
// setSession
// ---------------------------------------------------------------------------

describe("setSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls cookieStore.set with the session cookie name", async () => {
    await setSession({
      userId: "user-1",
      email: "a@b.com",
    });

    expect(mockCookieSet).toHaveBeenCalledOnce();
    const [name] = mockCookieSet.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
  });

  it("serialises session fields into the cookie value", async () => {
    await setSession({
      userId: "user-1",
      email: "a@b.com",
      name: "Alice",
      plan: "pro",
    });

    const [, rawValue] = mockCookieSet.mock.calls[0];
    const parsed = JSON.parse(rawValue as string);
    expect(parsed.userId).toBe("user-1");
    expect(parsed.email).toBe("a@b.com");
    expect(parsed.name).toBe("Alice");
    expect(parsed.plan).toBe("pro");
  });

  it("sets an expiresAt value in the future", async () => {
    const before = Date.now();
    await setSession({ userId: "u", email: "x@y.com" });
    const after = Date.now();

    const [, rawValue] = mockCookieSet.mock.calls[0];
    const parsed = JSON.parse(rawValue as string);
    expect(parsed.expiresAt).toBeGreaterThan(before);
    expect(parsed.expiresAt).toBeLessThanOrEqual(
      after + 30 * 24 * 60 * 60 * 1000 + 100
    );
  });

  it("sets httpOnly and lax sameSite options", async () => {
    await setSession({ userId: "u", email: "x@y.com" });

    const [, , options] = mockCookieSet.mock.calls[0];
    expect((options as Record<string, unknown>).httpOnly).toBe(true);
    expect((options as Record<string, unknown>).sameSite).toBe("lax");
    expect((options as Record<string, unknown>).path).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// clearSession
// ---------------------------------------------------------------------------

describe("clearSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls cookieStore.delete with the session cookie name", async () => {
    await clearSession();

    expect(mockCookieDelete).toHaveBeenCalledOnce();
    expect(mockCookieDelete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });
});

// ---------------------------------------------------------------------------
// getOrCreateUser
// ---------------------------------------------------------------------------

describe("getOrCreateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing user when found in DB", async () => {
    mockDbSelect.mockReturnValue(buildSelectChain([SAMPLE_USER]));

    const result = await getOrCreateUser(SAMPLE_USER.email);

    expect(result).toEqual(SAMPLE_USER);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("inserts and returns a new user when not found", async () => {
    const newUser = { ...SAMPLE_USER, id: "new-user-id" };
    mockDbSelect.mockReturnValue(buildSelectChain([]));
    mockDbInsert.mockReturnValue(buildInsertChain([newUser]));

    const result = await getOrCreateUser(SAMPLE_USER.email);

    expect(result).toEqual(newUser);
    expect(mockDbInsert).toHaveBeenCalledOnce();
  });

  it("uses email prefix as name when no name is provided", async () => {
    const newUser = { ...SAMPLE_USER, name: "test" };
    mockDbSelect.mockReturnValue(buildSelectChain([]));
    const insertChain = buildInsertChain([newUser]);
    mockDbInsert.mockReturnValue(insertChain);

    await getOrCreateUser("test@example.com");

    const valuesSpy = vi.mocked(insertChain.values);
    const inserted = (valuesSpy.mock.calls[0][0] as Record<string, unknown>);
    expect(inserted.name).toBe("test");
  });

  it("uses provided name when given", async () => {
    const newUser = { ...SAMPLE_USER, name: "Custom Name" };
    mockDbSelect.mockReturnValue(buildSelectChain([]));
    const insertChain = buildInsertChain([newUser]);
    mockDbInsert.mockReturnValue(insertChain);

    await getOrCreateUser("test@example.com", "Custom Name");

    const valuesSpy = vi.mocked(insertChain.values);
    const inserted = (valuesSpy.mock.calls[0][0] as Record<string, unknown>);
    expect(inserted.name).toBe("Custom Name");
  });

  it("sets plan to 'free' for new users", async () => {
    mockDbSelect.mockReturnValue(buildSelectChain([]));
    const insertChain = buildInsertChain([SAMPLE_USER]);
    mockDbInsert.mockReturnValue(insertChain);

    await getOrCreateUser("new@example.com");

    const valuesSpy = vi.mocked(insertChain.values);
    const inserted = (valuesSpy.mock.calls[0][0] as Record<string, unknown>);
    expect(inserted.plan).toBe("free");
  });
});
