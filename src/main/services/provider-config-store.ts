import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    if (!existsSync(this.filePath)) {
      return { version: 1, providers: [] };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<ProviderConfigFile>;
      return {
        version: 1,
        providers: Array.isArray(parsed.providers) ? parsed.providers.map(cloneProvider) : [],
      };
    } catch (error) {
      console.warn("[provider-configs] Failed to read provider config store; starting empty", error);
      return { version: 1, providers: [] };
    }
  }

  private write(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    try {
      chmodSync(this.filePath, 0o600);
    } catch {
      // Best effort on filesystems that do not support POSIX modes.
    }
  }
}

function cloneProvider(provider: ModelProviderConfig): ModelProviderConfig {
  return {
    ...provider,
    models: Array.isArray(provider.models) ? provider.models.map((model) => ({ ...model })) : [],
  };
}
