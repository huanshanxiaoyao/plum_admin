import { defineListSection } from "../admin-sections/definition";
import { formatDateTime, identityCell, planCell, statusCell } from "../admin-sections/presentation";

export const subscriptionsSection = defineListSection({
  section: "subscriptions",
  config: {
    eyebrow: "ENTITLEMENTS",
    title: "用户订阅",
    description: "订阅方案与当前状态（只读）",
    searchPlaceholder: "搜索平台用户 ID 或显示名称",
    columns: ["用户", "方案", "状态", "支付连接", "更新时间"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  rows: (items) => items.map((item) => [
    identityCell(item.display_name, item.platform_user_id),
    planCell(item.plan, `${item.id}-plan`),
    statusCell(item.status === "active" ? "Active" : "Cancelled", item.status === "active" ? "good" : "muted"),
    statusCell("未接支付", "warn"),
    formatDateTime(item.updated_at),
  ]),
});
