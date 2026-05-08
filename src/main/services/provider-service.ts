import type {
  ModelProviderConfig,
  ProviderAuthMode,
  ProviderDraftInput,
  ProviderModel,
  ProviderProtocol,
  ProviderPurpose,
  ProviderSaveResult,
  ProviderTestResult,
} from "../../types/domain";
import { ProviderConfigStore } from "./provider-config-store";
import { ProviderSecretStore } from "./provider-secret-store";

const PROVIDER_FETCH_TIMEOUT_MS = 8_000;

type LegacyProviderConfig = Partial<ModelProviderConfig> & {
  purpose?: string;
  protocol?: string;
  authMode?: string;
};

export class ProviderService {
  constructor(
    private readonly configs: ProviderConfigStore,
    private readonly secrets?: ProviderSecretStore,
  ) {}

  list(): ModelProviderConfig[] {
    return normalizeProviders(this.configs.listProviders()).map(cloneProvider);
  }

  save(input: ProviderDraftInput): ProviderSaveResult {
    const draft = normalizeProviderDraftInput(input);
    const providers = normalizeProviders(this.configs.listProviders());
    const embeddingFingerprintBefore = activeEmbeddingProviderFingerprint(providers);
    const timestamp = new Date().toISOString();
    const existing = draft.id ? providers.find((provider) => provider.id === draft.id) : undefined;
    const providerId = draft.id || `provider-${Date.now().toString(36)}`;
    const purpose = normalizeProviderPurpose(draft);
    const protocol = normalizeProviderProtocol(draft.protocol, purpose);
    const selectedModel = draft.selectedModel;
    const apiKey = draft.apiKey;
    let apiKeySecretRef = existing?.apiKeySecretRef;
    let apiKeyMasked = existing?.apiKeyMasked || "";
    if (draft.clearApiKey) {
      this.secrets?.deleteApiKey(providerId);
      apiKeySecretRef = undefined;
      apiKeyMasked = "";
    } else if (apiKey) {
      apiKeySecretRef = this.secrets?.saveApiKey(providerId, apiKey);
      apiKeyMasked = maskApiKey(apiKey);
    } else if (!apiKeySecretRef && this.secrets?.hasApiKey(providerId)) {
      apiKeySecretRef = this.secrets.secretRef(providerId);
    }
    const next: ModelProviderConfig = {
      id: providerId,
      purpose,
      name: uniqueProviderName(draft.name || nextProviderName(providers, purpose, providerId), providers, purpose, providerId),
      protocol,
      baseUrl: normalizeBaseUrl(draft.baseUrl),
      apiKeyMasked,
      apiKeySecretRef,
      authMode: normalizeProviderAuthMode(draft.authMode, purpose),
      models: normalizeProviderModels(draft.models || existing?.models || [], selectedModel),
      selectedModel,
      enabled: draft.enabled ?? existing?.enabled ?? false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const provider = this.configs.saveProvider(next);
    const embeddingFingerprintAfter = activeEmbeddingProviderFingerprint(normalizeProviders(this.configs.listProviders()));
    return {
      provider,
      embeddingIndexMayBeStale: Boolean(
        embeddingFingerprintBefore &&
        embeddingFingerprintAfter &&
        embeddingFingerprintBefore !== embeddingFingerprintAfter,
      ),
    };
  }

  delete(providerId: string): boolean {
    const id = stringValue(providerId).trim();
    if (!id) return false;
    const existedInMemory = this.configs.listProviders().some((provider) => provider.id === id);
    const deleted = this.configs.deleteProvider(id);
    if (!deleted && !existedInMemory) return false;
    try {
      this.secrets?.deleteApiKey(id);
    } catch (error) {
      console.warn(`[providers] Failed to delete secret for ${id}`, error);
    }
    return true;
  }

  async models(providerId: string): Promise<ProviderModel[]> {
    const id = stringValue(providerId).trim();
    if (!id) return [];
    const provider = this.list().find((item) => item.id === id);
    if (!provider) return [];
    const apiKey = this.apiKey(provider.id) || envApiKeyForProvider(provider);
    if (!provider.baseUrl || !apiKey) return provider.models;
    try {
      const fetched = await fetchProviderModels(provider, apiKey);
      const compatibleModels = filterModelsForPurpose(provider.purpose, fetched);
      const models = normalizeProviderModels(compatibleModels, provider.selectedModel);
      this.configs.saveProvider({ ...provider, models, updatedAt: new Date().toISOString() });
      return models;
    } catch (error) {
      console.warn(`[providers] Failed to fetch models for ${provider.id}`, error);
      return provider.models;
    }
  }

  async test(providerId: string): Promise<ProviderTestResult> {
    const startedAt = Date.now();
    const id = stringValue(providerId).trim();
    if (!id) {
      return { ok: false, latencyMs: Date.now() - startedAt, message: "Provider id is required." };
    }
    const provider = this.list().find((item) => item.id === id);
    if (!provider) {
      return { ok: false, latencyMs: 0, message: "Provider not found." };
    }
    if (!provider.baseUrl) {
      return { ok: false, latencyMs: Date.now() - startedAt, message: "Base URL is required." };
    }
    const apiKey = this.apiKey(provider.id) || envApiKeyForProvider(provider);
    if (!apiKey) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: "No API key is stored for this provider. Paste a key and save, or set the matching environment variable.",
      };
    }
    try {
      await fetchProviderModels(provider, apiKey, { limit: 1 });
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        message: `${provider.name} connected via ${provider.baseUrl}.`,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Connection test failed.",
      };
    }
  }

  apiKey(providerId: string): string | undefined {
    const id = stringValue(providerId).trim();
    return id ? this.secrets?.readApiKey(id) : undefined;
  }

  hasApiKey(providerId: string): boolean {
    const id = stringValue(providerId).trim();
    return Boolean(id && this.secrets?.hasApiKey(id));
  }

  secretStorageAvailable(): boolean {
    return Boolean(this.secrets?.isEncryptionAvailable());
  }

  /** First provider that is allowed to serve agent requests. */
  agentProvider(): ModelProviderConfig | undefined {
    return this.list().find((provider) =>
      provider.purpose === "agent" &&
      provider.protocol === "anthropic_messages" &&
      provider.enabled &&
      Boolean(provider.selectedModel) &&
      Boolean(provider.baseUrl) &&
      Boolean(this.apiKey(provider.id) || envApiKeyForProvider(provider)),
    );
  }

  /** First provider that is allowed to serve embedding requests. */
  embeddingProvider(): ModelProviderConfig | undefined {
    return this.list().find((provider) =>
      provider.purpose === "embedding" &&
      provider.protocol === "openai_compatible" &&
      provider.enabled &&
      Boolean(provider.selectedModel) &&
      Boolean(provider.baseUrl),
    );
  }

  envApiKeyFor(provider: ModelProviderConfig): string | undefined {
    return envApiKeyForProvider(provider);
  }
}

export function normalizeProviders(providers: LegacyProviderConfig[]): ModelProviderConfig[] {
  return providers.map((provider) => {
    const purpose = normalizeProviderPurpose(provider);
    const protocol = normalizeProviderProtocol(provider.protocol, purpose);
    const selectedModel = normalizeSelectedModel(provider);
    return {
      id: stringValue(provider.id) || `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      purpose,
      name: stringValue(provider.name) || (purpose === "agent" ? "Agent Provider" : "Embedding Provider"),
      protocol,
      baseUrl: normalizeBaseUrl(provider.baseUrl),
      apiKeyMasked: stringValue(provider.apiKeyMasked) === "sk-...local" ? "" : stringValue(provider.apiKeyMasked),
      apiKeySecretRef: stringValue(provider.apiKeySecretRef) || (provider.id ? `provider-secret:${provider.id}` : undefined),
      authMode: normalizeProviderAuthMode(provider.authMode, purpose),
      models: normalizeProviderModels(provider.models, selectedModel),
      selectedModel,
      enabled: normalizeProviderEnabled(provider),
      createdAt: stringValue(provider.createdAt) || new Date().toISOString(),
      updatedAt: stringValue(provider.updatedAt) || new Date().toISOString(),
    };
  });
}

export function envApiKeyForProvider(provider: ModelProviderConfig): string | undefined {
  if (provider.purpose === "agent") {
    return envAgentApiKey(provider.authMode);
  }
  return envEmbeddingApiKey();
}

function envAgentApiKey(authMode: ProviderAuthMode): string | undefined {
  if (authMode === "auth_token" || authMode === "bearer") {
    return process.env.UCLAW_ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN;
  }
  return process.env.UCLAW_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
}

function envEmbeddingApiKey(): string | undefined {
  return process.env.UCLAW_OPENAI_COMPATIBLE_API_KEY || process.env.UCLAW_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "....";
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

function normalizeBaseUrl(baseUrl?: string): string {
  return stringValue(baseUrl).trim().replace(/\/+$/, "");
}

function nextProviderName(providers: ModelProviderConfig[], purpose: ProviderPurpose, excludeId?: string): string {
  const prefix = purpose === "agent" ? "Agent" : "Embedding";
  const used = new Set(
    providers
      .filter((provider) => provider.purpose === purpose && provider.id !== excludeId)
      .map((provider) => normalizeNameKey(provider.name)),
  );
  let index = 1;
  while (used.has(normalizeNameKey(`${prefix} ${index}`))) index += 1;
  return `${prefix} ${index}`;
}

function uniqueProviderName(name: string, providers: ModelProviderConfig[], purpose: ProviderPurpose, excludeId?: string): string {
  const baseName = name.trim() || nextProviderName(providers, purpose, excludeId);
  const used = new Set(
    providers
      .filter((provider) => provider.purpose === purpose && provider.id !== excludeId)
      .map((provider) => normalizeNameKey(provider.name)),
  );
  if (!used.has(normalizeNameKey(baseName))) return baseName;
  let index = 2;
  while (used.has(normalizeNameKey(`${baseName} ${index}`))) index += 1;
  return `${baseName} ${index}`;
}

function normalizeNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeProviderPurpose(provider: Pick<LegacyProviderConfig, "purpose" | "protocol">): ProviderPurpose {
  if (provider.purpose === "agent" || provider.purpose === "embedding") return provider.purpose;
  if (provider.protocol === "anthropic_messages") return "agent";
  return "embedding";
}

function normalizeProviderProtocol(protocol: string | undefined, purpose: ProviderPurpose): ProviderProtocol {
  if (purpose === "agent") return "anthropic_messages";
  return "openai_compatible";
}

function normalizeProviderAuthMode(authMode: string | undefined, purpose: ProviderPurpose): ProviderAuthMode {
  if (authMode === "api_key" || authMode === "auth_token" || authMode === "bearer") return authMode;
  return purpose === "agent" ? "api_key" : "bearer";
}

function normalizeSelectedModel(provider: LegacyProviderConfig): string {
  return stringValue(provider.selectedModel).trim();
}

function normalizeProviderEnabled(provider: LegacyProviderConfig): boolean {
  return Boolean(provider.enabled);
}

function activeEmbeddingProviderFingerprint(providers: ModelProviderConfig[]): string | undefined {
  const provider = providers.find((item) =>
    item.purpose === "embedding" &&
    item.protocol === "openai_compatible" &&
    item.enabled &&
    Boolean(item.selectedModel) &&
    Boolean(item.baseUrl),
  );
  if (!provider) return undefined;
  return [provider.id, normalizeBaseUrl(provider.baseUrl), provider.selectedModel.trim()].join("|");
}

function normalizeProviderModels(models: unknown, selectedModel: string): ProviderModel[] {
  const normalized = Array.isArray(models)
    ? models.flatMap((model) => {
        if (!model || typeof model !== "object") return [];
        const item = model as Partial<ProviderModel>;
        const id = stringValue(item.id).trim();
        if (!id) return [];
        return [{
          id,
          name: stringValue(item.name).trim() || id,
          enabled: item.enabled !== false,
        }];
      })
    : [];
  const unique = new Map<string, ProviderModel>();
  for (const model of normalized) unique.set(model.id, model);
  if (selectedModel && !unique.has(selectedModel)) {
    unique.set(selectedModel, { id: selectedModel, name: selectedModel, enabled: true });
  }
  return [...unique.values()];
}

async function fetchProviderModels(
  provider: ModelProviderConfig,
  apiKey: string,
  options: { limit?: number } = {},
): Promise<ProviderModel[]> {
  if (!provider.baseUrl) throw new Error("Base URL is required.");
  const authHeaders = authHeadersForProvider(provider, apiKey);
  const modelEndpoints = candidateModelEndpoints(provider.baseUrl);
  let lastError: Error | null = null;
  let modelsPayload: { data?: Array<{ id?: string; display_name?: string; name?: string }> } | null = null;
  for (const endpoint of modelEndpoints) {
    const response = await fetchWithTimeout(endpoint, { headers: authHeaders });
    if (!response.ok) {
      lastError = new Error(`Connection failed (${response.status}) ${await responseShortText(response)}`);
      continue;
    }
    const payload = (await responseJson(response)) as { data?: Array<{ id?: string; display_name?: string; name?: string }> } | null;
    if (!payload) {
      lastError = new Error(`Expected JSON from ${endpoint} but received non-JSON response.`);
      continue;
    }
    modelsPayload = payload;
    break;
  }
  if (!modelsPayload) {
    throw lastError || new Error(`Unable to load models from ${provider.baseUrl}.`);
  }
  const models = (modelsPayload.data || []).flatMap((item) => providerModelFromId(item.id || "", item.display_name || item.name));
  return typeof options.limit === "number" ? models.slice(0, options.limit) : models;
}

function authHeadersForProvider(provider: ModelProviderConfig, apiKey: string): Record<string, string> {
  if (provider.purpose === "agent") {
    if (provider.authMode === "auth_token" || provider.authMode === "bearer") {
      return {
        "anthropic-version": "2023-06-01",
        authorization: `Bearer ${apiKey}`,
      };
    }
    return {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    };
  }
  if (provider.authMode === "api_key") {
    return { "x-api-key": apiKey };
  }
  return { authorization: `Bearer ${apiKey}` };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Connection timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function providerModelFromId(id: string, displayName?: string): ProviderModel[] {
  const modelId = id.trim();
  if (!modelId) return [];
  return [{ id: modelId, name: displayName || modelId, enabled: true }];
}

function filterModelsForPurpose(purpose: ProviderPurpose, models: ProviderModel[]): ProviderModel[] {
  if (purpose === "agent") return models;
  const embeddingModels = models.filter((model) => isEmbeddingModelId(model.id));
  return embeddingModels.length > 0 ? embeddingModels : models;
}

function isEmbeddingModelId(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (
    lower.includes("embedding") ||
    lower.includes("embed") ||
    lower.includes("bge") ||
    lower.includes("gte") ||
    lower.includes("e5") ||
    lower.includes("jina") ||
    lower.includes("voyage")
  );
}

async function responseShortText(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, " ").slice(0, 180);
  } catch {
    return "";
  }
}

async function responseJson(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

function candidateModelEndpoints(baseUrl: string): string[] {
  const normalized = normalizeBaseUrl(baseUrl);
  return [`${normalized}/models`];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function normalizeProviderDraftInput(input: unknown): ProviderDraftInput {
  const draft = input && typeof input === "object" ? input as Partial<ProviderDraftInput> : {};
  const purpose = draft.purpose === "agent" || draft.purpose === "embedding" ? draft.purpose : draft.protocol === "anthropic_messages" ? "agent" : "embedding";
  return {
    id: stringValue(draft.id).trim() || undefined,
    purpose,
    name: stringValue(draft.name).trim(),
    protocol: normalizeProviderProtocol(stringValue(draft.protocol), purpose),
    baseUrl: stringValue(draft.baseUrl),
    apiKey: stringValue(draft.apiKey).trim(),
    clearApiKey: Boolean(draft.clearApiKey),
    authMode: normalizeProviderAuthMode(stringValue(draft.authMode), purpose),
    models: Array.isArray(draft.models) ? draft.models : [],
    selectedModel: stringValue(draft.selectedModel).trim(),
    enabled: typeof draft.enabled === "boolean" ? draft.enabled : undefined,
  };
}

function cloneProvider(provider: ModelProviderConfig): ModelProviderConfig {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  };
}
