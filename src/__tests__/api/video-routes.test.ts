import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetDb, queueResults } from "../helpers/mock-db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, db: mockDb, getDb: () => mockDb };
});

// Controllable binary-availability + import mocks.
vi.mock("@/lib/audio/ffmpeg-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audio/ffmpeg-utils")>();
  return { ...actual, isFFmpegAvailable: vi.fn() };
});
vi.mock("@/lib/video/youtube", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/video/youtube")>();
  return { ...actual, isYtDlpAvailable: vi.fn(), importFromYouTube: vi.fn() };
});

import { isFFmpegAvailable } from "@/lib/audio/ffmpeg-utils";
import { isYtDlpAvailable, importFromYouTube } from "@/lib/video/youtube";

const UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  resetDb();
  (isFFmpegAvailable as Mock).mockResolvedValue(true);
  (isYtDlpAvailable as Mock).mockResolvedValue(true);
});

function postJson(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function putJson(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/video/import-youtube", () => {
  it("rejects a missing URL with 400", async () => {
    const { POST } = await import("@/app/api/video/import-youtube/route");
    const res = await POST(postJson("http://localhost/api/video/import-youtube", {}));
    expect(res.status).toBe(400);
  });

  it("rejects a non-YouTube URL with 400", async () => {
    const { POST } = await import("@/app/api/video/import-youtube/route");
    const res = await POST(
      postJson("http://localhost/api/video/import-youtube", {
        url: "https://vimeo.com/123",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when yt-dlp is unavailable", async () => {
    (isYtDlpAvailable as Mock).mockResolvedValue(false);
    const { POST } = await import("@/app/api/video/import-youtube/route");
    const res = await POST(
      postJson("http://localhost/api/video/import-youtube", {
        url: "https://youtu.be/dQw4w9WgXcQ",
      })
    );
    expect(res.status).toBe(503);
  });

  it("imports a valid video and returns 201", async () => {
    (importFromYouTube as Mock).mockResolvedValue({
      videoPath: "/x.mp4",
      videoUrl: "/uploads/x.mp4",
      thumbnailUrl: "/uploads/x.jpg",
      duration: 120,
      title: "Cool video",
    });
    // 1) insert returning [created], 2) update returning [updated]
    queueResults(
      [{ id: UUID, title: "Vídeo do YouTube" }],
      [{ id: UUID, title: "Cool video", videoUrl: "/uploads/x.mp4" }]
    );

    const { POST } = await import("@/app/api/video/import-youtube/route");
    const res = await POST(
      postJson("http://localhost/api/video/import-youtube", {
        url: "https://youtu.be/dQw4w9WgXcQ",
        aspectRatio: "9:16",
      })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.projectId).toBe(UUID);
  });
});

describe("PUT /api/video/[id]/cuts", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("rejects an invalid project id with 400", async () => {
    const { PUT } = await import("@/app/api/video/[id]/cuts/route");
    const res = await PUT(
      putJson("http://localhost/api/video/bad/cuts", { cutRanges: [] }),
      params("not-a-uuid")
    );
    expect(res.status).toBe(400);
  });

  it("rejects malformed cutRanges with 400", async () => {
    const { PUT } = await import("@/app/api/video/[id]/cuts/route");
    const res = await PUT(
      putJson(`http://localhost/api/video/${UUID}/cuts`, {
        cutRanges: [{ foo: "bar" }],
      }),
      params(UUID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the project does not exist", async () => {
    queueResults([]); // not found
    const { PUT } = await import("@/app/api/video/[id]/cuts/route");
    const res = await PUT(
      putJson(`http://localhost/api/video/${UUID}/cuts`, { cutRanges: [] }),
      params(UUID)
    );
    expect(res.status).toBe(404);
  });

  it("rejects a non-video project with 400", async () => {
    queueResults([{ id: UUID, mediaType: "audio" }]);
    const { PUT } = await import("@/app/api/video/[id]/cuts/route");
    const res = await PUT(
      putJson(`http://localhost/api/video/${UUID}/cuts`, { cutRanges: [] }),
      params(UUID)
    );
    expect(res.status).toBe(400);
  });

  it("saves valid cut ranges for a video project (200)", async () => {
    queueResults([{ id: UUID, mediaType: "video" }]);
    const { PUT } = await import("@/app/api/video/[id]/cuts/route");
    const res = await PUT(
      putJson(`http://localhost/api/video/${UUID}/cuts`, {
        cutRanges: [{ id: "r1", start: 0, end: 5, order: 0 }],
        aspectRatio: "1:1",
      }),
      params(UUID)
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

describe("POST /api/video/[id]/render", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("rejects an invalid project id with 400", async () => {
    const { POST } = await import("@/app/api/video/[id]/render/route");
    const res = await POST(
      postJson("http://localhost/api/video/bad/render", {}),
      params("not-a-uuid")
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the project does not exist", async () => {
    queueResults([]);
    const { POST } = await import("@/app/api/video/[id]/render/route");
    const res = await POST(
      postJson(`http://localhost/api/video/${UUID}/render`, {}),
      params(UUID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 503 when ffmpeg is unavailable", async () => {
    (isFFmpegAvailable as Mock).mockResolvedValue(false);
    queueResults([{ id: UUID, mediaType: "video", videoUrl: "/uploads/x.mp4", cutRanges: [] }]);
    const { POST } = await import("@/app/api/video/[id]/render/route");
    const res = await POST(
      postJson(`http://localhost/api/video/${UUID}/render`, {}),
      params(UUID)
    );
    expect(res.status).toBe(503);
  });
});
