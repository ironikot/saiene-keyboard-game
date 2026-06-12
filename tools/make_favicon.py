# -*- coding: utf-8 -*-
"""favicon 生成スクリプト（再エネ打）

緑のグラデーション角丸スクエア + 黄色い稲妻ボルト。
512px のマスターを描いて縮小し、以下をリポジトリ直下に出力する:
  - favicon.ico        (16/32/48 マルチサイズ)
  - apple-touch-icon.png (180x180)
favicon.svg は手書きの同デザイン（このスクリプトでは生成しない）。

実行: py tools/make_favicon.py
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 512  # マスターサイズ

TOP = (54, 178, 124)  # 上端の緑
BOTTOM = (29, 122, 82)  # 下端の緑（ゲームの --green-dark）
BOLT = (255, 213, 74)  # 稲妻（--sun）
BOLT_SHADOW = (122, 74, 0, 90)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_master():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 縦グラデーションの角丸スクエア（マスクで切り抜き）
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(TOP, BOTTOM, y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S // 5, fill=255)
    img.paste(grad, (0, 0), mask)

    # 稲妻ボルト（64基準の座標を512へスケール）
    pts64 = [(38, 4), (14, 38), (27, 38), (24, 60), (50, 25), (34, 25)]
    scale = S / 64
    pts = [(x * scale, y * scale) for x, y in pts64]
    shadow = [(x + 10, y + 12) for x, y in pts]
    d.polygon(shadow, fill=BOLT_SHADOW)
    d.polygon(pts, fill=BOLT + (255,))
    return img


def main():
    master = make_master()
    master.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, "apple-touch-icon.png"))
    ico = master.resize((48, 48), Image.LANCZOS)
    ico.save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("OK: favicon.ico / apple-touch-icon.png")


if __name__ == "__main__":
    main()
