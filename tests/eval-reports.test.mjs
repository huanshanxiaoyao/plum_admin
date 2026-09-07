import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evalReportsDir, evalReportsEnabled } from "../lib/eval-reports/config.ts";
import {
  isSafeRunId,
  listEvalReports,
  parseManifest,
  readEvalReportHtml,
} from "../lib/eval-reports/store.ts";
import { ADMIN_MODULES } from "../features/admin-navigation/modules.ts";

function manifest(overrides = {}) {
  return {
    run_id: "reference-trajectory",
    trajectory: "mem-reference-001",
    mode: "C",
    model: "deepseek-v4-flash",
    generated_at: "2026-08-31T23:58:00Z",
    findings: { high: 1, medium: 1, low: 2 },
    contains_user_plaintext: false,
    ...overrides,
  };
}

async function seedRoot(runs) {
  const root = await mkdtemp(join(tmpdir(), "eval-reports-"));
  for (const [runId, { manifest: body, html }] of Object.entries(runs)) {
    await mkdir(join(root, runId), { recursive: true });
    if (body !== undefined) {
      await writeFile(
        join(root, runId, "manifest.json"),
        typeof body === "string" ? body : JSON.stringify(body),
      );
    }
    if (html !== undefined) await writeFile(join(root, runId, "report.html"), html);
  }
  return root;
}

async function withRoot(root, run) {
  const previous = process.env.ADMIN_EVAL_REPORTS_DIR;
  process.env.ADMIN_EVAL_REPORTS_DIR = root;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EVAL_REPORTS_DIR;
    else process.env.ADMIN_EVAL_REPORTS_DIR = previous;
  }
}

test("the feature is absent until the directory is configured", async () => {
  const previous = process.env.ADMIN_EVAL_REPORTS_DIR;
  delete process.env.ADMIN_EVAL_REPORTS_DIR;
  try {
    assert.equal(evalReportsDir(), null);
    assert.equal(evalReportsEnabled(), false);
    assert.deepEqual(await listEvalReports(), { reports: [], skipped: 0 });
    assert.equal(await readEvalReportHtml("reference-trajectory"), null);
  } finally {
    if (previous !== undefined) process.env.ADMIN_EVAL_REPORTS_DIR = previous;
  }
});

test("blank configuration counts as unset", () => {
  process.env.ADMIN_EVAL_REPORTS_DIR = "   ";
  assert.equal(evalReportsEnabled(), false);
  delete process.env.ADMIN_EVAL_REPORTS_DIR;
});

test("run ids are limited to one safe path segment", () => {
  assert.equal(isSafeRunId("reference-trajectory"), true);
  assert.equal(isSafeRunId("liveC-all.2026-08-31"), true);
  assert.equal(isSafeRunId(".."), false);
  assert.equal(isSafeRunId("."), false);
  assert.equal(isSafeRunId("../etc/passwd"), false);
  assert.equal(isSafeRunId("a/b"), false);
  assert.equal(isSafeRunId(String.raw`a\b`), false);
  assert.equal(isSafeRunId(""), false);
  assert.equal(isSafeRunId(".hidden"), false);
  assert.equal(isSafeRunId("run "), false);
  assert.equal(isSafeRunId("x".repeat(201)), false);
});

test("a manifest is rejected unless every field is present and well typed", () => {
  const runId = "reference-trajectory";
  assert.notEqual(parseManifest(runId, manifest()), null);
  // run_id 必须与目录名一致：产物错放时最便宜的一道完整性检查。
  assert.equal(parseManifest("other-run", manifest()), null);
  assert.equal(parseManifest(runId, manifest({ mode: "D" })), null);
  assert.equal(parseManifest(runId, manifest({ findings: { high: 1, medium: 1 } })), null);
  assert.equal(parseManifest(runId, manifest({ findings: { high: -1, medium: 0, low: 0 } })), null);
  assert.equal(parseManifest(runId, manifest({ contains_user_plaintext: "no" })), null);
  assert.equal(parseManifest(runId, manifest({ model: "" })), null);
  assert.equal(parseManifest(runId, null), null);
  assert.equal(parseManifest(runId, "reference-trajectory"), null);
});

test("inspect runs are a valid mode and carry the plaintext flag", () => {
  const parsed = parseManifest(
    "inspect-c1",
    manifest({ run_id: "inspect-c1", mode: "inspect", contains_user_plaintext: true }),
  );
  assert.equal(parsed?.mode, "inspect");
  assert.equal(parsed?.containsUserPlaintext, true);
});

test("listing skips broken manifests instead of failing the page", async () => {
  const root = await seedRoot({
    "run-old": {
      manifest: manifest({ run_id: "run-old", generated_at: "2026-08-01T00:00:00Z" }),
      html: "<p>old</p>",
    },
    "run-new": {
      manifest: manifest({ run_id: "run-new", generated_at: "2026-09-01T00:00:00Z" }),
      html: "<p>new</p>",
    },
    "run-broken": { manifest: "{ not json", html: "<p>broken</p>" },
    "run-missing-manifest": { html: "<p>orphan</p>" },
  });
  await withRoot(root, async () => {
    const listing = await listEvalReports();
    assert.deepEqual(
      listing.reports.map((report) => report.runId),
      ["run-new", "run-old"],
    );
    assert.equal(listing.skipped, 2);
  });
});

test("a missing reports directory lists nothing rather than throwing", async () => {
  await withRoot(join(tmpdir(), "eval-reports-does-not-exist-4c1f"), async () => {
    assert.deepEqual(await listEvalReports(), { reports: [], skipped: 0 });
  });
});

test("report reads are confined to the configured directory", async () => {
  const root = await seedRoot({
    "reference-trajectory": { manifest: manifest(), html: "<h1>report</h1>" },
  });
  const outside = await mkdtemp(join(tmpdir(), "eval-outside-"));
  await writeFile(join(outside, "report.html"), "<h1>secret</h1>");
  await mkdir(join(root, "escape"));
  await symlink(join(outside, "report.html"), join(root, "escape", "report.html"));

  await withRoot(root, async () => {
    assert.equal(await readEvalReportHtml("reference-trajectory"), "<h1>report</h1>");
    // 符号链接指到根目录之外：realpath 之后比对前缀才挡得住。
    assert.equal(await readEvalReportHtml("escape"), null);
    assert.equal(await readEvalReportHtml("../../etc/passwd"), null);
    assert.equal(await readEvalReportHtml("missing-run"), null);
  });
});

test("evaluation stays out of the operations navigation entirely", () => {
  // 评测不是运营能力：它有自己的页面，入口只在侧栏底部。进了 ADMIN_MODULES 就等于
  // 声称它是一条日常运营入口，那正是这次要拆掉的东西。
  assert.equal(
    ADMIN_MODULES.some((module) => module.key === "eval" || module.href.startsWith("/eval")),
    false,
  );
});
