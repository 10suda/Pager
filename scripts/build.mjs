import "dotenv/config";

import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectRoot, "dist");

const environment = process.env.PAGER_ENV?.trim() || "development";
const supabaseUrl = process.env.PAGER_SUPABASE_URL?.trim() || "";
const supabasePublishableKey =
  process.env.PAGER_SUPABASE_PUBLISHABLE_KEY?.trim() || "";

if (Boolean(supabaseUrl) !== Boolean(supabasePublishableKey)) {
  throw new Error(
    "Set both PAGER_SUPABASE_URL and PAGER_SUPABASE_PUBLISHABLE_KEY, or leave both unset."
  );
}

if (supabasePublishableKey.startsWith("sb_secret_")) {
  throw new Error(
    "Refusing to bundle a Supabase secret key. Use the publishable client key."
  );
}

const jwtParts = supabasePublishableKey.split(".");
if (jwtParts.length === 3) {
  try {
    const payload = JSON.parse(
      Buffer.from(jwtParts[1], "base64url").toString("utf8")
    );
    if (payload.role === "service_role") {
      throw new Error(
        "Refusing to bundle a Supabase service_role JWT. Use the publishable client key."
      );
    }
  } catch (error) {
    if (error.message.startsWith("Refusing to bundle")) throw error;
  }
}

let supabaseOrigin = "";
if (supabaseUrl) {
  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("PAGER_SUPABASE_URL must use HTTPS.");
  }
  supabaseOrigin = parsedUrl.origin;
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [join(projectRoot, "popup.js")],
  outfile: join(outDir, "popup.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  minify: environment === "production",
  sourcemap: environment !== "production",
  define: {
    __PAGER_ENV__: JSON.stringify(environment),
    __PAGER_SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __PAGER_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey)
  },
  legalComments: "none"
});

await Promise.all([
  cp(join(projectRoot, "popup.html"), join(outDir, "popup.html")),
  cp(join(projectRoot, "popup.css"), join(outDir, "popup.css")),
  cp(join(projectRoot, "icons"), join(outDir, "icons"), { recursive: true })
]);

const manifest = JSON.parse(
  await readFile(join(projectRoot, "manifest.json"), "utf8")
);

if (supabaseOrigin) {
  manifest.host_permissions = [`${supabaseOrigin}/*`];
}

await writeFile(
  join(outDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(
  `Built Pager for ${environment} (${supabaseOrigin ? "Supabase configured" : "local mode"}).`
);
