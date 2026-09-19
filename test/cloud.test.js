import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Chrome storage adapter persists and removes auth values", async () => {
  globalThis.__PAGER_ENV__ = "test";
  globalThis.__PAGER_SUPABASE_URL__ = "";
  globalThis.__PAGER_SUPABASE_PUBLISHABLE_KEY__ = "";
  const { createChromeStorageAdapter } = await import("../cloud.js");
  const values = {};
  const adapter = createChromeStorageAdapter({
    async get(key) { return { [key]: values[key] }; },
    async set(nextValues) { Object.assign(values, nextValues); },
    async remove(key) { delete values[key]; }
  });

  assert.equal(await adapter.getItem("session"), null);
  await adapter.setItem("session", "saved-token");
  assert.equal(await adapter.getItem("session"), "saved-token");
  await adapter.removeItem("session");
  assert.equal(await adapter.getItem("session"), null);
});

test("build rejects incomplete Supabase configuration", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/build.mjs"], {
      env: {
        ...process.env,
        PAGER_SUPABASE_URL: "https://example.supabase.co",
        PAGER_SUPABASE_PUBLISHABLE_KEY: ""
      }
    }),
    /Set both PAGER_SUPABASE_URL/
  );
});

test("build refuses a Supabase secret key", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/build.mjs"], {
      env: {
        ...process.env,
        PAGER_SUPABASE_URL: "https://example.supabase.co",
        PAGER_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_bundle"
      }
    }),
    /Refusing to bundle a Supabase secret key/
  );
});
