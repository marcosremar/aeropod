import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tableStubs } from "../helpers/mock-db";

// ---------------------------------------------------------------------------
// Module-boundary mocks (must be declared before importing the SUTs)
// ---------------------------------------------------------------------------

// DB mock for filler-detection.ts.
// Build the controller lazily inside vi.hoisted so the `db` mock factory (which
// is hoisted to the top of the module) can reference `mockDb` safely.
const { mockDb, setResult, queueResults, captured, reset } = vi.hoisted(() => {
  const vitest = vi;

  const defaultState: { result: unknown[]; queue: unknown[][] | null } = {
    result: [],
    queue: null,
  };
  const cap = {
    inserts: [] as unknown[],
    updates: [] as unknown[],
    values: [] as unknown[],
    sets: [] as unknown[],
    deletes: 0,
  };
  const resolveResult = (): unknown[] => {
    if (defaultState.queue && defaultState.queue.length > 0) {
      return defaultState.queue.shift() as unknown[];
    }
    return defaultState.result;
  };
  const chain: Record<string, unknown> = {};
  const builderMethods = [
    "select",
    "selectDistinct",
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "groupBy",
    "having",
    "leftJoin",
    "returning",
  ];
  for (const m of builderMethods) chain[m] = vitest.fn(() => chain);
  chain.insert = vitest.fn((t: unknown) => {
    cap.inserts.push(t);
    return chain;
  });
  chain.update = vitest.fn((t: unknown) => {
    cap.updates.push(t);
    return chain;
  });
  chain.delete = vitest.fn(() => {
    cap.deletes += 1;
    return chain;
  });
  chain.values = vitest.fn((v: unknown) => {
    cap.values.push(v);
    return chain;
  });
  chain.set = vitest.fn((v: unknown) => {
    cap.sets.push(v);
    return chain;
  });
  chain.then = (
    onFulfilled?: (value: unknown[]) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(resolveResult()).then(onFulfilled, onRejected);

  return {
    mockDb: chain as Record<string, (...a: unknown[]) => unknown>,
    setResult: (rows: unknown[]) => {
      defaultState.result = rows;
    },
    queueResults: (...batches: unknown[][]) => {
      defaultState.queue = batches;
    },
    captured: cap,
    reset: () => {
      cap.inserts = [];
      cap.updates = [];
      cap.values = [];
      cap.sets = [];
      cap.deletes = 0;
      defaultState.queue = null;
    },
  };
});

vi.mock("@/lib/db", () => ({
  db: mockDb,
  ...tableStubs("fillerWords", "segments", "projects"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn(() => "and"),
  desc: vi.fn(() => "desc"),
}));

// Heavy external SDKs used by transcription.ts — never construct the real thing.
const replicateRun = vi.fn();
vi.mock("replicate", () => ({
  default: class {
    run = replicateRun;
    constructor() {}
  },
}));

const groqCreate = vi.fn();
vi.mock("groq-sdk", () => ({
  default: class {
    audio = { transcriptions: { create: groqCreate } };
    constructor() {}
  },
}));

vi.mock("@/services/crisper-whisper", () => ({
  transcribeFromUrl: vi.fn(),
}));

vi.mock("@/services/deepgram", () => ({
  transcribeWithDeepgram: vi.fn(),
  isDeepgramConfigured: vi.fn(() => false),
}));

// fluent-ffmpeg used by export.ts — provide a chainable command stub.
vi.mock("fluent-ffmpeg", () => {
  const makeCommand = () => {
    const cmd: Record<string, any> = {};
    const chainMethods = [
      "setStartTime",
      "setDuration",
      "audioCodec",
      "format",
      "input",
      "complexFilter",
      "outputOptions",
      "audioBitrate",
      "audioFilters",
    ];
    for (const m of chainMethods) cmd[m] = vi.fn(() => cmd);
    cmd.on = vi.fn(() => cmd);
    // pipe: emit a small buffer then end so the export promise resolves
    cmd.pipe = vi.fn((stream: any) => {
      setImmediate(() => {
        stream.write(Buffer.from("ff"));
        stream.end();
      });
      return stream;
    });
    return cmd;
  };
  const ffmpeg = vi.fn(() => makeCommand());
  // export.ts does `const ffmpeg = require('fluent-ffmpeg')`, so the module
  // value itself must be callable. Expose it as both the namespace function and
  // its own `default` for interop.
  (ffmpeg as any).default = ffmpeg;
  return ffmpeg as any;
});

// ---------------------------------------------------------------------------
// chunking.ts
// ---------------------------------------------------------------------------
import {
  chunkTranscription,
  mergeChunks,
  splitChunkAtTime,
  validateChunks,
  type AudioChunk,
} from "@/lib/audio/chunking";
import type { TranscriptionSegment } from "@/lib/audio/transcription";

function seg(
  id: number,
  start: number,
  end: number,
  text: string
): TranscriptionSegment {
  return { id, start, end, text };
}

describe("chunking: chunkTranscription", () => {
  it("returns empty array for no segments", () => {
    expect(chunkTranscription([])).toEqual([]);
  });

  it("groups short segments into one chunk under the min duration", () => {
    const segs = [
      seg(0, 0, 5, "Hello"),
      seg(1, 5, 10, "there"),
      seg(2, 10, 15, "friend"),
    ];
    const chunks = chunkTranscription(segs);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toBe("chunk-0");
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].endTime).toBe(15);
    expect(chunks[0].segmentIds).toEqual([0, 1, 2]);
    expect(chunks[0].text).toBe("Hello there friend");
  });

  it("breaks at a long pause once min duration is reached", () => {
    // seg0 alone already meets the 30s minimum; the >1s gap before seg1 is a
    // natural pause, so the chunker starts a new chunk at seg1.
    const segs = [
      seg(0, 0, 35, "a long opening passage that runs past the minimum"),
      seg(1, 40, 50, "after a clear pause"),
    ];
    const chunks = chunkTranscription(segs, { minDuration: 30, maxDuration: 60 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].segmentIds).toEqual([0]);
    expect(chunks[1].segmentIds).toEqual([1]);
  });

  it("splits when adding a segment would exceed maxDuration", () => {
    const segs = [
      seg(0, 0, 40, "long opening segment that is big"),
      seg(1, 40, 90, "another large one"),
    ];
    const chunks = chunkTranscription(segs, { minDuration: 30, maxDuration: 60 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].segmentIds).toEqual([0]);
    expect(chunks[1].segmentIds).toEqual([1]);
  });

  it("force-includes an over-max segment when current chunk is below min", () => {
    // current chunk is short (< min) but next segment pushes over max, so the
    // small segment is force-merged with the large one into a single chunk.
    const segs = [
      seg(0, 0, 5, "tiny"),
      seg(1, 5, 100, "enormous"),
    ];
    const chunks = chunkTranscription(segs, { minDuration: 30, maxDuration: 60 });
    // The first chunk merges both segments and spans the full duration.
    expect(chunks[0].segmentIds).toEqual([0, 1]);
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].endTime).toBe(100);
    expect(chunks[0].text).toBe("tiny enormous");
  });
});

describe("chunking: mergeChunks", () => {
  const a: AudioChunk = {
    id: "chunk-0",
    startTime: 0,
    endTime: 10,
    text: "hello",
    segmentIds: [0, 1],
  };
  const b: AudioChunk = {
    id: "chunk-1",
    startTime: 10,
    endTime: 20,
    text: "world",
    segmentIds: [2],
  };

  it("returns null for an empty array", () => {
    expect(mergeChunks([])).toBeNull();
  });

  it("returns the single chunk unchanged", () => {
    expect(mergeChunks([a])).toBe(a);
  });

  it("merges and sorts multiple chunks", () => {
    const merged = mergeChunks([b, a])!;
    expect(merged.startTime).toBe(0);
    expect(merged.endTime).toBe(20);
    expect(merged.text).toBe("hello world");
    expect(merged.segmentIds).toEqual([0, 1, 2]);
    expect(merged.id).toBe("merged-chunk-0-chunk-1");
  });
});

describe("chunking: splitChunkAtTime", () => {
  const segs = [
    seg(0, 0, 10, "one"),
    seg(1, 10, 20, "two"),
    seg(2, 20, 30, "three"),
  ];
  const chunk: AudioChunk = {
    id: "chunk-0",
    startTime: 0,
    endTime: 30,
    text: "one two three",
    segmentIds: [0, 1, 2],
  };

  it("returns null when split time is outside chunk bounds", () => {
    expect(splitChunkAtTime(chunk, segs, 0)).toBeNull();
    expect(splitChunkAtTime(chunk, segs, 30)).toBeNull();
    expect(splitChunkAtTime(chunk, segs, 40)).toBeNull();
  });

  it("splits within a segment that contains the split time", () => {
    const result = splitChunkAtTime(chunk, segs, 15)!;
    expect(result).not.toBeNull();
    const [first, second] = result;
    expect(first.id).toBe("chunk-0-a");
    expect(second.id).toBe("chunk-0-b");
    expect(first.endTime).toBe(15);
    expect(second.startTime).toBe(15);
    // segment 1 (10-20) contains 15, so it's part of the first half
    expect(first.segmentIds).toEqual([0, 1]);
    expect(second.segmentIds).toEqual([2]);
  });
});

describe("chunking: validateChunks", () => {
  it("treats empty as valid", () => {
    expect(validateChunks([])).toBe(true);
  });

  it("accepts ordered non-overlapping chunks", () => {
    const chunks: AudioChunk[] = [
      { id: "a", startTime: 0, endTime: 10, text: "", segmentIds: [] },
      { id: "b", startTime: 10, endTime: 20, text: "", segmentIds: [] },
    ];
    expect(validateChunks(chunks)).toBe(true);
  });

  it("rejects overlapping chunks", () => {
    const chunks: AudioChunk[] = [
      { id: "a", startTime: 0, endTime: 15, text: "", segmentIds: [] },
      { id: "b", startTime: 10, endTime: 20, text: "", segmentIds: [] },
    ];
    expect(validateChunks(chunks)).toBe(false);
  });

  it("rejects a chunk with start >= end", () => {
    const chunks: AudioChunk[] = [
      { id: "a", startTime: 10, endTime: 10, text: "", segmentIds: [] },
      { id: "b", startTime: 20, endTime: 30, text: "", segmentIds: [] },
    ];
    expect(validateChunks(chunks)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enhancement-service.ts
// ---------------------------------------------------------------------------
import {
  AudioEnhancementService,
  ENHANCEMENT_PRESETS,
  audioEnhancementService,
} from "@/lib/audio/enhancement-service";
import type { EnhancementSettings } from "@/lib/db/schema";

describe("AudioEnhancementService.buildFilterChain", () => {
  const svc = new AudioEnhancementService();

  it("always applies a highpass filter", () => {
    const filters = svc.buildFilterChain({} as EnhancementSettings);
    expect(filters[0]).toBe("highpass=f=80");
  });

  it("adds denoise with the medium strength mapping", () => {
    const filters = svc.buildFilterChain({
      denoise: { enabled: true, strength: "medium" },
    } as EnhancementSettings);
    expect(filters).toContain("afftdn=nf=-25");
  });

  it("adds aggressive denoise mapping", () => {
    const filters = svc.buildFilterChain({
      denoise: { enabled: true, strength: "aggressive" },
    } as EnhancementSettings);
    expect(filters).toContain("afftdn=nf=-35");
  });

  it("adds the voice EQ preset", () => {
    const filters = svc.buildFilterChain({
      eq: { enabled: true, preset: "voice" },
    } as EnhancementSettings);
    expect(filters.some((f) => f.includes("equalizer=f=3000"))).toBe(true);
  });

  it("builds a custom EQ from five bands", () => {
    const filters = svc.buildFilterChain({
      eq: { enabled: true, preset: "custom", customBands: [1, 2, 3, 4, 5] },
    } as EnhancementSettings);
    const eq = filters.find((f) => f.includes("equalizer=f=100"));
    expect(eq).toBeTruthy();
    expect(eq).toContain("equalizer=f=10000:t=h:w=5000:g=5");
  });

  it("omits custom EQ when fewer than five bands are given", () => {
    const filters = svc.buildFilterChain({
      eq: { enabled: true, preset: "custom", customBands: [1, 2] },
    } as EnhancementSettings);
    // only the highpass should be present (no equalizer entries)
    expect(filters.some((f) => f.includes("equalizer"))).toBe(false);
  });

  it("adds compression and normalization, normalization last", () => {
    const filters = svc.buildFilterChain({
      compress: { enabled: true, preset: "broadcast" },
      normalize: { enabled: true, targetLufs: -14 },
    } as EnhancementSettings);
    expect(filters.some((f) => f.includes("acompressor") && f.includes("alimiter"))).toBe(true);
    expect(filters[filters.length - 1]).toBe("loudnorm=I=-14:LRA=11:TP=-1.5");
  });

  it("defaults normalize LUFS to -16 when unspecified", () => {
    const filters = svc.buildFilterChain({
      normalize: { enabled: true, targetLufs: 0 },
    } as EnhancementSettings);
    expect(filters[filters.length - 1]).toBe("loudnorm=I=-16:LRA=11:TP=-1.5");
  });
});

describe("AudioEnhancementService static + presets", () => {
  it("getDefaultSettings returns podcast defaults", () => {
    const def = AudioEnhancementService.getDefaultSettings();
    expect(def.normalize?.targetLufs).toBe(-16);
    expect(def.eq?.preset).toBe("voice");
    expect(def.compress?.preset).toBe("medium");
  });

  it("exposes named presets", () => {
    expect(ENHANCEMENT_PRESETS.broadcast_ready.settings.normalize.targetLufs).toBe(-14);
    expect(ENHANCEMENT_PRESETS.minimal.settings.denoise.enabled).toBe(false);
  });

  it("exports a singleton instance", () => {
    expect(audioEnhancementService).toBeInstanceOf(AudioEnhancementService);
  });
});

describe("AudioEnhancementService.enhance (ffmpeg mocked via child_process)", () => {
  it("returns failure when ffmpeg cannot spawn", async () => {
    // Use a bogus binary path so spawn emits an 'error' event in this env.
    const svc = new AudioEnhancementService("/nonexistent/ffmpeg-binary-xyz");
    const result = await svc.enhance({
      inputPath: "/tmp/in.mp3",
      outputPath: "/tmp/out.mp3",
      normalize: { enabled: true, targetLufs: -16 },
    } as any);
    expect(result.success).toBe(false);
    expect(result.outputPath).toBe("");
    expect(typeof result.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// export.ts
// ---------------------------------------------------------------------------
import {
  MockExportService,
  FFmpegExportService,
  createExportService,
  createTemplateExportService,
  TemplateExportService,
} from "@/lib/audio/export";

describe("export: MockExportService", () => {
  const svc = new MockExportService();

  it("extractSegment returns a descriptive buffer", async () => {
    const buf = await svc.extractSegment({
      inputPath: "/a.mp3",
      startTime: 1,
      endTime: 4,
    });
    expect(buf.toString()).toContain("mock-segment-/a.mp3-1-4-3s");
  });

  it("concatenateSegments encodes its segments", async () => {
    const buf = await svc.concatenateSegments({
      segments: [{ path: "/a.mp3", startTime: 0, endTime: 2 }],
      crossfadeDuration: 0.5,
    });
    expect(buf.toString()).toContain("mock-concatenated");
    expect(buf.toString()).toContain("crossfade:0.5s");
  });

  it("extractChunks returns one buffer per chunk", async () => {
    const chunks: AudioChunk[] = [
      { id: "c0", startTime: 0, endTime: 5, text: "", segmentIds: [] },
      { id: "c1", startTime: 5, endTime: 10, text: "", segmentIds: [] },
    ];
    const bufs = await svc.extractChunks("/a.mp3", chunks);
    expect(bufs).toHaveLength(2);
    expect(bufs[0].toString()).toContain("mock-chunk-c0");
  });

  it("get/setMockData round-trips", () => {
    svc.setMockData("k", Buffer.from("v"));
    expect(svc.getMockData("k")?.toString()).toBe("v");
    expect(svc.getMockData("default")?.toString()).toBe("mock-audio-data");
  });
});

describe("export: factories", () => {
  it("createExportService(true) returns a mock", () => {
    expect(createExportService(true)).toBeInstanceOf(MockExportService);
  });
  it("createExportService(false) returns the ffmpeg impl", () => {
    expect(createExportService(false)).toBeInstanceOf(FFmpegExportService);
  });
  it("createTemplateExportService returns a TemplateExportService", () => {
    expect(createTemplateExportService()).toBeInstanceOf(TemplateExportService);
  });
});

describe("export: FFmpegExportService (validation paths that never spawn ffmpeg)", () => {
  it("concatenateSegments throws on empty segment list", async () => {
    const svc = new FFmpegExportService();
    await expect(
      svc.concatenateSegments({ segments: [] })
    ).rejects.toThrow("No segments to concatenate");
  });

  it("extractSegmentWithCuts returns an empty buffer when nothing is kept", async () => {
    // A single cut covering the whole 0-1 range leaves no parts to keep.
    const svc = new FFmpegExportService();
    const buf = await svc.extractSegment({
      inputPath: "/a.mp3",
      startTime: 0,
      endTime: 10,
      textCuts: [{ startPercent: 0, endPercent: 1 }],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(0);
  });
});

describe("export: TemplateExportService (validation paths)", () => {
  it("throws when there are no sections", async () => {
    const svc = createTemplateExportService();
    await expect(
      svc.exportTemplateBasedProject({ projectId: "p1", sections: [] })
    ).rejects.toThrow("No sections to export");
  });

  it("throws when every section is empty (no content)", async () => {
    const svc = createTemplateExportService();
    await expect(
      svc.exportTemplateBasedProject({
        projectId: "p1",
        sections: [{ sectionId: "s1", order: 0, segments: [] }],
      })
    ).rejects.toThrow("No sections with content to export");
  });
});

// ---------------------------------------------------------------------------
// filler-detection.ts
// ---------------------------------------------------------------------------
import {
  detectFillerWords,
  generateFillerRemovalFilter,
  saveFillers,
  getProjectFillers,
  markFillersForRemoval,
  getFillerStats,
} from "@/lib/audio/filler-detection";
import type { WordTimestamp } from "@/lib/db/schema";

function w(word: string, start: number, end: number): WordTimestamp {
  return { word, start, end };
}

describe("filler-detection: detectFillerWords", () => {
  it("detects a single-word Portuguese filler", () => {
    const words = [w("Eu", 0, 0.5), w("hum", 0.5, 0.8), w("acho", 0.8, 1.2)];
    const fillers = detectFillerWords(words, "pt");
    const hum = fillers.find((f) => f.word === "hum");
    expect(hum).toBeTruthy();
    expect(hum!.startTime).toBe(0.5);
    expect(hum!.endTime).toBe(0.8);
    expect(hum!.confidence).toBeGreaterThan(0.7);
    expect(hum!.context).toContain("[hum]");
  });

  it("detects multi-word fillers with high confidence", () => {
    const words = [w("eu", 0, 0.5), w("quer", 0.5, 0.9), w("dizer", 0.9, 1.3)];
    const fillers = detectFillerWords(words, "pt");
    const multi = fillers.find((f) => f.word === "quer dizer");
    expect(multi).toBeTruthy();
    expect(multi!.confidence).toBe(0.9);
    expect(multi!.startTime).toBe(0.5);
    expect(multi!.endTime).toBe(1.3);
  });

  it("returns nothing for clean speech", () => {
    const words = [w("hello", 0, 0.5), w("world", 0.5, 1)];
    expect(detectFillerWords(words, "en")).toEqual([]);
  });

  it("lowers confidence for 'tipo de' (used as 'type of')", () => {
    const tipoDe = detectFillerWords(
      [w("um", 0, 0.3), w("tipo", 0.3, 0.6), w("de", 0.6, 0.8), w("coisa", 0.8, 1.1)],
      "pt"
    ).find((f) => f.word === "tipo");
    const tipoFiller = detectFillerWords(
      [w("foi", 0, 0.3), w("tipo", 0.3, 0.6), w("aquilo", 0.6, 1)],
      "pt"
    ).find((f) => f.word === "tipo");
    expect(tipoDe!.confidence).toBeLessThan(tipoFiller!.confidence);
  });
});

describe("filler-detection: generateFillerRemovalFilter", () => {
  it("returns empty string when no fillers are flagged removed", () => {
    const fillers = [
      { startTime: 1, endTime: 2, isRemoved: false } as any,
    ];
    expect(generateFillerRemovalFilter(fillers, 10)).toBe("");
  });

  it("builds atrim/concat filter for the kept segments", () => {
    const fillers = [
      { startTime: 2, endTime: 3, isRemoved: true } as any,
      { startTime: 6, endTime: 7, isRemoved: true } as any,
    ];
    const filter = generateFillerRemovalFilter(fillers, 10);
    // Keep 0-2, 3-6, 7-10  => 3 atrim parts
    expect(filter).toContain("atrim=start=0:end=2");
    expect(filter).toContain("atrim=start=3:end=6");
    expect(filter).toContain("atrim=start=7:end=10");
    expect(filter).toContain("concat=n=3:v=0:a=1[out]");
  });
});

describe("filler-detection: DB-backed functions (mocked db)", () => {
  beforeEach(() => reset());

  it("saveFillers returns [] without touching db when no fillers", async () => {
    const result = await saveFillers("p1", "s1", []);
    expect(result).toEqual([]);
    expect(captured.inserts).toHaveLength(0);
  });

  it("saveFillers inserts mapped rows and returns inserted", async () => {
    // first await: returning() inserted rows; subsequent awaits: stats select + project update
    queueResults(
      [{ id: "f1", word: "hum" }], // insert ... returning
      [], // getProjectFillers (inside updateProjectFillerStats -> getFillerStats)
      [] // project update
    );
    const inserted = await saveFillers("p1", "s1", [
      { word: "hum", startTime: 1, endTime: 1.5, confidence: 0.9, segmentId: "s1" },
    ]);
    expect(inserted).toEqual([{ id: "f1", word: "hum" }]);
    expect(captured.values[0]).toMatchObject([
      { projectId: "p1", segmentId: "s1", word: "hum", isRemoved: false },
    ]);
  });

  it("getProjectFillers selects ordered fillers", async () => {
    setResult([{ id: "f1", word: "hum", startTime: 1 }]);
    const fillers = await getProjectFillers("p1");
    expect(fillers).toHaveLength(1);
  });

  it("markFillersForRemoval issues an update per id", async () => {
    setResult([]);
    await markFillersForRemoval(["a", "b"], true);
    expect(captured.updates.length).toBe(2);
    expect(captured.sets[0]).toMatchObject({ isRemoved: true });
  });

  it("getFillerStats aggregates counts and time saved", async () => {
    setResult([
      { word: "hum", startTime: 1, endTime: 1.5, isRemoved: true },
      { word: "hum", startTime: 5, endTime: 5.4, isRemoved: false },
      { word: "eh", startTime: 8, endTime: 8.6, isRemoved: true },
    ]);
    const stats = await getFillerStats("p1");
    expect(stats.totalCount).toBe(3);
    expect(stats.removedCount).toBe(2);
    expect(stats.byType).toEqual({ hum: 2, eh: 1 });
    expect(stats.timeSaved).toBeCloseTo(0.5 + 0.6, 5);
  });
});

// ---------------------------------------------------------------------------
// forced-aligner.ts
// ---------------------------------------------------------------------------
import {
  ForcedAlignerService,
  getForcedAlignerService,
} from "@/lib/audio/forced-aligner";
import { jsonResponse } from "../helpers/mock-fetch";

describe("forced-aligner: ForcedAlignerService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getForcedAlignerService returns a singleton", () => {
    const a = getForcedAlignerService();
    const b = getForcedAlignerService();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(ForcedAlignerService);
  });

  it("isHealthy returns true when health endpoint reports ok", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({ status: "ok" })
    ) as unknown as typeof fetch;
    const svc = new ForcedAlignerService();
    expect(await svc.isHealthy()).toBe(true);
  });

  it("isHealthy returns false on a non-ok response", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({}, { status: 500, ok: false })
    ) as unknown as typeof fetch;
    const svc = new ForcedAlignerService();
    expect(await svc.isHealthy()).toBe(false);
  });

  it("isHealthy returns false when fetch throws", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const svc = new ForcedAlignerService();
    expect(await svc.isHealthy()).toBe(false);
  });

  it("alignSegments returns success with word timestamps from the API", async () => {
    const apiResult = {
      success: true,
      segments: [
        {
          start: 0,
          end: 1,
          text: "hi",
          word_timestamps: [{ word: "hi", start: 0, end: 0.5 }],
        },
      ],
    };
    // First fetch = audio download (data URL skips it), second = alignment POST.
    global.fetch = vi.fn(async (url: any) => {
      const u = url.toString();
      if (u.includes("align-segments")) return jsonResponse(apiResult);
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const svc = new ForcedAlignerService();
    // Use a data URL so fetchAudioAsBase64 short-circuits without a network call.
    const dataUrl = "data:audio/mpeg;base64,QUJD";
    const result = await svc.alignSegments(dataUrl, [
      { start: 0, end: 1, text: "hi" },
    ]);
    expect(result.success).toBe(true);
    expect(result.segments[0].word_timestamps).toHaveLength(1);
  });

  it("alignSegments returns failure (empty timestamps) on API error status", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = url.toString();
      if (u.includes("align-segments"))
        return jsonResponse({ error: "boom" }, { status: 500, ok: false });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const svc = new ForcedAlignerService();
    const dataUrl = "data:audio/mpeg;base64,QUJD";
    const result = await svc.alignSegments(dataUrl, [
      { start: 0, end: 1, text: "hi" },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("API error: 500");
    expect(result.segments[0].word_timestamps).toEqual([]);
  });

  it("alignSegments fails gracefully when audio cannot be fetched", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({}, { status: 404, ok: false })
    ) as unknown as typeof fetch;

    const svc = new ForcedAlignerService();
    // Non-data URL triggers a fetch that returns !ok -> base64 is null.
    const result = await svc.alignSegments("https://example.com/a.mp3", [
      { start: 0, end: 1, text: "hi" },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to fetch audio");
  });
});

// ---------------------------------------------------------------------------
// transcription.ts
// ---------------------------------------------------------------------------
import {
  MockTranscriptionService,
  GroqTranscriptionService,
  ReplicateTranscriptionService,
  createTranscriptionService,
  createCrisperWhisperService,
  CrisperWhisperTranscriptionService,
} from "@/lib/audio/transcription";

describe("transcription: MockTranscriptionService", () => {
  it("produces segments covering the mock text", async () => {
    const svc = new MockTranscriptionService(0);
    const result = await svc.transcribe({ audioUrl: "/x.mp3", language: "en" });
    expect(result.text).toContain("/x.mp3");
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.language).toBe("en");
    // Duration equals end of last segment
    expect(result.duration).toBe(result.segments[result.segments.length - 1].end);
  });
});

describe("transcription: ReplicateTranscriptionService", () => {
  // NOTE: reset inline (not in beforeEach) — resetting a promise-returning spy
  // in beforeEach interacts badly with vitest's unhandled-rejection detection.

  it("parses an object output with a segments array", async () => {
    replicateRun.mockReset();
    replicateRun.mockResolvedValue({
      text: "Hello world",
      language: "en",
      duration: 5,
      segments: [
        { id: 0, start: 0, end: 2.5, text: "Hello" },
        { id: 1, start: 2.5, end: 5, text: "world" },
      ],
    });
    const svc = new ReplicateTranscriptionService("token");
    const result = await svc.transcribe({ audioUrl: "https://a/x.mp3" });
    expect(result.segments).toHaveLength(2);
    expect(result.text).toBe("Hello world");
    expect(result.language).toBe("en");
  });

  it("parses an SRT string output", async () => {
    const srt = "1\n00:00:00,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:04,000\nworld";
    replicateRun.mockReset();
    replicateRun.mockResolvedValue(srt);
    const svc = new ReplicateTranscriptionService("token");
    const result = await svc.transcribe({ audioUrl: "https://a/x.mp3" });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].start).toBe(0);
    expect(result.segments[0].end).toBe(2);
    expect(result.text).toBe("Hello world");
  });

  it("wraps underlying errors", async () => {
    replicateRun.mockReset();
    replicateRun.mockImplementation(() => Promise.reject(new Error("api fail")));
    const svc = new ReplicateTranscriptionService("token");
    let caught: Error | undefined;
    try {
      await svc.transcribe({ audioUrl: "x" });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/Transcription failed: api fail/);
  });
});

describe("transcription: GroqTranscriptionService", () => {
  it("maps verbose_json output into segments with word timestamps", async () => {
    groqCreate.mockReset();
    groqCreate.mockResolvedValue({
      text: "Hello world",
      language: "en",
      duration: 4,
      segments: [
        { start: 0, end: 2, text: " Hello " },
        { start: 2, end: 4, text: " world " },
      ],
      words: [
        { word: "Hello", start: 0.1, end: 1.9 },
        { word: "world", start: 2.1, end: 3.9 },
      ],
    });
    const svc = new GroqTranscriptionService("key");
    const result = await svc.transcribe({
      audioUrl: "data:audio/mpeg;base64,QUJD",
      language: "en",
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].text).toBe("Hello");
    expect(result.segments[0].words?.[0].word).toBe("Hello");
    expect(result.text).toBe("Hello world");
  });

  it("wraps errors with a Groq-specific message", async () => {
    groqCreate.mockReset();
    groqCreate.mockImplementation(() => Promise.reject(new Error("groq down")));
    const svc = new GroqTranscriptionService("key");
    let caught: Error | undefined;
    try {
      await svc.transcribe({ audioUrl: "data:audio/mpeg;base64,QUJD" });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/Groq transcription failed: groq down/);
  });
});

describe("transcription: createTranscriptionService factory", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("returns a mock when useMock is true", () => {
    expect(createTranscriptionService(true)).toBeInstanceOf(MockTranscriptionService);
  });

  it("prefers Groq when GROQ_API_KEY is set", () => {
    process.env.USE_DEEPGRAM = "false";
    process.env.USE_CRISPER_WHISPER = "false";
    process.env.GROQ_API_KEY = "k";
    delete process.env.REPLICATE_API_TOKEN;
    expect(createTranscriptionService(false)).toBeInstanceOf(GroqTranscriptionService);
  });

  it("falls back to Replicate when only the Replicate token is set", () => {
    process.env.USE_DEEPGRAM = "false";
    process.env.USE_CRISPER_WHISPER = "false";
    delete process.env.GROQ_API_KEY;
    process.env.REPLICATE_API_TOKEN = "t";
    expect(createTranscriptionService(false)).toBeInstanceOf(
      ReplicateTranscriptionService
    );
  });

  it("throws when no provider is configured", () => {
    process.env.USE_DEEPGRAM = "false";
    process.env.USE_CRISPER_WHISPER = "false";
    delete process.env.GROQ_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
    expect(() => createTranscriptionService(false)).toThrow(/Missing/);
  });

  it("createCrisperWhisperService builds a CrisperWhisper service", () => {
    expect(createCrisperWhisperService("pt")).toBeInstanceOf(
      CrisperWhisperTranscriptionService
    );
  });
});

// ---------------------------------------------------------------------------
// waveform.ts
// ---------------------------------------------------------------------------
import { getPeaksForTimeRange, type WaveformData } from "@/lib/audio/waveform";

describe("waveform: getPeaksForTimeRange", () => {
  const data: WaveformData = {
    peaks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    duration: 1,
    samplesPerSecond: 10,
  };

  it("slices peaks for the requested window", () => {
    const slice = getPeaksForTimeRange(data, 0.2, 0.5);
    // startIndex = floor(0.2*10)=2, endIndex = ceil(0.5*10)=5
    expect(slice).toEqual([0.2, 0.3, 0.4]);
  });

  it("clamps to the start of the array", () => {
    const slice = getPeaksForTimeRange(data, -5, 0.2);
    expect(slice[0]).toBe(0);
    expect(slice).toEqual([0, 0.1]);
  });

  it("clamps to the end of the array", () => {
    const slice = getPeaksForTimeRange(data, 0.8, 100);
    expect(slice).toEqual([0.8, 0.9]);
  });
});
