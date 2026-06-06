import { Languages } from "lucide-react";
import { ReadOnlyField } from "@/components/settings/shared/SettingsControls";

export function GeneralSettingsPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-background/70 p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Languages className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">通用设置</div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">先放全局偏好入口，后面语言、外观和行为设置都可以收在这里。</div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <ReadOnlyField label="语言" value="中文" />
          <ReadOnlyField label="状态" value="占位，暂不切换界面语言" />
        </div>
      </section>
    </div>
  );
}
