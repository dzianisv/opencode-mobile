#!/usr/bin/env node
/**
 * Halt / resume / complete a staged Play rollout (issue #230, design §2).
 *
 * WHY THIS EXISTS
 * ---------------
 * Since #230 a tag publish lands on the production track as a STAGED
 * rollout (status=inProgress, userFraction=0.20) instead of 100% at once.
 * Play has no "button" a workflow can press after the Sentry watch window —
 * moving the release halted -> inProgress -> completed is a Google Play
 * Developer API edit. This script performs exactly one such transition:
 *
 *   halt:     inProgress -> halted    (userFraction kept as-is)
 *   resume:   halted     -> inProgress (userFraction kept as-is)
 *   complete: inProgress|halted -> completed (userFraction field REMOVED)
 *
 * The update sends back the COMPLETE Track object returned by tracks.get,
 * verbatim except the target release — a constructed single-release
 * payload would delete the other releases on the track (design §5).
 *
 * TARGETING (fail-closed)
 * -----------------------
 * --version-code is REQUIRED on the production track: a halt/complete for a
 * versionCode that is no longer the track's staged release must fail, never
 * guess (design §2 supersede rule). Only on non-production tracks may it be
 * omitted, in which case the target is the track's single inProgress
 * release (0 or >1 candidates = fail). Play returns versionCodes as
 * strings, and matching compares AS STRINGS.
 *
 * COMMIT SAFETY
 * -------------
 * Any non-200 aborts before commit; the edit is left uncommitted and
 * expires — no partial state on Play. Commit pins
 * changesInReviewBehavior=ERROR_IF_IN_REVIEW (Google's default,
 * CANCEL_IN_REVIEW_AND_SUBMIT, is destructive and never used). After
 * commit, a NEW edit re-reads the track and asserts the target release's
 * live status/fraction equals the intended end state; a mismatch exits
 * non-zero (this is also what catches a halt held by managed publishing).
 *
 * --dry-run performs insert -> tracks.get -> tracks.update INSIDE the edit,
 * prints the resulting track payload, and abandons the edit WITHOUT
 * committing (server-validated targeting, no live effect, design §6).
 *
 * USAGE
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='<sa json>' \
 *     node scripts/play-rollout.mjs --action halt --track production --version-code 251
 *   ... --track alpha            (non-production: --version-code optional)
 *   ... --dry-run                (validate inside an uncommitted edit)
 *
 * Auth copies scripts/play-version-share.mjs: self-signed JWT via
 * node:crypto (RSA-SHA256), token POST to sa.token_uri, env
 * GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — one change: the JWT scope is
 * androidpublisher (the existing script uses the reporting scope).
 * Never prints the SA JSON, tokens, or Authorization headers.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME || "cc.agentlabs.opencode";
const API_BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;

const ACTIONS = ["halt", "resume", "complete"];
const TRACKS = ["production", "alpha", "beta", "internal"];
/** Valid source states per action (design §2). */
const VALID_FROM = {
  halt: ["inProgress"],
  resume: ["halted"],
  complete: ["inProgress", "halted"],
};
/** Intended end status per action. */
const END_STATUS = { halt: "halted", resume: "inProgress", complete: "completed" };

function parseArgs(argv) {
  const out = { action: "", track: "", versionCode: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--action") out.action = argv[++i] || "";
    else if (a === "--track") out.track = argv[++i] || "";
    else if (a === "--version-code") out.versionCode = argv[++i] || "";
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function loadServiceAccount() {
  const raw =
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE
      ? readFileSync(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE, "utf8")
      : "");
  if (!raw.trim()) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (or _FILE) is required");
  }
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("service account JSON is missing client_email/private_key");
  return sa;
}

/** Mint an access token straight from the SA key (no googleapis dependency). */
async function getAccessToken(sa) {
  const scope = "https://www.googleapis.com/auth/androidpublisher";
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
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}`);
  return body.access_token;
}

/** One Android Publisher API call. Any non-200 throws — callers never commit after a throw. */
async function api(path, token, init = {}) {
  const res = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

async function insertEdit(token) {
  const edit = await api("edits", token, { method: "POST", body: JSON.stringify({}) });
  if (!edit.id) throw new Error("edits.insert returned no edit id");
  return edit.id;
}

async function getTrack(token, editId, track) {
  return api(`edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`, token);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --- Validation, BEFORE reading credentials or any API call. ---
  if (!ACTIONS.includes(args.action)) {
    throw new Error(`--action must be one of ${ACTIONS.join("|")} (got "${args.action || "<empty>"}")`);
  }
  if (!TRACKS.includes(args.track)) {
    throw new Error(`--track must be one of ${TRACKS.join("|")} (got "${args.track || "<empty>"}")`);
  }
  if (args.track === "production" && !args.versionCode) {
    throw new Error(
      "--version-code is REQUIRED when --track=production (refusing to guess the staged release on production)",
    );
  }

  const token = await getAccessToken(loadServiceAccount());

  // 1) Insert edit. 2) Read the track.
  const editId = await insertEdit(token);
  const trackObj = await getTrack(token, editId, args.track);
  const releases = trackObj.releases || [];

  // Find the target release.
  let target;
  let resolvedVersionCode;
  if (args.versionCode) {
    const matches = releases.filter((r) => (r.versionCodes || []).map(String).includes(args.versionCode));
    if (matches.length !== 1) {
      throw new Error(
        `expected exactly one release with versionCode ${args.versionCode} on track ${args.track}, found ${matches.length} — aborting, no commit`,
      );
    }
    target = matches[0];
    resolvedVersionCode = args.versionCode;
  } else {
    // Non-production only (production was rejected above): auto-find the
    // track's single inProgress release (design §2).
    const matches = releases.filter((r) => r.status === "inProgress");
    if (matches.length !== 1) {
      throw new Error(
        `no --version-code given and track ${args.track} has ${matches.length} inProgress releases (need exactly 1) — aborting, no commit`,
      );
    }
    target = matches[0];
    resolvedVersionCode = target.versionCodes && target.versionCodes.length ? String(target.versionCodes[0]) : "";
    if (!resolvedVersionCode) throw new Error("auto-found inProgress release has no versionCodes — aborting, no commit");
  }

  // Source state must be valid for the action.
  if (!VALID_FROM[args.action].includes(target.status)) {
    throw new Error(
      `cannot ${args.action} versionCode ${resolvedVersionCode} on track ${args.track}: release status is "${target.status}" (valid source: ${VALID_FROM[args.action].join(" | ")}) — aborting, no commit`,
    );
  }

  // 3) Build the updated track: the COMPLETE Track object from the GET,
  // verbatim except the target release (design §5).
  const originalFraction = target.userFraction;
  const updatedRelease = { ...target };
  updatedRelease.status = END_STATUS[args.action];
  if (args.action === "complete") delete updatedRelease.userFraction;
  const targetIndex = releases.indexOf(target);
  const updatedTrack = {
    ...trackObj,
    releases: releases.map((r, i) => (i === targetIndex ? updatedRelease : r)),
  };
  await api(`edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(args.track)}`, token, {
    method: "PUT",
    body: JSON.stringify(updatedTrack),
  });

  if (args.dryRun) {
    console.log(JSON.stringify(updatedTrack, null, 2));
    console.log(
      `play-rollout: DRY RUN — action=${args.action} track=${args.track} versionCode=${resolvedVersionCode} would become status=${END_STATUS[args.action]}; edit ${editId} abandoned WITHOUT commit`,
    );
    return;
  }

  // 4) Commit.
  await api(`edits/${encodeURIComponent(editId)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, token, {
    method: "POST",
    body: JSON.stringify({}),
  });

  // Post-commit verification: a NEW edit re-reads the live track and asserts
  // the target release's end state (design §2). Mismatch = loud failure.
  const verifyEditId = await insertEdit(token);
  const liveTrack = await getTrack(token, verifyEditId, args.track);
  const live = (liveTrack.releases || []).find((r) => (r.versionCodes || []).map(String).includes(resolvedVersionCode));
  if (!live) {
    throw new Error(
      `POST-COMMIT VERIFICATION FAILED: versionCode ${resolvedVersionCode} not found on track ${args.track} after commit`,
    );
  }
  const intendedFraction = args.action === "complete" ? undefined : originalFraction;
  if (live.status !== END_STATUS[args.action]) {
    throw new Error(
      `POST-COMMIT VERIFICATION FAILED: versionCode ${resolvedVersionCode} on track ${args.track} is "${live.status}", expected "${END_STATUS[args.action]}"`,
    );
  }
  if (args.action === "complete") {
    if (live.userFraction !== undefined && live.userFraction !== null) {
      throw new Error(
        `POST-COMMIT VERIFICATION FAILED: completed release ${resolvedVersionCode} still carries userFraction=${live.userFraction}`,
      );
    }
  } else if (intendedFraction !== undefined && live.userFraction !== intendedFraction) {
    throw new Error(
      `POST-COMMIT VERIFICATION FAILED: versionCode ${resolvedVersionCode} fraction is ${live.userFraction}, expected ${intendedFraction}`,
    );
  }

  console.log(
    `play-rollout: action=${args.action} track=${args.track} versionCode=${resolvedVersionCode} status=${live.status} fraction=${args.action === "complete" ? "none" : (live.userFraction ?? "none")}`,
  );
}

main().catch((err) => {
  console.error(`play-rollout: ${err.message}`);
  process.exit(1);
});
