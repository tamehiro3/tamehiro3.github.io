#!/usr/bin/env node
/* 忍び足 — アプリのアイコンとスプラッシュを、shinobi-ashi/icons/ の絵から作って android/ と ios/ に入れる。
 *
 *   cd shinobi-ashi/app
 *   npm install --no-save sharp@0.34.4     # 画像の縮小に使う（package.json には入れない）
 *   node scripts/make-icons.mjs
 *
 * 元の絵（絵担当の tools/build_icons.mjs が作る）:
 *   icons/icon-1024.png             … 全面の絵（iOS のアイコン・Android の古い形のアイコン）
 *   icons/icon-foreground-1024.png  … Android のアダプティブアイコンの前景（透明の上に前景。中央 66% の安全域に収めてある）
 *   icons/icon-background-1024.png  … Android のアダプティブアイコンの背景
 *   icons/splash-2732.png           … スプラッシュ（前景は中央。端末の縦横比で四方を切る）
 *
 * `npx @capacitor/assets generate` を使わないわけ: あの道具はアダプティブアイコンの前景と背景に 16.7% の inset を
 * 足すので、すでに安全域に収めてある前景がさらに小さくなる。ここではアダプティブアイコンを 108dp の
 * 全面の絵として置き、inset なしの XML にする。インターネットには何も送らない（手元の画像を縮めるだけ）。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require(process.env.SHARP_PATH || 'sharp'); } catch (e) {
  console.error('sharp が見つかりません。先に `npm install --no-save sharp@0.34.4` を実行してください。');
  process.exit(1);
}

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.resolve(APP, '..', 'icons');
const RES = path.join(APP, 'android', 'app', 'src', 'main', 'res');
const XC = path.join(APP, 'ios', 'App', 'App', 'Assets.xcassets');
const src = (f) => {
  const p = path.join(ICONS, f);
  if (!fs.existsSync(p)) { console.error('見つかりません: ' + p + '（絵担当の tools/build_icons.mjs で作る）'); process.exit(1); }
  return p;
};
const ICON = src('icon-1024.png'), FG = src('icon-foreground-1024.png'), BG = src('icon-background-1024.png'), SPLASH = src('splash-2732.png');

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH_PORT = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
const out = [];
async function write(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await img.png({ compressionLevel: 9 }).toFile(file);
  out.push(path.relative(APP, file));
}
function circle(px) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`);
}

/* ---------- Android ---------- */
for (const [d, k] of Object.entries(DENS)) {
  const legacy = Math.round(48 * k), adaptive = Math.round(108 * k);
  const dir = path.join(RES, 'mipmap-' + d);
  await write(sharp(ICON).resize(legacy, legacy), path.join(dir, 'ic_launcher.png'));
  await write(sharp(ICON).resize(legacy, legacy).ensureAlpha().composite([{ input: circle(legacy), blend: 'dest-in' }]), path.join(dir, 'ic_launcher_round.png'));
  await write(sharp(FG).resize(adaptive, adaptive), path.join(dir, 'ic_launcher_foreground.png'));
  await write(sharp(BG).resize(adaptive, adaptive).removeAlpha(), path.join(dir, 'ic_launcher_background.png'));
  const [w, h] = SPLASH_PORT[d];
  await write(sharp(SPLASH).resize(w, h, { fit: 'cover' }).removeAlpha(), path.join(RES, 'drawable-port-' + d, 'splash.png'));
  await write(sharp(SPLASH).resize(h, w, { fit: 'cover' }).removeAlpha(), path.join(RES, 'drawable-land-' + d, 'splash.png'));
}
await write(sharp(SPLASH).resize(480, 320, { fit: 'cover' }).removeAlpha(), path.join(RES, 'drawable', 'splash.png'));
const ADAPTIVE = `<?xml version="1.0" encoding="utf-8"?>
<!-- 忍び足のアイコン（app/scripts/make-icons.mjs が書く）。前景は絵の側で中央 66% の安全域に収めてあるので inset は付けない -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const p = path.join(RES, 'mipmap-anydpi-v26', f);
  fs.writeFileSync(p, ADAPTIVE);
  out.push(path.relative(APP, p));
}
// Capacitor の既定のロゴ（ベクター）はもう使わないので消す
for (const f of [path.join(RES, 'drawable-v24', 'ic_launcher_foreground.xml'), path.join(RES, 'drawable', 'ic_launcher_background.xml')]) {
  if (fs.existsSync(f)) { fs.rmSync(f); out.push('（消した）' + path.relative(APP, f)); }
}

/* ---------- iOS（透明なし。App Store はアイコンの透明を受け付けない） ---------- */
await write(sharp(ICON).resize(1024, 1024).flatten({ background: '#14263f' }).removeAlpha(), path.join(XC, 'AppIcon.appiconset', 'AppIcon-512@2x.png'));
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await write(sharp(SPLASH).resize(2732, 2732).removeAlpha(), path.join(XC, 'Splash.imageset', f));
}

console.log(out.join('\n'));
console.log(`\n${out.length} 件を書きました。Android Studio / Xcode で開き直すと反映されます。`);
