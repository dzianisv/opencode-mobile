const assert = require("node:assert/strict")
const test = require("node:test")
const { addTestBuildType } = require("./withTestBuildType")

test("adds an idempotent side-by-side test build without changing production identity", () => {
  const source = `android {
    defaultConfig {
        applicationId 'cc.agentlabs.opencode'
    }
    buildTypes {
        release {
        }
    }
    packagingOptions {
    }
}
`
  const result = addTestBuildType(source)
  assert.match(result, /applicationId 'cc\.agentlabs\.opencode'/)
  assert.match(result, /testRelease \{/)
  assert.match(result, /applicationIdSuffix "\.test"/)
  assert.match(result, /resValue "string", "app_name", "OpenCode Test"/)
  assert.equal(result.match(/\{/g)?.length, result.match(/\}/g)?.length)
  assert.equal(addTestBuildType(result), result)
})
