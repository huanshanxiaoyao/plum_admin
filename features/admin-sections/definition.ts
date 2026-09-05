import type { ReactNode } from "react";
import type { AdminModuleSection } from "../admin-navigation/modules.ts";
import type {
  AdminListQuery,
  AdminListResourceMap,
  AdminListSection,
  PageInfo,
} from "../admin-resources/contracts.ts";
import { listAdminResources } from "../admin-resources/data-source.ts";
import type { AdminIdentity } from "../../lib/auth/types.ts";

export type StatusOption = { value: string; label: string };

export type SectionConfig = {
  eyebrow: string;
  title: string;
  description: string;
  searchPlaceholder: string;
  columns: readonly string[];
  statusOptions?: readonly StatusOption[];
};

export type SectionLoadContext = {
  identity: AdminIdentity;
};

export type SectionLoadResult = {
  rows: ReactNode[][];
  page: PageInfo;
};

export type AdminSectionDefinition = {
  section: AdminModuleSection;
  config: SectionConfig;
  load?: (query: AdminListQuery, context: SectionLoadContext) => Promise<SectionLoadResult>;
};

type ListSectionOptions<Section extends AdminListSection> = {
  section: Section;
  config: SectionConfig;
  rows: (
    items: AdminListResourceMap[Section][],
    context: SectionLoadContext,
  ) => ReactNode[][];
};

export function defineListSection<Section extends AdminListSection>(
  options: ListSectionOptions<Section>,
): AdminSectionDefinition {
  return {
    section: options.section,
    config: options.config,
    async load(query, context) {
      const response = await listAdminResources(options.section, query);
      return { rows: options.rows(response.data, context), page: response.page };
    },
  };
}
