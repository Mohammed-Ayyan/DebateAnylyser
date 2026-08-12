import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url))
const result = spawnSync(process.execPath, [nextCli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_USE_SYSTEM_CA: "1" },
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
