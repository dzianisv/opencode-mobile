#!/usr/bin/env bash
#
# Runs the Maestro activation E2E flows against the mock opencode servers the
# workflow started on the host (ports 4096-4099). Invoked as a single line from
# activation-e2e.yml's emulator-runner `script:` so cd/trap/loop actually work.
#
# Networking: `adb reverse` maps each mock port so the emulator's own
# localhost:PORT forwards to the host's localhost:PORT; flows connect to
# 127.0.0.1:<port>. (10.0.2.2 was unreliable headless.)
set -uo pipefail

ROOT="$(pwd)"                       # capture BEFORE any cd, so diag paths are absolute
APK="android/app/build/outputs/apk/release/app-release.apk"
# Only the flows that exist on main. directory-picker/all-sessions/variant-picker
# land with the test/e2e-new-features PR.
FLOWS=(activation-positive activation-negative-401)
mkdir -p "$ROOT/artifacts/screenshots" "$ROOT/artifacts/diag"

echo "== installing APK =="
adb install "$APK"

echo "== forwarding mock ports into the emulator (adb reverse) =="
for p in 4096 4097 4098 4099; do adb reverse "tcp:$p" "tcp:$p"; done
adb reverse --list

# Decisive probe: can the EMULATOR actually reach the host mock via 127.0.0.1?
# If either method prints the health JSON, the network path is good and any flow
# failure is app-side; if both fail/hang, it's the transport (adb reverse). Both
# are best-effort — API 28's toybox may or may not ship wget, so nc is a fallback.
echo "== emulator -> mock reachability probe (127.0.0.1:4096/global/health) ==" | tee "$ROOT/artifacts/diag/probe.txt"
echo "[wget]" | tee -a "$ROOT/artifacts/diag/probe.txt"
timeout 15 adb shell 'toybox wget -qO - http://127.0.0.1:4096/global/health' 2>&1 | tee -a "$ROOT/artifacts/diag/probe.txt" || true
echo "[nc]" | tee -a "$ROOT/artifacts/diag/probe.txt"
timeout 15 adb shell 'printf "GET /global/health HTTP/1.0\r\n\r\n" | toybox nc 127.0.0.1 4096' 2>&1 | tee -a "$ROOT/artifacts/diag/probe.txt" || true

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
for f in "${FLOWS[@]}"; do
  echo "--- flow: $f ---"
  if ! maestro test --debug-output "$ROOT/artifacts/diag/maestro-$f" "$ROOT/.maestro/flows/$f.yaml"; then
    echo "::error::Maestro flow failed: $f"
    rc=1
    break
  fi
done
exit $rc
