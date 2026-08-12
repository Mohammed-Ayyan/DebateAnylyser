import type { NextRequest } from "next/server"

import { AppError } from "@/lib/errors/app-error"
import { requireServerEnv } from "@/lib/env/server"

export function assertTrustedOrigin(request: NextRequest): void {
  const { APP_ORIGIN } = requireServerEnv("APP_ORIGIN")
  const origin = request.headers.get("origin")
  if (!origin || origin !== new URL(APP_ORIGIN).origin) {
    throw new AppError({
      code: "INVALID_ORIGIN",
      status: 403,
      message: "The request origin is not permitted.",
      expose: true,
    })
  }
}
