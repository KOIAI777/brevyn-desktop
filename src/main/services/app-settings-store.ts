import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings } from "../../types/domain";

const DEFAULT_APP_SETTINGS: AppSettings = {
  agentGateway: {
    openAiResponsesEnabled: false,
  },
};

interface AppSettingsFile {
  version: 1;
  settings: AppSettings;
}

export class AppSettingsStore {
  private data: AppSettingsFile;

  constructor(private readonly filePath: string) {
    this.data = this.readData();
  }

  get(): AppSettings {
    return cloneSettings(this.data.settings);
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = mergeSettings(this.data.settings, patch);
    this.writeData({ version: 1, settings: next });
    return this.get();
  }

  updateAgentGateway(patch: Partial<AppSettings["agentGateway"]>): AppSettings {
    return this.update({
      agentGateway: {
        ...this.data.settings.agentGateway,
        ...patch,
      },
    });
  }

  private readData(): AppSettingsFile {
    if (!existsSync(this.filePath)) {
      return { version: 1, settings: cloneSettings(DEFAULT_APP_SETTINGS) };
    }
    const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<AppSettingsFile>;
    return {
      version: 1,
      settings: mergeSettings(DEFAULT_APP_SETTINGS, parsed.settings || {}),
    };
  }

  private writeData(data: AppSettingsFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(data, null, 2)}\n`);
    this.data = {
      version: 1,
      settings: cloneSettings(data.settings),
    };
  }
}

function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    agentGateway: {
      openAiResponsesEnabled: Boolean(patch.agentGateway?.openAiResponsesEnabled ?? base.agentGateway.openAiResponsesEnabled),
    },
  };
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    agentGateway: {
      openAiResponsesEnabled: Boolean(settings.agentGateway.openAiResponsesEnabled),
    },
  };
}
