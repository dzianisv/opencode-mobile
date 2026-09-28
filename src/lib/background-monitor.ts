import { Platform } from "react-native"
import BackgroundService from "react-native-background-actions"

const MAX_RUN_MS = 5 * 60 * 60 * 1000
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let operation = Promise.resolve()

async function keepAlive() {
  const deadline = Date.now() + MAX_RUN_MS
  while (BackgroundService.isRunning() && Date.now() < deadline) await sleep(60_000)
  if (BackgroundService.isRunning()) await BackgroundService.stop()
}

export function startBackgroundMonitor(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve()

  operation = operation
    .catch(() => {})
    .then(async () => {
      if (BackgroundService.isRunning()) return
      await BackgroundService.start(keepAlive, {
        taskName: "OpenCodeMonitor",
        taskTitle: "OpenCode is monitoring sessions",
        taskDesc: "You will be notified when an agent needs input or finishes.",
        taskIcon: { name: "ic_launcher", type: "mipmap" },
        color: "#6366f1",
        foregroundServiceType: ["dataSync"],
      })
    })
    .catch((error) => console.warn("[BackgroundMonitor] Failed to start:", error))
  return operation
}

export function stopBackgroundMonitor(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve()

  operation = operation
    .catch(() => {})
    .then(async () => {
      if (BackgroundService.isRunning()) await BackgroundService.stop()
    })
    .catch((error) => console.warn("[BackgroundMonitor] Failed to stop:", error))
  return operation
}
