import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"))

test("image picker does not remove microphone access needed by speech recognition", () => {
  const imagePicker = config.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker")
  assert.notEqual(imagePicker?.[1]?.microphonePermission, false)
  assert.ok(config.expo.plugins.some((plugin) => plugin === "expo-speech-recognition" || plugin[0] === "expo-speech-recognition"))
})

test("Android background monitoring declares its foreground service requirements", () => {
  assert.ok(config.expo.android.permissions.includes("android.permission.FOREGROUND_SERVICE"))
  assert.ok(config.expo.android.permissions.includes("android.permission.FOREGROUND_SERVICE_DATA_SYNC"))
  assert.ok(config.expo.plugins.includes("./plugins/with-background-monitor"))
})
