import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import { users } from "@/lib/db/schema"

export async function recordAcceptableUseConsent(
  userId: string,
  version: string,
  acceptedAt = new Date(),
) {
  const [user] = await getDatabase()
    .update(users)
    .set({
      acceptableUseAcceptedAt: acceptedAt,
      acceptableUseVersion: version,
      updatedAt: acceptedAt,
    })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning({
      acceptedAt: users.acceptableUseAcceptedAt,
      version: users.acceptableUseVersion,
    })
  return user
}
