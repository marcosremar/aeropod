"use client"

import { motion } from "framer-motion"
import { Clock, Trash2, Play, Mic2, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"

type ProjectStatus =
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "aligning"
  | "analyzing"
  | "ready"
  | "completed"
  | "failed"
  | "error"

interface Project {
  id: string
  title: string
  status: ProjectStatus
  duration: number
  createdAt: string
  progress?: number
  errorMessage?: string | null
}

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

const statusConfig: Record<
  ProjectStatus,
  {
    color: string
    bgColor: string
    borderColor: string
    label: string
    description?: string
    icon: typeof CheckCircle2
    progressColor: string
  }
> = {
  uploading: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    label: "Enviando",
    description: "Enviando arquivo...",
    icon: Loader2,
    progressColor: "bg-blue-500",
  },
  uploaded: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    label: "Processando",
    description: "Preparando...",
    icon: Loader2,
    progressColor: "bg-blue-500",
  },
  transcribing: {
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    label: "Transcrevendo",
    description: "IA transcrevendo...",
    icon: Loader2,
    progressColor: "bg-purple-500",
  },
  aligning: {
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
    label: "Alinhando",
    description: "Alinhando timestamps...",
    icon: Loader2,
    progressColor: "bg-cyan-500",
  },
  analyzing: {
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    label: "Analisando",
    description: "Analisando qualidade...",
    icon: Loader2,
    progressColor: "bg-amber-500",
  },
  ready: {
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    label: "Pronto",
    description: "Pronto para editar",
    icon: CheckCircle2,
    progressColor: "bg-emerald-500",
  },
  completed: {
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    label: "Pronto",
    description: "Pronto para editar",
    icon: CheckCircle2,
    progressColor: "bg-emerald-500",
  },
  failed: {
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    label: "Falhou",
    description: "Erro no processamento",
    icon: AlertCircle,
    progressColor: "bg-red-500",
  },
  error: {
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    label: "Erro",
    description: "Erro no processamento",
    icon: AlertCircle,
    progressColor: "bg-red-500",
  },
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return "0:00"
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

  if (diffInDays === 0) {
    return "Hoje"
  } else if (diffInDays === 1) {
    return "Ontem"
  } else if (diffInDays < 7) {
    return `${diffInDays} dias atras`
  } else {
    return date.toLocaleDateString("pt-BR", {
      month: "short",
      day: "numeric",
    })
  }
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const statusInfo = statusConfig[project.status as ProjectStatus] || statusConfig.ready
  const StatusIcon = statusInfo.icon
  const isProcessing = ["uploading", "uploaded", "transcribing", "aligning", "analyzing"].includes(
    project.status
  )

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!confirm("Tem certeza que deseja excluir este projeto?")) {
      return
    }

    setIsDeleting(true)
    try {
      await onDelete(project.id)
    } catch (error) {
      console.error("Failed to delete project:", error)
      setIsDeleting(false)
    }
  }

  const handleClick = () => {
    if (project.status === "ready" || project.status === "completed") {
      router.push(`/editor/${project.id}`)
    }
  }

  const isClickable = project.status === "ready" || project.status === "completed"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={cn(
          "group relative rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-all duration-200",
          isClickable && "cursor-pointer hover:border-emerald-500/30 hover:bg-zinc-900",
          isDeleting && "opacity-50 pointer-events-none"
        )}
        onClick={handleClick}
      >
        {/* Main Content */}
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={cn(
            "flex-shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center",
            statusInfo.bgColor,
            statusInfo.borderColor
          )}>
            <Mic2 className={cn("h-5 w-5", statusInfo.color)} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm text-white truncate pr-2">
                {project.title}
              </h3>

              {/* Status Badge */}
              <div className={cn(
                "flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                statusInfo.bgColor,
                statusInfo.color
              )}>
                <StatusIcon className={cn("h-3 w-3", isProcessing && "animate-spin")} />
                {statusInfo.label}
              </div>
            </div>

            {/* Meta info */}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(project.duration)}
              </span>
              <span>{formatDate(project.createdAt)}</span>
            </div>

            {/* Progress bar for processing */}
            {isProcessing && project.progress !== undefined && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{statusInfo.description}</span>
                  <span className={cn("font-medium", statusInfo.color)}>
                    {project.progress}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className={cn("h-full rounded-full", statusInfo.progressColor)}
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {(project.status === "failed" || project.status === "error") && project.errorMessage && (
              <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{project.errorMessage}</p>
              </div>
            )}

            {/* Ready state - call to action */}
            {isClickable && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <Play className="h-3 w-3" />
                  Clique para editar
                </span>
              </div>
            )}
          </div>

          {/* Delete button */}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-all cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
