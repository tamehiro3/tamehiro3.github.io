// 自動で最初から最後まで遊ぶテスト（行き止まりがないか・39人全員が仲間になるか・ボスのときのレベル）
// node ninja-yoake-tai/tools/playthrough.mjs [種] [-v]
// 画面は使わない。歩く・話す・調べる・戦う（おまかせ）を、判定（field.js / script.js / battle.js）にそのまま渡す。
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('./load.cjs');
const ST = G.NYT_STATE, FD = G.NYT_FIELD, SC = G.NYT_SCRIPT, BT = G.NYT_BATTLE, MP = G.NYT_MAPS, STORY = G.NYT_STORY, CHD = G.NYT_CHARS, BASE = G.NYT_BASE, IT = G.NYT_ITEMS;

const SEED = +(process.argv[2] || 7);
const VERBOSE = process.argv.includes('-v');
const rng = BASE.rng(SEED);
const log = (...a) => { if (VERBOSE) console.log(...a); };
const stats = { battles: 0, symbolBattles: 0, losses: 0, grind: 0, steps: 0, inns: 0, bossLv: {}, chapterBattles: {}, events: 0 };

let S = ST.fresh('テスト', { set: 'ai', hair: 'short' });
S.seed = SEED;
S.map = { id: 'koka', x: 15, y: 7, dir: 'up' };
let F = null, P = { x: 15, y: 7, dir: 'up' };
let pending = [];   // 実行待ちのイベント

function chapterKey() { return S.flags.ch4_clear ? 'ch5' : S.flags.ch3_clear ? 'ch4' : S.flags.ch2_clear ? 'ch3' : S.flags.ch1_clear ? 'ch2' : S.flags.op_done ? 'ch1' : 'op'; }

// ---------- 隊列：主人公・癒し・攻め2 ----------
function arrange() {
  const ids = S.order.slice();
  const role = id => CHD.CHARS[id].roles;
  const recent = ids.slice().reverse();
  const healer = recent.find(id => id !== 'hero' && role(id).includes('heal'));
  const atk = recent.filter(id => id !== 'hero' && id !== healer && (role(id).includes('atk') || role(id).includes('mag'))).slice(0, 2);
  let front = ['hero'];
  if (healer) front.push(healer);
  front = front.concat(atk);
  for (const id of recent) { if (front.length >= 4) break; if (!front.includes(id)) front.push(id); }
  const rest = recent.filter(id => !front.includes(id));
  S.order = front.concat(rest);
}

// ---------- 地図 ----------
function loadMap(id, x, y, dir) {
  S.map = { id, x, y, dir: dir || 'down' };
  F = FD.load(S, id);
  FD.spawnEnemies(S, F, rng);
  P = { x, y, dir: dir || 'down' };
  const def = MP.MAPS[id];
  if (def.town) innHeal(true);
  (def.auto || []).forEach(a => { if (FD.cond(S, a.show)) pending.push(a.ev); });
  runPending();
}
function innHeal(town) {
  const t = { koka: 'koka', iga: 'iga', saika: 'saika', toride: 'fuma', ten: 'ten' }[S.map.id];
  const price = t ? IT.INN[t] : 0;
  if (!town) return;
  ST.healAll(S); stats.inns++;
  if (price) ST.addGold(S, -Math.min(S.gold, price));
  // 傷薬を5つ、気付け薬を2つまでそろえる
  const shop = IT.SHOPS[t];
  if (shop) {
    const buy = (id, n) => { if (!shop.items.includes(id)) return; while ((S.items[id] || 0) < n && S.gold >= IT.ITEMS[id].price) { S.gold -= IT.ITEMS[id].price; ST.addItem(S, id, 1); } };
    buy(S.frag >= 2 ? 'jokizu' : 'kizugusuri', 5); buy('kitsuke', 2); buy('hyorogan', 3);
  }
}

// ---------- 戦闘 ----------
function snapshot() { return JSON.stringify(S); }
function restore(js) { const keepF = F; S = JSON.parse(js); host.S = S; F = keepF; FD.refresh(S, F); }
function fight(opts) {
  arrange();
  const B = BT.create(S, { enemies: opts.enemies, noFlee: opts.noFlee, guests: opts.guests, guestLv: opts.guestLv, ambush: opts.ambush || null });
  const res = BT.runAuto(B, 6000);
  const out = BT.finish(B);
  stats.battles++;
  const ck = chapterKey(); stats.chapterBattles[ck] = (stats.chapterBattles[ck] || 0) + 1;
  if (res !== 'win') {
    if (res === 'lose') stats.losses++;
  }
  // 戦いのあと、HPが少なければ道具で回復（傷薬）
  S.order.forEach(id => { const m = S.members[id], st = ST.stats(S, id); if (m.hp < st.hp * 0.4 && (S.items.kizugusuri || S.items.jokizu)) { const it = S.items.jokizu ? 'jokizu' : 'kizugusuri'; ST.addItem(S, it, -1); m.hp = Math.min(st.hp, m.hp + IT.ITEMS[it].v); } });
  return { res, rounds: B.round, out };
}
// 負けたら：戦いの前にもどして、その地図で修行してからやり直す
function storyBattle(opts) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const snap = snapshot();
    const r = fight(opts);
    if (r.res === 'win') return 'win';
    if (opts.lose === 'continue') return 'lose';
    restore(snap);
    ST.healAll(S);
    log('  負け → 修行', attempt + 1, 'Lv', S.members.hero.lv);
    stats.lostTo = stats.lostTo || {}; stats.lostTo[opts.enemies.join('+')] = (stats.lostTo[opts.enemies.join('+')] || 0) + 1;
    grind(2);
    ST.healAll(S);
  }
  throw new Error('どうしても勝てない: ' + JSON.stringify(opts.enemies) + ' Lv' + S.members.hero.lv);
}
function grind(levels) {
  const target = S.members.hero.lv + levels;
  const poolName = (F.objs.find(o => o.k === 'enemy') || {}).pool || nearestPool();
  const pool = G.NYT_ENEMIES.POOLS[poolName];
  let n = 0;
  while (S.members.hero.lv < target && n < 200) {
    const g = pool[Math.floor(rng() * pool.length)];
    const r = fight({ enemies: g });
    ST.healAll(S);
    n++; stats.grind++;
  }
}
function nearestPool() {
  return { op: 'village', ch1: 'forest', ch2: 'kirimichi', ch3: 'hama', ch4: 'kuromine', ch5: 'nenokuni' }[chapterKey()];
}

// ---------- イベントの host ----------
const host = {
  S,
  say(who, t, done) { log('   ', who || '', (t || '').slice(0, 40)); done(); },
  ask(who, q, opts, done) { done(0); },
  battle(o, done) { stats.events++; const r = storyBattle(o); if (o.boss) stats.bossLv[o.enemies[0]] = S.members.hero.lv; done(r); },
  join(id, lv, done) { log('  ＋仲間', id, 'Lv' + lv); done(); },
  got(id, n, done) { done(); },
  healFx(done) { done(); },
  inn(t, done) { ST.healAll(S); done(); },
  shop(t, done) { done(); },
  forge(done) { done(); },
  warp(map, x, y, dir, done) { loadMap(map, x, y, dir); done(); },
  travel(done) { done(); },
  npc(c, done) {
    const o = F.objs.find(q => q.id === c.npc);
    if (o) { if (c.hide) o.on = false; if (c.show) o.on = true; if (c.move) { const last = c.move[c.move.length - 1]; o.x = last[0]; o.y = last[1]; } }
    done();
  },
  walk(path, done) { const last = path[path.length - 1]; P.x = last[0]; P.y = last[1]; done(); },
  wait(s, done) { done(); }, fade(d, done) { done(); }, emote(w, e, done) { done(); },
  fragment(n, sk, done) { log('  ★かけら', n, sk || ''); done(); },
  title(t, sub, done) { log('==', t); done(); }, ending(done) { log('== エンディング'); done(); },
  cut(ids, t, done) { done(); }, formation(done) { done(); },
  refresh() { if (F) FD.refresh(S, F); }, save() { }, face() { }, sfx() { }, bgm() { }, shake() { }, flash() { }
};
function runEvent(id) {
  const cmds = STORY.EVENTS[id];
  if (!cmds) throw new Error('イベントがない: ' + id);
  host.S = S;
  const R = SC.create(host, cmds, { name: id });
  SC.run(R);
  if (!R.done) throw new Error('イベントが止まった: ' + id);
  FD.refresh(S, F);
}
function runPending() { while (pending.length) runEvent(pending.shift()); }

// ---------- 歩く ----------
function stepTo(nx, ny) {
  P.dir = FD.dirOf(nx - P.x, ny - P.y);
  const en = FD.enemyAt(F, nx, ny);
  if (en) { symbolBattle(en, 'none'); return false; }
  if (!FD.walkable(F, nx, ny)) return false;
  P.x = nx; P.y = ny; stats.steps++;
  for (const t of FD.stepAt(S, F, nx, ny)) {
    if (t.k === 'exit') { doExit(t); return 'exit'; }
    if (t.k === 'step') { if (t.once) S.flags['step_' + t.key] = 1; runEvent(t.ev); }
  }
  // 妖怪も動く（3歩に1歩くらい）
  for (const o of F.objs) {
    if (o.k !== 'enemy' || !o.on || o.beaten) continue;
    if (rng() < 0.33) {
      FD.enemyStep(S, F, o, P.x, P.y, rng);
      if (o.x === P.x && o.y === P.y) { symbolBattle(o, 'enemy'); }
    }
  }
  return true;
}
function symbolBattle(o, amb) {
  stats.symbolBattles++;
  const r = fight({ enemies: o.enemies, ambush: amb === 'enemy' ? 'enemy' : null });
  if (r.res === 'win' || r.res === 'flee') { o.beaten = true; o.on = false; }
  if (r.res === 'lose') { stats.losses++; ST.healAll(S); o.beaten = true; o.on = false; }
}
function doExit(t) {
  if (t.to === 'travel') { S.map.lastExit = S.map.id; travelTo(); return; }
  loadMap(t.to, t.tx, t.ty, t.dir);
}
let travelTarget = null;
function travelTo() {
  const nodes = MP.TRAVEL.nodes.filter(n => FD.cond(S, n.show));
  const n = nodes.find(q => q.map === travelTarget) || nodes[0];
  loadMap(n.map, n.at[0], n.at[1], n.at[2]);
}

// 地図のつながり：出口でつながる地図 ＋ 旅の地図（見えている旅先）
function routeTo(target) {
  const visible = MP.TRAVEL.nodes.filter(n => FD.cond(S, n.show)).map(n => n.map);
  const adj = id => {
    const out = [];
    for (const o of MP.MAPS[id].objs) if (o.k === 'exit' && FD.cond(S, o.show)) { if (o.to === 'travel') visible.forEach(v => out.push([v, o])); else out.push([o.to, o]); }
    return out;
  };
  const prev = { [S.map.id]: null }, q = [S.map.id];
  while (q.length) { const c = q.shift(); if (c === target) break; for (const [n, o] of adj(c)) if (!(n in prev)) { prev[n] = { from: c, ex: o, to: n }; q.push(n); } }
  if (!(target in prev)) return null;
  const path = []; let c = target; while (prev[c]) { path.unshift(prev[c]); c = prev[c].from; }
  return path;
}
const CLEAR = () => ({ fog: FD.hasAbility(S, 'wind'), crack: FD.hasAbility(S, 'bomb'), hidden: FD.hasAbility(S, 'hawk') });
function walkPath(tx, ty, adjacent) {
  // 行き先そのものに立つときは、そこが歩けるマスでないといけない（出口が崖の上、などを見つける）
  if (!adjacent && !FD.walkable(F, tx, ty, { clear: CLEAR(), ignoreNpc: true })) return false;
  for (let guard = 0; guard < 400; guard++) {
    if (adjacent ? (Math.abs(P.x - tx) + Math.abs(P.y - ty) === 1) : (P.x === tx && P.y === ty)) return true;
    const path = FD.path(F, P.x, P.y, tx, ty, { adjacent, clear: CLEAR() });
    if (!path) return false;
    if (!path.length) return true;
    const [nx, ny] = path[0];
    // 障害物を片づける
    const ob = F.objs.find(o => o.k === 'obst' && o.on && o.x === nx && o.y === ny);
    if (ob) { P.dir = FD.dirOf(nx - P.x, ny - P.y); const r = FD.useObstacle(S, F, ob, P.x, P.y); if (!r || !r.ok) return false; continue; }
    const r = stepTo(nx, ny);
    if (r === 'exit') return 'exit';
  }
  return false;
}
// 大岩のしかけ（押す場所と向き）
const PUSH = {
  inari: [['b1', [[15, 14, 'up'], [15, 13, 'up']]], ['b2', [[23, 16, 'up'], [23, 15, 'up'], [23, 14, 'up']]]],
  nenokuni: [['b1', [[5, 22, 'up'], [5, 21, 'up']]]]
};
function solvePushes() {
  for (const [bid, seq] of (PUSH[S.map.id] || [])) {
    const key = S.map.id + ':' + bid, c = S.cleared[key];
    if (c && c.gone) continue;
    for (const [x, y, d] of seq) {
      const b = F.objs.find(o => o.id === bid && o.k === 'obst');
      if (!b || !b.on) break;
      if (!walkPath(x, y, false)) break;
      P.dir = d;
      const f = FD.front(P.x, P.y, d);
      if (b.x === f[0] && b.y === f[1]) FD.useObstacle(S, F, b, P.x, P.y);
    }
  }
}
function goToMap(map) {
  for (let hop = 0; hop < 20 && S.map.id !== map; hop++) {
    const route = routeTo(map);
    if (!route) throw new Error('行けない: ' + S.map.id + ' → ' + map);
    const h = route[0];
    travelTarget = h.to;
    solvePushes();
    const r = walkPath(h.ex.x, h.ex.y, false);
    if (r === 'exit') continue;
    if (!r) throw new Error('出口に行けない: ' + S.map.id + ' (' + h.ex.x + ',' + h.ex.y + ') from ' + P.x + ',' + P.y);
    doExit(h.ex);
  }
  if (S.map.id !== map) throw new Error('たどり着けない: ' + map);
}
function interactObj(o) {
  P.dir = FD.dirOf(o.x - P.x, o.y - P.y);
  if (o.k === 'npc') { if (o.ev) runEvent(o.ev); return; }
  if (o.k === 'chest') { if (!S.opened[o.key]) { S.opened[o.key] = 1; if (o.get === 'gold') ST.addGold(S, o.n); else ST.addItem(S, o.get, o.n || 1); FD.refresh(S, F); } return; }
  if (o.k === 'obst') { FD.useObstacle(S, F, o, P.x, P.y); return; }
}
function doStep(st) {
  if (FD.cond(S, st.until)) return;
  goToMap(st.map);
  solvePushes();
  const o = F.objs.find(q => q.id === st.id && (st.act !== 'talk' || q.k === 'npc') && (st.act !== 'step' || q.k === 'step') && (st.act !== 'pickup' || q.k === 'pickup') && (st.act !== 'chest' || q.k === 'chest'));
  if (!o) throw new Error('見つからない: ' + st.map + ':' + st.id);
  if (!o.on) throw new Error('出ていない: ' + st.map + ':' + st.id + ' show=' + o.show);
  if (st.act === 'step') { walkPath(o.x + Math.floor((o.w || 1) / 2), o.y, false); }
  else if (st.act === 'pickup') {
    const r = walkPath(o.x, o.y, false);
    if (!r) throw new Error('拾いに行けない: ' + st.id);
    if (!S.opened[o.key]) { S.opened[o.key] = 1; ST.addItem(S, o.get, o.n || 1); FD.refresh(S, F); }
  } else {
    const r = walkPath(o.x, o.y, true);
    if (r !== true) throw new Error('近づけない: ' + st.map + ':' + st.id + ' from ' + P.x + ',' + P.y);
    interactObj(o);
  }
  if (!FD.cond(S, st.until)) {
    // もう一度（会話が2段のとき）
    const o2 = F.objs.find(q => q.id === st.id && q.on);
    if (o2 && st.act === 'talk') { walkPath(o2.x, o2.y, true); interactObj(o2); }
  }
  if (!FD.cond(S, st.until)) throw new Error('進まない: ' + JSON.stringify(st));
}

const STEPS = [
  ['koka', 'oto', 'talk', 'oto_asked'], ['koka', 'nemu', 'talk', 'nemu_asked'],
  ['kitsunebi', 'oen_ev', 'step', 'has:oen'], ['kitsunebi', 'xiaolan', 'talk', 'xl_asked'], ['kitsunebi', 'sasa', 'pickup', 'item:sasa'], ['kitsunebi', 'xiaolan', 'talk', 'has:xiaolan'],
  ['kitsunebi', 'uka', 'talk', 'has:uka'], ['kitsunebi', 'izuna', 'talk', 'has:izuna'],
  ['kitsunebi', 'e1', 'pickup', 'item:nemu_e1'], ['kitsunebi', 'e2', 'pickup', 'item:nemu_e2'], ['kitsunebi', 'e3', 'pickup', 'item:nemu_e3'],
  ['koka', 'nemu', 'talk', 'has:nemu'], ['koka', 'konga', 'talk', 'has:konga'],
  ['inari', 'boss', 'talk', 'ch1_clear'],
  ['iga', 'rei', 'talk', 'rei_asked'], ['iga', 'anne', 'talk', 'anne_asked'], ['iga', 'torika', 'talk', 'torika_asked'], ['iga', 'kanaoni', 'talk', 'kanaoni_asked'],
  ['kirimichi', 'hayate', 'talk', 'has:hayate'], ['kirimichi', 'yui_ev', 'step', 'has:yui'], ['kirimichi', 'shion', 'talk', 'shion_back'], ['kirimichi', 'tane', 'pickup', 'item:hanatane'],
  ['iwaya', 'meikou', 'chest', 'item:meikou'], ['iwaya', 'boss', 'talk', 'ch2_clear'],
  ['kirimichi', 'karura', 'talk', 'has:karura'],
  ['iga', 'rei', 'talk', 'has:rei'], ['iga', 'anne', 'talk', 'has:anne'], ['iga', 'torika', 'talk', 'has:torika'], ['iga', 'kanaoni', 'talk', 'has:kanaoni'], ['iga', 'sekishusai', 'talk', 'has:sekishusai'],
  ['saika', 'benten', 'talk', 'benten_asked'], ['saika', 'quon', 'talk', 'quon_1'], ['saika', 'nekomata', 'talk', 'nekomata_asked'], ['saika', 'ichiya', 'talk', 'item:tegami'],
  ['saika', 'l1', 'talk', 'letter_1'], ['saika', 'l2', 'talk', 'letter_2'], ['saika', 'l3', 'talk', 'letter_3'], ['saika', 'ichiya', 'talk', 'has:ichiya'],
  ['saika', 'shiba', 'talk', 'has:shiba'], ['saika', 'nagisa', 'talk', 'has:nagisa'],
  ['shiokaze', 'fuuta', 'talk', 'has:fuuta'], ['shiokaze', 'hinanojoh', 'talk', 'has:hinanojoh'], ['shiokaze', 'fisher', 'talk', 'item:yakizakana'],
  ['shiokaze', 'seori', 'talk', 'has:seori'], ['shiokaze', 'quon', 'talk', 'quon_2'],
  ['umidou', 'quon', 'talk', 'has:quon'], ['umidou', 'boss', 'talk', 'ch3_clear'],
  ['saika', 'nekomata', 'talk', 'has:nekomata'], ['saika', 'magoichi', 'talk', 'has:magoichi'], ['saika', 'benten', 'talk', 'has:benten'],
  ['kuromine', 'janome', 'talk', 'janome_asked'], ['kuromine', 'rotten', 'talk', 'ch4_duel1'], ['kuromine', 'orochi', 'talk', 'orochi_found'], ['kuromine', 'janome', 'talk', 'has:janome'], ['kuromine', 'karma', 'talk', 'has:karma'],
  ['toride', 'ibuki', 'talk', 'ibuki_asked'], ['toride', 'kohaku', 'talk', 'has:kohaku'], ['toride', 'yama', 'talk', 'yama_found'], ['toride', 'ibuki', 'talk', 'has:ibuki'], ['toride', 'atoza', 'talk', 'ch4_clear'],
  ['koka', 'ganzi', 'talk', 'has:ganzi'],
  ['ten', 'sattva', 'talk', 'has:sattva'], ['ten', 'jin', 'talk', 'has:jin'],
  ['nenokuni', 'sasagane', 'talk', 'has:sasagane'], ['nenokuni', 'sealL', 'talk', 'ne_seal_l'], ['nenokuni', 'sealR', 'talk', 'ne_seal_r'], ['nenokuni', 'boss', 'talk', 'ending']
].map(([map, id, act, until]) => ({ map, id, act, until }));

// ---------- はじめる ----------
host.S = S;
loadMap('koka', 15, 7, 'up');
const lvAt = {};
for (const st of STEPS) {
  try { doStep(st); } catch (e) { console.log('×', e.message); console.log('  at step', JSON.stringify(st), 'map', S.map.id, P.x + ',' + P.y, 'Lv', S.members.hero.lv); process.exitCode = 1; break; }
  log('✓', st.map, st.id, st.until, 'Lv' + S.members.hero.lv);
  if (/ch\d_clear|ending/.test(st.until)) lvAt[st.until] = S.members.hero.lv;
}
console.log('仲間', S.order.length, '/ 39+主人公', '| 主人公Lv', S.members.hero.lv, '| かけら', S.frag, '| 戦闘', stats.battles, '(シンボル', stats.symbolBattles, ') 負け', stats.losses, '修行', stats.grind, '| 歩数', stats.steps);
console.log('ボスのときのレベル', JSON.stringify(stats.bossLv));
console.log('章ごとの戦闘数', JSON.stringify(stats.chapterBattles));
console.log('区切りのレベル', JSON.stringify(lvAt));
console.log('負けた相手', JSON.stringify(stats.lostTo || {}));
const missing = CHD.ORDER.filter(id => !S.members[id]);
if (missing.length) { console.log('まだ仲間でない:', missing.join(' ')); process.exitCode = 1; }
if (!S.flags.ending) { console.log('エンディングに届かなかった'); process.exitCode = 1; }
