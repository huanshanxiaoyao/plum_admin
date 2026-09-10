import type { components } from "../../contracts/generated/admin-api";

export type FactoryCostMetrics = components["schemas"]["AdminCharacterFactoryCostMetrics"];
export type FactoryCostCall = components["schemas"]["AdminCharacterFactoryCostCall"];
export type FactoryCostReport = components["schemas"]["AdminCharacterFactoryCostReport"];

export const COST_PHASE_LABELS: Readonly<Record<string, string>> = {
  candidate_plan: "候选拆解",
  image_understand: "参考图理解",
  text_generate: "文字生成",
  image_generate: "图片生成",
  revise_text: "文字修改",
  revise_image: "图片修改",
  preview_turn: "对话测试",
};

export function formatFactoryCost(micros: number | null): string {
  return micros === null ? "待确认" : `$${(micros / 1_000_000).toFixed(6)}`;
}

export function formatFactoryTokens(tokens: number | null): string {
  return tokens === null ? "待确认" : new Intl.NumberFormat("zh-CN").format(tokens);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableCount(value: unknown): boolean {
  return value === null || isCount(value);
}

function isMetrics(value: unknown): boolean {
  return isObject(value)
    && ["cost_usd_micros", "input_tokens", "output_tokens"].every((key) => isNullableCount(value[key]))
    && ["known_cost_usd_micros", "total_calls", "unpriced_calls", "pending_calls"].every((key) => isCount(value[key]));
}

export function isFactoryCostReport(value: unknown): value is FactoryCostReport {
  if (!isObject(value) || typeof value.tracking_enabled !== "boolean"
    || typeof value.tracking_incomplete !== "boolean" || !isCount(value.missing_calls)
    || value.currency !== "USD" || !isMetrics(value.totals) || !isMetrics(value.shared)) return false;
  return Array.isArray(value.candidates) && value.candidates.every((item) => isMetrics(item) && typeof item.candidate_id === "string")
    && Array.isArray(value.phases) && value.phases.every((item) => isMetrics(item) && typeof item.phase === "string")
    && Array.isArray(value.calls) && value.calls.every((call) => isObject(call)
      && ["id", "phase", "created_at"].every((key) => typeof call[key] === "string")
      && ["candidate_id", "task_id", "provider", "model", "provider_request_id", "error_code"].every((key) => call[key] === null || typeof call[key] === "string")
      && ["cycle", "attempt", "cost_usd_micros", "input_tokens", "output_tokens"].every((key) => isNullableCount(call[key]))
      && ["priced", "unpriced", "pending"].includes(String(call.status))
      && ["running", "succeeded", "failed", "unknown"].includes(String(call.outcome)));
}
