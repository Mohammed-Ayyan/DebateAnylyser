import { ProviderMessage } from "@/components/auth/provider-message"

export default function ResetPasswordPage() {
  return (
    <ProviderMessage
      eyebrow="Account recovery"
      title="Password reset is provider-managed"
      description="Password reset links and verification are issued by Auth0. Continue there to finish recovery without exposing credentials to this application."
      actionHref="/api/v1/auth/login?return_to=/dashboard"
      actionLabel="CONTINUE TO AUTH0"
    />
  )
}
