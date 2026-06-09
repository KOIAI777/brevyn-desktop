import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings, AppThemePreference, UserProfileSettings } from "../../types/domain";

const DEFAULT_APP_SETTINGS: AppSettings = {
  agentGateway: {
    openAiResponsesEnabled: false,
  },
  appearance: {
    themePreference: "system",
  },
  profile: {
    displayName: "Koi",
    avatarId: "🧑‍💻",
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

  updateAppearance(patch: Partial<AppSettings["appearance"]>): AppSettings {
    return this.update({
      appearance: {
        ...this.data.settings.appearance,
        ...patch,
      },
    });
  }

  updateProfile(patch: Partial<UserProfileSettings>): AppSettings {
    return this.update({
      profile: normalizeProfile({
        ...this.data.settings.profile,
        ...patch,
      }),
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
    appearance: {
      themePreference: normalizeThemePreference(patch.appearance?.themePreference ?? base.appearance.themePreference),
    },
    profile: normalizeProfile({
      ...base.profile,
      ...(patch.profile || {}),
    }),
  };
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    agentGateway: {
      openAiResponsesEnabled: Boolean(settings.agentGateway.openAiResponsesEnabled),
    },
    appearance: {
      themePreference: normalizeThemePreference(settings.appearance.themePreference),
    },
    profile: normalizeProfile(settings.profile),
  };
}

function normalizeThemePreference(value: unknown): AppThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_APP_SETTINGS.appearance.themePreference;
}

function normalizeProfile(profile: Partial<UserProfileSettings>): UserProfileSettings {
  const displayName = String(profile.displayName || DEFAULT_APP_SETTINGS.profile.displayName).trim().slice(0, 40);
  const avatarId = String(profile.avatarId || DEFAULT_APP_SETTINGS.profile.avatarId).trim().slice(0, 500_000);
  return {
    displayName: displayName || DEFAULT_APP_SETTINGS.profile.displayName,
    avatarId: avatarId || DEFAULT_APP_SETTINGS.profile.avatarId,
  };
}
