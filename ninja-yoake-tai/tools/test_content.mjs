// 内容の整合テスト（仲間・忍術・妖怪・地図・物語・旅の地図・曲・絵）。設計書 §13 の 2・6 にあたる。
//   node ninja-yoake-tai/tools/test_content.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const G = require('./load.cjs');
require(path.join(ROOT, 'draw_yokai.js'));
require(path.join(ROOT, 'audio.js'));
const BS = G.NYT_BASE, SKD = G.NYT_SKILLS, CHD = G.NYT_CHARS, EN = G.NYT_ENEMIES, IT = G.NYT_ITEMS, MP = G.NYT_MAPS, STORY = G.NYT_STORY, FD = G.NYT_FIELD, ST = G.NYT_STATE;
const YK = G.NYT_YOKAI, AU = G.NYT_AUDIO, NSL = G.NSL_CHARS;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  NG: ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '  (' + JSON.stringify(a) + ' != ' + JSON.stringify(b) + ')'); }
function none(list, msg) { eq(list, [], msg); }
function section(t) { console.log('■ ' + t); }
const TYPES = BS.TYPE_IDS, TG = ['e1', 'ea', 'er', 'a1', 'aa', 'me', 'ko'];
const C = CHD.CHARS, ids39 = CHD.ORDER;
const anyItem = id => !!(IT.ITEMS[id] || IT.CHARMS[id] || IT.MATS[id] || IT.KEYS[id]);

// ---------------- 仲間 ----------------
section('仲間（39人＋主人公）');
eq(ids39.length, 39, '仲間は39人');
eq(new Set(ids39).size, 39, '同じ人が2度いない');
none(ids39.filter(id => !C[id] || !NSL.BY_ID[id]), 'どの仲間にも能力と公式データがある');
eq(Object.keys(C).length, 40, '主人公＋39人');
none(Object.keys(C).filter(id => !BS.ARCH[C[id].arch] || !C[id].roles.every(r => BS.ROLES[r]) || TYPES.indexOf(C[id].wt) < 0 || !C[id].wn), '能力の伸び方・役割・こうげきの型・武器名');
none(ids39.filter(id => (C[id].sk || []).length !== 5), '仲間はそれぞれ忍術を5つ覚える');
none(Object.keys(C).filter(id => (C[id].sk || []).some(p => !SKD.SKILLS[p[0]] || !(p[1] >= 1 && p[1] <= 50))), '覚える忍術はどれもある（レベル1〜50）');
none(ids39.filter(id => !(C[id].sk || []).some(p => SKD.SKILLS[p[0]].ult)), 'どの仲間にも大技がある');
const fields = ids39.filter(id => C[id].field).map(id => C[id].field).sort();
eq(fields, ['bomb', 'hawk', 'push', 'wind'], '探索の術は4つ（リーリー・鷹の目・風遁・焙烙玉）');
none(Object.keys(FD.ABILITY).filter(a => C[FD.ABILITY[a]].field !== a), '探索の術の持ち主が合っている');
none(ids39.filter(id => !C[id].hint && !(STORY.STORY_HINT || {})[id]), '仲間帳のヒントがどの仲間にもある');
none(ids39.filter(id => !fs.existsSync(path.join(ROOT, '..', 'ninja-sato-life', 'img', 'art', id + '.jpg'))), '公式の絵（顔）がそろっている');

// ---------------- 忍術 ----------------
section('忍術・絆技');
const S = SKD.SKILLS;
const FX_KEYS = ['st', 'ch', 'buff', 'v', 'to', 'reveal', 'cover', 'counter', 'evade', 'taunt', 'clone', 'mist', 'regen', 't', 'cure', 'revive', 'reviveAll', 'sacrifice', 'bp', 'kz', 'curse', 'healAll', 'stunAll', 'escape', 'fortune', 'summon', 'n', 'flee', 'crit', 'sure', 'lowhp', 'drain', 'shield'];
const badSk = [];
for (const id in S) {
  const s = S[id];
  if (!s.n || !s.d || ['atk', 'heal', 'sup'].indexOf(s.k) < 0 || TG.indexOf(s.tg) < 0 || !s.an || !(s.sp >= 0)) badSk.push(id + ':基本');
  if (s.k === 'atk' && !(s.pw > 0)) badSk.push(id + ':威力');
  if (s.ty && TYPES.indexOf(s.ty) < 0 && s.ty !== 'rand') badSk.push(id + ':型');
  if (s.k === 'atk' && !s.ty && !s.tys) badSk.push(id + ':型なし');
  (s.fx || []).forEach(f => Object.keys(f).forEach(k => { if (FX_KEYS.indexOf(k) < 0) badSk.push(id + ':fx.' + k); }));
  (s.fx || []).forEach(f => { if (f.st && !BS.STATUS[f.st]) badSk.push(id + ':状態'); if (f.buff && !BS.BUFF_NAME[f.buff]) badSk.push(id + ':強化'); if (f.summon && !EN.ENEMIES[f.summon]) badSk.push(id + ':呼ぶ'); });
}
none(badSk, '忍術の中身（種類・ねらい・型・効果）が正しい');
none(Object.keys(S).filter(id => !Object.keys(C).some(c => (C[c].sk || []).some(p => p[0] === id)) && !/^h_ak/.test(id)), '使われていない忍術がない');
const KZ = SKD.KIZUNA;
none(KZ.filter(z => !C[z.a] || !C[z.b] || z.a === z.b || !z.n || !z.d || (z.k === 'atk' && (z.tys || [z.ty]).some(t => TYPES.indexOf(t) < 0 && t !== 'rand')) || TG.indexOf(z.tg) < 0).map(z => z.id), '絆技の組と型');
eq(new Set(KZ.map(z => z.id)).size, KZ.length, '絆技の名前はかぶらない');
eq(new Set(KZ.map(z => [z.a, z.b].sort().join('+'))).size, KZ.length, '同じ組の絆技は1つ');
for (const t of TYPES) ok(Object.keys(C).some(c => C[c].wt === t || (C[c].sk || []).some(p => S[p[0]].ty === t)), '型「' + BS.TYPES[t].name + '」を使える仲間がいる');

// ---------------- 妖怪 ----------------
section('妖怪・群れ・ボス');
const E = EN.ENEMIES;
const badE = [];
for (const id in E) {
  const e = E[id];
  if (!e.n || !(e.lv >= 1) || !(e.shield >= 1) || !(e.weak || []).length) badE.push(id + ':基本');
  if (e.cn) { if (!C[e.cn]) badE.push(id + ':cn'); }
  else { if (!YK.SIZE[e.shape]) badE.push(id + ':形'); if (!YK.PAL[e.col]) badE.push(id + ':色'); }
  (e.weak || []).concat(e.res || []).forEach(t => { if (TYPES.indexOf(t) < 0) badE.push(id + ':弱点の型'); });
  if ((e.weak || []).some(t => (e.res || []).indexOf(t) >= 0)) badE.push(id + ':弱点と耐性が重なる');
  (e.acts || []).forEach(a => { if (!EN.ESK[a.s] && !S[a.s]) badE.push(id + ':技' + a.s); });
  (e.skills || []).forEach(s => { if (!S[s] && !EN.ESK[s]) badE.push(id + ':術' + s); });
  (e.drops || []).forEach(d => { if (!anyItem(d.i || d.c || d.m)) badE.push(id + ':落とし物'); });
  if (e.next && !E[e.next]) badE.push(id + ':変身先');
  if (e.boss && !e.cn && !e.size) badE.push(id + ':大きさ');
  if (!e.desc && !e.duel) badE.push(id + ':説明');
}
none(badE, '妖怪の中身（形・色・弱点・技・落とし物）');
none(Object.keys(EN.ESK).filter(k => { const s = EN.ESK[k]; return ['atk', 'heal', 'sup'].indexOf(s.k) < 0 || TG.indexOf(s.tg) < 0 || !s.an || (s.ty && TYPES.indexOf(s.ty) < 0); }), '妖怪の技の中身');
none(Object.keys(EN.POOLS).filter(p => EN.POOLS[p].some(g => !g.length || g.length > 5 || g.some(id => !E[id]))), '群れの組み合わせ（1〜5体）');
none(Object.keys(EN.RARE).filter(p => !E[EN.RARE[p]] || !EN.POOLS[p]), 'めずらしい妖怪');

// ---------------- 地図 ----------------
section('地図（出口・人・宝箱・障害物）');
const M = MP.MAPS, EVT = STORY.EVENTS;
const badM = [];
for (const id in M) {
  const m = M[id], W = m.rows[0].length;
  if (m.rows.some(r => r.length !== W)) badM.push(id + ':行の長さ');
  if (!m.name || !AU.SONGS[m.bgm] || !m.bbg) badM.push(id + ':名前・曲・戦いの背景');
  const S0 = ST.fresh('t'); const F = FD.load(S0, id);
  const tileOK = (x, y) => FD.tileInfo(FD.tileAt(F, x, y)).w;
  if (!tileOK(m.start[0], m.start[1])) badM.push(id + ':はじめの位置');
  (m.auto || []).forEach(a => { if (!EVT[a.ev]) badM.push(id + ':auto ' + a.ev); });
  m.objs.forEach(o => {
    const w = o.w || 1, h = o.h || 1, where = id + ':' + (o.id || o.k) + ' ';
    if (o.x < 0 || o.y < 0 || o.x + w > W || o.y + h > m.rows.length) badM.push(where + '地図の外');
    if (o.k === 'exit') {
      if (o.to !== 'travel') { if (!M[o.to]) badM.push(where + '行き先'); else { const F2 = FD.load(S0, o.to); if (!FD.tileInfo(FD.tileAt(F2, o.tx, o.ty)).w) badM.push(where + '着く場所が歩けない'); } }
      for (let yy = o.y; yy < o.y + h; yy++) for (let xx = o.x; xx < o.x + w; xx++) if (!tileOK(xx, yy)) badM.push(where + '出口が歩けない');
    }
    if (o.k === 'npc') { if (o.ev && !EVT[o.ev]) badM.push(where + 'イベント'); if (!o.ev && !(o.say && o.say.length)) badM.push(where + '話すことがない'); if (!tileOK(o.x, o.y)) badM.push(where + '歩けない所にいる'); if (o.cn && !C[o.cn]) badM.push(where + 'cn'); if (o.yokai && !E[o.yokai] && !YK.SIZE[o.yokai]) badM.push(where + '妖怪'); }
    if (o.k === 'chest' && o.get !== 'gold' && !anyItem(o.get)) badM.push(where + '宝箱の中身');
    if (o.k === 'chest' && !tileOK(o.x, o.y)) badM.push(where + '宝箱の場所');
    if (o.k === 'pickup' && !anyItem(o.get)) badM.push(where + '拾う物');
    if (o.k === 'enemy' && !EN.POOLS[o.pool] && !o.group) badM.push(where + '群れ');
    if (o.k === 'enemy' && !tileOK(o.x, o.y)) badM.push(where + '妖怪の場所');
    if (o.k === 'step' && !EVT[o.ev]) badM.push(where + '踏むイベント');
    if (o.k === 'sign' && !o.text) badM.push(where + '立て札');
    if (o.k === 'obst' && ['boulder', 'fog', 'crack', 'hidden'].indexOf(o.kind) < 0) badM.push(where + '障害物の種類');
  });
}
none(badM, 'すべての地図で、出口・人・宝箱・障害物が正しい場所にある');
const T = MP.TRAVEL;
none(T.nodes.filter(n => !M[n.map] || !FD.tileInfo(FD.tileAt(FD.load(ST.fresh('t'), n.map), n.at[0], n.at[1])).w), '旅の地図の行き先と着く場所');
none(T.edges.filter(e => !T.nodes.some(n => n.id === e[0]) || !T.nodes.some(n => n.id === e[1])), '旅の地図の道');
ok(Object.keys(M).every(id => T.nodes.some(n => n.map === id) || Object.keys(M).some(o => M[o].objs.some(q => q.k === 'exit' && q.to === id)) || Object.values(EVT).some(cmds => cmds.some(c => c.warp === id))), 'どの地図にも入り口がある');

// ---------------- 物語 ----------------
section('物語のイベント');
const KNOWN = ['set', 'unset', 'title', 'sub', 'say', 't', 'npc', 'move', 'hide', 'show', 'dir', 'join', 'sfx', 'shake', 'battle', 'tut', 'bbg', 'save', 'walk', 'if', 'go', 'end', 'lbl', 'take', 'give', 'n', 'quiet', 'ask', 'who', 'opts', 'lose', 'loseGo', 'clear', 'msg', 'boss', 'bgm', 'frag', 'guests', 'guestLv', 'fade', 'warp', 'x', 'y', 'flash', 'ending', 'shop', 'inn', 'gold', 'heal', 'noFlee', 'emote', 'e', 'wait', 'face', 'learn', 'chapter', 'open', 'cut', 'party', 'travel', 'forge'];
const npcIds = new Set(); Object.values(M).forEach(m => m.objs.forEach(o => { if (o.k === 'npc') npcIds.add(o.id); }));
const BBG = ['village', 'forest', 'cave', 'mountain', 'seacave', 'beach', 'darkmount', 'fortress', 'under', 'sky'];
const badS = [], joined = new Set();
for (const id in EVT) {
  const cmds = EVT[id], labels = new Set(cmds.filter(c => c.lbl).map(c => c.lbl));
  cmds.forEach((c, i) => {
    const where = id + '#' + i + ' ';
    Object.keys(c).forEach(k => { if (KNOWN.indexOf(k) < 0) badS.push(where + 'しらない命令 ' + k); });
    if (c.go) (Array.isArray(c.go) ? c.go : [c.go]).forEach(g => { if (!labels.has(g)) badS.push(where + 'ラベル ' + g); });
    if (c.loseGo && !labels.has(c.loseGo)) badS.push(where + 'loseGo');
    if (c.say !== undefined && c.say !== null) { const w = c.say; if (!(w === 'hero' || C[w] || (w.startsWith('e:') && (E[w.slice(2)] || YK.SIZE[w.slice(2)])) || w.startsWith('npc:'))) badS.push(where + '話す人 ' + w); }
    if (c.say !== undefined && !c.t) badS.push(where + 'セリフがない');
    if (c.join) { if (!C[c.join]) badS.push(where + '加入'); else joined.add(c.join); }
    if (c.give && !anyItem(c.give)) badS.push(where + 'give'); if (c.take && !anyItem(c.take)) badS.push(where + 'take');
    if (c.battle) { c.battle.forEach(e => { if (!E[e]) badS.push(where + '妖怪 ' + e); }); if (c.bbg && BBG.indexOf(c.bbg) < 0) badS.push(where + '背景'); (c.guests || []).forEach(g => { if (!C[g]) badS.push(where + '助っ人'); }); }
    if (c.warp && !M[c.warp]) badS.push(where + 'warp');
    if (c.npc && !npcIds.has(c.npc)) badS.push(where + '人 ' + c.npc);
    if (c.sfx && AU.sfxNames.indexOf(c.sfx) < 0) badS.push(where + '効果音 ' + c.sfx);
    if (c.bgm && !AU.SONGS[c.bgm]) badS.push(where + '曲 ' + c.bgm);
    if (c.learn && (!C[c.learn[0]] || !S[c.learn[1]])) badS.push(where + 'learn');
    if (c.shop && !IT.SHOPS[c.shop]) badS.push(where + '店'); if (c.inn && IT.INN[c.inn] == null) badS.push(where + '宿');
    if (c.ask && !(c.opts && c.opts.length >= 2 && c.go && c.go.length === c.opts.length)) badS.push(where + 'ask の答えと行き先');
  });
}
none(badS, 'イベントの命令・行き先・人・道具・妖怪・曲がそろっている');
none(ids39.filter(id => !joined.has(id)), '39人全員に、加入のイベントがある');
const used = new Set(); Object.values(M).forEach(m => { (m.auto || []).forEach(a => used.add(a.ev)); m.objs.forEach(o => { if (o.ev) used.add(o.ev); }); });
none(Object.keys(EVT).filter(id => !used.has(id)), 'どのイベントも、地図のどこかから始まる');
['title', 'town', 'battle', 'boss', 'final', 'victory', 'join', 'frag', 'ending'].forEach(n => ok(!!AU.SONGS[n], '曲「' + n + '」がある'));
none(Object.keys(AU.SONGS).filter(n => { try { const c = AU.compile(AU.SONGS[n]); return !(c.len > 0) || c.tracks.some(t => t.ev.some(e => e.n.some(x => !(x > 20 && x < 110)))); } catch (e) { return true; } }), '曲の楽譜が読める（音の高さが正しい）');

// ---------------- 店・道具 ----------------
section('店・道具・お守り');
none(Object.keys(IT.SHOPS).filter(t => IT.SHOPS[t].items.some(i => !IT.ITEMS[i]) || IT.SHOPS[t].charms.some(c => !IT.CHARMS[c]) || IT.INN[t] == null), '店の品物と宿');
none(Object.keys(IT.ITEMS).filter(i => !(IT.ITEMS[i].price > 0) || !IT.ITEMS[i].n || !IT.ITEMS[i].d), '道具の値段と説明');
none(Object.keys(IT.CHARMS).filter(c => !IT.CHARMS[c].d || (!(IT.CHARMS[c].price > 0) && Object.values(IT.SHOPS).some(s => s.charms.indexOf(c) >= 0))), 'お守りの値段と説明（店で売るものは値段つき）');
none(Object.keys(IT.CHARMS).filter(c => !Object.values(IT.SHOPS).some(s => s.charms.indexOf(c) >= 0) && !Object.values(E).some(e => (e.drops || []).some(d => d.c === c)) && !Object.values(M).some(m => m.objs.some(o => o.get === c))), 'どのお守りも、どこかで手に入る');
ok(IT.FORGE.length === IT.WEAPON_MAX && IT.FORGE.slice(1).every(f => f.gold > 0 && f.tama > 0), '鍛冶の費用');

console.log(`\n結果: ${pass} 件合格 / ${fail} 件不合格`);
process.exit(fail ? 1 : 0);
