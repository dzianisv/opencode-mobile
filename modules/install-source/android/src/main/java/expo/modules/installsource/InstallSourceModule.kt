package expo.modules.installsource

import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InstallSourceModule : Module() {
  override fun definition() = ModuleDefinition {
    // The module will be accessible from `requireNativeModule('InstallSource')` in JavaScript.
    Name("InstallSource")

    // The package that installed this app (Play, F-Droid, ...), or null when
    // it cannot be determined.
    //
    // Framework APIs only — android.content.pm.PackageManager and
    // android.os.Build, no Play Services and no Play dependencies of any
    // kind — so the F-Droid patched build, which strips Play services from
    // the Expo modules, still compiles this module unchanged.
    //
    // getInstallSourceInfo() exists from API 30; below that the deprecated
    // getInstallerPackageName() is the only way, so this falls back to it.
    // A null result is a normal answer (sideloaded debug build, restricted
    // profile), never an error: callers treat unknown as "GitHub, as today".
    AsyncFunction("getInstallerPackageNameAsync") {
      try {
        val context = appContext.reactContext ?: return@AsyncFunction null
        val packageManager = context.packageManager
        val packageName = context.packageName
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          try {
            packageManager.getInstallSourceInfo(packageName).installingPackageName
          } catch (_: Exception) {
            @Suppress("DEPRECATION")
            packageManager.getInstallerPackageName(packageName)
          }
        } else {
          @Suppress("DEPRECATION")
          packageManager.getInstallerPackageName(packageName)
        }
      } catch (_: Exception) {
        null
      }
    }
  }
}
