import { registerWebModule, NativeModule } from "expo"

// Web has no installer package, so this always reports null — the same
// answer the policy gives an unknown installer (GitHub, as today).
class InstallSourceModule extends NativeModule {
  async getInstallerPackageNameAsync(): Promise<string | null> {
    return null
  }
}

export default registerWebModule(InstallSourceModule, "InstallSource")
