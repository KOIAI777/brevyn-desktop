import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { AgentPermissionMode, ModelProviderConfig } from "@/types/domain";
import { DropdownSelect } from "@/components/ui/DropdownSelect";

export function AgentProviderPicker({
  running,
  planMode,
  permissionMode,
  agentProviders,
  activeProviderId,
  onSetPermissionMode,
  onSelectProvider,
}: {
  running: boolean;
  planMode: boolean;
  permissionMode: AgentPermissionMode;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  onSetPermissionMode: (mode: AgentPermissionMode) => void;
  onSelectProvider: (providerId: string) => Promise<void>;
}) {
  const providerOptions = agentProviders
    .filter((provider) => provider.enabled)
    .flatMap((provider) => {
      const models = provider.models.filter((model) => model.enabled !== false);
      const orderedModels = [
        ...models.filter((model) => model.id === provider.selectedModel),
        ...models.filter((model) => model.id !== provider.selectedModel),
      ];
      return orderedModels.map((model) => ({
        value: providerModelValue(provider.id, model.id),
        label: model.name || model.id,
        detail: provider.name,
      }));
    });

  return (
    <>
      <div className="group/permission relative shrink-0">
        <button
          type="button"
          disabled={running || planMode}
          onClick={() => onSetPermissionMode(permissionMode === "full_access" ? "review" : "full_access")}
          className={`inline-flex h-7 w-8 items-center justify-center rounded-full transition hover:bg-accent/70 disabled:cursor-not-allowed disabled:opacity-45 ${
            !planMode && permissionMode === "full_access" ? "text-amber-600" : "text-muted-foreground"
          }`}
          aria-label={planMode ? "Review" : permissionMode === "full_access" ? "Full Access" : "Review"}
        >
          {!planMode && permissionMode === "full_access"
            ? <ShieldAlert className="h-4 w-4" strokeWidth={2.1} />
            : <ShieldCheck className="h-4 w-4" strokeWidth={2.1} />}
        </button>
        <div className="pointer-events-none absolute bottom-full right-0 z-[80] mb-2 w-52 translate-y-1 rounded-xl border border-white/60 bg-card/95 px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-[0_14px_36px_rgba(64,55,38,0.16)] ring-1 ring-border/50 backdrop-blur-xl transition duration-150 group-hover/permission:translate-y-0 group-hover/permission:opacity-100 group-focus-within/permission:translate-y-0 group-focus-within/permission:opacity-100">
          <p className="font-semibold text-foreground">{!planMode && permissionMode === "full_access" ? "Full Access" : "Review"}</p>
          <p className="mt-0.5">{!planMode && permissionMode === "full_access" ? "可直接写入；危险命令仍需确认" : "写入前先请求确认"}</p>
          {!running && !planMode && <p className="mt-1 text-[10px] text-muted-foreground/80">点击切换到 {permissionMode === "full_access" ? "Review" : "Full Access"}</p>}
        </div>
      </div>
      <DropdownSelect
        value={activeProviderId}
        options={providerOptions}
        onChange={(providerId) => void onSelectProvider(providerId)}
        placeholder="Select model"
        ariaLabel="Select agent model"
        disabled={providerOptions.length === 0}
        className="w-[132px] shrink-0 sm:w-[156px]"
        buttonClassName="h-7 rounded-full border border-border/70 bg-background/55 px-2 text-[11px] font-semibold shadow-sm backdrop-blur"
        menuClassName="bg-card/95 backdrop-blur-xl"
        menuMinWidth={172}
      />
    </>
  );
}

export function providerModelValue(providerId: string, modelId: string): string {
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

export function parseProviderModelValue(value: string): { providerId?: string; modelId?: string } {
  const [providerId, modelId] = value.split("::");
  if (!providerId || !modelId) return {};
  return {
    providerId: decodeURIComponent(providerId),
    modelId: decodeURIComponent(modelId),
  };
}
