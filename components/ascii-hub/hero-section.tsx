"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion } from "framer-motion"

const ASCII_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=-~^"

function useAsciiFrame(rows: number, cols: number, enabled: boolean) {
  const [frame, setFrame] = useState("")
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  const generateFrame = useCallback(() => {
    let result = ""
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const distFromCenter = Math.abs(c - cols / 2) / (cols / 2)
        const vertDist = Math.abs(r - rows / 2) / (rows / 2)
        const dist = Math.sqrt(distFromCenter ** 2 + vertDist ** 2)
        if (Math.random() > dist * 0.7) {
          result += ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)]
        } else {
          result += " "
        }
      }
      if (r < rows - 1) result += "\n"
    }
    return result
  }, [rows, cols])

  useEffect(() => {
    if (!enabled) {
      setFrame(generateFrame())
      return
    }

    const animate = (time: number) => {
      if (time - lastTimeRef.current > 120) {
        lastTimeRef.current = time
        setFrame(generateFrame())
      }
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, generateFrame])

  return frame
}

export function HeroSection() {
  const [motionEnabled, setMotionEnabled] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setMotionEnabled(!mq.matches)
    const handler = (e: MediaQueryListEvent) => setMotionEnabled(!e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const asciiFrame = useAsciiFrame(30, 80, motionEnabled)

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Scanline overlay */}
      {motionEnabled && (
        <div
          className="animate-scanline pointer-events-none absolute inset-0 z-10 h-[2px] w-full bg-foreground/5"
          aria-hidden="true"
        />
      )}

      {/* ASCII Background */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.10]"
        aria-hidden="true"
      >
        <pre className="font-mono text-sm leading-[18px] text-foreground lg:text-base lg:leading-[22px]">
          {asciiFrame}
        </pre>
      </div>

      {/* Main Content */}
      <div className="relative z-20 flex max-w-4xl flex-col items-start gap-8 text-left">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex flex-col items-start gap-6"
        >
          <div className="inline-flex items-center gap-2 border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 bg-foreground" />
            <span>FRONTEND ENGINEERING SHOWCASE</span>
          </div>

          <h1 className="font-pixel-line text-5xl font-bold leading-none tracking-tight text-foreground text-balance md:text-7xl lg:text-9xl">
            Raw Logic.
            <br />
            <span className="text-muted-foreground">Refined Form.</span>
          </h1>

          <p className="max-w-prose font-mono text-sm leading-relaxed text-muted-foreground md:text-base">
            An exclusive showcase of high-performance frontend engineering and character-based art.
            Eight specialized modules exploring the intersection of code and aesthetics.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex flex-col items-start gap-4 sm:flex-row"
        >
          <a
            href="#kernel-systems"
            className="group flex items-center gap-2 border border-foreground bg-foreground px-6 py-3 font-mono text-sm text-background transition-all duration-200 hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
          >
            Explore the Modules
            <span className="transition-transform duration-200 group-hover:translate-x-1">
              {"->"}
            </span>
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-border px-6 py-3 font-mono text-sm text-muted-foreground transition-all duration-200 hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
          >
            Clone the Repo
          </a>
        </motion.div>

        {/* Animated ASCII art display */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="mt-8 w-full max-w-lg border border-border bg-secondary/50 p-4"
          role="img"
          aria-label="ASCII art animation representing a terminal interface"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 w-2 bg-muted-foreground" />
            <div className="h-2 w-2 bg-muted-foreground/50" />
            <div className="h-2 w-2 bg-muted-foreground/30" />
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
              monochrome-hub ~ v1.0.0
            </span>
          </div>
          <pre className="overflow-hidden font-mono text-[10px] leading-relaxed text-foreground/80 md:text-xs">
            {`> initializing ascii_renderer...
> loading 8 technical modules...
> font: GeistPixel loaded [OK]
> palette: #000 #FFF [MONOCHROME]
> animation_engine: 60fps target
> status: OPERATIONAL
> _`}
            <span className="animate-blink">{"█"}</span>
          </pre>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Scroll to Explore
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="h-4 w-[1px] bg-muted-foreground"
        />
      </motion.div>
    </section>
  )
}
