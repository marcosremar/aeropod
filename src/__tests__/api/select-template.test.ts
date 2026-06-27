import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Shared state accessible from inside vi.mock factories (run before imports due to hoisting)
const shared = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  deletedTables: [] as string[],
}));

vi.mock("@/lib/db", () => {
  const makeChain = (data: any[]) => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(data),
      // Make chain awaitable without .limit() (drizzle pattern)
      then: (resolve: any, reject: any) => Promise.resolve(data).then(resolve, reject),
      catch: (onRejected: any) => Promise.resolve(data).catch(onRejected),
      finally: (onFinally: any) => Promise.resolve(data).finally(onFinally),
    };
    return chain;
  };

  return {
    db: {
      select: vi.fn(() => makeChain(shared.selectQueue.shift() ?? [])),
      delete: vi.fn((table: any) => {
        shared.deletedTables.push(table?._name ?? "unknown");
        return { where: vi.fn(() => Promise.resolve([])) };
      }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: "mock-id", projectId: "project-1" }])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
    eq: (a: any, b: any) => ({ eq: [a, b] }),
    and: (...args: any[]) => ({ and: args }),
  };
});

vi.mock("@/lib/db/schema", () => ({
  projects: { _name: "projects", id: "id" },
  projectTemplates: { _name: "project_templates", projectId: "projectId" },
  projectSections: { _name: "project_sections", projectId: "projectId", id: "id" },
  sectionSegments: { _name: "section_segments", sectionId: "sectionId" },
  templateSections: { _name: "template_sections" },
  users: { _name: "users" },
}));

vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: class {
    getTemplateWithSections = vi.fn().mockResolvedValue({
      id: "template-1",
      name: "Test Template",
      sections: [
        { id: "ts-1", name: "Intro", order: 1 },
        { id: "ts-2", name: "Main", order: 2 },
      ],
    });
  },
}));

import { POST } from "@/app/api/projects/[id]/select-template/route";

describe("POST /api/projects/[id]/select-template", () => {
  beforeEach(() => {
    shared.selectQueue.length = 0;
    shared.deletedTables.length = 0;
    vi.clearAllMocks();
  });

  it("should cleanup existing sections even when currentTemplateId is null", async () => {
    // Simulate a project whose currentTemplateId was never persisted (e.g. previous call failed)
    // but which already has sections in the DB
    shared.selectQueue.push(
      [{ id: "project-1", currentTemplateId: null }], // project lookup
      [{ id: "section-A" }, { id: "section-B" }],     // existing orphaned sections
    );

    const req = new NextRequest(
      "http://localhost/api/projects/project-1/select-template",
      { method: "POST", body: JSON.stringify({ templateId: "template-1" }) }
    );

    const response = await POST(req, { params: Promise.resolve({ id: "project-1" }) });
    const data = await response.json();

    expect(data.success).toBe(true);
    // delete() must have been called to clean up orphaned sections
    expect(shared.deletedTables.length).toBeGreaterThan(0);
  });

  it("should cleanup existing sections when replacing a previously set template", async () => {
    shared.selectQueue.push(
      [{ id: "project-1", currentTemplateId: "old-template" }], // project with existing template
      [{ id: "section-A" }],                                     // one existing section
    );

    const req = new NextRequest(
      "http://localhost/api/projects/project-1/select-template",
      { method: "POST", body: JSON.stringify({ templateId: "template-1" }) }
    );

    const response = await POST(req, { params: Promise.resolve({ id: "project-1" }) });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(shared.deletedTables.length).toBeGreaterThan(0);
  });

  it("should return 400 when templateId is missing", async () => {
    shared.selectQueue.push([{ id: "project-1", currentTemplateId: null }]);

    const req = new NextRequest(
      "http://localhost/api/projects/project-1/select-template",
      { method: "POST", body: JSON.stringify({}) }
    );

    const response = await POST(req, { params: Promise.resolve({ id: "project-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should return 404 when project does not exist", async () => {
    shared.selectQueue.push([]); // empty: project not found

    const req = new NextRequest(
      "http://localhost/api/projects/nonexistent/select-template",
      { method: "POST", body: JSON.stringify({ templateId: "template-1" }) }
    );

    const response = await POST(req, { params: Promise.resolve({ id: "nonexistent" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });
});
