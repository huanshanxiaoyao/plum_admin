import { defineListSection } from "../admin-sections/definition";
import { formatDateTime, identityCell, statusCell } from "../admin-sections/presentation";

export const creatorsSection = defineListSection({
  section: "creators",
  config: {
    eyebrow: "CREATORS",
    title: "创作者",
    description: "资料、作品与创作资格",
    searchPlaceholder: "搜索用户 ID 或公开名称",
    columns: ["创作者", "资格", "草稿", "已发布", "被下架", "最近创作"],
    statusOptions: [
      { value: "active", label: "正常" },
      { value: "restricted", label: "受限" },
    ],
  },
  rows: (items) => items.map((item) => [
    identityCell(item.display_name, item.platform_user_id, item.profile_id),
    statusCell(item.control_status === "active" ? "正常" : "受限", item.control_status === "active" ? "good" : "warn"),
    item.draft_count.toLocaleString("zh-CN"),
    item.published_count.toLocaleString("zh-CN"),
    item.takedown_count.toLocaleString("zh-CN"),
    formatDateTime(item.last_created_at),
  ]),
});
