#!/usr/bin/env node
/**
 * What share of the ERROR-GENERATING install base is actually running the gated
 * build? — measured from Sentry release health, not from Play.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/noise-gate-report.mjs` grades the AGE-105 noise gate with
 *
 *     expected_post = baseline x (1 - gated_share x efficacy)
 *
 * so `gated_share` decides the verdict. Until now the only source for it was
 * `play-version-share.mjs` (Play Developer Reporting API). That source has three
 * defects for this specific question, and all three bias the same way — they
 * make uptake look higher than it is, which makes the gate look like it failed:
 *
 *   1. WRONG POPULATION. Play vitals only sees devices that installed from Play
 *      AND left "share usage & diagnostics" on. This project also ships an APK
 *      on every GitHub release and a self-hosted F-Droid repo
 *      (`.github/workflows/publish-fdroid.yml`). Those installs never appear in
 *      Play's denominator, but they DO send Sentry events. Measured 2026-08-14:
 *      Play production had served versionCode 136 (2026-06-22) for eight weeks,
 *      yet 78% of Sentry's active users were on v0.4.10 — a build Play
 *      production never carried. Play cannot see that cohort at all.
 *   2. WRONG UNIT. Play's `distinctUsers` counts app openers; Sentry quota is
 *      consumed per event, and events follow sessions. Both bases are reported
 *      below, precisely so a divergence is visible instead of assumed away.
 *   3. UNAVAILABLE. The Play service account exists only as a GitHub secret, so
 *      an agent measuring locally cannot get the number at all and is pushed
 *      into "grade at gated_share = 0". The Sentry token that this ticket
 *      already uses answers the same question in one request.
 *
 * Release health sessions are stored under a SEPARATE quota from errors, so this
 * keeps working while the org is over its error quota and every error is
 * rate-limited away (which is exactly when this measurement is needed). That is
 * the one thing `sentry-volume-report.mjs` says is impossible for errors —
 * per-release attribution — and it is possible here for the population.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not claim the sessions population is the whole install base. A device
 * that never opens the app sends no session and consumes no quota; excluding it
 * is correct for grading the gate and wrong for "how many installs are there".
 *
 * USAGE
 *   SENTRY_AUTH_TOKEN=... node scripts/release-uptake.mjs
 *   ... --days 14           window (default 7)
 *   ... --gate 0.4.14       first gated version name (default GATE_FIRST_VERSION)
 *   ... --project opencode-mobile
 *   ... --at 2026-08-21     project the gated share forward to a date
 *   ... --json              machine-readable
 *
 * Exit code 0 for any readable result — low uptake is a finding, not a crash.
 * Non-zero only when the data cannot be obtained.
 */

const API = "https://sentry.io/api/0"

/** First app version that contains the noise gate (v0.4.14, versionCode 150+). */
export const GATE_FIRST_VERSION = process.env.GATE_FIRST_VERSION || "0.4.14"

/** Release names arrive as `opencode-mobile@0.4.14`; the tail is what we compare. */
export function versionOf(release) {
  if (typeof release !== "string" || !release) return null
  const at = release.lastIndexOf("@")
  const tail = at >= 0 ? release.slice(at + 1) : release
  return /^\d+(\.\d+)*/.test(tail) ? tail : null
}

/**
 * Numeric, component-wise version compare. String compare is wrong here in a way
 * that matters: "0.4.9" > "0.4.10" lexically, and 0.4.9/0.4.10 are on opposite
 * sides of several of this project's gates.
 */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0)
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Collapse a Sentry sessions response (groupBy=release) into per-version rows
 * plus the gated share.
 *
 * Unparseable release names are kept in an `unknown` row and COUNTED IN THE
 * DENOMINATOR. Dropping them would silently inflate the share, which is the
 * failure mode this whole script exists to remove.
 *
 * Returns `share: null` (not 0) when the window has no sessions at all, so
 * "no data" cannot be graded as "nobody upgraded".
 */
export function gatedShareFromSessions(sessionsJson, gateVersion = GATE_FIRST_VERSION) {
  const groups = sessionsJson?.groups ?? []
  const rows = []
  for (const g of groups) {
    const release = g?.by?.release ?? null
    const users = Number(g?.totals?.["count_unique(user)"] ?? 0)
    const sessions = Number(g?.totals?.["sum(session)"] ?? 0)
    const version = versionOf(release)
    rows.push({
      release,
      version,
      users,
      sessions,
      gated: version != null && compareVersions(version, gateVersion) >= 0,
    })
  }
  const sum = (f, pred = () => true) => rows.filter(pred).reduce((s, r) => s + f(r), 0)
  const totalUsers = sum((r) => r.users)
  const totalSessions = sum((r) => r.sessions)
  const gatedUsers = sum((r) => r.users, (r) => r.gated)
  const gatedSessions = sum((r) => r.sessions, (r) => r.gated)
  const unknownUsers = sum((r) => r.users, (r) => r.version == null)

  rows.sort((a, b) => b.users - a.users || b.sessions - a.sessions)
  return {
    rows,
    gateVersion,
    users: { gated: gatedUsers, total: totalUsers },
    sessions: { gated: gatedSessions, total: totalSessions },
    unknownUsers,
    // Headline basis is users: it is the same unit Play reports, so the two
    // sources stay comparable. `shareBySession` is the quota-weighted view.
    share: totalUsers > 0 ? gatedUsers / totalUsers : null,
    shareBySession: totalSessions > 0 ? gatedSessions / totalSessions : null,
  }
}

/**
 * Largest cohort that is NOT gated. Reported on its own because a single stale
 * build holding most of the base is a distribution problem, not a gate problem,
 * and the two have completely different fixes.
 */
export function staleLeader(summary) {
  const ungated = summary.rows.filter((r) => !r.gated && r.users > 0)
  if (!ungated.length || !summary.users.total) return null
  const top = ungated[0]
  return { version: top.version ?? "unknown", users: top.users, share: top.users / summary.users.total }
}

/**
 * Straight-line projection of gated share from a daily series.
 *
 * Deliberately dumb, and deliberately refuses more than it answers: uptake
 * curves are S-shaped, so a linear fit is only defensible over a short horizon.
 * Returns `{ share: null, reason }` when it should not be trusted — fewer than
 * two points, no growth yet, or a horizon beyond `maxHorizonDays`.
 */
export function projectShare(series, targetDate, { now = new Date(), maxHorizonDays = 14 } = {}) {
  const pts = (series ?? []).filter((p) => Number.isFinite(p.share))
  if (pts.length < 2) return { share: null, reason: "need at least two daily points" }
  const horizonDays = (new Date(targetDate).getTime() - now.getTime()) / 86400000
  if (!Number.isFinite(horizonDays)) return { share: null, reason: "unparseable target date" }
  if (horizonDays < 0) return { share: null, reason: "target date is in the past" }
  if (horizonDays > maxHorizonDays) {
    return { share: null, reason: `horizon ${horizonDays.toFixed(1)}d exceeds ${maxHorizonDays}d — a linear fit is not defensible that far out` }
  }
  const first = pts[0]
  const last = pts[pts.length - 1]
  const spanDays = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000
  if (spanDays <= 0) return { share: null, reason: "series spans no time" }
  const perDay = (last.share - first.share) / spanDays
  if (perDay <= 0) {
    return { share: last.share, reason: "share is flat or falling — projecting no further uptake", perDay }
  }
  const projected = Math.min(1, last.share + perDay * horizonDays)
  return { share: projected, perDay, horizonDays, from: last.share, reason: null }
}

async function sentry(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sentry ${res.status} ${res.statusText} for ${path}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function projectId(org, slug, token) {
  const projects = await sentry(`/organizations/${org}/projects/`, token)
  const hit = projects.find((p) => p.slug === slug)
  if (!hit) throw new Error(`project ${slug} not found in org ${org}`)
  return hit.id
}

/** Daily series of gated share, from the same request that produces the totals. */
export function dailySeries(sessionsJson, gateVersion = GATE_FIRST_VERSION) {
  const intervals = sessionsJson?.intervals ?? []
  const groups = sessionsJson?.groups ?? []
  return intervals.map((iso, i) => {
    let gated = 0
    let total = 0
    for (const g of groups) {
      const v = versionOf(g?.by?.release ?? null)
      const n = Number(g?.series?.["count_unique(user)"]?.[i] ?? 0)
      total += n
      if (v != null && compareVersions(v, gateVersion) >= 0) gated += n
    }
    return { date: iso.slice(0, 10), gated, total, share: total > 0 ? gated / total : null }
  })
}

function parseArgs(argv) {
  const out = { project: "opencode-mobile", days: 7, gate: GATE_FIRST_VERSION }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--days") out.days = Number(argv[++i])
    else if (a === "--gate") out.gate = argv[++i]
    else if (a === "--project") out.project = argv[++i]
    else if (a === "--at") out.at = argv[++i]
    else if (a === "--json") out.json = true
  }
  return out
}

const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env.SENTRY_AUTH_TOKEN || process.env.SENTRY_WRITE_TOKEN
  const org = process.env.SENTRY_ORG || "vibetechnologies"
  if (!token) {
    console.error("SENTRY_AUTH_TOKEN (or SENTRY_WRITE_TOKEN) is required")
    process.exit(2)
  }

  const pid = await projectId(org, args.project, token)
  const qs = new URLSearchParams({
    project: String(pid),
    field: "count_unique(user)",
    statsPeriod: `${args.days}d`,
    interval: "1d",
    groupBy: "release",
  })
  qs.append("field", "sum(session)")
  const json = await sentry(`/organizations/${org}/sessions/?${qs}`, token)

  const summary = gatedShareFromSessions(json, args.gate)
  const series = dailySeries(json, args.gate)
  const stale = staleLeader(summary)
  const projection = args.at ? projectShare(series, args.at) : null

  if (args.json) {
    console.log(JSON.stringify({ project: args.project, gateVersion: args.gate, days: args.days, summary, series, stale, projection }, null, 2))
    return
  }

  console.log(`Install-base uptake — ${args.project}, last ${args.days}d (Sentry release health)`)
  console.log(`gate = v${args.gate}+\n`)
  console.log("version       users   share    sessions   share   gated")
  for (const r of summary.rows) {
    const v = (r.version ?? "unknown").padEnd(10)
    const us = String(r.users).padStart(8)
    const usp = pct(summary.users.total ? r.users / summary.users.total : null).padStart(8)
    const ss = String(r.sessions).padStart(10)
    const ssp = pct(summary.sessions.total ? r.sessions / summary.sessions.total : null).padStart(8)
    console.log(`${v}${us}${usp}${ss}${ssp}   ${r.gated ? "yes" : "no"}`)
  }
  console.log("")
  console.log(`gated share (users):    ${pct(summary.share)}  (${summary.users.gated}/${summary.users.total})`)
  console.log(`gated share (sessions): ${pct(summary.shareBySession)}  (${summary.sessions.gated}/${summary.sessions.total})`)
  if (summary.unknownUsers) console.log(`unparseable releases:   ${summary.unknownUsers} users (counted as NOT gated)`)
  if (stale) {
    console.log(`largest ungated cohort: v${stale.version} at ${pct(stale.share)} of active users`)
    if (stale.share >= 0.5) {
      console.log(`  ^ a single stale build holds the majority of the base. The gate cannot`)
      console.log(`    reach it, so the ceiling on any volume reduction is ${pct(1 - stale.share)} until that`)
      console.log(`    cohort updates. That is a DISTRIBUTION problem, not a gate problem.`)
    }
  }
  if (projection) {
    console.log("")
    console.log(`projected gated share at ${args.at}: ${pct(projection.share)}${projection.reason ? ` (${projection.reason})` : ""}`)
  }
  console.log("")
  console.log("Daily gated share:")
  for (const p of series) console.log(`  ${p.date}  ${pct(p.share).padStart(7)}  (${p.gated}/${p.total})`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err))
    process.exit(1)
  })
}
