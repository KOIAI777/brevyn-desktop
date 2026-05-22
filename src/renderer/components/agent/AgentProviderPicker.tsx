import type { AgentPermissionMode, ModelProviderConfig } from "@/types/domain";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { AgentPermissionModeButton } from "@/components/agent/AgentPermissionModeButton";
import { getModelLogoById, getProviderBaseUrlLogo } from "@/lib/model-provider-logo";

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
        icon: <ModelLogo src={getModelLogoById(model.id) || getProviderBaseUrlLogo(provider.baseUrl, provider.providerKind)} label={model.name || model.id} />,
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
        renderValue={(option) => (
          option ? (
            <span className="flex min-w-0 items-center gap-1.5">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          ) : "Select model"
        )}
      />
    </>
  );
}

function ModelLogo({ src, label }: { src: string; label: string }) {
  return <img src={src} alt="" title={label} className="h-4 w-4 shrink-0 rounded-[0.28rem] object-contain" />;
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
