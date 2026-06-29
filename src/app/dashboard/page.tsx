"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  X,
  Upload,
  Scissors,
  Sparkles,
  Download,
  Mic,
  LayoutGrid,
  List,
  Plus,
  Waves,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import { ProjectCard } from "@/components/dashboard/ProjectCard"
import { UploadModal } from "@/components/dashboard/UploadModal"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ProjectStatus =
  | "uploading"
  | "uploaded"
  | "processing"
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

type FilterStatus = "all" | "ready" | "processing" | "failed"
type ViewMode = "grid" | "list"

// Skeleton component for project cards
function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="h-6 w-16 bg-zinc-800 rounded-full animate-pulse" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")

  // Fetch projects from API
  const fetchProjects = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setIsInitialLoading(true)
      }
      setError(null)
      const response = await fetch("/api/projects")

      if (!response.ok) {
        throw new Error("Failed to fetch projects")
      }

      const data = await response.json()
      const fetchedProjects = data.projects || []

      if (isMountedRef.current) {
        setProjects(fetchedProjects)
      }
    } catch (err) {
      console.error("Error fetching projects:", err)
      if (isMountedRef.current) {
        setError("Falha ao carregar projetos. Tente novamente.")
      }
    } finally {
      if (isMountedRef.current && isInitial) {
        setIsInitialLoading(false)
      }
    }
  }, [])

  // Check if any projects are still processing
  const hasProcessingProjects = useMemo(() => {
    return projects.some(p =>
      ["uploading", "uploaded", "transcribing", "analyzing", "aligning", "pending", "processing"].includes(p.status)
    )
  }, [projects])

  useEffect(() => {
    isMountedRef.current = true
    fetchProjects(true)

    return () => {
      isMountedRef.current = false
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [fetchProjects])

  // Dynamic polling
  useEffect(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    if (hasProcessingProjects) {
      pollingIntervalRef.current = setInterval(() => {
        fetchProjects(false)
      }, 5000)
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [hasProcessingProjects, fetchProjects])

  // Handle project deletion
  const handleDeleteProject = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete project")
      }

      setProjects((prev) => prev.filter((project) => project.id !== id))

      toast.success("Projeto deletado", {
        description: "O projeto foi removido com sucesso.",
      })
    } catch (err) {
      console.error("Error deleting project:", err)
      toast.error("Erro ao deletar", {
        description: "Não foi possível deletar o projeto. Tente novamente.",
      })
      throw err
    }
  }

  const handleUploadSuccess = () => {
    fetchProjects()
  }

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let filtered = [...projects]

    if (searchQuery.trim()) {
      filtered = filtered.filter((project) =>
        project.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    if (filterStatus !== "all") {
      if (filterStatus === "ready") {
        filtered = filtered.filter((p) => p.status === "ready" || p.status === "completed")
      } else if (filterStatus === "processing") {
        filtered = filtered.filter((p) =>
          ["uploading", "uploaded", "transcribing", "aligning", "analyzing"].includes(p.status)
        )
      } else if (filterStatus === "failed") {
        filtered = filtered.filter((p) => p.status === "failed" || p.status === "error")
      }
    }

    // Sort by recent
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return filtered
  }, [projects, searchQuery, filterStatus])

  // Computed stats
  const readyCount = projects.filter((p) => p.status === "ready" || p.status === "completed").length
  const processingCount = projects.filter((p) => ["uploading", "uploaded", "transcribing", "aligning", "analyzing"].includes(p.status)).length
  const totalDuration = Math.round(projects.reduce((sum, p) => sum + (p.duration || 0), 0) / 60)

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Waves className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Aeropod</h1>
                <p className="text-xs text-zinc-500">
                  Editor de Podcasts com IA
                </p>
              </div>
            </div>

            <Button
              onClick={handleOpenModal}
              className="bg-emerald-500 hover:bg-emerald-400 text-black font-medium gap-2"
            >
              <Plus className="h-4 w-4" />
              Novo Projeto
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        {!isInitialLoading && projects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
          >
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="h-4 w-4 text-zinc-500" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total</span>
              </div>
              <p className="text-2xl font-bold text-white">{projects.length}</p>
              <p className="text-xs text-zinc-600">projetos</p>
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Prontos</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{readyCount}</p>
              <p className="text-xs text-emerald-600">para editar</p>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 hover:border-blue-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                <span className="text-xs font-medium text-blue-500 uppercase tracking-wider">Processando</span>
              </div>
              <p className="text-2xl font-bold text-blue-400">{processingCount}</p>
              <p className="text-xs text-blue-600">em andamento</p>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-zinc-500" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Tempo</span>
              </div>
              <p className="text-2xl font-bold text-white">{totalDuration}m</p>
              <p className="text-xs text-zinc-600">de audio</p>
            </div>
          </motion.div>
        )}

        {/* Search and Filters */}
        {!isInitialLoading && !error && projects.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6"
          >
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar projetos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-10 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filter Pills + View Toggle */}
              <div className="flex items-center gap-3">
                {/* Status Pills */}
                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      filterStatus === "all"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFilterStatus("ready")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      filterStatus === "ready"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Prontos
                  </button>
                  <button
                    onClick={() => setFilterStatus("processing")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      filterStatus === "processing"
                        ? "bg-blue-500/20 text-blue-400"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Processando
                  </button>
                  <button
                    onClick={() => setFilterStatus("failed")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      filterStatus === "failed"
                        ? "bg-red-500/20 text-red-400"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Falhou
                  </button>
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "p-1.5 rounded-md transition-all cursor-pointer",
                      viewMode === "grid"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "p-1.5 rounded-md transition-all cursor-pointer",
                      viewMode === "list"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active Filters Summary */}
            {(searchQuery || filterStatus !== "all") && (
              <div className="flex items-center gap-2 mt-3 text-sm text-zinc-500">
                <span>
                  {filteredProjects.length} de {projects.length} projetos
                </span>
                <button
                  onClick={() => {
                    setSearchQuery("")
                    setFilterStatus("all")
                  }}
                  className="text-emerald-400 hover:text-emerald-300 text-xs cursor-pointer"
                >
                  Limpar
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Loading State */}
        {isInitialLoading && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="h-3 w-12 bg-zinc-800 rounded mb-2 animate-pulse" />
                  <div className="h-7 w-8 bg-zinc-800 rounded mb-1 animate-pulse" />
                  <div className="h-3 w-16 bg-zinc-800 rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
              <div className="h-9 w-32 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {!isInitialLoading && error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => fetchProjects(true)}
              className="text-sm text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              Tentar novamente
            </button>
          </motion.div>
        )}

        {/* Empty State */}
        {!isInitialLoading && !error && projects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="max-w-3xl mx-auto">
              {/* Hero */}
              <div className="mb-12">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
                  <Waves className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">
                  Bem-vindo ao Aeropod
                </h2>
                <p className="text-zinc-400 text-lg max-w-md mx-auto">
                  Edite seus podcasts com inteligência artificial em minutos
                </p>
              </div>

              {/* How it works */}
              <div className="grid md:grid-cols-4 gap-4 mb-12">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                    <Upload className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">1. Upload</h3>
                  <p className="text-sm text-zinc-500">
                    Envie seu arquivo de audio
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-6 w-6 text-purple-400" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">2. IA Analisa</h3>
                  <p className="text-sm text-zinc-500">
                    Transcricao automatica com IA
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                    <Scissors className="h-6 w-6 text-emerald-400" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">3. Edite</h3>
                  <p className="text-sm text-zinc-500">
                    Selecione os melhores momentos
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
                    <Download className="h-6 w-6 text-orange-400" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">4. Exporte</h3>
                  <p className="text-sm text-zinc-500">
                    Baixe seu podcast editado
                  </p>
                </motion.div>
              </div>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  onClick={handleOpenModal}
                  size="lg"
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold gap-2 px-8"
                >
                  <Plus className="h-5 w-5" />
                  Criar Primeiro Projeto
                </Button>
                <p className="text-xs text-zinc-600 mt-4">
                  Formatos suportados: MP3, WAV, M4A
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* No Results State */}
        {!isInitialLoading && !error && projects.length > 0 && filteredProjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-zinc-600" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Nenhum projeto encontrado
              </h2>
              <p className="text-zinc-500 mb-6">
                Tente ajustar os filtros ou a busca
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("")
                  setFilterStatus("all")
                }}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                Limpar filtros
              </Button>
            </div>
          </motion.div>
        )}

        {/* Projects Grid */}
        {!isInitialLoading && !error && projects.length > 0 && filteredProjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                : "flex flex-col gap-3"
            }>
              <AnimatePresence mode="popLayout">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDelete={handleDeleteProject}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onUploadSuccess={handleUploadSuccess}
      />
    </div>
  )
}
