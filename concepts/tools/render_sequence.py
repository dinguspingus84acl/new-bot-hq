#!/usr/bin/env python3
"""Render the 10s Mira-station sequence to a 1920 still + GIF/MP4 from the real sheets."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "concepts" / "sprites"
SHOT = ROOT / "concepts" / "screenshots"
SHOT.mkdir(exist_ok=True)

MIRA_W, MIRA_H = 56, 64
SLIME_W, SLIME_H = 28, 26
FPS = 8
DURATION = 10.0

SEAT_MIRA = (514, 146)
SEAT_SLIME = (568, 138)
SHADOW = (527, 205)
PATH = [(528, 126), (548, 132), (572, 136), (598, 138), (624, 140), (646, 138)]


def phase(t):
    if t < 2.0:
        return "IDLE"
    if t < 2.4:
        return "RECEIVING"
    if t < 6.5:
        return "WORKING"
    if t < 7.5:
        return "HANDOFF"
    return "SETTLE"


def mira_index(t, tick):
    name = phase(t)
    if name == "IDLE":
        return 1 if tick % 16 == 11 else 0
    if name == "RECEIVING":
        return 6 if t < 2.2 else 7
    if name == "WORKING":
        return 2 + ((tick - int(2.4 * FPS)) % 4)
    if name == "HANDOFF":
        local = t - 6.5
        return 8 if local < 0.28 else 9 if local < 0.64 else 10
    return 0


def slime_index(t, tick):
    name = phase(t)
    if name == "IDLE":
        return 1 if tick % 10 == 7 else 0
    if name == "RECEIVING":
        return 0
    if name == "WORKING":
        return 2 + ((tick - int(2.4 * FPS)) % 2)
    if name == "HANDOFF":
        return 4
    return 0


def cell(sheet, i, cw, ch):
    return sheet.crop((i * cw, 0, (i + 1) * cw, ch))


def compose(t, floor, dim, mask, shadow, mira_sheet, slime_sheet, fonts):
    tick = int(t * FPS)
    canvas = Image.alpha_composite(floor, dim)
    canvas.alpha_composite(shadow, SHADOW)
    canvas.alpha_composite(cell(slime_sheet, slime_index(t, tick), SLIME_W, SLIME_H), SEAT_SLIME)
    canvas.alpha_composite(cell(mira_sheet, mira_index(t, tick), MIRA_W, MIRA_H), SEAT_MIRA)
    canvas.alpha_composite(mask)
    d = ImageDraw.Draw(canvas)
    d.rectangle((504, 108 + (tick * 2) % 28, 550, 110 + (tick * 2) % 28), fill=(103, 232, 249, 50))
    name = phase(t)
    if name == "RECEIVING":
        d.rectangle((526, 128, 532, 134), fill=(103, 232, 249, 220))
    if name == "HANDOFF":
        u = (t - 6.5) / 1.0
        idx = min(len(PATH) - 1, int(u * (len(PATH) - 1)))
        x, y = PATH[idx]
        d.rectangle((x - 11, y - 5, x + 11, y + 5), outline=(103, 232, 249, 255), fill=(11, 18, 32, 230))
        d.text((x - 8, y - 4), "EVD", font=fonts["tiny"], fill=(224, 242, 254, 255))
    if name == "SETTLE":
        d.rectangle((672, 110, 716, 138), fill=(103, 232, 249, 40))
    return canvas, name, tick


def hud(stage, name, t, fonts):
    d = ImageDraw.Draw(stage)
    d.text((27, 22), "●  LIVE", font=fonts["mono"], fill=(74, 222, 128, 255))
    d.text((27, 42), "Watchlist forensics", font=fonts["sans"], fill=(238, 243, 255, 255))
    label = "IDLE" if name == "SETTLE" else name
    d.text((27, 66), label, font=fonts["mono"], fill=(103, 232, 249, 255))
    lines = ["", "", ""]
    if t >= 2.0:
        lines[2] = "Mira received watchlist forensics."
    if t >= 7.5:
        lines[1] = "Mira received watchlist forensics."
        lines[2] = "Evidence packet handed to Kai."
    y = 88
    for line in lines:
        d.text((27, y), line or " ", font=fonts["tiny"], fill=(154, 168, 199, 255))
        y += 16
    p = 0
    if 2.4 <= t < 6.5:
        p = int(((t - 2.4) / 4.1) * 70)
    elif t >= 6.5:
        p = 70
    d.rectangle((27, 140, 119, 144), fill=(30, 41, 59, 255))
    if p:
        d.rectangle((27, 140, 27 + p, 144), fill=(103, 232, 249, 255))


def main():
    floor = Image.open(ROOT / "assets" / "floor.jpg").convert("RGBA")
    dim = Image.new("RGBA", floor.size, (5, 7, 16, 140))
    ImageDraw.Draw(dim).ellipse((420, 60, 680, 310), fill=(0, 0, 0, 0))
    mask = Image.open(SPR / "mira-chair-mask.png")
    shadow = Image.open(SPR / "contact-shadow.png")
    mira_sheet = Image.open(SPR / "mira-sheet.png")
    slime_sheet = Image.open(SPR / "scanslime-sheet.png")
    fonts = {
        "sans": ImageFont.truetype("/usr/share/fonts/truetype/inter/Inter-SemiBold.ttf", 20),
        "mono": ImageFont.truetype("/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf", 14),
        "tiny": ImageFont.truetype("/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf", 12),
    }

    frames = []
    n = int(DURATION * FPS)
    for i in range(n):
        t = i / FPS
        scene, name, tick = compose(t, floor, dim, mask, shadow, mira_sheet, slime_sheet, fonts)
        stage = scene.resize((1920, 1080), Image.Resampling.NEAREST)
        hud(stage, name, t, fonts)
        frames.append(stage.convert("RGB"))
        if abs(t - 3.5) < 0.01:
            stage.convert("RGB").save(SHOT / "mira-station-proof.png")
            print("still at", t, name)

    gif = frames[::1]
    gif[0].save(
        SHOT / "mira-station-proof.gif",
        save_all=True,
        append_images=gif[1:],
        duration=int(1000 / FPS),
        loop=0,
        optimize=True,
    )
    print("gif frames", len(gif), "size", (SHOT / "mira-station-proof.gif").stat().st_size)

    # also dump pngs for ffmpeg mp4
    seq = Path("/tmp/mira-seq")
    seq.mkdir(exist_ok=True)
    for i, fr in enumerate(frames):
        fr.save(seq / f"f{i:03d}.png")
    print("png sequence", n)


if __name__ == "__main__":
    main()
