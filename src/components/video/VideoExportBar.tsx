"use client"

import { Download, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AspectRatio } from "./AspectRatioToggle"

interface VideoExportBarProps {
  /** total duration of the output (sum of keep ranges, or full clip) in seconds */
  outputDuration: number
  aspectRatio: AspectRatio
  isExporting: boolean
  /** 0-100, shown while exporting */
  progress?: number
  /** url of finished render, if available */
  downloadUrl?: string | null
  onExport: () => void
  disabled?: boolean
}

const ASPECT_LABEL: Record<AspectRatio, string> = {
  "16:9": "Horizontal",
  "9:16": "Vertical",
  "1:1": "Quadrado",
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function VideoExportBar({
  outputDuration,
  aspectRatio,
  isExporting,
  progress = 0,
  downloadUrl,
  onExport,
  disabled,
}: VideoExportBarProps) {
  return (
    <div className="sticky bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {isExporting && (
        <div className="h-1 w-full bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {formatDuration(outputDuration)}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {ASPECT_LABEL[aspectRatio]} · {aspectRatio}
          </p>
        </div>

        {downloadUrl && !isExporting ? (
          <a
            href={downloadUrl}
            download
            className="flex h-12 flex-1 max-w-[220px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black transition-colors active:bg-emerald-400"
          >
            <Download className="h-5 w-5" />
            Baixar vídeo
          </a>
        ) : (
          <button
            type="button"
            onClick={onExport}
            disabled={disabled || isExporting}
            className={cn(
              "flex h-12 flex-1 max-w-[220px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black transition-colors active:bg-emerald-400 cursor-pointer",
              (disabled || isExporting) && "opacity-60 cursor-not-allowed"
            )}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Exportando {Math.round(progress)}%
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Exportar
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
