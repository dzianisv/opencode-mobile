import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const app = JSON.parse(await readFile(new URL("../app.json", import.meta.url), "utf8"))
const gradle = await readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8")

assert.equal(app.expo.android.package, "cc.agentlabs.opencode", "Expo production package must remain unchanged")
assert.match(gradle, /applicationId\s+['"]cc\.agentlabs\.opencode['"]/, "Gradle production applicationId missing")
assert.match(gradle, /sidecarRelease\s*\{[\s\S]*?applicationIdSuffix\s+['"]\.test['"]/, "sidecarRelease .test suffix missing")
assert.match(gradle, /sidecarRelease\s*\{[\s\S]*?resValue\s+['"]string['"],\s*['"]app_name['"],\s*['"]OpenCode Test['"]/, "test app name missing")
assert.match(gradle, /sidecarRelease\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/, "sidecarRelease must use local debug signing")
assert.match(gradle, /tasks\.register\(['"]assembleTestRelease['"]\)/, "assembleTestRelease alias missing")

console.log("production=cc.agentlabs.opencode test=cc.agentlabs.opencode.test")
