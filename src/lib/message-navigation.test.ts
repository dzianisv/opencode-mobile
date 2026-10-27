import { test } from "node:test"
import assert from "node:assert/strict"
import { MessageNavigation } from "./message-navigation.ts"

function list() {
  const nav = new MessageNavigation()
  nav.sync(["new", "long", "old"])
  nav.height = 200
  nav.frames.set("new", { y: 0, height: 100 })
  nav.frames.set("long", { y: 100, height: 1000 })
  nav.frames.set("old", { y: 1100, height: 100 })
  return nav
}

test("viewport top anchors a partially visible long message, not the newest visible row", () => {
  const nav = list()
  assert.equal(nav.current(), 1)
  assert.equal(nav.move(1), 2)
  assert.equal(nav.destination(), 1000)
})

test("exact message starts belong to that message, not its older neighbor", () => {
  const nav = list()
  nav.offset = 900
  assert.equal(nav.current(), 1)
  assert.equal(nav.move(-1), 0)
  assert.equal(nav.destination(), 0)
})

test("repeated taps advance before the native scroll callback arrives", () => {
  const nav = list()
  nav.offset = 1000
  assert.equal(nav.move(-1), 1)
  assert.equal(nav.destination(), 900)
  assert.equal(nav.move(-1), 0)
  assert.equal(nav.move(-1), undefined)
  assert.equal(nav.target, "new")
})

test("empty, unmeasured and oldest bounds are no-ops", () => {
  const nav = new MessageNavigation()
  assert.equal(nav.move(1), undefined)
  nav.sync(["only"])
  assert.equal(nav.move(-1), undefined)
  const measured = list()
  measured.offset = 1000
  assert.equal(measured.move(1), undefined)
})

test("virtualized offscreen target resolves only after its actual layout arrives", () => {
  const nav = list()
  nav.frames.delete("old")
  assert.equal(nav.move(1), 2)
  assert.equal(nav.destination(), undefined)
  nav.frames.set("old", { y: 1100, height: 500 })
  assert.equal(nav.destination(), 1400)
})

test("streaming growth and appends preserve pending target ID rather than stale index", () => {
  const nav = list()
  nav.move(1)
  nav.sync(["appended", "new", "long", "old"])
  nav.frames.set("old", { y: 1500, height: 100 })
  assert.equal(nav.current(), 3)
  assert.equal(nav.destination(), 1400)
  assert.equal(nav.move(-1), 2)
  assert.equal(nav.target, "long")
})

test("manual scroll discards tap anchor and derives the next target from viewport", () => {
  const nav = list()
  nav.move(1)
  nav.manual()
  nav.offset = 400
  assert.equal(nav.current(), 1)
  assert.equal(nav.move(-1), 0)
})

test("revert/removal discards missing targets and layouts", () => {
  const nav = list()
  nav.move(1)
  nav.sync(["new", "long"])
  assert.equal(nav.target, undefined)
  assert.equal(nav.frames.has("old"), false)
  assert.equal(nav.current(), 1)
})

test("layout-only zero-height rows cannot become viewport anchors", () => {
  const nav = list()
  nav.frames.set("long", { y: 100, height: 0 })
  assert.equal(nav.current(), 0)
})

test("viewport resizing changes the inverted top coordinate", () => {
  const nav = list()
  nav.height = 100
  assert.equal(nav.current(), 0)
  nav.height = 200
  assert.equal(nav.current(), 1)
})

test("completed newest navigation does not top-pin subsequent streaming growth", () => {
  const nav = list()
  nav.move(-1)
  nav.complete(nav.destination()!)
  nav.frames.set("new", { y: 0, height: 500 })
  assert.equal(nav.destination(), undefined)
  assert.equal(nav.target, undefined)
  assert.equal(nav.current(), 0)
})

test("completed tap anchor is invalidated by keyboard resize and viewport scroll", () => {
  const nav = list()
  nav.move(1)
  nav.complete(nav.destination()!)
  nav.observe(1000, 200)
  assert.equal(nav.current(), 2)
  nav.observe(1000, 100)
  assert.equal(nav.current(), 1)
  assert.equal(nav.move(-1), 0)
  nav.complete(0)
  nav.observe(400, 200)
  assert.equal(nav.current(), 1)
})

test("completed clamped short-message taps advance until a viewport change", () => {
  const nav = list()
  nav.move(-1)
  nav.complete(0)
  nav.observe(0, 200)
  assert.equal(nav.current(), 0)
  assert.equal(nav.move(-1), undefined)
  nav.manual()
  assert.equal(nav.current(), 1)
})

test("accepted virtualized estimates keep seeking, then settle to actual measured top", () => {
  const nav = list()
  nav.frames.delete("old")
  const calls: unknown[] = []
  const driver = {
    scrollToIndex(params: unknown) { calls.push(params) },
    scrollToOffset(params: { offset: number; animated: boolean }) {
      calls.push(params)
      nav.observe(params.offset, nav.height)
    },
  }
  nav.move(1)
  assert.equal(nav.seek(driver, 0), true)
  assert.deepEqual(calls[0], { index: 2, viewPosition: 1, animated: false })
  assert.equal(nav.seek(driver, 1), true)
  assert.deepEqual(calls[1], { offset: 160, animated: false })
  nav.frames.set("old", { y: 1100, height: 500 })
  assert.equal(nav.seek(driver, 2), false)
  assert.deepEqual(calls[2], { offset: 1400, animated: false })
  assert.equal(nav.target, undefined)
  assert.equal(nav.current(), 2)
})

test("manual cancellation and retry exhaustion stop all seek side effects", () => {
  const nav = list()
  nav.frames.delete("old")
  const driver = {
    scrollToIndex() { assert.fail("cancelled seek must not scroll") },
    scrollToOffset() { assert.fail("cancelled seek must not scroll") },
  }
  nav.move(1)
  assert.equal(nav.seek(driver, 20), false)
  assert.equal(nav.target, undefined)
  nav.move(1)
  nav.manual()
  assert.equal(nav.seek(driver, 1), false)
})

test("delayed native offsets cannot discard the latest rapid-tap boundary", () => {
  const nav = new MessageNavigation()
  nav.sync(["reply3", "reply2", "reply1", "user3", "user2", "user1"])
  nav.observe(0, 200)
  nav.ids.forEach((id, index) => nav.frames.set(id, { y: index * 600, height: 600 }))
  const driver = { scrollToOffset() {}, scrollToIndex() {} }
  assert.equal(nav.move(1), 1)
  nav.seek(driver, 0)
  assert.equal(nav.move(1), 2)
  nav.seek(driver, 0)
  // The callback for tap 1 arrives after tap 2 has issued its native scroll.
  nav.observe(1000, 200)
  assert.equal(nav.move(1), 3)
  assert.equal(nav.target, "user3")
})

test("Latest resets the logical viewport before its native callback arrives", () => {
  const nav = list()
  nav.frames.set("new", { y: 0, height: 600 })
  nav.frames.set("long", { y: 600, height: 1000 })
  nav.frames.set("old", { y: 1600, height: 100 })
  nav.observe(1500, 200)
  nav.manual(0)
  nav.observe(1500, 200) // an older scroll event still queued during Latest
  assert.equal(nav.offset, 0)
  assert.equal(nav.move(1), 1)
  assert.equal(nav.target, "long")
})

test("acknowledged navigation resumes scroll reanchoring and manual cancellation", () => {
  const nav = list()
  nav.move(1)
  nav.complete(1000)
  nav.observe(1000, 200)
  nav.observe(400, 200)
  assert.equal(nav.current(), 1)
  nav.move(-1)
  nav.complete(0)
  nav.manual()
  nav.observe(400, 200)
  assert.equal(nav.current(), 1)
  assert.equal(nav.expected, undefined)
})
