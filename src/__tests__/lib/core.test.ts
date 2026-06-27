import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockDb, tableStubs } from "../helpers/mock-db";

// ---------------------------------------------------------------------------
// Shared module mocks. The constructor-injected services (SectionAssembly,
// SegmentMapping, Template) receive `mockDb` directly, but they also import
// table objects from "@/lib/db/schema", and SegmentMappingService imports the
// AIService. social-clip-service and session use the `db` singleton from
// "@/lib/db", so we mock that too.
// ---------------------------------------------------------------------------

const { mockDb, setResult, queueResults, captured, reset } = createMockDb();

vi.mock("@/lib/db", () => ({
  db: mockDb,
  ...tableStubs("socialClips", "segments", "users"),
}));

vi.mock("@/lib/db/schema", () => ({
  ...tableStubs(
    "projectSections",
    "templateSections",
    "segments",
    "sectionSegments",
    "templates",
    "contentTypeDetections",
    "projectTemplates",
    "socialClips",
    "users"
  ),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn(() => "and"),
  or: vi.fn(() => "or"),
  sql: Object.assign(vi.fn(() => "sql"), { raw: vi.fn(() => "sql-raw") }),
  inArray: vi.fn(() => "inArray"),
  desc: vi.fn(() => "desc"),
  asc: vi.fn(() => "asc"),
}));

// AIService used by SegmentMappingService
const aiCompleteJSONMock = vi.fn();
vi.mock("@/lib/ai/AIService", () => ({
  getAIService: vi.fn(() => ({})),
  aiCompleteJSON: (...args: unknown[]) => aiCompleteJSONMock(...args),
}));

// AWS SDK mocks for s3.ts (no network)
const s3SendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    config: { endpoint?: string };
    constructor(cfg: { endpoint?: string }) {
      this.config = { endpoint: cfg.endpoint };
    }
    send(...args: unknown[]) {
      return s3SendMock(...args);
    }
  }
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

const getSignedUrlMock = vi.fn(async () => "https://signed.example.com/object?sig=abc");
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

// child_process mock for social-clip-service ffmpeg export
vi.mock("child_process", () => ({
  default: { spawn: vi.fn() },
  spawn: vi.fn(),
}));

// next/headers cookie store (used by auth/session)
const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

beforeEach(() => {
  reset();
  aiCompleteJSONMock.mockReset();
  s3SendMock.mockReset();
  getSignedUrlMock.mockClear();
});

// ===========================================================================
// utils.ts - cn merging
// ===========================================================================
describe("utils.cn", () => {
  it("merges class names", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("a", "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes (last wins)", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional/falsy inputs", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn({ active: true, hidden: false })).toBe("active");
  });
});

// ===========================================================================
// storage/s3.ts and storage/index.ts
// ===========================================================================
describe("MockStorageClient", () => {
  it("uploads a buffer and returns key + url, download round-trips", async () => {
    const { MockStorageClient } = await import("@/lib/storage");
    const client = new MockStorageClient("https://mock.test");
    const buf = Buffer.from("hello");
    const res = await client.upload({ key: "a/b.mp3", body: buf });
    expect(res.key).toBe("a/b.mp3");
    expect(res.url).toBe("https://mock.test/a/b.mp3");
    expect(client.has("a/b.mp3")).toBe(true);
    const back = await client.download({ key: "a/b.mp3" });
    expect(back.toString()).toBe("hello");
  });

  it("download throws for unknown key", async () => {
    const { MockStorageClient } = await import("@/lib/storage");
    const client = new MockStorageClient();
    await expect(client.download({ key: "missing" })).rejects.toThrow(/Key not found/);
  });

  it("getSignedUrl returns a signed url, throws when missing", async () => {
    const { MockStorageClient } = await import("@/lib/storage");
    const client = new MockStorageClient();
    await client.upload({ key: "x", body: Buffer.from("y") });
    const url = await client.getSignedUrl({ key: "x" });
    expect(url).toContain("signed=true");
    await expect(client.getSignedUrl({ key: "nope" })).rejects.toThrow(/Key not found/);
  });

  it("clear() empties storage", async () => {
    const { MockStorageClient } = await import("@/lib/storage");
    const client = new MockStorageClient();
    await client.upload({ key: "x", body: Buffer.from("y") });
    client.clear();
    expect(client.has("x")).toBe(false);
  });
});

describe("S3StorageClient", () => {
  it("upload sends PutObjectCommand and constructs endpoint url", async () => {
    const { S3StorageClient } = await import("@/lib/storage");
    s3SendMock.mockResolvedValue({});
    const client = new S3StorageClient({
      accessKey: "ak",
      secretKey: "sk",
      bucket: "mybucket",
      endpoint: "https://r2.example.com",
    });
    const res = await client.upload({ key: "k.mp3", body: Buffer.from("z"), contentType: "audio/mpeg" });
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    expect(res.key).toBe("k.mp3");
    expect(res.url).toBe("https://r2.example.com/mybucket/k.mp3");
  });

  it("upload constructs default s3 url without endpoint", async () => {
    const { S3StorageClient } = await import("@/lib/storage");
    s3SendMock.mockResolvedValue({});
    const client = new S3StorageClient({ accessKey: "ak", secretKey: "sk", bucket: "b" });
    const res = await client.upload({ key: "k", body: Buffer.from("z") });
    expect(res.url).toBe("https://b.s3.amazonaws.com/k");
  });

  it("download concatenates streamed chunks into a buffer", async () => {
    const { S3StorageClient } = await import("@/lib/storage");
    s3SendMock.mockResolvedValue({
      Body: {
        async *[Symbol.asyncIterator]() {
          yield new Uint8Array([104, 105]); // "hi"
        },
      },
    });
    const client = new S3StorageClient({ accessKey: "ak", secretKey: "sk", bucket: "b" });
    const buf = await client.download({ key: "k" });
    expect(buf.toString()).toBe("hi");
  });

  it("download throws when no body returned", async () => {
    const { S3StorageClient } = await import("@/lib/storage");
    s3SendMock.mockResolvedValue({ Body: undefined });
    const client = new S3StorageClient({ accessKey: "ak", secretKey: "sk", bucket: "b" });
    await expect(client.download({ key: "k" })).rejects.toThrow(/No body returned/);
  });

  it("getSignedUrl delegates to presigner", async () => {
    const { S3StorageClient } = await import("@/lib/storage");
    const client = new S3StorageClient({ accessKey: "ak", secretKey: "sk", bucket: "b" });
    const url = await client.getSignedUrl({ key: "k", expiresIn: 60 });
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(url).toContain("signed.example.com");
  });
});

describe("createStorageClient", () => {
  afterEach(() => {
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.S3_BUCKET;
  });

  it("returns a MockStorageClient when useMock=true", async () => {
    const { createStorageClient, MockStorageClient } = await import("@/lib/storage");
    expect(createStorageClient(true)).toBeInstanceOf(MockStorageClient);
  });

  it("throws when required env config is missing", async () => {
    const { createStorageClient } = await import("@/lib/storage");
    expect(() => createStorageClient(false)).toThrow(/Missing required S3 configuration/);
  });

  it("returns an S3StorageClient when env config is present", async () => {
    process.env.S3_ACCESS_KEY = "ak";
    process.env.S3_SECRET_KEY = "sk";
    process.env.S3_BUCKET = "bucket";
    const { createStorageClient, S3StorageClient } = await import("@/lib/storage");
    expect(createStorageClient(false)).toBeInstanceOf(S3StorageClient);
  });
});

// ===========================================================================
// auth/session.ts
// ===========================================================================
describe("auth/session", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
  });

  it("generateSessionId returns a 64-char hex string", async () => {
    const { generateSessionId } = await import("@/lib/auth/session");
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(generateSessionId()).not.toBe(id);
  });

  it("getSession returns null when no cookie present", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const { getSession } = await import("@/lib/auth/session");
    expect(await getSession()).toBeNull();
  });

  it("getSession returns null and clears when expired", async () => {
    cookieStore.get.mockReturnValue({
      value: JSON.stringify({ userId: "u1", expiresAt: Date.now() - 1000 }),
    });
    const { getSession } = await import("@/lib/auth/session");
    expect(await getSession()).toBeNull();
    expect(cookieStore.delete).toHaveBeenCalled();
  });

  it("getSession returns null when user no longer exists", async () => {
    cookieStore.get.mockReturnValue({
      value: JSON.stringify({ userId: "u1", expiresAt: Date.now() + 100000 }),
    });
    setResult([]); // no user found
    const { getSession } = await import("@/lib/auth/session");
    expect(await getSession()).toBeNull();
    expect(cookieStore.delete).toHaveBeenCalled();
  });

  it("getSession returns the session for a valid user", async () => {
    cookieStore.get.mockReturnValue({
      value: JSON.stringify({ userId: "u1", expiresAt: Date.now() + 100000 }),
    });
    setResult([{ id: "u1", email: "a@b.c", name: "Alice", plan: "pro" }]);
    const { getSession } = await import("@/lib/auth/session");
    const s = await getSession();
    expect(s).toEqual({ userId: "u1", email: "a@b.c", name: "Alice", plan: "pro" });
  });

  it("getSession returns null on parse error (catch branch)", async () => {
    cookieStore.get.mockReturnValue({ value: "not-json" });
    const { getSession } = await import("@/lib/auth/session");
    expect(await getSession()).toBeNull();
  });

  it("setSession writes a cookie with expiry", async () => {
    const { setSession } = await import("@/lib/auth/session");
    await setSession({ userId: "u1", email: "a@b.c" });
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value] = cookieStore.set.mock.calls[0];
    expect(name).toBe("aeropod_session");
    const parsed = JSON.parse(value);
    expect(parsed.userId).toBe("u1");
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });

  it("clearSession deletes the cookie", async () => {
    const { clearSession } = await import("@/lib/auth/session");
    await clearSession();
    expect(cookieStore.delete).toHaveBeenCalledWith("aeropod_session");
  });

  it("getOrCreateUser returns an existing user", async () => {
    setResult([{ id: "u1", email: "a@b.c" }]);
    const { getOrCreateUser } = await import("@/lib/auth/session");
    const u = await getOrCreateUser("a@b.c");
    expect(u).toEqual({ id: "u1", email: "a@b.c" });
    expect(captured.inserts).toHaveLength(0);
  });

  it("getOrCreateUser creates a new user when none exists", async () => {
    queueResults([], [{ id: "u2", email: "new@b.c", name: "new" }]);
    const { getOrCreateUser } = await import("@/lib/auth/session");
    const u = await getOrCreateUser("new@b.c");
    expect(u).toEqual({ id: "u2", email: "new@b.c", name: "new" });
    expect(captured.values[0]).toMatchObject({ email: "new@b.c", name: "new", plan: "free" });
  });
});

// ===========================================================================
// sections/SectionAssemblyService.ts
// ===========================================================================
describe("SectionAssemblyService", () => {
  async function makeService() {
    const { SectionAssemblyService } = await import("@/lib/sections/SectionAssemblyService");
    return new SectionAssemblyService(mockDb as never);
  }

  it("initializeProjectSections inserts one row per template section", async () => {
    queueResults(
      [{ id: "ts1", name: "Intro", order: 0 }, { id: "ts2", name: "Outro", order: 1 }],
      [{ id: "ps1", name: "Intro" }],
      [{ id: "ps2", name: "Outro" }]
    );
    const svc = await makeService();
    const created = await svc.initializeProjectSections("p1", "t1");
    expect(created).toHaveLength(2);
    expect(captured.values[0]).toMatchObject({ projectId: "p1", templateSectionId: "ts1", status: "pending" });
  });

  it("getMissingSections filters by missing audio / pending / blocked", async () => {
    setResult([
      { projectSection: { audioUrl: null, status: "pending" }, templateSection: { id: "a", name: "A", isRequired: true } },
      { projectSection: { audioUrl: "u", status: "approved" }, templateSection: { id: "b", name: "B" } },
      { projectSection: { audioUrl: "u", status: "blocked" }, templateSection: { id: "c", name: "C", suggestedDuration: 30 } },
      { projectSection: { audioUrl: "u", status: "approved" }, templateSection: null },
    ]);
    const svc = await makeService();
    const missing = await svc.getMissingSections("p1");
    expect(missing.map((m) => m.templateSection.id)).toEqual(["a", "c"]);
    expect(missing[0].isRequired).toBe(true);
    expect(missing[0].suggestedDuration).toBe(60); // default
    expect(missing[1].suggestedDuration).toBe(30);
  });

  it("getSectionSegments maps joined rows to segments", async () => {
    setResult([
      { segment: { id: "s1", text: "one" }, order: 0 },
      { segment: { id: "s2", text: "two" }, order: 1 },
    ]);
    const svc = await makeService();
    const segs = await svc.getSectionSegments("sec1");
    expect(segs.map((s: { id: string }) => s.id)).toEqual(["s1", "s2"]);
  });

  it("autoAssignSegmentsToSections inserts with incrementing order from existing count", async () => {
    queueResults([{ id: "ex1" }]); // existing assignments => maxOrder 1
    const svc = await makeService();
    await svc.autoAssignSegmentsToSections("p1", ["a", "b"], "sec1");
    expect(captured.values).toEqual([
      { sectionId: "sec1", segmentId: "a", order: 1 },
      { sectionId: "sec1", segmentId: "b", order: 2 },
    ]);
  });

  it("updateSectionStatus merges additionalData and sets uploadedAt for audio", async () => {
    setResult([{ id: "sec1", status: "approved" }]);
    const svc = await makeService();
    const updated = await svc.updateSectionStatus("sec1", "approved", {
      audioUrl: "http://a",
      transcription: "t",
      duration: 12,
      notes: "n",
    });
    expect(updated).toEqual({ id: "sec1", status: "approved" });
    const set = captured.sets[0] as Record<string, unknown>;
    expect(set.status).toBe("approved");
    expect(set.audioUrl).toBe("http://a");
    expect(set.uploadedAt).toBeInstanceOf(Date);
    expect(set.transcription).toBe("t");
    expect(set.duration).toBe(12);
  });

  it("getSectionCompletionStats computes counts and readiness", async () => {
    setResult([
      { status: "approved", isRequired: true },
      { status: "approved", isRequired: false },
      { status: "pending", isRequired: true },
      { status: "review", isRequired: false },
    ]);
    const svc = await makeService();
    const stats = await svc.getSectionCompletionStats("p1");
    expect(stats.total).toBe(4);
    expect(stats.approved).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.required).toBe(2);
    expect(stats.requiredApproved).toBe(1);
    expect(stats.percentComplete).toBe(50);
    expect(stats.isReadyForExport).toBe(false);
  });

  it("getSectionCompletionStats handles empty project", async () => {
    setResult([]);
    const svc = await makeService();
    const stats = await svc.getSectionCompletionStats("p1");
    expect(stats.total).toBe(0);
    expect(stats.percentComplete).toBe(0);
    expect(stats.isReadyForExport).toBe(true); // 0 === 0
  });
});

// ===========================================================================
// sections/SegmentMappingService.ts
// ===========================================================================
describe("SegmentMappingService", () => {
  async function makeService() {
    const { SegmentMappingService } = await import("@/lib/sections/SegmentMappingService");
    return new SegmentMappingService(mockDb as never);
  }

  it("autoMapSegments returns a no_segments issue when there are no segments", async () => {
    setResult([]);
    const svc = await makeService();
    const result = await svc.autoMapSegments("p1", "t1");
    expect(result.mappings).toHaveLength(0);
    expect(result.issues[0].type).toBe("no_segments");
    expect(result.overallConfidence).toBe(0);
  });

  it("autoMapSegments maps a segment to a matching section type", async () => {
    queueResults(
      // 1) project segments
      [{ id: "seg1", startTime: 0, endTime: 30, text: "hello intro", topic: "t" }],
      // 2) sections with template
      [
        {
          projectSection: { id: "ps1", order: 0 },
          templateSection: { id: "ts1", type: "intro", name: "Intro", isRequired: false },
        },
      ]
    );
    aiCompleteJSONMock.mockResolvedValue({
      bestMatchSectionType: "intro",
      confidence: 0.9,
      alternativeMatches: [],
      reasoning: "is an intro",
    });
    const svc = await makeService();
    const result = await svc.autoMapSegments("p1", "t1");
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({ segmentId: "seg1", sectionId: "ps1", templateSectionId: "ts1" });
    expect(result.overallConfidence).toBeCloseTo(0.9);
  });

  it("autoMapSegments leaves low-confidence segments unmapped", async () => {
    queueResults(
      [{ id: "seg1", startTime: 0, endTime: 30, text: "x", topic: null }],
      [{ projectSection: { id: "ps1", order: 0 }, templateSection: { id: "ts1", type: "intro", name: "Intro" } }]
    );
    aiCompleteJSONMock.mockResolvedValue({ bestMatchSectionType: "intro", confidence: 0.1, reasoning: "meh" });
    const svc = await makeService();
    const result = await svc.autoMapSegments("p1", "t1");
    expect(result.mappings).toHaveLength(0);
    expect(result.unmappedSegments).toEqual(["seg1"]);
  });

  it("validateMapping flags missing required and low confidence", async () => {
    const svc = await makeService();
    const sections = [
      { projectSection: { id: "ps1" }, templateSection: { name: "Req", isRequired: true } },
      { projectSection: { id: "ps2" }, templateSection: { name: "Low", isRequired: false } },
    ] as never;
    const mappings = [
      { segmentId: "s", sectionId: "ps2", templateSectionId: "x", confidence: 0.2, reasoning: "" },
    ] as never;
    const issues = svc.validateMapping(mappings, sections);
    const types = issues.map((i) => i.type);
    expect(types).toContain("missing_required");
    expect(types).toContain("low_confidence");
  });

  it("getCurrentMapping returns null when no project template", async () => {
    setResult([]);
    const svc = await makeService();
    expect(await svc.getCurrentMapping("p1")).toBeNull();
  });

  it("assignSegmentToSection deletes prior, inserts, and updates status", async () => {
    queueResults(
      [], // delete existing for segment (thenable result, unused)
      [{ id: "a" }, { id: "b" }] // existing assignments => order 2
    );
    const svc = await makeService();
    await svc.assignSegmentToSection("seg1", "sec1");
    expect(captured.deletes).toBeGreaterThanOrEqual(1);
    expect(captured.values[0]).toMatchObject({ sectionId: "sec1", segmentId: "seg1", order: 2 });
    expect((captured.sets[0] as Record<string, unknown>).status).toBe("review");
  });

  it("reorderSectionSegments deletes then re-inserts in order", async () => {
    const svc = await makeService();
    await svc.reorderSectionSegments("sec1", ["a", "b", "c"]);
    expect(captured.deletes).toBe(1);
    expect(captured.values).toEqual([
      { sectionId: "sec1", segmentId: "a", order: 0 },
      { sectionId: "sec1", segmentId: "b", order: 1 },
      { sectionId: "sec1", segmentId: "c", order: 2 },
    ]);
  });
});

// ===========================================================================
// templates/TemplateService.ts
// ===========================================================================
describe("TemplateService", () => {
  async function makeService() {
    const { TemplateService } = await import("@/lib/templates/TemplateService");
    return new TemplateService(mockDb as never);
  }

  it("listTemplates returns rows", async () => {
    setResult([{ id: "t1" }, { id: "t2" }]);
    const svc = await makeService();
    const res = await svc.listTemplates({ userId: "u1", category: "podcast", isSystem: true });
    expect(res).toHaveLength(2);
  });

  it("getTemplateWithSections returns null for missing template", async () => {
    setResult([]);
    const svc = await makeService();
    expect(await svc.getTemplateWithSections("missing")).toBeNull();
  });

  it("getTemplateWithSections attaches sections", async () => {
    queueResults([{ id: "t1", name: "Pod" }], [{ id: "s1" }, { id: "s2" }]);
    const svc = await makeService();
    const res = await svc.getTemplateWithSections("t1");
    expect(res?.id).toBe("t1");
    expect(res?.sections).toHaveLength(2);
  });

  it("createCustomTemplate sets userId and isSystem false", async () => {
    setResult([{ id: "new" }]);
    const svc = await makeService();
    const res = await svc.createCustomTemplate("u1", { name: "X", category: "c" });
    expect(res).toEqual({ id: "new" });
    expect(captured.values[0]).toMatchObject({ name: "X", category: "c", userId: "u1", isSystem: false });
  });

  it("getSuggestedTemplatesForProject returns [] when no detection", async () => {
    setResult([]);
    const svc = await makeService();
    expect(await svc.getSuggestedTemplatesForProject("p1")).toEqual([]);
  });

  it("getSuggestedTemplatesForProject sorts suggestions by matchScore desc", async () => {
    queueResults(
      // detection
      [{ suggestedTemplates: [
        { templateId: "tA", matchScore: 0.4, reason: "a" },
        { templateId: "tB", matchScore: 0.9, reason: "b" },
      ] }],
      // getTemplateWithSections(tA): template then sections
      [{ id: "tA", name: "A" }], [{ id: "sa" }],
      // getTemplateWithSections(tB): template then sections
      [{ id: "tB", name: "B" }], [{ id: "sb" }]
    );
    const svc = await makeService();
    const res = await svc.getSuggestedTemplatesForProject("p1");
    expect(res.map((r) => r.template.id)).toEqual(["tB", "tA"]);
    expect(res[0].matchScore).toBe(0.9);
  });

  it("updateTemplate sets updatedAt and returns updated row", async () => {
    setResult([{ id: "t1", name: "New" }]);
    const svc = await makeService();
    const res = await svc.updateTemplate("t1", { name: "New" });
    expect(res).toEqual({ id: "t1", name: "New" });
    expect((captured.sets[0] as Record<string, unknown>).updatedAt).toBeInstanceOf(Date);
  });

  it("deleteTemplate issues a delete", async () => {
    const svc = await makeService();
    await svc.deleteTemplate("t1", "u1");
    expect(captured.deletes).toBe(1);
  });
});

// ===========================================================================
// clips/social-clip-service.ts
// ===========================================================================
describe("SocialClipService", () => {
  function seg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "s1",
      text: "This is some segment text with enough words to extract a hook from it.",
      startTime: 0,
      endTime: 45,
      topic: "Tech",
      interestScore: 8,
      clarityScore: 8,
      keyInsight: "A really important quotable insight that is long enough to count.",
      analysis: { standalone: true },
      ...overrides,
    };
  }

  it("generateSuggestions ranks and returns up to count suggestions", async () => {
    const { SocialClipService } = await import("@/lib/clips/social-clip-service");
    const svc = new SocialClipService();
    const segs = [
      seg({ id: "a", interestScore: 9 }),
      seg({ id: "b", interestScore: 2, clarityScore: 2, keyInsight: null, analysis: {} }),
      seg({ id: "c", startTime: 0, endTime: 5 }), // too short -> filtered
    ] as never;
    const out = await svc.generateSuggestions(segs, 2);
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out.length).toBeGreaterThan(0);
    const s = out[0];
    expect(s.segmentIds).toContain("a");
    expect(s.hookScore).toBeGreaterThanOrEqual(1);
    expect(s.viralPotential).toBeGreaterThanOrEqual(1);
    expect(s.duration).toBe(45);
  });

  it("generateSuggestions returns empty for no usable segments", async () => {
    const { SocialClipService } = await import("@/lib/clips/social-clip-service");
    const svc = new SocialClipService();
    const out = await svc.generateSuggestions([seg({ endTime: 3 })] as never, 5);
    expect(out).toEqual([]);
  });

  it("saveClip persists a clip with derived metadata", async () => {
    const { SocialClipService } = await import("@/lib/clips/social-clip-service");
    setResult([{ id: "clip1", title: "Tech" }]);
    const svc = new SocialClipService();
    const suggestion = {
      segmentIds: ["s1"],
      startTime: 0,
      endTime: 45,
      duration: 45.4,
      title: "Tech",
      description: "desc",
      hookScore: 7,
      viralPotential: 8,
      hookText: "hook",
      reason: "r",
    };
    const saved = await svc.saveClip("p1", suggestion);
    expect(saved).toEqual({ id: "clip1", title: "Tech" });
    const values = captured.values[0] as Record<string, unknown>;
    expect(values).toMatchObject({ projectId: "p1", format: "9:16", status: "pending", duration: 45 });
    expect((values.metadata as { suggestedHashtags: string[] }).suggestedHashtags).toContain("#podcast");
  });

  it("exportClip returns error when clip not found", async () => {
    const { SocialClipService } = await import("@/lib/clips/social-clip-service");
    setResult([]); // no clip
    const svc = new SocialClipService();
    const res = await svc.exportClip("missing", "/audio.mp3", {
      format: "9:16",
      addCaptions: false,
      captionStyle: "static",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Clip not found");
  });

  it("getProjectClips queries by projectId", async () => {
    const { SocialClipService } = await import("@/lib/clips/social-clip-service");
    setResult([{ id: "c1" }]);
    const svc = new SocialClipService();
    const res = await svc.getProjectClips("p1");
    expect(res).toEqual([{ id: "c1" }]);
  });

  it("deleteClip issues a delete", async () => {
    const { SocialClipService } = await import("@/lib/clips/social-clip-service");
    const svc = new SocialClipService();
    await svc.deleteClip("c1");
    expect(captured.deletes).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// search/semantic-search.ts
// ===========================================================================
describe("semantic-search", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function seg(id: string, text: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { id, text, topic: null, keyInsight: null, startTime: 0, endTime: 10, ...extra };
  }

  it("hybridSearch returns [] for empty query or no segments", async () => {
    const { hybridSearch } = await import("@/lib/search/semantic-search");
    expect(await hybridSearch("", [seg("a", "x")] as never)).toEqual([]);
    expect(await hybridSearch("q", [] as never)).toEqual([]);
  });

  it("hybridSearch falls back to keyword scoring without an API key", async () => {
    // OPENROUTER_API_KEY is unset in test env -> getEmbeddings returns []
    const { hybridSearch } = await import("@/lib/search/semantic-search");
    const segs = [
      seg("a", "machine learning is fascinating", { topic: "learning" }),
      seg("b", "completely unrelated cooking content"),
    ] as never;
    const res = await hybridSearch("machine learning", segs, { useReranking: false });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].segment.id).toBe("a");
    expect(res[0].score).toBeGreaterThan(0);
  });

  it("quickSearch returns scored results and only matching segments", async () => {
    const { quickSearch } = await import("@/lib/search/semantic-search");
    const segs = [
      seg("a", "the quick brown fox jumps"),
      seg("b", "nothing relevant here at all"),
    ] as never;
    const res = await quickSearch("quick brown", segs, 5);
    expect(res.map((r) => r.segment.id)).toEqual(["a"]);
  });

  it("getEmbeddings returns [] when no API key configured", async () => {
    const { getEmbeddings } = await import("@/lib/search/semantic-search");
    expect(await getEmbeddings(["hello"])).toEqual([]);
  });
});
