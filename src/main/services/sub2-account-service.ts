import { safeStorage } from "electron";
import type {
  ModelProviderConfig,
  ProviderDraftInput,
  ProviderModel,
  ProviderPurpose,
  Sub2AccountStatus,
  Sub2ActivateOfficialProviderInput,
  Sub2APIKey,
  Sub2AuthInput,
  Sub2BillingRecord,
  Sub2BillingRecordsSummary,
  Sub2Group,
  Sub2Login2FAInput,
  Sub2OfficialProviderSyncResult,
  Sub2PaymentOrder,
  Sub2ProviderRef,
  Sub2RedeemCodeInput,
  Sub2RedeemCodeResult,
  Sub2RedeemHistoryItem,
  Sub2RefreshInput,
  Sub2Subscription,
  Sub2SyncOfficialProviderInput,
  Sub2TokenPair,
  Sub2UsageDashboardStats,
  Sub2UsageLog,
  Sub2UsageSummaryInput,
  Sub2UsageSummary,
  Sub2User,
} from "../../types/domain";
import { readJsonFileSafe, writeJsonFileAtomic } from "./safe-json-file";
import type { ProviderService } from "./provider-service";

const DEFAULT_SUB2_BASE_URL = process.env.BREVYN_SUB2_BASE_URL || "https://api.brevyn.org";
const OFFICIAL_KEY_PREFIX = "Brevyn Electron";
const SUB2_PROVIDER_PREFIX = "provider-sub2-official";
const OFFICIAL_OCR_MODEL_IDS = new Set(["brevyn-doc-parse"]);
const OFFICIAL_EMBEDDING_MODEL_IDS = new Set(["qwen3-embedding-8b"]);
const OFFICIAL_VISION_MODEL_IDS = new Set(["internvl3-78b"]);

interface Sub2AccountFile {
  version: 1;
  baseUrl: string;
  tokens?: EncryptedSub2Tokens;
  user?: Sub2User | null;
  groups?: Sub2Group[];
  apiKeys?: Sub2APIKey[];
  subscriptions?: Sub2Subscription[];
  usage?: Sub2UsageDashboardStats | null;
  currentGroupId?: number;
  providerRefs?: Sub2ProviderRef[];
  lastSyncedAt?: string;
  lastError?: string;
}

interface EncryptedSub2Tokens {
  accessTokenCiphertext: string;
  refreshTokenCiphertext?: string;
  tokenType: string;
  accessExpiresAt?: string;
  updatedAt: string;
}

interface Sub2AccountServiceOptions {
  defaultBaseUrl?: string;
  baseUrlEditable?: boolean;
}

interface Sub2AuthResultRaw {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  user?: unknown;
  requires_2fa?: unknown;
  temp_token?: unknown;
  user_email_masked?: unknown;
}

interface Sub2RefreshResultRaw {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

interface PaginatedResponse<T> {
  items?: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

interface Sub2ModelsResponse {
  data?: Array<{ id?: unknown; name?: unknown; display_name?: unknown; supports_vision?: unknown }>;
}

interface OfficialApiKeyHandle {
  apiKey: Sub2APIKey;
  secret: string;
}

interface OfficialModelBuckets {
  agent: ProviderModel[];
  embedding: ProviderModel[];
  vision: ProviderModel[];
  ocr: ProviderModel[];
}

interface OfficialProviderSyncBatch {
  providers: ModelProviderConfig[];
  syncedGroups: Sub2Group[];
  emptyGroups: Sub2Group[];
  errors: string[];
}

export class Sub2AccountService {
  private data: Sub2AccountFile;
  private refreshInFlight: Promise<string> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly providers: ProviderService,
    private readonly options: Sub2AccountServiceOptions = {},
  ) {
    this.data = this.load();
    this.migrateOfficialAgentProvidersToAnthropicMessages();
  }

  status(): Sub2AccountStatus {
    const authenticated = Boolean(this.data.user && this.readRefreshToken());
    const groups = markCurrentGroups(this.data.groups ?? [], this.currentGroupId());
    const currentGroup = this.currentGroupId() > 0
      ? groups.find((group) => group.id === this.currentGroupId()) ?? null
      : groups[0] ?? null;
    return {
      baseUrl: this.data.baseUrl,
      defaultBaseUrl: this.defaultBaseUrl(),
      baseUrlEditable: this.options.baseUrlEditable !== false,
      authenticated,
      user: this.data.user ?? null,
      currentGroup,
      groups,
      apiKeys: cloneApiKeys(this.data.apiKeys ?? []),
      subscriptions: cloneSubscriptions(this.data.subscriptions ?? []),
      usage: this.data.usage ? cloneUsageStats(this.data.usage) : null,
      providerRefs: cloneProviderRefs(this.data.providerRefs ?? []),
      lastSyncedAt: this.data.lastSyncedAt,
      lastError: authenticated ? this.data.lastError : "",
    };
  }

  async login(input: Sub2AuthInput): Promise<Sub2OfficialProviderSyncResult> {
    this.setBaseUrl(input.baseUrl);
    const result = await this.requestRaw<Sub2AuthResultRaw>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: stringValue(input.email).trim().toLowerCase(),
        password: stringValue(input.password),
      }),
    }, false);
    if (result.requires_2fa === true) {
      this.patchData({
        lastError: "需要输入两步验证码。",
        lastSyncedAt: new Date().toISOString(),
      });
      return {
        status: "locked",
        detail: "需要输入两步验证码。",
        sub2: {
          ...this.status(),
          requires2FA: true,
          pending2FAToken: stringValue(result.temp_token),
          pending2FAEmail: stringValue(result.user_email_masked),
        },
      };
    }
    this.saveAuthResult(result);
    const sub2 = await this.refresh({ reason: "login" });
    return this.bootstrapOfficialProvider("登录成功。", sub2);
  }

  async register(input: Sub2AuthInput): Promise<Sub2OfficialProviderSyncResult> {
    this.setBaseUrl(input.baseUrl);
    const result = await this.requestRaw<Sub2AuthResultRaw>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: stringValue(input.email).trim().toLowerCase(),
        password: stringValue(input.password),
        username: stringValue(input.displayName).trim() || undefined,
      }),
    }, false);
    this.saveAuthResult(result);
    const sub2 = await this.refresh({ reason: "register" });
    return this.bootstrapOfficialProvider("账号已创建。", sub2);
  }

  async login2FA(input: Sub2Login2FAInput): Promise<Sub2OfficialProviderSyncResult> {
    this.setBaseUrl(input.baseUrl);
    const result = await this.requestRaw<Sub2AuthResultRaw>("/api/v1/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({
        temp_token: stringValue(input.tempToken),
        code: stringValue(input.code),
      }),
    }, false);
    this.saveAuthResult(result);
    const sub2 = await this.refresh({ reason: "login_2fa" });
    return this.bootstrapOfficialProvider("登录成功。", sub2);
  }

  async refresh(input: Sub2RefreshInput = {}): Promise<Sub2AccountStatus> {
    this.requireRefreshToken();
    const userResult = await this.requestRaw<unknown>("/api/v1/auth/me");
    const [groupsResult, keysResult, subscriptionsResult, usageResult] = await Promise.all([
      this.requestRaw<unknown>("/api/v1/groups/available").catch((error: unknown) => ({ __error: error })),
      this.requestRaw<PaginatedResponse<unknown>>("/api/v1/keys?page=1&page_size=100").catch((error: unknown) => ({ __error: error })),
      this.requestRaw<unknown>("/api/v1/subscriptions/active").catch((error: unknown) => ({ __error: error })),
      this.requestRaw<unknown>("/api/v1/usage/dashboard/stats").catch((error: unknown) => ({ __error: error })),
    ]);
    const errors: string[] = [];
    const groups = hasRequestError(groupsResult) ? cloneGroups(this.data.groups ?? []) : normalizeGroups(groupsResult);
    if (hasRequestError(groupsResult)) errors.push(`分组刷新失败：${errorMessage(groupsResult.__error)}`);
    const apiKeys = hasRequestError(keysResult) ? cloneApiKeys(this.data.apiKeys ?? []) : normalizeApiKeys(keysResult.items ?? []);
    if (hasRequestError(keysResult)) errors.push(`API Key 刷新失败：${errorMessage(keysResult.__error)}`);
    const subscriptions = hasRequestError(subscriptionsResult) ? cloneSubscriptions(this.data.subscriptions ?? []) : normalizeSubscriptions(subscriptionsResult);
    if (hasRequestError(subscriptionsResult)) errors.push(`订阅刷新失败：${errorMessage(subscriptionsResult.__error)}`);
    const usage = hasRequestError(usageResult) ? this.data.usage ?? null : normalizeUsageStats(usageResult);
    if (hasRequestError(usageResult)) errors.push(`用量刷新失败：${errorMessage(usageResult.__error)}`);

    const currentGroupId = this.resolveCurrentGroupId(groups, subscriptions);
    this.patchData({
      user: normalizeUser(userResult),
      groups: markCurrentGroups(groups, currentGroupId),
      apiKeys,
      subscriptions,
      usage,
      currentGroupId,
      lastSyncedAt: new Date().toISOString(),
      lastError: errors.join("；"),
    });
    if (input.force) await this.syncAvailableOfficialProviders(errors);
    return this.status();
  }

  async syncOfficialProvider(input: Sub2SyncOfficialProviderInput = {}): Promise<Sub2OfficialProviderSyncResult> {
    this.requireRefreshToken();
    const groupId = positiveInteger(input.groupId);
    if (groupId <= 0) return this.syncAvailableOfficialProviders();
    const group = this.groupForId(groupId);
    if (!group) throw new Error("当前账号无权使用该官方模型分组。");
    const saved = await this.syncOfficialProviderForGroup(group);
    if (saved.length === 0) {
      return {
        status: "provisioning",
        detail: "这个分组暂时没有返回可用的官方模型配置。",
        sub2: this.status(),
      };
    }
    const activated = this.activateLocalOfficialProvidersForTargets(saved, this.preferredOfficialGroupsForProviders(saved));
    const groupProviders = this.providersForGroup(groupId);
    const hasAgentProvider = groupProviders.some((provider) => provider.purpose === "agent");
    this.patchData({
      currentGroupId: hasAgentProvider ? groupId : this.currentGroupId(),
      lastSyncedAt: new Date().toISOString(),
      lastError: "",
    });
    return {
      status: "synced",
      detail: officialProviderSyncDetail(group, groupId, groupProviders),
      provider: activated.find((provider) => provider.purpose === "agent") ?? groupProviders[0],
      providers: groupProviders,
      sub2: this.status(),
    };
  }

  async activateOfficialProvider(input: Sub2ActivateOfficialProviderInput): Promise<Sub2OfficialProviderSyncResult> {
    const groupId = positiveInteger(input.groupId);
    if (groupId <= 0) throw new Error("请选择要使用的官方模型分组。");
    try {
      return await this.syncOfficialProvider({ groupId });
    } catch (error) {
      const cached = this.providersForGroup(groupId);
      if (cached.length === 0) throw error;
      const activated = this.activateLocalOfficialProviders(groupId);
      const hasAgentProvider = activated.some((provider) => provider.purpose === "agent");
      this.patchData({
        currentGroupId: hasAgentProvider ? groupId : this.currentGroupId(),
        lastSyncedAt: new Date().toISOString(),
        lastError: `官方模型刷新失败，已使用本地缓存：${errorMessage(error)}`,
      });
      return {
        status: "synced",
        detail: `官方模型刷新失败，已使用本地缓存：${errorMessage(error)}`,
        provider: activated.find((provider) => provider.purpose === "agent") ?? activated[0],
        providers: activated,
        sub2: this.status(),
      };
    }
  }

  async redeemCode(input: Sub2RedeemCodeInput): Promise<Sub2RedeemCodeResult> {
    this.requireRefreshToken();
    const code = stringValue(input.code).trim();
    if (!code) throw new Error("请输入兑换码。");
    const redeemed = await this.requestRaw<Record<string, unknown>>("/api/v1/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    let sub2 = await this.refresh({ reason: "redeem" });
    let sync: Sub2OfficialProviderSyncResult | undefined;
    try {
      sync = await this.syncAvailableOfficialProviders();
      sub2 = sync.sub2;
    } catch (error) {
      return {
        status: "ok",
        message: stringValue(redeemed.message) || "兑换成功。",
        type: stringValue(redeemed.type),
        value: numberValue(redeemed.value, 0),
        newBalance: optionalNumber(redeemed.new_balance),
        newConcurrency: optionalNumber(redeemed.new_concurrency),
        sub2,
        providerSyncStatus: "failed",
        providerSyncDetail: `官方模型同步失败：${errorMessage(error)}`,
      };
    }
    return {
      status: "ok",
      message: stringValue(redeemed.message) || "兑换成功。",
      type: stringValue(redeemed.type),
      value: numberValue(redeemed.value, 0),
      newBalance: optionalNumber(redeemed.new_balance),
      newConcurrency: optionalNumber(redeemed.new_concurrency),
      sub2,
      provider: sync.provider,
      providers: sync.providers,
      providerSyncStatus: sync.status === "synced" ? "synced" : "provisioning",
      providerSyncDetail: sync.detail,
    };
  }

  async usageSummary(input: Sub2UsageSummaryInput = {}): Promise<Sub2UsageSummary> {
    this.requireRefreshToken();
    const page = clampPositiveInteger(input.page, 1, 100_000, 1);
    const pageSize = clampPositiveInteger(input.pageSize, 5, 100, 20);
    const usageParams = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort_by: "created_at",
      sort_order: "desc",
    });
    const [statsResult, logsResult] = await Promise.all([
      this.requestRaw<unknown>("/api/v1/usage/dashboard/stats").catch((error: unknown) => ({ __error: error })),
      this.requestRaw<PaginatedResponse<unknown>>(`/api/v1/usage?${usageParams.toString()}`).catch((error: unknown) => ({ __error: error })),
    ]);
    const stats = hasRequestError(statsResult) ? this.data.usage ?? null : normalizeUsageStats(statsResult);
    const records = hasRequestError(logsResult) ? [] : normalizeUsageLogs(logsResult.items ?? []);
    const pagination = hasRequestError(logsResult) ? {
      page,
      pageSize,
      total: 0,
      pages: 0,
    } : normalizePagination(logsResult, page, pageSize, records.length);
    const errors = [hasRequestError(statsResult) ? errorMessage(statsResult.__error) : "", hasRequestError(logsResult) ? errorMessage(logsResult.__error) : ""].filter(Boolean);
    this.patchData({
      usage: stats,
      lastSyncedAt: new Date().toISOString(),
      lastError: errors.join("；"),
    });
    return {
      stats,
      records,
      pagination,
      updatedAt: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async billingRecords(): Promise<Sub2BillingRecordsSummary> {
    this.requireRefreshToken();
    const [ordersResult, redeemResult] = await Promise.all([
      this.requestRaw<PaginatedResponse<unknown>>("/api/v1/payment/orders/my?page=1&page_size=50").catch((error: unknown) => ({ __error: error })),
      this.requestRaw<unknown>("/api/v1/redeem/history").catch((error: unknown) => ({ __error: error })),
    ]);
    const orders = hasRequestError(ordersResult) ? [] : normalizePaymentOrders(ordersResult.items ?? []);
    const redeemHistory = hasRequestError(redeemResult) ? [] : normalizeRedeemHistory(redeemResult);
    const errors = [
      hasRequestError(ordersResult) ? `充值订单读取失败：${errorMessage(ordersResult.__error)}` : "",
      hasRequestError(redeemResult) ? `兑换记录读取失败：${errorMessage(redeemResult.__error)}` : "",
    ].filter(Boolean);
    this.patchData({
      lastSyncedAt: new Date().toISOString(),
      lastError: errors.join("；"),
    });
    return {
      orders,
      redeemHistory,
      records: normalizeBillingRecords(orders, redeemHistory),
      updatedAt: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async logout(): Promise<Sub2AccountStatus> {
    const refreshToken = this.readRefreshToken();
    if (refreshToken) {
      try {
        await this.requestRaw("/api/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        }, false);
      } catch {
        // Local logout should still succeed when sub2 is unavailable.
      }
    }
    for (const ref of this.data.providerRefs ?? []) {
      this.providers.delete(ref.providerId);
    }
    this.data = {
      version: 1,
      baseUrl: this.accountBaseUrl(this.data.baseUrl),
      user: null,
      groups: [],
      apiKeys: [],
      subscriptions: [],
      usage: null,
      currentGroupId: 0,
      providerRefs: [],
      lastSyncedAt: new Date().toISOString(),
      lastError: "",
    };
    this.write();
    return this.status();
  }

  private async bootstrapOfficialProvider(baseDetail: string, fallbackSub2: Sub2AccountStatus): Promise<Sub2OfficialProviderSyncResult> {
    void fallbackSub2;
    try {
      const synced = await this.syncAvailableOfficialProviders();
      return {
        ...synced,
        detail: [baseDetail, synced.detail].filter(Boolean).join("；"),
      };
    } catch (error) {
      return {
        status: "provisioning",
        detail: `${baseDetail} 官方模型暂未同步：${errorMessage(error)}`,
        sub2: this.status(),
      };
    }
  }

  private async syncAvailableOfficialProviders(baseErrors: string[] = []): Promise<Sub2OfficialProviderSyncResult> {
    const groups = this.syncableOfficialGroups();
    if (groups.length === 0) {
      const lastError = baseErrors.join("；");
      this.patchData({
        lastSyncedAt: new Date().toISOString(),
        lastError,
      });
      return {
        status: "locked",
        detail: "当前账号还没有可用的官方模型分组。",
        sub2: this.status(),
      };
    }

    const batch = await this.syncOfficialProviderBatch(groups);
    const activated = batch.providers.length > 0
      ? this.activateLocalOfficialProvidersForTargets(batch.providers, this.preferredOfficialGroupsForProviders(batch.providers))
      : [];
    const activeAgentProvider = activated.find((provider) => provider.purpose === "agent")
      ?? this.providers.list().find((provider) => provider.enabled && provider.purpose === "agent" && isSub2ProviderId(provider.id));
    const syncErrorDetail = batch.errors.length > 0 ? `部分官方模型同步失败：${batch.errors.join("；")}` : "";
    this.patchData({
      currentGroupId: activeAgentProvider ? providerGroupId(activeAgentProvider.id) : this.currentGroupId(),
      lastSyncedAt: new Date().toISOString(),
      lastError: [...baseErrors, syncErrorDetail].filter(Boolean).join("；"),
    });

    if (batch.providers.length === 0) {
      return {
        status: "provisioning",
        detail: batch.errors.length > 0
          ? `官方模型暂未同步：${batch.errors.join("；")}`
          : "官方模型正在准备中，暂未返回可用模型。",
        sub2: this.status(),
      };
    }

    const providers = activated.length > 0 ? activated : batch.providers;
    return {
      status: "synced",
      detail: officialProviderBatchSyncDetail(batch),
      provider: providers.find((provider) => provider.purpose === "agent") ?? providers[0],
      providers,
      sub2: this.status(),
    };
  }

  private async syncOfficialProviderBatch(groups: Sub2Group[]): Promise<OfficialProviderSyncBatch> {
    const batch: OfficialProviderSyncBatch = {
      providers: [],
      syncedGroups: [],
      emptyGroups: [],
      errors: [],
    };
    const seenProviderIds = new Set<string>();
    for (const group of groups) {
      try {
        const providers = await this.syncOfficialProviderForGroup(group);
        if (providers.length === 0) {
          batch.emptyGroups.push(group);
          continue;
        }
        batch.syncedGroups.push(group);
        for (const provider of providers) {
          if (seenProviderIds.has(provider.id)) continue;
          seenProviderIds.add(provider.id);
          batch.providers.push(provider);
        }
      } catch (error) {
        batch.errors.push(`${group.name || `分组 ${group.id}`}：${errorMessage(error)}`);
      }
    }
    return batch;
  }

  private async syncOfficialProviderForGroup(group: Sub2Group): Promise<ModelProviderConfig[]> {
    const groupId = positiveInteger(group.id);
    if (groupId <= 0) return [];
    const apiKeyHandle = await this.ensureOfficialApiKey(groupId);
    const models = await this.fetchGatewayModels(apiKeyHandle.secret);
    if (models.length === 0) return [];
    const buckets = splitOfficialModels(models);
    const saved = this.saveOfficialProviders(group, apiKeyHandle, buckets);
    if (saved.length === 0) return [];
    this.removeStaleOfficialProviders(groupId, saved);
    const syncedAt = new Date().toISOString();
    for (const provider of saved) {
      this.upsertProviderRef({
        providerId: provider.id,
        purpose: provider.purpose,
        groupId,
        groupName: group.name,
        selectedModel: provider.selectedModel,
        modelCount: provider.models.filter((model) => model.enabled !== false).length,
        syncedAt,
      });
    }
    return saved;
  }

  private syncableOfficialGroups(): Sub2Group[] {
    const seen = new Set<number>();
    const groups: Sub2Group[] = [];
    for (const group of this.data.groups ?? []) {
      const groupId = positiveInteger(group.id);
      if (groupId <= 0 || seen.has(groupId)) continue;
      if (stringValue(group.status).toLowerCase() === "inactive") continue;
      seen.add(groupId);
      groups.push({ ...group, id: groupId });
    }
    return groups;
  }

  private async ensureOfficialApiKey(groupId: number): Promise<OfficialApiKeyHandle> {
    const providerSecret = this.officialProviderSecretForGroup(groupId);
    const existing = (this.data.apiKeys ?? []).find((key) =>
      key.groupId === groupId &&
      key.status === "active" &&
      key.name.startsWith(OFFICIAL_KEY_PREFIX),
    );
    if (existing && providerSecret) return { apiKey: existing, secret: providerSecret };
    if (existing?.key) return { apiKey: existing, secret: existing.key };

    const createdRaw = await this.requestRaw<unknown>("/api/v1/keys", {
      method: "POST",
      body: JSON.stringify({
        name: `${OFFICIAL_KEY_PREFIX} ${new Date().toISOString().slice(0, 10)}`,
        group_id: groupId,
      }),
    });
    const created = normalizeApiKey(createdRaw);
    if (!created.key) throw new Error("sub2 已创建 API Key，但没有返回明文 key。请删除该 key 后重试。");
    const apiKeys = [...(this.data.apiKeys ?? []).filter((key) => key.id !== created.id), created];
    this.patchData({ apiKeys });
    return { apiKey: created, secret: created.key };
  }

  private officialProviderSecretForGroup(groupId: number): string {
    const purposes: ProviderPurpose[] = ["agent", "embedding", "vision", "ocr"];
    for (const purpose of purposes) {
      const secret = this.providers.apiKey(providerId(groupId, purpose));
      if (secret) return secret;
    }
    return "";
  }

  private async fetchGatewayModels(apiKey: string): Promise<ProviderModel[]> {
    if (!apiKey) throw new Error("缺少 sub2 API Key。");
    const response = await sub2Fetch(this.url("/v1/models"), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw await sub2RequestError(response);
    const payload = await response.json() as Sub2ModelsResponse;
    return normalizeGatewayModels(payload);
  }

  private saveOfficialProviders(group: Sub2Group, apiKeyHandle: OfficialApiKeyHandle, buckets: OfficialModelBuckets): ModelProviderConfig[] {
    const saved: ModelProviderConfig[] = [];
    if (buckets.agent.length > 0) saved.push(this.saveAgentProvider(group, apiKeyHandle, buckets.agent));
    if (buckets.embedding.length > 0) saved.push(this.saveEmbeddingProvider(group, apiKeyHandle, buckets.embedding));
    if (buckets.vision.length > 0) saved.push(this.saveVisionProvider(group, apiKeyHandle, buckets.vision));
    if (buckets.ocr.length > 0) saved.push(this.saveOcrProvider(group, apiKeyHandle, buckets.ocr));
    return saved;
  }

  private saveAgentProvider(group: Sub2Group, apiKeyHandle: OfficialApiKeyHandle, models: ProviderModel[]): ModelProviderConfig {
    const id = providerId(group.id, "agent");
    const existing = this.providers.list().find((provider) => provider.id === id);
    const selectedModel = selectedEnabledModel(existing?.selectedModel || "", models);
    const draft: ProviderDraftInput = {
      id,
      purpose: "agent",
      providerKind: "custom-anthropic",
      name: `官方模型 · ${group.name || `分组 ${group.id}`}`,
      protocol: "anthropic_messages",
      baseUrl: this.url("/v1"),
      apiKey: apiKeyHandle.secret,
      clearApiKey: false,
      authMode: "api_key",
      models,
      selectedModel,
      enabled: true,
    };
    return this.providers.save(draft).provider;
  }

  private saveEmbeddingProvider(group: Sub2Group, apiKeyHandle: OfficialApiKeyHandle, models: ProviderModel[]): ModelProviderConfig {
    const id = providerId(group.id, "embedding");
    const existing = this.providers.list().find((provider) => provider.id === id);
    const selectedModel = selectedEnabledModel(existing?.selectedModel || "", models);
    const draft: ProviderDraftInput = {
      id,
      purpose: "embedding",
      providerKind: "custom-openai",
      name: `官方 Embedding · ${group.name || `分组 ${group.id}`}`,
      protocol: "openai_compatible",
      baseUrl: this.url("/v1"),
      apiKey: apiKeyHandle.secret,
      clearApiKey: false,
      authMode: "bearer",
      models,
      selectedModel,
      enabled: true,
    };
    return this.providers.save(draft).provider;
  }

  private saveVisionProvider(group: Sub2Group, apiKeyHandle: OfficialApiKeyHandle, models: ProviderModel[]): ModelProviderConfig {
    const id = providerId(group.id, "vision");
    const existing = this.providers.list().find((provider) => provider.id === id);
    const selectedModel = selectedEnabledModel(existing?.selectedModel || "", models);
    const draft: ProviderDraftInput = {
      id,
      purpose: "vision",
      providerKind: "vision-custom-openai-responses",
      name: `官方 Vision · ${group.name || `分组 ${group.id}`}`,
      protocol: "openai_responses",
      baseUrl: this.url("/v1"),
      apiKey: apiKeyHandle.secret,
      clearApiKey: false,
      authMode: "bearer",
      models,
      selectedModel,
      enabled: true,
    };
    return this.providers.save(draft).provider;
  }

  private saveOcrProvider(group: Sub2Group, apiKeyHandle: OfficialApiKeyHandle, models: ProviderModel[]): ModelProviderConfig {
    const id = providerId(group.id, "ocr");
    const existing = this.providers.list().find((provider) => provider.id === id);
    const selectedModel = selectedEnabledModel(existing?.selectedModel || "", models);
    const draft: ProviderDraftInput = {
      id,
      purpose: "ocr",
      providerKind: "ocr-openai-responses",
      name: `官方 OCR · ${group.name || `分组 ${group.id}`}`,
      protocol: "openai_responses",
      baseUrl: this.url("/v1"),
      apiKey: apiKeyHandle.secret,
      clearApiKey: false,
      authMode: "bearer",
      models,
      selectedModel,
      enabled: true,
    };
    return this.providers.save(draft).provider;
  }

  private activateLocalOfficialProviders(groupId: number): ModelProviderConfig[] {
    const target = this.providersForGroup(groupId);
    if (target.length === 0) throw new Error(`本地官方模型配置不存在：${groupId}`);
    return this.activateLocalOfficialProvidersForTargets(target, this.preferredOfficialGroupsForProviders(target));
  }

  private activateLocalOfficialProvidersForTargets(target: ModelProviderConfig[], preferredGroups: Map<ProviderPurpose, number>): ModelProviderConfig[] {
    const officialActivePurposes = new Set(target.map((provider) => provider.purpose));
    const activeProviderIds = new Set(target
      .filter((provider) => preferredGroups.get(provider.purpose) === providerGroupId(provider.id))
      .map((provider) => provider.id));
    const activated: ModelProviderConfig[] = [];
    for (const provider of this.providers.list()) {
      if (!officialActivePurposes.has(provider.purpose)) continue;
      const isSub2Provider = isSub2ProviderId(provider.id);
      const enabled = isSub2Provider
        ? activeProviderIds.has(provider.id)
        : provider.purpose === "agent"
          ? provider.enabled
          : false;
      if (enabled === provider.enabled) {
        if (isSub2Provider && enabled) activated.push(provider);
        continue;
      }
      const saved = this.providers.save(providerToDraft(provider, { enabled })).provider;
      if (isSub2Provider && enabled) activated.push(saved);
    }
    return activated;
  }

  private preferredOfficialGroupsForProviders(providers: ModelProviderConfig[]): Map<ProviderPurpose, number> {
    const byPurpose = new Map<ProviderPurpose, number[]>();
    for (const provider of providers) {
      const groupId = providerGroupId(provider.id);
      if (groupId <= 0) continue;
      const groups = byPurpose.get(provider.purpose) ?? [];
      if (!groups.includes(groupId)) groups.push(groupId);
      byPurpose.set(provider.purpose, groups);
    }
    const preferred = new Map<ProviderPurpose, number>();
    for (const [purpose, groupIds] of byPurpose) {
      const activeGroupId = this.activeProviderGroupIdForPurpose(purpose);
      const currentGroupId = purpose === "agent" ? this.currentGroupId() : 0;
      preferred.set(
        purpose,
        groupIds.find((groupId) => groupId === currentGroupId)
          ?? groupIds.find((groupId) => groupId === activeGroupId)
          ?? groupIds[0],
      );
    }
    return preferred;
  }

  private activeProviderGroupIdForPurpose(purpose: ProviderPurpose): number {
    const provider = this.providers.list().find((item) => item.enabled && item.purpose === purpose && isSub2ProviderId(item.id));
    return provider ? providerGroupId(provider.id) : 0;
  }

  private removeStaleOfficialProviders(groupId: number, saved: ModelProviderConfig[]): void {
    const savedIds = new Set(saved.map((provider) => provider.id));
    for (const provider of this.providersForGroup(groupId)) {
      if (savedIds.has(provider.id)) continue;
      this.providers.delete(provider.id);
    }
    const refs = cloneProviderRefs(this.data.providerRefs ?? [])
      .filter((ref) => ref.groupId !== groupId || savedIds.has(ref.providerId));
    this.patchData({ providerRefs: refs });
  }

  private providersForGroup(groupId: number): ModelProviderConfig[] {
    return this.providers.list().filter((provider) => isSub2ProviderId(provider.id) && providerGroupId(provider.id) === groupId);
  }

  private migrateOfficialAgentProvidersToAnthropicMessages(): void {
    for (const provider of this.providers.list()) {
      if (!isSub2ProviderId(provider.id) || provider.purpose !== "agent") continue;
      if (provider.protocol !== "openai_responses" && provider.providerKind !== "openai-responses-agent") continue;
      this.providers.save(providerToDraft(provider, {
        providerKind: "custom-anthropic",
        protocol: "anthropic_messages",
        authMode: "api_key",
        baseUrl: provider.baseUrl || this.url("/v1"),
      }));
    }
  }

  private upsertProviderRef(ref: Sub2ProviderRef): void {
    const refs = cloneProviderRefs(this.data.providerRefs ?? []);
    const index = refs.findIndex((item) =>
      item.providerId === ref.providerId ||
      (item.groupId === ref.groupId && item.purpose === ref.purpose && Boolean(ref.purpose)),
    );
    if (index >= 0) refs[index] = ref;
    else refs.push(ref);
    this.patchData({ providerRefs: refs });
  }

  private async requestRaw<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body !== undefined) headers.set("Content-Type", "application/json");
    if (!headers.has("Accept-Language")) headers.set("Accept-Language", "zh-CN");
    const accessToken = auth ? this.readAccessToken() : "";
    if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    let response = await sub2Fetch(this.url(path), { ...init, headers });
    if (response.status === 401 && auth && this.readRefreshToken()) {
      const token = await this.refreshTokensOnce();
      headers.set("Authorization", `Bearer ${token}`);
      response = await sub2Fetch(this.url(path), { ...init, headers });
    }
    if (!response.ok) throw await sub2RequestError(response);
    if (response.status === 204) return undefined as T;
    const payload = await response.json();
    return unwrapSub2Response<T>(payload);
  }

  private refreshTokensOnce(): Promise<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshTokens().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async refreshTokens(): Promise<string> {
    const refreshToken = this.requireRefreshToken();
    const response = await sub2Fetch(this.url("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      this.clearTokens();
      throw await sub2RequestError(response);
    }
    const result = unwrapSub2Response<Sub2RefreshResultRaw>(await response.json());
    const accessToken = stringValue(result.access_token);
    if (!accessToken) throw new Error("sub2 token refresh response is missing access_token.");
    this.saveTokens({
      accessToken,
      refreshToken: stringValue(result.refresh_token) || refreshToken,
      tokenType: stringValue(result.token_type) || "Bearer",
      expiresIn: optionalNumber(result.expires_in),
    });
    return accessToken;
  }

  private saveAuthResult(result: Sub2AuthResultRaw): void {
    const accessToken = stringValue(result.access_token);
    if (!accessToken) throw new Error("sub2 登录响应缺少 access_token。");
    this.saveTokens({
      accessToken,
      refreshToken: stringValue(result.refresh_token),
      tokenType: stringValue(result.token_type) || "Bearer",
      expiresIn: optionalNumber(result.expires_in),
    });
    this.patchData({
      user: normalizeUser(result.user),
      lastError: "",
    });
  }

  private saveTokens(tokens: Sub2TokenPair): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用，无法保存 sub2 登录态。");
    }
    const now = new Date();
    this.patchData({
      tokens: {
        accessTokenCiphertext: encrypt(tokens.accessToken),
        refreshTokenCiphertext: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
        tokenType: tokens.tokenType || "Bearer",
        accessExpiresAt: tokens.expiresIn ? new Date(now.getTime() + Math.max(0, tokens.expiresIn) * 1000).toISOString() : undefined,
        updatedAt: now.toISOString(),
      },
    });
  }

  private clearTokens(): void {
    this.patchData({ tokens: undefined });
  }

  private readAccessToken(): string {
    return this.decrypt(this.data.tokens?.accessTokenCiphertext);
  }

  private readRefreshToken(): string {
    return this.decrypt(this.data.tokens?.refreshTokenCiphertext);
  }

  private requireRefreshToken(): string {
    const token = this.readRefreshToken();
    if (!token) throw new Error("请先登录 Brevyn 官方账号。");
    return token;
  }

  private currentGroupId(): number {
    return this.activeProviderGroupId()
      || positiveInteger(this.data.currentGroupId)
      || positiveInteger((this.data.groups ?? []).find((group) => group.isCurrent)?.id)
      || positiveInteger((this.data.groups ?? [])[0]?.id);
  }

  private activeProviderGroupId(): number {
    const provider = this.providers.list().find((item) => item.enabled && item.purpose === "agent" && isSub2ProviderId(item.id));
    return provider ? providerGroupId(provider.id) : 0;
  }

  private resolveCurrentGroupId(groups: Sub2Group[], subscriptions: Sub2Subscription[] = this.data.subscriptions ?? []): number {
    const activeId = this.activeProviderGroupId();
    if (activeId > 0 && groups.some((group) => group.id === activeId)) return activeId;
    const previousId = positiveInteger(this.data.currentGroupId);
    if (previousId > 0 && groups.some((group) => group.id === previousId)) return previousId;
    const subscriptionGroupId = positiveInteger(subscriptions.find((item) => item.status === "active")?.groupId);
    if (subscriptionGroupId > 0 && groups.some((group) => group.id === subscriptionGroupId)) return subscriptionGroupId;
    return positiveInteger(groups[0]?.id);
  }

  private groupForId(groupId: number): Sub2Group | undefined {
    return (this.data.groups ?? []).find((group) => group.id === groupId);
  }

  private setBaseUrl(baseUrl: string | undefined): void {
    const normalized = this.accountBaseUrl(baseUrl || this.data.baseUrl);
    if (normalized !== this.data.baseUrl) this.patchData({ baseUrl: normalized });
  }

  private accountBaseUrl(value?: string): string {
    if (this.options.baseUrlEditable === false) return normalizeBaseUrl(this.defaultBaseUrl(), this.defaultBaseUrl());
    return normalizeBaseUrl(value || this.defaultBaseUrl(), this.defaultBaseUrl());
  }

  private defaultBaseUrl(): string {
    return normalizeBaseUrl(this.options.defaultBaseUrl || DEFAULT_SUB2_BASE_URL, DEFAULT_SUB2_BASE_URL);
  }

  private patchData(patch: Partial<Sub2AccountFile>): void {
    this.data = {
      ...this.data,
      ...patch,
      version: 1,
      baseUrl: patch.baseUrl ?? this.data.baseUrl ?? this.defaultBaseUrl(),
    };
    this.write();
  }

  private load(): Sub2AccountFile {
    const parsed = readJsonFileSafe<Partial<Sub2AccountFile>>(this.filePath);
    return {
      version: 1,
      baseUrl: this.accountBaseUrl(parsed?.baseUrl),
      tokens: normalizeEncryptedTokens(parsed?.tokens),
      user: parsed?.user ? normalizeUser(parsed.user) : null,
      groups: cloneGroups(parsed?.groups ?? []),
      apiKeys: cloneApiKeys(parsed?.apiKeys ?? []),
      subscriptions: cloneSubscriptions(parsed?.subscriptions ?? []),
      usage: parsed?.usage ? cloneUsageStats(parsed.usage) : null,
      currentGroupId: positiveInteger(parsed?.currentGroupId),
      providerRefs: cloneProviderRefs(parsed?.providerRefs ?? []),
      lastSyncedAt: stringValue(parsed?.lastSyncedAt),
      lastError: stringValue(parsed?.lastError),
    };
  }

  private write(): void {
    writeJsonFileAtomic(this.filePath, this.data);
  }

  private url(path: string): string {
    return new URL(path, `${this.data.baseUrl.replace(/\/+$/, "")}/`).toString();
  }

  private decrypt(ciphertext: string | undefined): string {
    if (!ciphertext || !safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
    } catch {
      return "";
    }
  }
}

function encrypt(value: string): string {
  return safeStorage.encryptString(value).toString("base64");
}

function unwrapSub2Response<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "code" in payload) {
    const item = payload as { code?: unknown; message?: unknown; data?: unknown };
    if (Number(item.code) === 0) return item.data as T;
    throw new Error(stringValue(item.message) || "sub2 请求失败。");
  }
  return payload as T;
}

async function sub2RequestError(response: Response): Promise<Error> {
  let message = `${response.status} ${response.statusText}`;
  let code = response.statusText || "request_failed";
  try {
    const payload = await response.json() as Record<string, unknown>;
    if ("code" in payload && Number(payload.code) !== 0) {
      code = stringValue(payload.code) || code;
      message = stringValue(payload.message) || message;
    } else if (payload.error && typeof payload.error === "object") {
      const nested = payload.error as Record<string, unknown>;
      code = stringValue(nested.code || nested.type) || code;
      message = stringValue(nested.message) || message;
    } else {
      message = stringValue(payload.message || payload.detail || payload.error) || message;
    }
  } catch {
    // Keep HTTP status fallback.
  }
  const error = new Error(friendlySub2ErrorMessage(code, message));
  error.name = code;
  return error;
}

function friendlySub2ErrorMessage(code: string, message: string): string {
  const normalized = code.toLowerCase();
  if (normalized.includes("unauthorized") || normalized.includes("invalid_token") || normalized.includes("token")) return "登录状态已过期，请重新登录。";
  if (normalized.includes("forbidden")) return "当前账号无权访问这个资源。";
  if (normalized.includes("not_found")) return "请求的资源不存在。";
  return message || "sub2 请求失败。";
}

async function sub2Fetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const wrapped = new Error(`sub2_network_error: 无法连接 Brevyn 官方服务，请检查网络或服务地址后重试。`);
    wrapped.name = "sub2_network_error";
    wrapped.cause = error;
    throw wrapped;
  }
}

function normalizeEncryptedTokens(value: unknown): EncryptedSub2Tokens | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<EncryptedSub2Tokens>;
  const accessTokenCiphertext = stringValue(item.accessTokenCiphertext);
  if (!accessTokenCiphertext) return undefined;
  return {
    accessTokenCiphertext,
    refreshTokenCiphertext: stringValue(item.refreshTokenCiphertext) || undefined,
    tokenType: stringValue(item.tokenType) || "Bearer",
    accessExpiresAt: stringValue(item.accessExpiresAt) || undefined,
    updatedAt: stringValue(item.updatedAt),
  };
}

function normalizeUser(raw: unknown): Sub2User {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    id: positiveInteger(item.id),
    username: stringValue(item.username),
    email: stringValue(item.email),
    role: stringValue(item.role),
    balance: numberValue(item.balance, 0),
    concurrency: numberValue(item.concurrency, 0),
    rpmLimit: optionalNumber(item.rpm_limit ?? item.rpmLimit),
    status: stringValue(item.status),
    allowedGroups: Array.isArray(item.allowed_groups)
      ? item.allowed_groups.flatMap((value) => positiveInteger(value) > 0 ? [positiveInteger(value)] : [])
      : null,
    createdAt: stringValue(item.created_at ?? item.createdAt),
    updatedAt: stringValue(item.updated_at ?? item.updatedAt),
  };
}

function normalizeGroups(raw: unknown): Sub2Group[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const group = normalizeGroup(value);
    return group.id > 0 ? [group] : [];
  });
}

function normalizeGroup(raw: unknown): Sub2Group {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    id: positiveInteger(item.id),
    name: stringValue(item.name) || `分组 ${positiveInteger(item.id)}`,
    description: stringValue(item.description) || null,
    platform: stringValue(item.platform),
    rateMultiplier: numberValue(item.rate_multiplier ?? item.rateMultiplier, 1),
    rpmLimit: optionalNumber(item.rpm_limit ?? item.rpmLimit),
    isExclusive: Boolean(item.is_exclusive ?? item.isExclusive),
    status: stringValue(item.status) || "active",
    subscriptionType: stringValue(item.subscription_type ?? item.subscriptionType) || "standard",
    dailyLimitUsd: optionalNumber(item.daily_limit_usd ?? item.dailyLimitUsd),
    weeklyLimitUsd: optionalNumber(item.weekly_limit_usd ?? item.weeklyLimitUsd),
    monthlyLimitUsd: optionalNumber(item.monthly_limit_usd ?? item.monthlyLimitUsd),
    allowImageGeneration: Boolean(item.allow_image_generation ?? item.allowImageGeneration),
    claudeCodeOnly: Boolean(item.claude_code_only ?? item.claudeCodeOnly),
    allowMessagesDispatch: Boolean(item.allow_messages_dispatch ?? item.allowMessagesDispatch),
    requireOauthOnly: Boolean(item.require_oauth_only ?? item.requireOauthOnly),
    isCurrent: Boolean(item.isCurrent),
    createdAt: stringValue(item.created_at ?? item.createdAt),
    updatedAt: stringValue(item.updated_at ?? item.updatedAt),
  };
}

function normalizeApiKeys(raw: unknown): Sub2APIKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const key = normalizeApiKey(value);
    return key.id > 0 ? [key] : [];
  });
}

function normalizeApiKey(raw: unknown): Sub2APIKey {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const group = item.group ? normalizeGroup(item.group) : undefined;
  return {
    id: positiveInteger(item.id),
    key: stringValue(item.key) || undefined,
    name: stringValue(item.name),
    groupId: item.group_id === null || item.groupId === null ? null : positiveInteger(item.group_id ?? item.groupId) || null,
    status: stringValue(item.status) || "active",
    quota: numberValue(item.quota, 0),
    quotaUsed: numberValue(item.quota_used ?? item.quotaUsed, 0),
    lastUsedAt: stringValue(item.last_used_at ?? item.lastUsedAt) || null,
    expiresAt: stringValue(item.expires_at ?? item.expiresAt) || null,
    createdAt: stringValue(item.created_at ?? item.createdAt),
    updatedAt: stringValue(item.updated_at ?? item.updatedAt),
    group: group && group.id > 0 ? group : undefined,
  };
}

function normalizeSubscriptions(raw: unknown): Sub2Subscription[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const group = item.group ? normalizeGroup(item.group) : undefined;
    const subscription: Sub2Subscription = {
      id: positiveInteger(item.id),
      groupId: positiveInteger(item.group_id ?? item.groupId),
      status: stringValue(item.status),
      startsAt: stringValue(item.starts_at ?? item.startsAt),
      expiresAt: stringValue(item.expires_at ?? item.expiresAt) || null,
      dailyUsageUsd: numberValue(item.daily_usage_usd ?? item.dailyUsageUsd, 0),
      weeklyUsageUsd: numberValue(item.weekly_usage_usd ?? item.weeklyUsageUsd, 0),
      monthlyUsageUsd: numberValue(item.monthly_usage_usd ?? item.monthlyUsageUsd, 0),
      group: group && group.id > 0 ? group : undefined,
    };
    return subscription.id > 0 ? [subscription] : [];
  });
}

function normalizeUsageStats(raw: unknown): Sub2UsageDashboardStats {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const totalInputTokens = numberValue(item.total_input_tokens ?? item.totalInputTokens, 0);
  const totalOutputTokens = numberValue(item.total_output_tokens ?? item.totalOutputTokens, 0);
  const totalCacheCreationTokens = numberValue(item.total_cache_creation_tokens ?? item.totalCacheCreationTokens, 0);
  const totalCacheReadTokens = numberValue(item.total_cache_read_tokens ?? item.totalCacheReadTokens, 0);
  const todayInputTokens = numberValue(item.today_input_tokens ?? item.todayInputTokens, 0);
  const todayOutputTokens = numberValue(item.today_output_tokens ?? item.todayOutputTokens, 0);
  const todayCacheCreationTokens = numberValue(item.today_cache_creation_tokens ?? item.todayCacheCreationTokens, 0);
  const todayCacheReadTokens = numberValue(item.today_cache_read_tokens ?? item.todayCacheReadTokens, 0);
  return {
    totalApiKeys: numberValue(item.total_api_keys ?? item.totalApiKeys, 0),
    activeApiKeys: numberValue(item.active_api_keys ?? item.activeApiKeys, 0),
    totalRequests: numberValue(item.total_requests ?? item.totalRequests, 0),
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens: numberValue(item.total_tokens ?? item.totalTokens, totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens),
    totalCost: numberValue(item.total_cost ?? item.totalCost, 0),
    totalActualCost: numberValue(item.total_actual_cost ?? item.totalActualCost, 0),
    todayRequests: numberValue(item.today_requests ?? item.todayRequests, 0),
    todayInputTokens,
    todayOutputTokens,
    todayCacheCreationTokens,
    todayCacheReadTokens,
    todayTokens: numberValue(item.today_tokens ?? item.todayTokens, todayInputTokens + todayOutputTokens + todayCacheCreationTokens + todayCacheReadTokens),
    todayCost: numberValue(item.today_cost ?? item.todayCost, 0),
    todayActualCost: numberValue(item.today_actual_cost ?? item.todayActualCost, 0),
    rpm: numberValue(item.rpm, 0),
    tpm: numberValue(item.tpm, 0),
    averageDurationMs: numberValue(item.average_duration_ms ?? item.averageDurationMs ?? item.avg_duration_ms ?? item.avgDurationMs, 0),
  };
}

function normalizeUsageLogs(raw: unknown): Sub2UsageLog[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const inputTokens = numberValue(item.input_tokens ?? item.inputTokens, 0);
    const outputTokens = numberValue(item.output_tokens ?? item.outputTokens, 0);
    const cacheCreationTokens = numberValue(item.cache_creation_tokens ?? item.cacheCreationTokens, 0);
    const cacheReadTokens = numberValue(item.cache_read_tokens ?? item.cacheReadTokens, 0);
    const log: Sub2UsageLog = {
      id: positiveInteger(item.id),
      apiKeyId: positiveInteger(item.api_key_id ?? item.apiKeyId),
      requestId: stringValue(item.request_id ?? item.requestId),
      model: stringValue(item.model),
      requestedModel: nullableString(item.requested_model ?? item.requestedModel),
      upstreamModel: nullableString(item.upstream_model ?? item.upstreamModel),
      groupId: item.group_id === null || item.groupId === null ? null : positiveInteger(item.group_id ?? item.groupId) || null,
      subscriptionId: item.subscription_id === null || item.subscriptionId === null ? null : positiveInteger(item.subscription_id ?? item.subscriptionId) || null,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      cacheCreation5mTokens: numberValue(item.cache_creation_5m_tokens ?? item.cacheCreation5mTokens, 0),
      cacheCreation1hTokens: numberValue(item.cache_creation_1h_tokens ?? item.cacheCreation1hTokens, 0),
      totalTokens: numberValue(item.total_tokens ?? item.totalTokens, inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens),
      inputCost: numberValue(item.input_cost ?? item.inputCost, 0),
      outputCost: numberValue(item.output_cost ?? item.outputCost, 0),
      cacheCreationCost: numberValue(item.cache_creation_cost ?? item.cacheCreationCost, 0),
      cacheReadCost: numberValue(item.cache_read_cost ?? item.cacheReadCost, 0),
      totalCost: numberValue(item.total_cost ?? item.totalCost, 0),
      actualCost: numberValue(item.actual_cost ?? item.actualCost, 0),
      rateMultiplier: numberValue(item.rate_multiplier ?? item.rateMultiplier, 1),
      billingType: numberValue(item.billing_type ?? item.billingType, 0),
      billingMode: nullableString(item.billing_mode ?? item.billingMode),
      requestType: stringValue(item.request_type ?? item.requestType),
      stream: Boolean(item.stream),
      durationMs: numberValue(item.duration_ms ?? item.durationMs, 0),
      firstTokenMs: optionalNullableNumber(item.first_token_ms ?? item.firstTokenMs),
      inboundEndpoint: nullableString(item.inbound_endpoint ?? item.inboundEndpoint),
      upstreamEndpoint: nullableString(item.upstream_endpoint ?? item.upstreamEndpoint),
      reasoningEffort: nullableString(item.reasoning_effort ?? item.reasoningEffort),
      serviceTier: nullableString(item.service_tier ?? item.serviceTier),
      imageCount: numberValue(item.image_count ?? item.imageCount, 0),
      imageSize: nullableString(item.image_size ?? item.imageSize),
      imageInputSize: nullableString(item.image_input_size ?? item.imageInputSize),
      imageOutputSize: nullableString(item.image_output_size ?? item.imageOutputSize),
      cacheTtlOverridden: Boolean(item.cache_ttl_overridden ?? item.cacheTtlOverridden),
      createdAt: stringValue(item.created_at ?? item.createdAt),
      apiKey: item.api_key ? normalizeApiKey(item.api_key) : undefined,
      group: item.group ? normalizeGroup(item.group) : undefined,
    };
    return log.id > 0 ? [log] : [];
  });
}

function normalizePaymentOrders(raw: unknown): Sub2PaymentOrder[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const order: Sub2PaymentOrder = {
      id: positiveInteger(item.id),
      userId: positiveInteger(item.user_id ?? item.userId),
      amount: numberValue(item.amount, 0),
      payAmount: numberValue(item.pay_amount ?? item.payAmount, 0),
      currency: stringValue(item.currency) || undefined,
      feeRate: numberValue(item.fee_rate ?? item.feeRate, 0),
      paymentType: stringValue(item.payment_type ?? item.paymentType),
      outTradeNo: stringValue(item.out_trade_no ?? item.outTradeNo),
      status: stringValue(item.status),
      orderType: stringValue(item.order_type ?? item.orderType),
      createdAt: stringValue(item.created_at ?? item.createdAt),
      expiresAt: stringValue(item.expires_at ?? item.expiresAt),
      paidAt: stringValue(item.paid_at ?? item.paidAt) || undefined,
      completedAt: stringValue(item.completed_at ?? item.completedAt) || undefined,
      refundAmount: numberValue(item.refund_amount ?? item.refundAmount, 0),
      refundReason: stringValue(item.refund_reason ?? item.refundReason) || undefined,
      refundRequestedAt: stringValue(item.refund_requested_at ?? item.refundRequestedAt) || undefined,
      refundRequestReason: stringValue(item.refund_request_reason ?? item.refundRequestReason) || undefined,
      planId: optionalNumber(item.plan_id ?? item.planId),
      providerInstanceId: stringValue(item.provider_instance_id ?? item.providerInstanceId) || undefined,
    };
    return order.id > 0 ? [order] : [];
  });
}

function normalizeRedeemHistory(raw: unknown): Sub2RedeemHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const group = item.group && typeof item.group === "object" ? item.group as Record<string, unknown> : null;
    const record: Sub2RedeemHistoryItem = {
      id: positiveInteger(item.id),
      code: stringValue(item.code),
      type: stringValue(item.type),
      value: numberValue(item.value, 0),
      status: stringValue(item.status),
      usedAt: stringValue(item.used_at ?? item.usedAt),
      createdAt: stringValue(item.created_at ?? item.createdAt),
      notes: stringValue(item.notes) || undefined,
      groupId: optionalNumber(item.group_id ?? item.groupId),
      validityDays: optionalNumber(item.validity_days ?? item.validityDays),
      group: group ? {
        id: positiveInteger(group.id),
        name: stringValue(group.name),
      } : undefined,
    };
    return record.id > 0 ? [record] : [];
  });
}

function normalizeBillingRecords(orders: Sub2PaymentOrder[], redeemHistory: Sub2RedeemHistoryItem[]): Sub2BillingRecord[] {
  const orderRecords = orders.map((order): Sub2BillingRecord => {
    const effectiveAt = order.completedAt || order.paidAt || order.createdAt;
    return {
      id: `order:${order.id}`,
      source: "payment_order",
      createdAt: order.createdAt,
      effectiveAt,
      title: paymentOrderTitle(order),
      description: paymentOrderDescription(order),
      amountLabel: paymentOrderAmountLabel(order),
      amountUsd: order.orderType === "balance" && isCreditedPaymentStatus(order.status) ? order.amount : undefined,
      status: order.status,
      statusLabel: paymentStatusLabel(order.status),
      rawId: order.id,
      order,
    };
  });
  const redeemRecords = redeemHistory.map((redeem): Sub2BillingRecord => {
    const effectiveAt = redeem.usedAt || redeem.createdAt;
    return {
      id: `redeem:${redeem.id}`,
      source: "redeem_history",
      createdAt: redeem.createdAt,
      effectiveAt,
      title: redeemTitle(redeem),
      description: redeemDescription(redeem),
      amountLabel: redeemAmountLabel(redeem),
      amountUsd: redeem.type === "balance" || redeem.type === "admin_balance" ? redeem.value : undefined,
      status: redeem.status,
      statusLabel: redeemStatusLabel(redeem.status),
      rawId: redeem.id,
      redeem,
    };
  });
  return [...orderRecords, ...redeemRecords].sort((a, b) => timestampValue(b.effectiveAt) - timestampValue(a.effectiveAt));
}

function paymentOrderTitle(order: Sub2PaymentOrder): string {
  if (order.orderType === "subscription") return "订阅订单";
  if (order.orderType === "balance") return "余额充值";
  return "支付订单";
}

function paymentOrderDescription(order: Sub2PaymentOrder): string {
  const parts = [
    paymentTypeLabel(order.paymentType),
    order.outTradeNo ? `订单 ${order.outTradeNo}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function paymentOrderAmountLabel(order: Sub2PaymentOrder): string {
  const payAmount = order.payAmount > 0 ? order.payAmount : order.amount;
  const amount = order.orderType === "subscription" ? payAmount : order.amount;
  const prefix = order.orderType === "subscription" ? "订阅 " : "";
  const suffix = order.refundAmount > 0 ? ` · 已退 ${formatUsd(order.refundAmount)}` : "";
  return `${prefix}${formatUsd(amount)}${suffix}`;
}

function paymentTypeLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("alipay")) return "支付宝";
  if (normalized.includes("wxpay") || normalized.includes("wechat")) return "微信支付";
  if (normalized.includes("stripe")) return "Stripe";
  if (normalized.includes("airwallex")) return "Airwallex";
  if (normalized.includes("easypay")) return "EasyPay";
  return value || "在线支付";
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "待支付";
    case "PAID":
      return "已支付";
    case "RECHARGING":
      return "入账中";
    case "COMPLETED":
      return "已完成";
    case "EXPIRED":
      return "已过期";
    case "CANCELLED":
      return "已取消";
    case "FAILED":
      return "失败";
    case "REFUND_REQUESTED":
      return "退款申请中";
    case "REFUNDING":
      return "退款中";
    case "PARTIALLY_REFUNDED":
      return "部分退款";
    case "REFUNDED":
      return "已退款";
    case "REFUND_FAILED":
      return "退款失败";
    default:
      return status || "未知";
  }
}

function isCreditedPaymentStatus(status: string): boolean {
  return status === "COMPLETED";
}

function redeemTitle(item: Sub2RedeemHistoryItem): string {
  if (item.type === "balance") return "兑换码充值";
  if (item.type === "admin_balance") return item.value >= 0 ? "余额调整" : "余额扣减";
  if (item.type === "concurrency") return "并发额度";
  if (item.type === "admin_concurrency") return item.value >= 0 ? "并发调整" : "并发扣减";
  if (item.type === "subscription") return "订阅权益";
  return "兑换记录";
}

function redeemDescription(item: Sub2RedeemHistoryItem): string {
  const parts = [
    item.code ? `兑换码 ${maskRedeemCode(item.code)}` : "",
    item.group?.name || "",
    item.notes || "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function redeemAmountLabel(item: Sub2RedeemHistoryItem): string {
  const sign = item.value >= 0 ? "+" : "";
  if (item.type === "balance" || item.type === "admin_balance") return `${sign}${formatUsd(item.value)}`;
  if (item.type === "subscription") {
    const days = item.validityDays || Math.max(0, Math.round(item.value));
    return item.group?.name ? `${days} 天 · ${item.group.name}` : `${days} 天`;
  }
  return `${sign}${trimNumber(item.value)} 次`;
}

function redeemStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "used" || normalized === "completed" || normalized === "success") return "已使用";
  if (normalized === "active" || normalized === "pending") return "待使用";
  if (normalized === "expired") return "已过期";
  if (normalized === "disabled" || normalized === "cancelled") return "已失效";
  return status || "未知";
}

function formatUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  return `${sign}$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: amount >= 100 ? 0 : 2,
    maximumFractionDigits: amount >= 100 ? 2 : 4,
  }).format(amount)}`;
}

function maskRedeemCode(code: string): string {
  const value = code.trim();
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function timestampValue(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeGatewayModels(payload: Sub2ModelsResponse): ProviderModel[] {
  const data = Array.isArray(payload.data) ? payload.data : [];
  const unique = new Map<string, ProviderModel>();
  for (const raw of data) {
    const id = stringValue(raw.id).trim();
    if (!id) continue;
    unique.set(id, {
      id,
      name: stringValue(raw.display_name || raw.name).trim() || id,
      enabled: true,
      supportsVision: raw.supports_vision === true || modelLooksVisionCapable(id),
    });
  }
  return [...unique.values()];
}

function splitOfficialModels(models: ProviderModel[]): OfficialModelBuckets {
  const buckets: OfficialModelBuckets = {
    agent: [],
    embedding: [],
    vision: [],
    ocr: [],
  };
  for (const model of models) {
    if (isOfficialEmbeddingModel(model)) {
      buckets.embedding.push({ ...model, supportsVision: false });
      continue;
    }
    if (isOfficialOcrModel(model)) {
      buckets.ocr.push({ ...model, supportsVision: true });
      continue;
    }
    if (isOfficialVisionModel(model)) {
      buckets.vision.push({ ...model, supportsVision: true });
      continue;
    }
    buckets.agent.push(model);
  }
  return buckets;
}

function isOfficialEmbeddingModel(model: ProviderModel): boolean {
  return OFFICIAL_EMBEDDING_MODEL_IDS.has(normalizeModelId(model.id));
}

function isOfficialVisionModel(model: ProviderModel): boolean {
  return OFFICIAL_VISION_MODEL_IDS.has(normalizeModelId(model.id));
}

function isOfficialOcrModel(model: ProviderModel): boolean {
  return OFFICIAL_OCR_MODEL_IDS.has(normalizeModelId(model.id));
}

function modelLooksVisionCapable(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes("gpt-4o") || lower.includes("vision") || lower.includes("gemini") || lower.includes("claude") || lower.includes("qwen-vl");
}

function normalizeModelId(modelId: string): string {
  return stringValue(modelId).trim().toLowerCase();
}

function cloneGroups(groups: Sub2Group[]): Sub2Group[] {
  return groups.map((group) => ({ ...group }));
}

function cloneApiKeys(keys: Sub2APIKey[]): Sub2APIKey[] {
  return keys.map((key) => ({ ...key, group: key.group ? { ...key.group } : undefined }));
}

function cloneSubscriptions(subscriptions: Sub2Subscription[]): Sub2Subscription[] {
  return subscriptions.map((subscription) => ({ ...subscription, group: subscription.group ? { ...subscription.group } : undefined }));
}

function cloneUsageStats(stats: Sub2UsageDashboardStats): Sub2UsageDashboardStats {
  return normalizeUsageStats(stats);
}

function normalizePagination<T>(raw: PaginatedResponse<T>, fallbackPage: number, fallbackPageSize: number, itemCount: number): { page: number; pageSize: number; total: number; pages: number } {
  const page = clampPositiveInteger(raw.page, 1, 100_000, fallbackPage);
  const pageSize = clampPositiveInteger(raw.page_size, 1, 100, fallbackPageSize);
  const total = Math.max(0, Math.floor(numberValue(raw.total, itemCount)));
  const pages = Math.max(0, Math.floor(numberValue(raw.pages, total > 0 ? Math.ceil(total / pageSize) : 0)));
  return { page, pageSize, total, pages };
}

function cloneProviderRefs(refs: Sub2ProviderRef[]): Sub2ProviderRef[] {
  return refs.map((ref) => ({ ...ref }));
}

function markCurrentGroups(groups: Sub2Group[], currentGroupId: number): Sub2Group[] {
  return cloneGroups(groups).map((group) => ({ ...group, isCurrent: group.id === currentGroupId }));
}

function providerId(groupId: number, purpose: ProviderPurpose = "agent"): string {
  const suffix = groupId > 0 ? String(groupId) : "default";
  if (purpose === "agent") return `${SUB2_PROVIDER_PREFIX}-agent-${suffix}`;
  return `${SUB2_PROVIDER_PREFIX}-${purpose}-${suffix}`;
}

function isSub2ProviderId(providerIdValue: string): boolean {
  return providerIdValue.startsWith(`${SUB2_PROVIDER_PREFIX}-`);
}

function providerGroupId(providerIdValue: string): number {
  const suffix = providerIdValue.slice(`${SUB2_PROVIDER_PREFIX}-`.length);
  const parts = suffix.split("-");
  const group = parts.length > 1 ? parts.slice(1).join("-") : suffix;
  return positiveInteger(group);
}

function providerToDraft(provider: ModelProviderConfig, overrides: Partial<ProviderDraftInput> = {}): ProviderDraftInput {
  return {
    id: provider.id,
    purpose: provider.purpose,
    providerKind: provider.providerKind,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: "",
    clearApiKey: false,
    authMode: provider.authMode,
    models: provider.models.map((model) => ({ ...model })),
    selectedModel: provider.selectedModel,
    enabled: provider.enabled,
    autoCompactThresholdPercent: provider.autoCompactThresholdPercent,
    ...overrides,
  };
}

function selectedEnabledModel(selectedModel: string, models: ProviderModel[]): string {
  const selected = stringValue(selectedModel).trim();
  if (selected && models.some((model) => model.id === selected && model.enabled !== false)) return selected;
  return models.find((model) => model.enabled !== false)?.id || "";
}

function officialProviderSyncDetail(group: Sub2Group, groupId: number, providers: ModelProviderConfig[]): string {
  const groupName = group.name || `分组 ${groupId}`;
  const names = providers
    .map((provider) => provider.purpose)
    .sort((a, b) => officialPurposeSortValue(a) - officialPurposeSortValue(b))
    .map((purpose) => {
      if (purpose === "agent") return "对话";
      if (purpose === "embedding") return "Embedding";
      if (purpose === "vision") return "Vision";
      return "OCR";
    });
  return `已同步 ${groupName} 官方模型${names.length > 0 ? `（${names.join("、")}）` : ""}。`;
}

function officialProviderBatchSyncDetail(batch: OfficialProviderSyncBatch): string {
  const purposeNames = [...new Set(batch.providers
    .map((provider) => provider.purpose)
    .sort((a, b) => officialPurposeSortValue(a) - officialPurposeSortValue(b))
    .map(officialPurposeLabel))];
  const base = `已自动同步 ${batch.syncedGroups.length} 个官方模型分组${purposeNames.length > 0 ? `（${purposeNames.join("、")}）` : ""}。`;
  if (batch.errors.length > 0) return `${base} ${batch.errors.length} 个分组待重试。`;
  if (batch.emptyGroups.length > 0) return `${base} ${batch.emptyGroups.length} 个分组暂无模型。`;
  return base;
}

function officialPurposeLabel(purpose: ProviderPurpose): string {
  if (purpose === "agent") return "对话";
  if (purpose === "embedding") return "Embedding";
  if (purpose === "vision") return "Vision";
  return "OCR";
}

function officialPurposeSortValue(purpose: ProviderPurpose): number {
  if (purpose === "agent") return 0;
  if (purpose === "embedding") return 1;
  if (purpose === "vision") return 2;
  return 3;
}

function normalizeBaseUrl(value: string, fallback: string): string {
  const raw = stringValue(value).trim() || fallback;
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback.replace(/\/+$/, "");
  }
}

function hasRequestError<T>(value: T | { __error: unknown }): value is { __error: unknown } {
  return Boolean(value && typeof value === "object" && "__error" in value);
}

function optionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function optionalNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveInteger(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function clampPositiveInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value).trim();
  return normalized || null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return stringValue(error) || "未知错误";
}
