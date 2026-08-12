import Link from "next/link"
import { ShieldAlert, ShieldCheck } from "lucide-react"

import { DevelopmentSessionAction } from "@/components/auth/development-session-action"
import { ProviderAction } from "@/components/auth/provider-action"
import { safeReturnTo } from "@/lib/auth/navigation"
import { serverEnv } from "@/lib/env/server"

const errors: Record<string, string> = {
  access_denied: "Authentication was cancelled. No session was created.",
  callback_failed: "The identity response could not be verified. Start a new sign-in attempt.",
  invalid_callback: "The authentication callback was incomplete or expired.",
  provider_error: "The identity provider could not complete authentication.",
  provider_unavailable: "The identity provider is temporarily unavailable or misconfigured.",
  state_mismatch: "The authentication state did not match. Start a new sign-in attempt.",
}

type SignInPageProps = {
  searchParams: Promise<{ error?: string; return_to?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams
  const returnTo = safeReturnTo(parameters.return_to)
  const login = `/api/v1/auth/login?${new URLSearchParams({ return_to: returnTo })}`
  const signup = `/api/v1/auth/login?${new URLSearchParams({ return_to: returnTo, screen_hint: "signup" })}`
  const developmentLogin = `/api/v1/auth/development-session?${new URLSearchParams({ return_to: returnTo })}`

  return (
    <div className="space-y-6 text-xs">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Secure workspace access
        </p>
        <h1 className="text-xl font-bold uppercase tracking-tight text-white">Sign in</h1>
        <p className="leading-relaxed text-zinc-400">
          Continue to the configured identity provider. Your password and any additional
          verification remain with Auth0.
        </p>
      </div>
      {parameters.error && (
        <div
          role="alert"
          className="flex gap-3 border border-red-900 bg-red-950/30 p-3 text-red-200"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{errors[parameters.error] ?? "Authentication could not be completed."}</p>
        </div>
      )}
      <ProviderAction href={login} label="CONTINUE WITH AUTH0" />
      {serverEnv.APP_ENV === "dev" && <DevelopmentSessionAction action={developmentLogin} />}
      <div className="space-y-3 border-t border-[#262626] pt-4 text-zinc-400">
        <p>
          Need an account?{" "}
          <a href={signup} className="font-bold text-white underline underline-offset-4">
            Create one through Auth0
          </a>
        </p>
        <p>
          Account recovery and multifactor verification are available on the provider screen.{" "}
          <Link href="/" className="text-white underline underline-offset-4">
            Return home
          </Link>
        </p>
      </div>
    </div>
  )
}
