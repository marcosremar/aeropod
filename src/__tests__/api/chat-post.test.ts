import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Hoist mocks ──────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockProcessMessage } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockProcessMessage: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert },
  chatMessages: "chat_messages_table",
  segments: "segments_table",
  projects: "projects_table",
  projectTemplates: "project_templates_table",
  projectSections: "project_sections_table",
  sectionSegments: "section_segments_table",
  templates: "templates_table",
  templateSections: "template_sections_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("@/lib/ai/editor-chat", () => ({
  getEditorChatService: () => ({
    processMessage: mockProcessMessage,
  }),
}));

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "660e8400-e29b-41d4-a716-446655440001";

// Chain that terminates at .limit() — for queries like .where().orderBy().limit()
function buildSelectChainEndsAtLimit(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    innerJoin: vi.fn().mockReturnThis(),
  };
}

// Chain that terminates at .orderBy() — for queries like .where().orderBy()
function buildSelectChainEndsAtOrderBy(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(returnValue),
    limit: vi.fn().mockResolvedValue(returnValue),
    innerJoin: vi.fn().mockReturnThis(),
  };
}

function buildInsertChain() {
  return { values: vi.fn().mockResolvedValue([]) };
}

const VALID_BODY = {
  projectId: VALID_UUID,
  userId: VALID_UUID_2,
  message: "Help me edit my podcast",
};

function makePostRequest(body: object) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

describe("POST /api/chat", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/chat/route");
    POST = module.POST;
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(makePostRequest({ userId: VALID_UUID_2, message: "hello" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid input/i);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await POST(makePostRequest({ projectId: VALID_UUID, message: "hello" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid input/i);
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makePostRequest({ projectId: VALID_UUID, userId: VALID_UUID_2 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is an empty string", async () => {
    const res = await POST(makePostRequest({ ...VALID_BODY, message: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when projectId is not a valid UUID", async () => {
    const res = await POST(makePostRequest({ projectId: "not-a-uuid", userId: VALID_UUID_2, message: "hi" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid input");
  });

  it("returns 400 when userId is not a valid UUID", async () => {
    const res = await POST(makePostRequest({ projectId: VALID_UUID, userId: "bad-id", message: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is not user or assistant", async () => {
    const res = await POST(makePostRequest({ ...VALID_BODY, role: "system" }));
    expect(res.status).toBe(400);
  });

  // ── skipAI path ─────────────────────────────────────────────────────────────

  it("saves message and returns 200 success when skipAI is true", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    const res = await POST(makePostRequest({ ...VALID_BODY, skipAI: true }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/saved/i);
  });

  it("inserts exactly one message when skipAI is true", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    await POST(makePostRequest({ ...VALID_BODY, skipAI: true }));
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it("uses provided role when skipAI is true with role=assistant", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    const res = await POST(makePostRequest({ ...VALID_BODY, skipAI: true, role: "assistant" }));
    expect(res.status).toBe(200);
  });

  // ── No-segments path ────────────────────────────────────────────────────────

  it("returns 200 with a fallback response when project has no segments", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    // First select: chatMessages history (ends at .limit()); Second: segments (ends at .orderBy())
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy([]) as any);

    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.response).toBe("string");
    expect(data.response.length).toBeGreaterThan(0);
  });

  it("includes rich quick_actions content when no segments exist", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy([]) as any);

    const res = await POST(makePostRequest(VALID_BODY));
    const data = await res.json();
    expect(Array.isArray(data.richContent)).toBe(true);
    const hasQuickActions = data.richContent.some((c: any) => c.type === "quick_actions");
    expect(hasQuickActions).toBe(true);
  });

  it("does NOT call processMessage when no segments exist", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy([]) as any);

    await POST(makePostRequest(VALID_BODY));
    expect(mockProcessMessage).not.toHaveBeenCalled();
  });

  // ── Normal AI chat path ─────────────────────────────────────────────────────

  it("returns 200 with AI response and rich content for a normal chat message", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    const mockSegments = [
      { id: "seg-1", text: "Welcome to the show", topic: "intro", startTime: 0, endTime: 10, isSelected: true, interestScore: 8 },
    ];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)            // history
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy(mockSegments) as any); // segments

    mockProcessMessage.mockResolvedValue({ response: "Great podcast!", actions: [] });

    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response).toBe("Great podcast!");
    expect(Array.isArray(data.actions)).toBe(true);
    expect(Array.isArray(data.richContent)).toBe(true);
  });

  it("passes the user message to processMessage", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    const mockSegments = [
      { id: "seg-1", text: "test segment", topic: null, startTime: 0, endTime: 5, isSelected: false, interestScore: 5 },
    ];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy(mockSegments) as any);

    mockProcessMessage.mockResolvedValue({ response: "ok", actions: [] });

    await POST(makePostRequest({ ...VALID_BODY, message: "What's the best segment?" }));
    expect(mockProcessMessage).toHaveBeenCalledWith(
      "What's the best segment?",
      expect.any(Array),
      expect.any(Array)
    );
  });

  it("includes quick_actions in richContent for normal AI response", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    const mockSegments = [
      { id: "seg-1", text: "content", topic: "main", startTime: 0, endTime: 60, isSelected: true, interestScore: 7 },
    ];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy(mockSegments) as any);

    mockProcessMessage.mockResolvedValue({ response: "Done", actions: [{ type: "select_segment", segmentId: "seg-1" }] });

    const res = await POST(makePostRequest(VALID_BODY));
    const data = await res.json();
    const quickActionsBlock = data.richContent.find((c: any) => c.type === "quick_actions");
    expect(quickActionsBlock).toBeDefined();
    expect(Array.isArray(quickActionsBlock.data.actions)).toBe(true);
  });

  it("inserts two messages (user + assistant) during normal AI chat", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    const mockSegments = [
      { id: "seg-1", text: "hi", topic: null, startTime: 0, endTime: 2, isSelected: false, interestScore: 3 },
    ];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy(mockSegments) as any);

    mockProcessMessage.mockResolvedValue({ response: "reply", actions: [] });

    await POST(makePostRequest(VALID_BODY));
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns 500 when db.insert throws during message save", async () => {
    mockDbInsert.mockImplementation(() => { throw new Error("DB write failure"); });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/Chat processing failed/i);
  });

  it("returns 500 when AI processMessage rejects", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    const mockSegments = [
      { id: "seg-1", text: "text", topic: null, startTime: 0, endTime: 5, isSelected: false, interestScore: 5 },
    ];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainEndsAtLimit([]) as any)
      .mockReturnValueOnce(buildSelectChainEndsAtOrderBy(mockSegments) as any);

    mockProcessMessage.mockRejectedValue(new Error("AI service down"));

    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/Chat processing failed/i);
    expect(typeof data.details).toBe("string");
  });

  it("returns 500 when db.select throws during history fetch", async () => {
    mockDbInsert.mockReturnValue(buildInsertChain());
    mockDbSelect.mockImplementation(() => { throw new Error("DB read failure"); });

    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });
});
