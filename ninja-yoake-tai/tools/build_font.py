#!/usr/bin/env python3
"""ゲームの字だけにしぼった丸ゴシック（Zen Maru Gothic・SIL OFL 1.1）を作る。DESIGN.md §11.3

使い方：python3 tools/build_font.py <ZenMaruGothic の TTF があるフォルダ>
  フォルダには ZenMaruGothic-500.ttf（Medium）と ZenMaruGothic-700.ttf（Bold）を置く
  （Google Fonts の Zen Maru Gothic。fonttools の pyftsubset と brotli が要る）。
ゲームのファイル（*.js・*.html・*.css と ../ninja-sato-life/chars.js）に出てくる字と、
かな・英数字・記号を集めて、fonts/zen-maru-gothic-game-500.woff2 と -700.woff2 を作る。
ゲームの文を足したら、作り直す（ないと、その字だけ端末の字体で出る）。
"""
import glob, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)

def chars():
    s = set()
    files = glob.glob(os.path.join(GAME, '*.js')) + glob.glob(os.path.join(GAME, '*.html')) + glob.glob(os.path.join(GAME, '*.css'))
    files.append(os.path.join(GAME, '..', 'ninja-sato-life', 'chars.js'))
    for f in files:
        with open(f, encoding='utf-8') as fh:
            s |= set(fh.read())
    s |= set(chr(c) for c in range(0x20, 0x7F))          # 英数字・記号
    s |= set(chr(c) for c in range(0x3000, 0x3100))      # 和文の記号・ひらがな・カタカナ
    s |= set(chr(c) for c in range(0xFF01, 0xFF9F))      # 全角の英数字・半角カナ
    s |= set('―…←↑→↓−▶▼◀●★☆☰♪♫・「」『』【】〜ー！？、。')
    return ''.join(sorted(c for c in s if ord(c) >= 0x20))

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src = sys.argv[1]
    text = chars()
    tmp = os.path.join(GAME, 'fonts', '.chars.txt')
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(text)
    try:
        for w in (500, 700):
            out = os.path.join(GAME, 'fonts', 'zen-maru-gothic-game-%d.woff2' % w)
            subprocess.run(['pyftsubset', os.path.join(src, 'ZenMaruGothic-%d.ttf' % w), '--text-file=' + tmp, '--flavor=woff2',
                            '--output-file=' + out, '--layout-features=*', '--no-hinting'], check=True)
            print(out, os.path.getsize(out) // 1024, 'KB', len(text), '字')
    finally:
        os.remove(tmp)

if __name__ == '__main__':
    main()
