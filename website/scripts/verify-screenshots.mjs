import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const directory = resolve(root, "public/screenshots/v0.4.7")
const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"))

for (const screenshot of manifest.screenshots) {
  const file = resolve(directory, screenshot.file)
  const contents = await readFile(file)
  const hash = createHash("sha256").update(contents).digest("hex")
  if (hash !== screenshot.sha256) {
    throw new Error(`${screenshot.file} does not match its approved Play checksum`)
  }
}

console.log(`Verified ${manifest.screenshots.length} approved screenshots.`)
