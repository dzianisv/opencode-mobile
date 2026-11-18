// Public entry point for the local InstallSource module.
// On web, src/InstallSourceModule.web.ts is resolved instead and always
// reports null (there is no installer package on web).
import InstallSourceModule from "./src/InstallSourceModule"

export default InstallSourceModule

/**
 * The package that installed this app (e.g. "com.android.vending"), or null
 * when it cannot be determined — sideloaded debug build, an old build
 * without the native module, or a platform without one. Never throws.
 */
export async function getInstallerPackageName(): Promise<string | null> {
  try {
    return await InstallSourceModule.getInstallerPackageNameAsync()
  } catch {
    return null
  }
}
