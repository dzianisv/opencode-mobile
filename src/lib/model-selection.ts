export interface ProviderModelRef {
  id: string
}

export interface ProviderRef {
  id: string
  models: ProviderModelRef[]
}

export interface ModelSelection {
  providerID: string
  modelID: string
}

export function isModelAvailable(
  providers: ProviderRef[],
  selection: ModelSelection | null | undefined,
): selection is ModelSelection {
  if (!selection) return false
  const provider = providers.find((p) => p.id === selection.providerID)
  if (!provider) return false
  return provider.models.some((m) => m.id === selection.modelID)
}

/**
 * Chooses a model selection for the session.
 *
 * Returns `null` when there is no prior user-explicit choice. A null model
 * means the server's configured default (opencode.json `"model"` field) will
 * be used — which is the correct behavior for first-launch and CI where the
 * provider registry's "default" model may not be deployed on the user's
 * resource.
 *
 * Only returns a non-null value when the user previously made an explicit
 * selection that is still valid (model available on a connected provider).
 */
export function chooseModelSelection(params: {
  providers: ProviderRef[]
  defaults: Record<string, string>
  existing: ModelSelection | null
  agentModel: ModelSelection | null
}): ModelSelection | null {
  const { providers, existing } = params

  // Keep existing user-chosen selection if it's still reachable
  if (isModelAvailable(providers, existing)) return existing

  // Otherwise return null — let the server decide via its own config.
  // The provider registry's "defaults" map is unreliable (it lists the
  // upstream registry default, not what's deployed on the user's resource).
  return null
}
