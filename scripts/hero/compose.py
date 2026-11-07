"""
トップの動画を作る: capture.cjs で撮った画面（440px 幅・2倍）を、ゆっくり送りながら順に重ねて見せる。

  FPS=24 SCALE=660 python3 scripts/hero/compose.py <cap のフォルダ> <出力フォルダ> [H.264 の crf] [AV1 の crf]

出力: hero.mp4（H.264）、hero.webm（AV1）、hero.webp（最初の画面）、segments.json（区切りの時間）。
要るもの: Python 3（numpy・Pillow）、ffmpeg（libx264・libsvtav1）。手順は scripts/hero/README.md
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CAP = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

W, H = 880, 1100  # 440 x 550 CSS px の 2 倍
WIN = H // 2  # 窓の高さ（CSS px）
import os
FPS = int(os.environ.get("FPS", "24"))
SCALE = os.environ.get("SCALE", "660")
FADE = 0.22
BG = (246, 247, 248)

_cache: dict[str, Image.Image] = {}


def img(name: str) -> Image.Image:
    if name not in _cache:
        _cache[name] = Image.open(CAP / f"{name}.png").convert("RGB")
    return _cache[name]


def boxes(name: str) -> dict:
    return json.loads((CAP / f"{name}.json").read_text())


def window(name: str, top_css: float) -> np.ndarray:
    """top_css（CSS px）から下を W x H で切り出す。はみ出す所は背景色"""
    im = img(name)
    top = int(round(top_css * 2))
    top = max(0, min(top, max(0, im.height - H)))
    crop = im.crop((0, top, W, top + H))
    if crop.size != (W, H):
        bg = Image.new("RGB", (W, H), BG)
        bg.paste(crop, (0, 0))
        crop = bg
    return np.asarray(crop, dtype=np.float32)


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


class Clip:
    """1枚の画面。keys は (秒, 窓の上端 CSS px) の並び。間はなめらかに送る"""

    def __init__(self, seg: str, name: str, keys: list[tuple[float, float]], dur: float):
        self.seg, self.name, self.keys, self.dur = seg, name, keys, dur

    def top_at(self, t: float) -> float:
        ks = self.keys
        if t <= ks[0][0]:
            return ks[0][1]
        for (t0, y0), (t1, y1) in zip(ks, ks[1:]):
            if t <= t1:
                return y0 + (y1 - y0) * ease((t - t0) / (t1 - t0))
        return ks[-1][1]

    def frame(self, t: float) -> np.ndarray:
        return window(self.name, self.top_at(t))


def still(seg: str, name: str, top: float, dur: float) -> Clip:
    return Clip(seg, name, [(0, top)], dur)


def pan(seg: str, name: str, top0: float, top1: float, hold0: float, move: float, hold1: float) -> Clip:
    return Clip(seg, name, [(0, top0), (hold0, top0), (hold0 + move, top1)], hold0 + move + hold1)


def bottom_anchor(name: str, sel: str = ".call", pad: float = 18) -> float:
    b = boxes(name)[sel][0]
    return max(0.0, b[1] + b[3] + pad - WIN)


# ---- 絵コンテ ----
clips: list[Clip] = []

# 1 予行演習: 相手が話す → 録音 → 会話が続く → 電話が終わる（会話の欄の下の端に合わせる）
practice = sorted(p.stem for p in CAP.glob("practice-ja-*.png"))
pick = [n for n in practice if n.endswith(("00-speak", "01-rec", "03-rec", "05-rec", "07-rec"))]
pick.append([n for n in practice if n.endswith("ended")][0])
durs = [1.0, 0.9, 0.8, 0.8, 0.8, 1.5]
for n, d in zip(pick, durs):
    clips.append(still("practice", n, bottom_anchor(n), d))

# 2 赤ペン: 上（直すのは3つ）→ 会話の記録の「だいじょうぶです。」の赤まで送る
rv = boxes("review-ja")
wavy = rv[".wavy"][0][1]
clips.append(pan("review", "review-ja", 0, wavy - 150, 1.2, 1.1, 2.3))

# 3 本番のカンペ: カンペ（日本語の画面・ベトナム語の訳）→ 言うこと → QR → スマホで開いた本番用
kv = boxes("kanpe-ja-vi")
say_top = kv[".sec"][1][1]
clips.append(pan("kanpe", "kanpe-ja-vi", 0, say_top - 60, 1.3, 1.0, 1.1))
qv = boxes("kanpe-ja-vi-qrprod")
qi = qv["qrimg"][0]
clips.append(still("kanpe", "kanpe-ja-vi-qrprod", qi[1] + qi[3] + 28 - WIN, 1.3))
clips.append(still("kanpe", "live-ja-vi", 0, 1.6))

# 4 いろいろなことば: 同じ赤ペンの画面を、言語を変えて
for lang in ["en", "vi", "zh", "ne", "my", "easy"]:
    if (CAP / f"review-{lang}.png").exists():
        clips.append(still("langs", f"review-{lang}", 0, 0.95))

# ---- 時間を決める（となりの画面は FADE 秒重ねる） ----
starts = []
t = 0.0
for c in clips:
    starts.append(t)
    t += c.dur - FADE
total = t + FADE  # 最後の画面の終わり
# 最後は最初の画面へ重ねて終える（くり返しのつなぎ目を見せない）
LOOP_FADE = 0.35
total = starts[-1] + clips[-1].dur
n_frames = int(round(total * FPS))

segments = []
for c, s in zip(clips, starts):
    if not segments or segments[-1]["key"] != c.seg:
        segments.append({"key": c.seg, "start": round(s + (FADE / 2 if s else 0), 2)})


def frame_at(t: float) -> np.ndarray:
    live = [(c, s) for c, s in zip(clips, starts) if s <= t < s + c.dur]
    if not live:
        live = [(clips[-1], starts[-1])]
    c, s = live[0]
    f = c.frame(t - s)
    if len(live) > 1:
        c2, s2 = live[1]
        a = (t - s2) / FADE
        f = f * (1 - a) + c2.frame(t - s2) * a
    # くり返しのつなぎ目: 最後の LOOP_FADE 秒で最初の画面へ
    if t > total - LOOP_FADE:
        a = (t - (total - LOOP_FADE)) / LOOP_FADE
        f = f * (1 - a) + clips[0].frame(0) * a
    return f


def encode(args: list[str], out: Path):
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-vf", f"scale={SCALE}:-2:flags=lanczos", *args, str(out),
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n_frames):
        p.stdin.write(np.clip(frame_at(i / FPS), 0, 255).astype(np.uint8).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit(f"ffmpeg failed: {out}")


_p = Image.fromarray(np.clip(frame_at(0), 0, 255).astype(np.uint8))
_p.resize((int(SCALE), round(int(SCALE) * H / W)), Image.LANCZOS).save(OUT / "hero.webp", quality=80)
encode(
    ["-c:v", "libx264", "-preset", "slow", "-crf", sys.argv[3] if len(sys.argv) > 3 else "26",
     "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", "60", "-movflags", "+faststart", "-an"],
    OUT / "hero.mp4",
)
encode(
    ["-c:v", "libsvtav1", "-crf", sys.argv[4] if len(sys.argv) > 4 else "30", "-preset", "4",
     "-g", "60", "-pix_fmt", "yuv420p", "-svtav1-params", "tune=0", "-an"],
    OUT / "hero.webm",
)
(OUT / "segments.json").write_text(
    json.dumps({"width": int(SCALE), "height": round(int(SCALE) * H / W), "duration": round(total, 2), "segments": segments}, ensure_ascii=False)
)
for f in ["hero.mp4", "hero.webm", "hero.webp"]:
    print(f, (OUT / f).stat().st_size // 1024, "KB")
print(json.dumps(segments), round(total, 2), "s")
