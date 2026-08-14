#!/usr/bin/env node
/**
 * How many people are still on a build that CANNOT sign up for the waitlist?
 *
 * WHY THIS EXISTS
 * ---------------
 * The in-app waitlist form posts to `POST /api/beta-signup` (Brevo list 4). That
 * path only exists from **v0.4.8 (versionCode 34)** onward. Every older build has
 * a single fallback: open a `mailto:` to support@agentlabs.cc, which lands in a
 * human inbox and nowhere near the waitlist store — 20 of 21 signups between
 * 2026-08-03 and 2026-08-13 were lost that way (AGE-61). Reconciling the inbox
 * heals the symptom; this script measures the cause, i.e. how much of the live
 * install base still has no working signup path at all.
 *
 * DATA SOURCE
 * -----------
 * Google Play Developer Reporting API, `crashRateMetricSet` -> metric
 * `distinctUsers`, grouped by dimension `versionCode`. That metric set is the only
 * Play surface that exposes a per-versionCode count of users who ACTUALLY OPENED
 * the app in a period (Play's own vitals denominator), which is what "active
 * install" should mean here. Play install reports (GCS bucket) count devices that
 * merely have the APK, and need a second credential; this needs only the
 * androidpublisher service account we already ship to CI.
 *
 * CAVEAT, stated up front so the number is not over-read: Play vitals only sees
 * devices whose owner left "share usage & diagnostics" on. It is a large, unbiased
 * -enough SAMPLE of the install base, not a census. Shares are therefore reported
 * as shares (ratio between versions inside the same sample), which is exactly the
 * quantity we care about, and never as an absolute install count.
 *
 * SECOND CHANNEL (why Play alone is not the answer)
 * -------------------------------------------------
 * Play auto-updates, so its active base converges on the newest build fast. The
 * cohort that stays stale forever is the SIDELOAD channel: GitHub release APKs
 * (also what the F-Droid-style builds are downloaded from). Those installs never
 * auto-update, so a device that pulled a pre-v0.4.8 APK still has mailto as its
 * ONLY signup path today. `--github` adds lifetime APK downloads per release
 * from the public GitHub API, which is the honest denominator for that channel.
 *
 * USAGE
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='<sa json>' node scripts/play-version-share.mjs
 *   ... --github         also report sideload (GitHub release APK) version share
 *   ... --json           machine-readable output only
 *   ... --days 14        window to scan (default 7 available days)
 *
 * Exits non-zero only on hard failure (auth, API, no data at all) — a bad share is
 * a finding, not a crash.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME || "cc.agentlabs.opencode";
/**
 * CAREFUL: Play versionCodes are NOT the ones in android/app/build.gradle. The
 * publish workflow overwrites them with `github.run_number + 100`
 * (.github/workflows/publish-play-store.yml), so the gradle/tag mapping is
 * meaningless on Play. The table below was derived from the publish runs:
 *
 *   gh api repos/dzianisv/opencode-mobile/actions/workflows/278415225/runs \
 *     --jq '.workflow_runs[]|select(.conclusion=="success")|"\(.run_number+100) \(.head_sha)"'
 *   # then, per sha: version from package.json, API path via
 *   #   git merge-base --is-ancestor 0fdfb54 <sha>   (0fdfb54 = the beta-signup call)
 *
 * versionCode 139 (v0.4.8, 2026-07-18) is the first Play build that contains it.
 */
const FIRST_API_SIGNUP_VERSION_CODE = Number(process.env.FIRST_API_SIGNUP_VERSION_CODE || 139);
const VERSION_NAMES = {
  119: "0.4.1",
  120: "0.4.1",
  123: "0.4.1",
  126: "0.4.2",
  127: "0.4.3",
  128: "0.4.3",
  129: "0.4.3",
  130: "0.4.3",
  132: "0.4.5",
  133: "0.4.5",
  134: "0.4.5",
  135: "0.4.5",
  136: "0.4.5",
  137: "0.4.6",
  138: "0.4.7",
  139: "0.4.8",
  141: "0.4.9",
  142: "0.4.10",
  143: "0.4.11",
  146: "0.4.12",
  // v0.4.13 (retry queue + mailto version stamp) — production dispatch run 49.
  149: "0.4.13",
  // v0.4.14 = the Sentry noise gate (AGE-105). 150 = internal (tag push, run 50),
  // 151 = production (dispatch run 51, 2026-08-14 14:22Z). Both contain the gate,
  // which is what scripts/noise-gate-report.mjs counts as "gated".
  150: "0.4.14",
  151: "0.4.14",
};

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const withGithub = args.includes("--github");
const days = Number(args[args.indexOf("--days") + 1]) || 7;

/** Semver compare limited to what our tags use (`vX.Y.Z`). */
function isPreApiSignupTag(tag) {
  const parts = tag.replace(/^v/, "").split(".").map(Number);
  const [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  if (major !== 0) return major < 0;
  if (minor !== 4) return minor < 4;
  return patch < 8; // v0.4.8 is the first release with POST /api/beta-signup
}

/**
 * Sideload share: lifetime APK downloads per GitHub release. Downloads are not
 * installs — some are CI, mirrors or curiosity — but they are the only per-version
 * signal this channel emits, and the ratio is what we quote, never the absolute.
 */
async function githubSideloadShare() {
  const repo = process.env.GITHUB_RELEASES_REPO || "dzianisv/opencode-mobile";
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)
    headers.authorization = `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers });
  if (!res.ok) throw new Error(`github releases failed (${res.status})`);
  const releases = await res.json();
  const rows = releases.map((r) => ({
    tag: r.tag_name,
    downloads: (r.assets || [])
      .filter((a) => /\.apk$/i.test(a.name))
      .reduce((sum, a) => sum + (a.download_count || 0), 0),
    preApiSignup: isPreApiSignupTag(r.tag_name),
  }));
  const total = rows.reduce((s, r) => s + r.downloads, 0);
  const stale = rows.filter((r) => r.preApiSignup).reduce((s, r) => s + r.downloads, 0);
  return { repo, rows, totalDownloads: total, staleDownloads: stale, staleShare: total ? stale / total : 0 };
}

function loadServiceAccount() {
  const raw =
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE
      ? readFileSync(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE, "utf8")
      : "");
  if (!raw.trim()) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (or _FILE) is required — refusing to report a share from no data",
    );
  }
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("service account JSON is missing client_email/private_key");
  return sa;
}

/** Mint an access token straight from the SA key (no googleapis dependency). */
async function getAccessToken(sa) {
  const scope = "https://www.googleapis.com/auth/playdeveloperreporting";
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claim = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(claim).sign(sa.private_key).toString("base64url");
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${claim}.${signature}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

async function api(path, token, init = {}) {
  const res = await fetch(`https://playdeveloperreporting.googleapis.com/v1beta1/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

/** Play publishes vitals with a lag; ask the API how fresh DAILY data actually is. */
function latestDailyDate(metricSet) {
  const daily = (metricSet.freshnessInfo?.freshnesses || []).find((f) => f.aggregationPeriod === "DAILY");
  const d = daily?.latestEndTime;
  if (!d) return null;
  return { year: d.year, month: d.month, day: d.day };
}

function addDays({ year, month, day }, delta) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

const fmt = (d) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

async function main() {
  const token = await getAccessToken(loadServiceAccount());
  const metricSet = await api(`apps/${PACKAGE_NAME}/crashRateMetricSet`, token);
  const end = latestDailyDate(metricSet);
  if (!end) throw new Error("Play reports no DAILY freshness for crashRateMetricSet — cannot date the window");
  const start = addDays(end, -(days - 1));

  const rows = [];
  let pageToken;
  do {
    const body = await api(`apps/${PACKAGE_NAME}/crashRateMetricSet:query`, token, {
      method: "POST",
      body: JSON.stringify({
        timelineSpec: {
          aggregationPeriod: "DAILY",
          startTime: { ...start, timeZone: { id: "America/Los_Angeles" } },
          // Play rejects any endTime past its published freshness date, so the
          // freshest available day IS the end of the window.
          endTime: { ...end, timeZone: { id: "America/Los_Angeles" } },
        },
        dimensions: ["versionCode"],
        metrics: ["distinctUsers"],
        pageSize: 1000,
        pageToken,
      }),
    });
    rows.push(...(body.rows || []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  if (rows.length === 0) throw new Error("Play returned zero rows — no vitals data for this app/window");

  // Per version, take the PEAK daily distinct users in the window. Summing across
  // days would double-count the same person opening the app on several days; the
  // peak is the closest honest read of "how many humans are on this build".
  const peak = new Map();
  for (const row of rows) {
    // Play returns the versionCode as `stringValue` even though it is numeric.
    const dim = row.dimensions?.find((d) => d.dimension === "versionCode");
    const code = Number(dim?.stringValue ?? dim?.int64Value);
    const users = Number(row.metrics?.find((m) => m.metric === "distinctUsers")?.decimalValue?.value ?? 0);
    if (!Number.isFinite(code)) continue;
    peak.set(code, Math.max(peak.get(code) ?? 0, users));
  }

  const versions = [...peak.entries()]
    .map(([versionCode, users]) => ({
      versionCode,
      version: VERSION_NAMES[versionCode] || "unknown",
      users,
      canSignUpInApp: versionCode >= FIRST_API_SIGNUP_VERSION_CODE,
    }))
    .sort((a, b) => b.users - a.users);

  const total = versions.reduce((sum, v) => sum + v.users, 0);
  const stale = versions.filter((v) => !v.canSignUpInApp).reduce((sum, v) => sum + v.users, 0);
  const result = {
    packageName: PACKAGE_NAME,
    window: { start: fmt(start), end: fmt(end), days },
    firstApiSignupVersionCode: FIRST_API_SIGNUP_VERSION_CODE,
    metric: "crashRateMetricSet/distinctUsers (peak day per versionCode)",
    versions,
    totalUsers: total,
    staleUsers: stale,
    staleShare: total > 0 ? stale / total : 0,
  };

  if (withGithub) result.sideload = await githubSideloadShare();

  if (jsonOnly) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Play version share — ${PACKAGE_NAME}  (${fmt(start)} → ${fmt(end)}, peak daily distinct users)`);
  console.log("");
  console.log("| versionCode | version | users | in-app signup works |");
  console.log("| --- | --- | --- | --- |");
  for (const v of versions) {
    console.log(`| ${v.versionCode} | ${v.version} | ${v.users} | ${v.canSignUpInApp ? "yes" : "NO — mailto only"} |`);
  }
  console.log("");
  console.log(
    `pre-v0.4.8 (versionCode < ${FIRST_API_SIGNUP_VERSION_CODE}): ${stale} of ${total} users = ` +
      `${(result.staleShare * 100).toFixed(1)}% have NO in-app signup path.`,
  );
  if (result.sideload) {
    const s = result.sideload;
    console.log("");
    console.log(`Sideload channel — ${s.repo} release APKs (lifetime downloads, never auto-update)`);
    console.log("");
    console.log("| tag | apk downloads | in-app signup works |");
    console.log("| --- | --- | --- |");
    for (const r of s.rows.filter((r) => r.downloads > 0))
      console.log(`| ${r.tag} | ${r.downloads} | ${r.preApiSignup ? "NO — mailto only" : "yes"} |`);
    console.log("");
    console.log(
      `pre-v0.4.8 sideloads: ${s.staleDownloads} of ${s.totalDownloads} = ` +
        `${(s.staleShare * 100).toFixed(1)}% of this channel can never sign up in-app without a manual re-download.`,
    );
  }
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `stale_share=${(result.staleShare * 100).toFixed(1)}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `stale_users=${stale}\ntotal_users=${total}\n`);
  }
}

main().catch((err) => {
  console.error(`play-version-share: ${err.message}`);
  process.exit(1);
});
