import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
