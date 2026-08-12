import { ProviderMessage } from "@/components/auth/provider-message"

export default function ForgotPasswordPage() {
  return (
    <ProviderMessage
      eyebrow="Account recovery"
      title="Recover access through Auth0"
      description="Open the provider sign-in screen and use its password recovery option. Debate Analyser does not store passwords or issue reset links."
      actionHref="/api/v1/auth/login?return_to=/dashboard"
      actionLabel="OPEN AUTH0 RECOVERY"
    />
  )
}
