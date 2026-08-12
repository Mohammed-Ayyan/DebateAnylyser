"use client"

import React, { useMemo, useState } from "react"

import type { PublicStructureFinding, SpanRef, StructureEdge } from "@/lib/contracts/analysis"
import { AsciiBadge } from "@/components/ascii-decorations"

export type ArgumentStructureViewProps = {
  findings: PublicStructureFinding[]
  edges: StructureEdge[]
  onNavigateToSpan?: (span: SpanRef) => void
}

export function buildStructureViewModel(
  findings: PublicStructureFinding[],
  edges: StructureEdge[],
) {
  const nodes = new Map(findings.map((finding) => [finding.id, finding]))
  return {
    nodes: findings,
    edges: edges.flatMap((edge) => {
      const from = nodes.get(edge.from_finding_id)
      const to = nodes.get(edge.to_finding_id)
      return from && to ? [{ edge, from, to }] : []
    }),
  }
}

function NodeButton({
  finding,
  onNavigateToSpan,
}: {
  finding: PublicStructureFinding
  onNavigateToSpan?: (span: SpanRef) => void
}) {
  const span = finding.span_refs[0]
  return (
    <button
      type="button"
      onClick={() => span && onNavigateToSpan?.(span)}
      className="w-full border border-[#333] bg-black p-3 text-left outline-none transition-colors hover:border-zinc-500 focus-visible:border-white focus-visible:ring-1 focus-visible:ring-white"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase">
        <AsciiBadge variant="outline">{finding.structure.role}</AsciiBadge>
        {finding.structure.inferred && <AsciiBadge variant="warning">INFERRED</AsciiBadge>}
        {finding.state === "insufficient" && (
          <AsciiBadge variant="warning">UNCLEAR STRUCTURE</AsciiBadge>
        )}
      </div>
      <p className="text-xs leading-relaxed text-zinc-200">{finding.text}</p>
      <p className="mt-2 text-[10px] uppercase text-zinc-500">
        {finding.structure.anchor_role === "asserted_content"
          ? "VERBATIM TRANSCRIPT NODE"
          : finding.structure.anchor_role === "inference_context"
            ? "INFERENCE — SELECT TO REVIEW CONTEXT"
            : "CLAIM SUBJECT ANCHOR"}
      </p>
    </button>
  )
}

export function ArgumentStructureView({
  findings,
  edges,
  onNavigateToSpan,
}: ArgumentStructureViewProps) {
  const [mode, setMode] = useState<"map" | "list">("map")
  const view = useMemo(() => buildStructureViewModel(findings, edges), [edges, findings])

  return (
    <section aria-labelledby="argument-structure-heading" className="space-y-3 font-mono">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="argument-structure-heading" className="text-sm font-bold uppercase text-white">
            Argument Structure
          </h2>
          <p className="text-[10px] text-zinc-500">
            Possible Toulmin pattern — not a quality or truth verdict.
          </p>
        </div>
        <div className="flex text-[10px]" aria-label="Argument structure view mode">
          {(["map", "list"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={`border px-3 py-1.5 uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                mode === item
                  ? "border-white bg-white font-bold text-black"
                  : "border-[#333] bg-black text-zinc-400"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {view.nodes.length === 0 ? (
        <p className="border border-[#262626] bg-black p-3 text-xs text-zinc-500">
          No traceable argument structure is available.
        </p>
      ) : mode === "map" ? (
        <div className="space-y-3" aria-label="Argument structure map">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {view.nodes.map((finding) => (
              <NodeButton key={finding.id} finding={finding} onNavigateToSpan={onNavigateToSpan} />
            ))}
          </div>
          {view.edges.length > 0 && (
            <ul className="space-y-1 border border-[#262626] bg-[#080808] p-3 text-[10px] text-zinc-400">
              {view.edges.map(({ edge, from, to }) => (
                <li key={edge.id}>
                  [{from.structure.role.toUpperCase()}] —{edge.relation.toUpperCase()}→ [
                  {to.structure.role.toUpperCase()}]
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ol className="space-y-3" aria-label="Argument structure accessible list">
          {view.nodes.map((finding) => {
            const outgoing = view.edges.filter(({ edge }) => edge.from_finding_id === finding.id)
            return (
              <li key={finding.id}>
                <NodeButton finding={finding} onNavigateToSpan={onNavigateToSpan} />
                {outgoing.length > 0 && (
                  <ul className="ml-4 border-l border-[#333] py-1 pl-3 text-[10px] text-zinc-500">
                    {outgoing.map(({ edge, to }) => (
                      <li key={edge.id}>
                        {edge.relation} → {to.structure.role}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
