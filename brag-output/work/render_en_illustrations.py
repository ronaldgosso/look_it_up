import base64
import io
import os
import subprocess
from collections import deque
import numpy as np
from PIL import Image

WORK = os.path.abspath("brag-output/work")
SRC_DIR = os.path.abspath("assets/look-it-up-tutorial-illustrations")
OUT_DIR = WORK
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"


def find_components(mask, min_area=8):
    h, w = mask.shape
    vis = np.zeros_like(mask, dtype=bool)
    comps = []
    ys, xs = np.where(mask)
    for sy, sx in zip(ys, xs):
        if vis[sy, sx]:
            continue
        q = deque([(sy, sx)])
        vis[sy, sx] = True
        pixels = []
        minx = maxx = sx
        miny = maxy = sy
        while q:
            y, x = q.popleft()
            pixels.append((y, x))
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not vis[ny, nx]:
                        vis[ny, nx] = True
                        q.append((ny, nx))
        if len(pixels) >= min_area:
            comps.append((minx, miny, maxx, maxy, pixels))
    return comps


def dilate_mask(m, radius=3):
    out = m.copy()
    h, w = m.shape
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            ys = slice(max(0, dy), h + min(0, dy))
            xs = slice(max(0, dx), w + min(0, dx))
            sy = slice(max(0, -dy), h - max(0, dy))
            sx = slice(max(0, -dx), w - max(0, dx))
            out[ys, xs] |= m[sy, sx]
    return out


def clean_erase_clusters(img_path, boxes):
    im = Image.open(img_path).convert("RGB")
    arr = np.array(im)
    h, w, _ = arr.shape
    mask = np.linalg.norm(arr.astype(float) - 255.0, axis=2) > 22
    comps = find_components(mask, min_area=6)

    erase_mask = np.zeros((h, w), dtype=bool)
    keep_mask = np.zeros((h, w), dtype=bool)
    for x0, y0, x1, y1, pixels in comps:
        area = len(pixels)
        hit = False
        if area < 4000:
            for bx0, by0, bx1, by1 in boxes:
                if x0 >= bx0 and x1 <= bx1 and y0 >= by0 and y1 <= by1:
                    hit = True
                    break
        target = erase_mask if hit else keep_mask
        for y, x in pixels:
            target[y, x] = True

    # Dilate erase mask slightly to remove anti-aliasing fringes, without touching kept artwork
    dil_erase = dilate_mask(erase_mask, radius=4) & (~dilate_mask(keep_mask, radius=1))
    cleaned = arr.copy()
    cleaned[dil_erase] = [255, 255, 255]
    return Image.fromarray(cleaned, mode="RGB")


def pil_to_b64_png(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def render_svg_over_clean_base(clean_im, svg_labels, out_png_path):
    b64 = pil_to_b64_png(clean_im)
    w, h = clean_im.size
    font_bold = os.path.abspath(r"C:\Windows\Fonts\segoeprb.ttf").replace("\\", "/")
    font_ink = os.path.abspath(r"C:\Windows\Fonts\Inkfree.ttf").replace("\\", "/")

    html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @font-face {{
    font-family: 'XiaoheiPrint';
    src: url('file:///{font_bold}') format('truetype');
    font-weight: 700;
  }}
  @font-face {{
    font-family: 'XiaoheiInk';
    src: url('file:///{font_ink}') format('truetype');
    font-weight: 400;
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {w}px; height: {h}px; overflow: hidden; background: #ffffff; }}
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <defs>
    <filter id="penWobble" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.45" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <rect width="{w}" height="{h}" fill="#ffffff"/>
  <image href="data:image/png;base64,{b64}" x="0" y="0" width="{w}" height="{h}"/>
  <g filter="url(#penWobble)">
    {svg_labels}
  </g>
</svg>
</body>
</html>"""
    html_path = os.path.join(WORK, "compose_tmp.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    file_url = "file:///" + html_path.replace("\\", "/")
    subprocess.run(
        [
            EDGE,
            "--headless=new",
            "--disable-gpu",
            f"--window-size={w},{h}",
            "--hide-scrollbars",
            f"--screenshot={out_png_path}",
            file_url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    out_im = Image.open(out_png_path).convert("RGB")
    if out_im.size != (w, h):
        out_im = out_im.crop((0, 0, w, h))
        out_im.save(out_png_path)
    print(f"Saved {out_png_path} size={out_im.size}")


SPECS = [
    (
        "01-logit-bias.png",
        [
            (494, 175, 646, 245),   # V1 胜出
            (654, 218, 822, 281),   # 悄悄藏位 (leaves arrow [10] at x<=653,y>=281 completely untouched!)
            (166, 310, 344, 430),   # 轻轻垫高 +δ (left margin label; keeps +δ at wedge intact)
            (880, 628, 1066, 686),  # 读着还顺
        ],
        """
        <g transform="translate(568, 221) rotate(-4.5)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="37" font-weight="700" fill="#0d0d0d" letter-spacing="-0.5">
            V<tspan font-size="25" dy="6">1</tspan><tspan dy="-6"> wins</tspan>
          </text>
        </g>
        <g transform="translate(752, 260) rotate(-3)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="31" font-weight="700" fill="#ae2c2e" letter-spacing="-0.4">Hidden bit</text>
        </g>
        <g transform="translate(256, 355) rotate(-2)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="30" font-weight="700" fill="#eb7c22" letter-spacing="-0.4">Gentle shim</text>
          <text x="0" y="42" text-anchor="middle" font-family="XiaoheiPrint" font-size="34" font-weight="700" fill="#eb7c22">+δ</text>
        </g>
        <g transform="translate(972, 666) rotate(-1.5)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="32" font-weight="700" fill="#205da9" letter-spacing="-0.4">Reads smoothly</text>
        </g>
        """,
    ),
    (
        "02-frameshift-recovery.png",
        [
            (754, 66, 985, 118),    # 硬对齐全歪 (above tick marks at y>=123)
            (618, 312, 788, 364),   # 被删一格 (below scissors at y<=309)
            (818, 428, 1004, 482),  # 弹性跳格
            (962, 518, 1146, 572),  # 对回原位
        ],
        """
        <g transform="translate(875, 102) rotate(-1)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="33" font-weight="700" fill="#ae2523" letter-spacing="-0.4">All misaligned</text>
        </g>
        <g transform="translate(708, 348)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="30" font-weight="700" fill="#ae2523" letter-spacing="-0.4">1 token snipped</text>
        </g>
        <g transform="translate(922, 464) rotate(-1)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="32" font-weight="700" fill="#ea861f" letter-spacing="-0.4">Elastic jump</text>
        </g>
        <g transform="translate(1056, 554)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="32" font-weight="700" fill="#1496d6" letter-spacing="-0.4">Back in sync</text>
        </g>
        """,
    ),
    (
        "03-linear-gf2-lattice.png",
        [
            (238, 178, 450, 236),   # 随机乱放
            (420, 278, 586, 336),   # 容易撞车 (leaves red curve [21] x<=417 untouched)
            (1142, 312, 1310, 368), # 等距排开 (above orange curve [33] y>=375)
            (962, 530, 1106, 588),  # 零偏差
        ],
        """
        <g transform="translate(344, 214)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="35" font-weight="700" fill="#0d0d0d" letter-spacing="-0.5">Random scatter</text>
        </g>
        <g transform="translate(505, 314) rotate(-1.5)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="31" font-weight="700" fill="#b9352f" letter-spacing="-0.4">Collisions</text>
        </g>
        <g transform="translate(1224, 326)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="30" font-weight="700" fill="#df802e" letter-spacing="-0.4">Evenly</text>
          <text x="0" y="37" text-anchor="middle" font-family="XiaoheiPrint" font-size="30" font-weight="700" fill="#df802e" letter-spacing="-0.4">spaced</text>
        </g>
        <g transform="translate(1035, 566)">
          <text x="0" y="0" text-anchor="middle" font-family="XiaoheiPrint" font-size="34" font-weight="700" fill="#116ac4" letter-spacing="-0.4">Zero spread</text>
        </g>
        """,
    ),
]


def main():
    for fname, boxes, labels in SPECS:
        src = os.path.join(SRC_DIR, fname)
        clean_im = clean_erase_clusters(src, boxes)
        out = os.path.join(OUT_DIR, f"en-{fname}")
        render_svg_over_clean_base(clean_im, labels, out)


if __name__ == "__main__":
    main()
