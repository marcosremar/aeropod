import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
    segments: "segments_table",
  };
});

import { db } from "@/lib/db";

function buildSelectChain(returnValue: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    orderBy: vi.fn().mockResolvedValue(returnValue),
  };
  return chain;
}

function buildInsertChain(returnValue: unknown[]) {
  const chain: Record<string, unknown> = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
  return chain;
}

function buildUpdateChain() {
  const chain: Record<string, unknown> = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  return chain;
}

function buildDeleteChain() {
  const chain: Record<string, unknown> = {
    where: vi.fn().mockResolvedValue([]),
  };
  return chain;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "660e8400-e29b-41d4-a716-446655440001";
const SEG_UUID_1 = "550e8400-e29b-41d4-a716-000000000001";
const SEG_UUID_2 = "550e8400-e29b-41d4-a716-000000000002";
const INVALID_UUID = "not-a-uuid";

const SAMPLE_PROJECT = {
  id: VALID_UUID,
  title: "My Podcast Episode",
  status: "ready",
  userId: null,
  targetDuration: null,
  originalAudioUrl: "/audio/test.mp3",
  editedAudioUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_SEGMENTS = [
  {
    id: SEG_UUID_1,
    projectId: VALID_UUID,
    startTime: 0,
    endTime: 30,
    order: 1,
    isSelected: true,
    text: "Hello world",
    speaker: null,
    createdAt: new Date(),
  },
  {
    id: SEG_UUID_2,
    projectId: VALID_UUID,
    startTime: 30,
    endTime: 60,
    order: 2,
    isSelected: false,
    text: "Second segment",
    speaker: null,
    createdAt: new Date(),
  },
];

describe("Projects API – GET /api/projects", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/route");
    GET = module.GET;
  });

  it("returns all projects when no userId is provided", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);

    const req = new NextRequest("http://localhost/api/projects");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.projects).toHaveLength(1);
    expect(data.count).toBe(1);
  });

  it("filters by userId when provided as query param", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);

    const req = new NextRequest(`http://localhost/api/projects?userId=${VALID_UUID_2}`);
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.count).toBe(1);
  });

  it("returns empty list when no projects exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest("http://localhost/api/projects");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.projects).toHaveLength(0);
    expect(data.count).toBe(0);
  });

  it("returns 500 when DB throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const req = new NextRequest("http://localhost/api/projects");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to fetch/i);
  });
});

describe("Projects API – POST /api/projects", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/route");
    POST = module.POST;
  });

  it("creates a project with a valid title", async () => {
    const created = { ...SAMPLE_PROJECT, title: "New Episode" };
    vi.mocked(db.insert).mockReturnValue(buildInsertChain([created]) as any);

    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ title: "New Episode" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.project.title).toBe("New Episode");
    expect(data.message).toMatch(/created successfully/i);
  });

  it("returns 400 when title is missing", async () => {
    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/invalid input/i);
  });

  it("returns 400 when title is empty string", async () => {
    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ title: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.details).toBeDefined();
  });

  it("accepts optional targetDuration", async () => {
    const created = { ...SAMPLE_PROJECT, targetDuration: 1800 };
    vi.mocked(db.insert).mockReturnValue(buildInsertChain([created]) as any);

    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ title: "Episode", targetDuration: 1800 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.project.targetDuration).toBe(1800);
  });

  it("returns 400 when userId is not a valid UUID", async () => {
    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ title: "Episode", userId: "bad-user-id" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.details).toBeDefined();
  });

  it("returns 500 when DB throws on insert", async () => {
    vi.mocked(db.insert).mockImplementation(() => {
      throw new Error("insert failed");
    });

    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ title: "Episode" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to create/i);
  });
});

describe("Projects API – GET /api/projects/[id]", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/route");
    GET = module.GET;
  });

  it("returns 400 for an invalid UUID", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${INVALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: INVALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/invalid project id/i);
  });

  it("returns 404 when project is not found", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns project and its segments on success", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.project.id).toBe(VALID_UUID);
    expect(data.segments).toHaveLength(2);
  });

  it("returns project with empty segments array when no segments exist", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChain([]) as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.segments).toHaveLength(0);
  });

  it("returns 500 when DB throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB error");
    });

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to fetch/i);
  });
});

describe("Projects API – PATCH /api/projects/[id]", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/route");
    PATCH = module.PATCH;
  });

  it("returns 400 for an invalid UUID", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${INVALID_UUID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "New Title" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: INVALID_UUID }) };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/invalid project id/i);
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it("updates the project title and returns the updated project", async () => {
    const updatedProject = { ...SAMPLE_PROJECT, title: "Updated Title" };

    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any) // existence check
      .mockReturnValueOnce(buildSelectChain([updatedProject]) as any) // after update
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any); // segments

    vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated Title" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.project.title).toBe("Updated Title");
    expect(data.message).toMatch(/updated successfully/i);
  });

  it("returns 400 when body has invalid field types", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`, {
      method: "PATCH",
      body: JSON.stringify({ targetDuration: "not-a-number" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/invalid input/i);
  });

  it("selects specified segments and deselects others", async () => {
    const updatedProject = { ...SAMPLE_PROJECT };

    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChain([updatedProject]) as any)
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);

    vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`, {
      method: "PATCH",
      body: JSON.stringify({ selectedSegments: [SEG_UUID_1] }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    // update should have been called: deselect all + select seg-1
    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(2);
  });
});

describe("Projects API – DELETE /api/projects/[id]", () => {
  let DELETE: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/route");
    DELETE = module.DELETE;
  });

  it("returns 400 for an invalid UUID", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${INVALID_UUID}`, {
      method: "DELETE",
    });
    const ctx = { params: Promise.resolve({ id: INVALID_UUID }) };

    const res = await DELETE(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/invalid project id/i);
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`, {
      method: "DELETE",
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await DELETE(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it("deletes the project and returns a success message", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
    vi.mocked(db.delete).mockReturnValue(buildDeleteChain() as any);

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`, {
      method: "DELETE",
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await DELETE(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toMatch(/deleted successfully/i);
  });

  it("returns 500 when DB throws on delete", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
    vi.mocked(db.delete).mockImplementation(() => {
      throw new Error("delete failed");
    });

    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}`, {
      method: "DELETE",
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await DELETE(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to/i);
  });
});
