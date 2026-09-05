/**
 * 预检表的行模型：把本地校验结果与服务端预检结果合成一份视图数据。
 *
 * 分成独立模块是为了能单测——「哪些行可以提交」这个判断错了，后果是把不该导的内容写进生产。
 */

import type { ImportIssue, ImportOperation, PreflightRow } from "./import-contracts.ts";
import type { ValidationIssue } from "./local-validation.ts";
import type { ReadPackageResult } from "./package-reader.ts";

export type ReviewIssue = {
  readonly severity: "error" | "notice";
  readonly code: string;
  readonly message: string;
  readonly column?: string;
  /** 本地校验还是服务端预检发现的。运营不关心，但排查问题时有用。 */
  readonly origin: "local" | "server";
};

export type ReviewRow = {
  readonly rowKey: string;
  readonly line: number;
  readonly displayName: string;
  readonly operation: ImportOperation;
  readonly characterId: string | null;
  /**
   * 目标角色在库里的**当前**名字，只有服务端预检过的更新行有值。
   *
   * 这是更新行唯一的目标核对手段：`characterId` 是操作员自己填的，拿它回显等于自证；
   * 抄成另一个同样合法的 ID 时，本地和服务端都是绿灯，只有这个名字对不上。
   */
  readonly targetDisplayName: string | null;
  readonly ownerPlatformUserId: string | null;
  readonly portraitPath: string | null;
  readonly issues: readonly ReviewIssue[];
  readonly server: PreflightRow | null;
  /** 有 error 即不可提交。notice 不阻塞。 */
  readonly blocked: boolean;
};

export type ReviewModel = {
  readonly rows: readonly ReviewRow[];
  /** 不属于任何一行的包级问题。 */
  readonly packageIssues: readonly ReviewIssue[];
  readonly passing: number;
  readonly blocked: number;
  /** 包级错误会让整个包不可提交，与逐行错误不同。 */
  readonly packageBlocked: boolean;
};

function fromLocal(issue: ValidationIssue): ReviewIssue {
  return {
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    column: issue.column,
    origin: "local",
  };
}

// 契约里的服务端 issue 只有 code / message，没有列名——不要再往上编一个 column。
function fromServer(issue: ImportIssue): ReviewIssue {
  return {
    severity: "error",
    code: issue.code,
    message: issue.message,
    origin: "server",
  };
}

function text(values: Readonly<Record<string, string>>, key: string): string {
  return (values[key] ?? "").trim();
}

export function buildReviewModel(
  read: ReadPackageResult,
  preflight: readonly PreflightRow[] | null,
  defaultOwner: string | null,
): ReviewModel {
  const serverByRow = new Map((preflight ?? []).map((row) => [row.row_key, row]));

  const localByRow = new Map<string, ReviewIssue[]>();
  const packageIssues: ReviewIssue[] = [];
  for (const issue of read.issues) {
    const converted = fromLocal(issue);
    if (!issue.rowKey) {
      packageIssues.push(converted);
      continue;
    }
    const bucket = localByRow.get(issue.rowKey);
    if (bucket) bucket.push(converted);
    else localByRow.set(issue.rowKey, [converted]);
  }

  const rows: ReviewRow[] = read.rows.map((row) => {
    const rowKey = text(row.values, "row_key");
    const characterId = text(row.values, "character_id") || null;
    const server = serverByRow.get(rowKey) ?? null;
    const issues = [
      ...(localByRow.get(rowKey) ?? []),
      ...(server?.issues ?? []).map(fromServer),
    ];
    return {
      rowKey,
      line: row.line,
      displayName: text(row.values, "display_name"),
      // 服务端的判定优先：它看得到角色是否真的存在，本地只能看这一列填没填。
      operation: server?.operation ?? ((characterId ? "update" : "create") as ImportOperation),
      // 契约的预检行不回传 character_id，本地这一列就是唯一来源。
      characterId,
      targetDisplayName: server?.target_display_name ?? null,
      // 服务端已经把「行内留空则落到默认归属」算过一遍，它的结论优先。
      ownerPlatformUserId:
        server?.owner_platform_user_id ?? (text(row.values, "owner_platform_user_id") || defaultOwner),
      portraitPath: text(row.values, "portrait_file") || null,
      issues,
      server,
      blocked: issues.some((issue) => issue.severity === "error"),
    };
  });

  return {
    rows,
    packageIssues,
    passing: rows.filter((row) => !row.blocked).length,
    blocked: rows.filter((row) => row.blocked).length,
    packageBlocked: packageIssues.some((issue) => issue.severity === "error"),
  };
}

/**
 * 可提交的行。包级错误存在时一行都不提交——包结构不对的情况下，逐行"通过"是没有意义的。
 */
export function submittableRows(model: ReviewModel): readonly ReviewRow[] {
  if (model.packageBlocked) return [];
  return model.rows.filter((row) => !row.blocked);
}
