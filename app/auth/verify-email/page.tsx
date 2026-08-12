import { ProviderMessage } from "@/components/auth/provider-message"

export default function VerifyEmailPage() {
  return (
    <ProviderMessage
      eyebrow="Identity verification"
      title="Verify your email with Auth0"
      description="Email verification is completed through the identity provider. After verification, return to secure sign-in to create or resume your application session."
      actionHref="/api/v1/auth/login?return_to=/dashboard"
      actionLabel="RETURN TO SECURE SIGN-IN"
    />
  )
}
