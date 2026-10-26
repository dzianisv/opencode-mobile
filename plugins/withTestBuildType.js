const { withAppBuildGradle } = require("@expo/config-plugins")

const block = `
        testRelease {
            initWith release
            matchingFallbacks = ['release']
            applicationIdSuffix ".test"
            versionNameSuffix "-test"
            resValue "string", "app_name", "OpenCode Test"
            signingConfig signingConfigs.debug
        }
    }
    applicationVariants.all { variant ->
        if (variant.buildType.name == "testRelease") {
            variant.outputs.all { output ->
                output.versionCodeOverride = (findProperty("testVersionCode") ?: defaultConfig.versionCode).toInteger()
            }
        }
`

function addTestBuildType(contents) {
  if (contents.includes('applicationIdSuffix ".test"')) return contents
  const anchor = "    }\n    packagingOptions {"
  if (!contents.includes(anchor)) throw new Error("Unsupported android/app/build.gradle template")
  return contents.replace(anchor, `${block}    packagingOptions {`)
}

module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") throw new Error("Test build type requires Groovy Gradle")
    config.modResults.contents = addTestBuildType(config.modResults.contents)
    return config
  })

module.exports.addTestBuildType = addTestBuildType
