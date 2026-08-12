export type ApplicationEnvironment = "dev" | "staging" | "prod"

export const DEVELOPMENT_IDENTITY = Object.freeze({
  providerRef: "development-session#fixed-local-user",
  email: "development.user@local.invalid",
})

export function isDevelopmentSessionAllowed(
  appEnvironment: ApplicationEnvironment | undefined,
): boolean {
  return appEnvironment === "dev"
}
