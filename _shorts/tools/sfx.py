"""効果音をその場で合成する（外部素材なし・著作権フリー）。

hook  : 冒頭の「ドンッ」（短い低音＋アタック）
pop   : 見出しが出るときの軽いポン
ding  : 大事なポイントのチャイム
whoosh: 場面転換のシュッ
kira  : 締めのキラッ
"""
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000


def env(n, attack=0.005, release=0.2):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    r = np.exp(-t / release)
    return a * r


def hook():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 42 + 110 * np.exp(-t * 18)                      # 150Hz -> 42Hz に落ちる
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.16)
    click = np.random.default_rng(1).normal(0, 1, n) * env(n, 0.0005, 0.012)
    up = np.sin(2 * np.pi * np.cumsum(600 + 2400 * t / t[-1]) / SR) * env(n, 0.02, 0.05) * 0.15
    return body * 0.9 + click * 0.35 + up


def pop():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 380 + 700 * (t / t[-1]) ** 0.5
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.035)


def ding():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d)
            for f, a, d in [(1318.5, 1.0, 5), (1975.5, 0.5, 7), (2637, 0.25, 9), (659.3, 0.3, 4)])
    return s * env(n, 0.002, 10)


def whoosh():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = np.random.default_rng(2).normal(0, 1, n)
    # 簡易バンドパスを時間で動かす（移動平均の差で近似）
    out = np.zeros(n)
    for i, k in enumerate(np.linspace(40, 6, 8).astype(int)):
        seg = slice(i * n // 8, (i + 1) * n // 8)
        lp = np.convolve(noise, np.ones(k) / k, mode="same")
        out[seg] = (noise - lp)[seg] * 0.3 + lp[seg]
    shape = np.sin(np.pi * t / t[-1]) ** 2
    return out * shape * 0.6


def kira():
    notes = [1046.5, 1318.5, 1568.0, 2093.0]
    total = np.zeros(int(0.7 * SR))
    for i, f in enumerate(notes):
        start = int(i * 0.06 * SR)
        n = len(total) - start
        t = np.arange(n) / SR
        total[start:] += np.sin(2 * np.pi * f * t) * np.exp(-t * 7) * 0.5
    return total * env(len(total), 0.002, 10)


BANK = {"hook": hook, "pop": pop, "ding": ding, "whoosh": whoosh, "kira": kira}


def render_all(out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, fn in BANK.items():
        x = fn()
        x = x / (np.abs(x).max() + 1e-9) * 0.89  # -1 dBFS ピーク
        sf.write(out_dir / f"{name}.wav", x.astype(np.float32), SR)


if __name__ == "__main__":
    render_all(Path(__file__).resolve().parent.parent / "build" / "sfx")
