import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, tableStubs } from "../helpers/mock-db";

const { mockDb, setResult, captured, reset } = createMockDb();

vi.mock("@/lib/db", () => ({
  db: mockDb,
  ...tableStubs("projects", "segments", "users"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  desc: vi.fn(() => "desc"),
}));

let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  reset();
  const mod = await import("@/app/api/projects/route");
  GET = mod.GET;
  POST = mod.POST;
});

describe("GET /api/projects", () => {
  it("returns all projects and a count", async () => {
    setResult([{ id: "1", title: "A" }, { id: "2", title: "B" }]);
    const req = new NextRequest("http://localhost/api/projects");
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.count).toBe(2);
    expect(data.projects).toHaveLength(2);
  });

  it("filters by userId when provided", async () => {
    setResult([{ id: "1", title: "A", userId: "u1" }]);
    const req = new NextRequest("http://localhost/api/projects?userId=u1");
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.count).toBe(1);
  });
});

describe("POST /api/projects", () => {
  it("rejects missing title with 400", async () => {
    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates a project with 201 and captures the insert", async () => {
    setResult([{ id: "new", title: "My Pod", status: "created" }]);
    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ title: "My Pod" }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.project.title).toBe("My Pod");
    expect(captured.values[0]).toMatchObject({ title: "My Pod", status: "created" });
  });
});
