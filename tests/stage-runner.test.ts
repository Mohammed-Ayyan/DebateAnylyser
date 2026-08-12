import { describe, expect, it } from "vitest"

import { StageSchemaRegistry } from "@/lib/ai/schema-registry"
import { runValidatedStage, StageOutputValidationError } from "@/lib/ai/stage-runner"

function registry() {
  const registry = new StageSchemaRegistry()
  registry.register("result", {
    type: "object",
    properties: { result: { type: "string", minLength: 1 } },
    required: ["result"],
    additionalProperties: false,
  })
  return registry
}

describe("validated stage runner", () => {
  it("retries invalid structured output and returns only schema-valid output", async () => {
    const calls: number[] = []
    const result = await runValidatedStage<{ result: string }>({
      stage: "S2",
      schemaKey: "result",
      source: "ordinary transcript",
      registry: registry(),
      invoke: ({ attempt }) => {
        calls.push(attempt)
        return Promise.resolve(attempt === 1 ? { wrong: true } : { result: "grounded" })
      },
    })
    expect(result.output).toEqual({ result: "grounded" })
    expect(result.attempts).toBe(2)
    expect(calls).toEqual([1, 2])
  })

  it("fails closed after the bounded validation retries", async () => {
    await expect(
      runValidatedStage({
        stage: "S5",
        schemaKey: "result",
        source: "ordinary transcript",
        registry: registry(),
        maxAttempts: 2,
        invoke: () => Promise.resolve({ unstructured: true }),
      }),
    ).rejects.toBeInstanceOf(StageOutputValidationError)
  })
})
