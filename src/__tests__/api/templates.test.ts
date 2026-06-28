import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockListTemplates, mockGetTemplateWithSections } = vi.hoisted(() => ({
  mockListTemplates: vi.fn(),
  mockGetTemplateWithSections: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: vi.fn().mockImplementation(function () {
    this.listTemplates = mockListTemplates;
    this.getTemplateWithSections = mockGetTemplateWithSections;
  }),
}));

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_TEMPLATE = {
  id: VALID_UUID,
  name: "Interview Template",
  description: "A template for podcast interviews",
  category: "interview",
  isSystem: true,
  userId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_TEMPLATE_WITH_SECTIONS = {
  ...SAMPLE_TEMPLATE,
  sections: [
    {
      id: "660e8400-e29b-41d4-a716-446655440001",
      templateId: VALID_UUID,
      name: "Introduction",
      order: 1,
      isRequired: true,
    },
    {
      id: "770e8400-e29b-41d4-a716-446655440002",
      templateId: VALID_UUID,
      name: "Main Content",
      order: 2,
      isRequired: true,
    },
  ],
};

describe("Templates API – GET /api/templates", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/templates/route");
    GET = module.GET;
  });

  it("returns all templates on success", async () => {
    mockListTemplates.mockResolvedValue([SAMPLE_TEMPLATE]);

    const req = new NextRequest("http://localhost/api/templates");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.templates).toHaveLength(1);
    expect(data.templates[0].id).toBe(VALID_UUID);
  });

  it("returns empty array when no templates exist", async () => {
    mockListTemplates.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/templates");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.templates).toHaveLength(0);
  });

  it("passes category filter from query param", async () => {
    mockListTemplates.mockResolvedValue([SAMPLE_TEMPLATE]);

    const req = new NextRequest("http://localhost/api/templates?category=interview");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockListTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ category: "interview" })
    );
  });

  it("passes isSystem=true filter when query param is 'true'", async () => {
    mockListTemplates.mockResolvedValue([SAMPLE_TEMPLATE]);

    const req = new NextRequest("http://localhost/api/templates?isSystem=true");
    await GET(req);

    expect(mockListTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ isSystem: true })
    );
  });

  it("passes isSystem=false filter when query param is 'false'", async () => {
    mockListTemplates.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/templates?isSystem=false");
    await GET(req);

    expect(mockListTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ isSystem: false })
    );
  });

  it("passes userId filter from query param", async () => {
    mockListTemplates.mockResolvedValue([SAMPLE_TEMPLATE]);

    const req = new NextRequest(`http://localhost/api/templates?userId=${VALID_UUID}`);
    await GET(req);

    expect(mockListTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ userId: VALID_UUID })
    );
  });

  it("returns 500 when TemplateService throws", async () => {
    mockListTemplates.mockRejectedValue(new Error("DB connection failed"));

    const req = new NextRequest("http://localhost/api/templates");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/DB connection failed/i);
  });
});

describe("Templates API – GET /api/templates/[id]", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/templates/[id]/route");
    GET = module.GET;
  });

  it("returns template with sections on success", async () => {
    mockGetTemplateWithSections.mockResolvedValue(SAMPLE_TEMPLATE_WITH_SECTIONS);

    const req = new NextRequest(`http://localhost/api/templates/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.template.id).toBe(VALID_UUID);
    expect(data.template.sections).toHaveLength(2);
  });

  it("returns 404 when template is not found", async () => {
    mockGetTemplateWithSections.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/templates/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns 500 when TemplateService throws", async () => {
    mockGetTemplateWithSections.mockRejectedValue(new Error("query error"));

    const req = new NextRequest(`http://localhost/api/templates/${VALID_UUID}`);
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/query error/i);
  });
});
