export type AuthenticatedPrincipal = {
  kind: "authenticated"
  userId: string
  email: string
  providerRef: string
  authMethod: "session" | "bearer"
}

export type SharePrincipal = {
  kind: "share"
  shareId: string
  analysisId: string
}

export type AnonymousPrincipal = { kind: "anonymous" }
export type Principal = AuthenticatedPrincipal | SharePrincipal | AnonymousPrincipal
