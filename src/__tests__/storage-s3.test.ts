/**
 * Unit tests for src/lib/storage/s3.ts
 * MockStorageClient tests run with no external dependencies.
 * S3StorageClient tests mock @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoist AWS SDK mocks ──────────────────────────────────────────────────────

const { mockSend, mockGetSignedUrl } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockGetSignedUrl = vi.fn();
  return { mockSend, mockGetSignedUrl };
});

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    config: { endpoint?: string } = {};
    constructor(cfg: { endpoint?: string }) {
      this.config.endpoint = cfg.endpoint;
    }
    send = mockSend;
  }
  class PutObjectCommand {
    constructor(public params: unknown) {}
  }
  class GetObjectCommand {
    constructor(public params: unknown) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import {
  MockStorageClient,
  S3StorageClient,
  createStorageClient,
} from "@/lib/storage/s3";

// ─── MockStorageClient ────────────────────────────────────────────────────────

describe("MockStorageClient", () => {
  let client: MockStorageClient;

  beforeEach(() => {
    client = new MockStorageClient();
  });

  describe("upload", () => {
    it("accepts a Buffer body and returns key and url", async () => {
      const buf = Buffer.from("hello");
      const result = await client.upload({ key: "foo.mp3", body: buf });
      expect(result.key).toBe("foo.mp3");
      expect(result.url).toBe("https://mock-storage.example.com/foo.mp3");
    });

    it("accepts a Uint8Array body", async () => {
      const arr = new Uint8Array([1, 2, 3]);
      const result = await client.upload({ key: "bar.wav", body: arr });
      expect(result.key).toBe("bar.wav");
      const downloaded = await client.download({ key: "bar.wav" });
      expect(downloaded).toEqual(Buffer.from([1, 2, 3]));
    });

    it("accepts a ReadableStream body", async () => {
      const data = new Uint8Array([10, 20, 30]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
      await client.upload({ key: "stream.mp3", body: stream });
      const downloaded = await client.download({ key: "stream.mp3" });
      expect(downloaded).toEqual(Buffer.from([10, 20, 30]));
    });

    it("uses a custom baseUrl when provided", async () => {
      const custom = new MockStorageClient("https://cdn.example.com");
      const result = await custom.upload({
        key: "a/b.mp3",
        body: Buffer.from("x"),
      });
      expect(result.url).toBe("https://cdn.example.com/a/b.mp3");
    });

    it("stores metadata alongside the buffer", async () => {
      await client.upload({
        key: "meta.mp3",
        body: Buffer.from("data"),
        metadata: { projectId: "proj-1" },
      });
      expect(client.has("meta.mp3")).toBe(true);
    });
  });

  describe("download", () => {
    it("returns the buffer that was previously uploaded", async () => {
      const buf = Buffer.from("audio data");
      await client.upload({ key: "audio.mp3", body: buf });
      const result = await client.download({ key: "audio.mp3" });
      expect(result).toEqual(buf);
    });

    it("throws when key does not exist", async () => {
      await expect(client.download({ key: "missing.mp3" })).rejects.toThrow(
        "Key not found: missing.mp3"
      );
    });
  });

  describe("getSignedUrl", () => {
    beforeEach(async () => {
      await client.upload({ key: "signed.mp3", body: Buffer.from("x") });
    });

    it("returns a URL containing ?signed=true for an existing key", async () => {
      const url = await client.getSignedUrl({ key: "signed.mp3" });
      expect(url).toContain("?signed=true");
      expect(url).toContain("signed.mp3");
    });

    it("throws when key does not exist", async () => {
      await expect(
        client.getSignedUrl({ key: "no-such.mp3" })
      ).rejects.toThrow("Key not found: no-such.mp3");
    });

    it("includes the custom expiresIn value in the URL", async () => {
      const url = await client.getSignedUrl({
        key: "signed.mp3",
        expiresIn: 7200,
      });
      expect(url).toMatch(/expires=\d+/);
    });
  });

  describe("has", () => {
    it("returns false for a key that was never uploaded", () => {
      expect(client.has("ghost.mp3")).toBe(false);
    });

    it("returns true after a key is uploaded", async () => {
      await client.upload({ key: "present.mp3", body: Buffer.from("y") });
      expect(client.has("present.mp3")).toBe(true);
    });
  });

  describe("clear", () => {
    it("removes all stored keys", async () => {
      await client.upload({ key: "a.mp3", body: Buffer.from("a") });
      await client.upload({ key: "b.mp3", body: Buffer.from("b") });
      client.clear();
      expect(client.has("a.mp3")).toBe(false);
      expect(client.has("b.mp3")).toBe(false);
    });

    it("allows re-uploading after clear", async () => {
      await client.upload({ key: "c.mp3", body: Buffer.from("c") });
      client.clear();
      await client.upload({ key: "c.mp3", body: Buffer.from("new") });
      const result = await client.download({ key: "c.mp3" });
      expect(result).toEqual(Buffer.from("new"));
    });
  });
});

// ─── S3StorageClient ──────────────────────────────────────────────────────────

describe("S3StorageClient", () => {
  const baseConfig = {
    accessKey: "AKID",
    secretKey: "SECRET",
    bucket: "my-bucket",
  };

  beforeEach(() => {
    mockSend.mockReset();
    mockGetSignedUrl.mockReset();
  });

  describe("upload", () => {
    it("returns the S3 URL when no endpoint is configured", async () => {
      mockSend.mockResolvedValue({});
      const client = new S3StorageClient(baseConfig);
      const result = await client.upload({
        key: "audio/file.mp3",
        body: Buffer.from("data"),
        contentType: "audio/mpeg",
      });
      expect(result.key).toBe("audio/file.mp3");
      expect(result.url).toBe(
        "https://my-bucket.s3.amazonaws.com/audio/file.mp3"
      );
    });

    it("returns an endpoint-prefixed URL when endpoint is configured", async () => {
      mockSend.mockResolvedValue({});
      const client = new S3StorageClient({
        ...baseConfig,
        endpoint: "https://r2.example.com",
      });
      const result = await client.upload({
        key: "clips/clip.mp3",
        body: Buffer.from("data"),
      });
      expect(result.url).toBe(
        "https://r2.example.com/my-bucket/clips/clip.mp3"
      );
    });

    it("propagates errors from the AWS SDK", async () => {
      mockSend.mockRejectedValue(new Error("AccessDenied"));
      const client = new S3StorageClient(baseConfig);
      await expect(
        client.upload({ key: "fail.mp3", body: Buffer.from("x") })
      ).rejects.toThrow("AccessDenied");
    });
  });

  describe("download", () => {
    it("returns a buffer assembled from the response body stream", async () => {
      async function* fakeStream() {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3, 4]);
      }
      mockSend.mockResolvedValue({ Body: fakeStream() });
      const client = new S3StorageClient(baseConfig);
      const result = await client.download({ key: "audio.mp3" });
      expect(result).toEqual(Buffer.from([1, 2, 3, 4]));
    });

    it("throws when response body is absent", async () => {
      mockSend.mockResolvedValue({ Body: null });
      const client = new S3StorageClient(baseConfig);
      await expect(
        client.download({ key: "missing.mp3" })
      ).rejects.toThrow("No body returned for key: missing.mp3");
    });
  });

  describe("getSignedUrl", () => {
    it("returns the URL from the presigner with default expiry", async () => {
      mockGetSignedUrl.mockResolvedValue("https://signed.example.com/url");
      const client = new S3StorageClient(baseConfig);
      const url = await client.getSignedUrl({ key: "audio.mp3" });
      expect(url).toBe("https://signed.example.com/url");
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
    });

    it("forwards a custom expiresIn to the presigner", async () => {
      mockGetSignedUrl.mockResolvedValue("https://signed.example.com/url2");
      const client = new S3StorageClient(baseConfig);
      await client.getSignedUrl({ key: "audio.mp3", expiresIn: 600 });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 600 }
      );
    });
  });
});

// ─── createStorageClient ──────────────────────────────────────────────────────

describe("createStorageClient", () => {
  afterEach(() => {
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
  });

  it("returns a MockStorageClient when useMock is true", () => {
    const client = createStorageClient(true);
    expect(client).toBeInstanceOf(MockStorageClient);
  });

  it("throws when required env vars are missing", () => {
    expect(() => createStorageClient(false)).toThrow(
      "Missing required S3 configuration"
    );
  });

  it("returns an S3StorageClient when all required env vars are set", () => {
    process.env.S3_ACCESS_KEY = "AKID";
    process.env.S3_SECRET_KEY = "SECRET";
    process.env.S3_BUCKET = "bucket";
    const client = createStorageClient(false);
    expect(client).toBeInstanceOf(S3StorageClient);
  });
});
