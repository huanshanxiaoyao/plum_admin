/**
 * RFC 4180 的 CSV 解析与拼装。解析（导入 manifest）与拼装（导出结果清单）共用一份实现，
 * 保证一进一出的语义对称——导出的文件必须能被自己重新读回来。
 */

export type CsvRecord = {
  /** 记录起始处的物理行号，从 1 开始。引号内的换行不会推进它，因此可直接用于报错定位。 */
  readonly line: number;
  readonly fields: readonly string[];
};

export class CsvParseError extends Error {
  readonly code = "csv_unterminated_quote" as const;
  readonly line: number;

  constructor(line: number) {
    super(`第 ${line} 行有未闭合的双引号：含逗号或换行的内容要用双引号包起来，内容里的双引号写成两个。`);
    this.name = "CsvParseError";
    this.line = line;
  }
}

/**
 * 解析 CSV 文本。
 *
 * 刻意保留空行（产出 `[""]`），不在这里跳过——行号是运营改表的唯一坐标，
 * 一旦解析阶段压缩了行，后面所有报错的行号都会错位。空行由调用方按语义忽略。
 *
 * 宽松处理一处：引号闭合后若紧跟非分隔符（`"a"b`），按字面量续接而不报错。
 * Excel 偶尔会产出这种内容，为此拒绝整个包不划算。
 */
export function parseCsv(text: string): CsvRecord[] {
  // Excel 导出的 UTF-8 CSV 普遍带 BOM，留着会污染第一个列名。
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let physicalLine = 1;
  let recordLine = 1;
  let started = false;
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === "\n") physicalLine += 1;
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      started = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      fields.push(field);
      field = "";
      started = true;
      index += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      index += 1;
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = "";
      started = false;
      physicalLine += 1;
      recordLine = physicalLine;
      continue;
    }

    field += char;
    started = true;
    index += 1;
  }

  if (inQuotes) throw new CsvParseError(recordLine);

  // 文件以换行结束时不产出多余的空记录；否则收尾最后一条。
  if (started || field.length > 0 || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }

  return records;
}

const NEEDS_QUOTING = /[",\r\n]/;

function formatField(value: string): string {
  if (value === "") return "";
  // 首尾空格也要引号，否则 round-trip 会把它吃掉。
  if (NEEDS_QUOTING.test(value) || value !== value.trim()) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export type FormatCsvOptions = {
  /**
   * 是否加 UTF-8 BOM。导出给运营用 Excel 打开的文件必须加，否则中文在简体中文版
   * Windows 的 Excel 里会乱码；机器间传递的文件不要加。
   */
  readonly bom?: boolean;
};

/** 拼装 CSV 文本。行分隔符用 CRLF——RFC 4180 如此规定，Excel 也最稳。 */
export function formatCsv(
  rows: readonly (readonly string[])[],
  options?: FormatCsvOptions,
): string {
  const body = rows.map((row) => row.map(formatField).join(",")).join("\r\n");
  const prefix = options?.bom ? "\uFEFF" : "";
  return rows.length === 0 ? prefix : `${prefix}${body}\r\n`;
}
