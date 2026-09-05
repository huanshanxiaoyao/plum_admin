import assert from "node:assert/strict";
import test from "node:test";
import {
  IMPORT_CAPABILITY,
  canUseImports,
  importWriteAvailability,
} from "../features/imports/access.ts";
import { TEMPLATE_FILENAME, buildManifestTemplate } from "../features/imports/template.ts";
import { parseManifestText, validateManifestRows } from "../features/imports/local-validation.ts";
import { MANIFEST_FIELD_NAMES } from "../features/imports/manifest-schema.ts";
import { capabilitiesForRole } from "../lib/auth/capabilities.ts";

function withEnvironment(values, run) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("导入复用日常运营能力，operator 与 admin 都能用", () => {
  assert.equal(IMPORT_CAPABILITY, "operations.access");
  assert.equal(canUseImports(capabilitiesForRole("operator")), true);
  assert.equal(canUseImports(capabilitiesForRole("admin")), true);
});

test("没有 operations.access 的会话不能进导入台", () => {
  assert.equal(canUseImports([]), false);
  assert.equal(canUseImports(["staff.manage"]), false);
});

test("fixture 数据源下写入被禁用，并说明原因", () => {
  withEnvironment({ ADMIN_DATA_SOURCE: "fixture", ADMIN_API_WRITE_ENABLED: "true" }, () => {
    const availability = importWriteAvailability();
    assert.equal(availability.canWrite, false);
    assert.match(availability.blockedReason, /fixture/);
  });
});

test("写开关关闭时被禁用，理由指向具体的环境变量", () => {
  withEnvironment({ ADMIN_DATA_SOURCE: "remote", ADMIN_API_WRITE_ENABLED: "false" }, () => {
    const availability = importWriteAvailability();
    assert.equal(availability.canWrite, false);
    assert.match(availability.blockedReason, /ADMIN_API_WRITE_ENABLED/);
  });
});

test("写开关缺省时是关闭的，不能靠没配就放行", () => {
  withEnvironment({ ADMIN_DATA_SOURCE: "remote", ADMIN_API_WRITE_ENABLED: undefined }, () => {
    assert.equal(importWriteAvailability().canWrite, false);
  });
});

test("远端数据源且写开关打开时才可用", () => {
  withEnvironment({ ADMIN_DATA_SOURCE: "remote", ADMIN_API_WRITE_ENABLED: "true" }, () => {
    const availability = importWriteAvailability();
    assert.equal(availability.canWrite, true);
    assert.equal(availability.blockedReason, "");
  });
});

test("模板含全部列，且带 BOM 供 Excel 打开", () => {
  const template = buildManifestTemplate();
  assert.equal(template.charCodeAt(0), 0xfeff);
  assert.match(TEMPLATE_FILENAME, /\.csv$/);
  const parsed = parseManifestText(template, "csv");
  assert.deepEqual(parsed.columns, [...MANIFEST_FIELD_NAMES]);
});

test("模板的示例行本身能通过校验——运营改一改就能用", () => {
  // 模板若自带错误，第一次导入必然失败，而运营会以为是自己填错了。
  const parsed = parseManifestText(buildManifestTemplate(), "csv");
  assert.equal(parsed.rows.length, 1);
  const issues = validateManifestRows(parsed.rows, parsed.columns, {
    images: new Map([[parsed.rows[0].values.portrait_file, 1024]]),
  });
  assert.deepEqual(
    issues.filter((issue) => issue.severity === "error"),
    [],
  );
});
