#!/usr/bin/env node
//
// Activation + demo funnel report from PostHog.
//
// Answers the retention question this app's analytics exist for: of everyone
// who opens the app, how many reach a working connection — and does the
// offline demo (demo_started) move that number?
//
// Requires a PostHog PERSONAL API key (read scope) — NOT the client ingest
// key (EXPO_PUBLIC_POSTHOG_KEY) shipped in the app, which is write-only.
//
//   POSTHOG_PERSONAL_API_KEY   personal API key, "Read" scope (Settings ->
//                              Personal API keys)
//   POSTHOG_PROJECT_ID         numeric project id (Settings -> Project)
//   POSTHOG_HOST               optional, default https://eu.posthog.com
//   FUNNEL_DAYS                optional lookback window, default 30
//
// Usage:  node scripts/funnel-report.mjs
//
// Read-only: issues HogQL SELECTs only. No data is written.

const KEY = process.env.POSTHOG_PERSONAL_API_KEY
const PROJECT = process.env.POSTHOG_PROJECT_ID
const HOST = (process.env.POSTHOG_HOST || "https://eu.posthog.com").replace(/\/+$/, "")
const DAYS = Number(process.env.FUNNEL_DAYS || 30)

if (!KEY || !PROJECT) {
  console.error(
    [
      "Missing credentials. This report needs a PostHog PERSONAL API key (read scope),",
      "not the app's client ingest key.",
      "",
      "  export POSTHOG_PERSONAL_API_KEY=phx_...   # Settings > Personal API keys (Read)",
      "  export POSTHOG_PROJECT_ID=12345           # Settings > Project ID",
      "  export POSTHOG_HOST=https://eu.posthog.com # optional (EU default)",
      "  node scripts/funnel-report.mjs",
    ].join("\n"),
  )
  process.exit(2)
}

async function hogql(query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PostHog query failed (HTTP ${res.status}): ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  return json.results || []
}

const pct = (n, d) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : "—")

async function main() {
  const since = `now() - INTERVAL ${DAYS} DAY`

  // 1. Per-event volume + unique users in the window.
  const events = [
    "app_opened",
    "connection_form_submitted",
    "connection_attempted",
    "connection_succeeded",
    "connection_failed",
    "message_sent",
    "response_received",
    "demo_started",
    "demo_step_advanced",
    "demo_completed",
    "demo_exited_to_connect",
  ]
  const rows = await hogql(
    `SELECT event, count() AS events, count(DISTINCT person_id) AS users
     FROM events
     WHERE event IN (${events.map((e) => `'${e}'`).join(",")})
       AND timestamp > ${since}
     GROUP BY event`,
  )
  const u = {}
  for (const [event, , users] of rows) u[event] = Number(users)
  const has = (e) => u[e] || 0

  // 2. Demo -> real connection correlation (the money metric): of users who
  //    started the demo, how many later reached a successful connection.
  const [[demoUsers = 0, demoThenConnected = 0] = []] = await hogql(
    `SELECT
       count(DISTINCT person_id) AS demo_users,
       count(DISTINCT if(connected, person_id, NULL)) AS demo_then_connected
     FROM (
       SELECT person_id,
              maxIf(1, event='connection_succeeded') AS connected
       FROM events
       WHERE timestamp > ${since}
         AND person_id IN (
           SELECT DISTINCT person_id FROM events
           WHERE event='demo_started' AND timestamp > ${since}
         )
       GROUP BY person_id
     )`,
  )

  console.log(`\n=== OpenCode Mobile funnel — last ${DAYS} days (${HOST}, project ${PROJECT}) ===\n`)

  console.log("Activation funnel (unique users):")
  const opened = has("app_opened")
  console.log(`  app_opened                ${opened}`)
  console.log(`  connection_form_submitted ${has("connection_form_submitted")}  (${pct(has("connection_form_submitted"), opened)} of opens)`)
  console.log(`  connection_succeeded      ${has("connection_succeeded")}  (${pct(has("connection_succeeded"), opened)} of opens)`)
  console.log(`  message_sent              ${has("message_sent")}  (${pct(has("message_sent"), opened)} of opens)`)
  console.log(`  response_received         ${has("response_received")}`)
  console.log(`  connection_failed         ${has("connection_failed")}`)

  console.log("\nDemo funnel (unique users):")
  const dStart = has("demo_started")
  console.log(`  demo_started              ${dStart}`)
  console.log(`  demo_step_advanced        ${has("demo_step_advanced")}  (${pct(has("demo_step_advanced"), dStart)})`)
  console.log(`  demo_completed            ${has("demo_completed")}  (${pct(has("demo_completed"), dStart)})`)
  console.log(`  demo_exited_to_connect    ${has("demo_exited_to_connect")}  (${pct(has("demo_exited_to_connect"), dStart)})`)

  console.log("\nDemo → connection (does the demo drive activation?):")
  console.log(`  started demo              ${Number(demoUsers)}`)
  console.log(`  ...later connected        ${Number(demoThenConnected)}  (${pct(Number(demoThenConnected), Number(demoUsers))} of demo users)`)
  const nonDemoOpen = opened - dStart
  console.log(`  baseline connect rate     ${pct(has("connection_succeeded"), opened)} (all opens)`)
  console.log("")
}

main().catch((e) => {
  console.error(String(e.message || e))
  process.exit(1)
})
