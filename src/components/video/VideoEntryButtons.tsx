"use client"

import { useState } from "react"
import { Smartphone, Youtube } from "lucide-react"
import { cn } from "@/lib/utils"
import { YouTubeImportModal } from "./YouTubeImportModal"
import { VideoUploadModal } from "./VideoUploadModal"

interface VideoEntryButtonsProps {
  className?: string
  /** "row" (header) or "stack" (empty-state CTA) layout */
  layout?: "row" | "stack"
}

/**
 * Self-contained dashboard entry buttons for the video editor feature.
 * Manages its own modal state so integration is a single import + render.
 */
export function VideoEntryButtons({
  className,
  layout = "row",
}: VideoEntryButtonsProps) {
  const [youtubeOpen, setYoutubeOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <>
      <div
        className={cn(
          "flex gap-2",
          layout === "stack" ? "flex-col w-full" : "flex-wrap",
          className
        )}
      >
        <button
          type="button"
          onClick={() => setYoutubeOpen(true)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition-colors active:bg-zinc-700 hover:border-zinc-600 cursor-pointer",
            layout === "stack" && "w-full"
          )}
        >
          <Youtube className="h-5 w-5 text-red-500" />
          Importar do YouTube
        </button>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition-colors active:bg-zinc-700 hover:border-zinc-600 cursor-pointer",
            layout === "stack" && "w-full"
          )}
        >
          <Smartphone className="h-5 w-5 text-emerald-400" />
          Enviar vídeo do celular
        </button>
      </div>

      <YouTubeImportModal
        isOpen={youtubeOpen}
        onClose={() => setYoutubeOpen(false)}
      />
      <VideoUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </>
  )
}
