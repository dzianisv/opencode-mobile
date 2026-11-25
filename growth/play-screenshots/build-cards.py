#!/usr/bin/env python3
"""Build the Google Play phone-screenshot deck for OpenCode Mobile.

Source of truth: growth/aso-play-listing.md (deck plan + copy) and
growth/brand.md (colors). Visual system matches the Product Hunt cards
(growth/product-hunt/build-cards.py): flat navy, one blue accent, large
plain type, real screenshots — no gradients, no decoration.

Inputs (real captures only, never mockups):
  - docs-site/screenshots/01.png, 02.png, 05.png, 06.png (1280x2560)
Outputs (Play phone screenshots, 1280x2560):
  - fastlane/metadata/android/en-US/images/phoneScreenshots/01.png..05.png
    (replaces the old 7 raw captures: 03 was a near-duplicate of 02,
    07 a near-duplicate of 06, 04 was mid-typing with the keyboard open)
Run: python3 growth/play-screenshots/build-cards.py
Date: 2026-11-22
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "fastlane", "metadata", "android", "en-US",
                   "images", "phoneScreenshots")
SHOT = os.path.join(ROOT, "docs-site", "screenshots")

NAVY = (15, 23, 42)       # #0F172A — icon background (sampled)
BLUE = (59, 130, 246)     # #3B82F6 — icon mark/border (sampled)
GREY = (100, 116, 139)    # #64748B — icon wordmark (sampled)
WHITE = (255, 255, 255)
SUB = (148, 163, 184)     # #94A3B8 — subtext on navy
CARD_W, CARD_H = 1280, 2560

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                        radius=radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def phone_shot(name, width=1040, crop_bottom=0):
    """Real screenshot, scaled to width, rounded corners, blue frame.
    crop_bottom: source pixels trimmed off the bottom (input bar, tab
    bar, or a half-cut button at the capture edge) — a crop of a real
    shot, never a mockup."""
    im = Image.open(os.path.join(SHOT, name)).convert("RGB")
    if crop_bottom:
        im = im.crop((0, 0, im.width, im.height - crop_bottom))
    h = int(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    im = rounded(im, 28)
    frame = Image.new("RGBA", (width + 8, h + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([0, 0, width + 7, h + 7], radius=32,
                        outline=BLUE + (255,), width=4)
    frame.paste(im, (4, 4), im)
    return frame


def base():
    img = Image.new("RGB", (CARD_W, CARD_H), NAVY)
    d = ImageDraw.Draw(img)
    # thin blue rule at the top edge — the brand's one accent
    d.rectangle([0, 0, CARD_W, 10], fill=BLUE)
    return img, d


def wrap(d, text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def card(fname, shot, eyebrow, heading, sub, crop_bottom=0):
    img, d = base()
    x = 80
    # eyebrow: small caps, blue, orients without carrying the benefit
    d.text((x, 120), eyebrow, font=font(BOLD, 34), fill=BLUE)
    y = 190
    for line in wrap(d, heading, font(BOLD, 96), CARD_W - 2 * x):
        d.text((x, y), line, font=font(BOLD, 96), fill=WHITE)
        y += 118
    y += 24
    for line in wrap(d, sub, font(REG, 42), CARD_W - 2 * x):
        d.text((x, y), line, font=font(REG, 42), fill=SUB)
        y += 58
    ph = phone_shot(shot, crop_bottom=crop_bottom)
    # bottom-anchored: text zone above, phone fills the rest
    img.paste(ph, ((CARD_W - ph.width) // 2, CARD_H - 60 - ph.height), ph)
    p = os.path.join(OUT, fname)
    img.save(p, "PNG")
    print(fname, img.size)


def closer(fname):
    """Last slide: no screenshot, benefit list + footer (PH gallery-05
    adapted to portrait). Content is spread down the canvas so the
    navy reads as breathing room, not a void."""
    img, d = base()
    ic = Image.open(os.path.join(ROOT, "assets", "icon.png")).convert("RGB")
    ic = ic.resize((200, 200), Image.LANCZOS)  # already a rounded square
    img.paste(ic, (80, 200))
    d.text((80, 480), "Free. Open. Yours.",
           font=font(BOLD, 96), fill=WHITE)
    bullets = [
        ("Free", " — no paywall, no ads, no account."),
        ("Open source (MIT)", " — read every line."),
        ("Your server only", " — code stays on it."),
        ("Android only", " — there is no iOS version."),
    ]
    y = 800
    for head, tail in bullets:
        # fail loudly instead of silently running text off the canvas
        w = d.textlength(head, font=font(BOLD, 56))
        total = 148 + w + d.textlength(tail, font=font(REG, 46))
        assert total <= CARD_W - 80, f"bullet overflows: {head}{tail}"
        d.text((80, y), "●", font=font(BOLD, 44), fill=BLUE)
        d.text((148, y), head, font=font(BOLD, 56), fill=WHITE)
        d.text((148 + w, y + 6), tail, font=font(REG, 46), fill=SUB)
        y += 240
    d.text((80, 1800), "OpenCode Mobile", font=font(BOLD, 64), fill=WHITE)
    d.text((80, 1900), "Your AI coding agent, in your pocket.",
           font=font(REG, 48), fill=SUB)
    d.text((80, 2250), "Google Play  ·  github.com/dzianisv/opencode-mobile",
           font=font(REG, 36), fill=GREY)
    p = os.path.join(OUT, fname)
    img.save(p, "PNG")
    print(fname, img.size)


def main():
    os.makedirs(OUT, exist_ok=True)
    # 1 — hero: the outcome (06: code created). Bottom 575px cropped:
    # the "Run it with..." lines below the code block — the cut lands in
    # the clean gap at source rows 1940-1985 (fine pixel scan; the code
    # line ends ~1840, "Run it" starts ~1990).
    card("01.png", "06.png", "01 / 05",
         "Your code, written from your phone.",
         "The agent writes. You approve.",
         crop_bottom=575)
    # 2 — differentiator: live thinking + tool calls (05). Bottom 460px
    # cropped: the tool card below the second message — the cut lands in
    # the clean gap at source rows 2100-2120 (column scan; the "Adding
    # the new hello.ts" text ends ~1950, the scroll-down FAB ends ~2070,
    # the next tool card starts ~2130).
    card("02.png", "05.png", "02 / 05",
         "Watch it think. Approve every step.",
         "Thinking, tool calls, and diffs as they happen.",
         crop_bottom=460)
    # 3 — connect (01). Bottom 150px cropped: the half-cut button at
    # the capture edge (same crop as the PH card).
    card("03.png", "01.png", "03 / 05",
         "Connect in seconds.",
         "Paste your server address. Done.",
         crop_bottom=150)
    # 4 — sessions (02). Bottom 500px cropped: the floating "+" button
    # and tab bar below the session list — the cut lands in clean white
    # space (rows 1760-2060 empty).
    card("04.png", "02.png", "04 / 05",
         "Every session, in your pocket.",
         "Start, resume, and switch sessions.",
         crop_bottom=500)
    # 5 — closer: benefit list, no screenshot.
    closer("05.png")


if __name__ == "__main__":
    main()
