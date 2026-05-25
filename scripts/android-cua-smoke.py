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
        import re
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
]


def main():
    parser = argparse.ArgumentParser(description="Android CUA smoke test")
    parser.add_argument("--goal", help="Custom goal (overrides built-in scenarios)")
    parser.add_argument("--model", default="gpt-4o", help="Vision model to use")
    parser.add_argument("--max-steps", type=int, default=30)
    parser.add_argument("--include-xml", action="store_true", help="Include UI XML in context")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    # Verify ADB
    try:
        devices = adb("devices")
        if "device" not in devices.split("\n", 1)[-1]:
            sys.exit("No ADB device connected. Start emulator first.")
    except FileNotFoundError:
        sys.exit("adb not found in PATH")

    scenarios = [{"name": "custom", "goal": args.goal}] if args.goal else SMOKE_SCENARIOS

    results = []
    for scenario in scenarios:
        if not args.quiet:
            print(f"\n{'='*60}")
            print(f"Scenario: {scenario['name']}")
            print(f"Goal: {scenario['goal'][:80]}...")
            print(f"{'='*60}")

        result = run_cua(
            goal=scenario["goal"],
            max_steps=args.max_steps,
            model=args.model,
            include_ui_xml=args.include_xml,
            verbose=not args.quiet,
        )
        result["scenario"] = scenario["name"]
        results.append(result)

        if not args.quiet:
            print(f"\nResult: {result['status']} in {result['steps']} steps")
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
