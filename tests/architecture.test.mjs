import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function sourceFiles(directory) {
  return readdirSync(join(ROOT, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function assertNoImports(directory, forbiddenPatterns) {
  for (const file of sourceFiles(directory)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${relative(ROOT, file)} crosses an architecture boundary`);
    }
  }
}

test("shared infrastructure does not depend on route or feature layers", () => {
  assertNoImports("lib", [/@\/app\//, /@\/features\//, /["'](?:\.\.\/)+features\//]);
});

test("feature modules do not depend on the route layer", () => {
  assertNoImports("features", [/@\/app\//, /["'](?:\.\.\/)+app\//]);
});

test("admin business routes are explicit instead of catch-all", () => {
  for (const section of ["characters", "creators", "users", "subscriptions", "audit", "staff"]) {
    assert.equal(existsSync(join(ROOT, "app", "(admin)", section, "page.tsx")), true, section);
  }
  assert.equal(existsSync(join(ROOT, "app", "(admin)", "[section]", "page.tsx")), false);
});
