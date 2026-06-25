import { describe, it, expect } from "vitest";
import {
  isValidYouTubeUrl,
  extractYouTubeId,
  isYtDlpAvailable,
  YtDlpNotAvailableError,
} from "@/lib/video/youtube";

describe("YouTube URL helpers", () => {
  it("accepts standard watch URLs", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts youtu.be short links", () => {
    expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts youtube shorts links", () => {
    expect(isValidYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
  });

  it("rejects non-YouTube URLs", () => {
    expect(isValidYouTubeUrl("https://vimeo.com/12345")).toBe(false);
    expect(isValidYouTubeUrl("not a url")).toBe(false);
    expect(isValidYouTubeUrl("")).toBe(false);
  });

  it("rejects URLs with a malformed video id", () => {
    expect(isValidYouTubeUrl("https://youtube.com/watch?v=short")).toBe(false);
  });

  it("extracts the 11-char video id", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://vimeo.com/1")).toBeNull();
  });

  it("isYtDlpAvailable resolves to a boolean", async () => {
    expect(typeof (await isYtDlpAvailable())).toBe("boolean");
  });

  it("YtDlpNotAvailableError is an Error with a helpful message", () => {
    const err = new YtDlpNotAvailableError("YouTube import");
    expect(err).toBeInstanceOf(Error);
    expect(err.message.toLowerCase()).toContain("yt-dlp");
  });
});
