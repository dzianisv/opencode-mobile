import { NativeModule, requireNativeModule } from "expo"

declare class InstallSourceModule extends NativeModule {
  getInstallerPackageNameAsync(): Promise<string | null>
}

// This call loads the native module object from the JSI.
export default requireNativeModule<InstallSourceModule>("InstallSource")
