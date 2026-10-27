// 忍び足 — 見せ合い QR・書き出し・診断（share.js と vendor/）のテスト。
//   node shinobi-ashi/tools/test_share.mjs            … Node だけで（ブラウザの部も、Playwright があれば続けて走る）
//   node shinobi-ashi/tools/test_share.mjs --no-browser … Node の部だけ
// docs/SPEC.md の 2.5 を確かめる。SA.Rules がなくても試せるように、前半は state を手で作る。後半で rules.js と合わせる。
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js'));
const CH = require(path.join(ROOT, 'chars.js'));
const S = require(path.join(ROOT, 'share.js'));
const qrcode = require(path.join(ROOT, 'vendor/qrcode.js'));
const jsQR = require(path.join(ROOT, 'vendor/jsQR.js'));
const C = D.CONFIG;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  NG: ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + (A === B ? '' : '  (' + A + ' != ' + B + ')')); }
function section(t) { console.log('■ ' + t); }

const IDS = CH.CHARS.map(c => c.id);
const DYES = D.DYES.map(d => d.id);
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const QR_ALNUM = /^[0-9A-Z $%*+\-./:]+$/;
// 決まった乱数（毎回同じ）
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function ri(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }

/* ---------- 1. ライブラリ ---------- */
section('vendor/ のライブラリ');
ok(typeof qrcode === 'function', 'vendor/qrcode.js が qrcode 関数を出す');
ok(typeof jsQR === 'function', 'vendor/jsQR.js が jsQR 関数を出す');
{
  const qsrc = fs.readFileSync(path.join(ROOT, 'vendor/qrcode.js'), 'utf8');
  const jsrc = fs.readFileSync(path.join(ROOT, 'vendor/jsQR.js'), 'utf8');
  ok(/^var qrcode = function\(\)/m.test(qsrc), 'qrcode.js はブラウザでグローバル qrcode になる形');
  ok(/root\["jsQR"\] = factory\(\)/.test(jsrc), 'jsQR.js はブラウザでグローバル jsQR になる形');
  for (const [n, src] of [['qrcode.js', qsrc], ['jsQR.js', jsrc], ['share.js', fs.readFileSync(path.join(ROOT, 'share.js'), 'utf8')]]) {
    ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts|\beval\s*\(|new Function\s*\(/.test(src), n + ' に通信・eval がない');
  }
  const lic = fs.readFileSync(path.join(ROOT, 'vendor/LICENSES.md'), 'utf8');
  ok(/qrcode-generator/.test(lic) && /2\.0\.4/.test(lic) && /Permission is hereby granted, free of charge/.test(lic), 'LICENSES.md に qrcode-generator の版と MIT 全文');
  ok(/jsQR/.test(lic) && /1\.4\.0/.test(lic) && /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/.test(lic) && /END OF TERMS AND CONDITIONS/.test(lic), 'LICENSES.md に jsQR の版と Apache-2.0 全文');
  ok(/registry\.npmjs\.org\/qrcode-generator/.test(lic) && /registry\.npmjs\.org\/jsqr/.test(lic), 'LICENSES.md に取得元');
}

/* ---------- 2. CRC32・UTF-8 ---------- */
section('CRC32（IEEE）と UTF-8');
eq(S.crc32([]), 0, 'CRC32("") = 0');
eq(S.crc32Text('123456789').toString(16), 'cbf43926', 'CRC32("123456789") = cbf43926');
eq(S.crc32Text('The quick brown fox jumps over the lazy dog').toString(16), '414fa339', 'CRC32(quick brown fox) = 414fa339');
for (const t of ['忍び足', '{忍|しの}び{足|あし}', 'あ🐾い', 'aé€😀z', '\ud800x', 'x\udc00']) {
  eq(Array.from(S.utf8(t)), Array.from(Buffer.from(t, 'utf8')), 'UTF-8 が Buffer と同じ: ' + JSON.stringify(t));
  if (typeof zlib.crc32 === 'function') eq(S.crc32Text(t), zlib.crc32(Buffer.from(t, 'utf8')) >>> 0, 'CRC32 が zlib と同じ: ' + JSON.stringify(t));
}
{
  // TextEncoder がない古い端末の代わりの道（手書きの UTF-8）も同じ結果か
  const TE = globalThis.TextEncoder;
  globalThis.TextEncoder = undefined;
  try {
    for (const t of ['忍び足', 'あ🐾い', '\ud800x', 'x\udc00', 'abc']) eq(Array.from(S.utf8(t)), Array.from(Buffer.from(t, 'utf8')), 'TextEncoder なしの UTF-8: ' + JSON.stringify(t));
  } finally { globalThis.TextEncoder = TE; }
  if (typeof zlib.crc32 === 'function') {
    const buf = Buffer.alloc(4096); for (let i = 0; i < buf.length; i++) buf[i] = ri(0, 255);
    eq(S.crc32(buf), zlib.crc32(buf) >>> 0, 'CRC32（4KB のでたらめな列）が zlib と同じ');
  }
}

/* ---------- 3. Crockford Base32 ---------- */
section('Crockford Base32');
eq(S.b32encode([0xFF]), 'ZW', '0xFF → ZW');
eq(S.b32encode([0, 0, 0, 0, 0]), '00000000', '0×5 → 00000000');
eq(S.b32encode([0xFF, 0xFF, 0xFF, 0xFF, 0xFF]), 'ZZZZZZZZ', '0xFF×5 → ZZZZZZZZ');
eq(S.b32encode([0x00, 0x44, 0x32, 0x14, 0xC7]), '01234567', '5バイト → 8文字（ビットの並び）');
for (let k = 0; k < 300; k++) {
  const n = k < 40 ? k : ri(0, 40);
  const bytes = Array.from({ length: n }, () => ri(0, 255));
  const t = S.b32encode(bytes);
  if (!/^[0-9A-HJKMNP-TV-Z]*$/.test(t) || t.length !== Math.ceil(n * 8 / 5) || JSON.stringify(S.b32decode(t, n)) !== JSON.stringify(bytes)) { ok(false, 'Base32 往復 ' + JSON.stringify(bytes)); break; }
  if (k === 299) ok(true, 'Base32 往復 300通り');
}
ok([...B32].every(ch => QR_ALNUM.test(ch)), 'Base32 の32文字はすべて QR の英数字モードの文字');
ok(!/[ILOU]/.test(B32), 'Base32 に I L O U がない');
eq(S.b32decode('zw', 1), [0xFF], '小文字も読める');
eq(S.b32decode('O0', 1), S.b32decode('00', 1), 'O は 0 と読む');
eq(S.b32decode('1I', 1), S.b32decode('1L', 1), 'I と L は 1 と読む');
eq(S.b32decode('ZU', 1), null, 'U は誤り');
eq(S.b32decode('Z!', 1), null, '記号は誤り');
eq(S.b32decode('ZZ', 1), null, '埋めのビットが0でなければ誤り');

/* ---------- 4. 見せ合い QR の往復（すべての項目の境界値） ---------- */
section('見せ合い QR の往復（境界値）');
const BASE = { charIndex: 8, rank: 3, okugi: 0, shugyo: 123456, dyeIndex: 1, bond: 12, day: 299, station: 7, round: 1 };
function roundtrip(f, expect, msg) {
  const t = S.encodeFields(f);
  const r = S.decodeGuest(t);
  const okShape = typeof t === 'string' && t.length === 33 && t.startsWith('SA1-') && /^SA1-[0-9A-HJKMNP-TV-Z]{29}$/.test(t) && QR_ALNUM.test(t);
  if (!okShape) { ok(false, msg + ': 形が違う ' + t); return null; }
  if (!r.ok) { ok(false, msg + ': 解けない ' + r.reason); return null; }
  const e = Object.assign({}, f, expect || {});
  const p = r.payload;
  const got = { charIndex: p.charIndex, rank: p.rank, okugi: p.okugi, shugyo: p.shugyo, dyeIndex: p.dyeIndex, bond: p.bond, day: p.day, station: p.station, round: p.round };
  const want = { charIndex: e.charIndex, rank: e.rank, okugi: e.okugi, shugyo: e.shugyo, dyeIndex: e.dyeIndex, bond: e.bond, day: e.day, station: e.station, round: e.round };
  eq(got, want, msg);
  ok(p.id === IDS[want.charIndex] && p.dye === DYES[want.dyeIndex] && p.v === 1, msg + '（id・染めの名・版）');
  return t;
}
const cases = [];
for (let ci = 0; ci < IDS.length; ci++) cases.push([{ charIndex: ci }, null, 'charIndex ' + ci + '（' + IDS[ci] + '）']);
for (let r = 0; r <= 5; r++) for (let o = 0; o <= 2; o++) cases.push([{ rank: r, okugi: o }, null, 'rank ' + r + ' okugi ' + o]);
for (const v of [0, 1, 255, 256, 65535, 65536, 16500, 900000, 1150000, 1500000, 16777215, 16777216, 2147483647, 2147483648, 4294967294, 4294967295]) cases.push([{ shugyo: v }, null, 'shugyo ' + v]);
for (let d = 0; d < DYES.length; d++) cases.push([{ dyeIndex: d }, null, 'dye ' + DYES[d]]);
for (const v of [0, 1, 127, 128, 254, 255]) cases.push([{ bond: v }, null, 'bond ' + v]);
for (const v of [0, 1, 255, 256, 299, 365, 32767, 32768, 65534, 65535]) cases.push([{ day: v }, null, 'day ' + v]);
for (let st = 0; st <= 50; st++) for (const rd of [1, 2]) cases.push([{ station: st, round: rd }, null, 'station ' + st + ' round ' + rd]);
// 範囲の外は端で止める（頭打ち）
cases.push([{ bond: 256 }, { bond: 255 }, 'bond 256 → 255（頭打ち）']);
cases.push([{ bond: 9999 }, { bond: 255 }, 'bond 9999 → 255']);
cases.push([{ bond: -1 }, { bond: 0 }, 'bond -1 → 0']);
cases.push([{ shugyo: 4294967296 }, { shugyo: 4294967295 }, 'shugyo 2^32 → 2^32-1']);
cases.push([{ shugyo: -5 }, { shugyo: 0 }, 'shugyo -5 → 0']);
cases.push([{ shugyo: 1.9 }, { shugyo: 1 }, 'shugyo 1.9 → 1']);
cases.push([{ rank: 9 }, { rank: 5 }, 'rank 9 → 5']);
cases.push([{ okugi: 7 }, { okugi: 2 }, 'okugi 7 → 2']);
cases.push([{ day: 70000 }, { day: 65535 }, 'day 70000 → 65535']);
cases.push([{ day: -3 }, { day: 0 }, 'day -3 → 0']);
cases.push([{ station: 51 }, { station: 50 }, 'station 51 → 50']);
cases.push([{ round: 3 }, { round: 1 }, 'round 3 → 1']);
cases.push([{ charIndex: 39 }, { charIndex: 38 }, 'charIndex 39 → 38']);
cases.push([{ dyeIndex: 99 }, { dyeIndex: DYES.length - 1 }, 'dye 99 → 最後']);
cases.push([{ charIndex: 0, rank: 0, okugi: 0, shugyo: 0, dyeIndex: 0, bond: 0, day: 0, station: 0, round: 1 }, null, 'すべて最小']);
cases.push([{ charIndex: 38, rank: 5, okugi: 2, shugyo: 4294967295, dyeIndex: DYES.length - 1, bond: 255, day: 65535, station: 50, round: 2 }, null, 'すべて最大']);
const texts = [];
for (const [f, e, m] of cases) { const t = roundtrip(Object.assign({}, BASE, f), e, m); if (t) texts.push(t); }
for (let k = 0; k < 200; k++) {
  const f = { charIndex: ri(0, 38), rank: ri(0, 5), okugi: ri(0, 2), shugyo: ri(0, 4294967295), dyeIndex: ri(0, DYES.length - 1), bond: ri(0, 255), day: ri(0, 65535), station: ri(0, 50), round: ri(1, 2) };
  const t = roundtrip(f, null, 'でたらめ ' + k);
  if (t && k < 30) texts.push(t);
}
eq(S.dayIndex('2026-01-01'), 0, '2026-01-01 は0日目');
eq(S.dayIndex('2026-10-27'), 299, '2026-10-27 は299日目');
eq(S.dayIndex('2025-12-31'), 0, '起点より前は0');
eq(S.dateOfDay(299), '2026-10-27', '299日目は 2026-10-27');
eq(S.dateOfDay(365), '2027-01-01', '365日目は 2027-01-01');
eq(S.dayIndex(S.dateOfDay(65535)), 65535, '65535日目の往復');

/* ---------- 5. state から作る（手で作った state） ---------- */
section('encodeGuest（手で作った state）');
function handState() {
  return {
    app: 'shinobi-ashi', v: 1, createdAt: '2026-10-01', mode: 'kodomo', goal: 10000, mainId: 'anne', route: 'sim', furigana: true,
    slots: ['anne', 'sakuya', null], alloc: [70, 30, 0],
    chars: {
      anne: { joined: '2026-10-01', shugyo: 912345, rank: 5, okugi: 0, bond: 300, dye: 'shu', lastBondDate: '2026-10-26' },
      sakuya: { joined: '2026-10-05', shugyo: 1500000, rank: 5, okugi: 2, bond: 41, dye: 'kin', lastBondDate: null },
      sasagane: { joined: '2026-10-20', shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null }
    },
    visits: 2, foundIds: [], jin: { shadow: false, revealed: false },
    visitTotal: 40000, roadTotal: 40000, hideTotal: 0, searches: 0, scrolls: 40, scrollsOpened: 3,
    stationsReached: 0, round: 1, diary: [{ date: '2026-10-10', idx: 1, stamp: 3 }],
    dyes: ['none', 'ai', 'shu'], lastDyeDate: null,
    daily: {
      '2026-10-25': { shugyo: 16500, rejected: 1200, capped: true, goal: true, home: false, family: true, src: 'sim', opens: 3, walkBlocks: 1, aff: { anne: true }, alloc: { anne: 16500 } },
      '2026-10-26': { shugyo: 2500, rejected: 0, capped: false, goal: false, home: true, family: false, src: 'sim', opens: 1, walkBlocks: 0, aff: {}, alloc: { anne: 2500 } }
    },
    recent: { '2026-10-25': 17700, '2026-10-26': 2500 },
    board: [], guests: [], lastSync: '2026-10-26T09:00:00.000Z', lastSyncDate: '2026-10-26',
    settings: { homeButton: true, familyButton: true, notify: { evening: '18:30', on: true }, showSecretNames: false, sound: true }
  };
}
{
  const st = handState();
  for (const [reached, idx, round] of [[0, 0, 1], [1, 1, 1], [17, 17, 1], [50, 50, 1], [51, 49, 2], [99, 1, 2], [100, 0, 2]]) {
    st.stationsReached = reached;
    const r = S.decodeGuest(S.encodeGuest(st, 'anne', { today: '2026-10-27' }));
    ok(r.ok && r.payload.station === idx && r.payload.round === round, '着いた宿場の数 ' + reached + ' → 宿場 ' + idx + '・' + round + '巡目');
  }
  st.stationsReached = 21;
  const a = S.decodeGuest(S.encodeGuest(st, 'anne', { today: '2026-10-27' })).payload;
  eq([a.id, a.charIndex, a.rank, a.okugi, a.shugyo, a.dye, a.bond, a.date, a.station, a.round], ['anne', 8, 5, 0, 912345, 'shu', 255, '2026-10-27', 21, 1], '餡音（絆300は255で頭打ち）');
  const b = S.decodeGuest(S.encodeGuest(st, 'sakuya', { today: '2026-12-31' })).payload;
  eq([b.id, b.rank, b.okugi, b.shugyo, b.dye, b.date], ['sakuya', 5, 2, 1500000, 'kin', '2026-12-31'], '咲耶（奥義2・金）');
  const c = S.decodeGuest(S.encodeGuest(st, 'sasagane', { today: '2026-01-01' })).payload;
  eq([c.charIndex, c.shugyo, c.dye, c.day], [38, 0, 'none', 0], '笹金（最後の番号・修行値0）');
  eq(S.encodeGuest(st, 'jin', { today: '2026-10-27' }), null, 'まだ来ていない体は null');
  eq(S.encodeGuest(st, 'nobody', { today: '2026-10-27' }), null, '知らない体は null');
  eq(S.encodeGuest(null, 'anne'), null, 'state がなければ null');
  st.chars.anne.dye = 'mystery';
  eq(S.decodeGuest(S.encodeGuest(st, 'anne', { today: '2026-10-27' })).payload.dye, 'none', '知らない染めは「もとの色」');
  const t = S.encodeGuest(st, 'anne');
  ok(S.decodeGuest(t).ok, '今日を渡さなくても作れる（端末の今日）');
  // 名前・歩数・識別子が入っていないこと（18バイトの中身はこれだけ）
  const bytes = S.b32decode(t.slice(4), 18);
  eq(bytes.length, 18, '中身は18バイト');
  eq(bytes[13], 0, '予備は0');
}

/* ---------- 6. 改ざん・版違い・文字の欠け ---------- */
section('改ざんの検出');
{
  const t = S.encodeFields(BASE);
  let caught = 0, total = 0, okButWrong = 0;
  for (let i = 4; i < t.length; i++) {
    for (const ch of B32) {
      if (ch === t[i]) continue;
      total++;
      const u = t.slice(0, i) + ch + t.slice(i + 1);
      const r = S.decodeGuest(u);
      if (!r.ok) caught++; else okButWrong++;
    }
  }
  eq([caught, okButWrong], [total, 0], '1文字の書きかえ ' + total + ' 通りをすべて見つける');
  let swaps = 0, swapCaught = 0;
  for (let i = 4; i < t.length - 1; i++) {
    if (t[i] === t[i + 1]) continue;
    swaps++;
    const u = t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2);
    if (!S.decodeGuest(u).ok) swapCaught++;
  }
  eq(swapCaught, swaps, '隣どうしの入れかえ ' + swaps + ' 通りをすべて見つける');
  // バイトを書きかえて（CRC はそのまま）文字にする
  const b = S.packGuest(BASE);
  let byteCaught = 0;
  for (let i = 0; i < 18; i++) for (let bit = 0; bit < 8; bit++) {
    const x = b.slice(); x[i] ^= 1 << bit;
    const r = S.decodeGuest('SA1-' + S.b32encode(x));
    if (!r.ok) byteCaught++;
  }
  eq(byteCaught, 144, '1ビットの書きかえ 144 通りをすべて見つける');
  const x = b.slice(); x[6] ^= 0xff;
  eq(S.decodeGuest('SA1-' + S.b32encode(x)).reason, 'crc', '修行値を書きかえると crc');
  const y = b.slice(); y[17] ^= 1;
  eq(S.decodeGuest('SA1-' + S.b32encode(y)).reason, 'crc', 'CRC を書きかえると crc');
}
section('版違い');
{
  const t = S.encodeFields(BASE);
  eq(S.decodeGuest('SA2-' + t.slice(4)).reason, 'version', '先頭 SA2- は version');
  eq(S.decodeGuest('SA0-' + t.slice(4)).reason, 'version', '先頭 SA0- は version');
  eq(S.decodeGuest('SA10-' + t.slice(4)).reason, 'version', '先頭 SA10- は version');
  // 中身の版が2で、CRC は正しく作り直したもの
  const b = S.packGuest(BASE); b[0] = 2;
  const c = S.crc32(b, 0, 14); b[14] = c >>> 24 & 255; b[15] = c >>> 16 & 255; b[16] = c >>> 8 & 255; b[17] = c & 255;
  eq(S.decodeGuest('SA1-' + S.b32encode(b)).reason, 'version', '中身の版が2なら version');
}
section('文字の欠け・形の違い');
{
  const t = S.encodeFields(BASE);
  for (let n = 1; n <= 29; n++) { const r = S.decodeGuest(t.slice(0, t.length - n)); if (r.ok || r.reason !== 'length') { ok(false, '終わりが ' + n + ' 文字欠けると length（' + r.reason + '）'); break; } if (n === 29) ok(true, '終わりが 1〜29 文字欠けるとすべて length'); }
  let mid = 0;
  for (let i = 4; i < t.length; i++) { const r = S.decodeGuest(t.slice(0, i) + t.slice(i + 1)); if (!r.ok && r.reason === 'length') mid++; }
  eq(mid, 29, '途中の1文字が欠けるとすべて length');
  eq(S.decodeGuest(t + '0').reason, 'length', '1文字多いと length');
  eq(S.decodeGuest(t.slice(0, 3)).reason, 'prefix', '先頭が欠けると prefix');
  eq(S.decodeGuest(t.slice(4)).reason, 'prefix', '先頭 SA1- がないと prefix');
  eq(S.decodeGuest('').reason, 'empty', '空は empty');
  eq(S.decodeGuest('   ').reason, 'empty', '空白だけは empty');
  eq(S.decodeGuest(null).reason, 'empty', 'null は empty');
  eq(S.decodeGuest(12345).reason, 'empty', '数は empty');
  eq(S.decodeGuest('https://example.com/').reason, 'prefix', 'ほかの QR（URL）は prefix');
  eq(S.decodeGuest(t.slice(0, 10) + 'U' + t.slice(11)).reason, 'chars', 'U が入ると chars');
  eq(S.decodeGuest(t.slice(0, 10) + '*' + t.slice(11)).reason, 'chars', '記号が入ると chars');
  ok(S.decodeGuest(t.toLowerCase()).ok, '小文字でも読める');
  ok(S.decodeGuest('  ' + t + '\n').ok, '前後の空白・改行は無視');
  ok(S.decodeGuest('SA1-' + t.slice(4).replace(/0/g, 'O')).ok, '0 を O と書いても読める');
  ok(S.decodeGuest('SA1-' + t.slice(4).replace(/1/g, 'I')).ok, '1 を I と書いても読める');
  ok(S.decodeGuest('SA1-' + t.slice(4).replace(/1/g, 'l')).ok, '1 を l と書いても読める');
}
section('値の範囲（CRC は正しいがおかしな中身）');
{
  function forge(mut) {
    const b = S.packGuest(BASE); mut(b);
    const c = S.crc32(b, 0, 14); b[14] = c >>> 24 & 255; b[15] = c >>> 16 & 255; b[16] = c >>> 8 & 255; b[17] = c & 255;
    return S.decodeGuest('SA1-' + S.b32encode(b));
  }
  eq(forge(b => { b[1] = 39; }).reason, 'range', 'charIndex 39');
  eq(forge(b => { b[1] = 255; }).reason, 'range', 'charIndex 255');
  eq(forge(b => { b[2] = 6; }).reason, 'range', 'rank 6');
  eq(forge(b => { b[2] = 3 << 3; }).reason, 'range', 'okugi 3');
  eq(forge(b => { b[2] = 0x80; }).reason, 'range', '位の欄の上のビット');
  eq(forge(b => { b[7] = DYES.length; }).reason, 'range', '染めの番号が多すぎる');
  eq(forge(b => { b[11] = 51; }).reason, 'range', '宿場 51');
  eq(forge(b => { b[12] = 0; }).reason, 'range', '周回 0');
  eq(forge(b => { b[12] = 3; }).reason, 'range', '周回 3');
  eq(forge(b => { b[13] = 1; }).reason, 'range', '予備が0でない');
  ok(forge(b => { b[8] = 255; }).ok, '絆 255 はよい');
}

/* ---------- 7. QR（英数字モード・SVG・jsQR で読み戻す） ---------- */
section('QR の英数字モード');
{
  const t = S.encodeFields(BASE);
  ok(QR_ALNUM.test(t), '中身の文字は QR の英数字モードの文字だけ');
  const m = S.qrMatrix(t);
  eq(m.size, 25, '33文字・誤り訂正 M で型番2（25×25）に収まる（バイトモードなら型番3＝29×29）');
  const qb = qrcode(0, 'M'); qb.addData(t, 'Byte'); qb.make();
  eq(qb.getModuleCount(), 29, '比べ: バイトモードだと 29×29');
  for (const tt of texts) { if (S.qrMatrix(tt).size !== 25) { ok(false, '型番2に収まらない ' + tt); break; } }
  ok(true, '試した ' + texts.length + ' 通りすべて 25×25');
}
// 行列を RGBA の画にする（scale 画素／1マス、余白 quiet マス）
function rgbaOf(size, dark, scale = 4, quiet = 4, invert = false) {
  const full = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(full * full * 4);
  for (let y = 0; y < full; y++) for (let x = 0; x < full; x++) {
    const r = Math.floor(y / scale) - quiet, c = Math.floor(x / scale) - quiet;
    let k = r >= 0 && c >= 0 && r < size && c < size && dark(r, c);
    if (invert) k = !k;
    const v = k ? 0 : 255, i = (y * full + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: full, height: full };
}
// qrSvg の path（M x y h n v1 h-n z）を読んで、マスの行列に戻す
function matrixOfSvg(svg) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const full = +vb[1], grid = Array.from({ length: full }, () => new Array(full).fill(false));
  const d = /<path fill="#000000" d="([^"]*)"/.exec(svg)[1];
  const re = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g; let m, count = 0, len = 0;
  while ((m = re.exec(d))) { count++; len += m[0].length; for (let k = 0; k < +m[3]; k++) grid[+m[2]][+m[1] + k] = true; }
  return { full, grid, wellFormed: len === d.length && count > 0 };
}
section('qrcode-generator → RGBA → jsQR で読み戻す');
{
  let good = 0, alnum = 0;
  for (const t of texts) {
    const qr = qrcode(0, 'M'); qr.addData(t, 'Alphanumeric'); qr.make();
    const n = qr.getModuleCount();
    const img = rgbaOf(n, (r, c) => qr.isDark(r, c));
    const res = jsQR(img.data, img.width, img.height);
    if (res && res.data === t) good++;
    if (res && res.chunks && res.chunks.length && res.chunks.every(ch => ch.type === 'alphanumeric')) alnum++;
  }
  eq(good, texts.length, 'jsQR で ' + texts.length + ' 通りを読み戻せる');
  eq(alnum, texts.length, 'jsQR が英数字モードと判定する');
  const t = texts[0];
  const qr = qrcode(0, 'M'); qr.addData(t, 'Alphanumeric'); qr.make();
  const n = qr.getModuleCount();
  for (const scale of [2, 3, 6, 10]) {
    const img = rgbaOf(n, (r, c) => qr.isDark(r, c), scale);
    eq(S.readRGBA(img.data, img.width, img.height), t, 'readRGBA（1マス ' + scale + ' 画素）');
  }
  const inv = rgbaOf(n, (r, c) => qr.isDark(r, c), 4, 4, true);
  eq(S.readRGBA(inv.data, inv.width, inv.height), t, '白黒反転の画も readRGBA（attemptBoth）で読める');
  const blank = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  eq(S.readRGBA(blank, 100, 100), null, '真っ白な画は null');
  eq(S.readRGBA(blank, 0, 0), null, '大きさ0は null');
}
section('qrSvg（誤り訂正 M・余白4・黒白だけ・viewBox）');
{
  for (const t of texts.slice(0, 40)) {
    const svg = S.qrSvg(t, 240);
    const okHead = svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 33 33"');
    const colors = (svg.match(/#[0-9a-fA-F]{3,8}/g) || []).filter((v, i, a) => a.indexOf(v) === i).sort();
    const g = matrixOfSvg(svg);
    let quietOk = true;
    for (let r = 0; r < g.full; r++) for (let c = 0; c < g.full; c++) if ((r < 4 || c < 4 || r >= g.full - 4 || c >= g.full - 4) && g.grid[r][c]) quietOk = false;
    const img = rgbaOf(g.full, (r, c) => g.grid[r][c], 4, 0);
    const res = jsQR(img.data, img.width, img.height);
    if (!(okHead && JSON.stringify(colors) === '["#000000","#ffffff"]' && g.wellFormed && quietOk && res && res.data === t && !/<script|href|xlink|url\(/i.test(svg))) {
      ok(false, 'qrSvg の形と読み戻し ' + t + ' ' + JSON.stringify({ okHead, colors, wf: g.wellFormed, quietOk, data: res && res.data }));
      break;
    }
  }
  ok(true, 'qrSvg 40通り: 33×33 の viewBox（25＋余白4×2）・黒白だけ・余白に黒なし・jsQR で読める');
  ok(/width="256" height="256"/.test(S.qrSvg(texts[0])), '大きさを渡さなければ 256');
  // 誤り訂正 M: 型式情報（左上の15ビット）を読んで M（01）か確かめる
  const svg = S.qrSvg(texts[0], 100), g = matrixOfSvg(svg);
  const q = 4, bit = (r, c) => g.grid[r + q][c + q] ? 1 : 0;
  const seq = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  let v = 0; for (const [r, c] of seq) v = (v << 1) | bit(r, c);
  v ^= 0x5412;
  eq((v >> 13) & 3, 0, '型式情報の誤り訂正レベルが M（00 は M）');
}

/* ---------- 8. 書き出し・読み込み（手で作った state） ---------- */
section('書き出し・読み込み（rules.js なし）');
{
  const st = handState();
  st.diary.push({ date: '2026-10-26', idx: 2, stamp: '{楽|たの}しい🐾' });   // 日本語と絵文字（UTF-8 の4バイト）
  const now = new Date(2026, 9, 27, 21, 5, 0);
  const f = S.exportFile(st, { now });
  eq(f.name, 'shinobi-ashi-20261027.json', '名前は shinobi-ashi-YYYYMMDD.json');
  const w = JSON.parse(f.text);
  eq(Object.keys(w), ['app', 'v', 'exportedAt', 'crc32', 'state'], '包みの形 {app, v, exportedAt, crc32, state}');
  eq([w.app, w.v, w.exportedAt], ['shinobi-ashi', 1, now.toISOString()], 'app・v・exportedAt');
  ok(/^[0-9a-f]{8}$/.test(w.crc32), 'crc32 は8桁の16進');
  eq(parseInt(w.crc32, 16), (typeof zlib.crc32 === 'function' ? zlib.crc32(Buffer.from(JSON.stringify(st), 'utf8')) : S.crc32Text(JSON.stringify(st))) >>> 0, 'crc32 は JSON.stringify(state) の UTF-8 に対するもの');
  eq(w.state.recent, st.recent, '直近7日の歩数も入る');
  const r = S.importFile(f.text);
  ok(r.ok, '読み込める');
  eq(r.state, st, '往復で state がそのまま');
  eq(r.exportedAt, now.toISOString(), 'exportedAt が返る');
  ok(S.importFile(JSON.stringify(w)).ok, '詰めて書き直しても読める（空白の違いは関係ない）');
  ok(S.importFile('﻿' + f.text).ok, '先頭の BOM は無視');
  ok(S.importFile(f.text.replace(/\n/g, '\r\n')).ok, '改行が CRLF でも読める');
  // 改ざん
  const t1 = JSON.parse(f.text); t1.state.visitTotal += 1;
  eq(S.importFile(JSON.stringify(t1)).reason, 'crc', '数をひとつ書きかえると crc');
  const t2 = JSON.parse(f.text); t2.state.chars.anne.shugyo = 9999999;
  eq(S.importFile(JSON.stringify(t2)).reason, 'crc', '修行値を書きかえると crc');
  const t3 = JSON.parse(f.text); t3.crc32 = '00000000';
  eq(S.importFile(JSON.stringify(t3)).reason, 'crc', 'crc32 を書きかえると crc');
  const t4 = JSON.parse(f.text); t4.state.diary[1].stamp = '{楽|たの}しい🐾!';
  eq(S.importFile(JSON.stringify(t4)).reason, 'crc', '文字を1つ足すと crc');
  const t5 = JSON.parse(f.text); t5.crc32 = t5.crc32.toUpperCase();
  ok(S.importFile(JSON.stringify(t5)).ok, 'crc32 の大文字・小文字は問わない');
  // 版・形の違い
  const t6 = JSON.parse(f.text); t6.v = 2;
  eq(S.importFile(JSON.stringify(t6)).reason, 'version', '包みの版が2なら version');
  const t7 = JSON.parse(f.text); t7.state.v = 2; t7.crc32 = S.crc32Text(JSON.stringify(t7.state)).toString(16).padStart(8, '0');
  eq(S.importFile(JSON.stringify(t7)).reason, 'version', '中の state の版が2なら version');
  const t8 = JSON.parse(f.text); t8.app = 'ninja-sato-life';
  eq(S.importFile(JSON.stringify(t8)).reason, 'app', 'ほかのアプリのファイルは app');
  const t9 = JSON.parse(f.text); delete t9.state;
  eq(S.importFile(JSON.stringify(t9)).reason, 'format', 'state がないと format');
  const t10 = JSON.parse(f.text); delete t10.crc32;
  eq(S.importFile(JSON.stringify(t10)).reason, 'format', 'crc32 がないと format');
  const t11 = JSON.parse(f.text); delete t11.v;
  eq(S.importFile(JSON.stringify(t11)).reason, 'format', 'v がないと format');
  eq(S.importFile(f.text.slice(0, f.text.length - 20)).reason, 'json', '途中で切れたファイルは json');
  eq(S.importFile('').reason, 'empty', '空は empty');
  eq(S.importFile(null).reason, 'empty', 'null は empty');
  eq(S.importFile('[]').reason, 'format', '配列は format');
  eq(S.importFile('"x"').reason, 'format', '文字だけは format');
  eq(S.importFile(' '.repeat(5 * 1024 * 1024 + 1)).reason, 'tooLarge', '5MB を超えると tooLarge');
}

/* ---------- 9. 診断ファイル（rules.js なし） ---------- */
section('診断ファイル（rules.js なし）');
{
  const st = handState();
  st.daily['bad-key'] = { shugyo: 1 };
  const f = S.diagnosticsFile(st, { now: new Date(2026, 9, 27) });
  eq(f.name, 'shinobi-ashi-diag-20261027.csv', '名前');
  const lines = f.text.split('\r\n');
  eq(lines[0], 'date,shugyo,rejected,capped,goal,home,family,opens,walkBlocks', '見出しは9項目');
  eq(lines[1], '2026-10-25,16500,1200,1,1,0,1,3,1', '1日目');
  eq(lines[2], '2026-10-26,2500,0,0,0,1,0,1,0', '2日目');
  eq(lines.length, 4, '日付でない鍵は入れない（最後は改行）');
  ok(lines.slice(0, 3).every(l => l.split(',').length === 9), 'どの行も9項目');
  ok(!/17700|anne|sim/.test(f.text), '歩数そのもの・相棒・経路は入れない');
  eq(S.diagnosticsFile({ daily: {} }).text, 'date,shugyo,rejected,capped,goal,home,family,opens,walkBlocks\r\n', '記録がなければ見出しだけ');
}

/* ---------- 10. 保存（Node・アプリのまね） ---------- */
section('saveText');
{
  const r0 = await S.saveText('a.json', '{}');
  eq(r0, { ok: false, reason: 'noDownload' }, 'Node（画面なし）では noDownload');
  const calls = [];
  const fake = (shareImpl) => ({
    isNativePlatform: () => true, getPlatform: () => 'android',
    Plugins: {
      Filesystem: { writeFile: async (o) => { calls.push(['write', o]); return { uri: 'file:///cache/' + o.path }; } },
      Share: { share: async (o) => { calls.push(['share', o]); return shareImpl(o); } }
    }
  });
  globalThis.Capacitor = fake(() => ({}));
  try {
    const r1 = await S.saveText('shinobi-ashi-20261027.json', '{"a":1}');
    eq(r1, { ok: true, via: 'share', uri: 'file:///cache/shinobi-ashi-20261027.json' }, 'アプリ: ファイルに書いて共有シート');
    eq(calls[0], ['write', { path: 'shinobi-ashi-20261027.json', data: '{"a":1}', directory: 'CACHE', encoding: 'utf8', recursive: true }], 'Filesystem.writeFile の引数（キャッシュのフォルダ・UTF-8）');
    eq(calls[1][1].files, ['file:///cache/shinobi-ashi-20261027.json'], 'Share.share に files');
    calls.length = 0;
    globalThis.Capacitor = fake(() => { throw new Error('Share canceled'); });
    eq((await S.saveText('x.csv', 'a')).reason, 'canceled', '共有をやめたら canceled');
    calls.length = 0;
    let n = 0;
    globalThis.Capacitor = fake((o) => { n++; if (o.files) throw new Error('files not supported'); return {}; });
    const r3 = await S.saveText('x.csv', 'a');
    ok(r3.ok && r3.via === 'share' && n === 2, 'files が使えない共有プラグインには url でもう一度');
    globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    eq((await S.saveText('x.csv', 'a')).reason, 'noFilesystem', 'Filesystem がなければ noFilesystem');
    globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: async () => { throw new Error('disk'); } } } };
    eq((await S.saveText('x.csv', 'a')).reason, 'writeFailed', '書けなければ writeFailed');
    globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: async (o) => ({ uri: 'file:///c/' + o.path }) } } };
    eq(await S.saveText('../../etc/x y.csv', 'a'), { ok: true, via: 'file', uri: 'file:///c/_.._etc_x_y.csv' }, '共有がなければファイルだけ。名前の / や空白は _ に、先頭の . は取る');
  } finally { delete globalThis.Capacitor; }
}
section('言葉（ふりがな書式）');
{
  const all = Object.values(S.MESSAGES).join('');
  const bare = all.replace(/\{[^|{}]+\|[^|{}]+\}/g, '');
  ok(!/[一-鿿]/.test(bare), 'MESSAGES の漢字はすべて {漢字|かな}');
  ok(!/[{}|]/.test(bare), 'MESSAGES に書式の残りがない');
  for (const r of ['empty', 'prefix', 'version', 'length', 'chars', 'crc', 'range', 'noCamera', 'denied', 'busy', 'insecure', 'noLib', 'hidden', 'tooLarge', 'json', 'app', 'format', 'invalid', 'unsupported', 'canceled', 'noFilesystem', 'writeFailed', 'noDownload', 'downloadFailed', 'notFound']) ok(typeof S.MESSAGES[r] === 'string', 'MESSAGES.' + r);
  eq(S.message('???'), S.MESSAGES.error, '知らない理由は error の言葉');
  eq([S.cameraReason({ name: 'NotAllowedError' }), S.cameraReason({ name: 'NotFoundError' }), S.cameraReason({ name: 'NotReadableError' }), S.cameraReason({ name: 'OverconstrainedError' }), S.cameraReason({ name: 'NotSupportedError' }), S.cameraReason(null)], ['denied', 'noCamera', 'busy', 'noCamera', 'unsupported', 'error'], 'カメラの失敗の理由');
}

/* ---------- 11. rules.js と合わせる ---------- */
section('rules.js と合わせる（あれば）');
let R = null;
try { R = require(path.join(ROOT, 'rules.js')); } catch (e) { console.log('  （rules.js が読めないので飛ばす: ' + e.message + '）'); }
if (R && typeof R.newState === 'function') {
  ok(globalThis.SA && globalThis.SA.Rules === R, 'SA.Rules が見える');
  let s = R.newState({ mainId: 'shiba', mode: 'kodomo', today: '2026-10-20', route: 'sim' });
  const hrs = (map) => { const b = new Array(24).fill(0); for (const h in map) b[+h] = map[h]; return b; };
  for (let i = 0; i < 6; i++) {
    const d = R.addDays('2026-10-20', i);
    s = R.ingest(s, [{ date: d, steps: 11000 + i * 300, buckets: hrs({ 6: 2000, 8: 3000 + i * 300, 12: 3000, 16: 3000 }), src: 'sim' }], { today: d }).state;
    if (i === 2) s = R.setFamilyDay(s, d, true);
    s = R.noteOpen(s, d);
  }
  ok(R.validate(s).ok, 'rules.js で作った state は正しい');
  const f = S.exportFile(s, { now: new Date(2026, 9, 25) });
  const r = S.importFile(f.text);
  ok(r.ok, 'rules.js の state を書き出して読める');
  eq(r.state, s, '往復で同じ（migrate・validate を通しても変わらない）');
  const bad = JSON.parse(f.text); bad.state.mode = 'baby'; bad.state.goal = 1; bad.crc32 = S.crc32Text(JSON.stringify(bad.state)).toString(16).padStart(8, '0');
  const rb = S.importFile(JSON.stringify(bad));
  ok(rb.ok ? R.validate(rb.state).ok : rb.reason === 'invalid', 'おかしな中身は直して読むか invalid（validate を通らないものは返さない）');
  const old = JSON.parse(f.text); delete old.state.settings; delete old.state.guests; old.crc32 = S.crc32Text(JSON.stringify(old.state)).toString(16).padStart(8, '0');
  const ro = S.importFile(JSON.stringify(old));
  ok(ro.ok && ro.state.settings && Array.isArray(ro.state.guests), '足りない欄は migrate で埋まる');
  // 診断ファイルは SA.Rules.diagnostics と同じ
  const dg = S.diagnosticsFile(s), rd = R.diagnostics(s);
  const lines = dg.text.trim().split('\r\n');
  eq(lines[0].split(','), rd.columns, '診断の見出しは SA.Rules.diagnostics の columns');
  eq(lines.slice(1).map(l => l.split(',').map(v => /^\d+$/.test(v) ? +v : v)), rd.rows, '診断の行は SA.Rules.diagnostics の rows');
  eq(rd.columns.length, 9, '9項目');
  // QR → readGuest
  const t = S.encodeGuest(s, 'shiba', { today: '2026-10-25' });
  const dec = S.decodeGuest(t);
  ok(dec.ok, 'rules.js の state から QR が作れる');
  let other = R.newState({ mainId: 'anne', mode: 'otona', today: '2026-10-25', route: 'sim' });
  const g = R.readGuest(other, dec.payload, '2026-10-26');
  ok(g.entry && g.entry.charIndex === IDS.indexOf('shiba') && g.entry.shugyo === s.chars.shiba.shugyo && g.entry.rank === s.chars.shiba.rank && g.entry.date === '2026-10-25', 'readGuest が payload をそのまま掲示板に貼る');
  eq([g.entry.station, g.entry.round, g.entry.dye, g.entry.bond], [R.stationOf(s.stationsReached).idx, R.stationOf(s.stationsReached).round, s.chars.shiba.dye, Math.min(255, s.chars.shiba.bond)], '宿場・周回・染め・絆');
  ok(R.validate(g.state).ok, '貼ったあとの state も正しい');
  // 二巡目の宿場
  const s2 = R.clone(s); s2.stationsReached = 73; s2.round = 2;
  const p2 = S.decodeGuest(S.encodeGuest(s2, 'shiba', { today: '2026-10-25' })).payload;
  eq([p2.station, p2.round], [R.stationOf(73).idx, 2], '二巡目の宿場は rules.js の stationOf と同じ');
} else ok(true, '（rules.js なし）');

/* ---------- 12. ブラウザ（Playwright があれば） ---------- */
const noBrowser = process.argv.includes('--no-browser');
let playwright = null;
if (!noBrowser) { try { playwright = require('playwright'); } catch (e) { console.log('■ ブラウザの部: Playwright が見つからないので飛ばす'); } }
if (playwright) await browserTests(playwright);

console.log('\n合格 ' + pass + ' / 不合格 ' + fail);
process.exit(fail ? 1 : 0);

/* ================= ブラウザの部 ================= */
async function browserTests(pw) {
  section('ブラウザ: 部品の読み込み・画像ファイルから読む・保存・カメラ');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-share-'));
  const page0 = path.join(tmp, 'index.html');
  const src = (f) => pathToFileURL(path.join(ROOT, f)).href + '?v=1';
  const order = ['vendor/qrcode.js', 'vendor/jsQR.js', 'art.js', 'chars.js', 'data.js', 'rules.js', 'share.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
  fs.writeFileSync(page0, '<!doctype html><meta charset="utf-8"><title>t</title><body><video id="v" width="320" height="240"></video>' +
    order.map(f => '<script src="' + src(f) + '"></script>').join('') + '</body>');
  // 偽のカメラの映像: 忍び足の QR を映した y4m（無圧縮）を作る
  const camText = S.encodeFields({ charIndex: 3, rank: 4, okugi: 0, shugyo: 300000, dyeIndex: 2, bond: 20, day: 299, station: 12, round: 1 });
  const y4m = path.join(tmp, 'qr.y4m');
  writeY4m(y4m, camText);

  const outside = [];
  const browser = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m, '--allow-file-access-from-files'] });
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', rq => { const u = rq.url(); if (!/^(file|data|blob):/.test(u)) outside.push(u); });
    await page.goto(pathToFileURL(page0).href);
    const g = await page.evaluate(() => ({ qr: typeof window.qrcode, jq: typeof window.jsQR, share: !!(window.SA && window.SA.Share), rules: !!(window.SA && window.SA.Rules) }));
    eq(g, { qr: 'function', jq: 'function', share: true, rules: !!R }, 'グローバル qrcode・jsQR と SA.Share がある');
    // qrSvg → 画像ファイル（PNG）→ scanImageFile
    const t = S.encodeFields(BASE);
    const got = await page.evaluate(async (t) => {
      const svg = SA.Share.qrSvg(t, 300);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300;
      cv.getContext('2d').drawImage(img, 0, 0, 300, 300);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const file = new File([blob], 'qr.png', { type: 'image/png' });
      const a = await SA.Share.scanImageFile(file);
      // 大きな写真（3000×2000、まわりに余白、QR は小さめ）も読める
      const big = document.createElement('canvas'); big.width = 3000; big.height = 2000;
      const bx = big.getContext('2d'); bx.fillStyle = '#ddd'; bx.fillRect(0, 0, 3000, 2000); bx.drawImage(img, 1200, 700, 600, 600);
      const b = await SA.Share.scanImageFile(await new Promise(r => big.toBlob(r, 'image/jpeg', 0.9)));
      const empty = document.createElement('canvas'); empty.width = 200; empty.height = 200;
      const c = await SA.Share.scanImageFile(await new Promise(r => empty.toBlob(r, 'image/png')));
      const d = await SA.Share.scanImageFile(new Blob(['not an image'], { type: 'image/png' }));
      const e = await SA.Share.scanImageFile(null);
      return { a, b, c, d, e };
    }, t);
    eq(got.a, t, 'qrSvg の画を PNG にして scanImageFile で読める');
    eq(got.b, t, '大きな写真（JPEG）の中の QR も読める');
    eq([got.c, got.d, got.e], [null, null, null], 'QR のない画・こわれた画像・なしは null');
    // 書き出しファイルのダウンロード
    const [dl, res] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => { const f = SA.Share.exportFile({ app: 'shinobi-ashi', v: 1, note: '{忍|しの}び' }, { now: new Date(2026, 9, 27) }); return SA.Share.saveText(f.name, f.text); })
    ]);
    eq(res, { ok: true, via: 'download' }, 'ブラウザの saveText は download');
    eq(dl.suggestedFilename(), 'shinobi-ashi-20261027.json', 'ダウンロードの名前');
    const body = fs.readFileSync(await dl.path(), 'utf8');
    const back = S.importFile(body);
    ok(!back.ok ? back.reason === 'invalid' : true, 'ダウンロードした中身を importFile に渡せる（' + (back.reason || 'ok') + '）');
    eq(JSON.parse(body).state.note, '{忍|しの}び', 'ダウンロードの中身は UTF-8 のまま');
    // カメラ（偽のカメラに QR を映す）
    const cam = await page.evaluate(() => new Promise(async (resolve) => {
      const v = document.getElementById('v'); let tracks = null, out = null;
      const timer = setTimeout(() => resolve({ timeout: true }), 15000);
      const stop = await SA.Share.scanCamera(v, {
        onResult: (text, dec) => { out = { text, ok: dec.ok }; },
        onError: (r) => { clearTimeout(timer); resolve({ error: r }); }
      });
      tracks = v.srcObject ? v.srcObject.getTracks() : [];
      const facing = tracks.length ? tracks[0].kind : null;
      const iv = setInterval(() => {
        if (!out) return;
        clearInterval(iv); clearTimeout(timer);
        resolve({ out, kind: facing, ended: tracks.every(t => t.readyState === 'ended'), src: v.srcObject, stopType: typeof stop });
      }, 50);
    }));
    ok(!cam.timeout && !cam.error, 'カメラが開いて読み取りが回る（' + JSON.stringify(cam.error || cam.timeout || '') + '）');
    if (cam.out) {
      eq(cam.out, { text: camText, ok: true }, '偽のカメラに映した QR を読める（onResult）');
      ok(cam.ended && cam.src === null && cam.kind === 'video' && cam.stopType === 'function', '読めたら自動で止まり、トラックを止める');
    }
    // stop() を呼ぶと止まる（keepGoing）
    const st2 = await page.evaluate(async () => {
      const v = document.getElementById('v');
      const stop = await SA.Share.scanCamera(v, { keepGoing: true, onResult: () => { }, onError: () => { } });
      const tr = v.srcObject ? v.srcObject.getTracks() : [];
      const live = tr.length > 0 && tr.every(t => t.readyState === 'live');
      await new Promise(r => setTimeout(r, 300));
      stop(); stop();
      return { live, ended: tr.every(t => t.readyState === 'ended'), src: v.srcObject };
    });
    ok(st2.live && st2.ended && st2.src === null, 'stop() でトラックを止める（2回呼んでもよい）');
    // カメラがない
    const noCam = await page.evaluate(async () => {
      const md = Object.getOwnPropertyDescriptor(Navigator.prototype, 'mediaDevices');
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      let reason = null;
      await SA.Share.scanCamera(document.getElementById('v'), { onError: r => { reason = r; } });
      delete navigator.mediaDevices; if (md) Object.defineProperty(Navigator.prototype, 'mediaDevices', md);
      return reason;
    });
    eq(noCam, 'noCamera', 'カメラがなければ onError("noCamera")');
    const errs = await page.evaluate(async () => {
      const out = [];
      for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
        const orig = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('x', name));
        let reason = null;
        await SA.Share.scanCamera(document.getElementById('v'), { onError: r => { reason = r; } });
        navigator.mediaDevices.getUserMedia = orig;
        out.push(reason);
      }
      return out;
    });
    eq(errs, ['denied', 'noCamera', 'busy'], '許可なし・カメラなし・使用中を onError に分けて知らせる');
    eq(errors, [], 'コンソールのエラー0');
    await ctx.close();
  } finally { await browser.close(); }
  // 許可を出さないブラウザ（偽の許可画面なし）
  const browser2 = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--allow-file-access-from-files'] });
  try {
    const page = await browser2.newPage();
    page.on('request', rq => { const u = rq.url(); if (!/^(file|data|blob):/.test(u)) outside.push(u); });
    await page.goto(pathToFileURL(page0).href);
    const r = await page.evaluate(() => new Promise(async (resolve) => {
      const v = document.getElementById('v');
      setTimeout(() => resolve({ r: 'timeout' }), 8000);
      await SA.Share.scanCamera(v, { onResult: () => resolve({ r: 'result' }), onError: (r) => resolve({ r, src: v.srcObject }) });
    }));
    // 本物のブラウザは NotAllowedError（denied）。画面なしの Chromium は許可の画面を出せず NotSupportedError（unsupported）
    ok((r.r === 'denied' || r.r === 'unsupported') && r.src === null, '許可が出ないときは onError に理由が届き、カメラは開かない（' + r.r + '）');
  } finally { await browser2.close(); }
  eq(outside, [], '外への要求0（file・data・blob のほかに読まない）');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// QR を真ん中に映した 640×480 の y4m（YUV 4:2:0、10コマ）
function writeY4m(file, text) {
  const W = 640, H = 480, qr = qrcode(0, 'M'); qr.addData(text, 'Alphanumeric'); qr.make();
  const n = qr.getModuleCount(), scale = 10, full = (n + 8) * scale, ox = (W - full) >> 1, oy = (H - full) >> 1;
  const Y = Buffer.alloc(W * H, 200), UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  for (let y = 0; y < full; y++) for (let x = 0; x < full; x++) {
    const r = Math.floor(y / scale) - 4, c = Math.floor(x / scale) - 4;
    const dark = r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
    Y[(oy + y) * W + ox + x] = dark ? 16 : 235;
  }
  const parts = [Buffer.from('YUV4MPEG2 W' + W + ' H' + H + ' F10:1 Ip A1:1 C420jpeg\n')];
  for (let f = 0; f < 10; f++) parts.push(Buffer.from('FRAME\n'), Y, UV);
  fs.writeFileSync(file, Buffer.concat(parts));
}
