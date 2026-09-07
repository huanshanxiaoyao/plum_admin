/**
 * 立绘直传编排。
 *
 * 三条硬性要求，都体现在实现里：
 *
 * 1. **逐张取、逐张放。** 图片从压缩包里解出来立刻上传，传完不再持有引用。一次性把
 *    100 张图解进内存会打爆标签页。
 * 2. **单张失败不拖垮整批。** 该行标记失败，其余继续——与提交阶段"只导入通过的行"同一个语义。
 * 3. **可续传。** 已经成功的行下次跳过。运营重传同一个包不该重新上传所有图片。
 *
 * 传输层通过参数注入，所以这套编排逻辑不依赖浏览器也不依赖后端，可以直接单测。
 */

import type { PackageImage } from "./package-reader.ts";

export type UploadTask = {
  readonly rowKey: string;
  readonly image: PackageImage;
};

export type UploadedPortrait = {
  readonly mediaId: string;
  readonly imageSetId: string;
};

export type UploadTransport = {
  /** 完成"签发凭证 → 直传 → complete → 生成图片集"整条链路，返回可用于导入的引用。 */
  upload(task: UploadTask): Promise<UploadedPortrait>;
};

export type UploadFailure = {
  readonly code: string;
  readonly message: string;
};

export type UploadOutcome =
  | { readonly rowKey: string; readonly ok: true; readonly portrait: UploadedPortrait }
  | ({ readonly rowKey: string; readonly ok: false } & UploadFailure);

export type UploadProgress = {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly inFlight: readonly string[];
};

export type RunUploadsOptions = {
  /** 已经传成功的行，直接跳过。续传靠它。 */
  readonly done?: ReadonlyMap<string, UploadedPortrait>;
  /** 并发数。默认 3——再高对单个 S3 前缀没有收益，还会让进度条跳得让人看不懂。 */
  readonly concurrency?: number;
  readonly onProgress?: (progress: UploadProgress) => void;
  readonly signal?: AbortSignal;
};

const DEFAULT_CONCURRENCY = 3;

function failure(rowKey: string, caught: unknown): UploadOutcome {
  if (caught instanceof Error) {
    const code = "code" in caught && typeof caught.code === "string" ? caught.code : "upload_failed";
    return { rowKey, ok: false, code, message: caught.message };
  }
  return { rowKey, ok: false, code: "upload_failed", message: "立绘上传失败。" };
}

export async function runUploads(
  tasks: readonly UploadTask[],
  transport: UploadTransport,
  options: RunUploadsOptions = {},
): Promise<readonly UploadOutcome[]> {
  const done = options.done ?? new Map<string, UploadedPortrait>();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

  const pending = tasks.filter((task) => !done.has(task.rowKey));
  const outcomes: UploadOutcome[] = tasks
    .filter((task) => done.has(task.rowKey))
    .map((task) => ({ rowKey: task.rowKey, ok: true, portrait: done.get(task.rowKey)! }));

  let completed = outcomes.length;
  let failed = 0;
  const inFlight = new Set<string>();
  const total = tasks.length;

  function report() {
    options.onProgress?.({ total, completed, failed, inFlight: [...inFlight] });
  }
  report();

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      if (options.signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;

      const task = pending[index];
      inFlight.add(task.rowKey);
      report();
      try {
        const portrait = await transport.upload(task);
        outcomes.push({ rowKey: task.rowKey, ok: true, portrait });
        completed += 1;
      } catch (caught) {
        outcomes.push(failure(task.rowKey, caught));
        failed += 1;
      } finally {
        inFlight.delete(task.rowKey);
        report();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));

  // 结果按原始任务顺序返回，界面上行的次序才不会随并发完成时间跳动。
  const byRow = new Map(outcomes.map((outcome) => [outcome.rowKey, outcome]));
  return tasks.map((task) => byRow.get(task.rowKey)).filter((outcome): outcome is UploadOutcome => !!outcome);
}

export function succeededPortraits(
  outcomes: readonly UploadOutcome[],
): ReadonlyMap<string, UploadedPortrait> {
  return new Map(
    outcomes
      .filter((outcome): outcome is Extract<UploadOutcome, { ok: true }> => outcome.ok)
      .map((outcome) => [outcome.rowKey, outcome.portrait]),
  );
}

/**
 * 失败的行及其原因。
 *
 * 编排层已经把每一行的 `code` / `message` 捞出来了，之前却只用来过滤"哪些行不提交"，
 * 原因就地丢掉——运营看到的是「失败 9」，不知道为什么，排查只能翻服务器日志。
 * 这些失败往往在服务端一侧毫无痕迹（浏览器被 CSP 或跨域拦下时，请求根本没发出去），
 * 所以浏览器里这份原因是唯一的现场。
 */
export function failedUploads(
  outcomes: readonly UploadOutcome[],
): ReadonlyMap<string, UploadFailure> {
  return new Map(
    outcomes
      .filter((outcome): outcome is Extract<UploadOutcome, { ok: false }> => !outcome.ok)
      .map((outcome) => [outcome.rowKey, { code: outcome.code, message: outcome.message }]),
  );
}
