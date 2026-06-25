"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Youtube } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AspectRatioToggle, type AspectRatio } from "./AspectRatioToggle"

interface YouTubeImportModalProps {
  isOpen: boolean
  onClose: () => void
}

const YT_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]+/i

function isValidYouTubeUrl(url: string): boolean {
  return YT_REGEX.test(url.trim())
}

export function YouTubeImportModal({ isOpen, onClose }: YouTubeImportModalProps) {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9")
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState("")

  const reset = useCallback(() => {
    setUrl("")
    setTitle("")
    setAspectRatio("16:9")
    setIsImporting(false)
    setError("")
  }, [])

  const handleClose = useCallback(() => {
    if (isImporting) return
    reset()
    onClose()
  }, [isImporting, onClose, reset])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = url.trim()
      if (!isValidYouTubeUrl(trimmed)) {
        setError("Cole um link válido do YouTube.")
        return
      }
      setError("")
      setIsImporting(true)
      try {
        const res = await fetch("/api/video/import-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: trimmed,
            title: title.trim() || undefined,
            aspectRatio,
          }),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status === 503) {
            throw new Error(
              data?.error ||
                "Importação do YouTube indisponível no servidor (yt-dlp/ffmpeg ausente)."
            )
          }
          throw new Error(data?.error || "Falha ao importar do YouTube.")
        }

        const projectId: string | undefined = data?.projectId
        if (!projectId) {
          throw new Error("Resposta inválida do servidor.")
        }

        toast.success("Vídeo importado!", {
          description: "Abrindo o editor...",
        })
        reset()
        onClose()
        router.push(`/editor/${projectId}/video`)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Falha ao importar do YouTube."
        setError(message)
        setIsImporting(false)
        toast.error("Erro na importação", { description: message })
      }
    },
    [url, title, aspectRatio, reset, onClose, router]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Youtube className="h-5 w-5 text-red-500" />
            Importar do YouTube
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Cole o link de um vídeo do YouTube para editar os cortes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="yt-url" className="text-sm font-medium text-zinc-300">
              Link do YouTube *
            </label>
            <input
              id="yt-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              disabled={isImporting}
              className="mt-2 h-12 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-white placeholder:text-zinc-600 transition-all focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
              required
            />
          </div>

          <div>
            <label htmlFor="yt-title" className="text-sm font-medium text-zinc-300">
              Título (opcional)
            </label>
            <input
              id="yt-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do projeto"
              disabled={isImporting}
              className="mt-2 h-12 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-white placeholder:text-zinc-600 transition-all focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-300">
              Proporção
            </label>
            <div className="mt-2">
              <AspectRatioToggle
                value={aspectRatio}
                onChange={setAspectRatio}
                disabled={isImporting}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isImporting}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isImporting || !url.trim()}
              className={cn(
                "bg-emerald-500 font-medium text-black hover:bg-emerald-400"
              )}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                "Importar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
