#!/usr/bin/env python3
"""Author the Mira-station proof sheets from the seated office-scale figure.

Does not use assets/runner-deep.png as an animation frame.
"""
from __future__ import annotations

import statistics
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ART = Path("/opt/cursor/artifacts/assets")
OUT = ROOT / "concepts" / "sprites"
SRC = OUT / "src"
FIG = SRC / "mira-figure-tight.png"
FLOOR = ROOT / "assets" / "floor.jpg"
WORK = Path("/tmp/sprite-work")

OUT.mkdir(parents=True, exist_ok=True)
SRC.mkdir(exist_ok=True)
WORK.mkdir(exist_ok=True)

# Locked cell. Hem / seat-contact is the anchor (she has no exposed feet).
MIRA_W, MIRA_H = 56, 64
ANCHOR = (30, 62)
MIRA_DISPLAY_H = 58

SLIME_W, SLIME_H = 28, 26

# Chair seat on the 1280×720 floor (integer).
SEAT = (544, 208)


def ensure_figure() -> Path:
    if FIG.exists():
        return FIG
    src_office = SRC / "mira-in-office-source.png"
    im = Image.open(src_office if src_office.exists() else ART / "mira-in-chair-idle-a.png")
    crop = im.crop((700, 310, 830, 500))
    crop.save(FIG)
    return FIG


def extract_cluster() -> Image.Image:
    fig = Image.open(ensure_figure()).convert("RGBA")
    w, h = fig.size
    raw = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fp, rp = fig.load(), raw.load()

    def cyan(p):
        r, g, b = p[:3]
        return r < 90 and g > 55 and b > 70 and (g + b) > r * 3 and b + g > 140

    def skin(p):
        r, g, b = p[:3]
        return r > 140 and 80 < g < 210 and 50 < b < 180 and r > g and r - b > 25

    def hair(p):
        r, g, b = p[:3]
        return 5 < r < 50 and 5 < g < 40 and 5 < b < 40 and 25 < r + g + b < 110

    for y in range(h):
        for x in range(w):
            p = fp[x, y]
            keep = False
            if cyan(p):
                keep = True
            elif skin(p) and y < int(h * 0.55):
                keep = True
            elif hair(p) and y < int(h * 0.38) and 0.25 * w < x < 0.85 * w:
                keep = True
            if keep:
                rp[x, y] = (p[0], p[1], p[2], 255)

    # Close 1px coat holes using source cyan.
    a = raw.getchannel("A").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    ap = a.load()
    for y in range(h):
        for x in range(w):
            if rp[x, y][3]:
                continue
            if ap[x, y] > 160:
                p = fp[x, y]
                if cyan(p) or skin(p) or hair(p):
                    rp[x, y] = (p[0], p[1], p[2], 255)

    pts = [(x, y) for y in range(h) for x in range(w) if rp[x, y][3]]
    mx = statistics.median([p[0] for p in pts])
    my = statistics.median([p[1] for p in pts])
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for x, y in pts:
        if (x - mx) ** 2 + (y - my) ** 2 < 72 ** 2:
            op[x, y] = rp[x, y]
    bbox = out.getbbox()
    trim = out.crop(bbox)
    trim.save(SRC / "mira-master-extract.png")
    print("cluster", trim.size)
    return trim


def fit_cell(src: Image.Image) -> Image.Image:
    nh = MIRA_DISPLAY_H
    nw = max(1, int(round(src.size[0] * nh / src.size[1])))
    scaled = src.resize((nw, nh), Image.Resampling.NEAREST)
    px = scaled.load()
    bottom = nh - 1
    xs = []
    for y in range(nh - 1, -1, -1):
        row = [x for x in range(nw) if px[x, y][3]]
        if row:
            bottom = y
            xs = row
            break
    fx = (min(xs) + max(xs)) // 2 if xs else nw // 2
    cell = Image.new("RGBA", (MIRA_W, MIRA_H), (0, 0, 0, 0))
    cell.alpha_composite(scaled, (ANCHOR[0] - fx, ANCHOR[1] - bottom))
    return cell


def shift_box(im: Image.Image, box, dx, dy) -> Image.Image:
    out = im.copy()
    region = im.crop(box)
    ImageDraw.Draw(out).rectangle(
        (box[0], box[1], box[2] - 1, box[3] - 1), fill=(0, 0, 0, 0)
    )
    out.alpha_composite(region, (box[0] + dx, box[1] + dy))
    return out


def find_hands(im: Image.Image):
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(0, int(h * 0.62)):
        for x in range(int(w * 0.45), w):
            r, g, b, a = px[x, y]
            if a and r > 140 and r > g:
                xs.append(x)
                ys.append(y)
    if not xs:
        return (34, 22, 50, 36)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def find_hat(im: Image.Image):
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(0, 22):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r < 90 and g > 55 and b > 70:
                xs.append(x)
                ys.append(y)
    if not xs:
        return (12, 2, 44, 20)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def paint_frames(master: Image.Image) -> list[Image.Image]:
    hands = find_hands(master)
    hat = find_hat(master)
    w, h = master.size
    frames = [master.copy()]

    # IDLE B — coat hem 1px inward + blink if skin in hat-adjacent band
    idle = master.copy()
    px = idle.load()
    for y in range(h - 16, h - 6):
        for x in range(8, 28):
            r, g, b, a = px[x, y]
            if a and g > 60 and x + 1 < w and px[x + 1, y][3] == 0:
                px[x + 1, y] = (r, g, b, a)
                px[x, y] = (0, 0, 0, 0)
    for y in range(hat[3], min(h, hat[3] + 8)):
        for x in range(hat[2] - 4, min(w, hat[2] + 2)):
            r, g, b, a = px[x, y]
            if a and r > 140:
                px[x, y] = (max(0, r - 50), max(0, g - 40), max(0, b - 30), 255)
    frames.append(idle)

    # WORKING 4 — hands only
    frames.append(shift_box(master, hands, -1, 0))
    frames.append(shift_box(master, hands, 1, 0))
    work_c = shift_box(master, hands, 2, 0)
    wp = work_c.load()
    fx = min(w - 1, hands[2] + 1)
    fy = min(h - 1, (hands[1] + hands[3]) // 2)
    wp[fx, fy] = (232, 188, 152, 255)
    frames.append(work_c)
    work_d = shift_box(master, hands, -1, 0)
    wp = work_d.load()
    for y in range(hands[1], hands[3]):
        for x in range(hands[0], min(hands[2], hands[0] + 3)):
            r, g, b, a = wp[x, y]
            if a and r > 140:
                wp[x, y] = (max(0, r - 20), max(0, g - 16), max(0, b - 12), 255)
    frames.append(work_d)

    # RECEIVE 2 — hat/head only, no body translation
    rec_a = shift_box(master, hat, 1, 0)
    rec_b = shift_box(master, hat, 2, 0)
    for fr, extra in ((rec_a, 0), (rec_b, 1)):
        fp = fr.load()
        x = min(w - 1, hat[2] + extra)
        y = min(h - 1, (hat[1] + hat[3]) // 2 + 4)
        if fp[x, y][3] == 0:
            fp[x, y] = (228, 176, 140, 255)
    frames.append(rec_a)
    frames.append(rec_b)

    # HANDOFF 3 — authored reach toward the monitor (up-right)
    def reach(length):
        out = master.copy()
        px = out.load()
        hx = hands[2] - 1
        hy = (hands[1] + hands[3]) // 2
        teal = (20, 120, 140, 255)
        skin = (232, 188, 152, 255)
        for i in range(length):
            x = hx + i
            y = hy - (i // 2)
            if 0 <= x < w and 0 <= y < h:
                px[x, y] = skin if i >= length - 2 else teal
                if y + 1 < h:
                    px[x, y + 1] = teal if i < length - 2 else skin
        return out

    frames.append(reach(3))
    frames.append(reach(6))
    frames.append(reach(2))
    assert len(frames) == 11
    for i, fr in enumerate(frames):
        assert fr.size == (MIRA_W, MIRA_H)
    return frames


def slime_frames() -> list[Image.Image]:
    src_sheet = SRC / "scanslime-sheet-source.png"
    im = Image.open(src_sheet if src_sheet.exists() else ART / "scanslime-sheet.png").convert("RGBA")
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = im.getpixel((x, y))[:3]
            if r > 150 and 10 < b < 180 and g < 60 and r > g + 80:
                continue
            if r + g + b < 30:
                continue
            mp[x, y] = 255
    visited = [[False] * w for _ in range(h)]
    blobs = []
    for y in range(h):
        for x in range(w):
            if visited[y][x] or mp[x, y] == 0:
                continue
            stack = [(x, y)]
            visited[y][x] = True
            pts = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and mp[nx, ny]:
                        visited[ny][nx] = True
                        stack.append((nx, ny))
            if len(pts) > 400:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                blobs.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1, pts))
    blobs.sort(key=lambda b: b[0])
    cells = []
    for b in blobs[:5]:
        x0, y0, x1, y1, pts = b
        crop = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
        src = im.load()
        cp = crop.load()
        for x, y in pts:
            p = src[x, y]
            cp[x - x0, y - y0] = (p[0], p[1], p[2], 255)
        sx = (SLIME_W - 2) / crop.size[0]
        sy = (SLIME_H - 2) / crop.size[1]
        s = min(sx, sy)
        nw = max(1, int(round(crop.size[0] * s)))
        nh = max(1, int(round(crop.size[1] * s)))
        scaled = crop.resize((nw, nh), Image.Resampling.NEAREST)
        sp = scaled.load()
        bottom = nh - 1
        xs = []
        for y in range(nh - 1, -1, -1):
            row = [x for x in range(nw) if sp[x, y][3]]
            if row:
                bottom = y
                xs = row
                break
        fx = (min(xs) + max(xs)) // 2 if xs else nw // 2
        cell = Image.new("RGBA", (SLIME_W, SLIME_H), (0, 0, 0, 0))
        cell.alpha_composite(scaled, (SLIME_W // 2 - fx, SLIME_H - 1 - bottom))
        cells.append(cell)
    while len(cells) < 5:
        cells.append(cells[-1].copy())
    return cells[:5]


def chair_mask() -> Image.Image:
    floor = Image.open(FLOOR).convert("RGBA")
    mask = Image.new("RGBA", floor.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = 512, 170, 582, 232
    fp, mp = floor.load(), mask.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = fp[x, y]
            if r + g + b < 16:
                continue
            is_chair = (r < 48 and g < 42 and 18 < r + g + b < 120) or (
                b > 40 and b > r + 10 and b > g and r < 40
            )
            if not is_chair:
                continue
            if y >= 188:
                mp[x, y] = (r, g, b, 255)
            elif y >= 178 and 522 <= x <= 566:
                mp[x, y] = (r, g, b, 210)
    mask.save(OUT / "mira-chair-mask.png")
    return mask


def shadow():
    im = Image.new("RGBA", (34, 10), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((1, 2, 32, 8), fill=(0, 0, 0, 75))
    im.save(OUT / "contact-shadow.png")


def sheet(cells, cw, ch) -> Image.Image:
    img = Image.new("RGBA", (cw * len(cells), ch), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        img.alpha_composite(c, (i * cw, 0))
    return img


def preview(mira, slime, mask):
    floor = Image.open(FLOOR).convert("RGBA")
    dim = Image.new("RGBA", floor.size, (5, 7, 16, 140))
    ImageDraw.Draw(dim).ellipse((420, 60, 680, 310), fill=(0, 0, 0, 0))
    canvas = Image.alpha_composite(floor, dim)
    sh = Image.open(OUT / "contact-shadow.png")
    canvas.alpha_composite(sh, (SEAT[0] - 17, SEAT[1] - 3))
    canvas.alpha_composite(slime, (568, 138))
    canvas.alpha_composite(mira, (SEAT[0] - ANCHOR[0], SEAT[1] - ANCHOR[1]))
    canvas.alpha_composite(mask)
    view = canvas.crop((400, 70, 760, 320))
    view.save(SRC / "composite-idle-preview.png")
    view.save(WORK / "composite-idle.png")
    print("preview", "mira pos", (SEAT[0] - ANCHOR[0], SEAT[1] - ANCHOR[1]))


def main():
    cluster = extract_cluster()
    master = fit_cell(cluster)
    master.save(SRC / "mira-cell-master.png")
    mira = paint_frames(master)
    mira_sheet = sheet(mira, MIRA_W, MIRA_H)
    mira_sheet.save(OUT / "mira-sheet.png")
    print("mira sheet", mira_sheet.size)

    slime = slime_frames()
    slime_sheet = sheet(slime, SLIME_W, SLIME_H)
    slime_sheet.save(OUT / "scanslime-sheet.png")
    print("slime sheet", slime_sheet.size)

    mask = chair_mask()
    shadow()
    preview(mira[0], slime[0], mask)

    for i, fr in enumerate(mira):
        fr.save(WORK / f"mira-f{i:02d}.png")

    (OUT / "README.md").write_text(
        """# Station sprites (concept only)

`mira-sheet.png` — 11× 56×64. Anchor (30, 62).
0–1 idle · 2–5 working · 6–7 receiving · 8–10 handoff

`scanslime-sheet.png` — 5× 28×26.
0–1 idle · 2–3 scanner · 4 done

Not for production `index.html`.
""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
