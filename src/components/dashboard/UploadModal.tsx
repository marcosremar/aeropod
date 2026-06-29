"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, X, FileAudio, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUploadSuccess: () => void
}

const ALLOWED_TYPES = ["audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4"]
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
}

const LANGUAGES = [
  { value: "pt", label: "Portugues", flag: "\ud83c\udde7\ud83c\uddf7" },
  { value: "en", label: "English", flag: "\ud83c\uddfa\ud83c\uddf8" },
  { value: "es", label: "Espanol", flag: "\ud83c\uddea\ud83c\uddf8" },
] as const

export function UploadModal({
  isOpen,
  onClose,
  onUploadSuccess,
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [language, setLanguage] = useState<"pt" | "en" | "es">("pt")
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState("")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<"uploading" | "processing" | "done">("uploading")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current !== null) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

  const resetForm = useCallback(() => {
    setFile(null)
    setTitle("")
    setLanguage("pt")
    setError("")
    setUploadProgress(0)
    setIsUploading(false)
    setUploadStatus("uploading")
  }, [])

  const handleClose = useCallback(() => {
    if (!isUploading) {
      resetForm()
      onClose()
    }
  }, [isUploading, onClose, resetForm])

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Tipo de arquivo invalido. Envie MP3, WAV ou M4A."
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Arquivo muito grande. Maximo ${formatFileSize(MAX_FILE_SIZE)}.`
    }
    return null
  }, [])

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      const validationError = validateFile(selectedFile)
      if (validationError) {
        setError(validationError)
        return
      }

      setFile(selectedFile)
      setError("")

      if (!title) {
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "")
        setTitle(nameWithoutExt)
      }
    },
    [title, validateFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) {
        handleFileSelect(droppedFile)
      }
    },
    [handleFileSelect]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) {
        handleFileSelect(selectedFile)
      }
    },
    [handleFileSelect]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file || !title) {
      setError("Preencha todos os campos obrigatorios")
      return
    }

    setIsUploading(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", title)
      formData.append("language", language)

      progressIntervalRef.current = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressIntervalRef.current!)
            progressIntervalRef.current = null
            return prev
          }
          return prev + 10
        })
      }, 500)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      clearInterval(progressIntervalRef.current!)
      progressIntervalRef.current = null
      setUploadProgress(100)

      if (!response.ok) {
        throw new Error("Upload failed")
      }

      const data = await response.json()
      const projectId = data.projectId

      setUploadStatus("processing")

      if (projectId) {
        try {
          await fetch(`/api/process/${projectId}`, {
            method: "POST",
          })
        } catch (err) {
          console.error("Failed to start processing:", err)
        }
      }

      setUploadStatus("done")

      toast.success("Upload concluido!", {
        description: "Seu podcast esta sendo processado em segundo plano.",
      })

      setTimeout(() => {
        resetForm()
        onUploadSuccess()
        onClose()
      }, 1000)
    } catch (err) {
      console.error("Upload error:", err)
      const errorMessage = "Falha ao fazer upload. Tente novamente."
      setError(errorMessage)
      setIsUploading(false)
      setUploadProgress(0)
      toast.error("Erro no upload", {
        description: errorMessage,
      })
    }
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const handleRemoveFile = () => {
    setFile(null)
    setError("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-white">Novo Projeto</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Envie seu arquivo de audio para comecar a editar com IA.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* File Upload Area */}
          <div>
            <label className="text-sm font-medium text-zinc-300">
              Arquivo de Audio *
            </label>
            <div
              className={cn(
                "mt-2 border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                isDragging
                  ? "border-emerald-500 bg-emerald-500/5"
                  : "border-zinc-700 hover:border-zinc-600",
                file && "bg-zinc-800/50"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={!file ? handleBrowseClick : undefined}
            >
              <AnimatePresence mode="wait">
                {!file ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                      <Upload className="h-7 w-7 text-zinc-500" />
                    </div>
                    <p className="text-sm font-medium text-white mb-1">
                      Arraste e solte seu arquivo aqui
                    </p>
                    <p className="text-xs text-zinc-500 mb-4">
                      MP3, WAV ou M4A (max {formatFileSize(MAX_FILE_SIZE)})
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleBrowseClick}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    >
                      Procurar Arquivos
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.wav,.m4a"
                      className="hidden"
                      onChange={handleFileInputChange}
                      disabled={isUploading}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="file"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <FileAudio className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-white truncate max-w-[250px]">
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
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveFile()
                        }}
                        className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Title Input */}
          <div>
            <label htmlFor="title" className="text-sm font-medium text-zinc-300">
              Titulo do Projeto *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o titulo"
              disabled={isUploading}
              className="mt-2 w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all disabled:opacity-50"
              required
            />
          </div>

          {/* Language Select */}
          <div>
            <label className="text-sm font-medium text-zinc-300">
              Idioma do Audio
            </label>
            <div className="mt-2 flex gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => setLanguage(lang.value)}
                  disabled={isUploading}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-all cursor-pointer",
                    language === lang.value
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300",
                    isUploading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span>{lang.flag}</span>
                  <span className="text-sm font-medium">{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-3 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400 flex items-center gap-2">
                  {uploadStatus === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  )}
                  {uploadStatus === "uploading" && "Enviando arquivo..."}
                  {uploadStatus === "processing" && "Iniciando processamento..."}
                  {uploadStatus === "done" && "Concluido!"}
                </span>
                <span className="font-medium text-white">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full bg-zinc-700 rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    uploadStatus === "done" ? "bg-emerald-500" : "bg-blue-500"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              {uploadStatus === "processing" && (
                <p className="text-xs text-zinc-500">
                  Seu podcast sera transcrito e analisado em segundo plano
                </p>
              )}
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-red-500/10 border border-red-500/20"
            >
              <p className="text-sm text-red-400">{error}</p>
            </motion.div>
          )}

          {/* Footer */}
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
              disabled={!file || !title || isUploading}
              className="bg-emerald-500 hover:bg-emerald-400 text-black font-medium"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Criar Projeto"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
