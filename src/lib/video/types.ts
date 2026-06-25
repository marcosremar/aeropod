/**
 * Shared types for the video cut editor feature.
 *
 * These types are intentionally defined here (and not imported from
 * `@/lib/db/schema`) so the `src/lib/video/*` services compile and can be
 * unit-tested independently of the database schema. The integration step
 * re-exports `VideoCutRange` and `AspectRatio` from `schema.ts` with the same
 * shape; consumers may import from either location interchangeably.
 */

/**
 * A range of the source video to KEEP, expressed in seconds.
 *
 * The final render concatenates all ranges in ascending `order`, so reordering
 * clips is just a matter of changing `order`. An empty/undefined list means
 * "keep the whole clip".
 */
export interface VideoCutRange {
  /** Stable client-generated id (e.g. crypto.randomUUID()). */
  id: string;
  /** Start time of the kept range, in seconds (inclusive). */
  start: number;
  /** End time of the kept range, in seconds (exclusive). */
  end: number;
  /** Output ordering index; ranges are concatenated ascending by `order`. */
  order: number;
}

/**
 * Export target aspect ratio.
 * - `16:9`  -> Horizontal (landscape)
 * - `9:16`  -> Vertical (portrait / Shorts / Reels)
 * - `1:1`   -> Square
 */
export type AspectRatio = "16:9" | "9:16" | "1:1";
