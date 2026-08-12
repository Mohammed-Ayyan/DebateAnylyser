"use client"

import { motion } from "framer-motion"
import { useState } from "react"
import type { TechSection } from "@/lib/sections-data"

const shadow =
  "rgba(14, 63, 126, 0.04) 0px 0px 0px 1px, rgba(42, 51, 69, 0.04) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.04) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.04) 0px 6px 6px -3px, rgba(14, 63, 126, 0.04) 0px 12px 12px -6px, rgba(14, 63, 126, 0.04) 0px 24px 24px -12px"

/*
  SECTION 03: DISTRIBUTED LEDGER
  Style: Horizontal scrolling block-chain visualization.
  Each block is a clickable card. Center-stage hero.
  Newspaper-column text layout for description.
*/

const blocks = [
  { hash: "0xA3F...2B", prev: "0x000...00", nonce: 42, tx: 12, height: 1020 },
  { hash: "0xB7D...F1", prev: "0xA3F...2B", nonce: 87, tx: 8, height: 1021 },
  { hash: "0xC12...8A", prev: "0xB7D...F1", nonce: 156, tx: 15, height: 1022 },
  { hash: "0xD9E...3C", prev: "0xC12...8A", nonce: 203, tx: 5, height: 1023 },
  { hash: "0xE4A...7D", prev: "0xD9E...3C", nonce: 91, tx: 22, height: 1024 },
]

function BlockCard({
  block,
  index,
  isSelected,
  onSelect,
}: {
  block: (typeof blocks)[0]
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.15 + index * 0.1 }}
      onClick={onSelect}
      className={`group relative flex w-48 flex-shrink-0 flex-col border p-4 text-left font-mono transition-all duration-300 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none ${
        isSelected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:border-foreground"
      }`}
      style={{ boxShadow: shadow }}
    >
      <span
        className={`text-[10px] uppercase tracking-wider ${isSelected ? "text-background/50" : "text-muted-foreground"}`}
      >
        Block #{block.height}
      </span>
      <span
        className={`mt-2 text-sm font-bold ${isSelected ? "text-background" : "text-foreground"}`}
      >
        {block.hash}
      </span>
      <div className="mt-3 flex flex-col gap-1 text-[10px]">
        <div className="flex justify-between">
          <span className={isSelected ? "text-background/50" : "text-muted-foreground"}>Nonce</span>
          <span>{block.nonce}</span>
        </div>
        <div className="flex justify-between">
          <span className={isSelected ? "text-background/50" : "text-muted-foreground"}>Tx</span>
          <span>{block.tx}</span>
        </div>
      </div>
      {/* Chain connector */}
      {index < blocks.length - 1 && (
        <div
          className="absolute -right-6 top-1/2 hidden -translate-y-1/2 items-center md:flex"
          aria-hidden="true"
        >
          <div className="h-px w-6 bg-border" />
          <div className="h-0 w-0 border-y-[3px] border-l-[5px] border-y-transparent border-l-border" />
        </div>
      )}
    </motion.button>
  )
}

export function SectionLedger({ section }: { section: TechSection }) {
  const [selectedBlock, setSelectedBlock] = useState(2)

  return (
    <div className="py-20 lg:py-32">
      {/* Full-width top bar with number + title */}
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex items-end gap-6"
        >
          <span className="font-pixel-line text-7xl font-bold leading-none text-foreground/[0.08] md:text-9xl">
            {section.number}
          </span>
          <div className="pb-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {section.subtitle}
            </span>
            <h2 className="font-pixel-line text-3xl font-bold text-foreground md:text-5xl">
              {section.title}
            </h2>
          </div>
        </motion.div>

        {/* Description in columns */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-8 max-w-4xl font-mono text-sm leading-relaxed text-muted-foreground md:columns-2 md:gap-12"
        >
          {section.description} Each block is cryptographically linked to its predecessor, forming
          an immutable chain. The Merkle root ensures data integrity across all transactions within
          a single block.
        </motion.p>
      </div>

      {/* Horizontal scrolling chain */}
      <div className="mt-12 overflow-x-auto">
        <div className="mx-auto flex w-max items-center gap-6 px-8 pb-4">
          {blocks.map((block, i) => (
            <BlockCard
              key={block.hash}
              block={block}
              index={i}
              isSelected={selectedBlock === i}
              onSelect={() => setSelectedBlock(i)}
            />
          ))}
        </div>
      </div>

      {/* Selected block detail + specs */}
      <div className="mx-auto mt-8 max-w-7xl px-4 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Block detail panel */}
          <motion.div
            key={selectedBlock}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="border border-border p-6"
            style={{ boxShadow: shadow }}
          >
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 bg-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Block Inspector
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3 font-mono text-xs">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Height</span>
                <span className="font-bold text-foreground">#{blocks[selectedBlock].height}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Hash</span>
                <span className="font-bold text-foreground">{blocks[selectedBlock].hash}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Previous</span>
                <span className="text-foreground">{blocks[selectedBlock].prev}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Nonce</span>
                <span className="text-foreground">{blocks[selectedBlock].nonce}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transactions</span>
                <span className="text-foreground">{blocks[selectedBlock].tx}</span>
              </div>
            </div>
          </motion.div>

          {/* Specs as vertical meter */}
          <div className="flex flex-col gap-3">
            {section.specs.map((spec, i) => (
              <motion.div
                key={spec.label}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-4 border border-border p-4"
                style={{ boxShadow: shadow }}
              >
                <div className="flex h-10 w-10 items-center justify-center bg-foreground font-mono text-xs font-bold text-background">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {spec.label}
                  </div>
                  <div className="font-mono text-sm font-bold text-foreground">{spec.value}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
