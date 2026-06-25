"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { VideoCutRange } from "./VideoTimeline"

interface CutRangeListProps {
  ranges: VideoCutRange[]
  activeRangeId: string | null
  duration: number
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, direction: "up" | "down") => void
  onAdd: () => void
  disabled?: boolean
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds - Math.floor(seconds)) * 10)
  return `${m}:${s.toString().padStart(2, "0")}.${cs}`
}

export function CutRangeList({
  ranges,
  activeRangeId,
  duration,
  onSelect,
  onDelete,
  onMove,
  onAdd,
  disabled,
}: CutRangeListProps) {
  const ordered = [...ranges].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">
          Cortes ({ordered.length})
        </h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-emerald-400 transition-colors active:bg-zinc-700 cursor-pointer",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-6 text-center text-xs text-zinc-500">
          Nenhum corte definido. O vídeo inteiro será exportado.
        </p>
      ) : (
        <ul className="space-y-2">
          {ordered.map((r, idx) => {
            const isActive = r.id === activeRangeId
            const dur = Math.max(0, r.end - r.start)
            return (
              <li
                key={r.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 transition-colors",
                  isActive
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-zinc-700 bg-zinc-800/60"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className="flex flex-1 items-center gap-3 text-left cursor-pointer"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                      isActive
                        ? "bg-emerald-500 text-black"
                        : "bg-zinc-700 text-zinc-300"
                    )}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {formatTime(r.start)} – {formatTime(r.end)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatTime(dur)} de duração
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Mover para cima"
                    onClick={() => onMove(r.id, "up")}
                    disabled={disabled || idx === 0}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors active:bg-zinc-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover para baixo"
                    onClick={() => onMove(r.id, "down")}
                    disabled={disabled || idx === ordered.length - 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors active:bg-zinc-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remover corte"
                    onClick={() => onDelete(r.id)}
                    disabled={disabled}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-red-400 transition-colors active:bg-red-500/20 disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {duration > 0 && (
        <p className="text-[10px] text-zinc-600">
          Duração total do vídeo: {formatTime(duration)}
        </p>
      )}
    </div>
  )
}
