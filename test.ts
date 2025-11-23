import debug, { enable, enabled } from "./mod.ts";
import { assertEquals } from "@std/assert";

Deno.test.afterEach(() => {
  enable(undefined);
});

Deno.test("debug", () => {
  const log = debug("test", { log: () => {} });
  enable(log);
  log("hello world");
});

Deno.test("namespace enable", () => {
  assertEquals(enabled(debug("test:12345")), false);
  assertEquals(enabled(debug("test:67890")), false);

  enable("test:12345");
  assertEquals(enabled(debug("test:12345")), true);
  assertEquals(enabled(debug("test:67890")), false);
});

Deno.test("namespace wildcard", () => {
  assertEquals(enabled(debug("test:12345")), false);
  assertEquals(enabled(debug("test:67890")), false);

  enable("test:*");
  assertEquals(enabled(debug("test:12345")), true);
  assertEquals(enabled(debug("test:67890")), true);
});

Deno.test("skip namespace", () => {
  assertEquals(enabled(debug("test:12345")), false);
  assertEquals(enabled(debug("test:67890")), false);

  enable("test:*,-test:67890");
  assertEquals(enabled(debug("test:12345")), true);
  assertEquals(enabled(debug("test:67890")), false);
});

Deno.test("custom log function", () => {
  const messages = [];
  const log = debug("test", { log: (...args) => messages.push(...args) });
  enable(log);
  log("using custom log function");
  log("using custom log function again");
  log("%O", 12345);
  assertEquals(messages.length, 3);
});
