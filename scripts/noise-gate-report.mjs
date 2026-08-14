#!/usr/bin/env node
/**
 * Did the Sentry noise gate actually cut the volume? — the honest version.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/sentry-volume-report.mjs` answers "how many events/month is the org
 * consuming". That number alone CANNOT grade the gate (AGE-105), because the gate
 * ships inside an app binary and only runs on devices that installed it.
 *
 * On 2026-08-14 the gate went to Play production (versionCode 151). Replaying 90d
 * of this project's real events through the gate drops 96.9% of them, which
 * predicts ~87 events/month — but ONLY once every user is on a gated build. Play
 * uptake takes days-to-weeks and never reaches 100%.
 *
 * So a naive read on 2026-08-17 ("still 2,000/month, the gate failed") is a
 * measurement error, not a finding: if a third of the install base has upgraded,
 * the honest expectation is ~2/3 of the baseline, and 2,000 is a PASS. The
 * reverse mistake is just as easy — a drop caused by fewer users opening the app
 * over a weekend, read as gate efficacy.
 *
 * This script folds Play's version share into the comparison:
 *
 *   expected_post = baseline_rate x (1 - gated_share x efficacy)
 *
 * and grades the measured post rate against THAT, not against the endpoint. It
 * also reports the endpoint (`fullUptakeProjection`) so the answer to "will this
 * clear the 3,500/month org gate when uptake completes" is separate from "is it
 * on track today".
 *
 * NOT A SUBSTITUTE FOR GATE LIVENESS. `client_discard/before_send > 0` proves the
 * gate is running on real devices and is independent of install share — it shows
 * up first. This script surfaces it and refuses to grade a window without it.
 *
 * USAGE
 *   SENTRY_AUTH_TOKEN=... GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=... \
 *     node scripts/noise-gate-report.mjs \
 *       --pre  2026-08-14T07:00:00Z..2026-08-14T14:00:00Z \
 *       --post 2026-08-17T00:00:00Z..now
 *
 *   --json            machine-readable
 *   --no-play         skip Play (grades at gated_share=0, i.e. "no credit for uptake")
 *   --project SLUG    default opencode-mobile
 *
 * Neither credential lives on a laptop. Run it through
 * `.github/workflows/sentry-noise-gate-report.yml` (workflow_dispatch), which has
 * both as repo secrets and writes the table to the run summary.
 *
 * Exit code is 0 for any *readable* result — an unmet target is a finding to
 * report, not a crash. Non-zero only when the data cannot be obtained.
 */

import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const MONTH_HOURS = 730

/**
 * First Play versionCode containing the gate. v0.4.14 = internal 150 / production
 * 151 (publish-play-store.yml sets versionCode = github.run_number + 100, so the
 * gradle number is meaningless here). Anything >= this has the gate.
 */
export const GATE_FIRST_VERSION_CODE = Number(process.env.GATE_FIRST_VERSION_CODE || 150)

/**
 * Share of this project's real events the gate hard-drops, measured — not guessed
 * — by replaying the 90d census (648 events, 11 issues) of `opencode-mobile`
 * through the gate's own precedence in `src/lib/sentry-noise.test.ts`. 96.9%.
 * Deliberately conservative: it counts only the transport drop-list, ignoring the
 * dedup/rate-cap layers, which can only remove more.
 */
export const GATE_EFFICACY = Number(process.env.GATE_EFFICACY || 0.969)

/** Org-wide monthly budget from AGE-71, and this project's own target from AGE-105. */
export const ORG_MONTHLY_GATE = 3500
export const PROJECT_MONTHLY_TARGET = 1500

/**
 * Tolerance on the expectation. The inputs are two independent samples (Sentry
 * hours, Play daily vitals) of a diurnal process, so demanding equality would
 * make every read a failure. 25% above expectation is the line.
 */
export const TOLERANCE = Number(process.env.NOISE_GATE_TOLERANCE || 0.25)

/**
 * The whole point of the script, isolated and pure so it can be tested without a
 * network: what SHOULD the post-deploy rate be, given how much of the install
 * base is actually running the gate?
 *
 * @param {object} p
 * @param {number} p.baselinePerHour   submitted events/hour before the rollout
 * @param {number} p.actualPerHour     submitted events/hour in the measured window
 * @param {number} p.gatedShare        0..1 share of active users on a gated build
 * @param {number} [p.efficacy]        share of events the gate drops on a gated device
 * @param {boolean} [p.gateLive]       did client_discard/before_send appear at all
 */
export function grade({ baselinePerHour, actualPerHour, gatedShare, efficacy = GATE_EFFICACY, gateLive = true }) {
  const share = Math.min(Math.max(gatedShare ?? 0, 0), 1)
  const expectedPerHour = baselinePerHour * (1 - share * efficacy)
  const ceilingPerHour = expectedPerHour * (1 + TOLERANCE)
  const fullUptakePerHour = baselinePerHour * (1 - efficacy)
  const observedReduction = baselinePerHour > 0 ? 1 - actualPerHour / baselinePerHour : 0
  // What the gate must be doing on gated devices for the observed number to hold.
  // Inverts the model instead of trusting the constant: reduction = share x eff.
  const impliedEfficacy = share > 0 ? Math.min(Math.max(observedReduction / share, 0), 1) : null

  let verdict
  let because
  if (!gateLive) {
    verdict = "UNGRADED"
    because =
      "client_discard/before_send is 0 in this window — no device ran the gate, so nothing here measures it. " +
      "Check the release actually reached users before reading the rate."
  } else if (share === 0) {
    verdict = "UNGRADED"
    because = "Play reports 0% of active users on a gated build; the rate cannot be attributed to the gate yet."
  } else if (actualPerHour <= ceilingPerHour) {
    verdict = "ON_TRACK"
    because =
      `measured ${actualPerHour.toFixed(2)}/h is at or below the ${ceilingPerHour.toFixed(2)}/h ceiling implied by ` +
      `${(share * 100).toFixed(1)}% uptake (expected ${expectedPerHour.toFixed(2)}/h +${(TOLERANCE * 100).toFixed(0)}%).`
  } else {
    verdict = "OFF_TRACK"
    because =
      `measured ${actualPerHour.toFixed(2)}/h exceeds the ${ceilingPerHour.toFixed(2)}/h ceiling for ` +
      `${(share * 100).toFixed(1)}% uptake. Either the gate is not dropping what the replay said it would, or a new ` +
      `noise class appeared. Name it — do not widen the drop-list blindly.`
  }

  return {
    verdict,
    because,
    gatedShare: share,
    efficacy,
    baselinePerMonth: baselinePerHour * MONTH_HOURS,
    actualPerMonth: actualPerHour * MONTH_HOURS,
    expectedPerMonth: expectedPerHour * MONTH_HOURS,
    ceilingPerMonth: ceilingPerHour * MONTH_HOURS,
    fullUptakeProjection: fullUptakePerHour * MONTH_HOURS,
    observedReduction,
    impliedEfficacy,
    meetsProjectTargetAtFullUptake: fullUptakePerHour * MONTH_HOURS < PROJECT_MONTHLY_TARGET,
  }
}

/**
 * Same question one level up: does the ORG clear its 3,500/month gate?
 *
 * `orgPerHour`/`projectPerHour` must come from the SAME window, and preferably the
 * longest one available: the other projects here emit ~0.7 events/hour, so a 1-2h
 * window routinely contains zero of them and would flatter the org total to "this
 * project only".
 */
export function orgOutlook({ orgPerHour, projectPerHour, projectFullUptakePerMonth }) {
  const otherPerMonth = Math.max(orgPerHour - projectPerHour, 0) * MONTH_HOURS
  const projectedOrgPerMonth = otherPerMonth + projectFullUptakePerMonth
  return {
    orgPerMonthNow: orgPerHour * MONTH_HOURS,
    otherProjectsPerMonth: otherPerMonth,
    projectedOrgPerMonthAtFullUptake: projectedOrgPerMonth,
    clearsOrgGate: projectedOrgPerMonth < ORG_MONTHLY_GATE,
    headroom: ORG_MONTHLY_GATE - projectedOrgPerMonth,
  }
}

/** Share of active users on a build that contains the gate. */
export function gatedShareFromPlay(playJson, firstGatedVersionCode = GATE_FIRST_VERSION_CODE) {
  const versions = playJson?.versions ?? []
  const total = versions.reduce((s, v) => s + (v.users || 0), 0)
  const gated = versions
    .filter((v) => Number(v.versionCode) >= firstGatedVersionCode)
    .reduce((s, v) => s + (v.users || 0), 0)
  return { gated, total, share: total > 0 ? gated / total : 0, window: playJson?.window ?? null }
}

function runJson(script, args) {
  const out = execFileSync(process.execPath, [join(HERE, script), ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
  return JSON.parse(out)
}

function parseArgs(argv) {
  const out = { project: "opencode-mobile", play: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--pre") out.pre = argv[++i]
    else if (a === "--post") out.post = argv[++i]
    else if (a === "--project") out.project = argv[++i]
    else if (a === "--json") out.json = true
    else if (a === "--no-play") out.play = false
  }
  if (!out.pre) throw new Error("--pre START..END is required (the rate before the rollout reached devices)")
  if (!out.post) out.post = `${new Date(Date.now() - 7 * 86_400_000).toISOString()}..now`
  return out
}

function pick(report, windowName, project) {
  const w = report.windows.find((x) => x.name === windowName)
  if (!w) throw new Error(`sentry-volume-report returned no window named ${windowName}`)
  const p = w.projects.find((x) => x.project === project)
  return {
    hours: w.hours,
    orgPerHour: w.orgSubmitted / w.hours,
    perHour: p ? p.submittedPerHour : 0,
    submitted: p ? p.submitted : 0,
    gateDropped: p ? p.gateDropped : 0,
    backoffDropped: p ? p.backoffDropped : 0,
  }
}

const money = (n) => Math.round(n).toLocaleString("en-US")

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const volume = runJson("sentry-volume-report.mjs", [
    "--json",
    "--window",
    `pre=${args.pre}`,
    "--window",
    `post=${args.post}`,
  ])
  const pre = pick(volume, "pre", args.project)
  const post = pick(volume, "post", args.project)

  let play = null
  let shareInfo = { gated: 0, total: 0, share: 0, window: null }
  if (args.play) {
    play = runJson("play-version-share.mjs", ["--json"])
    shareInfo = gatedShareFromPlay(play)
  }

  const g = grade({
    baselinePerHour: pre.perHour,
    actualPerHour: post.perHour,
    gatedShare: shareInfo.share,
    gateLive: post.gateDropped > 0,
  })
  // Other projects are a background rate, not something this gate changes, so
  // estimate them from whichever window is long enough to contain any of them.
  const bg = post.hours >= pre.hours ? post : pre
  const org = orgOutlook({
    orgPerHour: bg.orgPerHour,
    projectPerHour: bg.perHour,
    projectFullUptakePerMonth: g.fullUptakeProjection,
  })
  org.backgroundFrom = bg === post ? "post" : "pre"
  org.backgroundHours = bg.hours

  const result = {
    project: args.project,
    generatedAt: new Date().toISOString(),
    windows: { pre: { ...pre, spec: args.pre }, post: { ...post, spec: args.post } },
    uptake: shareInfo,
    grade: g,
    org,
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const lines = []
  lines.push(`## Noise-gate report — ${args.project}`)
  lines.push("")
  lines.push(`**${g.verdict}** — ${g.because}`)
  lines.push("")
  lines.push("| | events/month |")
  lines.push("| --- | ---: |")
  lines.push(`| baseline (pre, ${pre.hours}h) | ${money(g.baselinePerMonth)} |`)
  lines.push(`| measured (post, ${post.hours}h) | ${money(g.actualPerMonth)} |`)
  lines.push(`| expected at ${(g.gatedShare * 100).toFixed(1)}% uptake | ${money(g.expectedPerMonth)} |`)
  lines.push(`| ceiling (+${(TOLERANCE * 100).toFixed(0)}%) | ${money(g.ceilingPerMonth)} |`)
  lines.push(`| projection at 100% uptake | ${money(g.fullUptakeProjection)} |`)
  lines.push(`| project target (AGE-105) | ${money(PROJECT_MONTHLY_TARGET)} |`)
  lines.push("")
  lines.push(
    `Uptake: **${shareInfo.gated} of ${shareInfo.total}** active users on versionCode >= ${GATE_FIRST_VERSION_CODE}` +
      ` = **${(shareInfo.share * 100).toFixed(1)}%**` +
      (shareInfo.window ? ` (Play vitals ${shareInfo.window.start} → ${shareInfo.window.end})` : " (Play skipped)"),
  )
  lines.push(
    `Gate liveness: client_discard/before_send = **${post.gateDropped}** in the post window` +
      ` (ratelimit_backoff ${post.backoffDropped} — that one is the org over quota, not us).`,
  )
  if (g.impliedEfficacy !== null) {
    lines.push(
      `Implied on-device efficacy: **${(g.impliedEfficacy * 100).toFixed(1)}%** ` +
        `(the replay predicted ${(g.efficacy * 100).toFixed(1)}%).`,
    )
  }
  lines.push("")
  lines.push(
    `Org outlook: other projects ${money(org.otherProjectsPerMonth)}/mo (from the ${org.backgroundFrom} window, ` +
      `${org.backgroundHours}h) + this project at full uptake ${money(result.grade.fullUptakeProjection)}/mo = ` +
      `**${money(org.projectedOrgPerMonthAtFullUptake)}/mo** vs the ${money(ORG_MONTHLY_GATE)}/mo org gate → ` +
      `**${org.clearsOrgGate ? "clears" : "MISSES"}** (headroom ${money(org.headroom)}).`,
  )
  lines.push("")
  if (post.hours < 24) {
    lines.push(
      `⚠ The measured window is ${post.hours}h. Under ~24h a window can rank sources but cannot certify a monthly ` +
        "rate — diurnal load is real. Treat the numbers above as directional.",
    )
    lines.push("")
  }
  lines.push(
    "Read `submitted` (accepted + rate_limited), never `accepted`: while the org is over quota, `accepted` is ~0 for " +
      "every project and a broken org is indistinguishable from a fixed one.",
  )

  const text = lines.join("\n")
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs")
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`noise-gate-report: ${err.message}`)
    process.exit(1)
  })
}
