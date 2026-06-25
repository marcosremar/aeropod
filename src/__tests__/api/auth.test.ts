import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { mockDb, resetDb, queueResults, getInserts } from "../helpers/mock-db";

// Mock the DB module — keep real schema table objects, swap the db proxy.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, db: mockDb, getDb: () => mockDb };
});

// Mock next/headers cookie store used by setSession().
const cookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: cookieSet,
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

beforeEach(() => {
  resetDb();
  cookieSet.mockClear();
});

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/login", () => {
  it("logs in a valid user and sets a session cookie", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const hash = bcrypt.hashSync("secret123", 10);
    queueResults([
      { id: "u1", email: "a@b.com", password: hash, name: "A", plan: "free" },
    ]);

    const res = await POST(
      jsonReq("http://localhost/api/auth/login", {
        email: "a@b.com",
        password: "secret123",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.email).toBe("a@b.com");
    expect(cookieSet).toHaveBeenCalled();
  });

  it("rejects an invalid password with 401", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const hash = bcrypt.hashSync("secret123", 10);
    queueResults([{ id: "u1", email: "a@b.com", password: hash, plan: "free" }]);

    const res = await POST(
      jsonReq("http://localhost/api/auth/login", {
        email: "a@b.com",
        password: "wrong",
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unknown user with 401", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    queueResults([]); // no user found

    const res = await POST(
      jsonReq("http://localhost/api/auth/login", {
        email: "ghost@b.com",
        password: "secret123",
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects an invalid email format with 400", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      jsonReq("http://localhost/api/auth/login", {
        email: "not-an-email",
        password: "x",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/register", () => {
  it("creates a new user with a hashed password", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    // 1st await: existing-user check -> none; 2nd await: insert returning
    queueResults(
      [],
      [{ id: "u2", email: "new@b.com", name: "new", plan: "free" }]
    );

    const res = await POST(
      jsonReq("http://localhost/api/auth/register", {
        email: "new@b.com",
        password: "password1",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // password must be hashed, never stored in plaintext
    const inserted = getInserts()[0] as { password: string };
    expect(inserted.password).toBeDefined();
    expect(inserted.password).not.toBe("password1");
    expect(bcrypt.compareSync("password1", inserted.password)).toBe(true);
  });

  it("rejects a duplicate email with 409", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    queueResults([{ id: "u1", email: "dupe@b.com" }]);

    const res = await POST(
      jsonReq("http://localhost/api/auth/register", {
        email: "dupe@b.com",
        password: "password1",
      })
    );
    expect(res.status).toBe(409);
  });

  it("rejects a short password with 400", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(
      jsonReq("http://localhost/api/auth/register", {
        email: "x@b.com",
        password: "123",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/demo", () => {
  it("redirects and sets an httpOnly session cookie", async () => {
    const { GET } = await import("@/app/api/auth/demo/route");
    const res = await GET(
      new NextRequest("http://localhost/api/auth/demo?redirect=/dashboard")
    );
    // Redirect response
    expect([302, 307]).toContain(res.status);
    const cookie = res.cookies.get("aeropod_session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
  });
});
