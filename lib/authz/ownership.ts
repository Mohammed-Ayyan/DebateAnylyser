import type { Principal } from "@/lib/auth/types"

export function isAnalysisOwner(principal: Principal, ownerId: string): boolean {
  return principal.kind === "authenticated" && principal.userId === ownerId
}
