import { safeStorage } from "electron";
import type {
  CloudAccountStatus,
  CloudActivateOfficialProviderInput,
  CloudAPIError,
  CloudAuthInput,
  CloudGatewayAccount,
  CloudGatewayEntitlements,
  CloudGatewayGroup,
  CloudModelCatalogInput,
  CloudModelCatalogResult,
  CloudOfficialCapability,
  CloudOfficialCapabilityDefinition,
  CloudOfficialModelConfig,
  CloudOfficialPurposeConfig,
  CloudOfficialProviderRef,
  CloudOfficialProviderSyncResult,
  CloudProviderConfig,
  CloudQuotaWindow,
  CloudRedeemCodeInput,
  CloudRedeemCodeResult,
  CloudRedeemResult,
  CloudRedemption,
  CloudRefreshInput,
  CloudTokenPair,
  CloudUser,
  CloudWallet,
  ModelProviderConfig,
  ProviderDraftInput,
  ProviderKind,
  ProviderModel,
  ProviderPurpose,
} from "../../types/domain";
import { BREVYN_CLOUD_DEVELOPMENT_BASE_URL, type BrevynCloudEnvironment } from "../../types/cloud-config";
import { readJsonFileSafe, writeJsonFileAtomic } from "./safe-json-file";
import type { ProviderService } from "./provider-service";

interface CloudAccountFile {
  version: 1;
  baseUrl: string;
  tokens?: EncryptedCloudTokens;
  user?: CloudUser | null;
  wallet?: CloudWallet | null;
  gateway?: CloudGatewayAccount | null;
  currentGroup?: CloudGatewayGroup | null;
  groups?: CloudGatewayGroup[];
  entitlements?: CloudGatewayEntitlements | null;
  providerRefs?: CloudOfficialProviderRef[];
  lastSyncedAt?: string;
  lastError?: string;
}

interface EncryptedCloudTokens {
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  tokenType: string;
  accessExpiresAt: string;
  updatedAt: string;
}

interface AuthResult {
  user: CloudUser;
  tokens: CloudTokenPair;
}

interface MeResult {
  user: CloudUser;
  wallet: CloudWallet;
  gateway: CloudGatewayAccount | null;
  currentGroup: CloudGatewayGroup | null;
}

interface GroupsResult {
  items: CloudGatewayGroup[];
  total: number;
}

interface OfficialProviderResult {
  provider?: CloudProviderConfig;
  providers?: CloudProviderConfig[];
  gateway?: CloudGatewayAccount;
  apiKey?: {
    externalGroupId?: number;
    groupName?: string;
  } | null;
  status?: string;
  error?: string;
  detail?: string;
  retryAfterSeconds?: number;
}

interface RedeemAPIResult {
  status?: string;
  error?: CloudAPIError | string | null;
  result?: CloudRedeemResult & { plainApiKey?: string };
}

interface CloudAccountServiceOptions {
  defaultBaseUrl: string;
  environment: BrevynCloudEnvironment;
  baseUrlEditable: boolean;
  shopUrl: string;
}

export class CloudAccountService {
  private data: CloudAccountFile;
  private refreshInFlight: Promise<string> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly providers: ProviderService,
    private readonly options: CloudAccountServiceOptions,
  ) {
    this.data = this.load();
  }

  status(): CloudAccountStatus {
    const activeLocalGroupId = this.activeOfficialAgentGroupId();
    const currentGroupId = activeLocalGroupId
      || positiveInteger(this.data.currentGroup?.externalGroupId)
      || positiveInteger(this.data.gateway?.defaultGroupId)
      || positiveInteger((this.data.groups ?? []).find((group) => group.isCurrent)?.externalGroupId);
    const groups = markCurrentGroups(this.data.groups ?? [], currentGroupId);
    const currentGroup = currentGroupId > 0
      ? groups.find((group) => group.externalGroupId === currentGroupId) ?? null
      : this.data.currentGroup ?? null;
    const gateway = this.data.gateway && currentGroupId > 0
      ? { ...this.data.gateway, defaultGroupId: currentGroupId }
      : this.data.gateway ?? null;
    return {
      baseUrl: this.data.baseUrl,
      defaultBaseUrl: this.options.defaultBaseUrl,
      environment: this.options.environment,
      baseUrlEditable: this.options.baseUrlEditable,
      shopUrl: this.options.shopUrl,
      authenticated: Boolean(this.data.user && this.readRefreshToken()),
      user: this.data.user ?? null,
      wallet: this.data.wallet ?? null,
      gateway,
      currentGroup,
      groups,
      entitlements: markCurrentEntitlements(this.data.entitlements ?? null, currentGroupId),
      providerRefs: cloneProviderRefs(this.data.providerRefs ?? []),
      lastSyncedAt: this.data.lastSyncedAt,
      lastError: this.data.lastError,
    };
  }

  async login(input: CloudAuthInput): Promise<CloudOfficialProviderSyncResult> {
    this.setBaseUrl(input.baseUrl);
    const result = await this.request<AuthResult>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: stringValue(input.email).trim(),
        password: stringValue(input.password),
      }),
    }, false);
    this.saveTokens(result.tokens);
    this.patchData({ user: result.user, lastError: "" });
    const cloud = await this.refresh({ forceEntitlements: true, reason: "login" });
    return {
      status: "locked",
      detail: "登录成功。",
      cloud,
    };
  }

  async register(input: CloudAuthInput): Promise<CloudOfficialProviderSyncResult> {
    this.setBaseUrl(input.baseUrl);
    const result = await this.request<AuthResult>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: stringValue(input.email).trim(),
        password: stringValue(input.password),
        displayName: stringValue(input.displayName).trim(),
      }),
    }, false);
    this.saveTokens(result.tokens);
    this.patchData({ user: result.user, lastError: "" });
    const cloud = await this.refresh({ forceEntitlements: true, reason: "register" });
    return {
      status: "locked",
      detail: "账号已创建。兑换余额套餐后可启用官方模型配置。",
      cloud,
    };
  }

  async refresh(input: CloudRefreshInput = {}): Promise<CloudAccountStatus> {
    this.requireRefreshToken();
    const localCurrentGroupId = this.activeOfficialAgentGroupId();
    const [me, groups, entitlementsResult] = await Promise.all([
      this.request<MeResult>("/api/v1/me"),
      this.request<GroupsResult>("/api/v1/me/groups"),
      this.request<CloudGatewayEntitlements>(gatewayEntitlementsPath(input))
        .then((value) => ({ value }))
        .catch((error: unknown) => ({ error })),
    ]);
    const entitlements = "value" in entitlementsResult
      ? cloneEntitlements(entitlementsResult.value)
      : cloneEntitlements(this.data.entitlements ?? null);
    const entitlementError = "error" in entitlementsResult
      ? `实时余额暂不可用：${errorMessage(entitlementsResult.error)}`
      : "";
    this.patchData({
      user: me.user,
      wallet: me.wallet,
      gateway: me.gateway,
      currentGroup: me.currentGroup,
      groups: cloneGroups(groups.items ?? []),
      entitlements,
      lastSyncedAt: new Date().toISOString(),
      lastError: entitlementError,
    });
    const providerSyncErrors = await this.refreshKnownOfficialProviders();
    if (localCurrentGroupId > 0) {
      try {
        this.activateLocalOfficialProviders(localCurrentGroupId);
        this.setCurrentLocalGroup(localCurrentGroupId);
      } catch (error) {
        providerSyncErrors.push(`保留当前套餐失败：${errorMessage(error)}`);
      }
    }
    if (entitlementError || providerSyncErrors.length > 0) {
      this.patchData({
        lastError: [entitlementError, ...providerSyncErrors].filter(Boolean).join("；"),
      });
    }
    return this.status();
  }

  async refreshEntitlements(input: CloudRefreshInput = {}): Promise<CloudAccountStatus> {
    this.requireRefreshToken();
    try {
      const entitlements = await this.request<CloudGatewayEntitlements>(gatewayEntitlementsPath(input));
      this.patchData({
        entitlements: cloneEntitlements(entitlements),
        lastSyncedAt: new Date().toISOString(),
        lastError: "",
      });
    } catch (error) {
      this.patchData({
        lastSyncedAt: new Date().toISOString(),
        lastError: `实时余额暂不可用：${errorMessage(error)}`,
      });
    }
    return this.status();
  }

  async modelsCatalog(input: CloudModelCatalogInput = {}): Promise<CloudModelCatalogResult> {
    this.requireRefreshToken();
    const externalGroupId = positiveInteger(input.externalGroupId);
    const query = externalGroupId > 0 ? `?externalGroupId=${encodeURIComponent(String(externalGroupId))}` : "";
    const result = await this.request<CloudModelCatalogResult>(`/api/v1/models/catalog${query}`);
    const items = Array.isArray(result.items) ? result.items : [];
    return {
      items,
      total: Number.isFinite(Number(result.total)) ? Number(result.total) : items.length,
      externalGroupId: positiveInteger(result.externalGroupId) || externalGroupId,
    };
  }

  async syncOfficialProvider(input: { externalGroupId?: number } = {}): Promise<CloudOfficialProviderSyncResult> {
    this.requireRefreshToken();
    const requestedGroupId = positiveInteger(input.externalGroupId);
    const query = requestedGroupId > 0 ? `?externalGroupId=${encodeURIComponent(String(requestedGroupId))}` : "";
    const result = await this.request<OfficialProviderResult>(`/api/v1/provider/official${query}`);
    const cloudProviders = normalizedOfficialCloudProviders(result);
    if (cloudProviders.length === 0) {
      if (isOfficialCapabilityLocked(result)) {
        this.patchData({
          lastError: "",
          lastSyncedAt: new Date().toISOString(),
        });
        return {
          status: "locked",
          detail: officialCapabilityLockedMessage(result.detail || result.error),
          retryAfterSeconds: result.retryAfterSeconds,
          cloud: this.status(),
        };
      }
      this.patchData({
        lastError: result.detail || result.error || "官方配置正在后台配置。",
        lastSyncedAt: new Date().toISOString(),
      });
      return {
        status: "provisioning",
        detail: result.detail || result.error || "官方配置正在后台配置。",
        retryAfterSeconds: result.retryAfterSeconds,
        cloud: this.status(),
      };
    }

    const externalGroupId = positiveInteger(result.apiKey?.externalGroupId) || requestedGroupId || this.defaultExternalGroupId();
    const group = this.groupForExternalId(externalGroupId);
    const providers = cloudProviders.flatMap((cloudProvider) => {
      const saved = this.saveOfficialProvider(cloudProvider, externalGroupId, group);
      if (!saved) return [];
      this.upsertProviderRef({
        providerId: saved.id,
        purpose: saved.purpose,
        externalGroupId,
        groupName: group?.name || result.apiKey?.groupName || cloudProvider.name || this.groupDisplayName(externalGroupId),
        selectedModel: saved.selectedModel,
        modelCount: saved.models.filter((model) => model.enabled !== false).length,
        syncedAt: new Date().toISOString(),
      });
      return [saved];
    });
    const provider = providers[0];
    this.patchData({
      gateway: result.gateway ?? this.data.gateway ?? null,
      lastSyncedAt: new Date().toISOString(),
      lastError: "",
    });
    return {
      status: "synced",
      provider,
      providers,
      cloud: this.status(),
    };
  }

  async activateOfficialProvider(input: CloudActivateOfficialProviderInput): Promise<CloudOfficialProviderSyncResult> {
    this.requireRefreshToken();
    const externalGroupId = positiveInteger(input.externalGroupId);
    if (externalGroupId <= 0) throw new Error("请选择要使用的 Cloud 分组。");

    let groupProviders = this.officialProvidersForGroup(externalGroupId);
    let detail = "";
    try {
      const synced = await this.syncOfficialProvider({ externalGroupId });
      if (synced.status !== "synced" || !(synced.providers?.length || synced.provider)) {
        return synced;
      }
      groupProviders = synced.providers?.length ? synced.providers : synced.provider ? [synced.provider] : [];
      detail = synced.detail || "";
    } catch (error) {
      if (groupProviders.length === 0) throw error;
      detail = `官方配置刷新失败，已使用本地缓存：${errorMessage(error)}`;
    }

    const activatedProviders = this.activateLocalOfficialProviders(externalGroupId);
    const activated = activatedProviders.find((provider) => provider.purpose === "agent") ?? activatedProviders[0];
    const group = activatedProviders.some((provider) => provider.purpose === "agent")
      ? this.setCurrentLocalGroup(externalGroupId)
      : this.groupForExternalId(externalGroupId);
    this.patchData({
      lastSyncedAt: new Date().toISOString(),
      lastError: "",
    });
    const cloud = await this.refreshEntitlements({ forceEntitlements: true, reason: "activate_group" });

    return {
      status: "synced",
      detail: detail || (activated?.purpose === "agent"
        ? `已切换到 ${group?.name || this.groupDisplayName(externalGroupId)}。`
        : `已启用 ${group?.name || this.groupDisplayName(externalGroupId)} 官方能力。`),
      provider: activated,
      providers: activatedProviders,
      cloud,
    };
  }

  async redeemCode(input: CloudRedeemCodeInput): Promise<CloudRedeemCodeResult> {
    this.requireRefreshToken();
    const code = normalizeRedeemCode(input.code);
    if (!code) throw new Error("请输入兑换码。");

    const redeemed = await this.request<RedeemAPIResult>("/api/v1/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    if (!redeemed.result?.redemption) throw new Error("兑换成功但响应缺少兑换结果。");

    let cloud = await this.refresh({ forceEntitlements: true, reason: "redeem" });
    let provider: ModelProviderConfig | undefined;
    const syncedProviders: ModelProviderConfig[] = [];
    let providerSyncStatus: CloudRedeemCodeResult["providerSyncStatus"];
    const providerSyncDetails: string[] = [];
    let providerSyncFailed = false;
    let providerSyncProvisioning = false;
    let providerSyncSucceeded = false;
    const externalGroupId = positiveInteger(redeemed.result.redemption.externalGroupId);

    if (externalGroupId > 0 && redeemed.status !== "gateway_failed" && this.isOfficialCapabilityGroup(externalGroupId)) {
      try {
        const synced = await this.activateOfficialProvider({ externalGroupId });
        cloud = synced.cloud;
        provider = synced.provider;
        syncedProviders.push(...(synced.providers ?? (synced.provider ? [synced.provider] : [])));
        providerSyncSucceeded = synced.status === "synced";
        providerSyncProvisioning = providerSyncProvisioning || synced.status === "provisioning";
        if (synced.detail) providerSyncDetails.push(synced.detail);
      } catch (error) {
        providerSyncFailed = true;
        providerSyncDetails.push(`兑换套餐同步失败：${errorMessage(error)}`);
      }
    }
    if (externalGroupId > 0 && redeemed.status !== "gateway_failed") {
      try {
        const synced = await this.syncOfficialCapabilityProviders();
        if (synced) {
          cloud = synced.cloud;
          if (!provider) provider = synced.provider;
          syncedProviders.push(...(synced.providers ?? (synced.provider ? [synced.provider] : [])));
          providerSyncSucceeded = providerSyncSucceeded || synced.status === "synced";
          providerSyncProvisioning = providerSyncProvisioning || synced.status === "provisioning";
          if (synced.status === "locked") {
            providerSyncDetails.push(synced.detail || officialCapabilityLockedMessage());
          } else if (synced.detail) {
            providerSyncDetails.push(synced.detail);
          }
        }
      } catch (error) {
        providerSyncFailed = true;
        providerSyncDetails.push(`官方能力同步失败：${errorMessage(error)}`);
      }
    }
    if (providerSyncFailed && !providerSyncSucceeded && !providerSyncProvisioning) {
      providerSyncStatus = "failed";
    } else if (providerSyncProvisioning && !providerSyncSucceeded) {
      providerSyncStatus = "provisioning";
    } else if (providerSyncSucceeded || syncedProviders.length > 0) {
      providerSyncStatus = "synced";
    }
    const providers = dedupeProvidersById(syncedProviders);
    if (!provider && providers.length > 0) provider = providers.find((item) => item.purpose === "agent") ?? providers[0];
    const providerSyncDetail = providerSyncDetails.filter(Boolean).join("；");

    return {
      status: stringValue(redeemed.status) || "ok",
      error: normalizeCloudAPIError(redeemed.error),
      result: sanitizeRedeemResult(redeemed.result),
      cloud,
      provider,
      providers: providers.length > 0 ? providers : undefined,
      providerSyncStatus,
      providerSyncDetail,
    };
  }

  private activateLocalOfficialProviders(externalGroupId: number): ModelProviderConfig[] {
    const providers = this.providers.list();
    const targetProviders = this.officialProvidersForGroup(externalGroupId);
    if (targetProviders.length === 0) throw new Error(`本地官方分组配置不存在：${externalGroupId}`);
    const targetPurposes = new Set<ProviderPurpose>(targetProviders.map((provider) => provider.purpose));
    const activated: ModelProviderConfig[] = [];
    for (const provider of providers) {
      if (!isOfficialProviderId(provider.id)) continue;
      if (!targetPurposes.has(provider.purpose)) continue;
      const enabled = this.officialProviderExternalGroupId(provider.id) === externalGroupId;
      const saved = this.providers.save(providerToDraft(provider, { enabled })).provider;
      if (enabled) activated.push(saved);
    }
    if (activated.length === 0) throw new Error(`本地官方分组配置不存在：${externalGroupId}`);
    for (const provider of activated) {
      const ref = (this.data.providerRefs ?? []).find((item) => item.providerId === provider.id || (item.externalGroupId === externalGroupId && item.purpose === provider.purpose));
      this.upsertProviderRef({
        providerId: provider.id,
        purpose: provider.purpose,
        externalGroupId,
        groupName: ref?.groupName || this.groupForExternalId(externalGroupId)?.name || provider.name,
        selectedModel: provider.selectedModel,
        modelCount: provider.models.filter((model) => model.enabled !== false).length,
        syncedAt: new Date().toISOString(),
      });
    }
    return activated;
  }

  private setCurrentLocalGroup(externalGroupId: number): CloudGatewayGroup | undefined {
    const groups = cloneGroups(this.data.groups ?? []).map((group) => ({
      ...group,
      isCurrent: group.externalGroupId === externalGroupId,
    }));
    const currentGroup = groups.find((group) => group.externalGroupId === externalGroupId) || this.groupForExternalId(externalGroupId);
    this.patchData({
      currentGroup: currentGroup ? { ...currentGroup, isCurrent: true } : null,
      groups,
      entitlements: markCurrentEntitlements(this.data.entitlements ?? null, externalGroupId),
      gateway: this.data.gateway ? { ...this.data.gateway, defaultGroupId: externalGroupId } : this.data.gateway ?? null,
    });
    return currentGroup;
  }

  async logout(): Promise<CloudAccountStatus> {
    const refreshToken = this.readRefreshToken();
    if (refreshToken) {
      try {
        await this.request("/api/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        }, false);
      } catch {
        // Local logout must succeed even when Cloud is offline.
      }
    }
    for (const ref of this.data.providerRefs ?? []) {
      this.providers.delete(ref.providerId);
    }
    this.data = {
      version: 1,
      baseUrl: this.accountBaseUrl(this.data.baseUrl),
      providerRefs: [],
      groups: [],
      user: null,
      wallet: null,
      gateway: null,
      currentGroup: null,
      entitlements: null,
      lastSyncedAt: new Date().toISOString(),
      lastError: "",
    };
    this.write();
    return this.status();
  }

  private saveOfficialProvider(provider: CloudProviderConfig, externalGroupId: number, group?: CloudGatewayGroup): ModelProviderConfig | undefined {
    const purpose = officialProviderPurpose(provider);
    if (!purpose) return undefined;
    const models = normalizeCloudProviderModels(provider.models, provider.selectedModel);
    if (models.length === 0) return undefined;
    const providerId = officialProviderId(externalGroupId, purpose);
    const existing = this.providers.list().find((item) => item.id === providerId);
    const hasEnabledOfficialProviderForPurpose = this.providers.list().some((item) =>
      item.enabled && item.purpose === purpose && isOfficialProviderId(item.id) && item.id !== providerId,
    );
    const selectedModel = selectedEnabledModel(existing?.selectedModel || provider.selectedModel, models);
    const nameSuffix = group?.name || (externalGroupId > 0 ? `套餐 ${externalGroupId}` : "");
    const draft: ProviderDraftInput = {
      id: providerId,
      purpose,
      providerKind: officialProviderKind(provider, purpose),
      name: nameSuffix ? `${provider.name || officialProviderDefaultName(purpose)} · ${nameSuffix}` : provider.name || officialProviderDefaultName(purpose),
      protocol: officialProviderProtocol(provider, purpose),
      baseUrl: stringValue(provider.baseUrl).trim(),
      apiKey: stringValue(provider.apiKey).trim(),
      clearApiKey: false,
      authMode: officialProviderAuthMode(provider, purpose),
      models,
      selectedModel,
      enabled: existing?.enabled ?? (purpose === "agent" && hasEnabledOfficialProviderForPurpose ? false : provider.enabled !== false),
    };
    return this.providers.save(draft).provider;
  }

  private officialProvidersForGroup(externalGroupId: number): ModelProviderConfig[] {
    return this.providers.list().filter((provider) =>
      isOfficialProviderId(provider.id) && this.officialProviderExternalGroupId(provider.id) === externalGroupId,
    );
  }

  private officialProviderExternalGroupId(providerId: string): number {
    const ref = (this.data.providerRefs ?? []).find((item) => item.providerId === providerId);
    return positiveInteger(ref?.externalGroupId) || officialProviderIdGroup(providerId);
  }

  private async refreshKnownOfficialProviders(): Promise<string[]> {
    const groupIds = new Set<number>();
    const addGroupId = (value: unknown) => {
      const id = positiveInteger(value);
      if (id > 0) groupIds.add(id);
    };
    for (const group of this.officialCapabilityGroups()) addGroupId(group.externalGroupId);
    const entitledOfficialGroupIds = new Set(groupIds);
    for (const ref of this.data.providerRefs ?? []) {
      const externalGroupId = positiveInteger(ref.externalGroupId);
      if (entitledOfficialGroupIds.has(externalGroupId)) addGroupId(externalGroupId);
    }

    const errors: string[] = [];
    for (const externalGroupId of groupIds) {
      try {
        await this.syncOfficialProvider({ externalGroupId });
      } catch (error) {
        errors.push(`${this.groupDisplayName(externalGroupId)} 官方配置同步失败：${errorMessage(error)}`);
      }
    }
    return errors;
  }

  private officialCapabilityGroups(): Array<{ externalGroupId?: unknown; officialCapabilities?: unknown; officialModelConfig?: unknown }> {
    return [
      ...(this.data.groups ?? []),
      ...(this.data.entitlements?.balanceGroups ?? []),
      ...(this.data.entitlements?.subscriptionGroups ?? []),
    ].filter(hasOfficialCapability);
  }

  private async syncOfficialCapabilityProviders(): Promise<CloudOfficialProviderSyncResult | undefined> {
    const groupIds: number[] = [];
    const seen = new Set<number>();
    for (const group of this.officialCapabilityGroups()) {
      const externalGroupId = positiveInteger(group.externalGroupId);
      if (externalGroupId <= 0 || seen.has(externalGroupId)) continue;
      seen.add(externalGroupId);
      groupIds.push(externalGroupId);
    }
    if (groupIds.length === 0) return undefined;

    const providers: ModelProviderConfig[] = [];
    const details: string[] = [];
    const errors: string[] = [];
    let status: CloudOfficialProviderSyncResult["status"] = "synced";
    let cloud = this.status();
    for (const externalGroupId of groupIds) {
      try {
        const synced = await this.syncOfficialProvider({ externalGroupId });
        cloud = synced.cloud;
        if (synced.status === "provisioning") status = "provisioning";
        if (synced.status === "locked") status = "locked";
        providers.push(...(synced.providers ?? (synced.provider ? [synced.provider] : [])));
        if (synced.detail) details.push(synced.detail);
      } catch (error) {
        errors.push(`${this.groupDisplayName(externalGroupId)}：${errorMessage(error)}`);
      }
    }
    const deduped = dedupeProvidersById(providers);
    if (deduped.length === 0 && errors.length > 0) {
      throw new Error(errors.join("；"));
    }
    if (errors.length > 0) details.push(`部分官方能力同步失败：${errors.join("；")}`);
    return {
      status,
      detail: details.join("；"),
      provider: deduped.find((item) => item.purpose === "agent") ?? deduped[0],
      providers: deduped,
      cloud,
    };
  }

  private async request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body !== undefined) headers.set("Content-Type", "application/json");
    const accessToken = auth ? this.readAccessToken() : "";
    if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    let response = await cloudFetch(this.url(path), { ...init, headers });
    if (response.status === 401 && auth && this.readRefreshToken()) {
      const token = await this.refreshTokensOnce();
      headers.set("Authorization", `Bearer ${token}`);
      response = await cloudFetch(this.url(path), { ...init, headers });
    }
    if (!response.ok) throw await cloudRequestError(response);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
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
    const response = await cloudFetch(this.url("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      this.clearTokens();
      throw await cloudRequestError(response);
    }
    const result = await response.json() as AuthResult;
    this.saveTokens(result.tokens);
    this.patchData({ user: result.user, lastError: "" });
    return result.tokens.accessToken;
  }

  private saveTokens(tokens: CloudTokenPair): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用，无法保存 Cloud 登录态。");
    }
    const now = new Date();
    this.patchData({
      tokens: {
        accessTokenCiphertext: encrypt(tokens.accessToken),
        refreshTokenCiphertext: encrypt(tokens.refreshToken),
        tokenType: tokens.tokenType || "Bearer",
        accessExpiresAt: new Date(now.getTime() + Math.max(0, Number(tokens.expiresIn) || 0) * 1000).toISOString(),
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
    if (!token) throw new Error("请先登录 Brevyn Cloud。");
    return token;
  }

  private setBaseUrl(baseUrl: string | undefined): void {
    const normalized = this.accountBaseUrl(baseUrl || this.data.baseUrl);
    if (normalized !== this.data.baseUrl) this.patchData({ baseUrl: normalized });
  }

  private accountBaseUrl(value?: string): string {
    if (!this.options.baseUrlEditable) return normalizeBaseUrl(this.options.defaultBaseUrl, this.options.defaultBaseUrl);
    return normalizeBaseUrl(value || this.options.defaultBaseUrl, this.options.defaultBaseUrl);
  }

  private defaultExternalGroupId(): number {
    return this.activeOfficialAgentGroupId()
      || positiveInteger(this.data.currentGroup?.externalGroupId)
      || positiveInteger(this.data.gateway?.defaultGroupId)
      || positiveInteger((this.data.groups ?? []).find((group) => group.isCurrent)?.externalGroupId)
      || positiveInteger((this.data.groups ?? [])[0]?.externalGroupId);
  }

  private activeOfficialAgentGroupId(): number {
    const provider = this.providers.list().find((item) => item.enabled && item.purpose === "agent" && isOfficialProviderId(item.id));
    return positiveInteger(provider ? this.officialProviderExternalGroupId(provider.id) : 0);
  }

  private groupForExternalId(externalGroupId: number): CloudGatewayGroup | undefined {
    return (this.data.groups ?? []).find((group) => group.externalGroupId === externalGroupId);
  }

  private isOfficialCapabilityGroup(externalGroupId: number): boolean {
    return this.officialCapabilityGroups().some((group) => positiveInteger(group.externalGroupId) === externalGroupId);
  }

  private groupDisplayName(externalGroupId: number): string {
    return this.groupForExternalId(externalGroupId)?.name || (externalGroupId > 0 ? `套餐 ${externalGroupId}` : "当前套餐");
  }

  private upsertProviderRef(ref: CloudOfficialProviderRef): void {
    const refs = cloneProviderRefs(this.data.providerRefs ?? []);
    const index = refs.findIndex((item) =>
      item.providerId === ref.providerId ||
      (item.externalGroupId === ref.externalGroupId && item.purpose === ref.purpose && Boolean(ref.purpose)),
    );
    if (index >= 0) refs[index] = ref;
    else refs.push(ref);
    this.patchData({ providerRefs: refs });
  }

  private patchData(patch: Partial<CloudAccountFile>): void {
    this.data = {
      ...this.data,
      ...patch,
      version: 1,
      baseUrl: patch.baseUrl ?? this.data.baseUrl ?? this.options.defaultBaseUrl,
    };
    this.write();
  }

  private load(): CloudAccountFile {
    const parsed = readJsonFileSafe<Partial<CloudAccountFile>>(this.filePath);
    return {
      version: 1,
      baseUrl: this.accountBaseUrl(parsed?.baseUrl),
      tokens: normalizeEncryptedTokens(parsed?.tokens),
      user: parsed?.user ?? null,
      wallet: parsed?.wallet ?? null,
      gateway: parsed?.gateway ?? null,
      currentGroup: parsed?.currentGroup ?? null,
      groups: cloneGroups(parsed?.groups ?? []),
      entitlements: cloneEntitlements(parsed?.entitlements ?? null),
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

async function cloudRequestError(response: Response): Promise<Error> {
  let code = response.statusText || "request_failed";
  let message = `${response.status} ${response.statusText}`;
  let detail = "";
  try {
    const payload = await response.json() as { error?: unknown; detail?: unknown; message?: unknown };
    if (typeof payload.error === "string") {
      code = payload.error;
      detail = typeof payload.detail === "string" ? payload.detail : "";
      message = detail ? `${payload.error}: ${detail}` : payload.error;
    } else if (payload.error && typeof payload.error === "object") {
      const nested = payload.error as { code?: unknown; message?: unknown };
      code = stringValue(nested.code) || code;
      message = stringValue(nested.message) || code;
    } else if (typeof payload.detail === "string" && payload.detail) {
      detail = payload.detail;
      message = payload.detail;
    } else if (typeof payload.message === "string" && payload.message) {
      message = payload.message;
    }
  } catch {
    // Keep the HTTP status fallback.
  }
  message = friendlyCloudErrorMessage(code, detail || message);
  const error = new Error(message);
  error.name = code;
  return error;
}

function friendlyCloudErrorMessage(code: string, detail?: string): string {
  switch (code) {
    case "official_capability_not_active":
      return "兑换余额套餐后可启用官方模型配置。";
    case "provider_provision_rate_limited":
      return "官方模型配置正在准备中，请稍后刷新。";
    case "gateway_provision_in_progress":
    case "gateway_provision_queued":
    case "gateway_credential_missing":
      return "官方模型配置正在后台准备，请稍后刷新。";
    case "group_not_official_capability":
      return "这个套餐不包含官方模型配置，已尝试同步可用的官方能力。";
    case "group_not_available":
      return "当前账号无权使用该套餐分组。";
    case "official_capability_query_failed":
      return "暂时无法校验官方能力资格，请稍后重试。";
    default:
      return detail || code || "Cloud 请求失败。";
  }
}

async function cloudFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const message = errorMessage(error);
    const networkCode = networkErrorCode(error);
    const wrapped = new Error(
      networkCode
        ? `cloud_network_error: 网络连接中断（${networkCode}），请稍后重试。`
        : `cloud_network_error: 无法连接 Brevyn Cloud，请检查网络或 Cloud 地址后重试。`,
    );
    wrapped.name = "cloud_network_error";
    wrapped.cause = error;
    if (message) (wrapped as Error & { detail?: string }).detail = message;
    throw wrapped;
  }
}

function networkErrorCode(error: unknown): string {
  const direct = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  if (direct) return direct;
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : undefined;
  return cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: unknown }).code || "") : "";
}

function normalizeCloudProviderModels(models: unknown, selectedModel: string): ProviderModel[] {
  const normalized = Array.isArray(models)
    ? models.flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const item = raw as Partial<CloudProviderConfig["models"][number]>;
        const id = stringValue(item.id).trim();
        if (!id) return [];
        return [{
          id,
          name: stringValue(item.displayName || item.name).trim() || id,
          enabled: item.enabled !== false,
          supportsVision: item.supportsVision === true,
        }];
      })
    : [];
  const unique = new Map<string, ProviderModel>();
  for (const model of normalized) unique.set(model.id, model);
  const selected = stringValue(selectedModel).trim();
  if (selected && !unique.has(selected)) unique.set(selected, { id: selected, name: selected, enabled: true });
  return [...unique.values()];
}

function dedupeProvidersById(providers: ModelProviderConfig[]): ModelProviderConfig[] {
  const seen = new Set<string>();
  const out: ModelProviderConfig[] = [];
  for (const provider of providers) {
    if (!provider.id || seen.has(provider.id)) continue;
    seen.add(provider.id);
    out.push(provider);
  }
  return out;
}

function selectedEnabledModel(selectedModel: string, models: ProviderModel[]): string {
  const selected = stringValue(selectedModel).trim();
  if (selected && models.some((model) => model.id === selected && model.enabled !== false)) return selected;
  return models.find((model) => model.enabled !== false)?.id || "";
}

function selectedConfiguredModel(selectedModel: string, modelIds: string[]): string {
  const selected = stringValue(selectedModel).trim();
  const matched = modelIds.find((modelId) => modelId.toLowerCase() === selected.toLowerCase());
  return matched || modelIds[0] || "";
}

function normalizedOfficialCloudProviders(result: OfficialProviderResult): CloudProviderConfig[] {
  const providers = Array.isArray(result.providers)
    ? result.providers.filter((provider) => provider && typeof provider === "object")
    : [];
  if (providers.length > 0) return providers;
  return result.provider ? [result.provider] : [];
}

function officialProviderId(externalGroupId: number, purpose: ProviderPurpose = "agent"): string {
  const suffix = externalGroupId > 0 ? String(externalGroupId) : "default";
  if (purpose === "agent") return `provider-brevyn-cloud-official-${suffix}`;
  return `provider-brevyn-cloud-official-${purpose}-${suffix}`;
}

function isOfficialProviderId(providerId: string): boolean {
  return providerId.startsWith("provider-brevyn-cloud-official-");
}

function officialProviderIdGroup(providerId: string): number {
  const suffix = providerId.slice("provider-brevyn-cloud-official-".length);
  const parts = suffix.split("-");
  const raw = parts[0] === "embedding" || parts[0] === "vision" || parts[0] === "ocr" ? parts.slice(1).join("-") : suffix;
  return positiveInteger(raw);
}

function officialProviderPurpose(provider: CloudProviderConfig): ProviderPurpose | undefined {
  const purpose = stringValue(provider.purpose);
  if (purpose === "agent" || purpose === "embedding" || purpose === "vision" || purpose === "ocr") return purpose;
  if (provider.protocol === "openai_compatible") return "embedding";
  if (provider.protocol === "openai_responses") return "vision";
  if (provider.protocol === "anthropic_messages") return "agent";
  return undefined;
}

function officialProviderKind(provider: CloudProviderConfig, purpose: ProviderPurpose): ProviderKind {
  const kind = stringValue(provider.providerKind);
  if (purpose === "embedding") return kind === "openai" || kind === "qwen" || kind === "doubao" || kind === "zhipu" || kind === "minimax" || kind === "custom-openai"
    ? kind
    : "custom-openai";
  if (purpose === "vision") {
    if (
      kind === "vision-bailian-openai" ||
      kind === "vision-custom-openai" ||
      kind === "vision-custom-anthropic" ||
      kind === "vision-openai-responses" ||
      kind === "vision-custom-openai-responses"
    ) return kind;
    return provider.protocol === "anthropic_messages" ? "vision-custom-anthropic" : "vision-custom-openai";
  }
  if (purpose === "ocr") {
    if (kind === "ocr-custom-openai" || kind === "ocr-custom-anthropic" || kind === "ocr-openai-responses") return kind;
    if (provider.protocol === "openai_responses") return "ocr-openai-responses";
    return provider.protocol === "anthropic_messages" ? "ocr-custom-anthropic" : "ocr-custom-openai";
  }
  if (
    kind === "anthropic" ||
    kind === "deepseek" ||
    kind === "bailian-anthropic" ||
    kind === "kimi-api" ||
    kind === "kimi-coding" ||
    kind === "custom-anthropic" ||
    kind === "openai-responses-agent"
  ) return kind;
  return "custom-anthropic";
}

function officialProviderProtocol(provider: CloudProviderConfig, purpose: ProviderPurpose): ProviderDraftInput["protocol"] {
  const protocol = stringValue(provider.protocol);
  if (purpose === "embedding") return "openai_compatible";
  if (purpose === "vision") {
    if (protocol === "anthropic_messages" || protocol === "openai_responses") return protocol;
    return "openai_compatible";
  }
  if (purpose === "ocr") {
    if (protocol === "anthropic_messages" || protocol === "openai_responses") return protocol;
    return "openai_compatible";
  }
  if (protocol === "openai_responses") return "openai_responses";
  return "anthropic_messages";
}

function officialProviderAuthMode(provider: CloudProviderConfig, purpose: ProviderPurpose): ProviderDraftInput["authMode"] {
  void purpose;
  const authMode = stringValue(provider.authMode);
  if (authMode === "api_key" || authMode === "auth_token" || authMode === "bearer") return authMode;
  return "api_key";
}

function officialProviderDefaultName(purpose: ProviderPurpose): string {
  if (purpose === "embedding") return "Brevyn Official Embedding";
  if (purpose === "vision") return "Brevyn Official Vision";
  if (purpose === "ocr") return "Brevyn Official OCR";
  return "Brevyn Official";
}

function hasOfficialCapability(group: { officialCapabilities?: unknown; officialModelConfig?: unknown }): boolean {
  const config = cloneOfficialModelConfig(group.officialModelConfig);
  return cloneOfficialCapabilities(group.officialCapabilities, config).length > 0;
}

function isOfficialCapabilityLocked(result: OfficialProviderResult): boolean {
  return stringValue(result.status) === "locked" || stringValue(result.error) === "official_capability_not_active";
}

function officialCapabilityLockedMessage(detail?: unknown): string {
  const text = stringValue(detail);
  if (text && text !== "official_capability_not_active") return text;
  return "兑换余额套餐后可启用官方模型配置。";
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

function gatewayEntitlementsPath(input: CloudRefreshInput = {}): string {
  const params = new URLSearchParams();
  if (input.forceEntitlements) params.set("refresh", "1");
  const reason = stringValue(input.reason).trim();
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `/api/v1/me/gateway-entitlements?${query}` : "/api/v1/me/gateway-entitlements";
}

function cloneOfficialModelConfig(value: unknown): CloudOfficialModelConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const out: CloudOfficialModelConfig = {};
  for (const [key, rawConfig] of Object.entries(item)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    const config = cloneOfficialPurposeConfig(rawConfig);
    if (config.modelIds.length > 0) out[normalizedKey] = config;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function cloneOfficialPurposeConfig(value: unknown): CloudOfficialPurposeConfig {
  if (!value || typeof value !== "object") return { modelIds: [], defaultModelId: "" };
  const item = value as Partial<CloudOfficialPurposeConfig>;
  const seen = new Set<string>();
  const modelIds = Array.isArray(item.modelIds)
    ? item.modelIds.flatMap((raw) => {
      const modelId = stringValue(raw).trim();
      const key = modelId.toLowerCase();
      if (!modelId || seen.has(key)) return [];
      seen.add(key);
      return [modelId];
    })
    : [];
  const defaultModelId = selectedConfiguredModel(stringValue(item.defaultModelId), modelIds);
  return { modelIds, defaultModelId };
}

function cloneOfficialCapabilities(value: unknown, config?: CloudOfficialModelConfig): CloudOfficialCapability[] {
  const out: CloudOfficialCapability[] = [];
  const add = (capability: unknown) => {
    const normalized = stringValue(capability).toLowerCase();
    if ((normalized === "embedding" || normalized === "vision" || normalized === "ocr") && !out.includes(normalized)) out.push(normalized);
  };
  if (Array.isArray(value)) value.forEach(add);
  if (config) {
    for (const [key, purposeConfig] of Object.entries(config)) {
      if (purposeConfig.modelIds.length) add(key);
    }
  }
  return out;
}

function cloneGroups(groups: unknown): CloudGatewayGroup[] {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CloudGatewayGroup>;
    const externalGroupId = positiveInteger(item.externalGroupId);
    if (externalGroupId <= 0) return [];
    const officialModelConfig = cloneOfficialModelConfig(item.officialModelConfig);
    const officialCapabilities = cloneOfficialCapabilities(item.officialCapabilities, officialModelConfig);
    return [{
      externalGroupId,
      name: stringValue(item.name) || `套餐 ${externalGroupId}`,
      description: stringValue(item.description),
      platform: stringValue(item.platform),
      subscriptionType: stringValue(item.subscriptionType),
      rateMultiplier: numberValue(item.rateMultiplier, 1),
      dailyLimitUsd: optionalNumber(item.dailyLimitUsd),
      weeklyLimitUsd: optionalNumber(item.weeklyLimitUsd),
      monthlyLimitUsd: optionalNumber(item.monthlyLimitUsd),
      defaultValidityDays: positiveInteger(item.defaultValidityDays),
      rpmLimit: positiveInteger(item.rpmLimit),
      status: stringValue(item.status),
      modelCount: positiveInteger(item.modelCount),
      source: stringValue(item.source) || undefined,
      isCurrent: item.isCurrent === true,
      ...(officialModelConfig ? { officialModelConfig } : {}),
      ...(officialCapabilities.length ? { officialCapabilities } : {}),
    }];
  });
}

function cloneEntitlements(value: unknown): CloudGatewayEntitlements | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CloudGatewayEntitlements>;
  return {
    externalUserId: positiveInteger(item.externalUserId),
    wallet: {
      source: stringValue(item.wallet?.source),
      scope: stringValue(item.wallet?.scope) || "user",
      remaining: numberValue(item.wallet?.remaining, 0),
      unit: stringValue(item.wallet?.unit) || "USD",
      status: stringValue(item.wallet?.status),
    },
    balanceGroups: Array.isArray(item.balanceGroups)
      ? item.balanceGroups.flatMap((raw) => cloneBalanceEntitlement(raw))
      : [],
    subscriptionGroups: Array.isArray(item.subscriptionGroups)
      ? item.subscriptionGroups.flatMap((raw) => cloneSubscriptionEntitlement(raw))
      : [],
    officialCapabilityDefinitions: cloneOfficialCapabilityDefinitions(item.officialCapabilityDefinitions),
    updatedAt: stringValue(item.updatedAt),
    stale: item.stale === true,
    refreshLimited: item.refreshLimited === true,
    nextRefreshAfterSeconds: positiveInteger(item.nextRefreshAfterSeconds),
  };
}

function cloneBalanceEntitlement(raw: unknown): CloudGatewayEntitlements["balanceGroups"] {
  if (!raw || typeof raw !== "object") return [];
  const item = raw as Partial<CloudGatewayEntitlements["balanceGroups"][number]>;
  const externalGroupId = positiveInteger(item.externalGroupId);
  if (externalGroupId <= 0) return [];
  const officialModelConfig = cloneOfficialModelConfig(item.officialModelConfig);
  const officialCapabilities = cloneOfficialCapabilities(item.officialCapabilities, officialModelConfig);
  return [{
    externalGroupId,
    name: stringValue(item.name) || `套餐 ${externalGroupId}`,
    description: stringValue(item.description),
    platform: stringValue(item.platform),
    billingKind: "balance",
    subscriptionType: "standard",
    balanceScope: stringValue(item.balanceScope) || "user",
    limit: numberValue(item.limit, numberValue(item.remaining, 0)),
    used: numberValue(item.used, 0),
    remaining: numberValue(item.remaining, 0),
    unit: stringValue(item.unit) || "USD",
    rateMultiplier: numberValue(item.rateMultiplier, 1),
    status: stringValue(item.status),
    groupStatus: stringValue(item.groupStatus) || undefined,
    modelCount: positiveInteger(item.modelCount),
    source: stringValue(item.source) || undefined,
    isCurrent: item.isCurrent === true,
    ...(officialModelConfig ? { officialModelConfig } : {}),
    ...(officialCapabilities.length ? { officialCapabilities } : {}),
  }];
}

function cloneSubscriptionEntitlement(raw: unknown): CloudGatewayEntitlements["subscriptionGroups"] {
  if (!raw || typeof raw !== "object") return [];
  const item = raw as Partial<CloudGatewayEntitlements["subscriptionGroups"][number]>;
  const externalGroupId = positiveInteger(item.externalGroupId);
  if (externalGroupId <= 0) return [];
  const officialModelConfig = cloneOfficialModelConfig(item.officialModelConfig);
  const officialCapabilities = cloneOfficialCapabilities(item.officialCapabilities, officialModelConfig);
  return [{
    externalGroupId,
    name: stringValue(item.name) || `套餐 ${externalGroupId}`,
    description: stringValue(item.description),
    platform: stringValue(item.platform),
    billingKind: "subscription",
    subscriptionType: "subscription",
    rateMultiplier: numberValue(item.rateMultiplier, 1),
    status: stringValue(item.status),
    groupStatus: stringValue(item.groupStatus) || undefined,
    modelCount: positiveInteger(item.modelCount),
    source: stringValue(item.source) || undefined,
    isCurrent: item.isCurrent === true,
    subscriptionId: optionalPositiveInteger(item.subscriptionId),
    startsAt: item.startsAt ? stringValue(item.startsAt) : null,
    expiresAt: item.expiresAt ? stringValue(item.expiresAt) : null,
    remaining: numberValue(item.remaining, 0),
    unit: stringValue(item.unit) || "USD",
    unlimited: item.unlimited === true,
    constrainingWindow: stringValue(item.constrainingWindow) || undefined,
    depletedWindow: stringValue(item.depletedWindow) || undefined,
    daily: cloneQuotaWindow(item.daily),
    weekly: cloneQuotaWindow(item.weekly),
    monthly: cloneQuotaWindow(item.monthly),
    defaultValidityDays: positiveInteger(item.defaultValidityDays),
    ...(officialModelConfig ? { officialModelConfig } : {}),
    ...(officialCapabilities.length ? { officialCapabilities } : {}),
  }];
}

function cloneOfficialCapabilityDefinitions(value: unknown): CloudOfficialCapabilityDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CloudOfficialCapabilityDefinition>;
    const key = stringValue(item.key).trim().toLowerCase();
    if (!key) return [];
    const modelHintCapabilities = Array.isArray(item.modelHintCapabilities)
      ? item.modelHintCapabilities.flatMap((rawHint) => {
        const hint = stringValue(rawHint).trim();
        return hint ? [hint] : [];
      })
      : [];
    return [{
      key,
      name: stringValue(item.name) || key,
      providerKind: stringValue(item.providerKind),
      adapterKind: stringValue(item.adapterKind),
      protocol: stringValue(item.protocol),
      ...(modelHintCapabilities.length ? { modelHintCapabilities } : {}),
      ...(item.minClientVersion ? { minClientVersion: stringValue(item.minClientVersion) } : {}),
    }];
  });
}

function cloneQuotaWindow(value: unknown): CloudQuotaWindow | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<CloudQuotaWindow>;
  return {
    limit: numberValue(item.limit, 0),
    used: numberValue(item.used, 0),
    remaining: numberValue(item.remaining, 0),
    unit: stringValue(item.unit) || "USD",
    windowStart: item.windowStart ? stringValue(item.windowStart) : null,
  };
}

function markCurrentEntitlements(value: CloudGatewayEntitlements | null, externalGroupId: number): CloudGatewayEntitlements | null {
  const entitlements = cloneEntitlements(value);
  if (!entitlements) return null;
  if (externalGroupId <= 0) return entitlements;
  return {
    ...entitlements,
    balanceGroups: entitlements.balanceGroups.map((group) => ({
      ...group,
      isCurrent: group.externalGroupId === externalGroupId,
    })),
    subscriptionGroups: entitlements.subscriptionGroups.map((group) => ({
      ...group,
      isCurrent: group.externalGroupId === externalGroupId,
    })),
  };
}

function markCurrentGroups(value: unknown, externalGroupId: number): CloudGatewayGroup[] {
  const groups = cloneGroups(value);
  if (externalGroupId <= 0) return groups;
  return groups.map((group) => ({
    ...group,
    isCurrent: group.externalGroupId === externalGroupId,
  }));
}

function cloneProviderRefs(refs: unknown): CloudOfficialProviderRef[] {
  if (!Array.isArray(refs)) return [];
  return refs.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CloudOfficialProviderRef>;
    const providerId = stringValue(item.providerId).trim();
    const externalGroupId = positiveInteger(item.externalGroupId);
    if (!providerId || externalGroupId <= 0) return [];
    return [{
      providerId,
      purpose: item.purpose === "agent" || item.purpose === "embedding" || item.purpose === "vision" || item.purpose === "ocr" ? item.purpose : undefined,
      externalGroupId,
      groupName: stringValue(item.groupName),
      selectedModel: stringValue(item.selectedModel),
      modelCount: positiveInteger(item.modelCount),
      syncedAt: stringValue(item.syncedAt),
    }];
  });
}

function normalizeEncryptedTokens(tokens: unknown): EncryptedCloudTokens | undefined {
  if (!tokens || typeof tokens !== "object") return undefined;
  const item = tokens as Partial<EncryptedCloudTokens>;
  const accessTokenCiphertext = stringValue(item.accessTokenCiphertext);
  const refreshTokenCiphertext = stringValue(item.refreshTokenCiphertext);
  if (!accessTokenCiphertext || !refreshTokenCiphertext) return undefined;
  return {
    accessTokenCiphertext,
    refreshTokenCiphertext,
    tokenType: stringValue(item.tokenType) || "Bearer",
    accessExpiresAt: stringValue(item.accessExpiresAt),
    updatedAt: stringValue(item.updatedAt),
  };
}

function normalizeBaseUrl(value: string, fallback = BREVYN_CLOUD_DEVELOPMENT_BASE_URL): string {
  const trimmed = stringValue(value).trim();
  if (!trimmed) return fallback;
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function normalizeRedeemCode(value: unknown): string {
  return stringValue(value).trim().toUpperCase();
}

function sanitizeRedeemResult(result: CloudRedeemResult & { plainApiKey?: string }): CloudRedeemResult {
  return {
    redemption: sanitizeRedemption(result.redemption),
    wallet: { balance: numberValue(result.wallet?.balance, 0) },
    gateway: {
      provider: stringValue(result.gateway?.provider),
      externalUserId: positiveInteger(result.gateway?.externalUserId),
      externalEmail: stringValue(result.gateway?.externalEmail),
      defaultGroupId: positiveInteger(result.gateway?.defaultGroupId),
      concurrency: positiveInteger(result.gateway?.concurrency),
      status: stringValue(result.gateway?.status),
      lastSyncedAt: result.gateway?.lastSyncedAt ? stringValue(result.gateway.lastSyncedAt) : null,
    },
    apiKey: result.apiKey ? {
      id: stringValue(result.apiKey.id),
      provider: stringValue(result.apiKey.provider),
      externalKeyId: positiveInteger(result.apiKey.externalKeyId),
      externalGroupId: positiveInteger(result.apiKey.externalGroupId),
      groupName: stringValue(result.apiKey.groupName),
      groupType: stringValue(result.apiKey.groupType),
      platform: stringValue(result.apiKey.platform),
      maskedApiKey: stringValue(result.apiKey.maskedApiKey),
      status: stringValue(result.apiKey.status),
      lastUsedAt: result.apiKey.lastUsedAt ? stringValue(result.apiKey.lastUsedAt) : null,
      createdAt: stringValue(result.apiKey.createdAt),
    } : undefined,
  };
}

function sanitizeRedemption(redemption: CloudRedemption): CloudRedemption {
  return {
    id: stringValue(redemption.id),
    codeId: stringValue(redemption.codeId),
    productName: stringValue(redemption.productName),
    kind: stringValue(redemption.kind),
    value: numberValue(redemption.value, 0),
    validityDays: positiveInteger(redemption.validityDays),
    externalUserId: positiveInteger(redemption.externalUserId),
    externalGroupId: positiveInteger(redemption.externalGroupId),
    gatewayOperation: stringValue(redemption.gatewayOperation),
    status: stringValue(redemption.status),
    errorMessage: stringValue(redemption.errorMessage),
    errorCode: stringValue(redemption.errorCode),
    errorClass: stringValue(redemption.errorClass),
    errorStage: stringValue(redemption.errorStage),
    errorRetryable: redemption.errorRetryable === true,
    errorDetail: stringValue(redemption.errorDetail),
    createdAt: stringValue(redemption.createdAt),
  };
}

function normalizeCloudAPIError(error: RedeemAPIResult["error"]): CloudAPIError | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return { code: error, message: error };
  return {
    code: stringValue(error.code),
    message: stringValue(error.message) || stringValue(error.code),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : stringValue(error) || "操作失败。";
}

function optionalNumber(value: unknown): number | undefined {
  const numeric = numberValue(value, NaN);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const numeric = positiveInteger(value);
  return numeric > 0 ? numeric : undefined;
}

function positiveInteger(value: unknown): number {
  const numeric = numberValue(value, 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}
