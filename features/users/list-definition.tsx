import { defineListSection } from "../admin-sections/definition";
import { formatDateTime, identityCell, stackedCell, statusCell } from "../admin-sections/presentation";

export const usersSection = defineListSection({
  section: "users",
  config: {
    eyebrow: "USERS",
    title: "用户",
    description: "Plum Membership 用户",
    searchPlaceholder: "搜索平台用户 ID 或显示名称",
    columns: ["用户", "Membership", "订阅", "角色数", "最近活跃"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "disabled", label: "Disabled" },
    ],
  },
  rows: (items) => items.map((item) => [
    identityCell(item.display_name, item.platform_user_id, item.masked_login),
    statusCell(item.membership_status === "active" ? "Active" : "Disabled", item.membership_status === "active" ? "good" : "warn"),
    stackedCell(item.subscription.plan, item.subscription.status, `${item.platform_user_id}-plan`),
    item.character_count.toLocaleString("zh-CN"),
    formatDateTime(item.last_active_at),
  ]),
});
