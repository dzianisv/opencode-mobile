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

export function chooseModelSelection(params: {
  providers: ProviderRef[]
  defaults: Record<string, string>
  existing: ModelSelection | null
  agentModel: ModelSelection | null
}): ModelSelection | null {
  const { providers, defaults, existing, agentModel } = params

  if (isModelAvailable(providers, existing)) return existing

  for (const provider of providers) {
    const defaultModelID = defaults[provider.id]
    if (!defaultModelID) continue
    if (provider.models.some((m) => m.id === defaultModelID)) {
      return { providerID: provider.id, modelID: defaultModelID }
    }
  }

  if (providers.length > 0 && providers[0].models.length > 0) {
    return { providerID: providers[0].id, modelID: providers[0].models[0].id }
  }

  if (isModelAvailable(providers, agentModel)) return agentModel

  return null
}
