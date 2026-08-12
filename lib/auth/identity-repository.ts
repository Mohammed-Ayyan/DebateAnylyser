import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import { userPreferences, users } from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"
import type { ExternalIdentity } from "./session"
import type { PreferenceUpdate } from "./preferences"

export async function upsertIdentity(identity: ExternalIdentity) {
  const db = getDatabase()
  return db.transaction(async (tx) => {
    const [emailOwner] = await tx
      .select({ authProviderRef: users.authProviderRef })
      .from(users)
      .where(eq(users.email, identity.email))
      .limit(1)
    if (emailOwner && emailOwner.authProviderRef !== identity.providerRef) {
      throw new AppError({
        code: "IDENTITY_CONFLICT",
        status: 409,
        message: "This email is linked to a different identity.",
        expose: true,
      })
    }
    const [user] = await tx
      .insert(users)
      .values({ email: identity.email, authProviderRef: identity.providerRef })
      .onConflictDoUpdate({
        target: users.authProviderRef,
        set: { email: identity.email, updatedAt: new Date() },
      })
      .returning()
    if (user.deletedAt) {
      throw new AppError({
        code: "ACCOUNT_DELETED",
        status: 403,
        message: "This account is pending deletion.",
        expose: true,
      })
    }
    await tx.insert(userPreferences).values({ userId: user.id }).onConflictDoNothing()
    return user
  })
}

export async function findActiveUserById(userId: string) {
  const [user] = await getDatabase()
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)
  return user
}

export async function findActiveUserByProviderRef(providerRef: string) {
  const [user] = await getDatabase()
    .select()
    .from(users)
    .where(and(eq(users.authProviderRef, providerRef), isNull(users.deletedAt)))
    .limit(1)
  return user
}

export async function getUserWithPreferences(userId: string) {
  const [result] = await getDatabase()
    .select({ user: users, preferences: userPreferences })
    .from(users)
    .innerJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)
  return result
}

export async function updateUserPreferences(userId: string, update: PreferenceUpdate) {
  return getDatabase().transaction(async (tx) => {
    const [current] = await tx
      .select({ preferences: userPreferences, user: users })
      .from(users)
      .innerJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
    if (!current) {
      throw new AppError({
        code: "NOT_FOUND",
        status: 404,
        message: "Account not found.",
        expose: true,
      })
    }
    const [preferences] = await tx
      .update(userPreferences)
      .set({
        ...(update.confidence_display ? { confidenceDisplay: "categorical" as const } : {}),
        ...(update.jargon_plain_language === undefined
          ? {}
          : { jargonPlainLanguage: update.jargon_plain_language }),
        ...(update.reading_density ? { readingDensity: update.reading_density } : {}),
        ...(update.accessibility_prefs
          ? {
              accessibilityPrefs: {
                ...current.preferences.accessibilityPrefs,
                ...update.accessibility_prefs,
              },
            }
          : {}),
      })
      .where(eq(userPreferences.userId, userId))
      .returning()
    if (update.default_retention_setting !== undefined) {
      await tx
        .update(users)
        .set({ defaultRetentionSetting: update.default_retention_setting, updatedAt: new Date() })
        .where(eq(users.id, userId))
    }
    return {
      ...preferences,
      defaultRetentionSetting:
        update.default_retention_setting ?? current.user.defaultRetentionSetting,
    }
  })
}
