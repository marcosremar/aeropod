"use client"

import { cn } from "@/lib/utils"

export type AspectRatio = "16:9" | "9:16" | "1:1"

interface AspectRatioToggleProps {
  value: AspectRatio
  onChange: (value: AspectRatio) => void
  disabled?: boolean
  className?: string
}

const OPTIONS: Array<{
  value: AspectRatio
  label: string
  /** width/height ratio of the little preview frame */
  frame: { w: number; h: number }
}> = [
  { value: "16:9", label: "Horizontal", frame: { w: 28, h: 16 } },
  { value: "9:16", label: "Vertical", frame: { w: 16, h: 28 } },
  { value: "1:1", label: "Quadrado", frame: { w: 22, h: 22 } },
]

export function AspectRatioToggle({
  value,
  onChange,
  disabled,
  className,
}: AspectRatioToggleProps) {
  return (
    <div className={cn("flex gap-2", className)}>
      {OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 transition-all min-h-[72px] cursor-pointer",
              active
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span
              className={cn(
                "rounded-[3px] border-2",
                active ? "border-emerald-400" : "border-zinc-500"
              )}
              style={{ width: opt.frame.w, height: opt.frame.h }}
            />
            <span className="text-[11px] font-medium leading-none">
              {opt.label}
            </span>
            <span className="text-[10px] text-zinc-500 leading-none">
              {opt.value}
            </span>
          </button>
        )
      })}
    </div>
  )
}
