#!/usr/bin/env node
// Org-wide Sentry error-volume report.
//
// Answers one question: how many error events per month is this org actually
// consuming, per project, per outcome — and how did that change across a
// deploy boundary?
//
// Why it exists: the "Sentry event budget" work (see docs/analytics.md) is
// gated on a *measured* rate, not on "the filter is merged". Every heartbeat
// that re-checks the number should run the same query, or the before/after
// comparison is not a comparison.
//
// Usage:
//   SENTRY_AUTH_TOKEN=... node scripts/sentry-volume-report.mjs \
//     --by-reason --org vibetechnologies \
//     --window "pre=2026-08-13T14:00:00Z..2026-08-14T06:00:00Z" \
//     --window "post=2026-08-14T14:22:00Z..now"
//
// Notes on reading the output:
//   * The headline metric is `submitted` = accepted + rate_limited: every event
//     the client actually put on the wire, i.e. real demand against quota.
//     Do NOT headline `accepted`. Once the org is over quota, Sentry rejects
//     everything and `accepted` collapses to ~0 for every project — which
//     makes a broken org look identical to a fixed one.
//   * `rate_limited` is demand that arrived after the quota was gone. It is
//     evidence of a problem, not of a fix.
//   * `client_discard` is NOT a gate metric on its own. Split it by reason
//     (`--by-reason`, on by default in the summary line):
//       - `before_send`       -> our noise gate dropped the event. THIS is the
//                                only column that proves the gate is running on
//                                real devices, and it is independent of install
//                                -base share, so it shows up long before the
//                                monthly rate bends.
//       - `ratelimit_backoff` -> the SDK is in 429 backoff because the ORG is
//                                over quota. Pure symptom of the overage. It
//                                rises when things get WORSE. Reading raw
//                                `client_discard` as "the gate is working" is
//                                the same class of error as reading `accepted`.
//       - `event_processor` / `network_error` -> neither of the above.
//   * Per-release attribution is impossible while the org is over quota:
//     rate_limited events are never stored, so `release`/`dist` tag values (and
//     issues) simply stop. Do not try to segment the after-number by app
//     version from Sentry; use outcome+reason, and Play for version share.
//   * A window shorter than ~24h cannot certify a monthly rate; it can only
//     rank sources. Diurnal load is real.

const API = "https://sentry.io/api/0"
const MONTH_HOURS = 730

function parseArgs(argv) {
  const out = { org: process.env.SENTRY_ORG ?? "vibetechnologies", windows: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--org") out.org = argv[++i]
    else if (a === "--window") out.windows.push(argv[++i])
    else if (a === "--json") out.json = true
    else if (a === "--by-reason") out.byReason = true
  }
  return out
}

function parseWindow(spec) {
  const eq = spec.indexOf("=")
  if (eq < 0) throw new Error(`bad --window ${spec} (want name=START..END)`)
  const name = spec.slice(0, eq)
  const [rawStart, rawEnd] = spec.slice(eq + 1).split("..")
  if (!rawStart || !rawEnd) throw new Error(`bad --window ${spec} (want name=START..END)`)
  const at = (v) => (v === "now" ? new Date() : new Date(v))
  const start = at(rawStart)
  const end = at(rawEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`bad --window ${spec} (unparseable date)`)
  }
  if (end <= start) throw new Error(`bad --window ${spec} (end <= start)`)
  return { name, start, end, hours: (end - start) / 3_600_000 }
}

async function sentry(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await res.json()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`)
  return body
}

async function projectSlugs(org, token) {
  const projects = await sentry(`/organizations/${org}/projects/`, token)
  return new Map(projects.map((p) => [String(p.id), p.slug]))
}

async function windowStats(org, token, win) {
  const qs = new URLSearchParams({
    field: "sum(quantity)",
    category: "error",
    start: win.start.toISOString().replace(/\.\d+Z$/, "Z"),
    end: win.end.toISOString().replace(/\.\d+Z$/, "Z"),
    project: "-1",
  })
  qs.append("groupBy", "project")
  qs.append("groupBy", "outcome")
  qs.append("groupBy", "reason")
  const data = await sentry(`/organizations/${org}/stats_v2/?${qs}`, token)
  const rows = new Map()
  for (const g of data.groups ?? []) {
    const key = String(g.by.project)
    if (!rows.has(key)) rows.set(key, { outcomes: {}, reasons: {} })
    const row = rows.get(key)
    const qty = g.totals["sum(quantity)"] ?? 0
    if (!qty) continue
    row.outcomes[g.by.outcome] = (row.outcomes[g.by.outcome] ?? 0) + qty
    const reason = g.by.reason ?? "none"
    row.reasons[`${g.by.outcome}/${reason}`] = (row.reasons[`${g.by.outcome}/${reason}`] ?? 0) + qty
  }
  return rows
}

function fmt(n) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env.SENTRY_AUTH_TOKEN
  if (!token) {
    console.error("SENTRY_AUTH_TOKEN is not set. This script is read-only; a scoped read token is enough.")
    process.exit(2)
  }
  if (args.windows.length === 0) {
    // Default: last 7 days, one window. Enough to certify a monthly rate.
    const end = new Date()
    const start = new Date(end.getTime() - 7 * 86_400_000)
    args.windows.push(`7d=${start.toISOString()}..${end.toISOString()}`)
  }

  const windows = args.windows.map(parseWindow)
  const slugs = await projectSlugs(args.org, token)
  const results = []
  for (const win of windows) {
    results.push({ win, rows: await windowStats(args.org, token, win) })
  }

  const report = { org: args.org, generatedAt: new Date().toISOString(), windows: [] }
  for (const { win, rows } of results) {
    const projects = []
    let orgSubmitted = 0
    for (const [id, { outcomes, reasons }] of rows) {
      const accepted = outcomes.accepted ?? 0
      const rateLimited = outcomes.rate_limited ?? 0
      const submitted = accepted + rateLimited
      orgSubmitted += submitted
      projects.push({
        project: slugs.get(id) ?? id,
        accepted,
        rateLimited,
        submitted,
        clientDiscard: outcomes.client_discard ?? 0,
        // The gate. Everything else in client_discard is not us.
        gateDropped: reasons["client_discard/before_send"] ?? 0,
        backoffDropped: reasons["client_discard/ratelimit_backoff"] ?? 0,
        reasons,
        filtered: outcomes.filtered ?? 0,
        submittedPerHour: submitted / win.hours,
        submittedPerMonth: (submitted / win.hours) * MONTH_HOURS,
      })
    }
    projects.sort((a, b) => b.submitted - a.submitted)
    report.windows.push({
      name: win.name,
      start: win.start.toISOString(),
      end: win.end.toISOString(),
      hours: Number(win.hours.toFixed(2)),
      projects,
      orgSubmitted,
      orgSubmittedPerMonth: (orgSubmitted / win.hours) * MONTH_HOURS,
    })
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  for (const w of report.windows) {
    console.log(`\n== ${w.name}  ${w.start} -> ${w.end}  (${w.hours}h)`)
    console.log(
      `${"project".padEnd(24)}${"submitted".padStart(11)}${"accepted".padStart(10)}${"rate_lim".padStart(10)}${"cli_disc".padStart(10)}${"sub/h".padStart(9)}${"sub/mo".padStart(10)}`,
    )
    for (const p of w.projects) {
      console.log(
        `${p.project.padEnd(24)}${fmt(p.submitted).padStart(11)}${fmt(p.accepted).padStart(10)}${fmt(p.rateLimited).padStart(10)}${fmt(p.clientDiscard).padStart(10)}${p.submittedPerHour.toFixed(2).padStart(9)}${fmt(p.submittedPerMonth).padStart(10)}`,
      )
    }
    console.log(
      `${"ORG TOTAL (submitted)".padEnd(24)}${fmt(w.orgSubmitted).padStart(11)}${"".padStart(30)}${(w.orgSubmitted / w.hours).toFixed(2).padStart(9)}${fmt(w.orgSubmittedPerMonth).padStart(10)}`,
    )

    // Always print the gate-liveness split, because raw `client_discard` is
    // ambiguous: `ratelimit_backoff` (org over quota, a symptom) looks exactly
    // like `before_send` (our gate, the fix) unless you split them.
    const gate = w.projects.reduce((n, p) => n + p.gateDropped, 0)
    const backoff = w.projects.reduce((n, p) => n + p.backoffDropped, 0)
    console.log(
      `client_discard split: before_send (our gate) ${fmt(gate)}  |  ratelimit_backoff (org over quota) ${fmt(backoff)}`,
    )
    if (gate === 0) {
      console.log("  before_send == 0 -> no device is running the noise gate yet in this window.")
    }

    if (args.byReason) {
      for (const p of w.projects) {
        const entries = Object.entries(p.reasons).sort((a, b) => b[1] - a[1])
        if (entries.length === 0) continue
        console.log(`  ${p.project}`)
        for (const [k, v] of entries) console.log(`    ${fmt(v).padStart(8)}  ${k}`)
      }
    }
  }
  console.log(
    "\nGate: org submitted (accepted + rate_limited) < 3,500/month." +
      "\nWindows under ~24h rank sources but do not certify a rate." +
      "\nGate liveness: client_discard/before_send > 0 for opencode-mobile." +
      "\nDo NOT segment by release: over-quota events are never stored, so release tags stop.",
  )
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
