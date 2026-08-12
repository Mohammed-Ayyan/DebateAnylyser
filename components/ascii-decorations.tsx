"use client"

import React, { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface AsciiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  badgeText?: string
  asciiHeader?: boolean
  children: React.ReactNode
}

export function AsciiCard({
  title,
  badgeText,
  asciiHeader = false,
  children,
  className,
  ...props
}: AsciiCardProps) {
  return (
    <div
      className={cn(
        "relative bg-black border border-[#262626] p-4 text-white transition-all duration-150 hover:border-white/40",
        className,
      )}
      {...props}
    >
      {/* Corner ASCII Accents */}
      <span className="absolute -top-[1px] -left-[1px] text-[10px] leading-none text-muted-foreground select-none">
        +
      </span>
      <span className="absolute -top-[1px] -right-[1px] text-[10px] leading-none text-muted-foreground select-none">
        +
      </span>
      <span className="absolute -bottom-[1px] -left-[1px] text-[10px] leading-none text-muted-foreground select-none">
        +
      </span>
      <span className="absolute -bottom-[1px] -right-[1px] text-[10px] leading-none text-muted-foreground select-none">
        +
      </span>

      {(title || badgeText) && (
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#262626]">
          {title && (
            <h4 className="text-xs font-mono font-bold tracking-wider uppercase flex items-center gap-2 text-white">
              <span className="text-muted-foreground select-none">[#]</span> {title}
            </h4>
          )}
          {badgeText && (
            <span className="text-[10px] font-mono px-2 py-0.5 border border-[#333] bg-[#111] text-zinc-300">
              {badgeText}
            </span>
          )}
        </div>
      )}

      {children}
    </div>
  )
}

export function AsciiBadge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode
  variant?: "default" | "success" | "warning" | "destructive" | "outline"
  className?: string
}) {
  const variantStyles = {
    default: "bg-[#161616] text-white border-[#333]",
    success: "bg-emerald-950/40 text-emerald-300 border-emerald-800/60",
    warning: "bg-amber-950/40 text-amber-300 border-amber-800/60",
    destructive: "bg-red-950/40 text-red-300 border-red-800/60",
    outline: "bg-transparent text-zinc-400 border-[#262626]",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-mono px-2 py-0.5 border tracking-tight uppercase select-none",
        variantStyles[variant],
        className,
      )}
    >
      [{children}]
    </span>
  )
}

export function AsciiProgress({
  value = 0,
  max = 100,
  length = 20,
  showPercentage = true,
  className,
}: {
  value: number
  max?: number
  length?: number
  showPercentage?: boolean
  className?: string
}) {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)))
  const filledCount = Math.round((percentage / 100) * length)
  const emptyCount = length - filledCount

  const filledChar = "█"
  const emptyChar = "░"

  return (
    <div className={cn("font-mono text-xs flex items-center gap-2", className)}>
      <span className="text-zinc-300 select-none">
        [{filledChar.repeat(filledCount)}
        <span className="text-zinc-700">{emptyChar.repeat(emptyCount)}</span>]
      </span>
      {showPercentage && <span className="text-zinc-400 text-[11px]">{percentage}%</span>}
    </div>
  )
}

export function AsciiDivider({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center my-6", className)}>
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-[#262626]" />
      </div>
      {label && (
        <span className="relative bg-black px-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-[#262626]">
          +-- {label} --+
        </span>
      )}
    </div>
  )
}

export function AsciiSpinner({ className }: { className?: string }) {
  const frames = ["|", "/", "-", "\\"]
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length)
    }, 120)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className={cn("font-mono text-white select-none inline-block", className)}>
      [{frames[frameIndex]}]
    </span>
  )
}

export function AsciiWaveform({
  active = true,
  height = 40,
  bars = 32,
  className,
}: {
  active?: boolean
  height?: number
  bars?: number
  className?: string
}) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: bars }, () => Math.floor(Math.random() * 80) + 20),
  )

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      setHeights(Array.from({ length: bars }, () => Math.floor(Math.random() * 85) + 15))
    }, 100)
    return () => clearInterval(interval)
  }, [active, bars])

  return (
    <div
      className={cn(
        "flex items-end justify-between gap-[2px] bg-black p-2 border border-[#262626]",
        className,
      )}
      style={{ height: `${height}px` }}
    >
      {heights.map((h, idx) => (
        <div
          key={idx}
          className="flex-1 bg-white/80 transition-all duration-100 ease-out hover:bg-white"
          style={{ height: active ? `${h}%` : "10%" }}
        />
      ))}
    </div>
  )
}
