import { describe, it, expect, beforeEach } from "vitest";

describe("GET /api/health", () => {
  let GET: () => Promise<Response>;

  beforeEach(async () => {
    const module = await import("@/app/api/health/route");
    GET = module.GET;
  });

  it("returns 200 status", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns status: ok", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("returns app: aeropod", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.app).toBe("aeropod");
  });

  it("returns a valid ISO 8601 timestamp", async () => {
    const res = await GET();
    const data = await res.json();
    expect(typeof data.timestamp).toBe("string");
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  it("returns a timestamp close to the current time", async () => {
    const before = Date.now();
    const res = await GET();
    const after = Date.now();
    const data = await res.json();
    const ts = new Date(data.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
