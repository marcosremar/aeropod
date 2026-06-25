import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MockStorageClient,
  createStorageClient,
  S3StorageClient,
} from "@/lib/storage/s3";

describe("MockStorageClient", () => {
  let storage: MockStorageClient;

  beforeEach(() => {
    storage = new MockStorageClient();
  });

  it("uploads and downloads a buffer round-trip", async () => {
    const body = Buffer.from("hello world");
    const { key, url } = await storage.upload({ key: "a/b.mp3", body });
    expect(key).toBe("a/b.mp3");
    expect(url).toContain("a/b.mp3");

    const out = await storage.download({ key: "a/b.mp3" });
    expect(out.toString()).toBe("hello world");
  });

  it("download throws for a missing key", async () => {
    await expect(storage.download({ key: "nope" })).rejects.toThrow(/not found/i);
  });

  it("has() reflects stored keys and clear() empties storage", async () => {
    await storage.upload({ key: "x", body: Buffer.from("1") });
    expect(storage.has("x")).toBe(true);
    storage.clear();
    expect(storage.has("x")).toBe(false);
  });

  it("getSignedUrl returns a signed url for existing keys", async () => {
    await storage.upload({ key: "k", body: Buffer.from("1") });
    const signed = await storage.getSignedUrl({ key: "k", expiresIn: 60 });
    expect(signed).toContain("signed=true");
  });

  it("getSignedUrl throws for missing keys", async () => {
    await expect(storage.getSignedUrl({ key: "ghost" })).rejects.toThrow(/not found/i);
  });

  it("accepts Uint8Array bodies", async () => {
    await storage.upload({ key: "u", body: new Uint8Array([104, 105]) });
    const out = await storage.download({ key: "u" });
    expect(out.toString()).toBe("hi");
  });
});

describe("createStorageClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a mock client when useMock=true", () => {
    expect(createStorageClient(true)).toBeInstanceOf(MockStorageClient);
  });

  it("falls back to mock in non-production when S3 is unconfigured", () => {
    vi.stubEnv("S3_ACCESS_KEY", "");
    vi.stubEnv("S3_SECRET_KEY", "");
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(createStorageClient()).toBeInstanceOf(MockStorageClient);
  });

  it("throws in production when S3 is unconfigured", () => {
    vi.stubEnv("S3_ACCESS_KEY", "");
    vi.stubEnv("S3_SECRET_KEY", "");
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createStorageClient()).toThrow(/S3/i);
  });

  it("returns a real S3 client when fully configured", () => {
    vi.stubEnv("S3_ACCESS_KEY", "ak");
    vi.stubEnv("S3_SECRET_KEY", "sk");
    vi.stubEnv("S3_BUCKET", "bucket");
    vi.stubEnv("NODE_ENV", "production");
    expect(createStorageClient()).toBeInstanceOf(S3StorageClient);
  });
});
