import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    chatMessages: "chat_messages_table",
  };
});

import { db } from "@/lib/db";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUID = "not-a-uuid";

const SAMPLE_MESSAGES = [
  {
    id: "msg-1",
    projectId: VALID_UUID,
    role: "user",
    content: "Hello!",
    actions: null,
    isDeleted: false,
    createdAt: new Date("2024-01-01T10:00:00Z"),
    updatedAt: new Date("2024-01-01T10:00:00Z"),
  },
  {
    id: "msg-2",
    projectId: VALID_UUID,
    role: "assistant",
    content: "Hi there!",
    actions: null,
    isDeleted: false,
    createdAt: new Date("2024-01-01T10:01:00Z"),
    updatedAt: new Date("2024-01-01T10:01:00Z"),
  },
];

// ---------------------------------------------------------------------------
// GET /api/chat/[projectId]
// ---------------------------------------------------------------------------

describe("GET /api/chat/[projectId]", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ projectId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/chat/[projectId]/route");
    GET = module.GET;
  });

  it("returns 400 for an invalid UUID", async () => {
    const req = new NextRequest(
      `http://localhost/api/chat/${INVALID_UUID}`
    );
    const ctx = { params: Promise.resolve({ projectId: INVALID_UUID }) };

    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid project ID format/i);
  });

  it("returns 200 with empty messages when no messages exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as ReturnType<typeof db.select>);

    const req = new NextRequest(`http://localhost/api/chat/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ projectId: VALID_UUID }) };

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toEqual([]);
  });

  it("returns 200 with mapped messages", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain(SAMPLE_MESSAGES) as ReturnType<typeof db.select>
    );

    const req = new NextRequest(`http://localhost/api/chat/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ projectId: VALID_UUID }) };

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].role).toBe("user");
    expect(data.messages[0].content).toBe("Hello!");
    expect(data.messages[1].role).toBe("assistant");
    expect(data.messages[1].content).toBe("Hi there!");
  });

  it("returns 200 and each message has role, content, actions, and timestamp", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain(SAMPLE_MESSAGES) as ReturnType<typeof db.select>
    );

    const req = new NextRequest(`http://localhost/api/chat/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ projectId: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();
    const msg = data.messages[0];
    expect(msg).toHaveProperty("role");
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("actions");
    expect(msg).toHaveProperty("timestamp");
  });

  it("returns 500 when database throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB failure");
    });

    const req = new NextRequest(`http://localhost/api/chat/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ projectId: VALID_UUID }) };

    const res = await GET(req, ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/chat/[projectId]
// ---------------------------------------------------------------------------

describe("DELETE /api/chat/[projectId]", () => {
  let DELETE: (
    req: NextRequest,
    ctx: { params: Promise<{ projectId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/chat/[projectId]/route");
    DELETE = module.DELETE;
  });

  it("returns 400 for an invalid UUID", async () => {
    const req = new NextRequest(
      `http://localhost/api/chat/${INVALID_UUID}`,
      { method: "DELETE" }
    );
    const ctx = { params: Promise.resolve({ projectId: INVALID_UUID }) };

    const res = await DELETE(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid project ID format/i);
  });

  it("returns 200 and soft-deletes messages for a valid UUID", async () => {
    vi.mocked(db.update).mockReturnValue(
      buildUpdateChain() as ReturnType<typeof db.update>
    );

    const req = new NextRequest(
      `http://localhost/api/chat/${VALID_UUID}`,
      { method: "DELETE" }
    );
    const ctx = { params: Promise.resolve({ projectId: VALID_UUID }) };

    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toMatch(/cleared/i);
  });

  it("calls db.update for soft delete (not db.delete)", async () => {
    const updateMock = vi.mocked(db.update).mockReturnValue(
      buildUpdateChain() as ReturnType<typeof db.update>
    );

    const req = new NextRequest(
      `http://localhost/api/chat/${VALID_UUID}`,
      { method: "DELETE" }
    );
    const ctx = { params: Promise.resolve({ projectId: VALID_UUID }) };

    await DELETE(req, ctx);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when database update throws", async () => {
    vi.mocked(db.update).mockImplementation(() => {
      throw new Error("DB failure");
    });

    const req = new NextRequest(
      `http://localhost/api/chat/${VALID_UUID}`,
      { method: "DELETE" }
    );
    const ctx = { params: Promise.resolve({ projectId: VALID_UUID }) };

    const res = await DELETE(req, ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
