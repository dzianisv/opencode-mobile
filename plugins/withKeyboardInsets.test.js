const assert = require("node:assert/strict")
const test = require("node:test")
const { addKeyboardInsets } = require("./withKeyboardInsets")

test("adds Android IME insets listener once", () => {
  const source = "import android.os.Bundle\nclass MainActivity {\n    super.onCreate(null)\n}\n"
  const result = addKeyboardInsets(source)
  assert.match(result, /WindowInsetsCompat\.Type\.ime\(\)/)
  assert.equal(addKeyboardInsets(result), result)
})
