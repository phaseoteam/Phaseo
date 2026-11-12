import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppBudget, filterAppEvent, privateException } from "../src/appAnalytics.ts";

test("exceptions contain code locations but no message, function name, path or query", () => {
  const error = new TypeError("secret prompt and sk-private");
  error.stack = "TypeError: secret prompt\n at privateFunction (C:\\Users\\Daniel\\repo\\index.js:42:7)\nmethod@/private/user/index.android.bundle:1:45\n at https://private.test/app.js?token=secret:1:2";
  const safe = privateException(error);
  assert.equal(safe.message, "Unhandled TypeError");
  assert.equal(safe.stack, "TypeError: Unhandled TypeError\n    at app:///index.js:42:7\n    at app:///index.android.bundle:1:45");
  assert.equal(privateException({ message: "secret" }).message, "Unhandled Error");
});

test("outbound events remove SDK enrichment and person fields, preserving ingestion token", () => {
  const safe = filterAppEvent({ event: "$exception", $set: { email: "private@test" }, properties: {
    token: "public-project-key", distinct_id: "anonymous", app_surface: "mobile", $device_name: "Daniel's phone", $current_url: "private", $exception_message: "secret",
    $exception_list: [{ type: "TypeError", value: "secret prompt", stacktrace: { frames: [{ filename: "/private/repo/main.js", lineno: 4, colno: 5, function: "secret", context_line: "sk-private", vars: { secret: true } }] } }],
  } });
  assert.deepEqual(safe.properties, { token: "public-project-key", distinct_id: "anonymous", app_surface: "mobile", $exception_list: [{ type: "TypeError", value: "Unhandled TypeError", stacktrace: { frames: [{ filename: "app:///main.js", lineno: 4, colno: 5, in_app: true }] } }] });
  assert.equal(safe.$set, undefined);
  assert.equal(filterAppEvent({ event: "$autocapture", properties: { text: "private" } }), null);
  assert.equal(filterAppEvent(null), null);
  assert.equal(filterAppEvent({ event: "$exception", properties: { $exception_list: [null] } }), null);
});

test("native errors retain up to three sanitized causes without copying content or cyclic chains", () => {
  const cause = new TypeError("private prompt");
  cause.stack = "TypeError: private prompt\n at run (/private/chats/index.js:12:4)";
  const error = new Error("private wrapper", { cause });
  cause.cause = error;
  const safe = privateException(error);
  assert.equal(safe.cause.name, "TypeError");
  assert.equal(safe.cause.cause, undefined);
  assert.ok(safe.cause.stack.includes("app:///index.js:12:4"));
  const event = filterAppEvent({ event: "$exception", properties: { $exception_list: Array.from({ length: 5 }, () => ({ type: "TypeError", value: "private", stacktrace: { frames: [] } })) } });
  assert.equal(event.properties.$exception_list.length, 3);
  assert.ok(!JSON.stringify(event).includes("private"));
});

test("persisted daily limits include errors and cannot be bypassed by restarting", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let time = Date.UTC(2026, 10, 9);
  const budget = createAppBudget(storage, () => time);
  for (let i = 0; i < 20; i++) assert.equal(budget.take("$exception", String(i)), true);
  assert.equal(budget.take("$exception", "extra"), false);
  for (let i = 0; i < 180; i++) assert.equal(budget.take("screen_viewed", String(i)), true);
  assert.equal(budget.take("app_opened"), false);
  assert.equal(createAppBudget(storage, () => time).take("app_opened"), false);
  time += 86400000;
  assert.equal(budget.take("screen_viewed", "179"), true);
});

test("duplicate screens and errors do not consume the budget; storage failures stop collection", () => {
  const data = new Map();
  const budget = createAppBudget({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  assert.equal(budget.take("screen_viewed", "chat"), true);
  assert.equal(budget.take("screen_viewed", "chat"), false);
  assert.equal(budget.take("$exception", "same"), true);
  assert.equal(budget.take("$exception", "same"), false);
  assert.equal(budget.take("screen_viewed", "account"), true);
  assert.equal(budget.take("screen_viewed", "chat"), true);
  assert.equal(createAppBudget({ getItem: () => "invalid", setItem() {} }).take("app_opened"), false);
  assert.equal(createAppBudget({ getItem: () => null, setItem() { throw new Error(); } }).take("app_opened"), false);
});
