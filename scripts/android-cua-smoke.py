#!/usr/bin/env python3
"""
Android Computer-Use Agent (CUA) smoke test for OpenCode Mobile.

Drives an Android emulator via ADB using an LLM vision loop:
  screenshot → vision model → action → repeat

Inspired by:
- openai/openai-cua-sample-app (browser CUA pattern)
- X-PLUG/MobileAgent (ADB + VLM loop)
- TencentQQGYLab/AppAgent (multimodal smartphone agent)

Requirements:
  pip install openai
  ADB in PATH with a connected device/emulator.

Usage:
  # OpenAI
  export OPENAI_API_KEY=sk-...
  python scripts/android-cua-smoke.py

  # Azure OpenAI (with deployment)
  export OPENAI_API_KEY=<key>
  export OPENAI_BASE_URL=https://<resource>.openai.azure.com/openai/deployments/<deployment>/
  python scripts/android-cua-smoke.py --model gpt-4o

  # Google Gemini (via OpenAI-compat)
  export GEMINI_API_KEY=AIza...
  python scripts/android-cua-smoke.py

  # xAI Grok
  export XAI_API_KEY=xai-...
  python scripts/android-cua-smoke.py

  # Any OpenAI-compatible endpoint (LiteLLM, Ollama, etc.)
  export OPENAI_API_KEY=dummy
  export OPENAI_BASE_URL=http://localhost:4000/v1
  python scripts/android-cua-smoke.py --model gpt-4o

  # Custom goal
  python scripts/android-cua-smoke.py --goal "Open settings and toggle dark mode"
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import threading
import re
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    from openai import OpenAI, AzureOpenAI
except ImportError:
    sys.exit("openai package required: pip install openai")




# ---------------------------------------------------------------------------
# ADB helpers
# ---------------------------------------------------------------------------

def adb(*args: str) -> str:
    """Run an adb command and return stdout."""
    result = subprocess.run(
        ["adb", *args],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0 and "Error" in result.stderr:
        raise RuntimeError(f"adb {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


_step_counter = 0
APP_PACKAGE = "cc.agentlabs.opencode"


def _bounds_center(bounds: str) -> tuple[int, int] | None:
    match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds or "")
    if not match:
        return None
    x1, y1, x2, y2 = map(int, match.groups())
    return ((x1 + x2) // 2, (y1 + y2) // 2)


def current_foreground_package() -> str:
    """Return resumed foreground package name when available."""
    out = adb("shell", "dumpsys", "activity", "activities")
    for line in out.splitlines():
        if "mResumedActivity" not in line:
            continue
        match = re.search(r"\s([a-zA-Z0-9_\.]+)/", line)
        if match:
            return match.group(1)
    return ""


def ensure_app_foreground(package: str = APP_PACKAGE, retries: int = 3,
                          verbose: bool = True) -> bool:
    """Bring app to foreground before scenario start."""
    for attempt in range(retries):
        current = current_foreground_package()
        if current == package:
            return True

        adb("shell", "monkey", "-p", package, "-c", "android.intent.category.LAUNCHER", "1")
        time.sleep(2.0)

        if verbose:
            seen = current or "unknown"
            print(f"  [prep] foreground package was '{seen}', launched '{package}' (attempt {attempt + 1}/{retries})")

    return current_foreground_package() == package


def maybe_dismiss_telemetry_consent(package: str = APP_PACKAGE,
                                    verbose: bool = True) -> bool:
    """Dismiss first-launch telemetry consent modal when present."""
    xml = ui_dump()
    if not xml:
        return False

    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return False

    consent_markers = (
        "help improve opencode",
        "share anonymous crash reports",
    )
    dismiss_markers = (
        "not now", "no thanks", "decline", "skip", "later",
        "don't allow", "dont allow", "deny", "continue without",
        "opt out", "cancel",
    )

    page_text = " ".join(
        " ".join(filter(None, [
            node.attrib.get("text", ""),
            node.attrib.get("content-desc", ""),
        ])).lower()
        for node in root.iter()
    )

    if not any(marker in page_text for marker in consent_markers):
        return False

    candidates = []
    for node in root.iter():
        clickable = node.attrib.get("clickable") == "true"
        if not clickable:
            continue

        label = " ".join(filter(None, [
            node.attrib.get("text", ""),
            node.attrib.get("content-desc", ""),
            node.attrib.get("resource-id", ""),
        ])).strip().lower()
        center = _bounds_center(node.attrib.get("bounds", ""))
        if not center:
            continue
        candidates.append((label, center))

    for label, (x, y) in candidates:
        if any(marker in label for marker in dismiss_markers):
            adb("shell", "input", "tap", str(x), str(y))
            time.sleep(1.0)
            if verbose:
                print(f"  [prep] dismissed telemetry consent via '{label or 'button'}' at ({x}, {y})")
            return True

    if verbose:
        print("  [prep] telemetry consent detected but dismiss button was not found")
    return False


def screenshot_b64() -> str:
    """Capture emulator screenshot and return as base64 PNG. Retries on timeout."""
    global _step_counter
    _step_counter += 1
    for attempt in range(3):
        try:
            result = subprocess.run(
                ["adb", "exec-out", "screencap", "-p"],
                capture_output=True, timeout=30,
            )
            if result.returncode == 0 and len(result.stdout) > 100:
                # Save for debugging
                debug_path = f"/tmp/cua_step_{_step_counter:03d}.png"
                Path(debug_path).write_bytes(result.stdout)
                return base64.b64encode(result.stdout).decode()
        except subprocess.TimeoutExpired:
            if attempt < 2:
                time.sleep(3)
                continue
            raise
    # Fallback: screencap on device then pull
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        path = f.name
    try:
        subprocess.run(["adb", "shell", "screencap", "-p", "/sdcard/_cua_screen.png"],
                       capture_output=True, timeout=30)
        subprocess.run(["adb", "pull", "/sdcard/_cua_screen.png", path],
                       capture_output=True, timeout=10)
        data = Path(path).read_bytes()
        Path(f"/tmp/cua_step_{_step_counter:03d}.png").write_bytes(data)
        return base64.b64encode(data).decode()
    finally:
        Path(path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Screen recording
# ---------------------------------------------------------------------------

def start_screen_recording(scenario_name: str) -> tuple:
    """Start ADB screen recording. Returns (thread, stop_event, remote_path)."""
    remote_path = f"/sdcard/cua_{scenario_name}.mp4"
    stop_event = threading.Event()

    def _record():
        # --time-limit 180 caps at 3 min; we stop it early via SIGTERM via adb
        try:
            subprocess.run(
                ["adb", "shell", f"screenrecord --time-limit 180 {remote_path}"],
                capture_output=True, timeout=200,
            )
        except Exception:
            pass

    thread = threading.Thread(target=_record, daemon=True)
    thread.start()
    time.sleep(1.0)  # let recorder spin up
    return thread, stop_event, remote_path


def stop_screen_recording(thread: threading.Thread, remote_path: str,
                          local_path: str) -> bool:
    """Stop recorder, pull video to local_path. Returns True on success."""
    # Stop screenrecord via pkill (SIGINT flushes MP4 moov atom)
    subprocess.run(
        ["adb", "shell", "pkill", "-2", "screenrecord"],
        capture_output=True, timeout=10,
    )
    time.sleep(2.0)  # let MP4 finalise
    thread.join(timeout=5)

    result = subprocess.run(
        ["adb", "pull", remote_path, local_path],
        capture_output=True, timeout=30,
    )
    if result.returncode == 0 and Path(local_path).exists():
        print(f"  [recording] saved to {local_path}")
        return True
    print(f"  [recording] pull failed: {result.stderr.decode(errors='replace').strip()}")
    return False


# ---------------------------------------------------------------------------
# ArchiveBox upload
# ---------------------------------------------------------------------------

def upload_to_archivebox(video_path: str, scenario_name: str) -> bool:
    """Upload video to ArchiveBox if ARCHIVEBOX_URL is configured.

    Reads ARCHIVEBOX_URL and ARCHIVEBOX_API_KEY from environment.
    Returns True if uploaded, False/skipped otherwise.
    """
    url = os.environ.get("ARCHIVEBOX_URL", "").rstrip("/")
    api_key = os.environ.get("ARCHIVEBOX_API_KEY", "")
    if not url:
        print("  [archivebox] ARCHIVEBOX_URL not set — skipping upload")
        return False

    try:
        import urllib.request
        import urllib.parse

        video_data = Path(video_path).read_bytes()
        boundary = "----CUAUploadBoundary"
        body_parts = []
        body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"url\"\r\n\r\nfile://{scenario_name}.mp4".encode())
        body_parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{scenario_name}.mp4\"\r\nContent-Type: video/mp4\r\n\r\n".encode()
            + video_data
        )
        body_parts.append(f"--{boundary}--\r\n".encode())
        body = b"\r\n".join(body_parts)

        headers = {
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        }
        if api_key:
            headers["X-API-Key"] = api_key

        req = urllib.request.Request(f"{url}/api/v1/add", data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_data = resp.read().decode(errors="replace")
            print(f"  [archivebox] uploaded {scenario_name}.mp4 → {url} ({resp.status})")
            return True
    except Exception as exc:
        print(f"  [archivebox] upload failed: {exc}")
        return False


def ui_dump() -> str:
    """Dump UI hierarchy XML and return as string (optional context for LLM)."""
    adb("shell", "uiautomator", "dump", "/sdcard/_cua_ui.xml")
    result = subprocess.run(
        ["adb", "pull", "/sdcard/_cua_ui.xml", "/tmp/_cua_ui.xml"],
        capture_output=True, timeout=10,
    )
    if result.returncode == 0:
        return Path("/tmp/_cua_ui.xml").read_text(errors="replace")
    return ""


def execute_action(action: dict) -> str:
    """Execute an action dict returned by the LLM. Returns status string."""
    act = action.get("type", "")

    if act == "tap":
        x, y = int(action["x"]), int(action["y"])
        adb("shell", "input", "tap", str(x), str(y))
        return f"tapped ({x}, {y})"

    elif act == "type":
        text = action.get("text", "")
        # ADB input text needs escaping
        escaped = text.replace(" ", "%s").replace("&", "\\&").replace(";", "\\;")
        adb("shell", "input", "text", escaped)
        return f"typed '{text}'"

    elif act == "key":
        key = action.get("key", "")
        key_map = {
            "enter": "66", "back": "4", "home": "3",
            "delete": "67", "tab": "61",
        }
        code = key_map.get(key.lower(), key)
        adb("shell", "input", "keyevent", code)
        return f"pressed key {key}"

    elif act == "swipe":
        x1, y1 = int(action["x1"]), int(action["y1"])
        x2, y2 = int(action["x2"]), int(action["y2"])
        duration = int(action.get("duration", 300))
        adb("shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration))
        return f"swiped ({x1},{y1})->({x2},{y2})"

    elif act == "send":
        # Auto-locate send button: rightmost clickable ViewGroup in the bottom input bar
        xml = ui_dump()
        # Find the EditText (message input) and the clickable element immediately after it
        # The send button is the last clickable ViewGroup in the input row
        matches = re.findall(r'clickable="true"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
        if matches:
            # Find the rightmost clickable element near the bottom (y > 2200)
            bottom_buttons = [(int(x1), int(y1), int(x2), int(y2)) for x1, y1, x2, y2 in matches if int(y1) > 2200]
            if bottom_buttons:
                # Rightmost = highest x1
                send_btn = max(bottom_buttons, key=lambda b: b[0])
                cx = (send_btn[0] + send_btn[2]) // 2
                cy = (send_btn[1] + send_btn[3]) // 2
                adb("shell", "input", "tap", str(cx), str(cy))
                return f"send button tapped ({cx}, {cy})"
        # Fallback: tap known location
        adb("shell", "input", "tap", "996", "2358")
        return "send button tapped (fallback 996, 2358)"

    elif act == "wait":
        secs = float(action.get("seconds", 2))
        time.sleep(secs)
        return f"waited {secs}s"

    elif act == "done":
        return "DONE"

    elif act == "fail":
        return "FAIL: " + action.get("reason", "unknown")

    else:
        return f"unknown action: {act}"


# ---------------------------------------------------------------------------
# LLM CUA loop
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an Android phone automation agent. You control the device by issuing actions.

On each turn you receive a screenshot of the current screen.
Respond with a JSON object for ONE action to take next.

Available actions:
  {"type": "tap", "x": <int>, "y": <int>}
  {"type": "type", "text": "<string>"}
  {"type": "key", "key": "enter|back|home|delete|tab"}
  {"type": "swipe", "x1": <int>, "y1": <int>, "x2": <int>, "y2": <int>, "duration": <ms>}
  {"type": "send"}  -- tap the send button (auto-locates via UI hierarchy)
  {"type": "wait", "seconds": <float>}
  {"type": "done", "summary": "<what was accomplished>"}
  {"type": "fail", "reason": "<why the goal cannot be achieved>"}

Rules:
- Issue exactly ONE action per turn as a JSON object. No markdown, no explanation outside JSON.
- Coordinates are in pixels relative to the screenshot dimensions.
- IMPORTANT: In this app, pressing "enter" inserts a newline, it does NOT send the message.
  To send a message, use the {"type": "send"} action which auto-locates and taps the send button.
  After typing, dismiss the keyboard by pressing "back", then use {"type": "send"}.
- When the goal is fully achieved, respond with {"type": "done", ...}.
- If stuck after several attempts, respond with {"type": "fail", ...}.
"""


def call_llm(client, model: str, system: str, history: list) -> str:
    """Call LLM via OpenAI-compatible API with retry on rate limit."""
    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system}] + history,
                max_completion_tokens=300,
                temperature=0,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                wait = 15 * (attempt + 1)
                print(f"  [rate limited, retrying in {wait}s...]")
                time.sleep(wait)
                continue
            raise


def make_client(model: str):
    """Create OpenAI client. Supports AZURE_OPENAI_*, AZURE_DEV_AI_*, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY."""
    if os.environ.get("AZURE_OPENAI_API_KEY"):
        azure_model = os.environ.get("AZURE_OPENAI_MODEL", "gpt-5.4")
        return AzureOpenAI(
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        ), azure_model
    # Azure AI Foundry endpoint (cognitiveservices.azure.com/openai/v1) — use OpenAI client
    if os.environ.get("AZURE_DEV_AI_API_KEY"):
        base_url = os.environ.get("AZURE_DEV_AI_BASE_URL", "https://vibe-dev-ai.cognitiveservices.azure.com/openai/v1")
        azure_model = os.environ.get("AZURE_DEV_AI_MODEL", "gpt-4o-2024-11-20")
        return OpenAI(api_key=os.environ["AZURE_DEV_AI_API_KEY"], base_url=base_url), azure_model
    if os.environ.get("OPENAI_API_KEY"):
        base = os.environ.get("OPENAI_BASE_URL")
        return OpenAI(base_url=base) if base else OpenAI(), model
    if os.environ.get("XAI_API_KEY"):
        return OpenAI(
            api_key=os.environ["XAI_API_KEY"],
            base_url="https://api.x.ai/v1",
        ), "grok-2-vision-1212"
    if os.environ.get("GEMINI_API_KEY"):
        return OpenAI(
            api_key=os.environ["GEMINI_API_KEY"],
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        ), "gemini-2.0-flash"
    sys.exit("Set AZURE_OPENAI_API_KEY, AZURE_DEV_AI_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or GEMINI_API_KEY")


def get_screen_size() -> tuple[int, int]:
    """Return (width, height) of the connected device screen."""
    try:
        out = adb("shell", "wm", "size")
        # "Physical size: 1080x1920" or "Override size: 1080x1920"
        for line in out.splitlines():
            if "size:" in line.lower():
                dims = line.split(":")[-1].strip()
                w, h = dims.split("x")
                return int(w), int(h)
    except Exception:
        pass
    return 1080, 1920


def run_cua(goal: str, max_steps: int = 30, model: str = "gpt-4o",
            include_ui_xml: bool = False, verbose: bool = True) -> dict:
    """Run the CUA loop until done/fail/max_steps."""
    client, model = make_client(model)
    history = []
    screen_w, screen_h = get_screen_size()

    for step in range(1, max_steps + 1):
        # Capture screenshot
        img_b64 = screenshot_b64()

        # Build user message with screenshot
        content = [
            {"type": "text", "text": f"Step {step}. Screen is {screen_w}x{screen_h} pixels. Goal: {goal}\nWhat action should I take next?"},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}", "detail": "high"}},
        ]

        # Optionally include UI XML for better element identification
        if include_ui_xml:
            xml = ui_dump()
            if xml:
                # Truncate to avoid token explosion
                content.append({"type": "text", "text": f"UI hierarchy (truncated):\n{xml[:4000]}"})

        history.append({"role": "user", "content": content})

        # Call LLM
        reply = call_llm(client, model, SYSTEM_PROMPT, history)
        history.append({"role": "assistant", "content": reply})

        # Parse action
        try:
            clean = reply.strip()
            # Strip markdown code fences
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            # If model returned multiple JSON objects, take the first
            import re as _re
            m = _re.search(r'\{[^{}]*\}', clean)
            if m:
                action = json.loads(m.group(0))
            else:
                action = json.loads(clean)
        except json.JSONDecodeError:
            if verbose:
                print(f"  [step {step}] Failed to parse: {reply[:100]}")
            continue

        # Execute
        result = execute_action(action)
        if verbose:
            print(f"  [step {step}] {action.get('type', '?')} -> {result}")

        if result == "DONE":
            return {"status": "success", "steps": step, "summary": action.get("summary", "")}
        if result.startswith("FAIL"):
            return {"status": "fail", "steps": step, "reason": action.get("reason", "")}

        # Brief pause between actions for UI to settle
        time.sleep(1.0)

        # Keep history manageable: only last 6 turns (12 messages) + system
        if len(history) > 12:
            history = history[-12:]

    return {"status": "timeout", "steps": max_steps}


# ---------------------------------------------------------------------------
# Smoke test scenarios
# ---------------------------------------------------------------------------

SMOKE_SCENARIOS = [
    {
        "name": "send_message",
        "goal": (
            "You see the OpenCode mobile app. Tap the '+' button (top-right) to create a new session. "
            "Tap the text input at the bottom. Type 'ping'. Press back to dismiss keyboard. "
            "Use the send action. Wait 5 seconds. "
            "Report success if you see both a 'You' bubble and an 'Assistant' bubble."
        ),
    },
    {
        "name": "multi_turn",
        "goal": (
            "You see the OpenCode mobile app. Tap '+' (top-right) to create a new session. "
            "Tap the text input. Type 'what is 2+2'. Press back. Use send action. Wait 5 seconds. "
            "Then tap the text input again, type 'and 3+3?'. Press back. Use send action. Wait 5 seconds. "
            "Report success if you see two assistant reply bubbles."
        ),
    },
    {
        "name": "verify_session_list",
        "goal": (
            "You see the OpenCode mobile app. Tap the '+' button (top-right) to create a new session. "
            "Wait 2 seconds for the session to be created. "
            "Navigate back to the sessions list by tapping the bottom-left 'Sessions' tab or pressing the back button. "
            "Wait 3 seconds for the session list to load. "
            "Report success if you can see at least one session entry in the list. "
            "Report failure if the sessions list appears empty or shows an error message."
        ),
    },
]

# Extended scenarios requiring an external OpenCode server.
# Run with: python scripts/android-cua-smoke.py --opencode-url http://<host>:<port>
def _connect_and_verify_sessions_goal(url: str) -> str:
    return (
        f"You see the OpenCode mobile app. "
        "Go to the Connections tab (bottom navigation bar). "
        "If a connection to the server already exists, tap it to make it active and skip to the next step. "
        "Otherwise tap '+' or 'Add Connection', "
        f"enter the URL '{url}', leave username/password blank, tap Save or Connect. "
        "Wait 3 seconds. "
        "Now navigate to the Sessions tab (bottom navigation bar). "
        "Wait 5 seconds for sessions to load. "
        "If the sessions list is empty or shows 'No sessions yet', tap the '+' button "
        "(top-right) to create a new session, wait 3 seconds, then navigate back to the "
        "Sessions tab and wait 3 seconds for the list to refresh. "
        "Report SUCCESS if you see at least one session listed (a session title is visible). "
        "Report FAILURE if the sessions list is still empty, shows 'No sessions yet', or shows an error."
    )


def main():
    parser = argparse.ArgumentParser(description="Android CUA smoke test")
    parser.add_argument("--goal", help="Custom goal (overrides built-in scenarios)")
    parser.add_argument("--model", default="gpt-4o", help="Vision model to use")
    parser.add_argument("--max-steps", type=int, default=30)
    parser.add_argument("--include-xml", action="store_true", help="Include UI XML in context")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument(
        "--opencode-url",
        help="OpenCode server URL (e.g. http://100.108.64.76:4096). "
             "Used by the default connect-and-verify regression scenario.",
    )
    parser.add_argument(
        "--skip-connect-scenario",
        action="store_true",
        help="Skip the default connect-and-verify regression scenario.",
    )
    parser.add_argument(
        "--only-connect-scenario",
        action="store_true",
        help="Run ONLY the connect-and-verify-sessions scenario. Use in CI with a "
             "local opencode server for a deterministic true-E2E (no model backend needed).",
    )
    args = parser.parse_args()

    # Verify ADB
    try:
        devices = adb("devices")
        if "device" not in devices.split("\n", 1)[-1]:
            sys.exit("No ADB device connected. Start emulator first.")
    except FileNotFoundError:
        sys.exit("adb not found in PATH")

    connect_url = args.opencode_url or os.environ.get("OPENCODE_URL") or "http://100.108.64.76:4096"
    connect_scenario = {
        "name": "connect_and_verify_sessions",
        "goal": _connect_and_verify_sessions_goal(connect_url),
    }

    if args.only_connect_scenario:
        # CI true-E2E: just connect to the local opencode server and verify the list.
        scenarios = [connect_scenario]
    else:
        scenarios = [{"name": "custom", "goal": args.goal}] if args.goal else list(SMOKE_SCENARIOS)
        # Keep connect-and-verify in the default smoke path so regressions are exercised.
        if not args.goal and not args.skip_connect_scenario:
            scenarios.append(connect_scenario)

    results = []
    for scenario in scenarios:
        if not args.quiet:
            print(f"\n{'='*60}")
            print(f"Scenario: {scenario['name']}")
            print(f"Goal: {scenario['goal'][:80]}...")
            print(f"{'='*60}")

        # Start screen recording
        rec_thread, _stop_ev, remote_path = start_screen_recording(scenario["name"])
        local_video = f"/tmp/cua_{scenario['name']}.mp4"

        try:
            if not ensure_app_foreground(verbose=not args.quiet):
                print(f"  [prep] warning: could not confirm {APP_PACKAGE} in foreground")
            maybe_dismiss_telemetry_consent(verbose=not args.quiet)
            ensure_app_foreground(verbose=not args.quiet)

            result = run_cua(
                goal=scenario["goal"],
                max_steps=args.max_steps,
                model=args.model,
                include_ui_xml=args.include_xml,
                verbose=not args.quiet,
            )
        finally:
            # Always stop and pull the recording
            stop_screen_recording(rec_thread, remote_path, local_video)
            upload_to_archivebox(local_video, scenario["name"])

        result["scenario"] = scenario["name"]
        result["video"] = local_video if Path(local_video).exists() else None
        results.append(result)

        if not args.quiet:
            print(f"\nResult: {result['status']} in {result['steps']} steps")
            if result.get("video"):
                print(f"Video:  {result['video']}")
            if result.get("summary"):
                print(f"Summary: {result['summary']}")
            if result.get("reason"):
                print(f"Reason: {result['reason']}")

    # Exit code: 0 if all passed
    failed = [r for r in results if r["status"] != "success"]
    if failed:
        print(f"\n{'!'*60}")
        print(f"FAILED: {len(failed)}/{len(results)} scenarios")
        sys.exit(1)
    else:
        print(f"\nAll {len(results)} scenarios passed.")


if __name__ == "__main__":
    main()
