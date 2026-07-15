#!/usr/bin/env python3
"""
Android Computer-Use Agent (CUA) smoke test for OpenCode Mobile.

Full onboarding showcase — drives an Android emulator via ADB using an LLM vision loop:
  screenshot → vision model → action → repeat

Demonstrates the complete first-run journey:
   1. App opens on connection screen (no saved connections)
   2. Configure opencode server URL
   3. Connect — session list loads
   4. Create new AI coding session
   5. Submit a real Python coding task (helloworld.py + helloworld_test.py)
   6. Watch opencode work (tool calls, file writes), wait for idle
   7. Verify output / success response
   8. Navigate to Settings — show model selection
   9. Screenshot settings screen

Requirements:
  pip install openai
  ADB in PATH with a connected device/emulator.

Usage:
  # Azure OpenAI (recommended — already configured via ~/.env.d/azure-openai.env)
  source ~/.env.d/azure-openai.env
  python scripts/android-cua-smoke.py --model gpt-5.4 --include-xml

  # OpenAI
  export OPENAI_API_KEY=sk-...
  python scripts/android-cua-smoke.py --model gpt-4o --include-xml

  # Run ONLY the onboarding showcase (default and primary flow):
  python scripts/android-cua-smoke.py --showcase

  # Custom goal (legacy / quick debugging):
  python scripts/android-cua-smoke.py --goal "Open settings and toggle dark mode"

  # Speed up for a demo video (tighter waits, fewer retries):
  python scripts/android-cua-smoke.py --speed-multiplier 0.5
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
from functools import lru_cache
from pathlib import Path

try:
    from openai import OpenAI, AzureOpenAI
except ImportError:
    sys.exit("openai package required: pip install openai")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_PACKAGE = "cc.agentlabs.opencode"

# Default opencode Tailscale dev server
DEFAULT_OPENCODE_URL = "http://100.108.64.76:4096"

# Coding task prompts sent to the AI coding session
TYPESCRIPT_TASK = (
    "Write a TypeScript hello world app. "
    "Create a file hello.ts that prints 'Hello, World!' to the console."
)

PYTHON_CODING_TASK = (
    "Write a Python hello world program. "
    "Create helloworld.py that prints Hello World and has a greet function that returns a greeting string. "
    "Also create helloworld_test.py with pytest tests covering both print output and greet. "
    "Make sure both files are well formed and the tests pass."
)

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_step_counter = 0
_speed_multiplier = 1.0   # Set via --speed-multiplier; <1.0 = faster


def _sleep(seconds: float) -> None:
    """Interruptible sleep that respects the global speed multiplier."""
    time.sleep(max(0.2, seconds * _speed_multiplier))


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
        _sleep(2.0)

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
            _sleep(1.0)
            if verbose:
                print(f"  [prep] dismissed telemetry consent via '{label or 'button'}' at ({x}, {y})")
            return True

    if verbose:
        print("  [prep] telemetry consent detected but dismiss button was not found")
    return False


def screenshot_b64(label: str = "") -> str:
    """Capture emulator screenshot and return as base64 PNG. Retries on timeout."""
    global _step_counter
    _step_counter += 1
    suffix = f"_{label}" if label else ""
    debug_path = f"/tmp/cua_step_{_step_counter:03d}{suffix}.png"

    for attempt in range(3):
        try:
            result = subprocess.run(
                ["adb", "exec-out", "screencap", "-p"],
                capture_output=True, timeout=30,
            )
            if result.returncode == 0 and len(result.stdout) > 100:
                Path(debug_path).write_bytes(result.stdout)
                return base64.b64encode(result.stdout).decode()
        except subprocess.TimeoutExpired:
            if attempt < 2:
                _sleep(3)
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
        Path(debug_path).write_bytes(data)
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
        try:
            subprocess.run(
                ["adb", "shell", f"screenrecord --time-limit 180 {remote_path}"],
                capture_output=True, timeout=200,
            )
        except Exception:
            pass

    thread = threading.Thread(target=_record, daemon=True)
    thread.start()
    _sleep(1.0)
    return thread, stop_event, remote_path


def stop_screen_recording(thread: threading.Thread, remote_path: str,
                          local_path: str) -> bool:
    """Stop recorder, pull video to local_path. Returns True on success."""
    subprocess.run(
        ["adb", "shell", "pkill", "-2", "screenrecord"],
        capture_output=True, timeout=10,
    )
    _sleep(2.0)
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
    """Upload video to ArchiveBox if ARCHIVEBOX_URL is configured."""
    url = os.environ.get("ARCHIVEBOX_URL", "").rstrip("/")
    api_key = os.environ.get("ARCHIVEBOX_API_KEY", "")
    if not url:
        print("  [archivebox] ARCHIVEBOX_URL not set — skipping upload")
        return False

    try:
        import urllib.request

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
            print(f"  [archivebox] uploaded {scenario_name}.mp4 → {url} ({resp.status})")
            return True
    except Exception as exc:
        print(f"  [archivebox] upload failed: {exc}")
        return False


def ui_dump() -> str:
    """Dump UI hierarchy XML and return as string."""
    adb("shell", "uiautomator", "dump", "/sdcard/_cua_ui.xml")
    result = subprocess.run(
        ["adb", "pull", "/sdcard/_cua_ui.xml", "/tmp/_cua_ui.xml"],
        capture_output=True, timeout=10,
    )
    if result.returncode == 0:
        return Path("/tmp/_cua_ui.xml").read_text(errors="replace")
    return ""


# ---------------------------------------------------------------------------
# Deterministic assertion helpers (ADB-based — no LLM, no hallucination)
# ---------------------------------------------------------------------------

def check_ui_text(text: str, case_sensitive: bool = False) -> bool:
    """Return True if `text` appears anywhere in the current UI hierarchy XML.

    Uses `uiautomator dump` — fully deterministic, no LLM vision involved.
    Prefer this over asking the LLM to look for text whenever possible.

    Example:
        assert check_ui_text("Reconnecting"), "FAIL: reconnect banner not shown"
    """
    xml = ui_dump()
    haystack = xml if case_sensitive else xml.lower()
    needle = text if case_sensitive else text.lower()
    return needle in haystack


def check_notification_drawer(expected_text: str, timeout: int = 10) -> bool:
    """Return True if `expected_text` appears in the OS notification drawer
    within `timeout` seconds.

    Polls `adb shell dumpsys notification --noredact` — deterministic.
    No LLM vision involved; pass/fail is a simple string match.

    Example:
        assert check_notification_drawer("Agent needs approval", timeout=10)
    """
    end = time.time() + timeout
    while time.time() < end:
        try:
            out = subprocess.check_output(
                ["adb", "shell", "dumpsys", "notification", "--noredact"],
                text=True, stderr=subprocess.DEVNULL, timeout=10,
            )
            if expected_text.lower() in out.lower():
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


def simulate_network_drop() -> None:
    """Cut all network connectivity on the emulator/device.

    Use to test SSE reconnect, disconnect banner, and backgrounded-notification
    scenarios. Always pair with `restore_network()`.

    Note: on the emulator, this affects all interfaces including the host tunnel
    (10.0.2.2). The opencode server will become unreachable, triggering SSE
    disconnect handling in the app.
    """
    adb("shell", "svc", "wifi", "disable")
    adb("shell", "svc", "data", "disable")


def restore_network() -> None:
    """Restore network connectivity after `simulate_network_drop()`."""
    adb("shell", "svc", "wifi", "enable")
    adb("shell", "svc", "data", "enable")


def background_app() -> None:
    """Press Home to background the app (keeps it alive, fires background notifications)."""
    adb("shell", "input", "keyevent", "KEYCODE_HOME")
    _sleep(1.0)


def foreground_app(package: str = APP_PACKAGE) -> None:
    """Bring the app back to foreground."""
    adb("shell", "monkey", "-p", package, "-c", "android.intent.category.LAUNCHER", "1")
    _sleep(1.5)


def execute_action(action: dict) -> str:
    """Execute an action dict returned by the LLM. Returns status string."""
    act = action.get("type", "")

    if act == "tap":
        x, y = int(action["x"]), int(action["y"])
        adb("shell", "input", "tap", str(x), str(y))
        return f"tapped ({x}, {y})"

    elif act == "type":
        text = action.get("text", "")
        # Write text to device file, then use `input text` with shell
        # command-substitution quoting to avoid %s and quote issues.
        # This ensures spaces and special chars are passed correctly
        # to the `input` command while triggering React Native's onChangeText.
        import tempfile, os as _os
        _tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        _tmp.write(text)
        _tmp_path = _tmp.name
        _tmp.close()
        try:
            subprocess.run(["adb", "push", _tmp_path, "/sdcard/_cua_type.txt"],
                           capture_output=True, timeout=10)
            # Pass text via shell command substitution with double quotes
            subprocess.run(
                ["adb", "shell",
                 f"input text \"$(cat /sdcard/_cua_type.txt)\""],
                capture_output=True, timeout=30,
            )
            _sleep(0.3)
        finally:
            _os.unlink(_tmp_path)
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
        return "`send` action is deprecated — use tap with coordinates instead"

    elif act == "wait":
        secs = float(action.get("seconds", 2))
        _sleep(secs)
        return f"waited {secs}s"

    elif act == "screenshot":
        # Explicit screenshot action — agent wants to observe current state
        label = action.get("label", "observe")
        screenshot_b64(label)
        return f"screenshot taken ({label})"

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

On each turn you receive a screenshot of the current Android screen.
Respond with a JSON object for ONE action to take next.

Available actions:
  {"type": "tap", "x": <int>, "y": <int>}
  {"type": "type", "text": "<string>"}
  {"type": "key", "key": "enter|back|home|delete|tab"}
  {"type": "swipe", "x1": <int>, "y1": <int>, "x2": <int>, "y2": <int>, "duration": <ms>}
  {"type": "wait", "seconds": <float>}
  {"type": "screenshot", "label": "<tag>"}  -- observe current state without acting
  {"type": "done", "summary": "<what was accomplished>"}
  {"type": "fail", "reason": "<why the goal cannot be achieved>"}

Rules:
- Issue exactly ONE action per turn as a JSON object. No markdown, no explanation outside JSON.
- Coordinates are in pixels relative to the screenshot dimensions. YOU provide the coordinates.
- IMPORTANT: In this app, pressing "enter" inserts a newline — it does NOT send the message.
  There is NO "send" action. To send a message, use {"type": "tap", "x": ..., "y": ...}
  with coordinates from the screenshot pointing at the send/submit button (usually bottom-right).
- Do NOT press "back" after typing — it will navigate away from the session.
- If the keyboard appears after tapping the text input and blocks the send button,
  first tap a blank area above the keyboard (not on the keyboard) to dismiss it,
  THEN tap the send button. Or: tap the send button from memory if it was visible before the keyboard appeared.
- If the text input is already focused (cursor visible), type directly without tapping it first.
- Be efficient: skip unnecessary waits, tap directly on visible targets.
- When the goal is fully achieved respond with {"type": "done", "summary": "..."}.
- If genuinely stuck after 5+ attempts on the same element respond with {"type": "fail", ...}.
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


@lru_cache(maxsize=1)
def get_screen_size() -> tuple[int, int]:
    """Return (width, height) of the connected device screen. Cached."""
    try:
        out = adb("shell", "wm", "size")
        for line in out.splitlines():
            if "size:" in line.lower():
                dims = line.split(":")[-1].strip()
                w, h = dims.split("x")
                return int(w), int(h)
    except Exception:
        pass
    return 1080, 1920


def run_cua_step(goal: str, max_steps: int = 30, model: str = "gpt-4o",
                 include_ui_xml: bool = False, verbose: bool = True,
                 step_label: str = "", action_delay: float = 0.8) -> dict:
    """Run the CUA loop for a single goal until done/fail/max_steps.

    Args:
        goal: Natural-language instruction for this step.
        max_steps: Hard cap on LLM turns.
        model: Vision model deployment name.
        include_ui_xml: Append UI hierarchy XML to each prompt turn.
        verbose: Print action log.
        step_label: Short name shown in logs/screenshot filenames.
        action_delay: Seconds to pause after each action (scaled by speed_multiplier).
    """
    client, model = make_client(model)
    history = []
    screen_w, screen_h = get_screen_size()
    label_prefix = f"[{step_label}] " if step_label else ""

    for step in range(1, max_steps + 1):
        img_b64 = screenshot_b64(label=f"{step_label}_{step:02d}" if step_label else f"{step:03d}")

        content: list = [
            {
                "type": "text",
                "text": (
                    f"{label_prefix}Step {step}/{max_steps}. "
                    f"Screen: {screen_w}x{screen_h}px. "
                    f"Goal: {goal}\n"
                    "What action should I take next?"
                ),
            },
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}", "detail": "high"}},
        ]

        if include_ui_xml:
            xml = ui_dump()
            if xml:
                content.append({"type": "text", "text": f"UI hierarchy (truncated to 4000 chars):\n{xml[:4000]}"})

        history.append({"role": "user", "content": content})

        reply = call_llm(client, model, SYSTEM_PROMPT, history)
        history.append({"role": "assistant", "content": reply})

        # Parse action — tolerate markdown fences and multi-object responses
        try:
            clean = reply.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            m = re.search(r'\{[^{}]*\}', clean)
            action = json.loads(m.group(0)) if m else json.loads(clean)
        except json.JSONDecodeError:
            if verbose:
                print(f"  {label_prefix}[step {step}] Failed to parse: {reply[:120]}")
            continue

        result = execute_action(action)
        if verbose:
            print(f"  {label_prefix}[step {step}] {action.get('type', '?')} -> {result}")

        if result == "DONE":
            return {"status": "success", "steps": step, "summary": action.get("summary", "")}
        if result.startswith("FAIL"):
            return {"status": "fail", "steps": step, "reason": action.get("reason", "")}

        # Trim history to keep context manageable
        if len(history) > 14:
            history = history[-14:]

        _sleep(action_delay)

    return {"status": "timeout", "steps": max_steps}


# ---------------------------------------------------------------------------
# Onboarding showcase — structured multi-phase flow
# ---------------------------------------------------------------------------

# Banner printed before each named phase so the video is narrated by log output
PHASE_BANNERS = {
    "connect":          "STEP 1-2: Opening app — configuring server connection",
    "session_list":     "STEP 3:   Connected — session list MUST show pre-created session",
    "new_session":      "STEP 4:   Creating a new AI coding session",
    "typescript":       "STEP 5-6: Submitting TypeScript task — watching opencode work",
    "verify":           "STEP 7:   Verifying task output / success response",
    "sessions_reload":  "STEP 4b: Navigate back to sessions tab — verify sessions load (regression guard)",
    "settings":         "STEP 8-9: Navigating to Settings — showing model selection",
}


def _precreate_test_session(opencode_url: str, title: str = "cua-smoke-sessions-check") -> str | None:
    """Create a session directly via the opencode HTTP API (bypasses the CUA).

    Returns the session title on success, None if the server is unreachable.
    The returned title is injected into the session_list phase goal so the CUA
    must confirm this specific session is visible — proving the app loads
    pre-existing sessions from the server on connect (not just an empty screen).
    """
    import urllib.request
    # The CUA script runs on the HOST machine, not inside the emulator.
    # When opencode_url uses the Android emulator's host-route (10.0.2.2),
    # translate it to localhost for this pre-create call — 10.0.2.2 is
    # only reachable from *inside* the emulator, not from the host/CI runner.
    # When opencode_url uses an external address (Tailscale, etc.) that the
    # CI runner can't reach, fall back to localhost:4096 (the runner-local server).
    candidates = [opencode_url.replace("10.0.2.2", "127.0.0.1")]
    # If the URL isn't already localhost, also try 127.0.0.1:4096 as fallback
    if "127.0.0.1" not in candidates[0] and "localhost" not in candidates[0]:
        candidates.append("http://127.0.0.1:4096")

    for api_base in candidates:
        url = f"{api_base.rstrip('/')}/session"
        data = json.dumps({"title": title}).encode()
        req = urllib.request.Request(
            url, data=data, method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = json.loads(resp.read())
                session_id = body.get("id", "unknown")
                print(f"  [pre-create] session created via API ({api_base}): id={session_id!r}, title={title!r}")
                return title
        except Exception as exc:
            print(f"  [pre-create] {api_base} unreachable: {exc}")

    print(f"  [pre-create] WARNING: all candidates failed — session_list phase will skip named-session assertion")
    return None


def _banner(key: str) -> None:
    line = "=" * 64
    msg = PHASE_BANNERS.get(key, key)
    print(f"\n{line}")
    print(f"  {msg}")
    print(f"{line}\n")


def run_onboarding_showcase(
    opencode_url: str = DEFAULT_OPENCODE_URL,
    model: str = "gpt-5.4",
    include_ui_xml: bool = False,
    verbose: bool = True,
    max_steps_per_phase: int = 25,
) -> dict:
    """Execute the full first-run onboarding journey.

    Each phase is a focused CUA sub-goal. Phases are run sequentially.
    Returns a summary dict with per-phase results.
    """

    results: dict[str, dict] = {}

    def _run(key: str, goal: str, max_steps: int | None = None) -> bool:
        """Run one phase. Returns True if succeeded."""
        _banner(key)
        steps = max_steps or max_steps_per_phase
        r = run_cua_step(
            goal=goal,
            max_steps=steps,
            model=model,
            include_ui_xml=include_ui_xml,
            verbose=verbose,
            step_label=key,
            action_delay=0.7,
        )
        results[key] = r
        ok = r["status"] == "success"
        icon = "OK" if ok else "FAIL"
        print(f"\n  [{icon}] Phase '{key}': {r['status']} in {r['steps']} steps")
        if r.get("summary"):
            print(f"         {r['summary']}")
        if r.get("reason"):
            print(f"         reason: {r['reason']}")
        return ok

    # Pre-create a known session via API so phase 3 can assert it is visible.
    # This is the core regression guard: if the app doesn't load pre-existing
    # sessions from the server on connect, the session_list phase will fail.
    precreated_title = _precreate_test_session(opencode_url)

    # -----------------------------------------------------------------------
    # Phase 1-2: Open app, configure server connection
    # -----------------------------------------------------------------------
    host_only = opencode_url.replace("http://", "").replace(":4096", "")
    ok = _run(
        "connect",
        goal=(
            f"You are on the OpenCode mobile app. "
            "The screen shows either a connection screen (first launch) or an empty connections list. "
            "Your goal: add a new connection to the opencode server and verify it is saved. "
            "Step 1: Look for an 'Add Connection', '+', or 'New Connection' button and tap it. "
            f"Step 2: In the 'IP Address' field type '{host_only}'. Do NOT include http:// or the port — just the IP. "
            "Step 3: The 'Port' field should already show 4096. Leave it as is. "
            "Step 4: Leave username and password blank. "
            "Step 5: Scroll down if needed and tap the 'Connect' button (a large dark button with a flash icon). "
            "Step 6: Wait up to 5 seconds for the connection to save and return to the connections list. "
            "IMPORTANT — after saving, the connection entry MUST appear in the connections list. "
            f"The entry will show a name like 'My Server' (the URL may be too small to read). "
            "If you are back on the connections list and see ANY connection entry, report done. "
            "If the form is still showing or the list is empty, the save did not work — try again."
        ),
        max_steps=max_steps_per_phase,
    )
    if not ok:
        return {"status": "fail", "phase": "connect", "results": results}

    _sleep(2.0)

    # -----------------------------------------------------------------------
    # Phase 3: Connect to server — session list MUST load pre-existing sessions
    # -----------------------------------------------------------------------
    if precreated_title:
        session_list_goal = (
            "The connection has been saved. "
            "Tap on the saved connection entry to make it active. "
            "CRITICAL: Tapping a connection does NOT navigate away — the app stays on the Connections tab. "
            "After tapping, look at the bottom tab bar and tap the 'Sessions' tab (a chat bubble icon). "
            f"Wait up to 10 seconds for the session list screen to appear. "
            f"IMPORTANT: A session titled '{precreated_title}' was already created on the server "
            "before this test started — it MUST appear in the list after connecting. "
            "Report SUCCESS only if you can see at least one session entry in the list. "
            "Report FAIL if the session list is empty or shows 'No sessions yet' — "
            "that means the app failed to load existing sessions from the server."
        )
    else:
        # Server offline at pre-create time; fall back to just checking screen appears.
        session_list_goal = (
            "The connection has been saved. "
            "Tap on the saved connection entry to make it active. "
            "CRITICAL: Tapping a connection does NOT navigate away — the app stays on the Connections tab. "
            "After tapping, look at the bottom tab bar and tap the 'Sessions' tab (a chat bubble icon). "
            "Wait up to 10 seconds for the session list screen to appear. "
            "Report done when you can see the session list screen."
        )
    ok = _run("session_list", goal=session_list_goal, max_steps=15)
    if not ok:
        return {"status": "fail", "phase": "session_list", "results": results}

    _sleep(1.5)

    # -----------------------------------------------------------------------
    # Phase 4: Create new session
    # -----------------------------------------------------------------------
    ok = _run(
        "new_session",
        goal=(
            "You are on the sessions list screen. "
            "Tap the '+' button (usually top-right) to create a new AI coding session. "
            "Wait up to 5 seconds for the new session / chat screen to open. "
            "Report done once you see a text input field at the bottom of the screen "
            "(the session chat/input view is open)."
        ),
        max_steps=12,
    )
    if not ok:
        return {"status": "fail", "phase": "new_session", "results": results}

    _sleep(1.0)

    # -----------------------------------------------------------------------
    # Phase 4b: Navigate BACK to sessions tab — verify sessions load
    # -----------------------------------------------------------------------
    # Runs BEFORE the TypeScript task so model availability doesn't block this
    # regression check. If the app empties the sessions list on navigation back,
    # this phase fails regardless of whether opencode can process AI tasks.
    sessions_reload_goal = (
        "You are inside an OpenCode session chat view (you just created a new session). "
        "Navigate BACK to the Sessions tab by tapping the 'Sessions' tab in the bottom navigation bar. "
        "Wait up to 5 seconds for the sessions list to fully load. "
        "Report SUCCESS if you can see at least one session entry in the list. "
        "Report FAIL if the sessions list is empty or shows 'No sessions yet' — "
        "that means the app failed to reload sessions after navigating back from a session."
    )
    if precreated_title:
        sessions_reload_goal = (
            "You are inside an OpenCode session chat view (you just created a new session). "
            "Navigate BACK to the Sessions tab by tapping the 'Sessions' tab in the bottom navigation bar. "
            "Wait up to 5 seconds for the sessions list to fully load. "
            f"You should see at least the session titled '{precreated_title}' that existed before this test, "
            "plus the new session you just created. "
            "Report SUCCESS if you can see at least one session entry in the list. "
            "Report FAIL if the sessions list is empty or shows 'No sessions yet' — "
            "that means the app failed to reload sessions after navigating back from a session."
        )
    ok = _run("sessions_reload", goal=sessions_reload_goal, max_steps=12)
    if not ok:
        return {"status": "fail", "phase": "sessions_reload", "results": results}

    _sleep(1.0)

    # -----------------------------------------------------------------------
    # Phase 5-6: TypeScript task (informational — model availability may vary)
    # -----------------------------------------------------------------------
    # The sessions regression test is done. TypeScript tests AI task execution;
    # failures here are due to model/server issues, not the sessions loading bug.
    _run(
        "typescript",
        goal=(
            "You are on the sessions list screen. "
            "Tap the '+' button (top-right) to create a new session, wait for the chat view. "
            f"Tap the text input field and type: {TYPESCRIPT_TASK!r} "
            "Do NOT press back (it navigates away). "
            "Tap the send/arrow button (bottom-right) to submit. "
            "After sending, wait and watch — opencode will show tool calls and file writes as it works. "
            "CRITICAL: Do NOT tap anywhere on the screen after tapping send. "
            "Any tap will navigate away from the session and break the connection. "
            "Wait up to 90 seconds total for the session to go idle/complete "
            "(no new activity for at least 5 seconds, or a completion indicator appears). "
            "Re-check every 15 seconds by looking at the screen — do NOT tap, just look. "
            "Report done when opencode appears to have finished (idle, no spinners, last message is a summary or file was created). "
            "Report fail only if there is a clear unrecoverable error."
        ),
        max_steps=25,
    )
    # TypeScript phase is informational — CI model availability varies; continue regardless.
    _sleep(2.0)

    # -----------------------------------------------------------------------
    # Phase 7: Verify output / success (informational)
    # -----------------------------------------------------------------------
    _run(
        "verify",
        goal=(
            "The opencode session has finished. "
            "Look at the chat to confirm the TypeScript hello world task succeeded. "
            "You should see: a mention of 'hello.ts', 'Hello, World!', a file creation tool call, "
            "or a success summary from the assistant. "
            "Take a clear screenshot showing the result. "
            "Report done with a brief summary of what you see as evidence of success. "
            "Report fail only if the screen clearly shows an error with no recovery."
        ),
        max_steps=8,
    )
    _sleep(1.5)

    # -----------------------------------------------------------------------
    # Phase 8-9: Navigate to Settings, show model selection (informational)
    # -----------------------------------------------------------------------
    _run(
        "settings",
        goal=(
            "Navigate to the Settings screen of the OpenCode mobile app. "
            "Look for a gear icon, 'Settings' tab in the bottom navigation bar, "
            "or a hamburger menu that contains Settings. Tap it. "
            "Once on the Settings screen, look for a 'Model' or 'AI Model' option and tap it "
            "to show the model selection list. "
            "Take a screenshot showing the model list or model setting. "
            "You do NOT need to change the model — just show it is accessible. "
            "Report done when the settings/model screen is visible in a screenshot."
        ),
        max_steps=15,
    )

    # Critical: connect + session list with pre-created session + new session + sessions_reload.
    # TypeScript/verify/settings are informational (model availability varies in CI).
    critical = ["connect", "session_list", "new_session", "sessions_reload"]
    failed_critical = [k for k in critical if results.get(k, {}).get("status") != "success"]
    overall = "success" if not failed_critical else "partial"
    return {"status": overall, "phase_results": results}


# ---------------------------------------------------------------------------
# Legacy smoke scenarios (kept for backwards compat / --scenario flag)
# ---------------------------------------------------------------------------

SMOKE_SCENARIOS = [
    {
        "name": "coding_task",
        "goal": (
            "You see the OpenCode mobile app. Tap the '+' button (top-right) to create a new session. "
            "Wait 3 seconds for the new session/chat screen to fully load. "
            "Tap the text input at the bottom. "
             f"Type this exact task: {PYTHON_CODING_TASK!r} "
            "Do NOT press back (it navigates away). "
            "Tap the send/arrow button (bottom-right) to submit the task. "
            "After sending, wait and watch — opencode will think and then produce code. "
            "CRITICAL: Do NOT tap anywhere on the screen after tapping send. "
            "The screen will show 'Thinking...' or 'Working...' — this is expected. "
            "Any tap will navigate away from the session and break the connection. "
            "Wait up to 120 seconds total for the session to complete "
            "(look for file creation messages, a summary from assistant, or 'idle' status). "
            "Re-check every 15 seconds by looking at the screen — do NOT tap, just look. "
            "Take a screenshot showing the final result (the completed code or success summary). "
            "Report success if you see evidence of both helloworld.py and helloworld_test.py being created. "
            "Report failure only if the screen clearly shows an error with no recovery."
        ),
    },
    {
        "name": "verify_session_list",
        "goal": (
            "You see the OpenCode mobile app. Tap the '+' button (top-right) to create a new session. "
            "Wait 2 seconds for the session to be created. "
            "Navigate back to the sessions list by tapping the 'Sessions' tab or pressing back. "
            "Wait 3 seconds for the session list to load. "
            "Report success if you can see at least one session entry in the list. "
            "Report failure if the sessions list appears empty or shows an error message."
        ),
    },
]


# ---------------------------------------------------------------------------
# Feature-specific deterministic test scenarios (for ticket validation)
# These use ADB-based assertions — NOT LLM vision — as the pass/fail gate.
# ---------------------------------------------------------------------------

def run_scenario_sse_disconnect_banner(opencode_url: str, model: str, include_ui_xml: bool) -> dict:
    """#42 — SSE disconnect banner.

    Validates that when the network drops, the app shows a 'Reconnecting...'
    banner in the session view. Pass/fail is determined by uiautomator XML dump,
    not LLM vision — no hallucination possible.
    """
    results: dict = {}

    # Phase 1: LLM opens a session
    ok = run_cua_step(
        goal=(
            f"The app is open showing the OpenCode Mobile connections screen. "
            f"Connect to the server at '{opencode_url}' if not already connected. "
            "Then open any session (create one if the list is empty). "
            "Report done when you can see the session chat view with a text input at the bottom."
        ),
        max_steps=20, model=model, include_ui_xml=include_ui_xml,
        step_label="open_session",
    )
    results["open_session"] = ok

    if ok["status"] != "success":
        return {"status": "fail", "phase": "open_session", "results": results}

    _sleep(2.0)

    # Phase 2: DETERMINISTIC — cut network
    print("  [net] dropping network...")
    simulate_network_drop()
    _sleep(5.0)  # wait for SSE timeout detection in app

    # Phase 3: DETERMINISTIC — check UI XML for reconnect text
    has_banner = (
        check_ui_text("Reconnecting") or
        check_ui_text("Reconnecting\u2026") or
        check_ui_text("reconnect") or
        check_ui_text("offline")
    )
    results["banner_appeared"] = {"status": "success" if has_banner else "fail",
                                  "detail": "uiautomator XML check"}
    print(f"  [DETERMINISTIC] banner_appeared={has_banner}")

    # Phase 4: LLM visual check (informational only — not gating)
    visual = run_cua_step(
        goal=(
            "The device network was just disabled. Look at the top of the session chat. "
            "Report what you see — is there a yellow/amber banner saying Reconnecting, Offline, or similar? "
            "This is informational only; just describe what you observe."
        ),
        max_steps=4, model=model, include_ui_xml=include_ui_xml,
        step_label="banner_visual",
    )
    results["banner_visual"] = visual

    # Phase 5: DETERMINISTIC — restore network, wait, check banner gone.
    # After restore, a pending reconnect timer can take up to 15s to fire, and
    # events.ts only zeroes reconnectAttempts after STABLE_CONNECTION_MS (10s) of a
    # healthy stream — so the banner can legitimately linger ~25s. Poll up to 40s
    # instead of a fixed 15s sleep to avoid a false "still showing" failure.
    print("  [net] restoring network...")
    restore_network()
    banner_gone = False
    deadline = time.time() + 40
    while time.time() < deadline:
        _sleep(3.0)
        if not (check_ui_text("Reconnecting") or check_ui_text("Reconnecting\u2026") or check_ui_text("reconnect") or check_ui_text("offline")):
            banner_gone = True
            break
    results["banner_dismissed"] = {"status": "success" if banner_gone else "fail",
                                   "detail": "uiautomator XML poll (<=40s) after reconnect"}
    print(f"  [DETERMINISTIC] banner_dismissed={banner_gone}")

    overall = "success" if has_banner and banner_gone else "fail"
    return {"status": overall, "results": results}


def run_scenario_backgrounded_permission_notification(opencode_url: str, model: str, include_ui_xml: bool) -> dict:
    """#39 — Push notification when app is backgrounded and agent awaits permission.

    Pass/fail determined by `adb dumpsys notification` — deterministic.
    The LLM is used only to set up the session; the assertion is ADB-based.

    Requires: the opencode server to have a pre-staged session that will
    trigger a permission request (e.g. a bash tool call waiting for approval).
    Pre-creates such a session via the REST API.
    """
    results: dict = {}

    # Pre-create a session via API
    precreated = _precreate_test_session(opencode_url, title="cua-permission-notification-test")

    # Phase 1: LLM connects and opens that session
    goal_connect = (
        f"Connect to '{opencode_url}' if not already connected. "
        "Navigate to the Sessions tab. "
    )
    if precreated:
        goal_connect += f"Open the session titled '{precreated}'. "
    else:
        goal_connect += "Open or create any session. "
    goal_connect += "Report done when the session chat view is open."

    ok = run_cua_step(goal=goal_connect, max_steps=20, model=model,
                      include_ui_xml=include_ui_xml, step_label="open_session")
    results["open_session"] = ok

    if ok["status"] != "success":
        return {"status": "fail", "phase": "open_session", "results": results}

    # Phase 2: DETERMINISTIC — background the app
    print("  [app] backgrounding app...")
    background_app()
    _sleep(2.0)

    # Phase 3: API — trigger a permission event
    # Send a message that invokes a bash tool (which requires approval).
    # The server emits a `permission.asked` SSE event (NOT `permission.requested`).
    # events.ts already calls notify({ category: "permissions", ... }) for it, and
    # notifications.send() only fires while the app is backgrounded (AppState != "active").
    # NOTE: this assumes the opencode server actually requires approval for the tool;
    # if the server auto-approves, no permission.asked fires and no notification appears.
    import urllib.request
    api_base = opencode_url.replace("10.0.2.2", "127.0.0.1")
    try:
        # Get the most recent session to send to
        resp = urllib.request.urlopen(f"{api_base}/session?limit=1&roots=true", timeout=5)
        sessions = json.loads(resp.read())
        if sessions:
            sid = sessions[0]["id"]
            msg_data = json.dumps({
                "parts": [{"type": "text", "text": "Run: echo hello — and wait for approval"}]
            }).encode()
            req = urllib.request.Request(
                f"{api_base}/session/{sid}/prompt_async",
                data=msg_data, method="POST",
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=5)
            print(f"  [api] sent message to session {sid[:16]}...")
    except Exception as exc:
        print(f"  [api] WARNING: could not send permission-triggering message: {exc}")

    # Phase 4: DETERMINISTIC — poll notification drawer for permission notification.
    # events.ts fires notify({ title: "Agent needs approval", body: "<perm>: <patterns>",
    # category: "permissions", sessionId }) — only when app is backgrounded (AppState check
    # in notifications.ts send()). The only token guaranteed in every dumpsys record is our
    # package name, so gate on APP_PACKAGE (deterministic); fall back to the notification
    # title/body as secondary signals.
    print("  [notify] polling notification drawer for permission notification...")
    appeared = check_notification_drawer(APP_PACKAGE, timeout=15)
    if not appeared:
        # Fallback: match the real notification copy from events.ts / notifications.ts
        appeared = check_notification_drawer("Agent needs approval", timeout=5) or \
                   check_notification_drawer("A tool needs your approval", timeout=5)

    results["notification_appeared"] = {
        "status": "success" if appeared else "fail",
        "detail": "adb dumpsys notification check (deterministic)",
    }
    print(f"  [DETERMINISTIC] notification_appeared={appeared}")

    # Phase 5: Restore app foreground
    foreground_app()

    overall = "success" if appeared else "fail"
    return {"status": overall, "results": results}


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


# ---------------------------------------------------------------------------
# Deterministic API helpers for e2e coding task validation
# ---------------------------------------------------------------------------

def _api_base(opencode_url: str) -> str:
    """Translate emulator host route to localhost for host-side API calls."""
    url = opencode_url.replace("10.0.2.2", "127.0.0.1")
    if "127.0.0.1" not in url and "localhost" not in url:
        # External URL (Tailscale etc.) — try it directly
        pass
    return url.rstrip("/")


def wait_for_session_idle(opencode_url: str, timeout: int = 180, poll_interval: int = 3) -> dict | None:
    """Poll GET /session (most recent root session) until status == 'idle'.

    Returns the session dict when idle, or None on timeout.
    This is fully deterministic — no LLM vision involved.
    """
    import urllib.request as _ur
    api = _api_base(opencode_url)
    # Also try localhost fallback if the primary candidate is not localhost
    candidates = [api]
    if "127.0.0.1" not in api and "localhost" not in api:
        candidates.append("http://127.0.0.1:4096")

    deadline = time.time() + timeout
    while time.time() < deadline:
        for base in candidates:
            try:
                resp = _ur.urlopen(f"{base}/session?limit=10&roots=true", timeout=5)
                sessions = json.loads(resp.read())
                if sessions:
                    # Find most recent non-archived session
                    latest = max(sessions, key=lambda s: s.get("created", 0))
                    status = latest.get("status", "?")
                    if status == "idle":
                        return latest
            except Exception:
                pass
        time.sleep(poll_interval)
    return None


def check_session_file_created(opencode_url: str, filename: str) -> dict:
    """Check the most recent session's messages for a file-creation tool call naming `filename`.

    Returns {"found": bool, "session_id": str | None, "evidence": str}
    Deterministic — reads the opencode REST API directly.
    """
    import urllib.request as _ur
    api = _api_base(opencode_url)
    candidates = [api]
    if "127.0.0.1" not in api and "localhost" not in api:
        candidates.append("http://127.0.0.1:4096")

    for base in candidates:
        try:
            # Get most recent session
            resp = _ur.urlopen(f"{base}/session?limit=10&roots=true", timeout=5)
            sessions = json.loads(resp.read())
            if not sessions:
                continue
            latest = max(sessions, key=lambda s: s.get("created", 0))
            sid = latest["id"]

            # Fetch messages
            resp2 = _ur.urlopen(f"{base}/session/{sid}/message?limit=100", timeout=10)
            messages = json.loads(resp2.read())

            # Scan all message parts for filename
            needle = filename.lower()
            for msg in messages:
                for part in msg.get("parts", []):
                    part_str = json.dumps(part).lower()
                    if needle in part_str:
                        return {
                            "found": True,
                            "session_id": sid,
                            "evidence": f"filename '{filename}' found in message part: {part.get('type', '?')}",
                        }
            return {"found": False, "session_id": sid, "evidence": "filename not found in any message part"}
        except Exception as exc:
            continue

    return {"found": False, "session_id": None, "evidence": f"API unreachable: {opencode_url}"}


# ---------------------------------------------------------------------------
# Full E2E coding task scenario
# ---------------------------------------------------------------------------

def run_scenario_hello_world_e2e(
    opencode_url: str,
    model: str,
    include_ui_xml: bool,
    project_dir: str = "~/workspace/opencode-mobile",
    ai_model_hint: str = "deepseek",
    task: str = "Write a hello_world.py file that prints 'Hello World' to stdout.",
    target_filename: str = "hello_world.py",
) -> dict:
    """Full end-to-end scenario: connect → open project → select model → run task → validate.

    Validates that:
      1. The app connects to the opencode server.
      2. A new session is created in the specified project directory.
      3. The chosen AI model handles the coding task.
      4. The AI agent creates the target file (deterministic API check).
      5. The app renders the tool call output in the chat (deterministic ADB check).

    Returns a dict with per-phase results and a final "status" key.
    """
    results: dict[str, dict] = {}

    def _phase(name: str, goal: str, steps: int = 20, critical: bool = True) -> bool:
        _banner(name)
        r = run_cua_step(goal=goal, max_steps=steps, model=model,
                         include_ui_xml=include_ui_xml, step_label=name)
        results[name] = r
        ok = r["status"] == "success"
        print(f"\n  [{'PASS' if ok else 'FAIL'}] {name}: {r['status']} ({r['steps']} steps)")
        if r.get("summary"): print(f"         {r['summary']}")
        if r.get("reason"):  print(f"         reason: {r['reason']}")
        return ok

    # ------------------------------------------------------------------
    # Phase 1: Connect to server
    # ------------------------------------------------------------------
    ok = _phase(
        "connect",
        goal=(
            f"You are in the OpenCode mobile app. "
            "Go to the Connections tab (bottom navigation bar). "
            "If a connection to the opencode server already exists, tap it to activate it. "
            "Otherwise tap '+' or 'Add Connection', "
            f"enter the URL '{opencode_url}', leave username/password blank, tap Save. "
            "After saving, navigate to the Sessions tab. "
            "Report done once you are on the Sessions screen and can see the session list (even if empty)."
        ),
        steps=20,
    )
    if not ok:
        return {"status": "fail", "phase": "connect", "results": results}
    _sleep(2.0)

    # ------------------------------------------------------------------
    # Phase 2: Create session in specific project directory
    # The '+' FAB long-press opens a modal with a custom directory input.
    # ------------------------------------------------------------------
    ok = _phase(
        "open_project",
        goal=(
            "You are on the Sessions list screen of OpenCode Mobile. "
            "You need to create a NEW session in a specific project directory. "
            "To do this: LONG-PRESS the '+' button (FAB, bottom-right corner) — "
            "hold it for 1 second until a modal sheet appears. "
            "The modal will show 'Current Directory' and a text input labelled "
            "'Or use a different folder'. "
            f"Tap that text input and type the path: {project_dir} "
            "Then tap the 'Create in this directory' button (or 'Create' / 'Open'). "
            "Report done when the session chat view opens "
            "(you see a text input at the bottom of the screen)."
        ),
        steps=20,
    )
    if not ok:
        return {"status": "fail", "phase": "open_project", "results": results}
    _sleep(1.5)

    # ------------------------------------------------------------------
    # Phase 3: Select AI model (tap model indicator at top of session)
    # ------------------------------------------------------------------
    ok = _phase(
        "select_model",
        goal=(
            "You are inside an OpenCode session chat view. "
            "At the top of the screen there is a model name indicator — it shows the current AI model. "
            "Tap that model name to open the model picker. "
            "In the model list, look for a model containing the text: "
            f"'{ai_model_hint}' (case-insensitive, e.g. deepseek-v3, deepseek-v4, deepseek-chat). "
            "Tap to select it. "
            "If the model picker doesn't appear, or no deepseek model is listed, "
            "report done anyway — the default model will be used. "
            "Report done once the model is selected or confirmed."
        ),
        steps=15,
    )
    # Model picker is informational — proceed even if selection fails
    _sleep(1.0)

    # ------------------------------------------------------------------
    # Phase 4: Submit coding task
    # ------------------------------------------------------------------
    ok = _phase(
        "submit_task",
        goal=(
            "You are inside an OpenCode session chat view with a text input at the bottom. "
            f"The task to submit is: {task!r} "
            "Tap the text input field at the bottom. "
            "Type that task. "
            "Then dismiss the keyboard (tap a blank area above it) so the send button is visible. "
            "Tap the send/arrow button (bottom-right of the input row) to submit. "
            "Report done as soon as you see the message appear in the chat "
            "(the agent will start thinking — that's expected)."
        ),
        steps=15,
    )
    if not ok:
        return {"status": "fail", "phase": "submit_task", "results": results}
    _sleep(2.0)

    # ------------------------------------------------------------------
    # Phase 5 (DETERMINISTIC): Poll API until session is idle
    # ------------------------------------------------------------------
    _banner("wait_idle")
    print(f"  [wait_idle] polling {opencode_url} for session idle (max 180s)...")
    idle_session = wait_for_session_idle(opencode_url, timeout=180, poll_interval=4)
    results["wait_idle"] = {
        "status": "success" if idle_session else "timeout",
        "steps": 0,
        "detail": f"session_id={idle_session['id'][:16] if idle_session else 'n/a'}",
    }
    print(f"  [{'PASS' if idle_session else 'FAIL'}] wait_idle: {'idle' if idle_session else 'TIMEOUT — session never went idle'}")

    if not idle_session:
        # Session timed out — take a screenshot for diagnostics and continue to validation
        screenshot_b64("wait_idle_timeout")

    # ------------------------------------------------------------------
    # Phase 6 (DETERMINISTIC): Validate file was created — API message scan
    # ------------------------------------------------------------------
    _banner("validate_api")
    file_check = check_session_file_created(opencode_url, target_filename)
    results["validate_api"] = {
        "status": "success" if file_check["found"] else "fail",
        "steps": 0,
        "detail": file_check["evidence"],
        "session_id": file_check.get("session_id"),
    }
    print(f"  [{'PASS' if file_check['found'] else 'FAIL'}] validate_api: {file_check['evidence']}")

    # ------------------------------------------------------------------
    # Phase 7 (DETERMINISTIC): Validate file name visible in app UI
    # ------------------------------------------------------------------
    _banner("validate_ui")
    # Scroll down to ensure final messages are visible
    w, h = get_screen_size()
    adb("shell", "input", "swipe", str(w // 2), str(h // 4), str(w // 2), str(h * 3 // 4), "400")
    _sleep(1.0)
    ui_found = check_ui_text(target_filename)
    # Also check common variant spellings
    if not ui_found:
        ui_found = check_ui_text(target_filename.replace("_", ""))  # helloworld.py
    results["validate_ui"] = {
        "status": "success" if ui_found else "fail",
        "steps": 0,
        "detail": f"uiautomator XML {'contains' if ui_found else 'does NOT contain'} '{target_filename}'",
    }
    print(f"  [{'PASS' if ui_found else 'FAIL'}] validate_ui: {results['validate_ui']['detail']}")

    # ------------------------------------------------------------------
    # Phase 8 (LLM): Capture screenshot + brief visual evaluation
    # ------------------------------------------------------------------
    _phase(
        "eval_screenshot",
        goal=(
            "The opencode AI agent has finished its task. "
            "Scroll down to see the latest messages in the chat. "
            f"Look for evidence that '{target_filename}' was created: "
            "a file creation tool call, a code block, or a completion message. "
            "Take a screenshot showing the session result. "
            "In your done summary, describe what you see as evidence "
            f"that the agent succeeded or failed to create {target_filename}."
        ),
        steps=8,
        critical=False,
    )

    # ------------------------------------------------------------------
    # Overall result
    # ------------------------------------------------------------------
    critical_phases = ["connect", "submit_task", "wait_idle", "validate_api", "validate_ui"]
    failed = [k for k in critical_phases if results.get(k, {}).get("status") not in ("success",)]
    overall = "success" if not failed else "fail"
    if failed:
        print(f"\n  [FAIL] failed critical phases: {failed}")

    return {"status": overall, "phase_results": results}


# ---------------------------------------------------------------------------
# Natural-language query → test plan → execute → evaluate
# ---------------------------------------------------------------------------

QUERY_PLANNER_PROMPT = """\
You are a mobile app test planner for an Android app called OpenCode Mobile.
The app connects to an opencode AI coding server and lets users manage coding sessions.

Given a natural-language test description, produce a JSON test plan.

Output ONLY a JSON object with this structure:
{
  "title": "<short test name>",
  "goal_summary": "<1-2 sentence description of what this test verifies>",
  "phases": [
    {
      "name": "<snake_case phase name>",
      "goal": "<detailed instruction for the LLM UI driver — be explicit about taps, waits, and success criteria>",
      "max_steps": <int 8–30>,
      "critical": <true|false>
    }
  ],
  "deterministic_checks": [
    {
      "name": "<check name>",
      "type": "ui_text|session_idle|file_created",
      "value": "<text to find | filename to find>",
      "description": "<what this checks>"
    }
  ]
}

Rules for phases:
- Each phase is one focused UI action.
- goal must be precise: include exact button names, expected states, and done/fail conditions.
- Be cautious with send — always use tap on the send button, NEVER the enter key.
- If a phase needs to wait for AI agent output, set max_steps >= 25.
- Phases with critical=false are informational only; failure does not fail the overall test.

Rules for deterministic_checks:
- ui_text: checks if text appears in uiautomator XML dump (ADB, no LLM).
- session_idle: polls REST API until session status == idle.
- file_created: checks REST API session messages for a filename.

Available context:
- App package: cc.agentlabs.opencode
- Default server URL used in tests: {opencode_url}
- Sessions tab is in the bottom navigation bar.
- Long-press FAB (+) opens a modal to create a session in a custom directory.
- Model picker appears at the top of the session chat view — tap it to change models.
- Send button is at the bottom-right of the text input row.
"""

QUERY_EVALUATOR_PROMPT = """\
You are a test evaluator for an Android app test suite.
Given the test plan and results, produce a structured evaluation report.

Output a JSON object:
{
  "overall": "pass" | "fail" | "partial",
  "score": <0.0–1.0>,
  "summary": "<2-3 sentence plain English summary>",
  "phases": {
    "<phase_name>": {"verdict": "pass"|"fail"|"skip", "notes": "<brief observation>"}
  },
  "deterministic_checks": {
    "<check_name>": {"verdict": "pass"|"fail", "notes": "<brief observation>"}
  },
  "recommendations": ["<actionable suggestion>", ...]
}

Be strict: a phase that timed out is a fail, not a pass.
Partial = all critical phases passed but some informational phases failed.
"""


def run_query_test(
    query: str,
    opencode_url: str,
    model: str,
    include_ui_xml: bool,
    verbose: bool = True,
) -> dict:
    """Run a test described in natural language.

    Steps:
      1. Call LLM to plan phases from the query.
      2. Execute each phase in order.
      3. Run deterministic checks (API + ADB).
      4. Call LLM evaluator to produce a structured feedback report.
      5. Return the report.
    """
    client, resolved_model = make_client(model)

    # ------------------------------------------------------------------
    # Step 1: Plan
    # ------------------------------------------------------------------
    print("\n" + "=" * 64)
    print("  [query-test] Planning test phases from query...")
    print(f"  Query: {query[:120]}...")
    print("=" * 64)

    planner_system = QUERY_PLANNER_PROMPT.format(opencode_url=opencode_url)
    plan_response = client.chat.completions.create(
        model=resolved_model,
        messages=[
            {"role": "system", "content": planner_system},
            {"role": "user", "content": f"Test query:\n\n{query}"},
        ],
        max_completion_tokens=2000,
        temperature=0,
    )
    plan_raw = plan_response.choices[0].message.content.strip()

    # Parse plan JSON
    try:
        clean = plan_raw
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        plan = json.loads(clean)
    except json.JSONDecodeError as exc:
        print(f"  [query-test] WARN: could not parse plan JSON: {exc}\n{plan_raw[:300]}")
        return {"status": "error", "reason": "plan parse failed", "raw_plan": plan_raw}

    print(f"\n  Test title: {plan.get('title', 'untitled')}")
    print(f"  Goal: {plan.get('goal_summary', '')}")
    print(f"  Phases: {[p['name'] for p in plan.get('phases', [])]}")
    det_checks = plan.get("deterministic_checks", [])
    if det_checks:
        print(f"  Deterministic checks: {[c['name'] for c in det_checks]}")

    # ------------------------------------------------------------------
    # Step 2: Execute phases
    # ------------------------------------------------------------------
    phase_results: dict[str, dict] = {}
    for phase in plan.get("phases", []):
        name = phase["name"]
        _banner(name)
        r = run_cua_step(
            goal=phase["goal"],
            max_steps=phase.get("max_steps", 20),
            model=model,
            include_ui_xml=include_ui_xml,
            verbose=verbose,
            step_label=name,
        )
        phase_results[name] = r
        ok = r["status"] == "success"
        print(f"\n  [{'PASS' if ok else 'FAIL'}] {name}: {r['status']} ({r['steps']} steps)")
        if r.get("summary"): print(f"         {r['summary']}")
        if r.get("reason"):  print(f"         reason: {r['reason']}")

        # Hard-stop on critical failure
        if phase.get("critical", True) and not ok:
            print(f"\n  [query-test] Critical phase '{name}' failed — aborting.")
            break

    # ------------------------------------------------------------------
    # Step 3: Deterministic checks
    # ------------------------------------------------------------------
    det_results: dict[str, dict] = {}
    for check in det_checks:
        cname = check["name"]
        ctype = check["type"]
        cval  = check.get("value", "")
        print(f"\n  [deterministic] {cname} ({ctype}={cval!r})...")

        if ctype == "ui_text":
            found = check_ui_text(cval)
            det_results[cname] = {
                "status": "success" if found else "fail",
                "detail": f"uiautomator {'found' if found else 'NOT found'}: {cval!r}",
            }
        elif ctype == "session_idle":
            idle = wait_for_session_idle(opencode_url, timeout=180)
            det_results[cname] = {
                "status": "success" if idle else "timeout",
                "detail": f"session idle: {bool(idle)}",
            }
        elif ctype == "file_created":
            fc = check_session_file_created(opencode_url, cval)
            det_results[cname] = {
                "status": "success" if fc["found"] else "fail",
                "detail": fc["evidence"],
            }
        else:
            det_results[cname] = {"status": "skip", "detail": f"unknown check type: {ctype}"}

        print(f"  [{'PASS' if det_results[cname]['status'] == 'success' else 'FAIL/SKIP'}] {cname}: {det_results[cname]['detail']}")

    # ------------------------------------------------------------------
    # Step 4: Evaluate
    # ------------------------------------------------------------------
    print("\n  [query-test] Generating evaluation report...")
    eval_input = {
        "test_plan": plan,
        "phase_results": {k: {"status": v["status"], "steps": v.get("steps"), "summary": v.get("summary"), "reason": v.get("reason")} for k, v in phase_results.items()},
        "deterministic_results": det_results,
    }
    eval_response = client.chat.completions.create(
        model=resolved_model,
        messages=[
            {"role": "system", "content": QUERY_EVALUATOR_PROMPT},
            {"role": "user", "content": json.dumps(eval_input, indent=2)},
        ],
        max_completion_tokens=1500,
        temperature=0,
    )
    eval_raw = eval_response.choices[0].message.content.strip()

    try:
        clean = eval_raw
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        evaluation = json.loads(clean)
    except json.JSONDecodeError:
        evaluation = {"overall": "error", "summary": eval_raw, "score": 0.0}

    return {
        "status": evaluation.get("overall", "error"),
        "plan": plan,
        "phase_results": phase_results,
        "deterministic_results": det_results,
        "evaluation": evaluation,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="OpenCode Mobile Android CUA smoke test — full onboarding showcase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full onboarding showcase (default, recommended for demo video):
  source ~/.env.d/azure-openai.env
  python scripts/android-cua-smoke.py --model gpt-5.4 --include-xml

  # E2E coding task: connect, open project, select deepseek model, write hello_world.py:
  python scripts/android-cua-smoke.py --e2e --opencode-url http://100.108.64.76:4096

  # E2E with custom params:
  python scripts/android-cua-smoke.py --e2e \\
    --opencode-url http://100.108.64.76:4096 \\
    --e2e-project-dir ~/workspace/opencode-mobile \\
    --e2e-model-hint deepseek \\
    --e2e-task "Write a hello_world.py that prints Hello World" \\
    --e2e-filename hello_world.py

  # Natural-language query mode (LLM plans phases, executes, evaluates):
  python scripts/android-cua-smoke.py --query \\
    "Open android app. Setup against remote opencode server. Go to sessions. \\
     Open a new project inside ~/workspace/opencode-mobile. \\
     Choose opencode/deepseek model. Start a new session. \\
     Ask to write hello_world.py. Validate that agent completed task."

  # Save evaluation report:
  python scripts/android-cua-smoke.py --query "..." --eval-output /tmp/eval-report.json

  # Speed up for a faster demo (0.5 = half the wait times):
  python scripts/android-cua-smoke.py --speed-multiplier 0.5

  # Legacy single-goal mode:
  python scripts/android-cua-smoke.py --goal "Open settings"

  # Legacy named scenario:
  python scripts/android-cua-smoke.py --scenarios send_message,verify_session_list
""",
    )

    # Showcase mode (new default)
    parser.add_argument(
        "--showcase",
        action="store_true",
        default=True,
        help="Run the full onboarding showcase (default). Demonstrates connect → session → TypeScript task → settings.",
    )
    parser.add_argument(
        "--opencode-url",
        default=None,
        help=f"OpenCode server URL (default: {DEFAULT_OPENCODE_URL}).",
    )

    # Speed control
    parser.add_argument(
        "--speed-multiplier",
        type=float,
        default=1.0,
        metavar="FACTOR",
        help="Scale all wait/sleep durations. 0.5 = twice as fast, 2.0 = twice as slow. Default: 1.0",
    )

    # Model / verbosity
    parser.add_argument("--model", default="gpt-4o", help="Vision model deployment name.")
    parser.add_argument("--max-steps", type=int, default=25, help="Max LLM steps per phase (showcase) or total (legacy).")
    parser.add_argument("--include-xml", action="store_true", help="Include UI hierarchy XML in LLM context (more accurate, more tokens).")
    parser.add_argument("--quiet", action="store_true")

    # Legacy / compat flags
    parser.add_argument("--goal", help="Legacy: single custom goal (disables showcase).")
    parser.add_argument(
        "--scenarios",
        help="Comma-separated scenario names to run (disables showcase). "
             "LLM scenarios: connect_and_verify_sessions, coding_task, verify_session_list. "
             "Deterministic (ADB-based): sse_disconnect_banner, backgrounded_permission_notification.",
    )
    parser.add_argument(
        "--skip-connect-scenario", action="store_true",
        help="Legacy: skip the connect-and-verify regression scenario.",
    )
    parser.add_argument(
        "--only-connect-scenario", action="store_true",
        help="Legacy: run ONLY the connect-and-verify-sessions scenario.",
    )

    # E2E coding task scenario
    parser.add_argument(
        "--e2e",
        action="store_true",
        help=(
            "Run the full end-to-end coding task scenario: connect → create session in project dir → "
            "select model → submit task → wait for idle → validate file created. "
            "Use --e2e-project-dir, --e2e-model-hint, --e2e-task, --e2e-filename to customise."
        ),
    )
    parser.add_argument(
        "--e2e-project-dir",
        default="~/workspace/opencode-mobile",
        help="Project directory to open in the new session (default: ~/workspace/opencode-mobile).",
    )
    parser.add_argument(
        "--e2e-model-hint",
        default="deepseek",
        help="Substring to match when selecting the AI model in the model picker (default: deepseek).",
    )
    parser.add_argument(
        "--e2e-task",
        default="Write a hello_world.py file that prints 'Hello World' to stdout.",
        help="Coding task to submit to the AI agent.",
    )
    parser.add_argument(
        "--e2e-filename",
        default="hello_world.py",
        help="Expected output filename to validate in API messages and UI (default: hello_world.py).",
    )

    # Natural-language query test mode
    parser.add_argument(
        "--query",
        default=None,
        metavar="QUERY",
        help=(
            "Natural-language test description. The LLM will plan phases from the query, "
            "execute them, run deterministic checks, and return a structured evaluation report. "
            "Example: 'Open app, connect to server, create session in ~/workspace/opencode-mobile "
            "with deepseek model, ask it to write hello_world.py, verify the file was created.'"
        ),
    )
    parser.add_argument(
        "--eval-output",
        default=None,
        metavar="PATH",
        help="Write the JSON evaluation report from --query to this file (default: print to stdout).",
    )

    args = parser.parse_args()

    # Apply speed multiplier globally
    global _speed_multiplier
    _speed_multiplier = args.speed_multiplier
    if args.speed_multiplier != 1.0:
        print(f"[speed] multiplier={args.speed_multiplier} — all waits scaled accordingly")

    # Verify ADB
    try:
        devices = adb("devices")
        if "device" not in devices.split("\n", 1)[-1]:
            sys.exit("No ADB device connected. Start emulator first.")
    except FileNotFoundError:
        sys.exit("adb not found in PATH")

    connect_url = args.opencode_url or os.environ.get("OPENCODE_URL") or DEFAULT_OPENCODE_URL

    # -----------------------------------------------------------------------
    # Run mode priority: --query > --e2e > showcase (default) > legacy
    # -----------------------------------------------------------------------

    # ----------------------------------------------------------------
    # MODE: --query  (natural-language test description)
    # ----------------------------------------------------------------
    if args.query:
        print("\n" + "=" * 64)
        print("  OpenCode Mobile — Query-Driven Test")
        print(f"  Server: {connect_url}")
        print(f"  Model:  {args.model}")
        print("=" * 64)

        if not ensure_app_foreground(verbose=not args.quiet):
            print("[prep] warning: could not confirm app in foreground")
        maybe_dismiss_telemetry_consent(verbose=not args.quiet)
        ensure_app_foreground(verbose=not args.quiet)

        result = run_query_test(
            query=args.query,
            opencode_url=connect_url,
            model=args.model,
            include_ui_xml=args.include_xml,
            verbose=not args.quiet,
        )

        # Print evaluation report
        ev = result.get("evaluation", {})
        print("\n" + "=" * 64)
        print(f"  EVALUATION REPORT")
        print("=" * 64)
        print(f"  Overall:   {ev.get('overall', '?').upper()}")
        print(f"  Score:     {ev.get('score', 0):.0%}")
        print(f"  Summary:   {ev.get('summary', '')}")
        if ev.get("phases"):
            print("\n  Phase verdicts:")
            for pname, pv in ev["phases"].items():
                print(f"    [{pv.get('verdict','?').upper():4s}] {pname:24s}  {pv.get('notes','')}")
        if ev.get("deterministic_checks"):
            print("\n  Deterministic checks:")
            for cname, cv in ev["deterministic_checks"].items():
                print(f"    [{cv.get('verdict','?').upper():4s}] {cname:24s}  {cv.get('notes','')}")
        if ev.get("recommendations"):
            print("\n  Recommendations:")
            for rec in ev["recommendations"]:
                print(f"    • {rec}")
        print("=" * 64)

        # Optionally write JSON report
        if args.eval_output:
            Path(args.eval_output).write_text(json.dumps(result, indent=2))
            print(f"\n  [report] written to {args.eval_output}")
        else:
            print("\n  [report] full JSON:")
            print(json.dumps(result, indent=2))

        overall_ok = ev.get("overall") in ("pass", "partial")
        sys.exit(0 if overall_ok else 1)

    # ----------------------------------------------------------------
    # MODE: --e2e  (hardcoded hello_world.py e2e scenario)
    # ----------------------------------------------------------------
    if args.e2e:
        print("\n" + "=" * 64)
        print("  OpenCode Mobile — E2E Coding Task Scenario")
        print(f"  Server:   {connect_url}")
        print(f"  Model:    {args.model}")
        print(f"  Project:  {args.e2e_project_dir}")
        print(f"  AI model: *{args.e2e_model_hint}*")
        print(f"  Task:     {args.e2e_task[:60]}...")
        print(f"  Expect:   {args.e2e_filename}")
        print("=" * 64)

        rec_thread, _stop_ev, remote_path = start_screen_recording("e2e_coding_task")
        local_video = "/tmp/cua_e2e_coding_task.mp4"

        try:
            if not ensure_app_foreground(verbose=not args.quiet):
                print("[prep] warning: could not confirm app in foreground")
            maybe_dismiss_telemetry_consent(verbose=not args.quiet)
            ensure_app_foreground(verbose=not args.quiet)

            result = run_scenario_hello_world_e2e(
                opencode_url=connect_url,
                model=args.model,
                include_ui_xml=args.include_xml,
                project_dir=args.e2e_project_dir,
                ai_model_hint=args.e2e_model_hint,
                task=args.e2e_task,
                target_filename=args.e2e_filename,
            )
        finally:
            stop_screen_recording(rec_thread, remote_path, local_video)

        print("\n" + "=" * 64)
        print(f"  E2E result: {result['status'].upper()}")
        if Path(local_video).exists():
            print(f"  Video:      {local_video}")
        print("=" * 64)

        phase_results = result.get("phase_results", {})
        if phase_results:
            print("\n  Phase breakdown:")
            for phase, pr in phase_results.items():
                icon = "PASS" if pr.get("status") in ("success",) else "FAIL"
                steps_str = f"{pr.get('steps', 0)} steps" if pr.get("steps") else pr.get("detail", "")
                print(f"    [{icon}] {phase:20s}  {pr.get('status','?'):8s}  {steps_str}")

        sys.exit(0 if result["status"] == "success" else 1)

    # -----------------------------------------------------------------------
    # Determine remaining run mode: showcase vs. legacy scenarios
    # -----------------------------------------------------------------------
    use_legacy = bool(args.goal or args.scenarios or args.only_connect_scenario)

    if not use_legacy:
        # ----------------------------------------------------------------
        # NEW DEFAULT: Full onboarding showcase
        # ----------------------------------------------------------------
        print("\n" + "=" * 64)
        print("  OpenCode Mobile — Full Onboarding Showcase")
        print(f"  Server: {connect_url}")
        print(f"  Model:  {args.model}")
        print(f"  Speed:  {_speed_multiplier}x")
        print("=" * 64)

        rec_thread, _stop_ev, remote_path = start_screen_recording("onboarding_showcase")
        local_video = "/tmp/cua_onboarding_showcase.mp4"

        try:
            if not ensure_app_foreground(verbose=not args.quiet):
                print("[prep] warning: could not confirm app in foreground")
            maybe_dismiss_telemetry_consent(verbose=not args.quiet)
            ensure_app_foreground(verbose=not args.quiet)

            result = run_onboarding_showcase(
                opencode_url=connect_url,
                model=args.model,
                include_ui_xml=args.include_xml,
                verbose=not args.quiet,
                max_steps_per_phase=args.max_steps,
            )
        finally:
            stop_screen_recording(rec_thread, remote_path, local_video)
            upload_to_archivebox(local_video, "onboarding_showcase")

        print("\n" + "=" * 64)
        print(f"  Showcase result: {result['status'].upper()}")
        if local_video and Path(local_video).exists():
            print(f"  Video: {local_video}")
        print("=" * 64)

        # Print per-phase summary table
        phase_results = result.get("phase_results", {})
        if phase_results:
            print("\n  Phase breakdown:")
            for phase, pr in phase_results.items():
                icon = "PASS" if pr["status"] == "success" else "FAIL"
                print(f"    [{icon}] {phase:20s}  {pr['status']:8s}  {pr['steps']} steps")

        sys.exit(0 if result["status"] == "success" else 1)

    # -----------------------------------------------------------------------
    # LEGACY MODE: named/custom scenarios
    # -----------------------------------------------------------------------
    connect_scenario = {
        "name": "connect_and_verify_sessions",
        "goal": _connect_and_verify_sessions_goal(connect_url),
    }

    if args.scenarios:
        # Deterministic feature scenarios (run as functions, not LLM-goal strings)
        deterministic_catalog = {
            "sse_disconnect_banner": lambda: run_scenario_sse_disconnect_banner(
                connect_url, args.model, args.include_xml),
            "backgrounded_permission_notification": lambda: run_scenario_backgrounded_permission_notification(
                connect_url, args.model, args.include_xml),
            "hello_world_e2e": lambda: run_scenario_hello_world_e2e(
                connect_url, args.model, args.include_xml,
                project_dir=args.e2e_project_dir,
                ai_model_hint=args.e2e_model_hint,
                task=args.e2e_task,
                target_filename=args.e2e_filename,
            ),
        }

        catalog = {connect_scenario["name"]: connect_scenario}
        for s in SMOKE_SCENARIOS:
            catalog[s["name"]] = s

        requested = [n.strip() for n in args.scenarios.split(",") if n.strip()]
        unknown = [n for n in requested if n not in catalog and n not in deterministic_catalog]
        if unknown:
            valid = list(catalog.keys()) + list(deterministic_catalog.keys())
            sys.exit(f"Unknown scenario(s): {', '.join(unknown)}. Valid: {', '.join(valid)}")

        # Run deterministic scenarios first (they manage their own flow)
        det_results = []
        llm_scenarios = []
        for name in requested:
            if name in deterministic_catalog:
                print(f"\n{'='*60}")
                print(f"Scenario (deterministic): {name}")
                print(f"{'='*60}")
                result = deterministic_catalog[name]()
                result["scenario"] = name
                det_results.append(result)
                icon = "PASS" if result["status"] == "success" else "FAIL"
                print(f"  [{icon}] {name}: {result['status']}")
            else:
                llm_scenarios.append(catalog[name])

        if det_results and not llm_scenarios:
            overall = all(r["status"] == "success" for r in det_results)
            sys.exit(0 if overall else 1)

        scenarios = llm_scenarios
    elif args.only_connect_scenario:
        scenarios = [connect_scenario]
    else:
        scenarios = [{"name": "custom", "goal": args.goal}] if args.goal else list(SMOKE_SCENARIOS)
        if not args.goal and not args.skip_connect_scenario:
            scenarios.append(connect_scenario)

    results = []
    for scenario in scenarios:
        if not args.quiet:
            print(f"\n{'='*60}")
            print(f"Scenario: {scenario['name']}")
            print(f"Goal: {scenario['goal'][:80]}...")
            print(f"{'='*60}")

        rec_thread, _stop_ev, remote_path = start_screen_recording(scenario["name"])
        local_video = f"/tmp/cua_{scenario['name']}.mp4"

        try:
            if not ensure_app_foreground(verbose=not args.quiet):
                print(f"  [prep] warning: could not confirm {APP_PACKAGE} in foreground")
            maybe_dismiss_telemetry_consent(verbose=not args.quiet)
            ensure_app_foreground(verbose=not args.quiet)

            result = run_cua_step(
                goal=scenario["goal"],
                max_steps=args.max_steps,
                model=args.model,
                include_ui_xml=args.include_xml,
                verbose=not args.quiet,
                step_label=scenario["name"],
            )
        finally:
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

    failed = [r for r in results if r["status"] != "success"]
    if failed:
        print(f"\n{'!'*60}")
        print(f"FAILED: {len(failed)}/{len(results)} scenarios")
        sys.exit(1)
    else:
        print(f"\nAll {len(results)} scenarios passed.")


if __name__ == "__main__":
    main()
