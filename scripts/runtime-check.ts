import { loadEnvFile } from "node:process"

import { assertRuntimeRole, isRuntimeRole } from "../lib/env/runtime-validation"

for (const path of [".env.local", ".env"]) {
  try {
    loadEnvFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

const role = process.argv[2]
if (!isRuntimeRole(role)) {
  throw new Error("Runtime role must be one of: web, analysis-worker, m10-worker, migration.")
}
assertRuntimeRole(role, process.env)
console.log(`Runtime configuration is valid for ${role}.`)
