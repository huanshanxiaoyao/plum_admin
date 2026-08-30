import { defineListSection } from "../admin-sections/definition";
import { formatDateTime, identityCell, statusCell } from "../admin-sections/presentation";

export const charactersSection = defineListSection({
  section: "characters",
  config: {
    eyebrow: "CONTENT",
    title: "角色管理",
    description: "Character 与 Work",
    searchPlaceholder: "搜索角色 ID、名称或创作者",
    columns: ["角色", "来源", "创作者", "状态", "评级", "更新时间"],
    statusOptions: [
      { value: "active", label: "Active" },
      { value: "takedown", label: "已下架" },
    ],
  },
  rows: (items) => items.map((item) => [
    identityCell(item.display_name, item.id, item.visibility === "private" ? "Private" : undefined),
    statusCell(item.source === "official" ? "Official" : "UGC", item.source === "official" ? "good" : "muted"),
    identityCell(item.creator.display_name, item.creator.platform_user_id),
    statusCell(item.status === "active" ? "Active" : "已下架", item.status === "active" ? "good" : "warn"),
    statusCell(item.content_rating === "general" ? "General" : "Mature", item.content_rating === "mature" ? "warn" : "muted"),
    formatDateTime(item.updated_at),
  ]),
});
