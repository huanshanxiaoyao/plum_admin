import { StaffStatusAction } from "./staff-status-action";
import { defineListSection } from "../admin-sections/definition";
import { formatDateTime, identityCell, statusCell } from "../admin-sections/presentation";

export const staffSection = defineListSection({
  section: "staff",
  config: {
    eyebrow: "ACCESS",
    title: "后台成员",
    description: "Operator 与 Admin",
    searchPlaceholder: "搜索姓名或 Open ID",
    columns: ["成员", "邮箱", "角色", "状态", "首次登录", "最近登录", "操作"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "disabled", label: "Disabled" },
    ],
  },
  rows: (items, { identity }) => {
    const canManage = identity.capabilities.includes("staff.manage");
    return items.map((item) => [
      identityCell(item.display_name, item.open_id, item.en_name ?? undefined),
      item.email || "--",
      statusCell(item.role === "admin" ? "Admin" : "Operator", item.role === "admin" ? "good" : "muted"),
      statusCell(item.status === "active" ? "Active" : "Disabled", item.status === "active" ? "good" : "warn"),
      formatDateTime(item.created_at),
      formatDateTime(item.last_login_at),
      canManage ? <StaffStatusAction key={item.open_id} member={item} /> : <span key={item.open_id}>只读</span>,
    ]);
  },
});
