import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectRoot, "dist");
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png"
];

await Promise.all(requiredFiles.map((file) => access(join(outDir, file))));

const manifest = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
const bundle = await readFile(join(outDir, "popup.js"), "utf8");

if (manifest.manifest_version !== 3) {
  throw new Error("Built extension is not Manifest V3.");
}

if (!manifest.action?.default_popup) {
  throw new Error("Built manifest is missing its popup entry.");
}

if (/^\s*import\s+.*["']@supabase\/supabase-js["']/m.test(bundle)) {
  throw new Error("Supabase was not bundled into the extension.");
}

console.log(`Verified ${requiredFiles.length} required extension files.`);
