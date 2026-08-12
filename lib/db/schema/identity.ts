import {
  boolean,
  customType,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { confidenceDisplayEnum, readingDensityEnum, retentionSettingEnum } from "./enums"

const citext = customType<{ data: string }>({ dataType: () => "citext" })
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    authProviderRef: text("auth_provider_ref").notNull(),
    acceptableUseAcceptedAt: timestamp("acceptable_use_accepted_at", { withTimezone: true }),
    acceptableUseVersion: text("acceptable_use_version"),
    defaultRetentionSetting: retentionSettingEnum("default_retention_setting")
      .notNull()
      .default("keep"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("users_auth_provider_ref_uidx").on(table.authProviderRef)],
)

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  confidenceDisplay: confidenceDisplayEnum("confidence_display").notNull().default("categorical"),
  jargonPlainLanguage: boolean("jargon_plain_language").notNull().default(false),
  readingDensity: readingDensityEnum("reading_density").notNull().default("comfortable"),
  accessibilityPrefs: jsonb("accessibility_prefs")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
})
