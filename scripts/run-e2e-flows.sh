#!/usr/bin/env bash
#
# Runs the Maestro activation E2E flows against the mock opencode servers the
# workflow started on the host (ports 4096-4100). Invoked as a single line from
# activation-e2e.yml's emulator-runner `script:` so cd/trap/loop actually work.
#
# Networking: `adb reverse` maps each mock port so the emulator's own
# localhost:PORT forwards to the host's localhost:PORT; flows connect to
# 127.0.0.1:<port>. (10.0.2.2 was unreliable headless.)
set -uo pipefail

ROOT="$(pwd)"                       # capture BEFORE any cd, so diag paths are absolute
APK="android/app/build/outputs/apk/release/app-release.apk"
# CORE = the activation coverage issue #90 verified green (consent -> connect
# -> send, and the connect-time-401 visible-error case). A failure here fails
# the job — this is the suite's actual regression gate.
#
# NEWER = flows added after the initial activation suite (#82's
# directory-picker/all-sessions/variant-picker, #101's diff-scroll) that have
# never once run to completion in CI: they always sat behind the positive
# flow's stale SSE-reply assertion (issue #90 mode B, now fixed) or the
# negative-401 flow's stale "401" assertion (also now fixed), both of which
# made the job fail before reaching them — so they were merged and have been
# running unverified against the current UI/mock ever since. Run them for
# visibility (each flow's pass/fail is reported below) but don't block on
# them yet — see issue #104 for hardening them (fixing whatever stale
# selectors/seeding surface) and moving each back into CORE once confirmed
# green.
CORE_FLOWS=(activation-positive activation-negative-401)
# demo.yaml (offline "Try a demo" mode) needs no mock server — it never
# connects — so it's safe to run alongside the others here unmodified.
NEWER_FLOWS=(directory-picker all-sessions variant-picker diff-scroll demo)
mkdir -p "$ROOT/artifacts/screenshots" "$ROOT/artifacts/diag"

echo "== installing APK =="
adb install "$APK"

echo "== forwarding mock ports into the emulator (adb reverse) =="
for p in 4096 4097 4098 4099 4100; do adb reverse "tcp:$p" "tcp:$p"; done
adb reverse --list

# Decisive probe: can the EMULATOR actually reach the host mock via 127.0.0.1?
# If any in-emulator method prints the health JSON, the network path is good
# and any flow failure is app-side; if none succeed, attribution falls back to
# a host-side check + adb reverse state so we at least know the mock is up.
# `toybox wget`/`nc` don't work reliably on the API-28 image (wget: unknown
# command; nc connects but the request/response framing is unreliable) — so
# this tries curl (if present), then mksh's /dev/tcp pseudo-device (a shell
# builtin, not an external binary, so it survives whatever toybox applets
# this image did/didn't build), then nc as a last in-emulator attempt, before
# falling back to a host-side confirmation. This never blocks the flow — the
# result is recorded and the script continues regardless.
PROBE_FILE="$ROOT/artifacts/diag/probe.txt"
probe_result="UNKNOWN"

{
  echo "== emulator -> mock reachability probe (127.0.0.1:4096/global/health) =="
} > "$PROBE_FILE"

probe_via() {
  # $1 = human label for the log, $2 = remote shell command string
  local label="$1" cmd="$2" out
  echo "[$label]" | tee -a "$PROBE_FILE"
  out="$(timeout 10 adb shell "$cmd" 2>&1)"
  echo "$out" | tee -a "$PROBE_FILE"
  [[ "$out" == *'"healthy"'* ]]
}

if probe_via "curl" 'curl -s -m 5 http://127.0.0.1:4096/global/health'; then
  probe_result="PASS (curl)"
elif probe_via "toybox-wget" 'toybox wget -qO - http://127.0.0.1:4096/global/health'; then
  probe_result="PASS (wget)"
elif probe_via "mksh-devtcp" 'exec 3<>/dev/tcp/127.0.0.1/4096 && printf "GET /global/health HTTP/1.0\r\n\r\n" >&3 && cat <&3'; then
  probe_result="PASS (/dev/tcp)"
elif probe_via "nc" 'printf "GET /global/health HTTP/1.0\r\n\r\n" | toybox nc -w 3 127.0.0.1 4096'; then
  probe_result="PASS (nc)"
else
  echo "[fallback: host-side confirmation]" | tee -a "$PROBE_FILE"
  host_check="$(timeout 5 curl -s http://127.0.0.1:4096/global/health 2>&1 || true)"
  reverse_list="$(adb reverse --list 2>&1 || true)"
  {
    echo "host curl: $host_check"
    echo "adb reverse --list: $reverse_list"
  } | tee -a "$PROBE_FILE"
  if [[ "$host_check" == *'"healthy"'* ]]; then
    probe_result="UNKNOWN (host mock is up, but no in-emulator method could confirm emulator-side reachability)"
  else
    probe_result="FAIL (host mock itself is not responding on 127.0.0.1:4096)"
  fi
fi

echo "== probe result: $probe_result ==" | tee -a "$PROBE_FILE"

adb logcat -c || true            # clear, so the captured log is just this run

dump_diag() {
  echo "== capturing diagnostics =="
  adb logcat -d > "$ROOT/artifacts/diag/logcat.txt" 2>&1 || true
  # Maestro writes per-run debug (UI hierarchy + commands) under ~/.maestro/tests
  cp -r "$HOME/.maestro/tests" "$ROOT/artifacts/diag/maestro-tests" 2>/dev/null || true
}
trap dump_diag EXIT

cd "$ROOT/artifacts/screenshots"
rc=0
for f in "${CORE_FLOWS[@]}"; do
  echo "--- flow (core, blocking): $f ---"
  if ! maestro test --debug-output "$ROOT/artifacts/diag/maestro-$f" "$ROOT/.maestro/flows/$f.yaml"; then
    echo "::error::Maestro flow failed: $f"
    rc=1
    break
  fi
done

# Newer flows: always run all of them (no `break` on failure) and never
# affect $rc — see the CORE_FLOWS/NEWER_FLOWS comment above for why. Each
# flow's own pass/fail is still clearly reported, just non-blocking.
echo "== newer flows (non-blocking, tracked for hardening) =="
for f in "${NEWER_FLOWS[@]}"; do
  echo "--- flow (newer, non-blocking): $f ---"
  if maestro test --debug-output "$ROOT/artifacts/diag/maestro-$f" "$ROOT/.maestro/flows/$f.yaml"; then
    echo "== newer flow PASSED: $f =="
  else
    echo "::warning::newer flow FAILED (non-blocking): $f"
  fi
done

exit $rc
