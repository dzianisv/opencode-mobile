#!/usr/bin/env python3
"""Build the Product Hunt launch cards for OpenCode Mobile.

Source of truth: growth/product-hunt.md (copy) and growth/brand.md (colors).
Inputs (real assets only, never mockups):
  - assets/icon.png (1024x1024, the shipped app icon)
  - docs-site/screenshots/01.png, 02.png, 05.png, 06.png (real flows,
    1280x2560, checked 2026-11-18: no "FAKE DEVICE MODE" banner on any)
Outputs (all 1270x760 except the thumbnail):
  - growth/product-hunt/thumbnail-240x240.png
  - growth/product-hunt/gallery-01-hero.png
  - growth/product-hunt/gallery-02-connect.png
  - growth/product-hunt/gallery-03-sessions.png
  - growth/product-hunt/gallery-04-live.png
  - growth/product-hunt/gallery-05-benefits.png
Run: python3 growth/product-hunt/build-cards.py
Date: 2026-11-18
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "growth", "product-hunt")
SHOT = os.path.join(ROOT, "docs-site", "screenshots")

NAVY = (15, 23, 42)       # #0F172A — icon background (sampled)
BLUE = (59, 130, 246)     # #3B82F6 — icon mark/border (sampled)
GREY = (100, 116, 139)    # #64748B — icon wordmark (sampled)
WHITE = (255, 255, 255)
SUB = (148, 163, 184)     # #94A3B8 — subtext on navy
CARD_W, CARD_H = 1270, 760

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


def phone_shot(name, height=700, crop_bottom=0):
    """Real screenshot, scaled to height, rounded corners, blue frame.
    crop_bottom: pixels to trim off the source bottom (e.g. a half-cut
    button at the capture edge) — a crop of a real shot, never a mockup."""
    im = Image.open(os.path.join(SHOT, name)).convert("RGB")
    if crop_bottom:
        im = im.crop((0, 0, im.width, im.height - crop_bottom))
    w = int(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    im = rounded(im, 28)
    frame = Image.new("RGBA", (w + 8, height + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([0, 0, w + 7, height + 7], radius=32,
                        outline=BLUE + (255,), width=4)
    frame.paste(im, (4, 4), im)
    return frame


def base():
    img = Image.new("RGB", (CARD_W, CARD_H), NAVY)
    d = ImageDraw.Draw(img)
    # thin blue rule at the top edge — the brand's one accent
    d.rectangle([0, 0, CARD_W, 8], fill=BLUE)
    return img, d


def text_block(d, x, y, lines, gap=18):
    """lines: list of (text, font, fill). Returns y after last line."""
    for text, f, fill in lines:
        d.text((x, y), text, font=f, fill=fill)
        y += f.size + gap
    return y


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


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, "PNG")
    print(name, img.size)


def card_text_with_shot(fname, shot, heading, sub, crop_bottom=0):
    img, d = base()
    x, y = 72, 150
    for line in wrap(d, heading, font(BOLD, 58), 560):
        d.text((x, y), line, font=font(BOLD, 58), fill=WHITE)
        y += 72
    y += 14
    for line in wrap(d, sub, font(REG, 28), 560):
        d.text((x, y), line, font=font(REG, 28), fill=SUB)
        y += 40
    ph = phone_shot(shot, crop_bottom=crop_bottom)
    img.paste(ph, (CARD_W - 72 - ph.width, 30), ph)
    save(img, fname)


def main():
    os.makedirs(OUT, exist_ok=True)

    # 0 — thumbnail: the shipped icon, downscaled, nothing added.
    icon = Image.open(os.path.join(ROOT, "assets", "icon.png")).convert("RGB")
    icon.resize((240, 240), Image.LANCZOS).save(
        os.path.join(OUT, "thumbnail-240x240.png"), "PNG")
    print("thumbnail-240x240.png (240, 240)")

    # 1 — hero: name + tagline + strongest proof (06: code created).
    img, d = base()
    ic = Image.open(os.path.join(ROOT, "assets", "icon.png")).convert("RGB")
    ic = ic.resize((120, 120), Image.LANCZOS)  # already a rounded square;
    img.paste(ic, (72, 96))  # do not re-round — it clips the blue border
    d.text((72, 250), "OpenCode Mobile", font=font(BOLD, 66), fill=WHITE)
    y = 340
    for line in wrap(d, "Your AI coding agent, in your pocket.",
                     font(REG, 38), 560):
        d.text((72, y), line, font=font(REG, 38), fill=SUB)
        y += 50
    y += 26
    d.text((72, y), "Free  ·  Open source (MIT)  ·  Android",
           font=font(BOLD, 26), fill=BLUE)
    ph = phone_shot("06.png")
    img.paste(ph, (CARD_W - 72 - ph.width, 30), ph)
    save(img, "gallery-01-hero.png")

    # 2 — connect (01). Source bottom 150px cropped: the capture caught
    # a half-visible button at the frame edge; the crop removes it.
    card_text_with_shot("gallery-02-connect.png", "01.png",
                        "Connect in seconds",
                        "Paste your server address. Done.",
                        crop_bottom=150)
    # 3 — sessions (02).
    card_text_with_shot("gallery-03-sessions.png", "02.png",
                        "Every session, in your pocket",
                        "Start, resume, and switch sessions.")
    # 4 — live work (05).
    card_text_with_shot("gallery-04-live.png", "05.png",
                        "Watch the agent work, live",
                        "Thinking, tool calls, and diffs as they happen.")

    # 5 — benefit list, three bullets, large type, no screenshot.
    img, d = base()
    d.text((72, 110), "Free. Open. Yours.",
           font=font(BOLD, 60), fill=WHITE)
    bullets = [
        ("Free", " — no paywall, no ads, no account."),
        ("Open source (MIT)", " — inspect every line."),
        ("Your server only", " — your code never leaves it."),
    ]
    y = 250
    for head, tail in bullets:
        d.text((72, y), "●", font=font(BOLD, 30), fill=BLUE)
        d.text((118, y), head, font=font(BOLD, 36), fill=WHITE)
        w = d.textlength(head, font=font(BOLD, 36))
        d.text((118 + w, y + 2), tail, font=font(REG, 32), fill=SUB)
        y += 84
    d.text((72, 560), "Google Play  ·  github.com/dzianisv/opencode-mobile",
           font=font(REG, 26), fill=GREY)
    save(img, "gallery-05-benefits.png")


if __name__ == "__main__":
    main()
