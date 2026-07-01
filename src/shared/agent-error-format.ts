const PROMPT_TOO_LONG_PATTERNS = [
  "prompt is too long",
  "prompt_too_long",
  "input is too long",
  "context_length_exceeded",
  "maximum context length",
  "token limit",
  "exceeds the model",
] as const;

const BILLING_PATTERNS = [
  "insufficient balance",
  "balance is not enough",
  "balance not enough",
  "insufficient funds",
  "insufficient credit",
  "not enough credits",
  "no credits",
  "out of credits",
  "insufficient_quota",
  "quota_exceeded",
  "quota exceeded",
  "current quota",
  "billing_hard_limit_reached",
  "billing_not_active",
  "payment required",
  "余额不足",
  "额度不足",
  "可用额度不足",
  "账户余额",
  "账号余额",
  "请充值",
] as const;

const AUTH_PATTERNS = [
  "invalid api key",
  "invalid_api_key",
  "incorrect api key",
  "authentication_error",
  "unauthorized",
  "401",
  "invalid token",
  "invalid_token",
  "token expired",
  "login expired",
] as const;

const FORBIDDEN_PATTERNS = [
  "forbidden",
  "403",
  "permission denied",
  "not allowed",
  "does not have access",
  "model_not_allowed",
] as const;

const TRANSIENT_PATTERNS = [
  "timeout",
  "timed out",
  "aborterror",
  "overloaded",
  "service unavailable",
  "provider_error",
  "service_error",
  "network",
  "fetch failed",
  "connection",
  "econnreset",
  "etimedout",
  "socket hang up",
  "terminated",
  "context_management",
  "500",
  "502",
  "503",
  "504",
] as const;

export function cleanAgentErrorMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value || "");
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/^API Error:\s*/i, "")
    .replace(/^Provider error:\s*/i, "")
    .replace(/^Agent error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatAgentUserError(value: unknown, fallback = "Brevyn 运行时遇到问题，请稍后再试。"): string {
  const message = cleanAgentErrorMessage(value);
  if (!message) return fallback;
  const normalized = message.toLowerCase();

  if (isPromptTooLongAgentError(message)) {
    return "这次输入或上下文太长，模型放不下了。请压缩上下文、删掉一些附件，或开启上下文压缩后再试。";
  }
  if (isAgentBillingError(message)) {
    return "余额或额度不足，当前请求没有成功发出。请充值，或切换到还有可用额度的官方分组后再试。";
  }
  if (AUTH_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "登录状态或模型密钥已失效。请重新登录官方账号，或在设置里重新同步官方模型。";
  }
  if (FORBIDDEN_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "当前账号没有权限使用这个模型或分组。请切换官方分组，或检查订阅状态。";
  }
  if (normalized.includes("rate limit") || normalized.includes("rate_limited") || normalized.includes("too many requests") || /\b429\b/.test(normalized)) {
    return "请求过于频繁，模型服务正在限流。请稍等一下再试，或切换到其他可用分组。";
  }
  if (normalized.includes("configure at least one enabled agent provider")) {
    return "请先在设置里登录官方账号，或配置一个可用的模型 Provider。";
  }
  if (normalized.includes("agent run is already active for this thread")) {
    return "当前会话已有任务正在运行，请等待它完成后再发送。";
  }
  if (normalized.includes("agent run did not start")) {
    return "任务没有成功启动，请稍后再试。";
  }
  if (normalized.includes("missing an api key") || normalized.includes("api key is required")) {
    return "当前模型配置缺少 API Key。请重新同步官方模型，或检查自定义 Provider 设置。";
  }
  if (normalized.includes("session not found") || normalized.includes("no conversation found") || normalized.includes("conversation not found")) {
    return "模型会话状态已失效。Brevyn 会重建会话，请重新发送一次。";
  }
  if (normalized.includes("agent run stopped")) return "已停止本次运行。";
  if (normalized.includes("agent run ended without a result") || normalized.includes("agent provider request failed") || normalized.includes("agent run failed")) {
    return "模型这次没有返回有效结果，请稍后再试。";
  }
  if (TRANSIENT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "模型服务连接不稳定，当前请求中断了。请检查网络后重试。";
  }

  return message;
}

export function isAgentBillingError(value: unknown): boolean {
  const normalized = cleanAgentErrorMessage(value).toLowerCase();
  return BILLING_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isPromptTooLongAgentError(value: unknown): boolean {
  const normalized = cleanAgentErrorMessage(value).toLowerCase();
  return PROMPT_TOO_LONG_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isNonRetryableAgentError(value: unknown): boolean {
  const normalized = cleanAgentErrorMessage(value).toLowerCase();
  if (!normalized) return true;
  if (isPromptTooLongAgentError(normalized) || isAgentBillingError(normalized)) return true;
  if (AUTH_PATTERNS.some((pattern) => normalized.includes(pattern))) return true;
  if (FORBIDDEN_PATTERNS.some((pattern) => normalized.includes(pattern))) return true;
  return false;
}
