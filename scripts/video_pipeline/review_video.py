# -*- coding: utf-8 -*-
"""Pre-publish QA for a generated video: objective audio/format checks plus
evenly-spaced frames for a human (or Claude) to actually look at.

Scope, stated plainly: this measures whether the audio EXISTS and is at a sane
level, and it exposes what is ON SCREEN. It cannot judge how the narration
sounds — whether the voice is pleasant, natural or monotone is not machine-
checkable here and still needs an ear.

Exit code 0 = clean, 1 = flagged (caller should hold publication).

Usage:
  python review_video.py <video.mp4> [--out DIR] [--frames 24] [--json]
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Every chapter video is named in Hebrew, and the verdict echoes that name back.
# Under the Windows console default (cp1252) that print raises UnicodeEncodeError
# and the tool dies before reporting anything. daily_grind captures our stdout as
# a pipe so it never hit this, but running the checker by hand on a single file —
# which is exactly what you do when a video looks wrong — always crashed.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).parent

# Thresholds. Prompt asks for 7-11 min; allow slack before calling it broken.
MIN_SEC, MAX_SEC = 5 * 60, 14 * 60
# Loudness is measured with EBU R128, not volumedetect/astats. Those two force a
# 16-bit integer conversion first, and NotebookLM audio decodes to roughly
# +0.8 dBFS in float — so the conversion itself clamps ~0.01% of samples and
# every single video looks "clipped". That is a measurement artefact, not a
# defect. Baseline from the 2026-07-26 batch: -14.8..-15.3 LUFS, +0.5..+1.4
# dBTP, LRA 3.3-3.9 — thresholds sit well outside that so only real breakage
# trips them.
LUFS_MIN, LUFS_MAX = -30.0, -9.0   # integrated loudness sanity band
TRUE_PEAK_MAX = 3.0                # dBTP; normalised speech sits near +1
LRA_MIN = 1.0                      # ~0 means a constant tone, not narration
SILENCE_DB = "-40dB"      # what counts as silence for silencedetect
SILENCE_MIN = 3.0         # seconds; shorter gaps are normal speech pauses
SILENCE_FRAC = 0.30       # flag if more than this share of the video is silent
LEAD_SILENCE = 20.0       # dead air at the start


def tool(name):
    """ffmpeg/ffprobe, whether or not the winget shim is on PATH yet."""
    found = shutil.which(name)
    if found:
        return found
    root = Path(os.environ["LOCALAPPDATA"]) / "Microsoft" / "WinGet" / "Packages"
    for exe in root.glob(f"Gyan.FFmpeg*/**/bin/{name}.exe"):
        return str(exe)
    sys.exit(f"{name} not found — install with: winget install Gyan.FFmpeg")


FFMPEG, FFPROBE = tool("ffmpeg"), tool("ffprobe")

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--out", default=None, help="frame output dir (default: <video>_review/)")
ap.add_argument("--frames", type=int, default=24)
ap.add_argument("--json", action="store_true", help="print only the JSON verdict")
ARGS = ap.parse_args()

VIDEO = Path(ARGS.video)
if not VIDEO.exists():
    sys.exit(f"no such file: {VIDEO}")
OUT = Path(ARGS.out) if ARGS.out else VIDEO.parent / f"{VIDEO.stem}_review"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return (r.stdout or "") + (r.stderr or "")


def probe():
    out = run([FFPROBE, "-v", "quiet", "-print_format", "json",
               "-show_format", "-show_streams", str(VIDEO)])
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        sys.exit(f"ffprobe failed on {VIDEO.name}")


def audio_stats(duration):
    """Loudness + silence map in one pass."""
    out = run([FFMPEG, "-i", str(VIDEO), "-af",
               f"ebur128=peak=true,"
               f"silencedetect=noise={SILENCE_DB}:d={SILENCE_MIN}",
               "-f", "null", "-"])
    # R128 numbers only from the trailing Summary block — the running log
    # repeats I:/LRA: every 100ms and would match first.
    summary = out.rsplit("Summary:", 1)[-1]

    def grab(pat, text=summary):
        m = re.search(pat, text)
        return float(m.group(1)) if m else None

    lufs = grab(r"\bI:\s*(-?\d+\.?\d*)\s*LUFS")
    lra = grab(r"\bLRA:\s*(-?\d+\.?\d*)\s*LU")
    true_peak = grab(r"Peak:\s*(-?\d+\.?\d*)\s*dBFS")

    silences = []
    start = None
    for m in re.finditer(r"silence_(start|end):\s*(-?\d+\.?\d*)", out):
        kind, t = m.group(1), float(m.group(2))
        if kind == "start":
            start = t
        elif start is not None:
            silences.append((start, t))
            start = None
    if start is not None:            # silence running to the end of the file
        silences.append((start, duration))
    return lufs, lra, true_peak, silences


def extract_frames(duration, n):
    """Evenly spaced stills, skipping the very first/last seconds (title cards
    and fades say little about the body of the video)."""
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("frame_*.jpg"):
        old.unlink()
    span_a, span_b = duration * 0.03, duration * 0.97
    step = (span_b - span_a) / max(n - 1, 1)
    made = []
    for i in range(n):
        t = span_a + i * step
        dest = OUT / f"frame_{i:02d}_{int(t // 60):02d}m{int(t % 60):02d}s.jpg"
        run([FFMPEG, "-y", "-ss", f"{t:.2f}", "-i", str(VIDEO),
             "-frames:v", "1", "-vf", "scale=1100:-1", "-q:v", "3", str(dest)])
        if dest.exists():
            made.append(dest.name)
    return made


def main():
    info = probe()
    duration = float(info.get("format", {}).get("duration", 0) or 0)
    vs = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    as_ = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)

    flags = []
    if not vs:
        flags.append("no video stream")
    if not as_:
        flags.append("NO AUDIO STREAM — silent video")
    if duration < MIN_SEC:
        flags.append(f"too short: {duration/60:.1f} min (want 7-11)")
    elif duration > MAX_SEC:
        flags.append(f"too long: {duration/60:.1f} min (want 7-11)")

    lufs = lra = true_peak = None
    silences = []
    if as_:
        lufs, lra, true_peak, silences = audio_stats(duration)
        if lufs is not None and lufs < LUFS_MIN:
            flags.append(f"narration far too quiet: {lufs} LUFS")
        if lufs is not None and lufs > LUFS_MAX:
            flags.append(f"narration far too hot: {lufs} LUFS")
        if true_peak is not None and true_peak > TRUE_PEAK_MAX:
            flags.append(f"true peak {true_peak} dBTP — risk of audible distortion")
        if lra is not None and lra < LRA_MIN:
            flags.append(f"loudness range {lra} LU — audio may be a flat tone, not speech")
        total_sil = sum(b - a for a, b in silences)
        if duration and total_sil / duration > SILENCE_FRAC:
            flags.append(f"{total_sil/duration:.0%} of the video is silent")
        lead = next((b - a for a, b in silences if a < 1.0), 0)
        if lead > LEAD_SILENCE:
            flags.append(f"{lead:.0f}s of dead air at the start")
        long_gaps = [(a, b) for a, b in silences if b - a > 15 and a >= 1.0]
        if long_gaps:
            flags.append(f"{len(long_gaps)} silent gap(s) over 15s: " +
                         ", ".join(f"{a/60:.1f}-{b/60:.1f}min" for a, b in long_gaps[:3]))

    frames = extract_frames(duration, ARGS.frames) if vs else []

    verdict = {
        "file": VIDEO.name,
        "ok": not flags,
        "flags": flags,
        "duration_min": round(duration / 60, 2),
        "resolution": f"{vs['width']}x{vs['height']}" if vs else None,
        "audio": {
            "codec": as_.get("codec_name") if as_ else None,
            "channels": as_.get("channels") if as_ else None,
            "integrated_lufs": lufs,
            "loudness_range_lu": lra,
            "true_peak_dbtp": true_peak,
            "silent_gaps": len(silences),
        },
        "frames_dir": str(OUT),
        "frames": frames,
        "not_checked": "voice quality, intonation and naturalness — needs a human ear",
    }

    if ARGS.json:
        print(json.dumps(verdict, ensure_ascii=False, indent=1))
    else:
        print(f"{VIDEO.name}: {'OK' if not flags else 'FLAGGED'}")
        print(f"  {verdict['duration_min']} min, {verdict['resolution']}, "
              f"audio {verdict['audio']['codec']} {lufs} LUFS, "
              f"LRA {lra} LU, true peak {true_peak} dBTP")
        for f in flags:
            print(f"  ! {f}")
        print(f"  {len(frames)} frames -> {OUT}")
    return 1 if flags else 0


if __name__ == "__main__":
    sys.exit(main())
