import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  daysUntilExpiry,
  evalInspectRetentionDays,
  evalReportsDir,
  evalReportsEnabled,
} from "../lib/eval-reports/config.ts";
import {
  INSPECT_PREFIX,
  isSafeRunId,
  listEvalReports,
  parseManifest,
  readEvalReportHtml,
  resolveRunDir,
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

function inspection(overrides = {}) {
  return {
    run_id: "conn_abc-20260903T010812Z",
    mode: "inspect",
    connection_id: "conn_abc",
    generated_at: "2026-09-03T01:08:12+00:00",
    findings: { high: 1, medium: 1, low: 2 },
    contains_user_plaintext: true,
    ...overrides,
  };
}

async function seedRoot(runs) {
  const root = await mkdtemp(join(tmpdir(), "eval-reports-"));
  for (const [runId, { manifest: body, html, area, htmlName }] of Object.entries(runs)) {
    const dir = area === "inspect" ? join(root, INSPECT_PREFIX, runId) : join(root, runId);
    await mkdir(dir, { recursive: true });
    if (body !== undefined) {
      await writeFile(
        join(dir, "manifest.json"),
        typeof body === "string" ? body : JSON.stringify(body),
      );
    }
    if (html !== undefined) await writeFile(join(dir, htmlName ?? "report.html"), html);
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
  assert.notEqual(parseManifest(runId, "trajectory", manifest()), null);
  // run_id 必须与目录名一致：产物错放时最便宜的一道完整性检查。
  assert.equal(parseManifest("other-run", "trajectory", manifest()), null);
  assert.equal(parseManifest(runId, "trajectory", manifest({ mode: "D" })), null);
  assert.equal(parseManifest(runId, "trajectory", manifest({ findings: { high: 1, medium: 1 } })), null);
  assert.equal(parseManifest(runId, "trajectory", manifest({ findings: { high: -1, medium: 0, low: 0 } })), null);
  assert.equal(parseManifest(runId, "trajectory", manifest({ contains_user_plaintext: "no" })), null);
  assert.equal(parseManifest(runId, "trajectory", manifest({ model: "" })), null);
  assert.equal(parseManifest(runId, "trajectory", null), null);
  assert.equal(parseManifest(runId, "trajectory", "reference-trajectory"), null);
});

test("a manifest whose mode disagrees with its directory is rejected", () => {
  // 轨迹报告躺在 _inspect/ 下会被当成会过期的东西而清掉；诊断报告躺在根下则永远不会被
  // 清掉。两种错法都很难在事后看出来，因此在解析时就挡住。
  assert.equal(parseManifest("reference-trajectory", "inspect", manifest()), null);
  assert.equal(parseManifest("conn_abc-20260903T010812Z", "trajectory", inspection()), null);
});

test("an inspect manifest needs a connection and must admit it carries plaintext", () => {
  const runId = "conn_abc-20260903T010812Z";
  const parsed = parseManifest(runId, "inspect", inspection());
  assert.equal(parsed?.mode, "inspect");
  assert.equal(parsed?.area, "inspect");
  assert.equal(parsed?.connectionId, "conn_abc");
  assert.equal(parsed?.containsUserPlaintext, true);
  // 诊断没有轨迹与模型：它一次模型都不调。
  assert.equal("model" in parsed, false);
  assert.equal("trajectory" in parsed, false);

  assert.equal(parseManifest(runId, "inspect", inspection({ connection_id: "" })), null);
  // 改成 false 会让页面不再提示过期，因此不接受。
  assert.equal(
    parseManifest(runId, "inspect", inspection({ contains_user_plaintext: false })),
    null,
  );
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

test("both areas are listed together, newest first", async () => {
  const root = await seedRoot({
    "run-old": {
      manifest: manifest({ run_id: "run-old", generated_at: "2026-08-01T00:00:00Z" }),
      html: "<p>old</p>",
    },
    "conn_abc-20260903T010812Z": {
      area: "inspect",
      manifest: inspection(),
      html: "<p>diagnosis</p>",
      htmlName: "inspection.html",
    },
  });
  await withRoot(root, async () => {
    const listing = await listEvalReports();
    assert.deepEqual(
      listing.reports.map((report) => [report.runId, report.area]),
      [["conn_abc-20260903T010812Z", "inspect"], ["run-old", "trajectory"]],
    );
    assert.equal(listing.skipped, 0);
  });
});

test("the diagnosis body keeps its own filename and is still served", async () => {
  const root = await seedRoot({
    "conn_abc-20260903T010812Z": {
      area: "inspect",
      manifest: inspection(),
      html: "<h1>诊断</h1>",
      htmlName: "inspection.html",
    },
  });
  await withRoot(root, async () => {
    // 发布端不改名，因此查看端两个名字都要认。
    assert.equal(await readEvalReportHtml("conn_abc-20260903T010812Z"), "<h1>诊断</h1>");
    const dir = await resolveRunDir("conn_abc-20260903T010812Z", "inspect");
    assert.equal(dir?.endsWith(join(INSPECT_PREFIX, "conn_abc-20260903T010812Z")), true);
    // 限定在轨迹层找就应当找不到它。
    assert.equal(await resolveRunDir("conn_abc-20260903T010812Z", "trajectory"), null);
  });
});

test("diagnosis reports expire on the retention window, not on file mtime", () => {
  const previous = process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS;
  try {
    delete process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS;
    // 与后端 PLUM_DEBUG_CONSOLE_RETENTION_DAYS 同默认值。
    assert.equal(evalInspectRetentionDays(), 7);
    // 0 或负数不代表「立刻删」，只代表配错了。
    process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS = "0";
    assert.equal(evalInspectRetentionDays(), 7);
    process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS = "not-a-number";
    assert.equal(evalInspectRetentionDays(), 7);

    process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS = "7";
    const generated = "2026-09-03T00:00:00Z";
    assert.equal(daysUntilExpiry(generated, new Date("2026-09-05T00:00:00Z")), 5);
    assert.equal(daysUntilExpiry(generated, new Date("2026-09-10T00:00:00Z")), 0);
    // 已经过期很久也只报 0，不报负数。
    assert.equal(daysUntilExpiry(generated, new Date("2026-10-01T00:00:00Z")), 0);
    // 解析不出来的时间返回 null——调用方据此选择「不删、留给人看」。
    assert.equal(daysUntilExpiry("尚未生成", new Date()), null);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS;
    else process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS = previous;
  }
});
