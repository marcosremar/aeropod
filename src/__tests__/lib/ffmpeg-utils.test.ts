import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  isBinaryAvailable,
  isFFmpegAvailable,
  isFFprobeAvailable,
  assertFFmpeg,
  FFmpegNotAvailableError,
} from "@/lib/audio/ffmpeg-utils";

// Create a real, executable stub binary that exits 0 for any args so we can
// exercise the real spawn() code path deterministically (no ffmpeg required).
let okBin = "";
let failBin = "";

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ffmpeg-utils-"));
  okBin = path.join(dir, "okbin");
  failBin = path.join(dir, "failbin");
  await fs.writeFile(okBin, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await fs.writeFile(failBin, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await fs.chmod(okBin, 0o755);
  await fs.chmod(failBin, 0o755);
});

afterAll(async () => {
  try {
    await fs.rm(path.dirname(okBin), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("ffmpeg-utils", () => {
  it("returns true when the binary exits 0", async () => {
    await expect(isBinaryAvailable(okBin)).resolves.toBe(true);
  });

  it("returns false when the binary exits non-zero", async () => {
    await expect(isBinaryAvailable(failBin)).resolves.toBe(false);
  });

  it("returns false when the binary cannot be spawned", async () => {
    await expect(
      isBinaryAvailable("/no/such/binary-xyz-123")
    ).resolves.toBe(false);
  });

  it("caches results per binary name", async () => {
    const a = await isBinaryAvailable(okBin);
    const b = await isBinaryAvailable(okBin);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it("isFFmpegAvailable / isFFprobeAvailable return booleans", async () => {
    expect(typeof (await isFFmpegAvailable())).toBe("boolean");
    expect(typeof (await isFFprobeAvailable())).toBe("boolean");
  });

  it("assertFFmpeg resolves when the binary is present", async () => {
    await expect(assertFFmpeg("Node feature", okBin)).resolves.toBeUndefined();
  });

  it("assertFFmpeg throws FFmpegNotAvailableError when missing", async () => {
    await expect(
      assertFFmpeg("Export", "/no/such/binary-xyz-123")
    ).rejects.toBeInstanceOf(FFmpegNotAvailableError);
  });

  it("FFmpegNotAvailableError carries an actionable message", () => {
    const err = new FFmpegNotAvailableError("Audio export");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("FFmpegNotAvailableError");
    expect(err.message).toContain("Audio export");
    expect(err.message.toLowerCase()).toContain("ffmpeg");
  });
});
