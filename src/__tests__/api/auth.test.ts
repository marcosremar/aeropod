import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { db: mockDb, users: "users_table" };
});

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
  compare: vi.fn(),
}));

import { db } from "@/lib/db";
import * as sessionModule from "@/lib/auth/session";
import bcrypt from "bcryptjs";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_USER = {
  id: VALID_UUID,
  email: "user@example.com",
  name: "Test User",
  password: "$2b$10$hashedpassword",
  plan: "free",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/auth/login/route");
    POST = module.POST;
  });

  it("returns 400 when body is missing email", async () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 when email is invalid", async () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", password: "secret" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is empty", async () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when user is not found", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "unknown@example.com", password: "secret" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid email or password");
  });

  it("returns 401 when password is incorrect", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_USER]) as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "wrongpass" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid email or password");
  });

  it("returns 200 with user on successful login", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_USER]) as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(sessionModule.setSession).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "correctpass" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.email).toBe("user@example.com");
    expect(data.user.id).toBe(VALID_UUID);
  });

  it("calls setSession with correct user data on successful login", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_USER]) as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(sessionModule.setSession).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "correctpass" }),
    });
    await POST(req);

    expect(sessionModule.setSession).toHaveBeenCalledWith({
      userId: VALID_UUID,
      email: "user@example.com",
      name: "Test User",
      plan: "free",
    });
  });

  it("returns 500 when database throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "pass" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to login");
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/auth/logout/route");
    POST = module.POST;
  });

  it("returns 200 and success message on logout", async () => {
    vi.mocked(sessionModule.clearSession).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/logged out/i);
  });

  it("calls clearSession", async () => {
    vi.mocked(sessionModule.clearSession).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
    });
    await POST(req);
    expect(sessionModule.clearSession).toHaveBeenCalledOnce();
  });

  it("returns 500 when clearSession throws", async () => {
    vi.mocked(sessionModule.clearSession).mockRejectedValue(
      new Error("Cookie failure")
    );

    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to logout");
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe("GET /api/auth/me", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/auth/me/route");
    GET = module.GET;
  });

  it("returns 401 when no session exists", async () => {
    vi.mocked(sessionModule.getSession).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/auth/me");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Not authenticated");
  });

  it("returns 200 with user data when session is valid", async () => {
    vi.mocked(sessionModule.getSession).mockResolvedValue({
      userId: VALID_UUID,
      email: "user@example.com",
      name: "Test User",
      plan: "free",
    });

    const req = new NextRequest("http://localhost/api/auth/me");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.id).toBe(VALID_UUID);
    expect(data.user.email).toBe("user@example.com");
    expect(data.user.name).toBe("Test User");
    expect(data.user.plan).toBe("free");
  });

  it("returns 200 when session has no optional name/plan", async () => {
    vi.mocked(sessionModule.getSession).mockResolvedValue({
      userId: VALID_UUID,
      email: "user@example.com",
    });

    const req = new NextRequest("http://localhost/api/auth/me");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.id).toBe(VALID_UUID);
    expect(data.user.email).toBe("user@example.com");
  });

  it("returns 500 when getSession throws", async () => {
    vi.mocked(sessionModule.getSession).mockRejectedValue(
      new Error("Cookie parse error")
    );

    const req = new NextRequest("http://localhost/api/auth/me");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to get user");
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/demo
// ---------------------------------------------------------------------------

describe("GET /api/auth/demo", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/auth/demo/route");
    GET = module.GET;
  });

  it("redirects to /dashboard by default", async () => {
    const req = new NextRequest("http://localhost/api/auth/demo");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/dashboard");
  });

  it("redirects to custom path when redirect param is provided", async () => {
    const req = new NextRequest(
      "http://localhost/api/auth/demo?redirect=/editor/123"
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/editor/123");
  });

  it("sets the aeropod_session cookie with demo user data", async () => {
    const req = new NextRequest("http://localhost/api/auth/demo");
    const res = await GET(req);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("aeropod_session");
    // Cookie value is URL-encoded so @ becomes %40
    expect(setCookie).toContain("demo%40aeropod.com");
  });
});
