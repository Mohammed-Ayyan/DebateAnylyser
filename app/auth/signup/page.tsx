import { ProviderMessage } from "@/components/auth/provider-message"

export default function SignUpPage() {
  return (
    <ProviderMessage
      eyebrow="Account provisioning"
      title="Create an account"
      description="Account creation is handled by Auth0 so passwords, email verification, and identity protections stay with the configured provider."
      actionHref="/api/v1/auth/login?screen_hint=signup&return_to=/dashboard"
      actionLabel="CONTINUE TO AUTH0"
    />
  )
}
