import { defineStaticSection } from "../admin-sections/definition";

export const auditSection = defineStaticSection("audit", {
  eyebrow: "AUDIT",
  title: "操作审计",
  description: "后台操作与结果",
  searchPlaceholder: "搜索操作者或资源 ID",
  columns: ["时间", "操作者", "动作", "资源", "结果", "请求 ID"],
});
