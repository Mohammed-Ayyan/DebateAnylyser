import "server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { requireServerEnv } from "@/lib/env/server"
import * as schema from "./schema"

function createDatabase() {
  const { DATABASE_URL } = requireServerEnv("DATABASE_URL")
  const client = postgres(DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
  return drizzle(client, { schema })
}

export type Database = ReturnType<typeof createDatabase>

const globalDatabase = globalThis as typeof globalThis & { __debateDatabase?: Database }

export function getDatabase(): Database {
  globalDatabase.__debateDatabase ??= createDatabase()
  return globalDatabase.__debateDatabase
}
