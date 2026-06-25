"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileVideo, Loader2, Upload, X } from "lucide-react"
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

interface VideoUploadModalProps {
  isOpen: boolean
  onClose: () => void
}

const ALLOWED_EXT = [".mp4", ".mov"]
const ALLOWED_MIME = ["video/mp4", "video/quicktime"]
const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext))
}

export function VideoUploadModal({ isOpen, onClose }: VideoUploadModalProps) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16")
  const [error, setError] = useState("")
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setFile(null)
    setTitle("")
    setAspectRatio("9:16")
    setError("")
    setProgress(0)
    setIsUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const handleClose = useCallback(() => {
    if (isUploading) return
    reset()
    onClose()
  }, [isUploading, onClose, reset])

  const validate = useCallback((f: File): string | null => {
    const mimeOk = f.type === "" || ALLOWED_MIME.includes(f.type)
    if (!mimeOk || !hasAllowedExtension(f.name)) {
      return "Formato inválido. Envie um arquivo .mp4 ou .mov."
    }
    if (f.size > MAX_FILE_SIZE) {
      return `Arquivo muito grande. Máximo ${formatFileSize(MAX_FILE_SIZE)}.`
    }
    return null
  }, [])

  const selectFile = useCallback(
    (f: File) => {
      const err = validate(f)
      if (err) {
        setError(err)
        return
      }
      setFile(f)
      setError("")
      if (!title) {
        setTitle(f.name.replace(/\.[^/.]+$/, ""))
      }
    },
    [title, validate]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) selectFile(f)
    },
    [selectFile]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!file) {
        setError("Selecione um vídeo.")
        return
      }
      setIsUploading(true)
      setError("")
      setProgress(0)

      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", title.trim() || file.name)
      formData.append("aspectRatio", aspectRatio)

      // Use XHR for real upload progress (large phone videos).
      const xhr = new XMLHttpRequest()
      xhr.open("POST", "/api/video/upload")

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setProgress(Math.round((ev.loaded / ev.total) * 100))
        }
      }

      xhr.onload = () => {
        let data: { projectId?: string; error?: string } = {}
        try {
          data = JSON.parse(xhr.responseText)
        } catch {
          /* noop */
        }

        if (xhr.status >= 200 && xhr.status < 300 && data.projectId) {
          toast.success("Vídeo enviado!", { description: "Abrindo o editor..." })
          const id = data.projectId
          reset()
          onClose()
          router.push(`/editor/${id}/video`)
          return
        }

        const message =
          xhr.status === 503
            ? data.error ||
              "Processamento de vídeo indisponível no servidor (ffmpeg ausente)."
            : data.error || "Falha ao enviar o vídeo."
        setError(message)
        setIsUploading(false)
        setProgress(0)
        toast.error("Erro no envio", { description: message })
      }

      xhr.onerror = () => {
        const message = "Falha de rede ao enviar o vídeo."
        setError(message)
        setIsUploading(false)
        setProgress(0)
        toast.error("Erro no envio", { description: message })
      }

      xhr.send(formData)
    },
    [file, title, aspectRatio, reset, onClose, router]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileVideo className="h-5 w-5 text-emerald-400" />
            Enviar vídeo do celular
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Envie um vídeo .mp4 ou .mov da sua câmera ou galeria.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-zinc-300">Vídeo *</label>
            <div
              onClick={!file ? () => fileInputRef.current?.click() : undefined}
              className={cn(
                "mt-2 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all",
                file
                  ? "border-zinc-700 bg-zinc-800/50"
                  : "border-zinc-700 hover:border-zinc-600"
              )}
            >
              {!file ? (
                <>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-800">
                    <Upload className="h-7 w-7 text-zinc-500" />
                  </div>
                  <p className="mb-1 text-sm font-medium text-white">
                    Toque para escolher um vídeo
                  </p>
                  <p className="text-xs text-zinc-500">
                    MP4 ou MOV (máx {formatFileSize(MAX_FILE_SIZE)})
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                      <FileVideo className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-medium text-white">
                        {file.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  {!isUploading && (
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ""
                      }}
                      className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                className="hidden"
                onChange={handleInputChange}
                disabled={isUploading}
              />
            </div>
          </div>

          <div>
            <label htmlFor="vu-title" className="text-sm font-medium text-zinc-300">
              Título (opcional)
            </label>
            <input
              id="vu-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do projeto"
              disabled={isUploading}
              className="mt-2 h-12 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-white placeholder:text-zinc-600 transition-all focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-300">Proporção</label>
            <div className="mt-2">
              <AspectRatioToggle
                value={aspectRatio}
                onChange={setAspectRatio}
                disabled={isUploading}
              />
            </div>
          </div>

          {isUploading && (
            <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  Enviando vídeo...
                </span>
                <span className="font-medium text-white">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

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
              disabled={isUploading}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isUploading || !file}
              className="bg-emerald-500 font-medium text-black hover:bg-emerald-400"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
