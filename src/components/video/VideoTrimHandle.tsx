"use client"

import { useCallback, useRef } from "react"
import { cn } from "@/lib/utils"

interface VideoTrimHandleProps {
  /** "start" or "end" handle */
  kind: "start" | "end"
  /** current time (seconds) this handle represents */
  time: number
  /** total duration of the source clip (seconds) */
  duration: number
  /** called continuously while dragging with the new time (seconds) */
  onDrag: (newTime: number) => void
  /** called when the drag gesture finishes */
  onDragEnd?: () => void
  /** the timeline track element used to map pixels -> time */
  trackRef: React.RefObject<HTMLElement | null>
  disabled?: boolean
}

/**
 * A single draggable trim handle (in / out point) with a big touch target.
 * Uses Pointer Events so it works for both touch (iPhone Safari) and mouse.
 */
export function VideoTrimHandle({
  kind,
  time,
  duration,
  onDrag,
  onDragEnd,
  trackRef,
  disabled,
}: VideoTrimHandleProps) {
  const draggingRef = useRef(false)

  const pct = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0

  const computeTime = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track || duration <= 0) return time
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return time
      const ratio = (clientX - rect.left) / rect.width
      return Math.min(duration, Math.max(0, ratio * duration))
    },
    [trackRef, duration, time]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [disabled]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      e.preventDefault()
      onDrag(computeTime(e.clientX))
    },
    [computeTime, onDrag]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      onDragEnd?.()
    },
    [onDragEnd]
  )

  return (
    <div
      role="slider"
      aria-label={kind === "start" ? "Início do corte" : "Fim do corte"}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        "absolute top-0 bottom-0 z-20 flex items-stretch touch-none select-none",
        disabled ? "cursor-default" : "cursor-ew-resize"
      )}
      style={{
        left: `${pct * 100}%`,
        // center the hit-area on the line
        transform: "translateX(-50%)",
        // 44px touch target
        width: 44,
      }}
    >
      {/* visible vertical bar */}
      <div className="mx-auto flex flex-col items-center justify-center">
        <div
          className={cn(
            "w-1.5 h-full rounded-full",
            kind === "start" ? "bg-emerald-400" : "bg-emerald-400"
          )}
        />
        {/* grip pill */}
        <div className="absolute top-1/2 -translate-y-1/2 h-9 w-3 rounded-full bg-emerald-400 shadow-md ring-2 ring-emerald-200/30" />
      </div>
    </div>
  )
}
