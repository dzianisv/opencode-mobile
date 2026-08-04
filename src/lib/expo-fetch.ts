// Lazy loader for expo's WinterCG fetch shim (SSE ReadableStream support).
//
// A static `import ... from "expo/fetch"` at the top of sdk.ts made the whole
// module unimportable under `node --test`: expo/fetch.js is a CJS shim that
// require()s ./src/winter/fetch/index.ts, which Metro transpiles but Node's
// CJS loader cannot resolve (ERR_MODULE_NOT_FOUND). Loading lazily — only when
// the event stream actually opens — keeps sdk.ts importable in the test suite
// AND defers the polyfill's startup cost until the stream connects.
//
// If the shim cannot be loaded (the Node test environment), global fetch has
// the same ReadableStream surface, so the event stream still works instead of
// crashing the connection.

let fetchImpl: typeof fetch | null = null

export async function expoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!fetchImpl) {
    try {
      const mod = await import("expo/fetch")
      fetchImpl = mod.fetch as typeof fetch
    } catch {
      fetchImpl = fetch
    }
  }
  return fetchImpl(input, init)
}
