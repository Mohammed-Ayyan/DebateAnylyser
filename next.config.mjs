import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: __dirname,
  async headers() {
    const securityHeaders = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Frame-Options", value: "DENY" },
    ]
    const sharedHeaders = [
      { key: "Cache-Control", value: "no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      {
        key: "Content-Security-Policy",
        value:
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    ]
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/shared/:path*", headers: sharedHeaders },
      { source: "/api/v1/shared/:path*", headers: sharedHeaders },
    ]
  },
}

export default nextConfig
