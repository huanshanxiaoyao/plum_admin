export type ProjectDocument = {
  title: string;
  href: string;
};

// Add project documents here. Linked resources enforce their own access permissions.
export const PROJECT_DOCUMENTS: readonly ProjectDocument[] = [
  { title: "角色导入使用指南", href: "/imports/user-guide" },
  { title: "角色导入打包规范", href: "/imports/package-guide" },
];
