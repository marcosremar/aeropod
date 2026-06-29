import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    insert: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
  };
});

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_PROJECT = {
  id: VALID_UUID,
  title: "My Episode",
  status: "uploaded",
  originalAudioUrl: "/uploads/123-test.mp3",
  userId: null,
  targetDuration: null,
  language: "pt",
  originalDuration: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildInsertChain(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
}

/**
 * Create a File whose arrayBuffer() works in jsdom (jsdom's Blob may lack it).
 */
function makeFile(name: string, type: string, content = "test"): File {
  const file = new File([content], name, { type });
  if (typeof (file as any).arrayBuffer !== "function") {
    const buf = Buffer.from(content);
    (file as any).arrayBuffer = () => Promise.resolve(buf.buffer.slice(0));
  }
  return file;
}

/**
 * Build a NextRequest whose formData() resolves to a map of provided fields.
 * Using explicit mocking avoids jsdom multipart serialisation quirks.
 */
function makeRequest(fields: Record<string, string | File | null | undefined>): NextRequest {
  const fd = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    if (val != null) fd.append(key, val);
  }
  const req = new NextRequest("http://localhost/api/upload", { method: "POST" });
  // Override formData() so the test controls exactly what the handler receives.
  (req as any).formData = vi.fn().mockResolvedValue(fd);
  return req;
}

describe("POST /api/upload", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/upload/route");
    POST = module.POST;
  });

  it("returns 400 when no file is provided", async () => {
    const req = makeRequest({ title: "My Episode" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No file provided");
  });

  it("returns 400 when file has an invalid extension (.pdf)", async () => {
    const file = new File(["content"], "recording.pdf", { type: "application/pdf" });
    const req = makeRequest({ file, title: "My Episode" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid file type");
    expect(data.error).toContain("mp3, wav, m4a");
  });

  it("returns 400 when file extension has no dot (no extension)", async () => {
    const file = new File(["content"], "recording", { type: "audio/mpeg" });
    const req = makeRequest({ file, title: "My Episode" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid file type");
  });

  it("returns 400 when MIME type is disallowed (valid extension, wrong MIME)", async () => {
    const file = new File(["content"], "recording.mp3", { type: "video/mp4" });
    const req = makeRequest({ file, title: "My Episode" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid MIME type");
  });

  it("returns 400 when file exceeds the 500 MB size limit", async () => {
    const file = new File(["x"], "recording.mp3", { type: "audio/mpeg" });
    Object.defineProperty(file, "size", { value: 501 * 1024 * 1024 });
    const req = makeRequest({ file, title: "My Episode" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("File too large");
    expect(data.error).toContain("500MB");
  });

  it("returns 400 when title is missing", async () => {
    const file = new File(["content"], "recording.mp3", { type: "audio/mpeg" });
    const req = makeRequest({ file });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Title is required");
  });

  it("returns 400 when title is blank whitespace", async () => {
    const file = new File(["content"], "recording.mp3", { type: "audio/mpeg" });
    const req = makeRequest({ file, title: "   " });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Title is required");
  });

  it("accepts a file with an empty MIME type when the extension is valid", async () => {
    const file = makeFile("recording.mp3", "");
    const req = makeRequest({ file, title: "My Episode" });

    vi.mocked(db.insert).mockReturnValue(buildInsertChain([SAMPLE_PROJECT]) as any);

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("returns 201 with projectId on a valid mp3 upload", async () => {
    const file = makeFile("episode.mp3", "audio/mpeg");
    const req = makeRequest({ file, title: "My Episode", language: "en" });

    vi.mocked(db.insert).mockReturnValue(buildInsertChain([SAMPLE_PROJECT]) as any);

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.projectId).toBe(VALID_UUID);
    expect(data.message).toBe("File uploaded successfully");
  });

  it("defaults language to pt when none is provided", async () => {
    const file = makeFile("episode.wav", "audio/wav");
    const req = makeRequest({ file, title: "My Episode" });

    const insertChain = buildInsertChain([{ ...SAMPLE_PROJECT, language: "pt" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as any);

    await POST(req);

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ language: "pt" })
    );
  });

  it("defaults language to pt for unsupported language codes", async () => {
    const file = makeFile("episode.m4a", "audio/x-m4a");
    const req = makeRequest({ file, title: "My Episode", language: "fr" });

    const insertChain = buildInsertChain([{ ...SAMPLE_PROJECT, language: "pt" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as any);

    await POST(req);

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ language: "pt" })
    );
  });

  it("accepts audio/x-wav MIME type without rejecting it", async () => {
    const file = makeFile("recording.wav", "audio/x-wav");
    const req = makeRequest({ file, title: "My Episode" });

    vi.mocked(db.insert).mockReturnValue(buildInsertChain([SAMPLE_PROJECT]) as any);

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("passes 'es' language to the database when provided", async () => {
    const file = makeFile("episode.mp3", "audio/mpeg");
    const req = makeRequest({ file, title: "My Episode", language: "es" });

    const insertChain = buildInsertChain([{ ...SAMPLE_PROJECT, language: "es" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as any);

    await POST(req);

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ language: "es" })
    );
  });

  it("passes targetDuration to the database when provided", async () => {
    const file = makeFile("episode.mp3", "audio/mpeg");
    const req = makeRequest({ file, title: "My Episode", targetDuration: "1800" });

    const insertChain = buildInsertChain([{ ...SAMPLE_PROJECT, targetDuration: 1800 }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as any);

    await POST(req);

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ targetDuration: 1800 })
    );
  });

  it("returns 500 when db.insert throws", async () => {
    const file = makeFile("episode.mp3", "audio/mpeg");
    const req = makeRequest({ file, title: "My Episode" });

    vi.mocked(db.insert).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("Failed to upload file");
  });
});
