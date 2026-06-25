"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, Scissors } from "lucide-react"
import { cn } from "@/lib/utils"
import { AspectRatioToggle, type AspectRatio } from "./AspectRatioToggle"
import { CutRangeList } from "./CutRangeList"
import { VideoExportBar } from "./VideoExportBar"
import {
  VideoTimeline,
  type TimelineThumbnail,
  type VideoCutRange,
} from "./VideoTimeline"

export interface VideoEditorProject {
  id: string
  title?: string | null
  videoUrl?: string | null
  thumbnailUrl?: string | null
  videoDuration?: number | null
  aspectRatio?: AspectRatio | null
  cutRanges?: VideoCutRange[] | null
}

interface VideoEditorProps {
  project: VideoEditorProject
  thumbnails: TimelineThumbnail[]
  /** scene-cut timestamps for snapping (optional) */
  sceneCuts?: number[]
  /** persist cuts + aspect (autosave) */
  onSaveCuts: (cutRanges: VideoCutRange[], aspectRatio: AspectRatio) => void
  /** trigger render/export */
  onExport: () => void
  isExporting: boolean
  exportProgress?: number
  downloadUrl?: string | null
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const ASPECT_BOX: Record<AspectRatio, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
}

export function VideoEditor({
  project,
  thumbnails,
  sceneCuts,
  onSaveCuts,
  onExport,
  isExporting,
  exportProgress,
  downloadUrl,
}: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const [duration, setDuration] = useState<number>(project.videoDuration ?? 0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    project.aspectRatio ?? "16:9"
  )
  const [ranges, setRanges] = useState<VideoCutRange[]>(
    project.cutRanges && project.cutRanges.length > 0 ? project.cutRanges : []
  )
  const [activeRangeId, setActiveRangeId] = useState<string | null>(
    project.cutRanges && project.cutRanges.length > 0
      ? project.cutRanges[0].id
      : null
  )

  // autosave (debounced) whenever ranges / aspect change
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = useCallback(
    (nextRanges: VideoCutRange[], nextAspect: AspectRatio) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSaveCuts(nextRanges, nextAspect)
      }, 700)
    },
    [onSaveCuts]
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const updateRanges = useCallback(
    (next: VideoCutRange[]) => {
      setRanges(next)
      scheduleSave(next, aspectRatio)
    },
    [aspectRatio, scheduleSave]
  )

  const handleAspectChange = useCallback(
    (next: AspectRatio) => {
      setAspectRatio(next)
      scheduleSave(ranges, next)
    },
    [ranges, scheduleSave]
  )

  // ----- video element wiring -----
  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (Number.isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration)
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setIsPlaying(true)
    } else {
      v.pause()
      setIsPlaying(false)
    }
  }, [])

  const seek = useCallback((time: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = time
    setCurrentTime(time)
  }, [])

  // ----- range operations -----
  const addRange = useCallback(() => {
    const start = Math.min(currentTime, Math.max(0, duration - 1))
    const end = Math.min(duration, start + Math.min(5, duration - start))
    const newRange: VideoCutRange = {
      id: genId(),
      start,
      end: end > start ? end : Math.min(duration, start + 1),
      order: ranges.length,
    }
    const next = [...ranges, newRange]
    updateRanges(next)
    setActiveRangeId(newRange.id)
  }, [currentTime, duration, ranges, updateRanges])

  const changeRange = useCallback(
    (id: string, patch: Partial<Pick<VideoCutRange, "start" | "end">>) => {
      updateRanges(
        ranges.map((r) => (r.id === id ? { ...r, ...patch } : r))
      )
    },
    [ranges, updateRanges]
  )

  const deleteRange = useCallback(
    (id: string) => {
      const next = ranges
        .filter((r) => r.id !== id)
        .map((r, i) => ({ ...r, order: i }))
      updateRanges(next)
      if (activeRangeId === id) {
        setActiveRangeId(next.length > 0 ? next[0].id : null)
      }
    },
    [ranges, activeRangeId, updateRanges]
  )

  const moveRange = useCallback(
    (id: string, direction: "up" | "down") => {
      const ordered = [...ranges].sort((a, b) => a.order - b.order)
      const idx = ordered.findIndex((r) => r.id === id)
      if (idx === -1) return
      const swapWith = direction === "up" ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= ordered.length) return
      const tmp = ordered[idx]
      ordered[idx] = ordered[swapWith]
      ordered[swapWith] = tmp
      updateRanges(ordered.map((r, i) => ({ ...r, order: i })))
    },
    [ranges, updateRanges]
  )

  // total output duration = sum of keep ranges, or full clip if none
  const outputDuration = useMemo(() => {
    if (ranges.length === 0) return duration
    return ranges.reduce((acc, r) => acc + Math.max(0, r.end - r.start), 0)
  }, [ranges, duration])

  const setHandleToCurrent = useCallback(
    (which: "start" | "end") => {
      if (!activeRangeId) return
      changeRange(activeRangeId, { [which]: currentTime })
    },
    [activeRangeId, currentTime, changeRange]
  )

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-white">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <Scissors className="h-5 w-5 text-emerald-400" />
        <h1 className="truncate text-base font-semibold">
          {project.title || "Editar vídeo"}
        </h1>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* video player */}
        <div className="mx-auto w-full">
          <div
            className={cn(
              "relative mx-auto w-full max-w-full overflow-hidden rounded-2xl bg-black",
              ASPECT_BOX[aspectRatio]
            )}
            style={{ maxHeight: "55dvh" }}
          >
            {project.videoUrl ? (
              <video
                ref={videoRef}
                src={project.videoUrl}
                poster={project.thumbnailUrl ?? undefined}
                playsInline
                preload="metadata"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className="h-full w-full object-contain"
                onClick={togglePlay}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-600">
                Vídeo indisponível
              </div>
            )}

            {/* big play overlay */}
            {!isPlaying && project.videoUrl && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Reproduzir"
                className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-black">
                  <Play className="h-8 w-8 translate-x-0.5" />
                </span>
              </button>
            )}
          </div>

          {/* transport */}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white active:bg-zinc-700 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 translate-x-0.5" />
              )}
            </button>
            <span className="font-mono text-sm text-zinc-400">
              {formatClock(currentTime)} / {formatClock(duration)}
            </span>
          </div>
        </div>

        {/* timeline */}
        <VideoTimeline
          duration={duration}
          currentTime={currentTime}
          thumbnails={thumbnails}
          ranges={ranges}
          activeRangeId={activeRangeId}
          sceneCuts={sceneCuts}
          onSelectRange={setActiveRangeId}
          onChangeRange={changeRange}
          onSeek={seek}
          disabled={isExporting}
        />

        {/* set handle to playhead helpers */}
        {activeRangeId && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHandleToCurrent("start")}
              disabled={isExporting}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/60 py-2.5 text-xs font-medium text-zinc-300 active:bg-zinc-700 cursor-pointer disabled:opacity-50"
            >
              Início aqui
            </button>
            <button
              type="button"
              onClick={() => setHandleToCurrent("end")}
              disabled={isExporting}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/60 py-2.5 text-xs font-medium text-zinc-300 active:bg-zinc-700 cursor-pointer disabled:opacity-50"
            >
              Fim aqui
            </button>
          </div>
        )}

        {/* cut ranges */}
        <CutRangeList
          ranges={ranges}
          activeRangeId={activeRangeId}
          duration={duration}
          onSelect={(id) => {
            setActiveRangeId(id)
            const r = ranges.find((x) => x.id === id)
            if (r) seek(r.start)
          }}
          onDelete={deleteRange}
          onMove={moveRange}
          onAdd={addRange}
          disabled={isExporting}
        />

        {/* aspect ratio */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">
            Proporção de saída
          </h3>
          <AspectRatioToggle
            value={aspectRatio}
            onChange={handleAspectChange}
            disabled={isExporting}
          />
        </div>

        {/* spacer so content isn't hidden behind the sticky bar */}
        <div className="h-4" />
      </div>

      <VideoExportBar
        outputDuration={outputDuration}
        aspectRatio={aspectRatio}
        isExporting={isExporting}
        progress={exportProgress}
        downloadUrl={downloadUrl}
        onExport={onExport}
        disabled={!project.videoUrl}
      />
    </div>
  )
}
