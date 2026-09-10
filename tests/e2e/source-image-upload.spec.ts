import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { crc32 } from "node:zlib";
import { expect, test } from "@playwright/test";
import ts from "typescript";

function pngTextChunk(key: string, value: string): Buffer {
  const payload = Buffer.from(`${key}\0${value}`);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("tEXt", 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

function pngChunkTypes(bytes: Buffer): string[] {
  const types: string[] = [];
  for (let offset = 8; offset < bytes.length; offset += bytes.readUInt32BE(offset) + 12) {
    types.push(bytes.toString("ascii", offset + 4, offset + 8));
  }
  return types;
}

test("source uploads remove PNG metadata and declare the re-encoded bytes", async ({ page }, testInfo) => {
  await page.route("https://upload-test.invalid/", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
  await page.goto("https://upload-test.invalid/");
  const cleanPng = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 12;
    canvas.height = 18;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f02839";
    context.fillRect(0, 0, 12, 18);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const original = Buffer.concat([
    cleanPng.subarray(0, 33),
    pngTextChunk("Author", "fixture author"),
    pngTextChunk("XML:com.adobe.xmp", "<xmp>fixture metadata</xmp>"),
    cleanPng.subarray(33),
  ]);
  expect(pngChunkTypes(original)).toContain("tEXt");
  const source = await readFile(new URL("../../features/imports/import-api.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result = await page.evaluate(async ({ code, original }) => {
    const api: { uploadSourceImageFile?: (file: File, owner: string) => Promise<string> } = {};
    new Function("exports", code)(api);
    let grant: Record<string, unknown> = {};
    let uploaded: Blob | undefined;
    const paths: string[] = [];
    window.fetch = async (input, init) => {
      const path = String(input);
      paths.push(path);
      if (path.endsWith("/media/uploads")) {
        grant = JSON.parse(init!.body as string);
        return Response.json({ data: { media: { media_id: "source-clean" }, upload: { upload_url: "https://storage.invalid/", upload_fields: { key: "source-clean" } } } });
      }
      if (path === "https://storage.invalid/") {
        uploaded = (init!.body as FormData).get("file") as Blob;
        return new Response(null, { status: 204 });
      }
      return Response.json({ data: {} });
    };
    const file = new File([Uint8Array.from(atob(original), (char) => char.charCodeAt(0))], "reference.png", { type: "image/png" });
    const mediaId = await api.uploadSourceImageFile!(file, "owner-test");
    const uploadedBytes = Array.from(new Uint8Array(await uploaded!.arrayBuffer()));
    const bitmap = await createImageBitmap(uploaded!);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { mediaId, grant, uploadedBytes, paths, pixel: Array.from(context.getImageData(0, 0, 1, 1).data) };
  }, { code, original: original.toString("base64") });
  const uploaded = Buffer.from(result.uploadedBytes);
  expect(result.mediaId).toBe("source-clean");
  expect(result.paths).toEqual(["/api/admin/imports/media/uploads", "https://storage.invalid/", "/api/admin/imports/media/uploads/source-clean/complete"]);
  expect(result.grant).toMatchObject({ owner_platform_user_id: "owner-test", filename: "reference.png", content_type: "image/png", width: 12, height: 18, bytes: uploaded.length, checksum_sha256: createHash("sha256").update(uploaded).digest("base64") });
  expect(pngChunkTypes(uploaded)).not.toEqual(expect.arrayContaining(["tEXt"]));
  expect(pngChunkTypes(uploaded).some((type) => ["tEXt", "zTXt", "iTXt", "eXIf"].includes(type))).toBe(false);
  expect(result.pixel).toEqual([240, 40, 57, 255]);
  const outputPath = testInfo.outputPath("normalized-reference.png");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, uploaded);
  await testInfo.attach("normalized-reference.png", { path: outputPath, contentType: "image/png" });
});
