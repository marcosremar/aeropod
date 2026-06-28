import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockDetectContentType,
  mockSuggestTemplates,
  mockDetectAndSave,
  mockGetLatestDetection,
  mockGetTemplateWithSections,
} = vi.hoisted(() => ({
  mockDetectContentType: vi.fn(),
  mockSuggestTemplates: vi.fn(),
  mockDetectAndSave: vi.fn(),
  mockGetLatestDetection: vi.fn(),
  mockGetTemplateWithSections: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
  };
  return {
    db: mockDb,
  };
});

vi.mock("@/lib/ai/ContentDetectionService", () => ({
  ContentDetectionService: vi.fn().mockImplementation(function () {
    this.detectContentType = mockDetectContentType;
    this.suggestTemplates = mockSuggestTemplates;
    this.detectAndSave = mockDetectAndSave;
    this.getLatestDetection = mockGetLatestDetection;
  }),
}));

vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: vi.fn().mockImplementation(function () {
    this.getTemplateWithSections = mockGetTemplateWithSections;
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  projects: "projects_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import { db } from "@/lib/db";
import { GET, POST } from "@/app/api/projects/[id]/detect-type/route";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEMPLATE_ID = "660e8400-e29b-41d4-a716-446655440001";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "Interview with Expert",
  status: "ready",
  transcription: "Interviewer: Tell me about yourself. Guest: I am a researcher.",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_DETECTION_RESULT = {
  detectedType: "interview" as const,
  confidence: 0.92,
  reasoning: "Detected Q&A patterns typical of interview format",
  characteristics: ["two speakers", "question-answer pattern"],
  speakers: 2,
};

const SAMPLE_SUGGESTIONS = [
  {
    templateId: TEMPLATE_ID,
    matchScore: 0.9,
    reason: "Best match for interview content",
  },
];

const SAMPLE_TEMPLATE = {
  id: TEMPLATE_ID,
  name: "Interview Template",
  sections: [
    { id: "sec-1", name: "Introduction", order: 1 },
    { id: "sec-2", name: "Main Content", order: 2 },
  ],
};

const SAMPLE_STORED_DETECTION = {
  id: "det-1",
  projectId: PROJECT_ID,
  detectedType: "interview",
  confidence: 0.88,
  reasoning: "Detected Q&A patterns",
  suggestedTemplates: [
    { templateId: TEMPLATE_ID, matchScore: 0.85, reason: "Good match" },
  ],
  createdAt: new Date(),
};

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeRequest(
  method: string,
  projectId: string,
  body?: unknown
): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/${projectId}/detect-type`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
}

describe("POST /api/projects/[id]/detect-type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectContentType.mockResolvedValue(SAMPLE_DETECTION_RESULT);
    mockSuggestTemplates.mockResolvedValue(SAMPLE_SUGGESTIONS);
    mockDetectAndSave.mockResolvedValue(undefined);
    mockGetTemplateWithSections.mockResolvedValue(SAMPLE_TEMPLATE);
  });

  it("returns 404 when project does not exist", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([])
    );

    const req = makeRequest("POST", PROJECT_ID);
    const res = await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Project not found");
  });

  it("returns 400 when project has no transcription", async () => {
    const projectNoTranscription = { ...SAMPLE_PROJECT, transcription: null };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([projectNoTranscription])
    );

    const req = makeRequest("POST", PROJECT_ID);
    const res = await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/transcribed/i);
  });

  it("runs detection and returns results with suggested templates", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT])
    );

    const req = makeRequest("POST", PROJECT_ID);
    const res = await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.detection.detectedType).toBe("interview");
    expect(json.detection.confidence).toBe(0.92);
    expect(json.detection.reasoning).toBe(
      "Detected Q&A patterns typical of interview format"
    );
    expect(json.detection.characteristics).toEqual([
      "two speakers",
      "question-answer pattern",
    ]);
  });

  it("calls detectContentType with projectId and transcription", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT])
    );

    const req = makeRequest("POST", PROJECT_ID);
    await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });

    expect(mockDetectContentType).toHaveBeenCalledWith(
      PROJECT_ID,
      SAMPLE_PROJECT.transcription
    );
  });

  it("calls detectAndSave after detection", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT])
    );

    const req = makeRequest("POST", PROJECT_ID);
    await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });

    expect(mockDetectAndSave).toHaveBeenCalledWith(
      PROJECT_ID,
      SAMPLE_PROJECT.transcription
    );
  });

  it("returns full template details in suggestedTemplates", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT])
    );

    const req = makeRequest("POST", PROJECT_ID);
    const res = await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(json.suggestedTemplates).toHaveLength(1);
    expect(json.suggestedTemplates[0].template.id).toBe(TEMPLATE_ID);
    expect(json.suggestedTemplates[0].matchScore).toBe(0.9);
    expect(json.suggestedTemplates[0].reason).toBe(
      "Best match for interview content"
    );
  });

  it("omits template from suggestedTemplates when templateService returns null", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT])
    );
    mockGetTemplateWithSections.mockResolvedValue(null);

    const req = makeRequest("POST", PROJECT_ID);
    const res = await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.suggestedTemplates).toHaveLength(0);
  });

  it("returns 500 on unexpected error", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT])
    );
    mockDetectContentType.mockRejectedValue(new Error("AI service unavailable"));

    const req = makeRequest("POST", PROJECT_ID);
    const res = await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("AI service unavailable");
  });
});

describe("GET /api/projects/[id]/detect-type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTemplateWithSections.mockResolvedValue(SAMPLE_TEMPLATE);
  });

  it("returns 404 when no detection record exists", async () => {
    mockGetLatestDetection.mockResolvedValue(null);

    const req = makeRequest("GET", PROJECT_ID);
    const res = await GET(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/no detection found/i);
  });

  it("returns detection details when record exists", async () => {
    mockGetLatestDetection.mockResolvedValue(SAMPLE_STORED_DETECTION);

    const req = makeRequest("GET", PROJECT_ID);
    const res = await GET(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.detection.detectedType).toBe("interview");
    expect(json.detection.confidence).toBe(0.88);
    expect(json.detection.reasoning).toBe("Detected Q&A patterns");
  });

  it("returns suggestedTemplates with full template details", async () => {
    mockGetLatestDetection.mockResolvedValue(SAMPLE_STORED_DETECTION);

    const req = makeRequest("GET", PROJECT_ID);
    const res = await GET(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(json.suggestedTemplates).toHaveLength(1);
    expect(json.suggestedTemplates[0].template.name).toBe("Interview Template");
    expect(json.suggestedTemplates[0].matchScore).toBe(0.85);
  });

  it("returns empty suggestedTemplates when stored array is empty", async () => {
    mockGetLatestDetection.mockResolvedValue({
      ...SAMPLE_STORED_DETECTION,
      suggestedTemplates: [],
    });

    const req = makeRequest("GET", PROJECT_ID);
    const res = await GET(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.suggestedTemplates).toHaveLength(0);
  });

  it("handles null suggestedTemplates gracefully", async () => {
    mockGetLatestDetection.mockResolvedValue({
      ...SAMPLE_STORED_DETECTION,
      suggestedTemplates: null,
    });

    const req = makeRequest("GET", PROJECT_ID);
    const res = await GET(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.suggestedTemplates).toHaveLength(0);
  });

  it("omits template from list when getTemplateWithSections returns null", async () => {
    mockGetLatestDetection.mockResolvedValue(SAMPLE_STORED_DETECTION);
    mockGetTemplateWithSections.mockResolvedValue(null);

    const req = makeRequest("GET", PROJECT_ID);
    const res = await GET(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.suggestedTemplates).toHaveLength(0);
  });

  it("returns 500 on unexpected error", async () => {
    mockGetLatestDetection.mockRejectedValue(new Error("DB connection lost"));

    const req = makeRequest("GET", PROJECT_ID);
    const res = await GET(req, { params: Promise.resolve({ id: PROJECT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("DB connection lost");
  });
});
