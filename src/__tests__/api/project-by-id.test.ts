import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetDb, queueResults, getDeleteCount } from "../helpers/mock-db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, db: mockDb, getDb: () => mockDb };
});

const UUID = "22222222-2222-2222-2222-222222222222";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => resetDb());

describe("GET /api/projects/[id]", () => {
  it("rejects an invalid UUID with 400", async () => {
    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(
      new NextRequest("http://localhost/api/projects/bad"),
      params("bad")
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the project is missing", async () => {
    queueResults([]); // project lookup -> none
    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/projects/${UUID}`),
      params(UUID)
    );
    expect(res.status).toBe(404);
  });

  it("returns the project with its segments", async () => {
    queueResults(
      [{ id: UUID, title: "P" }], // project
      [{ id: "s1", projectId: UUID }] // segments
    );
    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/projects/${UUID}`),
      params(UUID)
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.project.id).toBe(UUID);
    expect(data.segments).toHaveLength(1);
  });
});

describe("DELETE /api/projects/[id]", () => {
  it("rejects an invalid UUID with 400", async () => {
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/projects/bad", { method: "DELETE" }),
      params("bad")
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when deleting a missing project", async () => {
    queueResults([]); // existence check -> none
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(
      new NextRequest(`http://localhost/api/projects/${UUID}`, { method: "DELETE" }),
      params(UUID)
    );
    expect(res.status).toBe(404);
  });

  it("deletes an existing project", async () => {
    queueResults([{ id: UUID }]); // existence check -> found
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(
      new NextRequest(`http://localhost/api/projects/${UUID}`, { method: "DELETE" }),
      params(UUID)
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toMatch(/deleted/i);
    expect(getDeleteCount()).toBeGreaterThan(0);
  });
});
