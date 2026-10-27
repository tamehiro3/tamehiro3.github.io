// 忍び足 — 絵（figure.js）のテスト。node shinobi-ashi/tools/test_figure.mjs
// 39体×6状態×4向き（＋あるくの4コマ）の SVG が例外なく作れること、weapon=false で武器の部品が消えること、
// dye で色が変わること、孫市の銃は SHOW_GUN=false なら出ないこと、「？」影が作れることを確かめる。
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
require(path.join(dir, 'art.js'));
const CH = require(path.join(dir, 'chars.js'));
const DATA = require(path.join(dir, 'data.js'));
const Fig = require(path.join(dir, 'figure.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('NG', msg); } }
function get(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }

const ids = CH.CHARS.map(c => c.id);
ok(ids.length === 39, '39体');
ok(Object.keys(Fig.WEAPON_PARTS).length === 39 && ids.every(id => Array.isArray(Fig.WEAPON_PARTS[id])), '武器の表が39体ぶんある');

// 1) 39体×6状態×4向き
const views = ['front', 'quarter', 'side', 'back'];
let made = 0;
for (const id of ids) {
  for (const state of Fig.STATES) {
    for (const view of views) {
      const frames = state === 'walk' ? [0, 1, 2, 3] : [0];
      for (const frame of frames) {
        for (const weapon of [false, true]) {
          let s = '';
          try { s = Fig.svg(id, { state, view, frame, weapon, dye: 'none', shadow: true }); }
          catch (e) { ok(false, `${id} ${state} ${view} ${frame} weapon=${weapon}: ${e.message}`); continue; }
          made++;
          const good = s.startsWith('<svg') && s.includes('viewBox="0 0 200 240"') && s.endsWith('</svg>') && !/NaN|undefined/.test(s) && s.length > 1500;
          ok(good, `${id} ${state} ${view} ${frame} の SVG の形`);
        }
      }
    }
  }
}
ok(made === 39 * (5 * 4 + 4 * 4) * 2, `作れた SVG の数 ${made}`);

// 2) weapon=false で武器の部品が消える（定義から消え、描いた SVG も変わる）
for (const id of ids) {
  const parts = Fig.WEAPON_PARTS[id];
  const on = Fig.def(id, { weapon: true });
  const off = Fig.def(id, { weapon: false });
  for (const p of parts) {
    if (p.startsWith('companion:')) {
      const kind = p.slice(10);
      ok((on.companions || []).some(c => c.kind === kind), `${id} weapon=true に ${kind} がある`);
      ok(!(off.companions || []).some(c => c.kind === kind), `${id} weapon=false で ${kind} が消える`);
    } else {
      const showGun = DATA.CONFIG.SHOW_GUN;
      if (!(id === 'magoichi' && p === 'prop' && !showGun)) ok(get(on, p) !== undefined, `${id} weapon=true に ${p} がある`);
      ok(get(off, p) === undefined, `${id} weapon=false で ${p} が消える`);
    }
  }
  // 相棒の動物は残す
  const animals = (CH.BY_ID[id].art.companions || []).filter(c => c.kind !== 'wisps').map(c => c.kind);
  for (const k of animals) ok((off.companions || []).some(c => c.kind === k), `${id} の相棒 ${k} は weapon=false でも残る`);
  // 描いた絵が変わる（外す部品がある体。孫市は SHOW_GUN=false なら銃がどちらでも出ないので同じ）
  if (parts.length && !(id === 'magoichi' && !DATA.CONFIG.SHOW_GUN)) {
    const a = Fig.svg(id, { state: 'normal', weapon: true });
    const b = Fig.svg(id, { state: 'normal', weapon: false });
    ok(a.length > b.length + 60, `${id} weapon=false で絵の部品が減る（${a.length} → ${b.length}）`);
  }
  // もとのデータは変えない
  ok(JSON.stringify(CH.BY_ID[id].art) === JSON.stringify(require(path.join(dir, 'chars.js')).BY_ID[id].art), `${id} chars.js の定義を書き換えない`);
}
// 孫市の銃: SHOW_GUN=false なら weapon=true でも出ない
ok(DATA.CONFIG.SHOW_GUN === false, 'SHOW_GUN の既定は false');
ok(!Fig.def('magoichi', { weapon: true }).prop, '孫市の銃は SHOW_GUN=false で weapon=true でも出ない');
ok(!/#5a5c63/.test(Fig.svg('magoichi', { state: 'normal', weapon: true })), '孫市の銃の色が SVG にない');
DATA.CONFIG.SHOW_GUN = true;
ok(Fig.def('magoichi', { weapon: true }).prop && Fig.def('magoichi', { weapon: true }).prop.kind === 'pistol', 'SHOW_GUN=true なら weapon=true で銃が出る');
ok(!Fig.def('magoichi', { weapon: false }).prop, 'SHOW_GUN=true でも weapon=false なら銃は出ない');
DATA.CONFIG.SHOW_GUN = false;
// 共有の刀の定義（chars.js の KT）を複製してから外している
Fig.def('jin', { weapon: false });
ok(!!CH.BY_ID.sakuya.art.back.katana, 'ほかの体の刀を消さない（共有の定義を壊さない）');

// 3) dye で色が変わる
const dyes = DATA.DYES.filter(d => d.color);
for (const id of ids) {
  const baseDef = Fig.def(id, { dye: 'none' });
  for (const d of dyes) {
    const def = Fig.def(id, { dye: d.id });
    ok(def.__info.dyed.length > 0, `${id} ${d.id} で染まる場所がある`);
    const s = Fig.svg(id, { state: 'normal', dye: d.id });
    ok(s.toLowerCase().includes(d.color.toLowerCase()), `${id} ${d.id} の色 ${d.color} が SVG に入る`);
    const changed = def.__info.dyed.some(f => get(def, f) !== get(baseDef, f));
    ok(changed, `${id} ${d.id} で定義の色が変わる`);
  }
  // 染めは装束だけ: 肌・髪は変えない
  const def = Fig.def(id, { dye: 'shu' });
  ok(get(def, 'skin') === get(baseDef, 'skin') && JSON.stringify(def.hair) === JSON.stringify(baseDef.hair), `${id} 染めで肌と髪は変わらない`);
}
ok(Fig.def('jin', { dye: 'nope' }).__info.dyed.length === 0, '知らない染めは何もしない');

// 4) 「？」影
for (const id of ids) {
  const s = Fig.silhouette(id);
  ok(s.includes('feFlood') && s.includes('？') && s.includes('viewBox="0 0 200 240"'), `${id} の「？」影`);
}
ok(Fig.svg('anne', { silhouette: true }).includes('？'), 'svg の silhouette オプション');

// 5) 状態の既定
ok(Fig.svg('anne', { state: 'nope' }).length > 1500, '知らない状態はふつう');
let threw = false; try { Fig.svg('nobody', {}); } catch (e) { threw = true; }
ok(threw, '知らない体は例外');

console.log(`figure: ${pass} 合格 / ${fail} 不合格`);
process.exit(fail ? 1 : 0);
