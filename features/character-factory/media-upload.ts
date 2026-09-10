import { uploadSourceImageFile } from "../imports/import-api.ts";

export type FactoryUploadProgress = {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
};

export type FactoryUploadFailure = {
  readonly file: File;
  readonly message: string;
};

export type FactorySourceUploadResult = {
  readonly mediaIds: readonly (string | null)[];
  readonly uploaded: ReadonlyMap<File, string>;
  readonly failures: readonly FactoryUploadFailure[];
};

type SourceUploader = (file: File, ownerPlatformUserId: string) => Promise<string>;

export async function uploadFactorySourceFiles(
  files: readonly File[],
  ownerPlatformUserId: string,
  options: {
    readonly done?: ReadonlyMap<File, string>;
    readonly onProgress?: (progress: FactoryUploadProgress) => void;
    readonly uploader?: SourceUploader;
  } = {},
): Promise<FactorySourceUploadResult> {
  const uploader = options.uploader ?? uploadSourceImageFile;
  const uploaded = new Map(options.done ?? []);
  const failures: FactoryUploadFailure[] = [];
  let completed = files.filter((file) => uploaded.has(file)).length;
  let cursor = 0;

  function report() {
    options.onProgress?.({ total: files.length, completed, failed: failures.length });
  }
  report();

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= files.length) return;
      const file = files[index];
      if (uploaded.has(file)) continue;
      try {
        uploaded.set(file, await uploader(file, ownerPlatformUserId));
      } catch (caught) {
        failures.push({
          file,
          message: caught instanceof Error ? caught.message : "图片上传失败。",
        });
      } finally {
        completed += 1;
        report();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  return {
    mediaIds: files.map((file) => uploaded.get(file) ?? null),
    uploaded,
    failures,
  };
}
