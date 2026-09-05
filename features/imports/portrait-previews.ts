"use client";

import { useEffect, useState } from "react";
import type { ReadPackageResult } from "./package-reader.ts";

/** 缩略图只做核对用，别把整包原图都解到内存里。 */
const MAX_PREVIEWS = 60;

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * 逐行的立绘本地预览（PRD FR-IMP-03）。**图片不上传就能看见。**
 *
 * 表格里只有文件名时，"这一行配的是不是这张图"要靠人记住 `003_mei.jpg` 长什么样——
 * 而错配图片在预检阶段是完全合法的，一路到发布都没人拦。缩略图把这个核对从记忆变成看一眼。
 *
 * object URL 必须在**包被换掉时**一起撤销，不是只在卸载时：运营会反复改包重传，
 * 漏撤销的话每传一次就把一整包图片永久钉在内存里。
 */
export function usePortraitPreviews(read: ReadPackageResult | null): ReadonlyMap<string, string> {
  // 连同来源一起存。换包后旧表立刻失效（下面按 `source` 判断），不需要在 effect 里同步
  // setState 清空——那会多触发一轮渲染，也被 react-hooks/set-state-in-effect 挡下。
  const [built, setBuilt] = useState<{
    readonly source: ReadPackageResult;
    readonly previews: ReadonlyMap<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!read?.archive) return;
    const archive = read.archive;
    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      const previews = new Map<string, string>();
      for (const image of Array.from(read.images.values()).slice(0, MAX_PREVIEWS)) {
        if (cancelled) break;
        try {
          const url = URL.createObjectURL(await archive.readBlob(image.entry, image.contentType));
          created.push(url);
          previews.set(image.path, url);
        } catch {
          // 单张解不开不影响其余：这一行会退回只显示文件名，校验那一列另有报错。
        }
      }
      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url);
        return;
      }
      setBuilt({ source: read, previews });
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [read]);

  // 上一包的 object URL 在切换时已经撤销了，绝不能继续交出去。
  return built && built.source === read ? built.previews : EMPTY;
}
