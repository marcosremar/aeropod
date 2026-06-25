import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetDb, queueResults, getInserts } from "../helpers/mock-db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, db: mockDb, getDb: () => mockDb };
});

beforeEach(() => resetDb());

describe("GET /api/projects", () => {
  it("returns the list of projects with a count", async () => {
    const { GET } = await import("@/app/api/projects/route");
    queueResults([
      { id: "p1", title: "A" },
      { id: "p2", title: "B" },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/projects"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.count).toBe(2);
    expect(data.projects).toHaveLength(2);
  });

  it("supports filtering by userId", async () => {
    const { GET } = await import("@/app/api/projects/route");
    queueResults([{ id: "p1", title: "A", userId: "u1" }]);

    const res = await GET(
      new NextRequest("http://localhost/api/projects?userId=u1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.count).toBe(1);
  });
});

describe("POST /api/projects", () => {
  it("creates a project from a valid payload", async () => {
    const { POST } = await import("@/app/api/projects/route");
    queueResults([{ id: "new", title: "My Podcast", status: "created" }]);

    const res = await POST(
      new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ title: "My Podcast" }),
        headers: { "content-type": "application/json" },
      })
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.project.title).toBe("My Podcast");
    const inserted = getInserts()[0] as { title: string; status: string };
    expect(inserted.title).toBe("My Podcast");
    expect(inserted.status).toBe("created");
  });

  it("rejects an empty title with 400", async () => {
    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid userId uuid with 400", async () => {
    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ title: "X", userId: "not-a-uuid" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });
});
