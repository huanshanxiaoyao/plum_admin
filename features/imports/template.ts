import { formatCsv } from "./csv.ts";
import { MANIFEST_FIELD_NAMES } from "./manifest-schema.ts";

export const TEMPLATE_FILENAME = "plum_characters_manifest_template.csv";

/**
 * 示例行的取值。刻意做成一条**能通过校验**的完整数据，而不是字段说明。
 *
 * CSV 没有注释语法：任何"说明行"都会被当成一行角色数据解析并报错，反而制造第一次失败。
 * 字段含义放在后台的打包规范页，这里只给一个可以直接照着改的样例。
 */
const EXAMPLE: Readonly<Record<string, string>> = {
  row_key: "001_luna",
  display_name: "Luna",
  gender: "female",
  intro: "深夜电台的主播，声音是她唯一的武器。",
  opening_scene: "凌晨两点，直播间的红灯亮着，她推了推耳机：「今晚，还有人醒着吗？」",
  character_settings: "沉稳、克制，习惯用提问代替回答。不主动谈论自己的过去。",
  creator_declared_rating: "general",
  portrait_file: "images/001_luna.png",
  owner_platform_user_id: "",
  character_id: "",
  example_dialogues: "",
  response_rules: "回复保持在三句以内，除非用户明确要求展开。",
  tag_ids: "tag_healing|tag_daily",
  visibility: "public",
  portrait_crop: "",
  avatar_crop: "",
  note: "",
};

/**
 * 产出模板 CSV。带 BOM——运营大概率直接用 Excel 打开，不带 BOM 中文会乱码。
 *
 * 列表包含全部可选列。少一列只是用默认值，但运营看不见的列就不会想起来能填。
 */
export function buildManifestTemplate(): string {
  const header = [...MANIFEST_FIELD_NAMES];
  const example = header.map((name) => EXAMPLE[name] ?? "");
  return formatCsv([header, example], { bom: true });
}
