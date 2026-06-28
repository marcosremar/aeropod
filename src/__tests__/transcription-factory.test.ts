/**
 * Unit tests for createTranscriptionService factory function.
 * Pins the env-variable routing logic without making any real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock external SDKs so constructors don't throw in jsdom
vi.mock("groq-sdk", () => ({
  default: class MockGroq {
    constructor(_opts: unknown) {}
  },
}));

vi.mock("replicate", () => ({
  default: class MockReplicate {
    constructor(_opts: unknown) {}
  },
}));

vi.mock("@deepgram/sdk", () => ({
  createClient: vi.fn().mockReturnValue({}),
}));

// Mock isDeepgramConfigured so we control its return value
vi.mock("@/services/deepgram", () => ({
  isDeepgramConfigured: vi.fn(),
  transcribeWithDeepgram: vi.fn(),
}));

// Mock crisper-whisper service
vi.mock("@/services/crisper-whisper", () => ({
  transcribeFromUrl: vi.fn(),
}));

import {
  createTranscriptionService,
  MockTranscriptionService,
  DeepgramTranscriptionService,
  CrisperWhisperTranscriptionService,
  GroqTranscriptionService,
  ReplicateTranscriptionService,
} from "@/lib/audio/transcription";
import { isDeepgramConfigured } from "@/services/deepgram";

const ALL_ENV_KEYS = [
  "USE_DEEPGRAM",
  "DEEPGRAM_API_KEY",
  "USE_CRISPER_WHISPER",
  "GROQ_API_KEY",
  "REPLICATE_API_TOKEN",
];

function setEnv(vars: Record<string, string | undefined>) {
  for (const key of ALL_ENV_KEYS) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) {
      process.env[k] = v;
    }
  }
}

describe("createTranscriptionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnv({});
  });

  afterEach(() => {
    setEnv({});
  });

  // ─── useMock ──────────────────────────────────────────────────────────────

  it("returns MockTranscriptionService when useMock is true", () => {
    const svc = createTranscriptionService(true);
    expect(svc).toBeInstanceOf(MockTranscriptionService);
  });

  // ─── Deepgram ─────────────────────────────────────────────────────────────

  it("returns DeepgramTranscriptionService when USE_DEEPGRAM=true and configured", () => {
    setEnv({ USE_DEEPGRAM: "true" });
    vi.mocked(isDeepgramConfigured).mockReturnValue(true);

    const svc = createTranscriptionService();
    expect(svc).toBeInstanceOf(DeepgramTranscriptionService);
  });

  it("uses 'pt-BR' as the default Deepgram language when none is supplied", () => {
    setEnv({ USE_DEEPGRAM: "true" });
    vi.mocked(isDeepgramConfigured).mockReturnValue(true);

    const svc = createTranscriptionService() as DeepgramTranscriptionService;
    expect((svc as any).language).toBe("pt-BR");
  });

  it("passes the explicit language to DeepgramTranscriptionService", () => {
    setEnv({ USE_DEEPGRAM: "true" });
    vi.mocked(isDeepgramConfigured).mockReturnValue(true);

    const svc = createTranscriptionService(false, "en") as DeepgramTranscriptionService;
    expect((svc as any).language).toBe("en");
  });

  it("skips Deepgram when USE_DEEPGRAM is not 'true'", () => {
    setEnv({ GROQ_API_KEY: "groq-key" });
    vi.mocked(isDeepgramConfigured).mockReturnValue(true);

    const svc = createTranscriptionService();
    expect(svc).toBeInstanceOf(GroqTranscriptionService);
  });

  it("skips Deepgram when isDeepgramConfigured returns false", () => {
    setEnv({ USE_DEEPGRAM: "true", GROQ_API_KEY: "groq-key" });
    vi.mocked(isDeepgramConfigured).mockReturnValue(false);

    const svc = createTranscriptionService();
    expect(svc).toBeInstanceOf(GroqTranscriptionService);
  });

  // ─── CrisperWhisper ───────────────────────────────────────────────────────

  it("returns CrisperWhisperTranscriptionService for 'en' when USE_CRISPER_WHISPER=true", () => {
    setEnv({ USE_CRISPER_WHISPER: "true" });

    const svc = createTranscriptionService(false, "en");
    expect(svc).toBeInstanceOf(CrisperWhisperTranscriptionService);
  });

  it("returns CrisperWhisperTranscriptionService for 'de' when USE_CRISPER_WHISPER=true", () => {
    setEnv({ USE_CRISPER_WHISPER: "true" });

    const svc = createTranscriptionService(false, "de");
    expect(svc).toBeInstanceOf(CrisperWhisperTranscriptionService);
    expect((svc as any).language).toBe("de");
  });

  it("falls through to Groq when USE_CRISPER_WHISPER=true but language is 'pt'", () => {
    setEnv({ USE_CRISPER_WHISPER: "true", GROQ_API_KEY: "groq-key" });

    const svc = createTranscriptionService(false, "pt");
    expect(svc).toBeInstanceOf(GroqTranscriptionService);
  });

  it("extracts the base language code from a full locale (en-US → en)", () => {
    setEnv({ USE_CRISPER_WHISPER: "true" });

    const svc = createTranscriptionService(false, "en-US");
    expect(svc).toBeInstanceOf(CrisperWhisperTranscriptionService);
    expect((svc as any).language).toBe("en");
  });

  // ─── Groq ─────────────────────────────────────────────────────────────────

  it("returns GroqTranscriptionService when GROQ_API_KEY is set", () => {
    setEnv({ GROQ_API_KEY: "gsk_test_key" });

    const svc = createTranscriptionService();
    expect(svc).toBeInstanceOf(GroqTranscriptionService);
  });

  // ─── Replicate ────────────────────────────────────────────────────────────

  it("returns ReplicateTranscriptionService when only REPLICATE_API_TOKEN is set", () => {
    setEnv({ REPLICATE_API_TOKEN: "r8_token" });

    const svc = createTranscriptionService();
    expect(svc).toBeInstanceOf(ReplicateTranscriptionService);
  });

  it("prefers Groq over Replicate when both keys are present", () => {
    setEnv({ GROQ_API_KEY: "gsk_key", REPLICATE_API_TOKEN: "r8_token" });

    const svc = createTranscriptionService();
    expect(svc).toBeInstanceOf(GroqTranscriptionService);
  });

  // ─── Error case ───────────────────────────────────────────────────────────

  it("throws when no provider env vars are set", () => {
    setEnv({});
    vi.mocked(isDeepgramConfigured).mockReturnValue(false);

    expect(() => createTranscriptionService()).toThrow(
      /GROQ_API_KEY or REPLICATE_API_TOKEN/
    );
  });
});
