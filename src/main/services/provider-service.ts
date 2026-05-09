import {
  AGENT_PROVIDER_PRESETS,
  EMBEDDING_PROVIDER_PRESETS,
  PROVIDER_PRESETS,
  type AgentProviderKind,
  type EmbeddingProviderKind,
  type ModelProviderConfig,
  type ProviderAdapterKind,
  type ProviderAuthMode,
  type ProviderDraftInput,
  type ProviderKind,
  type ProviderModel,
  type ProviderPurpose,
  type ProviderPreset,
  type ProviderSaveResult,
  type ProviderTestResult,
} from "../../types/domain";
import { getAgentProviderAdapter, getEmbeddingProviderAdapter, normalizeBaseUrl } from "../providers";
import { ProviderConfigStore } from "./provider-config-store";
import { ProviderSecretStore } from "./provider-secret-store";
import { ProviderTransactionStore } from "./provider-transaction-store";

const PROVIDER_FETCH_TIMEOUT_MS = 8_000;

type LegacyProviderConfig = Partial<ModelProviderConfig> & {
  purpose?: string;
  providerKind?: string;
  adapterKind?: string;
  protocol?: string;
  authMode?: string;
};

export class ProviderService {
  constructor(
    private readonly configs: ProviderConfigStore,
    private readonly secrets?: ProviderSecretStore,
    private readonly transactions?: ProviderTransactionStore,
  ) {
    this.transactions?.reconcile(this.configs, this.secrets);
    this.reconcileSecretRecords();
  }

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
    const providerKind = normalizeProviderKind(draft.providerKind, purpose, draft.protocol, draft.baseUrl);
    const preset = providerPreset(providerKind);
    const protocol = preset.protocol;
    const draftModels = draft.models || [];
    const modelSeed = draftModels.length > 0 ? draftModels : existing?.models || presetModels(preset);
    const selectedModel = draft.selectedModel || modelSeed.find((model) => model.enabled)?.id || "";
    const apiKey = draft.apiKey;
    let apiKeySecretRef = existing?.apiKeySecretRef;
    let apiKeyMasked = existing?.apiKeyMasked || "";
    const secretSnapshot = this.secrets?.snapshot();
    let nextSecretSnapshot = secretSnapshot;
    let secretChanged = false;
    try {
      if (draft.clearApiKey) {
        nextSecretSnapshot = this.secrets?.snapshotWithoutApiKey(providerId);
        secretChanged = Boolean(this.secrets);
        apiKeySecretRef = undefined;
        apiKeyMasked = "";
      } else if (apiKey) {
        const nextSecret = this.secrets?.snapshotWithApiKey(providerId, apiKey);
        nextSecretSnapshot = nextSecret?.snapshot;
        apiKeySecretRef = nextSecret?.secretRef;
        secretChanged = Boolean(this.secrets);
        apiKeyMasked = maskApiKey(apiKey);
      }
      const next: ModelProviderConfig = {
        id: providerId,
        purpose,
        providerKind,
        adapterKind: preset.adapterKind,
        name: uniqueProviderName(draft.name || nextProviderName(providers, purpose, providerId), providers, purpose, providerId),
        protocol,
        baseUrl: normalizeBaseUrl(draft.baseUrl || preset.baseUrl),
        apiKeyMasked,
        apiKeySecretRef,
        authMode: normalizeProviderAuthMode(draft.authMode, purpose, providerKind),
        models: normalizeProviderModels(modelSeed, selectedModel),
        selectedModel,
        enabled: draft.enabled ?? existing?.enabled ?? false,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
      };
      const nextProviders = upsertProvider(providers, next).map((provider) =>
        next.enabled && provider.purpose === next.purpose && provider.id !== next.id
          ? { ...provider, enabled: false, updatedAt: timestamp }
          : provider,
      );
      this.commitProviderMutation({
        type: "save",
        providerId,
        beforeProfiles: providers,
        afterProfiles: nextProviders,
        beforeSecrets: secretSnapshot,
        afterSecrets: nextSecretSnapshot,
        secretChanged,
      });
      const embeddingFingerprintAfter = activeEmbeddingProviderFingerprint(nextProviders);
      return {
        provider: cloneProvider(next),
        embeddingIndexMayBeStale: Boolean(
          embeddingFingerprintBefore &&
          embeddingFingerprintAfter &&
          embeddingFingerprintBefore !== embeddingFingerprintAfter,
        ),
      };
    } catch (error) {
      if (secretChanged && secretSnapshot && this.secrets) {
        try {
          this.secrets.restore(secretSnapshot);
        } catch (rollbackError) {
          console.warn("[providers] Failed to roll back provider secret mutation", rollbackError);
        }
      }
      throw error;
    }
  }

  delete(providerId: string): boolean {
    const id = stringValue(providerId).trim();
    if (!id) return false;
    const providers = normalizeProviders(this.configs.listProviders());
    const existedInMemory = providers.some((provider) => provider.id === id);
    if (!existedInMemory) return false;
    const secretSnapshot = this.secrets?.snapshot();
    const nextSecretSnapshot = this.secrets?.snapshotWithoutApiKey(id);
    try {
      this.commitProviderMutation({
        type: "delete",
        providerId: id,
        beforeProfiles: providers,
        afterProfiles: providers.filter((provider) => provider.id !== id),
        beforeSecrets: secretSnapshot,
        afterSecrets: nextSecretSnapshot,
        secretChanged: Boolean(this.secrets),
      });
      return true;
    } catch (error) {
      if (secretSnapshot && this.secrets) {
        try {
          this.secrets.restore(secretSnapshot);
        } catch (rollbackError) {
          console.warn("[providers] Failed to roll back provider secret deletion", rollbackError);
        }
      }
      throw error;
    }
  }

  async models(providerId: string): Promise<ProviderModel[]> {
    const id = stringValue(providerId).trim();
    if (!id) return [];
    const provider = this.list().find((item) => item.id === id);
    if (!provider) return [];
    const apiKey = this.apiKey(provider.id) || envApiKeyForProvider(provider);
    if (!provider.baseUrl) throw new Error("Base URL is required before fetching models.");
    if (!apiKey) throw new Error("API key is required before fetching models.");
    try {
      const fetched = await fetchProviderModels(provider, apiKey);
      const compatibleModels = filterModelsForPurpose(provider.purpose, fetched);
      const models = normalizeProviderModels(compatibleModels, provider.selectedModel);
      this.configs.saveProvider({ ...provider, models, updatedAt: new Date().toISOString() });
      return models;
    } catch (error) {
      console.warn(`[providers] Failed to fetch models for ${provider.id}`, error);
      throw new Error(`Failed to fetch ${provider.purpose} models: ${error instanceof Error ? error.message : String(error || "Unknown error")}`);
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
      const embeddingDimension = provider.purpose === "embedding"
        ? await testEmbeddingProvider(provider, apiKey)
        : undefined;
      if (provider.purpose === "agent") await testAgentProvider(provider, apiKey);
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        message: embeddingDimension
          ? `${provider.name} embedding endpoint connected via ${provider.baseUrl} (dim=${embeddingDimension}).`
          : `${provider.name} connected via ${provider.baseUrl}.`,
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

  /** Unique enabled provider that is allowed to serve agent requests. */
  agentProvider(): ModelProviderConfig | undefined {
    return singleActiveProvider(this.list().filter((provider) =>
      provider.purpose === "agent" &&
      provider.protocol === "anthropic_messages" &&
      provider.adapterKind === "anthropic" &&
      provider.enabled &&
      Boolean(provider.selectedModel) &&
      Boolean(provider.baseUrl) &&
      Boolean(this.apiKey(provider.id) || envApiKeyForProvider(provider)),
    ));
  }

  /** Unique enabled provider that is allowed to serve embedding requests. */
  embeddingProvider(): ModelProviderConfig | undefined {
    return singleActiveProvider(this.list().filter((provider) =>
      provider.purpose === "embedding" &&
      provider.protocol === "openai_compatible" &&
      provider.adapterKind === "openai_embedding" &&
      provider.enabled &&
      Boolean(provider.selectedModel) &&
      Boolean(provider.baseUrl),
    ));
  }

  envApiKeyFor(provider: ModelProviderConfig): string | undefined {
    return envApiKeyForProvider(provider);
  }

  private commitProviderMutation({
    type,
    providerId,
    beforeProfiles,
    afterProfiles,
    beforeSecrets,
    afterSecrets,
    secretChanged,
  }: {
    type: "save" | "delete";
    providerId: string;
    beforeProfiles: ModelProviderConfig[];
    afterProfiles: ModelProviderConfig[];
    beforeSecrets?: ReturnType<ProviderSecretStore["snapshot"]>;
    afterSecrets?: ReturnType<ProviderSecretStore["snapshot"]>;
    secretChanged: boolean;
  }): void {
    const transaction = secretChanged && this.transactions
      ? this.transactions.begin({
          type,
          providerId,
          beforeProfiles,
          afterProfiles,
          beforeSecrets,
          afterSecrets,
        })
      : undefined;
    try {
      this.configs.replaceProviders(afterProfiles);
      if (secretChanged && afterSecrets && this.secrets) this.secrets.restore(afterSecrets);
      this.transactions?.clear(transaction?.id);
    } catch (error) {
      try {
        this.configs.replaceProviders(beforeProfiles);
        if (secretChanged && beforeSecrets && this.secrets) this.secrets.restore(beforeSecrets);
        this.transactions?.clear(transaction?.id);
      } catch (rollbackError) {
        console.warn("[providers] Failed to roll back provider mutation", rollbackError);
      }
      throw error;
    }
  }

  private reconcileSecretRecords(): void {
    if (!this.secrets) return;
    const providers = normalizeProviders(this.configs.listProviders());
    const providerIds = new Set(providers.map((provider) => provider.id));
    const nextProviders = providers.map((provider) => {
      if (!provider.apiKeySecretRef || this.secrets?.hasStoredApiKeyRecord(provider.id)) return provider;
      return {
        ...provider,
        apiKeySecretRef: undefined,
        apiKeyMasked: "",
      };
    });
    let nextSecrets = this.secrets.snapshot();
    for (const providerId of this.secrets.storedProviderIds()) {
      if (!providerIds.has(providerId)) {
        nextSecrets = {
          ...nextSecrets,
          providers: Object.fromEntries(Object.entries(nextSecrets.providers).filter(([id]) => id !== providerId)),
        };
      }
    }
    const profilesChanged = JSON.stringify(nextProviders) !== JSON.stringify(providers);
    const secretsChanged = this.secrets.storedProviderIds().some((providerId) => !providerIds.has(providerId));
    if (secretsChanged) this.secrets.restore(nextSecrets);
    if (profilesChanged) this.configs.replaceProviders(nextProviders);
  }
}

export function normalizeProviders(providers: LegacyProviderConfig[]): ModelProviderConfig[] {
  return providers.map((provider) => {
    const purpose = normalizeProviderPurpose(provider);
    const providerKind = normalizeProviderKind(provider.providerKind, purpose, provider.protocol, provider.baseUrl);
    const preset = providerPreset(providerKind);
    const protocol = preset.protocol;
    const selectedModel = normalizeSelectedModel(provider);
    const modelSeed = Array.isArray(provider.models) && provider.models.length > 0 ? provider.models : presetModels(preset);
    return {
      id: stringValue(provider.id) || `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      purpose,
      providerKind,
      adapterKind: normalizeProviderAdapterKind(provider.adapterKind, providerKind),
      name: stringValue(provider.name) || (purpose === "agent" ? "Agent Provider" : "Embedding Provider"),
      protocol,
      baseUrl: normalizeBaseUrl(provider.baseUrl || preset.baseUrl),
      apiKeyMasked: stringValue(provider.apiKeyMasked) === "sk-...local" ? "" : stringValue(provider.apiKeyMasked),
      apiKeySecretRef: stringValue(provider.apiKeySecretRef) || (provider.id ? `provider-secret:${provider.id}` : undefined),
      authMode: normalizeProviderAuthMode(provider.authMode, purpose, providerKind),
      models: normalizeProviderModels(modelSeed, selectedModel),
      selectedModel,
      enabled: normalizeProviderEnabled(provider),
      createdAt: stringValue(provider.createdAt) || new Date().toISOString(),
      updatedAt: stringValue(provider.updatedAt) || new Date().toISOString(),
    };
  });
}

export function envApiKeyForProvider(provider: ModelProviderConfig): string | undefined {
  if (provider.purpose === "agent") {
    return envAgentApiKey(provider);
  }
  return envEmbeddingApiKey(provider);
}

function envAgentApiKey(provider: ModelProviderConfig): string | undefined {
  if (provider.providerKind === "deepseek") {
    return process.env.BREVYN_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
  }
  if (provider.providerKind === "kimi-api") {
    return process.env.BREVYN_KIMI_API_KEY || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  }
  if (provider.providerKind === "kimi-coding") {
    return process.env.BREVYN_KIMI_CODING_API_KEY || process.env.KIMI_CODING_API_KEY || process.env.KIMI_API_KEY;
  }
  if (provider.authMode === "auth_token" || provider.authMode === "bearer") {
    return process.env.BREVYN_ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN;
  }
  return process.env.BREVYN_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
}

function envEmbeddingApiKey(provider: ModelProviderConfig): string | undefined {
  if (provider.providerKind === "qwen") {
    return process.env.BREVYN_QWEN_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  }
  if (provider.providerKind === "doubao") {
    return process.env.BREVYN_DOUBAO_API_KEY || process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY;
  }
  if (provider.providerKind === "zhipu") {
    return process.env.BREVYN_ZHIPU_API_KEY || process.env.ZHIPU_API_KEY;
  }
  if (provider.providerKind === "minimax") {
    return process.env.BREVYN_MINIMAX_API_KEY || process.env.MINIMAX_API_KEY;
  }
  return process.env.BREVYN_OPENAI_COMPATIBLE_API_KEY || process.env.BREVYN_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "....";
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
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

function normalizeProviderPurpose(provider: Pick<LegacyProviderConfig, "purpose" | "protocol" | "providerKind">): ProviderPurpose {
  if (provider.purpose === "agent" || provider.purpose === "embedding") return provider.purpose;
  const kindPurpose = providerPurposeForKind(provider.providerKind);
  if (kindPurpose) return kindPurpose;
  if (provider.protocol === "anthropic_messages") return "agent";
  return "embedding";
}

function normalizeProviderAuthMode(authMode: string | undefined, purpose: ProviderPurpose, providerKind?: ProviderKind): ProviderAuthMode {
  if (authMode === "api_key" || authMode === "auth_token" || authMode === "bearer") return authMode;
  if (providerKind) return providerPreset(providerKind).authMode;
  return purpose === "agent" ? "api_key" : "bearer";
}

function normalizeProviderAdapterKind(adapterKind: string | undefined, providerKind: ProviderKind): ProviderAdapterKind {
  const expected = providerPreset(providerKind).adapterKind;
  if (adapterKind === expected) return adapterKind;
  return expected;
}

function normalizeProviderKind(kind: string | undefined, purpose: ProviderPurpose, protocol?: string, baseUrl?: string): ProviderKind {
  const normalized = normalizeKindAlias(kind);
  if (purpose === "agent") {
    if (isAgentProviderKind(normalized)) return normalized;
    return inferAgentProviderKind(protocol, baseUrl);
  }
  if (isEmbeddingProviderKind(normalized)) return normalized;
  return inferEmbeddingProviderKind(baseUrl);
}

function normalizeKindAlias(kind: string | undefined): string {
  const value = stringValue(kind).trim().toLowerCase();
  if (value === "kimi_api") return "kimi-api";
  if (value === "kimi_coding") return "kimi-coding";
  if (value === "custom_anthropic") return "custom-anthropic";
  if (value === "custom_openai" || value === "custom") return "custom-openai";
  return value;
}

function providerPurposeForKind(kind: string | undefined): ProviderPurpose | undefined {
  const normalized = normalizeKindAlias(kind);
  if (isAgentProviderKind(normalized)) return "agent";
  if (isEmbeddingProviderKind(normalized)) return "embedding";
  return undefined;
}

function isAgentProviderKind(kind: string): kind is AgentProviderKind {
  return Object.prototype.hasOwnProperty.call(AGENT_PROVIDER_PRESETS, kind);
}

function isEmbeddingProviderKind(kind: string): kind is EmbeddingProviderKind {
  return Object.prototype.hasOwnProperty.call(EMBEDDING_PROVIDER_PRESETS, kind);
}

function inferAgentProviderKind(protocol?: string, baseUrl?: string): AgentProviderKind {
  const url = normalizeBaseUrl(baseUrl).toLowerCase();
  if (url.includes("deepseek.com")) return "deepseek";
  if (url.includes("api.kimi.com/coding")) return "kimi-coding";
  if (url.includes("moonshot.cn/anthropic")) return "kimi-api";
  if (url && !url.includes("api.anthropic.com")) return "custom-anthropic";
  if (protocol === "anthropic_messages" || !url) return "anthropic";
  return "custom-anthropic";
}

function inferEmbeddingProviderKind(baseUrl?: string): EmbeddingProviderKind {
  const url = normalizeBaseUrl(baseUrl).toLowerCase();
  if (url.includes("dashscope.aliyuncs.com")) return "qwen";
  if (url.includes("volces.com")) return "doubao";
  if (url.includes("bigmodel.cn")) return "zhipu";
  if (url.includes("minimax.chat")) return "minimax";
  if (url.includes("api.openai.com") || !url) return "openai";
  return "custom-openai";
}

function providerPreset(providerKind: ProviderKind): ProviderPreset {
  return PROVIDER_PRESETS[providerKind];
}

function presetModels(preset: ProviderPreset): ProviderModel[] {
  return (preset.models || []).map((model) => ({ ...model }));
}

function normalizeSelectedModel(provider: LegacyProviderConfig): string {
  return stringValue(provider.selectedModel).trim();
}

function normalizeProviderEnabled(provider: LegacyProviderConfig): boolean {
  return Boolean(provider.enabled);
}

function activeEmbeddingProviderFingerprint(providers: ModelProviderConfig[]): string | undefined {
  const provider = singleActiveProvider(providers.filter((item) =>
    item.purpose === "embedding" &&
    item.protocol === "openai_compatible" &&
    item.adapterKind === "openai_embedding" &&
    item.enabled &&
    Boolean(item.selectedModel) &&
    Boolean(item.baseUrl),
  ));
  if (!provider) return undefined;
  return [provider.id, provider.providerKind, normalizeBaseUrl(provider.baseUrl), provider.selectedModel.trim()].join("|");
}

function singleActiveProvider(providers: ModelProviderConfig[]): ModelProviderConfig | undefined {
  return providers.length === 1 ? providers[0] : undefined;
}

function upsertProvider(providers: ModelProviderConfig[], provider: ModelProviderConfig): ModelProviderConfig[] {
  const next = providers.map(cloneProvider);
  const index = next.findIndex((item) => item.id === provider.id);
  if (index >= 0) next[index] = cloneProvider(provider);
  else next.push(cloneProvider(provider));
  return next;
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
  const adapter = provider.purpose === "agent"
    ? getAgentProviderAdapter(provider)
    : getEmbeddingProviderAdapter(provider);
  const request = adapter.buildModelListRequest(provider, apiKey);
  const response = await fetchWithTimeout(request.url, request.init);
  if (!response.ok) {
    throw new Error(`Connection failed (${response.status}) ${await responseShortText(response)}`);
  }
  const payload = await responseJson(response);
  if (!payload) throw new Error(`Expected JSON from ${request.url} but received non-JSON response.`);
  const models = adapter.parseModelList(payload);
  return typeof options.limit === "number" ? models.slice(0, options.limit) : models;
}

async function testAgentProvider(provider: ModelProviderConfig, apiKey: string): Promise<void> {
  const adapter = getAgentProviderAdapter(provider);
  const request = adapter.buildConnectionTestRequest(provider, apiKey);
  const response = await fetchWithTimeout(request.url, request.init);
  if (response.ok) return;
  const text = await responseShortText(response);
  if (response.status === 401) throw new Error(`API key is invalid${text ? `: ${text}` : ""}`);
  throw new Error(`Agent request failed (${response.status}): ${text}`);
}

async function testEmbeddingProvider(provider: ModelProviderConfig, apiKey: string): Promise<number> {
  const model = provider.selectedModel.trim();
  if (!model) throw new Error("Embedding model is required before testing the provider.");
  const adapter = getEmbeddingProviderAdapter(provider);
  const request = adapter.buildEmbeddingRequest(provider, apiKey, ["test"]);
  const response = await fetchWithTimeout(request.url, request.init);
  if (!response.ok) {
    throw new Error(`Embedding request failed (${response.status}): ${await responseShortText(response)}`);
  }
  const payload = await responseJson(response);
  if (!payload) throw new Error("Embedding endpoint returned non-JSON response.");
  const vectors = adapter.parseEmbeddingResponse(payload);
  const embedding = vectors[0];
  if (!embedding) throw new Error("Embedding endpoint returned no vectors.");
  return embedding.length;
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function normalizeProviderDraftInput(input: unknown): ProviderDraftInput {
  const draft = input && typeof input === "object" ? input as Partial<ProviderDraftInput> : {};
  const purpose = draft.purpose === "agent" || draft.purpose === "embedding"
    ? draft.purpose
    : providerPurposeForKind(stringValue(draft.providerKind)) || (draft.protocol === "anthropic_messages" ? "agent" : "embedding");
  const providerKind = normalizeProviderKind(stringValue(draft.providerKind), purpose, stringValue(draft.protocol), stringValue(draft.baseUrl));
  return {
    id: stringValue(draft.id).trim() || undefined,
    purpose,
    providerKind,
    name: stringValue(draft.name).trim(),
    protocol: providerPreset(providerKind).protocol,
    baseUrl: stringValue(draft.baseUrl),
    apiKey: stringValue(draft.apiKey).trim(),
    clearApiKey: Boolean(draft.clearApiKey),
    authMode: normalizeProviderAuthMode(stringValue(draft.authMode), purpose, providerKind),
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
