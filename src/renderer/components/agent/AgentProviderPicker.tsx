import type { AgentPermissionMode, ModelProviderConfig } from "@/types/domain";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { AgentPermissionModeButton } from "@/components/agent/AgentPermissionModeButton";

export function AgentProviderPicker({
  running,
  permissionMode,
  agentProviders,
  activeProviderId,
  onSetPermissionMode,
  onSelectProvider,
}: {
  running: boolean;
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
      <AgentPermissionModeButton running={running} permissionMode={permissionMode} onSetPermissionMode={onSetPermissionMode} />
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
