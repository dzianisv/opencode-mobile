const { withAndroidManifest } = require("@expo/config-plugins")

const SERVICE = "com.asterinet.react.bgactions.RNBackgroundActionsTask"

module.exports = (config) =>
  withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0]
    application.service = application.service || []

    const service = application.service.find((item) => item.$["android:name"] === SERVICE)
    const attributes = {
      "android:name": SERVICE,
      "android:exported": "false",
      "android:foregroundServiceType": "dataSync",
    }

    if (service) service.$ = { ...service.$, ...attributes }
    else application.service.push({ $: attributes })

    return config
  })
