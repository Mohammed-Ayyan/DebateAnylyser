import { randomBytes } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import postgres from "postgres"

const databasePrefix = "debate_migration_cert_"
const migrationPattern = /^(\d{4})_.+\.sql$/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const migrationDirectory = path.join(root, "drizzle")
const createdDatabases = new Set<string>()

function databaseIdentity(value: URL): string {
  const port = value.port || "5432"
  return `${value.hostname.toLowerCase()}:${port}/${decodeURIComponent(value.pathname)}`
}

function quoteIdentifier(value: string): string {
  if (!new RegExp(`^${databasePrefix}[a-z0-9_]+$`).test(value)) {
    throw new Error("Refusing to use an unsafe ephemeral database name.")
  }
  return `"${value}"`
}

function requireAdminUrl(): URL {
  const raw = process.env.MIGRATION_TEST_ADMIN_URL
  if (!raw) {
    throw new Error(
      "MIGRATION_TEST_ADMIN_URL is required; it must name an administrator database on a test PostgreSQL instance.",
    )
  }
  const url = new URL(raw)
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("MIGRATION_TEST_ADMIN_URL must use PostgreSQL.")
  }
  if (!url.hostname || !url.username || url.pathname === "/") {
    throw new Error("MIGRATION_TEST_ADMIN_URL must include host, user, and administrator database.")
  }
  const configured = process.env.DATABASE_URL
  if (configured) {
    const configuredUrl = new URL(configured)
    if (databaseIdentity(configuredUrl) === databaseIdentity(url)) {
      throw new Error(
        "MIGRATION_TEST_ADMIN_URL must never target the configured application database.",
      )
    }
  }
  return url
}

async function migrationFiles(): Promise<{ index: number; path: string; name: string }[]> {
  const entries = await readdir(migrationDirectory)
  const files = entries
    .map((name) => ({ name, match: migrationPattern.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ name, match }) => ({
      index: Number(match[1]),
      path: path.join(migrationDirectory, name),
      name,
    }))
    .sort((left, right) => left.index - right.index)
  const expected = Array.from({ length: 9 }, (_, index) => index)
  if (
    files.length !== expected.length ||
    files.some((file, index) => file.index !== expected[index])
  ) {
    throw new Error(
      "Migration certification expects a contiguous 0000 through 0008 migration chain.",
    )
  }
  return files
}

async function applyMigration(
  database: postgres.Sql,
  migration: { path: string; name: string },
): Promise<void> {
  const source = await readFile(migration.path, "utf8")
  const statements = source
    .split(/--> statement-breakpoint\s*/u)
    .map((statement) => statement.trim())
    .filter(Boolean)
  await database.begin(async (transaction) => {
    for (const statement of statements) await transaction.unsafe(statement)
  })
}

async function verifyFinalSchema(database: postgres.Sql): Promise<void> {
  const requiredTables = [
    "sources",
    "finding_evidence",
    "finding_credibility",
    "source_credibility_ratings",
    "annotations",
    "contests",
    "data_events",
    "exports",
    "operation_jobs",
    "retention_schedules",
    "shares",
  ]
  const rows = await database<{ name: string }[]>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_name = any(${requiredTables})
  `
  const found = new Set(rows.map((row) => row.name))
  const missing = requiredTables.filter((name) => !found.has(name))
  if (missing.length > 0) throw new Error(`Final schema is missing tables: ${missing.join(", ")}`)
  const [{ installed }] = await database<{ installed: boolean }[]>`
    select exists(select 1 from pg_extension where extname = 'citext') as installed
  `
  if (!installed) throw new Error("The citext extension was not installed.")
}

function ephemeralUrl(adminUrl: URL, databaseName: string): string {
  const target = new URL(adminUrl)
  target.pathname = `/${databaseName}`
  return target.toString()
}

async function removeDatabase(admin: postgres.Sql, name: string): Promise<void> {
  if (!createdDatabases.has(name)) return
  await admin`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${name} and pid <> pg_backend_pid()
  `
  await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)}`)
  createdDatabases.delete(name)
}

async function certifyScenario(
  admin: postgres.Sql,
  adminUrl: URL,
  migrations: Awaited<ReturnType<typeof migrationFiles>>,
  baseline: number | undefined,
): Promise<void> {
  const suffix = randomBytes(6).toString("hex")
  const name = `${databasePrefix}${process.pid}_${suffix}`
  await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0`)
  createdDatabases.add(name)
  const database = postgres(ephemeralUrl(adminUrl, name), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  })
  const label = baseline === undefined ? "clean install" : `upgrade after 000${baseline}`
  try {
    if (baseline !== undefined) {
      for (const migration of migrations.filter((item) => item.index <= baseline)) {
        await applyMigration(database, migration)
      }
    }
    for (const migration of migrations.filter(
      (item) => baseline === undefined || item.index > baseline,
    )) {
      await applyMigration(database, migration)
    }
    await verifyFinalSchema(database)
    console.log(`Migration certification passed: ${label}.`)
  } finally {
    await database.end({ timeout: 5 })
    await removeDatabase(admin, name)
  }
}

async function main(): Promise<void> {
  const adminUrl = requireAdminUrl()
  const migrations = await migrationFiles()
  const admin = postgres(adminUrl.toString(), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  })
  try {
    for (const baseline of [undefined, 4, 5, 6, 7]) {
      await certifyScenario(admin, adminUrl, migrations, baseline)
    }
  } finally {
    for (const database of [...createdDatabases]) {
      try {
        await removeDatabase(admin, database)
      } catch (error) {
        console.error(`Could not remove owned ephemeral database ${database}.`, error)
      }
    }
    await admin.end({ timeout: 5 })
  }
}

void main().catch((error: unknown) => {
  console.error("Migration certification failed.", error)
  process.exitCode = 1
})
