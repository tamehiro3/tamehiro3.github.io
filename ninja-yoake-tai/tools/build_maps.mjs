// 地図を作って data_maps.js に書き出す（開発用）。node ninja-yoake-tai/tools/build_maps.mjs
// マスの文字は field.js の TILES。物（家・人・宝箱・出口など）は objs。
// 地図を変えたら、このファイルを直して走らせる（data_maps.js は手で直さない）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class M {
  constructor(id, w, h, fill, meta) { this.id = id; this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill(fill)); this.objs = []; this.meta = meta; this.r = rng(w * 1000 + h * 7 + id.length * 13); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) { if (this.in(x, y)) this.g[y][x] = c; return this; }
  get(x, y) { return this.in(x, y) ? this.g[y][x] : 'x'; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  frame(c, t = 1) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (x < t || y < t || x >= this.w - t || y >= this.h - t) this.set(x, y, c); return this; }
  box(x, y, w, h, c) { for (let i = x; i < x + w; i++) { this.set(i, y, c); this.set(i, y + h - 1, c); } for (let j = y; j < y + h; j++) { this.set(x, j, c); this.set(x + w - 1, j, c); } return this; }
  ell(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1.0) this.set(x, y, c); } return this; }
  // 点をつなぐ道（横→縦の順）。wd は太さ
  line(pts, c, wd = 1) {
    for (let k = 1; k < pts.length; k++) {
      let [x0, y0] = pts[k - 1]; const [x1, y1] = pts[k];
      const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
      const put = (x, y) => { for (let a = 0; a < wd; a++) for (let b = 0; b < wd; b++) this.set(x + a, y + b, c); };
      put(x0, y0);
      while (x0 !== x1) { x0 += sx; put(x0, y0); }
      while (y0 !== y1) { y0 += sy; put(x0, y0); }
    }
    return this;
  }
  scatter(c, n, x, y, w, h, on = '.') { let k = 0, guard = 0; while (k < n && guard++ < n * 40) { const i = x + Math.floor(this.r() * w), j = y + Math.floor(this.r() * h); if (this.get(i, j) === on) { this.set(i, j, c); k++; } } return this; }
  replace(a, b, x = 0, y = 0, w = this.w, h = this.h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.get(i, j) === a) this.set(i, j, b); return this; }
  o(obj) { this.objs.push(obj); return this; }
  deco(kind, x, y, w, h, extra) { return this.o(Object.assign({ k: 'deco', kind, x, y, w, h }, extra || {})); }
  // 物の下は歩ける地面にしておく（家などの見た目のため）
  ground(x, y, w, h, c) { return this.rect(x, y, w, h, c); }
  // 人・宝箱・妖怪・拾う物・立て札の下が、木や岩なら、となりの地面と同じにする
  clearUnder() {
    const BLOCK = 'TYBrt';
    this.objs.forEach(o => {
      if (['npc', 'chest', 'enemy', 'pickup', 'sign'].indexOf(o.k) < 0 || o.big) return;
      if (BLOCK.indexOf(this.get(o.x, o.y)) < 0) return;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.get(o.x + dx, o.y + dy)).filter(c => '.,_"fsgdpckl:='.indexOf(c) >= 0);
      this.set(o.x, o.y, n[0] || '.');
    });
  }
  out() { this.clearUnder(); return Object.assign({ rows: this.g.map(r => r.join('')), objs: this.objs }, this.meta); }
}

const MAPS = {};
function add(m) { MAPS[m.id] = m.out(); }

/* ================= 甲賀の里（序章・第1章の町） ================= */
{
  const m = new M('koka', 30, 22, '.', { name: '甲賀の里', area: '甲賀', theme: 'village', bgm: 'town', bbg: 'village', town: 1, start: [14, 18, 'up'] });
  m.frame('T', 2);
  m.rect(0, 0, 30, 1, 'T');
  // 森のかたまり
  m.rect(2, 2, 2, 3, 'T'); m.rect(26, 2, 2, 2, 'T'); m.rect(2, 12, 1, 2, 'T'); m.rect(27, 12, 1, 3, 'T');
  // 社の前（石畳）
  m.rect(11, 2, 8, 4, '_');
  // 広場
  m.rect(10, 7, 10, 6, '_');
  // 道
  m.line([[14, 13], [14, 21]], ',', 2);
  m.line([[3, 9], [9, 9]], ',', 2); m.line([[20, 9], [26, 9]], ',', 2);
  m.line([[5, 6], [5, 8]], ',', 2); m.line([[23, 6], [23, 8]], ',', 2);
  m.line([[14, 6], [14, 6]], '_', 2);
  m.line([[9, 13], [9, 14]], ',', 1); m.line([[21, 13], [21, 15]], ',', 1);
  m.line([[5, 11], [5, 14]], ',', 2);
  // 池
  m.ell(24, 17.5, 3.2, 2.2, '~');
  m.scatter('f', 10, 3, 6, 6, 3); m.scatter('f', 8, 20, 6, 6, 3); m.scatter('"', 14, 10, 14, 16, 5); m.scatter('t', 5, 3, 13, 24, 2);
  // 修行場（柵で囲む）
  m.rect(3, 15, 7, 5, 'g'); m.box(2, 15, 9, 6, 'F'); m.set(5, 15, 'g'); m.set(6, 15, 'g');
  // 南の出口
  m.rect(14, 20, 2, 2, ',');
  // 建物
  m.deco('shrine', 13, 2, 4, 3, { label: '社' });
  m.deco('torii', 13, 5, 4, 1, { pass: [[1, 0], [2, 0]] });
  m.deco('house', 3, 3, 4, 3, { v: 0, label: '岩爺の家' });
  m.deco('house', 22, 3, 4, 3, { v: 1 });
  m.deco('stall', 7, 11, 3, 2, { v: 'red', label: '道具' });
  m.deco('inn', 19, 11, 4, 3, { label: '宿' });
  m.deco('house', 24, 10, 4, 3, { v: 2 });
  m.deco('lantern', 10, 6, 1, 1); m.deco('lantern', 19, 6, 1, 1); m.deco('lantern', 10, 13, 1, 1); m.deco('lantern', 18, 13, 1, 1);
  m.deco('well', 8, 7, 1, 1);
  m.deco('dummy', 4, 17, 1, 1); m.deco('dummy', 8, 17, 1, 1);
  m.deco('easel', 20, 17, 1, 1);
  // 人
  m.o({ k: 'npc', id: 'ganzi', cn: 'ganzi', x: 15, y: 6, dir: 'down', ev: 'koka_ganzi', show: '!has:ganzi' });
  m.o({ k: 'npc', id: 'sakuya', cn: 'sakuya', x: 13, y: 9, dir: 'down', ev: 'op_sakuya', show: '!has:sakuya&op_talked' });
  m.o({ k: 'npc', id: 'oto', cn: 'oto', x: 17, y: 9, dir: 'left', ev: 'oto_talk', show: '!has:oto' });
  m.o({ k: 'npc', id: 'nemu', cn: 'nemu', x: 21, y: 16, dir: 'left', ev: 'nemu_talk', show: '!has:nemu' });
  m.o({ k: 'npc', id: 'konga', cn: 'konga', x: 6, y: 17, dir: 'up', ev: 'konga_talk', show: '!has:konga' });
  m.o({ k: 'npc', id: 'shop', look: 'merchant', name: '道具屋', x: 8, y: 13, dir: 'down', ev: 'shop_koka' });
  m.o({ k: 'npc', id: 'inn', look: 'innkeeper', name: '宿のおかみ', x: 20, y: 14, dir: 'down', ev: 'inn_koka' });
  m.o({ k: 'npc', id: 'v1', look: 'v1', name: '里の人', x: 11, y: 11, dir: 'right', wander: 2, say: ['夜が明けなくなって、もう3日。にわとりも困っておるよ。', 'メニューの「仲間」で、仲間の能力が見られるよ。'] });
  m.o({ k: 'npc', id: 'v2', look: 'kid1', name: '里の子', x: 12, y: 16, dir: 'down', wander: 3, say: ['妖怪には「弱点」があるんだって！ 弱点で当てると、構えがくずれるよ。', '構えが0になったら「崩し」！ そこに印をためた大技だよ！'] });
  m.o({ k: 'npc', id: 'v3', look: 'v3', name: '里の人', x: 25, y: 8, dir: 'left', wander: 2, say: ['旅の地図は、里の南から出ると開けるよ。', '岩爺さまは、甲賀の里の長老さまじゃ。'] });
  m.o({ k: 'npc', id: 'v4', look: 'elder', name: '里のおばあさん', x: 23, y: 15, dir: 'right', say: ['ネムちゃんは、いつも池のそばで絵を描いておるよ。', '暁の鐘は、天の社にあったそうな。'], show: '!ending' });
  m.o({ k: 'chest', id: 'c1', x: 2, y: 6, get: 'kizugusuri', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 27, y: 6, get: 'gold', n: 60 });
  m.o({ k: 'chest', id: 'c3', x: 26, y: 15, get: 'kunai', n: 3 });
  m.o({ k: 'sign', id: 's1', x: 13, y: 13, text: '甲賀の里　南：旅の道' });
  m.o({ k: 'exit', id: 'out', x: 14, y: 21, w: 2, h: 1, to: 'travel', show: 'op_done' });
  m.o({ k: 'step', id: 'nogo', x: 14, y: 20, w: 2, h: 1, ev: 'koka_nogo', show: '!op_done' });
  m.o({ k: 'step', id: 'ending_walk', x: 10, y: 7, w: 10, h: 6, ev: 'ending_village', show: 'ending&!ending_seen' });
  MAPS.koka = m.out();
  MAPS.koka.auto = [{ ev: 'op_start', show: '!op_started' }];
}

/* ================= 狐火の森（第1章の野） ================= */
{
  const m = new M('kitsunebi', 36, 28, 'T', { name: '狐火の森', area: '甲賀', theme: 'forest', bgm: 'field', bbg: 'forest', start: [17, 25, 'up'] });
  // 南の入口から北の洞へ、くねくね道
  m.rect(14, 22, 9, 6, '.'); m.rect(12, 18, 13, 5, '.');
  m.line([[17, 27], [17, 20], [15, 20], [15, 16], [17, 16], [17, 10], [18, 10], [18, 4], [17, 4], [17, 1]], ',', 2);
  m.rect(13, 7, 10, 7, '.'); m.rect(14, 2, 8, 3, '.'); m.rect(17, 5, 2, 2, ',');
  // 川と橋
  m.rect(0, 14, 36, 1, '~'); m.rect(0, 15, 36, 1, '~');
  m.set(17, 14, '='); m.set(18, 14, '='); m.set(17, 15, '='); m.set(18, 15, '=');
  // 西：おえんの薬草のあき地（川の南）
  m.rect(3, 17, 9, 6, '.'); m.line([[11, 20], [14, 20]], ',', 1); m.scatter('f', 14, 3, 17, 9, 6);
  // 南西：ネムの絵1
  m.rect(2, 23, 6, 3, '.'); m.line([[7, 24], [14, 24]], ',', 1);
  // 東：稲荷の祠（川の北）
  m.rect(25, 7, 9, 7, '.'); m.line([[22, 10], [25, 10]], ',', 1); m.rect(28, 3, 5, 4, '.'); m.line([[30, 6], [30, 7]], ',', 1);
  // 東の橋 → 南東のあき地（ネムの絵2）
  m.set(30, 14, '='); m.set(30, 15, '='); m.rect(27, 16, 7, 6, '.'); m.line([[30, 13], [30, 17]], ',', 1); m.scatter('"', 10, 27, 16, 7, 6);
  // 西：竹林（笹の葉）
  m.rect(3, 4, 8, 9, 'B'); m.rect(5, 6, 4, 5, '.'); m.line([[8, 8], [13, 8]], ',', 1); m.set(5, 8, '.'); m.set(4, 8, '.');
  // 北西：絵3と宝箱
  m.rect(10, 9, 3, 3, '.');
  m.rect(19, 5, 1, 2, 'T'); m.rect(16, 5, 1, 2, 'T');
  m.scatter('"', 18, 12, 17, 13, 6); m.scatter('f', 6, 13, 7, 10, 7); m.scatter('t', 6, 12, 18, 13, 5);
  // 物
  m.deco('cave', 16, 0, 4, 2, { pass: [[1, 1], [2, 1]] });
  m.deco('shrine_small', 28, 8, 3, 2, { label: '稲荷' });
  m.deco('fox', 27, 10, 1, 1); m.deco('fox', 31, 10, 1, 1);
  m.deco('stump', 6, 20, 1, 1);
  m.o({ k: 'exit', id: 'out', x: 17, y: 27, w: 2, h: 1, to: 'travel' });
  m.o({ k: 'exit', id: 'cave', x: 17, y: 1, w: 2, h: 1, to: 'inari', tx: 15, ty: 21, dir: 'up' });
  m.o({ k: 'obst', id: 'boulder1', kind: 'boulder', x: 17, y: 5, story: 1, show: '!ch1_boulder' });
  m.o({ k: 'obst', id: 'boulder2', kind: 'boulder', x: 18, y: 5, story: 1, show: '!ch1_boulder' });
  m.o({ k: 'npc', id: 'xiaolan', cn: 'xiaolan', x: 20, y: 7, dir: 'left', ev: 'xl_talk', show: '!has:xiaolan' });
  m.o({ k: 'npc', id: 'uka', cn: 'uka', x: 29, y: 11, dir: 'down', ev: 'uka_talk', show: '!has:uka' });
  m.o({ k: 'npc', id: 'izuna', cn: 'izuna', x: 30, y: 4, dir: 'down', ev: 'izuna_talk', show: '!has:izuna' });
  m.o({ k: 'npc', id: 'oen', cn: 'oen', x: 6, y: 18, dir: 'right', ev: 'oen_talk', show: '!has:oen' });
  m.o({ k: 'step', id: 'oen_ev', x: 9, y: 17, w: 1, h: 6, ev: 'oen_rescue', once: 1, show: '!has:oen' });
  m.o({ k: 'pickup', id: 'sasa', x: 6, y: 8, get: 'sasa', show: 'xl_asked' });
  m.o({ k: 'pickup', id: 'e1', x: 3, y: 24, get: 'nemu_e1', show: 'nemu_asked' });
  m.o({ k: 'pickup', id: 'e2', x: 32, y: 20, get: 'nemu_e2', show: 'nemu_asked' });
  m.o({ k: 'pickup', id: 'e3', x: 11, y: 10, get: 'nemu_e3', show: 'nemu_asked' });
  m.o({ k: 'chest', id: 'c1', x: 4, y: 21, get: 'hyorogan', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 33, y: 8, get: 'kizugusuri', n: 3 });
  m.o({ k: 'chest', id: 'c3', x: 21, y: 3, get: 'inochi', n: 1 });
  m.o({ k: 'chest', id: 'c4', x: 33, y: 17, get: 'gold', n: 120 });
  m.o({ k: 'chest', id: 'c5', x: 12, y: 9, get: 'kayaku', n: 3 });
  m.o({ k: 'sign', id: 's1', x: 16, y: 21, text: '北：稲荷の洞　東：稲荷の祠' });
  [[20, 23], [13, 19], [22, 19], [16, 11], [21, 12], [5, 24], [29, 19], [27, 12], [14, 4]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'forest', r: 2 }));
  MAPS.kitsunebi = m.out();
  MAPS.kitsunebi.auto = [{ ev: 'forest_enter', show: '!forest_entered' }];
}

/* ================= 稲荷の洞（第1章のダンジョン） ================= */
{
  const m = new M('inari', 30, 24, 'D', { name: '稲荷の洞', area: '甲賀', theme: 'cave', bgm: 'cave', bbg: 'cave', start: [15, 21, 'up'], dark: 1 });
  m.rect(11, 17, 9, 6, 'd'); m.rect(14, 22, 3, 2, 'd');
  // まっすぐ北へ：穴（岩を押して埋める）。穴のところは1マスの細い道
  m.rect(14, 13, 3, 4, 'd'); m.rect(15, 10, 1, 3, 'd');
  // 西の部屋（宝箱）と東の部屋（2つめの岩）
  m.rect(3, 15, 7, 6, 'd'); m.line([[9, 18], [11, 18]], 'd', 2);
  m.rect(21, 13, 6, 6, 'd'); m.line([[19, 18], [21, 18]], 'd', 1); m.line([[23, 12], [23, 13]], 'd', 1);
  m.rect(21, 6, 6, 6, 'd');
  // 北の大広間（ボス）
  m.rect(9, 2, 13, 8, 'd'); m.line([[21, 7], [21, 7]], 'd', 1);
  // 西の上の小部屋（ひび割れの奥・3章で）
  m.rect(3, 4, 4, 4, 'd'); m.set(7, 6, 'd'); m.set(8, 6, 'd');
  m.scatter('r', 6, 11, 17, 9, 5, 'd');
  m.o({ k: 'exit', id: 'out', x: 14, y: 23, w: 3, h: 1, to: 'kitsunebi', tx: 17, ty: 2, dir: 'down' });
  m.o({ k: 'pit', id: 'pit1', x: 15, y: 11 });
  m.o({ k: 'obst', id: 'b1', kind: 'boulder', x: 15, y: 13 });
  m.o({ k: 'obst', id: 'b2', kind: 'boulder', x: 23, y: 15 });
  m.o({ k: 'pit', id: 'pit2', x: 23, y: 12 });
  m.o({ k: 'obst', id: 'crack1', kind: 'crack', x: 8, y: 6 });
  m.o({ k: 'chest', id: 'c1', x: 4, y: 16, get: 'kiyome', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 25, y: 7, get: 'chikara', n: 1 });
  m.o({ k: 'chest', id: 'c3', x: 4, y: 5, get: 'tamahagane', n: 2 });
  m.o({ k: 'chest', id: 'c4', x: 8, y: 20, get: 'hyorogan', n: 2 });
  m.o({ k: 'chest', id: 'c5', x: 26, y: 17, get: 'gold', n: 150 });
  m.o({ k: 'npc', id: 'boss', yokai: 'ponpoko', x: 15, y: 4, dir: 'down', ev: 'boss_ponpoko', show: '!ch1_clear', big: 1 });
  m.o({ k: 'sign', id: 's1', x: 13, y: 17, text: '大岩は、むこう側へ押して動かせる（リーリー）。穴に落とすと、道になる' });
  [[12, 19], [18, 20], [5, 18], [15, 15], [24, 16], [23, 8], [11, 7]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'inari', r: 2 }));
  MAPS.inari = m.out();
}

/* ================= 伊賀の里（第2章の町） ================= */
{
  const m = new M('iga', 32, 22, '.', { name: '伊賀の里', area: '伊賀', theme: 'village', bgm: 'town', bbg: 'village', town: 1, start: [15, 19, 'up'], pine: 1 });
  m.frame('Y', 2); m.rect(0, 0, 32, 1, 'Y');
  m.rect(2, 2, 3, 2, 'Y'); m.rect(27, 2, 3, 3, 'Y');
  m.rect(9, 7, 14, 6, '_');
  m.line([[15, 13], [15, 21]], ',', 2);
  m.line([[3, 10], [9, 10]], ',', 2); m.line([[23, 10], [29, 10]], ',', 2);
  m.line([[6, 6], [6, 9]], ',', 1); m.line([[25, 6], [25, 9]], ',', 1); m.line([[15, 5], [15, 7]], ',', 2);
  m.line([[6, 12], [6, 15]], ',', 1); m.line([[25, 12], [25, 15]], ',', 1);
  m.rect(15, 20, 2, 2, ',');
  // 酉花の花壇
  m.rect(20, 16, 6, 3, 'f'); m.box(19, 15, 8, 5, 'F'); m.set(22, 15, ','); m.set(23, 15, ',');
  m.scatter('"', 12, 9, 14, 6, 5); m.scatter('f', 6, 3, 7, 5, 3);
  m.deco('dojo', 12, 2, 7, 3, { label: '道場' });
  m.deco('house', 4, 3, 4, 3, { v: 1, label: '令の家' });
  m.deco('forge', 23, 3, 5, 3, { label: '鍛冶' });
  m.deco('stall', 3, 12, 4, 2, { v: 'green', label: '団子' });
  m.deco('stall', 9, 13, 3, 2, { v: 'blue', label: '道具' });
  m.deco('inn', 26, 11, 4, 3, { label: '宿' });
  m.deco('house', 2, 16, 4, 3, { v: 3 });
  m.deco('lantern', 8, 7, 1, 1); m.deco('lantern', 23, 7, 1, 1); m.deco('well', 13, 15, 1, 1);
  m.o({ k: 'npc', id: 'rei', cn: 'rei', x: 6, y: 7, dir: 'down', ev: 'rei_talk', show: '!has:rei' });
  m.o({ k: 'npc', id: 'anne', cn: 'anne', x: 5, y: 14, dir: 'down', ev: 'anne_talk', show: '!has:anne' });
  m.o({ k: 'npc', id: 'shion_v', cn: 'shion', x: 3, y: 14, dir: 'right', ev: 'shion_village', show: 'shion_back&!has:shion' });
  m.o({ k: 'npc', id: 'torika', cn: 'torika', x: 22, y: 17, dir: 'down', ev: 'torika_talk', show: '!has:torika' });
  m.o({ k: 'npc', id: 'kanaoni', cn: 'kanaoni', x: 25, y: 6, dir: 'down', ev: 'kanaoni_talk', show: '!has:kanaoni' });
  m.o({ k: 'npc', id: 'sekishusai', cn: 'sekishusai', x: 15, y: 5, dir: 'down', ev: 'ss_talk', show: '!has:sekishusai' });
  m.o({ k: 'npc', id: 'shop', look: 'merchant2', name: '道具屋', x: 10, y: 15, dir: 'down', ev: 'shop_iga' });
  m.o({ k: 'npc', id: 'inn', look: 'innkeeper', name: '宿の主人', x: 27, y: 14, dir: 'down', ev: 'inn_iga' });
  m.o({ k: 'npc', id: 'v1', look: 'v2', name: '伊賀の人', x: 12, y: 10, dir: 'right', wander: 2, say: ['霧の山道は、見えない道が多いんだ。鷹の目でもないと迷うよ。', '令さまは、この里を守る忍だよ。'] });
  m.o({ k: 'npc', id: 'v2', look: 'kid2', name: '伊賀の子', x: 19, y: 12, dir: 'down', wander: 3, say: ['金鬼さんの鍛冶場では、武器を強くしてもらえるんだって！', '武器の鍛錬には「玉鋼」がいるよ。妖怪が落とすこともあるって。'] });
  m.o({ k: 'npc', id: 'v3', look: 'elder', name: '伊賀のおじいさん', x: 28, y: 17, dir: 'left', say: ['「やさしい」の難しさにすると、妖怪が弱くなるぞい。メニューの設定じゃ。'] });
  m.o({ k: 'chest', id: 'c1', x: 3, y: 5, get: 'jokizu', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 29, y: 6, get: 'tamahagane', n: 1 });
  m.o({ k: 'sign', id: 's1', x: 14, y: 13, text: '伊賀の里　北：道場　東：鍛冶場' });
  m.o({ k: 'exit', id: 'out', x: 15, y: 21, w: 2, h: 1, to: 'travel' });
  MAPS.iga = m.out();
  MAPS.iga.auto = [{ ev: 'iga_enter', show: '!iga_entered' }];
}

/* ================= 霧の山道（第2章の野） ================= */
{
  const m = new M('kirimichi', 36, 30, '#', { name: '霧の山道', area: '伊賀', theme: 'mountain', bgm: 'field2', bbg: 'mountain', start: [17, 27, 'up'], mist: 1 });
  // 下の段（入口〜ハヤテ）
  m.rect(10, 22, 16, 8, '.'); m.line([[17, 29], [17, 23]], ',', 2);
  m.rect(4, 19, 8, 6, '.'); m.line([[10, 23], [12, 23]], ',', 1);
  // 中の段（結の戦い・東）— 隠し道（鷹の目）で上がる
  m.rect(13, 13, 14, 7, '.'); m.line([[17, 20], [17, 22]], ',', 2);
  m.rect(26, 11, 7, 7, '.'); m.line([[26, 15], [24, 15]], ',', 1);
  // 上の段（洞の入口）
  m.rect(13, 3, 12, 7, '.'); m.line([[17, 10], [17, 12]], ',', 2); m.line([[18, 1], [18, 3]], ',', 2);
  // 西のくぼみ（紫苑）と北西の岩棚（花の種）
  m.rect(2, 8, 6, 6, '.'); m.rect(3, 2, 6, 4, '.'); m.line([[5, 6], [5, 8]], ',', 1);
  // 北東の山頂（カルラ）
  m.rect(28, 2, 6, 5, '.'); m.line([[30, 7], [30, 11]], ',', 1);
  m.scatter('Y', 18, 10, 22, 16, 8); m.scatter('Y', 10, 13, 13, 14, 7); m.scatter('Y', 8, 13, 3, 12, 7); m.scatter('r', 6, 13, 13, 14, 7);
  m.scatter('"', 16, 10, 22, 16, 8); m.scatter('f', 6, 2, 8, 6, 6);
  // 段のあいだ：見えない道（鷹の目で見つける）
  m.set(17, 20, '#'); m.set(18, 20, '#'); m.set(17, 21, '#'); m.set(18, 21, '#');
  m.o({ k: 'obst', id: 'h_mid1', kind: 'hidden', x: 17, y: 20, grp: 'mid' }); m.o({ k: 'obst', id: 'h_mid2', kind: 'hidden', x: 18, y: 20, grp: 'mid' });
  m.o({ k: 'obst', id: 'h_mid3', kind: 'hidden', x: 17, y: 21, grp: 'mid' }); m.o({ k: 'obst', id: 'h_mid4', kind: 'hidden', x: 18, y: 21, grp: 'mid' });
  m.set(8, 11, '#'); m.set(9, 11, '#'); m.line([[8, 11], [12, 11]], ',', 1); m.line([[12, 11], [12, 14]], ',', 1); m.set(12, 14, ',');
  m.set(8, 11, '#'); m.o({ k: 'obst', id: 'h_west', kind: 'hidden', x: 8, y: 11 });
  m.set(30, 9, '#'); m.o({ k: 'obst', id: 'h_top', kind: 'hidden', x: 30, y: 9 });
  m.deco('cave', 17, 0, 4, 2, { pass: [[1, 1], [2, 1]] });
  m.deco('stone_marker', 9, 20, 1, 1);
  m.o({ k: 'exit', id: 'out', x: 17, y: 29, w: 2, h: 1, to: 'travel' });
  m.o({ k: 'exit', id: 'cave', x: 18, y: 1, w: 2, h: 1, to: 'iwaya', tx: 16, ty: 23, dir: 'up' });
  m.o({ k: 'npc', id: 'hayate', cn: 'hayate', x: 7, y: 21, dir: 'right', ev: 'hayate_talk', show: '!has:hayate' });
  m.o({ k: 'step', id: 'yui_ev', x: 13, y: 18, w: 14, h: 1, ev: 'yui_rescue', once: 1, show: '!has:yui' });
  m.o({ k: 'npc', id: 'yui', cn: 'yui', x: 20, y: 15, dir: 'down', ev: 'yui_talk', show: '!has:yui' });
  m.o({ k: 'npc', id: 'shion', cn: 'shion', x: 4, y: 10, dir: 'down', ev: 'shion_talk', show: 'anne_asked&!shion_back&!has:shion' });
  m.o({ k: 'npc', id: 'karura', cn: 'karura', x: 31, y: 3, dir: 'down', ev: 'karura_talk', show: '!has:karura' });
  m.o({ k: 'pickup', id: 'tane', x: 5, y: 3, get: 'hanatane', show: 'torika_asked' });
  m.o({ k: 'chest', id: 'c1', x: 5, y: 20, get: 'jokizu', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 31, y: 16, get: 'raifu', n: 3 });
  m.o({ k: 'chest', id: 'c3', x: 23, y: 4, get: 'chie', n: 1 });
  m.o({ k: 'chest', id: 'c4', x: 7, y: 3, get: 'tamahagane', n: 1 });
  m.o({ k: 'chest', id: 'c5', x: 33, y: 5, get: 'gold', n: 300 });
  m.o({ k: 'sign', id: 's1', x: 16, y: 24, text: '霧の山道　この先、道が見えにくい。足もとに気をつけて' });
  [[13, 26], [22, 24], [6, 22], [15, 17], [21, 16], [29, 13], [15, 6], [21, 8], [4, 12], [31, 4]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'kirimichi', r: 2 }));
  MAPS.kirimichi = m.out();
}

/* ================= 大蜘蛛の岩屋（第2章のダンジョン） ================= */
{
  const m = new M('iwaya', 32, 26, 'D', { name: '大蜘蛛の岩屋', area: '伊賀', theme: 'cave', bgm: 'cave', bbg: 'cave', start: [16, 23, 'up'], dark: 1, web: 1 });
  m.rect(13, 19, 7, 6, 'd'); m.rect(15, 24, 3, 2, 'd');
  m.rect(4, 17, 7, 5, 'd'); m.line([[10, 20], [13, 20]], 'd', 1);
  m.rect(22, 17, 7, 5, 'd'); m.line([[19, 20], [22, 20]], 'd', 1);
  m.rect(4, 8, 6, 6, 'd'); m.line([[6, 14], [6, 17]], 'd', 1);
  m.rect(23, 8, 6, 6, 'd'); m.line([[25, 14], [25, 17]], 'd', 1);
  m.rect(12, 9, 8, 6, 'd'); m.line([[10, 11], [12, 11]], 'd', 1); m.line([[20, 11], [23, 11]], 'd', 1);
  m.rect(10, 2, 12, 5, 'd'); m.line([[16, 7], [16, 9]], 'd', 2);
  // 隠し道：中央の部屋は、左右の部屋から鷹の目で
  m.set(10, 11, 'D'); m.set(11, 11, 'D'); m.o({ k: 'obst', id: 'h1', kind: 'hidden', x: 10, y: 11, grp: 'w' }); m.o({ k: 'obst', id: 'h1b', kind: 'hidden', x: 11, y: 11, grp: 'w' });
  [20, 21, 22].forEach(x => { m.set(x, 11, 'D'); m.o({ k: 'obst', id: 'he' + x, kind: 'hidden', x, y: 11, grp: 'e' }); });
  m.set(16, 15, 'D'); m.set(17, 15, 'D'); m.set(16, 16, 'D'); m.set(17, 16, 'D'); m.set(16, 17, 'D'); m.set(17, 17, 'D'); m.set(16, 18, 'D'); m.set(17, 18, 'D');
  // 南の部屋から中央の部屋へは、まっすぐな隠し道
  [[16, 15], [16, 16], [16, 17], [16, 18]].forEach(([x, y], i) => m.o({ k: 'obst', id: 'hc' + i, kind: 'hidden', x, y, grp: 's' }));
  // ひび割れの奥（3章）
  m.rect(27, 2, 3, 3, 'd'); m.set(26, 4, 'd'); m.set(25, 4, 'd'); m.set(24, 4, 'd'); m.set(23, 4, 'd'); m.set(23, 5, 'd'); m.set(23, 6, 'd'); m.set(23, 7, 'd');
  m.o({ k: 'obst', id: 'crack1', kind: 'crack', x: 24, y: 4 });
  m.scatter('r', 5, 13, 19, 7, 5, 'd');
  m.o({ k: 'exit', id: 'out', x: 15, y: 25, w: 3, h: 1, to: 'kirimichi', tx: 18, ty: 2, dir: 'down' });
  m.o({ k: 'chest', id: 'meikou', x: 5, y: 9, get: 'meikou', n: 1, show: 'kanaoni_asked' });
  m.o({ k: 'chest', id: 'c1', x: 27, y: 9, get: 'mezame', n: 1 });
  m.o({ k: 'chest', id: 'c2', x: 5, y: 18, get: 'jokizu', n: 3 });
  m.o({ k: 'chest', id: 'c3', x: 27, y: 20, get: 'kitsuke', n: 2 });
  m.o({ k: 'chest', id: 'c4', x: 28, y: 3, get: 'kaishin', n: 1 });
  m.o({ k: 'chest', id: 'c5', x: 14, y: 10, get: 'tamahagane', n: 2 });
  m.o({ k: 'npc', id: 'boss', yokai: 'kirigumo', x: 16, y: 4, dir: 'down', ev: 'boss_kirigumo', show: '!ch2_clear', big: 1 });
  m.o({ k: 'sign', id: 's1', x: 18, y: 22, text: '光る場所には、見えない道があるかもしれない（鷹の目）' });
  [[15, 21], [7, 19], [25, 19], [6, 10], [25, 11], [16, 12], [13, 4]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'iwaya', r: 2 }));
  MAPS.iwaya = m.out();
}

/* ================= 雑賀の港（第3章の町） ================= */
{
  const m = new M('saika', 34, 24, '.', { name: '雑賀の港', area: '雑賀', theme: 'port', bgm: 'town2', bbg: 'beach', town: 1, start: [2, 10, 'right'] });
  m.frame('T', 1); m.rect(0, 0, 34, 2, 'T');
  m.rect(0, 18, 34, 6, '~'); m.rect(1, 16, 32, 2, 's');
  m.rect(4, 15, 26, 1, ',');
  // 桟橋
  m.rect(8, 17, 2, 5, ':'); m.rect(20, 17, 2, 6, ':'); m.rect(20, 21, 7, 2, ':');
  m.rect(10, 6, 14, 7, '_');
  m.line([[0, 10], [10, 10]], ',', 2); m.line([[24, 10], [31, 10]], ',', 2);
  m.line([[16, 13], [16, 15]], ',', 2); m.line([[6, 11], [6, 15]], ',', 1); m.line([[28, 11], [28, 15]], ',', 1);
  m.line([[16, 4], [16, 6]], ',', 2);
  m.set(0, 10, ','); m.set(0, 11, ',');
  m.scatter('f', 6, 2, 3, 6, 4); m.scatter('"', 8, 24, 3, 8, 5);
  m.deco('bighouse', 13, 2, 7, 3, { label: '弁天の館' });
  m.deco('stall', 3, 12, 3, 2, { v: 'blue', label: '魚' });
  m.deco('stall', 10, 13, 3, 2, { v: 'red', label: '道具' });
  m.deco('kura', 24, 3, 5, 3, { label: '蔵' });
  m.deco('inn', 26, 11, 4, 3, { label: '宿' });
  m.deco('house', 3, 3, 4, 3, { v: 2 });
  m.deco('post', 21, 12, 2, 2, { label: '伝令' });
  m.deco('crates', 13, 16, 2, 1); m.deco('crates', 25, 16, 1, 1);
  m.deco('ship', 22, 18, 7, 3, { show: 'ch3_clear' });
  m.o({ k: 'npc', id: 'benten', cn: 'benten', x: 16, y: 5, dir: 'down', ev: 'benten_talk', show: '!has:benten' });
  m.o({ k: 'npc', id: 'nekomata', cn: 'nekomata', x: 4, y: 14, dir: 'right', ev: 'nekomata_talk', show: '!has:nekomata' });
  m.o({ k: 'npc', id: 'nagisa', cn: 'nagisa', x: 26, y: 7, dir: 'down', ev: 'nagisa_talk', show: '!has:nagisa' });
  m.o({ k: 'npc', id: 'ichiya', cn: 'ichiya', x: 23, y: 14, dir: 'down', ev: 'ichiya_talk', show: '!has:ichiya' });
  m.o({ k: 'npc', id: 'shiba', cn: 'shiba', x: 9, y: 20, dir: 'up', ev: 'shiba_talk', show: '!has:shiba' });
  m.o({ k: 'npc', id: 'quon', cn: 'quon', x: 31, y: 16, dir: 'left', ev: 'quon_1', show: '!quon_1&!has:quon' });
  m.o({ k: 'npc', id: 'magoichi', cn: 'magoichi', x: 21, y: 16, dir: 'down', ev: 'magoichi_talk', show: 'ch3_clear&!has:magoichi' });
  m.o({ k: 'npc', id: 'shop', look: 'merchant', name: '道具屋', x: 11, y: 15, dir: 'down', ev: 'shop_saika' });
  m.o({ k: 'npc', id: 'inn', look: 'innkeeper', name: '宿のおかみ', x: 27, y: 14, dir: 'down', ev: 'inn_saika' });
  m.o({ k: 'npc', id: 'l1', look: 'fisher', name: '魚屋', x: 2, y: 14, dir: 'right', ev: 'letter_1' });
  m.o({ k: 'npc', id: 'l2', look: 'sailor', name: '船乗り', x: 21, y: 22, dir: 'up', ev: 'letter_2' });
  m.o({ k: 'npc', id: 'l3', look: 'elder', name: '灯台守のおばあさん', x: 31, y: 7, dir: 'left', ev: 'letter_3' });
  m.o({ k: 'npc', id: 'v1', look: 'v4', name: '港の人', x: 13, y: 9, dir: 'right', wander: 2, say: ['海坊主が出るようになってから、船が出せないんだ。', '孫市さまの船も、沖で足止めされてるらしいよ。'] });
  m.o({ k: 'npc', id: 'v2', look: 'kid1', name: '港の子', x: 19, y: 11, dir: 'down', wander: 3, say: ['潮風の浜に、ずっと寝てるお兄さんがいるよ。', '浜の霧は、風でも吹かないと晴れないんだって。'] });
  m.o({ k: 'chest', id: 'c1', x: 2, y: 3, get: 'reisui', n: 1 });
  m.o({ k: 'chest', id: 'c2', x: 31, y: 3, get: 'tamahagane', n: 2 });
  m.o({ k: 'chest', id: 'c3', x: 9, y: 21, get: 'mizudama', n: 3 });
  m.o({ k: 'sign', id: 's1', x: 15, y: 13, text: '雑賀の港　北：弁天の館　東：蔵・宿' });
  m.o({ k: 'exit', id: 'out', x: 0, y: 10, w: 1, h: 2, to: 'travel' });
  MAPS.saika = m.out();
  MAPS.saika.auto = [{ ev: 'saika_enter', show: '!saika_entered' }];
}

/* ================= 潮風の浜（第3章の野） ================= */
{
  const m = new M('shiokaze', 38, 26, 's', { name: '潮風の浜', area: '雑賀', theme: 'beach', bgm: 'field3', bbg: 'beach', start: [1, 12, 'right'] });
  m.rect(0, 0, 38, 3, 'Y'); m.rect(0, 0, 2, 26, 'Y'); m.set(0, 12, 's'); m.set(1, 12, 's'); m.set(0, 13, 's'); m.set(1, 13, 's');
  m.rect(0, 21, 38, 5, '~'); m.rect(35, 0, 3, 21, '#');
  m.rect(2, 3, 33, 6, '.'); m.scatter('Y', 26, 2, 3, 33, 6, '.'); m.scatter('"', 18, 2, 3, 33, 6, '.');
  m.line([[0, 12], [24, 12]], ',', 2);
  m.scatter('r', 14, 2, 14, 33, 7, 's');
  // 霧の帯（風遁で晴らす）
  for (let y = 3; y < 21; y++) { m.set(25, y, '#'); }
  for (let y = 9; y < 17; y++) { m.set(25, y, 's'); m.o({ k: 'obst', id: 'fog' + y, kind: 'fog', x: 25, y, grp: 'fog' }); }
  m.line([[26, 12], [33, 12]], ',', 2);
  // 東：池の祠（瀬織）
  m.rect(27, 3, 7, 5, '.'); m.ell(31, 5, 2, 1.3, '~'); m.line([[29, 8], [29, 12]], ',', 1);
  // 洞の入口（ひび割れの岩）
  m.set(34, 12, ','); m.set(34, 13, ','); m.set(35, 12, ','); m.set(35, 13, ',');
  m.deco('hut', 10, 9, 4, 2, { label: '漁師小屋' });
  m.deco('shrine_small', 28, 3, 3, 2, { label: '池' });
  m.deco('boat', 6, 20, 2, 1);
  m.deco('cave', 35, 11, 3, 3, { pass: [[0, 1], [0, 2]] });
  m.o({ k: 'obst', id: 'crack', kind: 'crack', x: 34, y: 12, grp: 'cave' });
  m.o({ k: 'obst', id: 'crack2', kind: 'crack', x: 34, y: 13, grp: 'cave' });
  m.o({ k: 'exit', id: 'out', x: 0, y: 12, w: 1, h: 2, to: 'travel' });
  m.o({ k: 'exit', id: 'cave', x: 35, y: 12, w: 1, h: 2, to: 'umidou', tx: 2, ty: 13, dir: 'right' });
  m.o({ k: 'npc', id: 'fuuta', cn: 'fuuta', x: 20, y: 7, dir: 'down', ev: 'fuuta_talk', show: '!has:fuuta', sleep: 1 });
  m.o({ k: 'npc', id: 'hinanojoh', cn: 'hinanojoh', x: 13, y: 13, dir: 'down', ev: 'hina_talk', show: '!has:hinanojoh' });
  m.o({ k: 'npc', id: 'seori', cn: 'seori', x: 32, y: 7, dir: 'down', ev: 'seori_talk', show: '!has:seori' });
  m.o({ k: 'npc', id: 'quon', cn: 'quon', x: 30, y: 18, dir: 'left', ev: 'quon_2', show: 'quon_1&!quon_2&!has:quon' });
  m.o({ k: 'npc', id: 'fisher', look: 'fisher', name: '漁師', x: 9, y: 11, dir: 'down', ev: 'fisher_talk' });
  m.o({ k: 'chest', id: 'c1', x: 3, y: 4, get: 'jokizu', n: 3 });
  m.o({ k: 'chest', id: 'c2', x: 33, y: 4, get: 'fuujiyaburi', n: 1 });
  m.o({ k: 'chest', id: 'c3', x: 3, y: 19, get: 'gold', n: 400 });
  m.o({ k: 'chest', id: 'c4', x: 22, y: 4, get: 'tamahagane', n: 1 });
  m.o({ k: 'sign', id: 's1', x: 23, y: 11, text: 'この先、濃い霧。風がないと進めない' });
  [[6, 15], [14, 17], [20, 15], [9, 5], [17, 4], [22, 18], [28, 15], [31, 10], [29, 18]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'hama', r: 2 }));
  MAPS.shiokaze = m.out();
}

/* ================= 海鳴りの洞（第3章のダンジョン） ================= */
{
  const m = new M('umidou', 32, 26, 'D', { name: '海鳴りの洞', area: '雑賀', theme: 'seacave', bgm: 'cave', bbg: 'seacave', start: [2, 13, 'right'], dark: 1 });
  m.rect(1, 11, 7, 5, 'd'); m.rect(0, 12, 1, 3, 'd');
  m.rect(8, 10, 2, 7, 'd'); m.rect(8, 6, 2, 4, 'd'); m.rect(8, 17, 2, 3, 'd');
  m.rect(10, 3, 8, 6, 'd'); m.rect(10, 18, 8, 5, 'd');
  m.rect(18, 9, 6, 8, 'd'); m.ell(20.5, 13, 1.8, 2.2, '~');
  m.line([[17, 6], [20, 6], [20, 9]], 'd', 1); m.line([[17, 20], [21, 20], [21, 16]], 'd', 1);
  m.rect(25, 4, 5, 18, 'd'); m.set(24, 13, 'd');
  m.rect(26, 1, 4, 3, 'd');
  // 霧（風遁）とひび割れ（焙烙玉）
  m.o({ k: 'obst', id: 'fog1', kind: 'fog', x: 8, y: 9, grp: 'f1' }); m.o({ k: 'obst', id: 'fog2', kind: 'fog', x: 9, y: 9, grp: 'f1' });
  m.o({ k: 'obst', id: 'crack1', kind: 'crack', x: 8, y: 17, grp: 'c1' }); m.o({ k: 'obst', id: 'crack1b', kind: 'crack', x: 9, y: 17, grp: 'c1' });
  m.o({ k: 'obst', id: 'crack2', kind: 'crack', x: 20, y: 7 });
  m.o({ k: 'obst', id: 'fog3', kind: 'fog', x: 24, y: 13 });
  m.scatter('r', 6, 25, 4, 5, 18, 'd'); m.rect(25, 12, 3, 3, 'd'); m.rect(26, 4, 3, 1, 'd');
  m.o({ k: 'exit', id: 'out', x: 0, y: 12, w: 1, h: 3, to: 'shiokaze', tx: 33, ty: 12, dir: 'left' });
  m.o({ k: 'npc', id: 'quon', cn: 'quon', x: 14, y: 21, dir: 'up', ev: 'quon_3', show: 'quon_2&!has:quon' });
  m.o({ k: 'chest', id: 'c1', x: 11, y: 4, get: 'reisui', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 16, y: 21, get: 'sente', n: 1 });
  m.o({ k: 'chest', id: 'c3', x: 19, y: 11, get: 'tamahagane', n: 2 });
  m.o({ k: 'chest', id: 'c4', x: 25, y: 20, get: 'tokukizu', n: 1 });
  m.o({ k: 'chest', id: 'c5', x: 2, y: 11, get: 'hikarifuda', n: 3 });
  m.o({ k: 'npc', id: 'boss', yokai: 'umibozu', x: 27, y: 2, dir: 'down', ev: 'boss_umibozu', show: '!ch3_clear', big: 1 });
  [[4, 13], [13, 5], [13, 20], [22, 15], [26, 8], [27, 17], [25, 12]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'umidou', r: 2 }));
  MAPS.umidou = m.out();
}

/* ================= 黒嶺の山道（第4章の野） ================= */
{
  const m = new M('kuromine', 36, 30, '#', { name: '黒嶺の山道', area: '風魔', theme: 'darkmount', bgm: 'field4', bbg: 'darkmount', start: [17, 28, 'up'] });
  m.rect(11, 22, 14, 8, 'g'); m.rect(4, 22, 8, 5, 'g'); m.rect(13, 14, 10, 8, 'g'); m.rect(3, 6, 9, 7, 'g'); m.rect(8, 13, 1, 4, 'g');
  m.rect(24, 4, 9, 9, 'g'); m.rect(23, 16, 5, 3, 'g'); m.rect(13, 3, 10, 9, 'g');
  m.scatter('Y', 16, 11, 22, 14, 8, 'g'); m.scatter('Y', 8, 3, 6, 9, 7, 'g'); m.scatter('Y', 10, 24, 4, 9, 9, 'g'); m.scatter('r', 12, 13, 3, 10, 18, 'g');
  m.line([[17, 29], [17, 22]], ',', 2); m.line([[11, 24], [8, 24]], ',', 1);
  m.line([[17, 21], [17, 14]], ',', 2); m.line([[13, 16], [8, 16], [8, 12]], ',', 1);
  m.line([[22, 17], [27, 17], [27, 12]], ',', 1);
  m.line([[17, 13], [17, 11]], ',', 2); m.line([[17, 3], [17, 0]], ',', 2);
  m.deco('gate', 15, 0, 6, 1, { pass: [[2, 0], [3, 0]], label: '風魔の砦' });
  m.o({ k: 'exit', id: 'out', x: 17, y: 29, w: 2, h: 1, to: 'travel' });
  m.o({ k: 'exit', id: 'toride', x: 17, y: 0, w: 2, h: 1, to: 'toride', tx: 16, ty: 26, dir: 'up' });
  m.o({ k: 'gate', id: 'block', x: 17, y: 13, w: 2, h: 1, open: 'ch4_duel1' });
  m.o({ k: 'npc', id: 'rotten', cn: 'rotten', x: 16, y: 15, dir: 'down', ev: 'duel1', show: '!ch4_duel1' });
  m.o({ k: 'npc', id: 'dan', cn: 'dan', x: 19, y: 15, dir: 'down', ev: 'duel1', show: '!ch4_duel1' });
  m.o({ k: 'npc', id: 'karma', cn: 'karma', x: 5, y: 8, dir: 'right', ev: 'karma_talk', show: '!has:karma' });
  m.o({ k: 'npc', id: 'janome', cn: 'janome', x: 6, y: 24, dir: 'right', ev: 'janome_talk', show: '!has:janome' });
  m.o({ k: 'npc', id: 'orochi', yokai: 'orochi', x: 31, y: 5, dir: 'down', ev: 'orochi_found', show: 'janome_asked&!orochi_found' });
  m.o({ k: 'chest', id: 'c1', x: 4, y: 26, get: 'tokukizu', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 31, y: 11, get: 'kongou', n: 1 });
  m.o({ k: 'chest', id: 'c3', x: 4, y: 7, get: 'tamahagane', n: 2 });
  m.o({ k: 'chest', id: 'c4', x: 21, y: 4, get: 'reisui', n: 2 });
  m.o({ k: 'sign', id: 's1', x: 16, y: 23, text: '黒嶺の山道　北：風魔の砦（よそ者は帰れ）' });
  [[13, 26], [21, 25], [6, 23], [15, 18], [20, 19], [6, 9], [27, 6], [29, 10], [15, 6], [20, 8]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'kuromine', r: 2 }));
  MAPS.kuromine = m.out();
  MAPS.kuromine.auto = [{ ev: 'kuromine_enter', show: '!kuromine_entered' }];
}

/* ================= 風魔の砦（第4章のダンジョン） ================= */
{
  const m = new M('toride', 34, 28, 'W', { name: '風魔の砦', area: '風魔', theme: 'fortress', bgm: 'fortress', bbg: 'fortress', start: [16, 26, 'up'] });
  m.rect(11, 20, 12, 8, 'p');
  m.rect(3, 19, 7, 6, 'p'); m.line([[9, 22], [11, 22]], 'p', 1);
  m.rect(24, 19, 7, 6, 'p'); m.line([[22, 22], [24, 22]], 'p', 1);
  m.rect(12, 11, 10, 8, 'p'); m.line([[16, 19], [16, 20]], 'p', 2);
  m.rect(3, 9, 6, 7, 'p'); m.line([[6, 16], [6, 19]], 'p', 1); m.line([[9, 13], [12, 13]], 'p', 1);
  m.rect(25, 9, 6, 7, 'p'); m.line([[27, 16], [27, 19]], 'p', 1); m.line([[22, 13], [25, 13]], 'p', 1);
  m.rect(10, 2, 14, 7, 'p'); m.line([[16, 9], [16, 11]], 'p', 2);
  m.rect(3, 2, 5, 5, 'p'); m.line([[8, 4], [10, 4]], 'p', 1);
  m.deco('banner', 12, 2, 1, 1); m.deco('banner', 21, 2, 1, 1); m.deco('brazier', 11, 20, 1, 1); m.deco('brazier', 22, 20, 1, 1);
  m.deco('brazier', 12, 11, 1, 1); m.deco('brazier', 21, 11, 1, 1);
  m.o({ k: 'exit', id: 'out', x: 15, y: 27, w: 3, h: 1, to: 'kuromine', tx: 17, ty: 1, dir: 'down' });
  m.o({ k: 'step', id: 'kohaku_ev', x: 12, y: 16, w: 10, h: 1, ev: 'kohaku_duel', once: 1, show: '!has:kohaku' });
  m.o({ k: 'gate', id: 'upper', x: 16, y: 9, w: 2, h: 1, open: 'has:kohaku' });
  m.o({ k: 'npc', id: 'kohaku', cn: 'kohaku', x: 16, y: 13, dir: 'down', ev: 'kohaku_duel', show: '!has:kohaku' });
  m.o({ k: 'npc', id: 'ibuki', cn: 'ibuki', x: 27, y: 22, dir: 'left', ev: 'ibuki_talk', show: '!has:ibuki' });
  m.o({ k: 'npc', id: 'yama', yokai: 'yama', x: 4, y: 3, dir: 'down', ev: 'yama_found', show: 'ibuki_asked&!yama_found' });
  m.o({ k: 'npc', id: 'atoza', cn: 'atoza', x: 16, y: 4, dir: 'down', ev: 'boss_atoza', show: '!ch4_clear' });
  m.o({ k: 'npc', id: 'aum', cn: 'aum', x: 19, y: 5, dir: 'down', ev: 'aum_talk', show: '!ch4_clear' });
  m.o({ k: 'npc', id: 'shop', look: 'merchant2', name: '風魔の商人', x: 4, y: 21, dir: 'right', ev: 'shop_fuma', show: 'ch4_clear' });
  m.o({ k: 'npc', id: 'inn', look: 'innkeeper', name: '砦の宿番', x: 29, y: 21, dir: 'left', ev: 'inn_fuma', show: 'ch4_clear' });
  m.o({ k: 'chest', id: 'c1', x: 4, y: 10, get: 'tokukizu', n: 2 });
  m.o({ k: 'chest', id: 'c2', x: 29, y: 10, get: 'eichi', n: 1 });
  m.o({ k: 'chest', id: 'c3', x: 6, y: 23, get: 'tamahagane', n: 2 });
  m.o({ k: 'chest', id: 'c4', x: 7, y: 5, get: 'gouriki', n: 1 });
  m.o({ k: 'chest', id: 'c5', x: 26, y: 23, get: 'reisui', n: 2, show: 'ch4_clear' });
  [[13, 24], [20, 25], [5, 21], [28, 20], [14, 15], [5, 12], [28, 13], [12, 6]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'toride', r: 2, show: '!ch4_clear' }));
  MAPS.toride = m.out();
}

/* ================= 天の社（終章） ================= */
{
  const m = new M('ten', 30, 22, 'v', { name: '天の社', area: '天界', theme: 'sky', bgm: 'sky', bbg: 'sky', town: 1, start: [14, 19, 'up'] });
  m.ell(14.5, 10.5, 13, 10, 'c');
  m.rect(10, 2, 10, 6, '_'); m.line([[14, 8], [14, 20]], '_', 2); m.rect(14, 20, 2, 2, 'c');
  m.scatter('f', 10, 3, 6, 24, 12, 'c');
  m.deco('bell', 12, 2, 6, 3, { label: '暁の鐘' });
  m.deco('torii', 12, 8, 6, 1, { pass: [[2, 0], [3, 0]], v: 'gold' });
  m.deco('lantern', 9, 4, 1, 1); m.deco('lantern', 20, 4, 1, 1);
  m.deco('stair_down', 5, 15, 3, 2, { pass: [[1, 1]] });
  m.o({ k: 'npc', id: 'sattva', cn: 'sattva', x: 15, y: 6, dir: 'down', ev: 'sattva_talk', show: '!has:sattva' });
  m.o({ k: 'npc', id: 'jin', cn: 'jin', x: 20, y: 9, dir: 'left', ev: 'jin_talk', show: 'sattva_met&!has:jin' });
  m.o({ k: 'npc', id: 'shop', look: 'maiden', name: '天女', x: 21, y: 14, dir: 'left', ev: 'shop_ten' });
  m.o({ k: 'npc', id: 'inn', look: 'maiden2', name: '天女', x: 8, y: 11, dir: 'right', ev: 'inn_ten' });
  m.o({ k: 'chest', id: 'c1', x: 24, y: 11, get: 'manno', n: 1 });
  m.o({ k: 'chest', id: 'c2', x: 4, y: 9, get: 'shippu', n: 1 });
  m.o({ k: 'exit', id: 'out', x: 14, y: 21, w: 2, h: 1, to: 'travel' });
  m.o({ k: 'exit', id: 'down', x: 6, y: 16, w: 1, h: 1, to: 'nenokuni', tx: 19, ty: 27, dir: 'up', show: 'ne_open' });
  m.o({ k: 'sign', id: 's1', x: 9, y: 16, text: '根の国への階段。灯りのない者は、帰り道を見失う' });
  MAPS.ten = m.out();
  MAPS.ten.auto = [{ ev: 'ten_enter', show: '!ten_entered' }];
}

/* ================= 根の国（終章のダンジョン） ================= */
{
  const m = new M('nenokuni', 38, 30, 'D', { name: '根の国', area: '根の国', theme: 'under', bgm: 'final_dungeon', bbg: 'under', start: [19, 27, 'up'], dark: 1 });
  m.rect(14, 24, 11, 6, 'k'); m.scatter('l', 10, 14, 24, 11, 6, 'k');
  // 左の道：岩と穴
  m.rect(4, 20, 9, 6, 'k'); m.line([[12, 26], [14, 26]], 'k', 1);
  m.rect(4, 12, 4, 7, 'k'); m.set(5, 19, 'k'); m.rect(4, 8, 9, 4, 'k');
  // 右の道：霧とひび割れ
  m.rect(26, 20, 8, 6, 'k'); m.line([[24, 26], [26, 26]], 'k', 1);
  m.rect(30, 12, 4, 7, 'k'); m.set(31, 19, 'k'); m.set(32, 19, 'k'); m.rect(25, 8, 9, 4, 'k');
  // 黒い川と中央
  m.rect(13, 13, 12, 8, 'k'); m.rect(13, 16, 12, 2, '~'); m.set(18, 16, '='); m.set(18, 17, '='); m.set(19, 16, '='); m.set(19, 17, '=');
  m.rect(22, 9, 3, 1, 'k');
  m.line([[19, 21], [19, 24]], 'k', 2);
  // 最奥
  m.rect(12, 2, 14, 6, 'k'); m.line([[18, 8], [18, 13]], 'k', 2); m.scatter('l', 14, 12, 2, 14, 6, 'k');
  m.scatter('l', 8, 4, 8, 30, 14, 'k');
  // しかけ：中央は川の向こう→隠し道。左は岩で穴を、右は霧とひび割れ
  m.o({ k: 'pit', id: 'pit1', x: 5, y: 19 }); m.o({ k: 'obst', id: 'b1', kind: 'boulder', x: 5, y: 21 });
  m.o({ k: 'obst', id: 'fog1', kind: 'fog', x: 31, y: 19, grp: 'f' }); m.o({ k: 'obst', id: 'fog2', kind: 'fog', x: 32, y: 19, grp: 'f' });
  m.o({ k: 'obst', id: 'crack1', kind: 'crack', x: 25, y: 9 });
  m.set(18, 12, 'D'); m.set(19, 12, 'D'); m.o({ k: 'obst', id: 'h1', kind: 'hidden', x: 18, y: 12, grp: 'c' }); m.o({ k: 'obst', id: 'h2', kind: 'hidden', x: 19, y: 12, grp: 'c' });
  m.o({ k: 'gate', id: 'seal', x: 18, y: 8, w: 2, h: 1, open: 'ne_seal_l&ne_seal_r' });
  m.o({ k: 'npc', id: 'sealL', yokai: 'seal_stone', x: 5, y: 9, dir: 'down', ev: 'ne_seal_l', show: '!ne_seal_l' });
  m.o({ k: 'npc', id: 'sealR', yokai: 'seal_stone', x: 32, y: 9, dir: 'down', ev: 'ne_seal_r', show: '!ne_seal_r' });
  m.o({ k: 'npc', id: 'sasagane', cn: 'sasagane', x: 21, y: 25, dir: 'left', ev: 'sasagane_talk', show: '!has:sasagane' });
  m.o({ k: 'step', id: 'sasa_ev', x: 14, y: 27, w: 11, h: 1, ev: 'sasagane_talk', once: 1, show: '!has:sasagane' });
  m.o({ k: 'npc', id: 'boss', yokai: 'yogarasu', x: 19, y: 3, dir: 'down', ev: 'boss_final', show: '!ch5_clear', big: 1 });
  m.o({ k: 'chest', id: 'c1', x: 5, y: 24, get: 'manno', n: 1 });
  m.o({ k: 'chest', id: 'c2', x: 33, y: 24, get: 'reisui', n: 2 });
  m.o({ k: 'chest', id: 'c3', x: 14, y: 14, get: 'migawari', n: 1 });
  m.o({ k: 'chest', id: 'c4', x: 24, y: 19, get: 'tokukizu', n: 3 });
  m.o({ k: 'chest', id: 'c5', x: 13, y: 3, get: 'choumei', n: 1 });
  m.o({ k: 'chest', id: 'c6', x: 22, y: 9, get: 'tamahagane', n: 3 });
  m.o({ k: 'exit', id: 'up', x: 19, y: 29, w: 2, h: 1, to: 'ten', tx: 6, ty: 17, dir: 'down' });
  [[16, 26], [7, 22], [5, 14], [9, 9], [29, 22], [32, 14], [28, 9], [15, 18], [22, 14], [20, 5]].forEach(([x, y], i) => m.o({ k: 'enemy', id: 'e' + i, x, y, pool: 'nenokuni', r: 2 }));
  MAPS.nenokuni = m.out();
}

/* ================= 旅の地図 ================= */
const TRAVEL = {
  nodes: [
    { id: 'koka', name: '甲賀の里', x: 300, y: 470, map: 'koka', at: [14, 19, 'up'] },
    { id: 'kitsunebi', name: '狐火の森', x: 180, y: 390, map: 'kitsunebi', at: [17, 26, 'up'], show: 'op_done' },
    { id: 'iga', name: '伊賀の里', x: 430, y: 330, map: 'iga', at: [15, 20, 'up'], show: 'ch1_clear' },
    { id: 'kirimichi', name: '霧の山道', x: 500, y: 200, map: 'kirimichi', at: [17, 28, 'up'], show: 'ch1_clear' },
    { id: 'saika', name: '雑賀の港', x: 640, y: 470, map: 'saika', at: [1, 10, 'right'], show: 'ch2_clear' },
    { id: 'shiokaze', name: '潮風の浜', x: 790, y: 520, map: 'shiokaze', at: [1, 12, 'right'], show: 'ch2_clear' },
    { id: 'kuromine', name: '黒嶺の山道', x: 820, y: 230, map: 'kuromine', at: [17, 28, 'up'], show: 'ch3_clear' },
    { id: 'ten', name: '天の社', x: 640, y: 80, map: 'ten', at: [14, 20, 'up'], show: 'ch4_clear' }
  ],
  edges: [['koka', 'kitsunebi'], ['koka', 'iga'], ['iga', 'kirimichi'], ['iga', 'saika'], ['koka', 'saika'], ['saika', 'shiokaze'], ['saika', 'kuromine', 'sea'], ['kirimichi', 'ten', 'sky'], ['kuromine', 'ten', 'sky']]
};

// ---- 書き出し ----
const header = `/* ニンジャ夜明け隊（RPG） — 地図（tools/build_maps.mjs が作る。手で直さない）
 * rows: マスの文字（field.js の TILES）  objs: 物（deco 家など / npc 人 / chest 宝箱 / pickup 拾える物 / sign 看板 /
 *   obst 障害物（boulder 大岩・fog 霧・crack ひび割れ・hidden 隠し道）/ pit 穴 / gate 旗で開く通せんぼ / enemy 妖怪シンボル / exit 出口 / step 踏むと始まる）
 * show: 出ている条件（field.js の cond）
 */
`;
const body = `(function (root) {
  'use strict';
  var MAPS = ${JSON.stringify(MAPS)};
  var TRAVEL = ${JSON.stringify(TRAVEL)};
  var api = { MAPS: MAPS, TRAVEL: TRAVEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_MAPS = api;
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(here, '..', 'data_maps.js'), header + body);

// ---- 見本の表示（node build_maps.mjs show koka）----
if (process.argv[2] === 'show') {
  const id = process.argv[3];
  const mm = MAPS[id];
  const g = mm.rows.map(r => r.split(''));
  const mark = { npc: 'N', chest: 'C', pickup: 'P', sign: 'i', obst: 'O', pit: 'o', gate: 'G', enemy: 'e', exit: 'X', step: '*' };
  mm.objs.forEach(o => {
    if (o.k === 'deco') { for (let y = o.y; y < o.y + (o.h || 1); y++) for (let x = o.x; x < o.x + (o.w || 1); x++) if (g[y] && g[y][x] != null) g[y][x] = 'H'; return; }
    for (let y = o.y; y < o.y + (o.h || 1); y++) for (let x = o.x; x < o.x + (o.w || 1); x++) if (g[y] && g[y][x] != null) g[y][x] = mark[o.k] || '?';
  });
  console.log(id + ' ' + mm.rows[0].length + 'x' + mm.rows.length);
  g.forEach((r, i) => console.log(String(i).padStart(2) + ' ' + r.join('')));
}
console.log('maps:', Object.keys(MAPS).join(', '));
