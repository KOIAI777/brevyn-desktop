import { safeStorage } from "electron";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface ProviderSecretRecord {
  ciphertext: string;
  updatedAt: string;
}

interface ProviderSecretFile {
  version: 1;
  providers: Record<string, ProviderSecretRecord>;
}

const now = () => new Date().toISOString();

export class ProviderSecretStore {
  private data: ProviderSecretFile;

  constructor(private readonly filePath: string) {
    this.data = this.load();
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  secretRef(providerId: string): string {
    return `provider-secret:${providerId}`;
  }

  hasApiKey(providerId: string): boolean {
    return Boolean(this.data.providers[providerId] && this.isEncryptionAvailable());
  }

  saveApiKey(providerId: string, apiKey: string): string {
    const trimmed = apiKey.trim();
    if (!trimmed) return this.secretRef(providerId);
    if (!this.isEncryptionAvailable()) {
      throw new Error("Secure key storage is unavailable on this system. UCLAW will not save plaintext provider keys.");
    }

    this.data.providers[providerId] = {
      ciphertext: safeStorage.encryptString(trimmed).toString("base64"),
      updatedAt: now(),
    };
    this.write();
    return this.secretRef(providerId);
  }

  deleteApiKey(providerId: string): void {
    if (!this.data.providers[providerId]) return;
    delete this.data.providers[providerId];
    this.write();
  }

  readApiKey(providerId: string): string | undefined {
    const record = this.data.providers[providerId];
    if (!record || !this.isEncryptionAvailable()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(record.ciphertext, "base64"));
    } catch (error) {
      console.warn(`[provider-secrets] Failed to decrypt provider key for ${providerId}`, error);
      return undefined;
    }
  }

  private load(): ProviderSecretFile {
    if (!existsSync(this.filePath)) {
      return { version: 1, providers: {} };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<ProviderSecretFile>;
      return {
        version: 1,
        providers: parsed.providers ?? {},
      };
    } catch (error) {
      console.warn("[provider-secrets] Failed to read provider secret store; starting empty", error);
      return { version: 1, providers: {} };
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
