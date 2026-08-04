#!/usr/bin/env node
/**
 * readiness-check — verify OpenCode Mobile is PRODUCTION READY.
 *
 * Verdict is PRODUCTION READY only if every REQUIRED gate passes:
 *   A app-health, B fdroid-selfhosted, C fdroid-mainline, D google-play, E web.
 *
 * Runs natively on Node >= 23.6 (TypeScript type-stripping) — no build, no deps.
 * Usage:
 *   node check.ts            full check
 *   node check.ts --quick    skip slow npm app-health gates
 */
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const APP_ID = "cc.agentlabs.opencode";
const SITE = "https://dzianisv.github.io/opencode-mobile";
const FDROID_INDEX = `${SITE}/fdroid/repo/index-v1.json`;
const RELEASES = "https://github.com/dzianisv/opencode-mobile/releases/latest";
const PLAY = `https://play.google.com/store/apps/details?id=${APP_ID}`;
const FDROID_MAINLINE = `https://f-droid.org/packages/${APP_ID}/`;
const TIMEOUT_MS = 20_000;

type Status = "PASS" | "FAIL" | "WARN" | "UNKNOWN";
interface Result { id: string; label: string; status: Status; detail: string }

// Gates that must PASS for a PRODUCTION READY verdict.
const REQUIRED = new Set([
  "A_lint", "A_typecheck", "A_test",
  "B_selfhosted", "B_release",
  "C_mainline", "D_play",
  "E_landing", "E_guide", "E_privacy", "E_sitemap", "E_robots", "E_og", "E_fdroidqr", "E_apkqr",
]);

const QUICK = process.argv.includes("--quick");
if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log("node check.ts [--quick]   (--quick skips npm app-health gates)");
  process.exit(0);
}

// ---- repo root (script may be invoked from anywhere) ----
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
let REPO_ROOT: string;
try {
  REPO_ROOT = execFileSync("git", ["-C", SCRIPT_DIR, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
} catch { REPO_ROOT = resolve(SCRIPT_DIR, "../../.."); }

// ---- output ----
const tty = process.stdout.isTTY;
const c = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const COLOR: Record<Status, string> = { PASS: "32", FAIL: "31", WARN: "33", UNKNOWN: "33" };
const results: Result[] = [];

function record(id: string, label: string, status: Status, detail: string) {
  results.push({ id, label, status, detail });
  const tag = `[${status}]`.padEnd(9);
  console.log(`  ${c(COLOR[status], tag)} ${label.padEnd(22)} ${c("2", "—")} ${detail}`);
}
const section = (t: string) => console.log(`\n${c("1", t)}`);

/** GET a URL; return numeric HTTP status, or 0 on network failure/timeout. */
async function httpCode(url: string): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": "readiness-check" } });
    return res.status;
  } catch { return 0; }
  finally { clearTimeout(timer); }
}

async function checkUrl(id: string, label: string, url: string) {
  const code = await httpCode(url);
  if (code === 0) record(id, label, "UNKNOWN", `unreachable (${url})`);
  else if (code === 200) record(id, label, "PASS", "HTTP 200");
  else record(id, label, "FAIL", `HTTP ${code} (${url})`);
}

function has(cmd: string): boolean {
  return spawnSync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [cmd] : ["-v", cmd], { shell: true }).status === 0;
}

console.log(c("1", "OpenCode Mobile — Production Readiness Check"));
console.log(c("2", `app id: ${APP_ID}    mode: ${QUICK ? "quick" : "full"}    ${new Date().toISOString()}`));

// ===================== A. App health =====================
section("A. App health (build + tests)");
if (QUICK) {
  record("A_lint", "lint", "WARN", "skipped (--quick)");
  record("A_typecheck", "typecheck", "WARN", "skipped (--quick)");
  record("A_test", "test", "WARN", "skipped (--quick)");
} else if (!has("npm")) {
  record("A_lint", "lint", "UNKNOWN", "npm not installed");
  record("A_typecheck", "typecheck", "UNKNOWN", "npm not installed");
  record("A_test", "test", "UNKNOWN", "npm not installed");
} else {
  const ln = spawnSync("npm", ["run", "lint"], { cwd: REPO_ROOT, encoding: "utf8" });
  record("A_lint", "lint", ln.status === 0 ? "PASS" : "FAIL",
    ln.status === 0 ? "npm run lint clean" : "eslint findings");
  const tc = spawnSync("npm", ["run", "typecheck"], { cwd: REPO_ROOT, encoding: "utf8" });
  record("A_typecheck", "typecheck", tc.status === 0 ? "PASS" : "FAIL",
    tc.status === 0 ? "npm run typecheck clean" : "tsc errors");
  const t = spawnSync("npm", ["test"], { cwd: REPO_ROOT, encoding: "utf8" });
  record("A_test", "test", t.status === 0 ? "PASS" : "FAIL",
    t.status === 0 ? "npm test green" : "test failures");
}

// ===================== B. F-Droid self-hosted (REQUIRED) =====================
section("B. F-Droid — self-hosted repo (REQUIRED)");
try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const res = await fetch(FDROID_INDEX, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
  if (!res.ok) {
    record("B_selfhosted", "fdroid-selfhosted", "FAIL", `index-v1.json HTTP ${res.status}`);
  } else {
    const idx = await res.json() as { packages?: Record<string, Array<{ versionName?: string }>> };
    const versions = idx.packages?.[APP_ID];
    if (versions && versions.length) {
      record("B_selfhosted", "fdroid-selfhosted", "PASS", `serves ${APP_ID} v${versions[0].versionName ?? "?"}`);
    } else {
      record("B_selfhosted", "fdroid-selfhosted", "FAIL", `${APP_ID} not present in self-hosted index`);
    }
  }
} catch (e) {
  record("B_selfhosted", "fdroid-selfhosted", "UNKNOWN", `could not fetch/parse index-v1.json (${(e as Error).name})`);
}
{
  const code = await httpCode(RELEASES);
  if (code === 0) record("B_release", "fdroid-apk-release", "UNKNOWN", "releases/latest unreachable");
  else if (code >= 200 && code < 400) record("B_release", "fdroid-apk-release", "PASS", `releases/latest HTTP ${code}`);
  else record("B_release", "fdroid-apk-release", "FAIL", `releases/latest HTTP ${code}`);
}

// ===================== C. F-Droid mainline (REQUIRED, headline) =====================
section("C. F-Droid — MAINLINE on f-droid.org (REQUIRED · headline)");
{
  const code = await httpCode(FDROID_MAINLINE);
  if (code === 0) record("C_mainline", "fdroid-mainline", "UNKNOWN", "f-droid.org unreachable");
  else if (code === 200) record("C_mainline", "fdroid-mainline", "PASS", "LIVE on f-droid.org (HTTP 200)");
  else if (code === 404) record("C_mainline", "fdroid-mainline", "FAIL", "not yet published (HTTP 404 — MR not merged)");
  else record("C_mainline", "fdroid-mainline", "FAIL", `unexpected HTTP ${code}`);
}

// ===================== D. Google Play (REQUIRED, headline) =====================
section("D. Google Play — PUBLISHED (REQUIRED · headline)");
{
  const code = await httpCode(PLAY);
  if (code === 0) record("D_play", "google-play", "UNKNOWN", "play.google.com unreachable");
  else if (code === 200) record("D_play", "google-play", "PASS", "PUBLISHED on Google Play (HTTP 200)");
  else if (code === 404) record("D_play", "google-play", "FAIL", "not public — in review/draft (HTTP 404)");
  else record("D_play", "google-play", "FAIL", `unexpected HTTP ${code}`);
}

// ===================== E. Web presence (REQUIRED) =====================
section("E. Web presence (REQUIRED)");
await checkUrl("E_landing", "landing", `${SITE}/`);
await checkUrl("E_guide", "guide", `${SITE}/guide/`);
await checkUrl("E_privacy", "privacy", `${SITE}/privacy/`);
await checkUrl("E_sitemap", "sitemap.xml", `${SITE}/sitemap.xml`);
await checkUrl("E_robots", "robots.txt", `${SITE}/robots.txt`);
await checkUrl("E_og", "og.png", `${SITE}/og.png`);
await checkUrl("E_fdroidqr", "fdroid-qr.png", `${SITE}/fdroid-qr.png`);
await checkUrl("E_apkqr", "apk-qr.png", `${SITE}/apk-qr.png`);

// ===================== F. Repo discoverability (WARN only) =====================
section("F. Repo discoverability (nice-to-have)");
if (!has("gh")) {
  record("F_repo", "gh-repo-meta", "WARN", "gh not installed — skipped");
} else if (spawnSync("gh", ["auth", "status"], { encoding: "utf8" }).status !== 0) {
  record("F_repo", "gh-repo-meta", "WARN", "gh unauthenticated — skipped");
} else {
  const r = spawnSync("gh", ["repo", "view", "dzianisv/opencode-mobile", "--json", "repositoryTopics,homepageUrl"], { encoding: "utf8" });
  try {
    const m = JSON.parse(r.stdout) as { repositoryTopics?: Array<{ name: string }>; homepageUrl?: string };
    const topics = (m.repositoryTopics ?? []).map(t => t.name).join(",");
    const home = m.homepageUrl || "";
    if (topics || home) record("F_repo", "gh-repo-meta", "PASS", `topics=[${topics || "none"}] homepage=${home || "none"}`);
    else record("F_repo", "gh-repo-meta", "WARN", "no topics/homepage set");
  } catch { record("F_repo", "gh-repo-meta", "WARN", "could not read repo metadata"); }
}

// ===================== Verdict =====================
const statusOf = (id: string): Status | "MISSING" => results.find(r => r.id === id)?.status ?? "MISSING";
const skipped: string[] = [];
const failing: string[] = [];
for (const id of REQUIRED) {
  const st = statusOf(id);
  if (st === "PASS") continue;
  if (QUICK && st === "WARN" && (id === "A_lint" || id === "A_typecheck" || id === "A_test")) { skipped.push(id); continue; }
  failing.push(`${id}(${st})`);
}

section("Headline gates");
record("_play", "GOOGLE PLAY", statusOf("D_play") === "PASS" ? "PASS" : "FAIL", statusOf("D_play") === "PASS" ? "PUBLISHED" : "NOT published");
record("_mainline", "F-DROID MAINLINE", statusOf("C_mainline") === "PASS" ? "PASS" : "FAIL", statusOf("C_mainline") === "PASS" ? "PUBLISHED" : "NOT published");
// drop synthetic headline rows from results so they don't affect anything else
results.splice(results.findIndex(r => r.id === "_play"), 2);

console.log("\n" + "=".repeat(62));
if (failing.length === 0 && skipped.length === 0) {
  console.log(c("1", c("32", "  PRODUCTION READY ✅")));
  console.log(c("2", "  All required gates passed — both stores live, app + site healthy."));
  console.log("=".repeat(62));
  process.exit(0);
} else if (failing.length === 0 && skipped.length > 0) {
  console.log(c("1", c("33", "  LIVE GATES PASS — run full check to confirm PRODUCTION READY ⚠")));
  console.log(c("2", `  Skipped in --quick mode: ${skipped.join(" ")} (run without --quick).`));
  console.log("=".repeat(62));
  process.exit(1);
} else {
  console.log(c("1", c("31", "  NOT READY ❌")));
  console.log("  Failing required gates:");
  for (const f of failing) console.log(`    - ${f}`);
  console.log("=".repeat(62));
  process.exit(1);
}
