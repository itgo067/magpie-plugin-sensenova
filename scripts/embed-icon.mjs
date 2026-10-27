// magpie does not resolve package-relative icons; inline the PNG for installs.
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const bytes = await readFile(join(root, "assets/icon.png"))
const pkgPath = join(root, "package.json")
const pkg = JSON.parse(await readFile(pkgPath, "utf8"))
pkg.magpie ??= {}
pkg.magpie.icon = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`assets/icon.png -> package.json (${bytes.length} bytes)`)
