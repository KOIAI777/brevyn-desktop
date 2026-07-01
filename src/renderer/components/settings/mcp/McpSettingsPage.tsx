import { CheckCircle2, Database, FileSearch, FileText, Network, Plus, Search, Server, ShieldCheck } from "lucide-react";

const BREVYN_MCP_TOOLS = [
  {
    name: "course_structure",
    label: "课程结构",
    description: "读取当前学期、课程、任务和工作区目录。",
    icon: <Network className="h-3.5 w-3.5" />,
  },
  {
    name: "list_course_files",
    label: "课程文件",
    description: "列出课程和任务里的文件记录。",
    icon: <FileText className="h-3.5 w-3.5" />,
  },
  {
    name: "get_file_record",
    label: "文件记录",
    description: "按文件 ID 获取托管路径和元数据。",
    icon: <FileSearch className="h-3.5 w-3.5" />,
  },
  {
    name: "rag_search",
    label: "资料检索",
    description: "搜索已索引的课程材料和证据片段。",
    icon: <Search className="h-3.5 w-3.5" />,
  },
  {
    name: "propose_external_source",
    label: "外部资料候选",
    description: "把有用网页放入用户确认卡片。",
    icon: <Database className="h-3.5 w-3.5" />,
  },
];

export function McpSettingsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <section className="settings-solid-card rounded-[var(--radius-panel)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span>Brevyn MCP</span>
            </div>
            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
              内置课程与资料工具，Agent 运行时自动加载。
            </div>
          </div>
          <div className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-[hsl(var(--status-success)/0.14)] px-2.5 text-[11px] font-semibold text-[hsl(var(--status-success))] shadow-sm ring-1 ring-[hsl(var(--status-success)/0.2)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            已启用
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <McpMetric label="服务器" value="brevyn" />
          <McpMetric label="传输" value="SDK 内置" />
          <McpMetric label="工具" value={`${BREVYN_MCP_TOOLS.length} 个`} />
        </div>
      </section>

      <section className="settings-solid-card rounded-[var(--radius-panel)] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span>内置工具</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {BREVYN_MCP_TOOLS.map((tool) => (
            <div key={tool.name} className="rounded-[var(--radius-card)] border bg-background px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground">
                  {tool.icon}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">{tool.label}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{tool.name}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">{tool.description}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-solid-card rounded-[var(--radius-panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span>自定义 MCP</span>
            </div>
            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
              后续支持 stdio、HTTP、SSE 服务器配置和连接测试。
            </div>
          </div>
          <span className="rounded-[var(--radius-control)] bg-muted px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
            暂未开放
          </span>
        </div>
      </section>
    </div>
  );
}

function McpMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="brevyn-control-surface px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold text-foreground" title={value}>{value}</div>
    </div>
  );
}
