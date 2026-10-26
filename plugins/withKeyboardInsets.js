const { withMainActivity } = require("@expo/config-plugins")

const imports = `import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
`

const listener = `
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      val root = findViewById<View>(android.R.id.content)
      val bottom = root.paddingBottom
      // Android 15+ no longer resizes edge-to-edge windows for the IME.
      ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
        view.setPadding(view.paddingLeft, view.paddingTop, view.paddingRight, bottom + insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
        insets
      }
      ViewCompat.requestApplyInsets(root)
    }
`

function addKeyboardInsets(contents) {
  if (contents.includes("WindowInsetsCompat.Type.ime()")) return contents
  if (!contents.includes("import android.os.Bundle\n") || !contents.includes("    super.onCreate(null)\n")) {
    throw new Error("Unsupported MainActivity.kt template")
  }
  return contents
    .replace("import android.os.Bundle\n", `import android.os.Bundle\n${imports}`)
    .replace("    super.onCreate(null)\n", `    super.onCreate(null)\n${listener}`)
}

module.exports = (config) =>
  withMainActivity(config, (config) => {
    if (config.modResults.language !== "kt") throw new Error("Keyboard inset fix requires MainActivity.kt")
    config.modResults.contents = addKeyboardInsets(config.modResults.contents)
    return config
  })

module.exports.addKeyboardInsets = addKeyboardInsets
