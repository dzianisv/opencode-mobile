## Modality
Real feature test on Android emulator + real OpenCode server via ADB/vision smoke.

## Setup
1. Ensure Android SDK tools in PATH:
   - `export PATH="/tmp/android-sdk/platform-tools:/tmp/android-sdk/emulator:$PATH"`
2. Ensure emulator is booted (`emulator-5554`) and app installed.
3. Load Azure OpenAI env:
   - `source ~/.env.d/azure-openai.env`

## Steps
1. Launch app and clear prior state if needed.
   - Expected: app opens to sessions or onboarding without crash.
2. Run connect-and-verify smoke against real server:
   - `python3 scripts/android-cua-smoke.py --model gpt-5.4 --include-xml --max-steps 40 --opencode-url http://100.108.64.76:4096`
   - Expected: scenario `connect_and_verify_sessions` returns success.
3. Confirm script-level regression path:
   - Expected: `verify_session_list` scenario also succeeds.

## Pass criterion
Both session-list scenarios (`verify_session_list`, `connect_and_verify_sessions`) pass in one run, proving sessions list renders non-empty after connect when server has sessions.
