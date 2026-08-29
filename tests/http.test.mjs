import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin } from "../lib/server/origin.ts";

function request(origin, headers = {}) {
  return new Request("http://localhost:3001/api/auth/mock", {
    method: "POST",
    headers: { Host: "127.0.0.1:3001", Origin: origin, ...headers },
  });
}

test("same-origin validation uses the actual Host header", () => {
  assert.equal(isSameOrigin(request("http://127.0.0.1:3001")), true);
  assert.equal(isSameOrigin(request("http://localhost:3001")), false);
  assert.equal(isSameOrigin(request("https://evil.example")), false);
});

test("same-origin validation honors reverse proxy protocol", () => {
  const proxied = new Request("http://localhost:3001/api/auth/mock", {
    method: "POST",
    headers: {
      Host: "admin.plum.top",
      Origin: "https://admin.plum.top",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(isSameOrigin(proxied), true);
});

test("production rejects write requests without an Origin", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(isSameOrigin(new Request("https://admin.plum.top/api/auth/mock", { method: "POST" })), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
