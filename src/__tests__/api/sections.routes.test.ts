import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, tableStubs } from "../helpers/mock-db";

const { mockDb, setResult, queueResults, captured, reset } = createMockDb();

vi.mock("@/lib/db", () => ({
  db: mockDb,
  ...tableStubs(
    "projects",
    "segments",
    "templateSections",
    "projectTemplates",
    "projectSections",
    "sectionSegments"
  ),
}));

vi.mock("@/lib/db/schema", () => ({
  ...tableStubs(
    "projects",
    "segments",
    "templateSections",
    "projectTemplates",
    "projectSections",
    "sectionSegments"
  ),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  desc: vi.fn(() => "desc"),
  and: vi.fn(() => "and"),
  or: vi.fn(() => "or"),
  asc: vi.fn(() => "asc"),
  sql: vi.fn(() => "sql"),
  inArray: vi.fn(() => "inArray"),
  ne: vi.fn(() => "ne"),
}));

// --- Mock service classes used by the routes (no network / no real DB) ---

const sectionAssemblyInstance = {
  updateSectionStatus: vi.fn(async () => ({ id: "sec1", status: "review" })),
  getSectionSegments: vi.fn(async () => [{ id: "seg1" }]),
  getMissingSections: vi.fn(async () => [{ id: "tsec1", name: "Intro" }]),
  getSectionCompletionStats: vi.fn(async () => ({
    total: 3,
    completed: 1,
    percentage: 33,
  })),
};
vi.mock("@/lib/sections/SectionAssemblyService", () => ({
  SectionAssemblyService: vi.fn(function () {
    return sectionAssemblyInstance;
  }),
}));

const mappingInstance = {
  autoMapSegments: vi.fn(async () => ({
    mappings: [{ segmentId: "seg1", sectionId: "sec1", confidence: 0.9 }],
    unmappedSegments: [],
    issues: [],
    overallConfidence: 0.9,
  })),
  saveMapping: vi.fn(async () => undefined),
  assignSegmentToSection: vi.fn(async () => undefined),
  removeSegmentFromSection: vi.fn(async () => undefined),
  reorderSectionSegments: vi.fn(async () => undefined),
};
vi.mock("@/lib/sections/SegmentMappingService", () => ({
  SegmentMappingService: vi.fn(function () {
    return mappingInstance;
  }),
}));

const contentDetectionInstance = {
  detectContentType: vi.fn(async () => ({
    detectedType: "interview",
    confidence: 0.8,
    reasoning: "because",
    characteristics: { tone: "casual" },
  })),
  suggestTemplates: vi.fn(async () => [
    { templateId: "t1", matchScore: 0.9, reason: "good fit" },
  ]),
  detectAndSave: vi.fn(async () => undefined),
  getLatestDetection: vi.fn(async () => ({
    detectedType: "interview",
    confidence: 0.8,
    reasoning: "because",
    suggestedTemplates: [{ templateId: "t1", matchScore: 0.9, reason: "good fit" }],
  })),
};
vi.mock("@/lib/ai/ContentDetectionService", () => ({
  ContentDetectionService: vi.fn(function () {
    return contentDetectionInstance;
  }),
}));

const templateServiceInstance = {
  getTemplateWithSections: vi.fn(async () => ({ id: "t1", name: "Interview" })),
};
vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: vi.fn(function () {
    return templateServiceInstance;
  }),
}));

function ctx(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  // Restore default canned returns after clearAllMocks wiped implementations.
  sectionAssemblyInstance.updateSectionStatus.mockResolvedValue({
    id: "sec1",
    status: "review",
  });
  sectionAssemblyInstance.getSectionSegments.mockResolvedValue([{ id: "seg1" }]);
  sectionAssemblyInstance.getMissingSections.mockResolvedValue([
    { id: "tsec1", name: "Intro" },
  ]);
  sectionAssemblyInstance.getSectionCompletionStats.mockResolvedValue({
    total: 3,
    completed: 1,
    percentage: 33,
  });
  mappingInstance.autoMapSegments.mockResolvedValue({
    mappings: [{ segmentId: "seg1", sectionId: "sec1", confidence: 0.9 }],
    unmappedSegments: [],
    issues: [],
    overallConfidence: 0.9,
  });
  mappingInstance.saveMapping.mockResolvedValue(undefined);
  mappingInstance.assignSegmentToSection.mockResolvedValue(undefined);
  mappingInstance.removeSegmentFromSection.mockResolvedValue(undefined);
  mappingInstance.reorderSectionSegments.mockResolvedValue(undefined);
  contentDetectionInstance.detectContentType.mockResolvedValue({
    detectedType: "interview",
    confidence: 0.8,
    reasoning: "because",
    characteristics: { tone: "casual" },
  });
  contentDetectionInstance.suggestTemplates.mockResolvedValue([
    { templateId: "t1", matchScore: 0.9, reason: "good fit" },
  ]);
  contentDetectionInstance.detectAndSave.mockResolvedValue(undefined);
  contentDetectionInstance.getLatestDetection.mockResolvedValue({
    detectedType: "interview",
    confidence: 0.8,
    reasoning: "because",
    suggestedTemplates: [{ templateId: "t1", matchScore: 0.9, reason: "good fit" }],
  });
  templateServiceInstance.getTemplateWithSections.mockResolvedValue({
    id: "t1",
    name: "Interview",
  });
});

// =============================================================
// GET /api/projects/[id]/sections
// =============================================================
describe("GET /api/projects/[id]/sections", () => {
  it("returns 404 when project not found", async () => {
    const { GET } = await import("@/app/api/projects/[id]/sections/route");
    setResult([]); // project lookup empty
    const req = new NextRequest("http://localhost/api/projects/p1/sections");
    const res = await GET(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it("returns sections on the happy path", async () => {
    const { GET } = await import("@/app/api/projects/[id]/sections/route");
    queueResults(
      [{ id: "p1" }], // project exists
      [{ id: "sec1", name: "Intro", order: 1 }] // sections
    );
    const req = new NextRequest("http://localhost/api/projects/p1/sections");
    const res = await GET(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0].name).toBe("Intro");
  });

  it("returns 500 when the query throws", async () => {
    const { GET } = await import("@/app/api/projects/[id]/sections/route");
    const req = new NextRequest("http://localhost/api/projects/p1/sections");
    // params rejects -> caught by route try/catch
    const res = await GET(req, {
      params: Promise.reject(new Error("boom")),
    } as never);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});

// =============================================================
// PATCH & GET /api/projects/[id]/sections/[sectionId]
// =============================================================
describe("PATCH /api/projects/[id]/sections/[sectionId]", () => {
  it("returns 404 when section not found", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    setResult([]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1",
      { method: "PATCH", body: JSON.stringify({ status: "review" }) }
    );
    const res = await PATCH(req, ctx({ id: "p1", sectionId: "sec1" }));
    expect(res.status).toBe(404);
  });

  it("rejects modifying an approved section with 400", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    setResult([{ id: "sec1", status: "approved" }]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1",
      { method: "PATCH", body: JSON.stringify({ status: "completed" }) }
    );
    const res = await PATCH(req, ctx({ id: "p1", sectionId: "sec1" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/approved/i);
  });

  it("updates the section on the happy path", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    setResult([{ id: "sec1", status: "review" }]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1",
      {
        method: "PATCH",
        body: JSON.stringify({ status: "completed", notes: "ok" }),
      }
    );
    const res = await PATCH(req, ctx({ id: "p1", sectionId: "sec1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(sectionAssemblyInstance.updateSectionStatus).toHaveBeenCalledWith(
      "sec1",
      "completed",
      expect.objectContaining({ notes: "ok" })
    );
  });

  it("returns 500 when the service throws", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    setResult([{ id: "sec1", status: "review" }]);
    sectionAssemblyInstance.updateSectionStatus.mockRejectedValueOnce(
      new Error("update failed")
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1",
      { method: "PATCH", body: JSON.stringify({ status: "completed" }) }
    );
    const res = await PATCH(req, ctx({ id: "p1", sectionId: "sec1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/projects/[id]/sections/[sectionId]", () => {
  it("returns 404 when section missing", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    setResult([]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1"
    );
    const res = await GET(req, ctx({ id: "p1", sectionId: "sec1" }));
    expect(res.status).toBe(404);
  });

  it("returns section with its segments", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    setResult([{ id: "sec1", status: "review" }]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1"
    );
    const res = await GET(req, ctx({ id: "p1", sectionId: "sec1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.section.id).toBe("sec1");
    expect(data.segments).toEqual([{ id: "seg1" }]);
  });
});

// =============================================================
// POST & GET /api/projects/[id]/sections/[sectionId]/segments
// =============================================================
describe("POST /api/projects/[id]/sections/[sectionId]/segments", () => {
  it("rejects missing segmentId with 400", async () => {
    const { POST } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1/segments",
      { method: "POST", body: JSON.stringify({}) }
    );
    const res = await POST(req, ctx({ id: "p1", sectionId: "sec1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when section not found", async () => {
    const { POST } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    setResult([]); // section lookup empty
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1/segments",
      { method: "POST", body: JSON.stringify({ segmentId: "seg1" }) }
    );
    const res = await POST(req, ctx({ id: "p1", sectionId: "sec1" }));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toMatch(/Section not found/);
  });

  it("returns 404 when segment not found", async () => {
    const { POST } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    queueResults([{ id: "sec1", projectId: "p1" }], []); // section ok, segment empty
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1/segments",
      { method: "POST", body: JSON.stringify({ segmentId: "seg1" }) }
    );
    const res = await POST(req, ctx({ id: "p1", sectionId: "sec1" }));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toMatch(/Segment not found/);
  });

  it("assigns the segment and captures the insert + status update", async () => {
    const { POST } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    queueResults(
      [{ id: "sec1", projectId: "p1" }], // section
      [{ id: "seg1", projectId: "p1" }], // segment
      [{ order: 2 }, { order: 5 }] // existing mappings
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1/segments",
      { method: "POST", body: JSON.stringify({ segmentId: "seg1" }) }
    );
    const res = await POST(req, ctx({ id: "p1", sectionId: "sec1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.segmentId).toBe("seg1");
    // inserted mapping order = maxOrder(5) + 1
    expect(captured.values[0]).toMatchObject({
      sectionId: "sec1",
      segmentId: "seg1",
      order: 6,
      confidence: 1.0,
    });
    // section status updated to partial
    expect(captured.sets[0]).toMatchObject({ status: "partial" });
  });

  it("returns 500 when body is invalid JSON", async () => {
    const { POST } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1/segments",
      { method: "POST", body: "not-json" }
    );
    const res = await POST(req, ctx({ id: "p1", sectionId: "sec1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/projects/[id]/sections/[sectionId]/segments", () => {
  it("returns 404 when section not found", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    setResult([]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1/segments"
    );
    const res = await GET(req, ctx({ id: "p1", sectionId: "sec1" }));
    expect(res.status).toBe(404);
  });

  it("returns flattened segment mappings", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    queueResults(
      [{ id: "sec1", projectId: "p1" }], // section
      [
        {
          mapping: { order: 1, confidence: 0.7 },
          segment: { id: "seg1", title: "Hi" },
        },
      ]
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/sections/sec1/segments"
    );
    const res = await GET(req, ctx({ id: "p1", sectionId: "sec1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.segments[0]).toMatchObject({
      id: "seg1",
      title: "Hi",
      order: 1,
      confidence: 0.7,
    });
  });
});

// =============================================================
// PATCH & GET /api/projects/[id]/segments/[segmentId]
// =============================================================
describe("PATCH /api/projects/[id]/segments/[segmentId]", () => {
  it("returns 404 when segment not found", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/segments/[segmentId]/route"
    );
    setResult([]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/segments/seg1",
      { method: "PATCH", body: JSON.stringify({ text: "x" }) }
    );
    const res = await PATCH(req, ctx({ id: "p1", segmentId: "seg1" }));
    expect(res.status).toBe(404);
  });

  it("updates only allowed fields and returns the updated segment", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/segments/[segmentId]/route"
    );
    queueResults(
      [{ id: "seg1", projectId: "p1" }], // existing
      [{ id: "seg1", editedText: "new text" }] // returning()
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/segments/seg1",
      {
        method: "PATCH",
        body: JSON.stringify({
          editedText: "new text",
          isSelected: true,
          notAllowed: "ignored",
        }),
      }
    );
    const res = await PATCH(req, ctx({ id: "p1", segmentId: "seg1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.segment.editedText).toBe("new text");
    // only allowed fields are passed to set(); disallowed field dropped
    expect(captured.sets[0]).toEqual({
      editedText: "new text",
      isSelected: true,
    });
    expect(captured.sets[0]).not.toHaveProperty("notAllowed");
  });

  it("returns 500 when body is invalid JSON", async () => {
    const { PATCH } = await import(
      "@/app/api/projects/[id]/segments/[segmentId]/route"
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/segments/seg1",
      { method: "PATCH", body: "{bad" }
    );
    const res = await PATCH(req, ctx({ id: "p1", segmentId: "seg1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/projects/[id]/segments/[segmentId]", () => {
  it("returns 404 when segment missing", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/segments/[segmentId]/route"
    );
    setResult([]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/segments/seg1"
    );
    const res = await GET(req, ctx({ id: "p1", segmentId: "seg1" }));
    expect(res.status).toBe(404);
  });

  it("returns the segment when found", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/segments/[segmentId]/route"
    );
    setResult([{ id: "seg1", text: "hello" }]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/segments/seg1"
    );
    const res = await GET(req, ctx({ id: "p1", segmentId: "seg1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.segment.text).toBe("hello");
  });
});

// =============================================================
// POST / GET / PUT /api/projects/[id]/auto-map
// =============================================================
describe("POST /api/projects/[id]/auto-map", () => {
  it("returns 404 when project not found", async () => {
    const { POST } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, ctx({ id: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when no template can be resolved", async () => {
    const { POST } = await import("@/app/api/projects/[id]/auto-map/route");
    queueResults(
      [{ id: "p1", currentTemplateId: null }], // project, no current template
      [] // no projectTemplate
    );
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/template/i);
  });

  it("auto-maps with an explicit templateId and saves", async () => {
    const { POST } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1", currentTemplateId: null }]); // project
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "POST",
      body: JSON.stringify({ templateId: "t1", save: true }),
    });
    const res = await POST(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.templateId).toBe("t1");
    expect(data.saved).toBe(true);
    expect(data.mappings).toHaveLength(1);
    expect(mappingInstance.autoMapSegments).toHaveBeenCalledWith("p1", "t1");
    expect(mappingInstance.saveMapping).toHaveBeenCalled();
  });

  it("does not save when save=false", async () => {
    const { POST } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1", currentTemplateId: "t1" }]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "POST",
      body: JSON.stringify({ templateId: "t1", save: false }),
    });
    const res = await POST(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.saved).toBe(false);
    expect(mappingInstance.saveMapping).not.toHaveBeenCalled();
  });

  it("returns 500 when the mapping service throws", async () => {
    const { POST } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1", currentTemplateId: "t1" }]);
    mappingInstance.autoMapSegments.mockRejectedValueOnce(new Error("ai down"));
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "POST",
      body: JSON.stringify({ templateId: "t1" }),
    });
    const res = await POST(req, ctx({ id: "p1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/projects/[id]/auto-map", () => {
  it("returns 404 when project not found", async () => {
    const { GET } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map");
    const res = await GET(req, ctx({ id: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns empty mapping when no template selected", async () => {
    const { GET } = await import("@/app/api/projects/[id]/auto-map/route");
    queueResults(
      [{ id: "p1", currentTemplateId: null }], // project
      [] // no projectTemplate
    );
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map");
    const res = await GET(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sections).toEqual([]);
    expect(data.mappings).toEqual([]);
  });

  it("returns sections, mappings and unmapped segments", async () => {
    const { GET } = await import("@/app/api/projects/[id]/auto-map/route");
    queueResults(
      [{ id: "p1", currentTemplateId: "t1" }], // project (has template)
      [{ id: "ts1", name: "Intro", type: "intro", order: 1 }], // templateSections
      [{ id: "seg1", title: "A" }, { id: "seg2", title: "B" }], // projectSegments
      [
        {
          sectionSegment: { sectionId: "ts1", confidence: 0.8, order: 1 },
          segment: { id: "seg1", title: "A", summary: "s" },
        },
      ] // mappings join
    );
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map");
    const res = await GET(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.templateId).toBe("t1");
    expect(data.sections).toHaveLength(1);
    expect(data.mappings).toHaveLength(1);
    expect(data.mappings[0].segmentId).toBe("seg1");
    // seg2 is unmapped
    expect(data.unmappedSegments.map((s: { id: string }) => s.id)).toEqual([
      "seg2",
    ]);
    expect(data.overallConfidence).toBeCloseTo(0.8);
  });
});

describe("PUT /api/projects/[id]/auto-map", () => {
  it("returns 404 when project not found", async () => {
    const { PUT } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "PUT",
      body: JSON.stringify({ action: "assign" }),
    });
    const res = await PUT(req, ctx({ id: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for unknown action", async () => {
    const { PUT } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1" }]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "PUT",
      body: JSON.stringify({ action: "nope" }),
    });
    const res = await PUT(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/Invalid action/);
  });

  it("assign requires segmentId and sectionId (400)", async () => {
    const { PUT } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1" }]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "PUT",
      body: JSON.stringify({ action: "assign", segmentId: "seg1" }),
    });
    const res = await PUT(req, ctx({ id: "p1" }));
    expect(res.status).toBe(400);
  });

  it("assign succeeds and calls the service", async () => {
    const { PUT } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1" }]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "PUT",
      body: JSON.stringify({
        action: "assign",
        segmentId: "seg1",
        sectionId: "sec1",
        order: 2,
      }),
    });
    const res = await PUT(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mappingInstance.assignSegmentToSection).toHaveBeenCalledWith(
      "seg1",
      "sec1",
      2
    );
  });

  it("remove succeeds and calls the service", async () => {
    const { PUT } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1" }]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "PUT",
      body: JSON.stringify({
        action: "remove",
        segmentId: "seg1",
        sectionId: "sec1",
      }),
    });
    const res = await PUT(req, ctx({ id: "p1" }));
    expect(res.status).toBe(200);
    expect(mappingInstance.removeSegmentFromSection).toHaveBeenCalledWith(
      "seg1",
      "sec1"
    );
  });

  it("reorder requires a segmentIds array (400)", async () => {
    const { PUT } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1" }]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "PUT",
      body: JSON.stringify({ action: "reorder", sectionId: "sec1" }),
    });
    const res = await PUT(req, ctx({ id: "p1" }));
    expect(res.status).toBe(400);
  });

  it("reorder succeeds and calls the service", async () => {
    const { PUT } = await import("@/app/api/projects/[id]/auto-map/route");
    setResult([{ id: "p1" }]);
    const req = new NextRequest("http://localhost/api/projects/p1/auto-map", {
      method: "PUT",
      body: JSON.stringify({
        action: "reorder",
        sectionId: "sec1",
        segmentIds: ["a", "b"],
      }),
    });
    const res = await PUT(req, ctx({ id: "p1" }));
    expect(res.status).toBe(200);
    expect(mappingInstance.reorderSectionSegments).toHaveBeenCalledWith(
      "sec1",
      ["a", "b"]
    );
  });
});

// =============================================================
// GET /api/projects/[id]/missing-sections
// =============================================================
describe("GET /api/projects/[id]/missing-sections", () => {
  it("returns 404 when project not found", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/missing-sections/route"
    );
    setResult([]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/missing-sections"
    );
    const res = await GET(req, ctx({ id: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns missing sections and completion stats", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/missing-sections/route"
    );
    setResult([{ id: "p1" }]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/missing-sections"
    );
    const res = await GET(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.missingSections).toEqual([{ id: "tsec1", name: "Intro" }]);
    expect(data.stats.percentage).toBe(33);
  });

  it("returns 500 when the service throws", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/missing-sections/route"
    );
    setResult([{ id: "p1" }]);
    sectionAssemblyInstance.getMissingSections.mockRejectedValueOnce(
      new Error("boom")
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/missing-sections"
    );
    const res = await GET(req, ctx({ id: "p1" }));
    expect(res.status).toBe(500);
  });
});

// =============================================================
// POST / GET /api/projects/[id]/detect-type
// =============================================================
describe("POST /api/projects/[id]/detect-type", () => {
  it("returns 404 when project not found", async () => {
    const { POST } = await import("@/app/api/projects/[id]/detect-type/route");
    setResult([]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/detect-type",
      { method: "POST" }
    );
    const res = await POST(req, ctx({ id: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when project has no transcription", async () => {
    const { POST } = await import("@/app/api/projects/[id]/detect-type/route");
    setResult([{ id: "p1", transcription: null }]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/detect-type",
      { method: "POST" }
    );
    const res = await POST(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/transcribed/i);
  });

  it("detects content type and returns suggested templates", async () => {
    const { POST } = await import("@/app/api/projects/[id]/detect-type/route");
    setResult([{ id: "p1", transcription: "some transcript" }]);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/detect-type",
      { method: "POST" }
    );
    const res = await POST(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.detection.detectedType).toBe("interview");
    expect(data.suggestedTemplates).toHaveLength(1);
    expect(data.suggestedTemplates[0].template.id).toBe("t1");
    expect(contentDetectionInstance.detectAndSave).toHaveBeenCalledWith(
      "p1",
      "some transcript"
    );
  });

  it("returns 500 when detection throws", async () => {
    const { POST } = await import("@/app/api/projects/[id]/detect-type/route");
    setResult([{ id: "p1", transcription: "t" }]);
    contentDetectionInstance.detectContentType.mockRejectedValueOnce(
      new Error("ai error")
    );
    const req = new NextRequest(
      "http://localhost/api/projects/p1/detect-type",
      { method: "POST" }
    );
    const res = await POST(req, ctx({ id: "p1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/projects/[id]/detect-type", () => {
  it("returns 404 when no detection exists", async () => {
    const { GET } = await import("@/app/api/projects/[id]/detect-type/route");
    contentDetectionInstance.getLatestDetection.mockResolvedValueOnce(null);
    const req = new NextRequest(
      "http://localhost/api/projects/p1/detect-type"
    );
    const res = await GET(req, ctx({ id: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns latest detection with full template details", async () => {
    const { GET } = await import("@/app/api/projects/[id]/detect-type/route");
    const req = new NextRequest(
      "http://localhost/api/projects/p1/detect-type"
    );
    const res = await GET(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.detection.detectedType).toBe("interview");
    expect(data.suggestedTemplates).toHaveLength(1);
  });
});
