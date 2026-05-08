import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelProviderConfig } from "../../types/domain";

interface ProviderConfigFile {
  version: 1;
  providers: ModelProviderConfig[];
}

export class ProviderConfigStore {
  private data: ProviderConfigFile;

  constructor(private readonly filePath: string) {
    this.data = this.load();
  }

  hasConfigFile(): boolean {
    return existsSync(this.filePath);
  }

  listProviders(): ModelProviderConfig[] {
    return this.data.providers.map(cloneProvider);
  }

  replaceProviders(providers: ModelProviderConfig[]): void {
    this.data.providers = providers.map(cloneProvider);
    this.write();
  }

  saveProvider(provider: ModelProviderConfig): ModelProviderConfig {
    const next = cloneProvider(provider);
    const index = this.data.providers.findIndex((item) => item.id === next.id);
    if (index >= 0) this.data.providers[index] = next;
    else this.data.providers.push(next);
    this.write();
    return cloneProvider(next);
  }

  deleteProvider(providerId: string): boolean {
    const index = this.data.providers.findIndex((provider) => provider.id === providerId);
    if (index < 0) return false;
    this.data.providers.splice(index, 1);
    this.write();
    return true;
  }

  private load(): ProviderConfigFile {
    this.removeStaleTempFile();
    if (!existsSync(this.filePath)) {
      return { version: 1, providers: [] };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<ProviderConfigFile>;
      if (!Array.isArray(parsed.providers)) {
        throw new Error("provider-profiles.json must contain a providers array.");
      }
      return {
        version: 1,
        providers: parsed.providers.map(cloneProvider),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Provider profile store is unreadable: ${this.filePath}. Fix or remove the file before saving providers. ${detail}`);
    }
  }

  private write(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    try {
      writeFileSync(tmpPath, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
      let fd: number | undefined;
      try {
        fd = openSync(tmpPath, "r+");
        fsyncSync(fd);
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup failure and surface the original write error.
      }
      throw error;
    }
    try {
      chmodSync(this.filePath, 0o600);
    } catch {
      // Best effort on filesystems that do not support POSIX modes.
    }
  }

  private removeStaleTempFile(): void {
    const tmpPath = `${this.filePath}.tmp`;
    if (!existsSync(tmpPath)) return;
    try {
      unlinkSync(tmpPath);
    } catch {
      // A stale temp file should not block reading the last complete profile store.
    }
  }
}

function cloneProvider(provider: ModelProviderConfig): ModelProviderConfig {
  return {
    id: provider.id,
    purpose: provider.purpose,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKeyMasked: provider.apiKeyMasked,
    apiKeySecretRef: provider.apiKeySecretRef,
    authMode: provider.authMode,
    models: Array.isArray(provider.models) ? provider.models.map((model) => ({ ...model })) : [],
    selectedModel: provider.selectedModel,
    enabled: provider.enabled,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}
