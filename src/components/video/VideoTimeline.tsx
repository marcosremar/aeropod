"use client"

import { useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { VideoTrimHandle } from "./VideoTrimHandle"

export interface VideoCutRange {
  id: string
  start: number
  end: number
  order: number
}

export interface TimelineThumbnail {
  time: number
  url: string
}

interface VideoTimelineProps {
  duration: number
  currentTime: number
  thumbnails: TimelineThumbnail[]
  /** all keep-ranges */
  ranges: VideoCutRange[]
  /** id of the range currently being edited (shows handles) */
  activeRangeId: string | null
  /** scene-cut timestamps used for snapping (optional) */
  sceneCuts?: number[]
  onSelectRange: (id: string) => void
  onChangeRange: (id: string, patch: Partial<Pick<VideoCutRange, "start" | "end">>) => void
  onChangeCommitted?: () => void
  /** scrub: jump playhead to time */
  onSeek: (time: number) => void
  disabled?: boolean
}

const SNAP_THRESHOLD = 0.4 // seconds

function maybeSnap(value: number, sceneCuts?: number[]): number {
  if (!sceneCuts || sceneCuts.length === 0) return value
  let best = value
  let bestDist = SNAP_THRESHOLD
  for (const cut of sceneCuts) {
    const d = Math.abs(cut - value)
    if (d < bestDist) {
      bestDist = d
      best = cut
    }
  }
  return best
}

export function VideoTimeline({
  duration,
  currentTime,
  thumbnails,
  ranges,
  activeRangeId,
  sceneCuts,
  onSelectRange,
  onChangeRange,
  onChangeCommitted,
  onSeek,
  disabled,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const activeRange = ranges.find((r) => r.id === activeRangeId) ?? null

  const playheadPct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0

  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      const track = trackRef.current
      if (!track || duration <= 0) return
      const rect = track.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      onSeek(Math.min(duration, Math.max(0, ratio * duration)))
    },
    [disabled, duration, onSeek]
  )

  const handleStartDrag = useCallback(
    (newTime: number) => {
      if (!activeRange) return
      const clamped = Math.min(activeRange.end - 0.1, maybeSnap(newTime, sceneCuts))
      onChangeRange(activeRange.id, { start: Math.max(0, clamped) })
    },
    [activeRange, sceneCuts, onChangeRange]
  )

  const handleEndDrag = useCallback(
    (newTime: number) => {
      if (!activeRange) return
      const clamped = Math.max(activeRange.start + 0.1, maybeSnap(newTime, sceneCuts))
      onChangeRange(activeRange.id, { end: Math.min(duration, clamped) })
    },
    [activeRange, sceneCuts, duration, onChangeRange]
  )

  return (
    <div className="w-full select-none">
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        className="relative h-20 w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 touch-none"
      >
        {/* thumbnail strip */}
        <div className="absolute inset-0 flex">
          {thumbnails.length > 0 ? (
            thumbnails.map((t, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${t.url}-${i}`}
                src={t.url}
                alt=""
                draggable={false}
                className="h-full flex-1 object-cover pointer-events-none"
                style={{ minWidth: 0 }}
              />
            ))
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800/50">
              <div className="h-full w-full animate-pulse bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800" />
            </div>
          )}
        </div>

        {/* dim everything, then "cut out" the keep ranges */}
        <div className="absolute inset-0 bg-black/55 pointer-events-none" />
        {ranges.map((r) => {
          const left = duration > 0 ? (r.start / duration) * 100 : 0
          const width = duration > 0 ? ((r.end - r.start) / duration) * 100 : 0
          const isActive = r.id === activeRangeId
          return (
            <button
              key={r.id}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelectRange(r.id)
              }}
              aria-label={`Selecionar corte ${r.order + 1}`}
              className={cn(
                "absolute top-0 bottom-0 border-y-2 transition-colors",
                isActive
                  ? "border-emerald-400 bg-emerald-400/10 ring-2 ring-inset ring-emerald-400/40"
                  : "border-emerald-500/50 bg-emerald-500/5"
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <span className="absolute left-1 top-1 rounded bg-emerald-500 px-1 text-[10px] font-bold text-black">
                {r.order + 1}
              </span>
            </button>
          )
        })}

        {/* handles for active range */}
        {activeRange && (
          <>
            <VideoTrimHandle
              kind="start"
              time={activeRange.start}
              duration={duration}
              trackRef={trackRef}
              onDrag={handleStartDrag}
              onDragEnd={onChangeCommitted}
              disabled={disabled}
            />
            <VideoTrimHandle
              kind="end"
              time={activeRange.end}
              duration={duration}
              trackRef={trackRef}
              onDrag={handleEndDrag}
              onDragEnd={onChangeCommitted}
              disabled={disabled}
            />
          </>
        )}

        {/* playhead */}
        <div
          className="absolute top-0 bottom-0 z-30 w-0.5 bg-white pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        >
          <div className="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white shadow" />
        </div>
      </div>
    </div>
  )
}
