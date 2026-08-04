import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { createStreamBatcher } from "./stream-batcher.ts"

// All tests use fake timers so the trailing-edge window is deterministic.
// t.mock.timers intercepts setTimeout/clearTimeout, which is the entire
// surface area of the batcher.

describe("createStreamBatcher", () => {
  test("emits nothing before the window elapses", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    batcher.push("a")
    t.mock.timers.tick(59)
    assert.deepEqual(emitted, [])
  })

  test("coalesces rapid pushes into a single trailing emission", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    for (let i = 0; i < 100; i++) batcher.push(`token-${i}`)
    t.mock.timers.tick(60)
    assert.deepEqual(emitted, ["token-99"])
  })

  test("always delivers the final value once the stream settles", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    batcher.push("start")
    t.mock.timers.tick(60)
    assert.deepEqual(emitted, ["start"])
    batcher.push("middle")
    batcher.push("end")
    t.mock.timers.tick(60)
    assert.deepEqual(emitted, ["start", "end"])
    // Stream finished — nothing further arrives.
    t.mock.timers.tick(1000)
    assert.deepEqual(emitted, ["start", "end"])
  })

  test("emits once per window while the stream keeps flowing", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    batcher.push("t1")
    batcher.push("t2")
    t.mock.timers.tick(60)
    batcher.push("t3")
    batcher.push("t4")
    t.mock.timers.tick(60)
    assert.deepEqual(emitted, ["t2", "t4"])
  })

  test("emits the new value immediately when the previous window already fired", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    batcher.push("a")
    t.mock.timers.tick(60)
    // No pushes in window 2 — no emission.
    t.mock.timers.tick(60)
    batcher.push("b")
    t.mock.timers.tick(60)
    assert.deepEqual(emitted, ["a", "b"])
  })

  test("stop() drops a pending emission without firing", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    batcher.push("a")
    batcher.stop()
    t.mock.timers.tick(1000)
    assert.deepEqual(emitted, [])
  })

  test("a value pushed after stop() starts a fresh window", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    batcher.push("a")
    batcher.stop()
    batcher.push("b")
    t.mock.timers.tick(60)
    assert.deepEqual(emitted, ["b"])
  })

  test("identical values still coalesce to one emission", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 60)
    batcher.push("same")
    batcher.push("same")
    t.mock.timers.tick(60)
    assert.deepEqual(emitted, ["same"])
  })

  test("zero window still coalesces synchronous bursts into one emission", (t) => {
    t.mock.timers.enable()
    const emitted: string[] = []
    const batcher = createStreamBatcher((v) => emitted.push(v), 0)
    batcher.push("x")
    batcher.push("y")
    t.mock.timers.tick(0)
    assert.deepEqual(emitted, ["y"])
  })
})
