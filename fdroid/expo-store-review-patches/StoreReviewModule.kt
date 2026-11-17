package expo.modules.storereview

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Patched StoreReviewModule (Play Review-free) for F-Droid builds.
 * Removed: com.google.android.play:review, com.google.android.play:review-ktx
 * and com.google.android.gms:play-services-base (Google Play-only APIs).
 * isAvailableAsync always returns false in F-Droid builds; requestReview
 * rejects, mirroring the installreferrer-free ApplicationModule stub.
 * The JS side (src/lib/store-review.ts) only calls requestReview() after
 * isAvailableAsync() returns true, so the prompt never fires in F-Droid
 * builds and the app behaves as if no store were installed.
 */
class StoreReviewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoStoreReview")

    AsyncFunction<Boolean>("isAvailableAsync") {
      return@AsyncFunction false
    }

    AsyncFunction("requestReview") { promise: Promise ->
      // Play In-App Review requires Google Play Services and is unavailable in F-Droid builds.
      promise.reject(
        "ERR_STORE_REVIEW_UNAVAILABLE",
        "In-app review is not available in F-Droid builds (no Google Play Services).",
        null
      )
    }
  }
}
