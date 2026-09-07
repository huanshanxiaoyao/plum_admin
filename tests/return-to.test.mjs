import assert from "node:assert/strict";
import test from "node:test";
import { loginUrl, safeReturnTo } from "../lib/auth/return-to.ts";

test("return destinations preserve local paths, query strings, and fragments", () => {
  for (const path of ["/", "/mydocs", "/mydocs?topic=imports#guide", "/imports/user-guide"]) {
    assert.equal(safeReturnTo(path), path);
  }
  assert.equal(loginUrl("/mydocs"), "/login?returnTo=%2Fmydocs");
  assert.equal(loginUrl("/mydocs", "login_failed"), "/login?returnTo=%2Fmydocs&error=login_failed");
  assert.equal(loginUrl("/"), "/login");
});

test("return destinations reject external URLs, ambiguous paths, and auth endpoints", () => {
  for (const value of [
    undefined, null, ["/mydocs"], "", "https://example.com", "//example.com", "///example.com",
    "javascript:alert(1)", "/\\example.com", "/\n/example.com", "/%2f%2fexample.com",
    "/%5cexample.com", "/%0d%0aLocation:example.com", "/%252fexample.com", "/%",
    "/login", "/login?returnTo=/login", "/api/auth/logout", "/access-denied",
    "/mydocs/../api/auth/logout", "/%61pi/auth/logout", "/" + "a".repeat(2048),
  ]) {
    assert.equal(safeReturnTo(value), "/", JSON.stringify(value));
  }
});
