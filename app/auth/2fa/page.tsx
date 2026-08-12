import { ProviderMessage } from "@/components/auth/provider-message"

export default function TwoFactorPage() {
  return (
    <ProviderMessage
      eyebrow="Multifactor verification"
      title="Verification is provider-managed"
      description="If your account or organization requires another factor, Auth0 presents and validates it during sign-in. This application does not collect authenticator codes."
      actionHref="/api/v1/auth/login?return_to=/dashboard"
      actionLabel="RETURN TO SECURE SIGN-IN"
    />
  )
}
