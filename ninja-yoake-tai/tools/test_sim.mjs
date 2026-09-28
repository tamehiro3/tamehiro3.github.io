// 設計書 §12 の受入テスト（試合 sim.js・任務監督 director.js・記録 progress.js）。ブラウザなしで動く。
//   node ninja-yoake-tai/tools/test_sim.mjs
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js')); globalThis.NYT_DATA = D;
globalThis.NYT_LINES = require(path.join(ROOT, 'lines.js'));
const AI = require(path.join(ROOT, 'ai.js')); globalThis.NYT_AI = AI;
const S = require(path.join(ROOT, 'sim.js')); globalThis.NYT_SIM = S;
const DIR = require(path.join(ROOT, 'director.js'));
const PR = require(path.join(ROOT, 'progress.js'));
const TUT = require(path.join(ROOT, 'tutorial.js'));
const CH = require(path.join(ROOT, '..', 'ninja-sato-life', 'chars.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  NG: ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '  (' + JSON.stringify(a) + ' != ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('■ ' + t); }
const DT = 1 / 30;
const T0 = Date.parse('2026-09-28T01:00:00Z');
const STD = { mission_template_id: 'standard', enemy_set_id: 'basic', support_event_id: 'mend', objective_variant_id: 'none' };
function team(roles, human) {
  const seen = {};
  return roles.map((r, i) => { const alt = seen[r]; seen[r] = 1; return { id: i === 0 && human ? 'p1' : 'm' + i, kind: i === 0 && human ? 'human' : 'npc', name: 'm' + i, role: r, jutsu: (alt ? D.NPC_JUTSU_ALT : D.NPC_JUTSU)[r].slice() }; });
}
function match(o) {
  o = o || {};
  const M = S.createMatch({ session_id: o.sid || 'test', seed: o.seed || 11, difficulty: o.diff || 'normal', mission: Object.assign({}, STD, o.mission || {}), members: team(o.roles || ['vanguard', 'guard', 'medic'], o.human), weekly: !!o.weekly });
  if (o.start !== false) S.start(M);
  return M;
}
function run(M, secs, intents) { const n = Math.round(secs / DT); for (let i = 0; i < n && M.state !== 'Result'; i++) { S.step(M, DT, typeof intents === 'function' ? intents(M) : intents || {}); } }
function toState(M, state) { let g = 0; while (M.state !== state && M.state !== 'Result' && g++ < 20) { M.phaseT = 0.01; S.step(M, DT, {}); } }
function events(M) { const e = M.events.slice(); M.events.length = 0; return e; }

section('流れ（MatchState）と人数による補正');
{
  const M = match({ start: false });
  eq(M.state, 'Lobby', 'はじめは Lobby');
  S.start(M);
  eq(M.state, 'Preparation', '出撃で Preparation');
  const seen = [M.state];
  for (let g = 0; g < 12 && M.state !== 'Result'; g++) { M.phaseT = 0.01; S.step(M, DT, {}); if (seen[seen.length - 1] !== M.state) seen.push(M.state); }
  eq(seen, ['Preparation', 'Wave', 'Intermission', 'Wave', 'Intermission', 'Boss', 'Result'], '準備→襲撃→準備→襲撃→最終準備→ボス→結果');
  ok(M.result && M.result.outcome === 'win' && M.result.reason === 'dawn', 'ボスの時間を守りきれば勝ち（夜明け）');
  eq(D.scaleHp(1), 1, '1人のとき敵HPはそのまま');
  ok(Math.abs(D.scaleHp(3) - 1.9) < 1e-9, '敵HP＝基準×(1+0.45×(n−1))');
  ok(Math.abs(D.scaleCount(4) - 1.6) < 1e-9, '敵数＝基準×(1+0.20×(n−1))');
  const M2 = match({ roles: ['vanguard', 'guard', 'medic'], human: true });
  M2.n = 2; const e = S.spawnEnemy(M2, 'koro', { lane: 'west' });
  eq(e.maxHp, Math.round(D.ENEMY.koro.hp * 1.45), '2人のとき、ころ玉の HP は1.45倍');
}

section('同じ seed と入力なら同じ結果（再現できる）');
{
  const a = match({ seed: 77 }), b = match({ seed: 77 });
  run(a, 400); run(b, 400);
  eq([a.state, Math.round(a.barrier.hp), a.team.kills, a.t.toFixed(2)], [b.state, Math.round(b.barrier.hp), b.team.kills, b.t.toFixed(2)], '2回の試合が一致');
}

section('技の連打・速度改変で得をしない');
{
  const M = match({ roles: ['vanguard', 'guard', 'medic'], human: true });
  toState(M, 'Wave');
  let casts = 0;
  for (let i = 0; i < Math.round(20 / DT); i++) { S.step(M, DT, { p1: { j0: true, j1: true, sp: true, dodge: true } }); M.events.forEach(e => { if (e.type === 'cast' && e.id === 'p1' && e.skill === 'fire') casts++; }); M.events.length = 0; }
  ok(casts <= Math.floor(20 / D.JUTSU.fire.cd) + 1, '20秒のあいだに炎の輪は再使用の回数まで（' + casts + '回）');
  const M2 = match({ human: true });
  const me = M2.members[0], x0 = me.x, y0 = me.y;
  run(M2, 1, { p1: { mx: 1000, my: 0 } });
  const d = Math.hypot(me.x - x0, me.y - y0);
  ok(d <= D.BAL.speed * D.ROLES.vanguard.speedMul * 1.02 + 1, '移動の向きを大きくしても、1秒で進めるのは速さの分だけ（' + Math.round(d) + '）');
  run(M2, 0.2, { p1: { mx: NaN, my: Infinity } });
  ok(isFinite(me.x) && isFinite(me.y), 'おかしな入力でも位置がこわれない');
  const before = M2.materials;
  S.step(M2, DT, { p1: { act: 'trap:makibishi' } });
  eq(M2.materials, before, '罠の置き場から遠いと、置けない（素材も減らない）');
}

section('勝敗の優先順位を固定し、結果は1回だけ確定する');
{
  const M = match();
  toState(M, 'Boss');
  run(M, 4);
  const boss = M.enemies.filter(e => e.boss)[0];
  ok(!!boss, '夜明け前に大だるまが出る');
  M.barrier.hp = 1; boss.hp = 1;
  // 同じ瞬間に、大だるまがしずまり、結界も破れる
  S.hurtEnemy(M, boss, 999, { by: 'm0', kind: 'atk', x: boss.x, y: boss.y });
  M.barrier.hp = 0;
  S.step(M, DT, {});
  eq([M.result.outcome, M.result.reason], ['win', 'boss'], '同時なら勝利が先（大だるま）');
  const r1 = JSON.stringify(M.result);
  S.finalize(M, 'lose', 'barrier'); S.step(M, DT, {});
  eq(JSON.stringify(M.result), r1, 'あとから負けを確定しようとしても変わらない');
  const M2 = match();
  toState(M2, 'Wave'); M2.barrier.hp = 0; S.step(M2, DT, {});
  eq([M2.result.outcome, M2.result.reason, M2.result.wavesCleared], ['lose', 'barrier', 0], '結界が0になると負け');
  const M3 = match();
  toState(M3, 'Boss'); M3.barrier.hp = 0; M3.phaseT = 0.001; S.step(M3, DT, {});
  eq(M3.result.outcome, 'win', '夜明けと結界の破壊が同時なら勝利が先');
  const resEvents = M3.events.filter(e => e.type === 'result').length;
  eq(resEvents, 1, '結果のできごとは1回だけ');
}

section('全員ダウン → 救済時間 → 負け（結界にたどり着けば起き上がる）');
{
  const M = match();
  toState(M, 'Wave');
  M.members.forEach((m, i) => { m.x = 300 + i * 30; m.y = 300; S.downMember(M, m); });
  run(M, 1);
  ok(M.grace > 0 && M.state !== 'Result', '全員ダウンで救済時間が始まる');
  run(M, D.BAL.allDownGrace + 0.5);
  eq([M.result && M.result.outcome, M.result && M.result.reason], ['lose', 'allDown'], '救済時間がすぎると負け');
  const M2 = match({ human: true });
  toState(M2, 'Wave');
  M2.members.forEach((m, i) => { m.x = 300 + i * 30; m.y = 300; S.downMember(M2, m); });
  const me = M2.members[0]; me.x = M2.barrier.x; me.y = M2.barrier.y + 130;
  M2.members[1].x = M2.barrier.x + 20; M2.members[1].y = M2.barrier.y + 140;
  run(M2, 3, { p1: { mx: 0, my: -1 } });
  ok(!me.down && M2.state !== 'Result', '救済時間に結界まで這えば起き上がる');
  ok(me.graceUsed, '起き上がれるのは1人1回（使ったことを記録）');
  ok(M2.members.filter(m => m.graceUsed).length === 1, '起き上がるのは最初にたどり着いた1人だけ（ほかの仲間はその人が助ける）');
}

section('救助：3秒・被弾で止まる・救援は2秒・結界の中は止まらない（連携）');
{
  const M = match({ roles: ['vanguard', 'guard', 'vanguard'] });
  toState(M, 'Wave');
  const [a, b] = M.members; M.members[2].x = 100; M.members[2].y = 1100;
  a.ai.plan = null; b.ai.plan = null;
  S.downMember(M, a); a.x = 700; a.y = 700; b.x = 700; b.y = 730;
  M.enemies = []; M.spawnQ = [];
  let t = 0; while (a.down && t < 6) { S.step(M, DT, {}); t += DT; M.members[2].x = 100; M.members[2].y = 1100; }
  ok(!a.down && t >= 2.9 && t <= 3.6, 'ふつうは約3秒で救助（' + t.toFixed(2) + '秒）');
  const M2 = match({ roles: ['medic', 'guard', 'guard'] });
  toState(M2, 'Wave'); M2.enemies = []; M2.spawnQ = [];
  const [c, d] = M2.members; S.downMember(M2, d); d.x = 700; d.y = 700; c.x = 700; c.y = 730; M2.members[2].x = 100; M2.members[2].y = 1100;
  t = 0; while (d.down && t < 6) { S.step(M2, DT, {}); t += DT; M2.members[2].x = 100; M2.members[2].y = 1100; }
  ok(!d.down && t <= 2.5, '救援役は約2秒（' + t.toFixed(2) + '秒）');
  const M3 = match({ roles: ['vanguard', 'guard', 'vanguard'] });
  toState(M3, 'Wave'); M3.enemies = []; M3.spawnQ = [];
  const [e, f] = M3.members; S.downMember(M3, e); e.x = 700; e.y = 700; f.x = 700; f.y = 730; M3.members[2].x = 100; M3.members[2].y = 1100;
  let hits = 0; t = 0;
  while (e.down && t < 8) { if (Math.floor(t * 2) > hits) { hits++; f.lastHit = M3.t; f.rescuePause = D.BAL.rescuePause; } S.step(M3, DT, {}); t += DT; M3.members[2].x = 100; M3.members[2].y = 1100; }
  ok(t > 4, '0.5秒ごとに攻撃を受けると、救助は止まりながら進む（' + t.toFixed(2) + '秒）');
  const M4 = match({ roles: ['vanguard', 'guard', 'vanguard'] });
  toState(M4, 'Wave'); M4.enemies = []; M4.spawnQ = [];
  const [g, h] = M4.members; S.downMember(M4, g); g.x = 700; g.y = 700; h.x = 700; h.y = 730; M4.members[2].x = 100; M4.members[2].y = 1100;
  M4.zones.push({ kind: 'dome', id: 999, x: 700, y: 710, r: 72, hp: 120, max: 120, t: 8, life: 8, owner: h.id });
  let combo = false; t = 0;
  while (g.down && t < 6) { h.rescuePause = 0.6; S.step(M4, DT, {}); t += DT; M4.members[2].x = 100; M4.members[2].y = 1100; M4.events.forEach(x => { if (x.type === 'combo' && x.kind === 'safe_rescue') combo = true; }); M4.events.length = 0; }
  ok(!g.down && t < 2.6, '護りの結界の中なら、攻撃を受けても止まらず早い（' + t.toFixed(2) + '秒）');
  ok(combo, '結界の中の救助は「連携」になる');
}

section('連携と盾持ち');
{
  const M = match({ human: true });
  toState(M, 'Wave'); M.enemies = []; M.spawnQ = [];
  const e1 = S.spawnEnemy(M, 'koro', { x: 700, y: 400 }), e2 = S.spawnEnemy(M, 'koro', { x: 900, y: 400 });
  e1.hp = e1.maxHp = e2.hp = e2.maxHp = 500; e1.bound = 3;
  const src = () => ({ by: 'p1', kind: 'fire', x: 0, y: 0, aoe: true });
  const d1 = S.hurtEnemy(M, e1, 20, src()), d2 = S.hurtEnemy(M, e2, 20, src());
  eq([d1, d2], [40, 20], '足止め中の敵に範囲攻撃は2倍');
  ok(M.events.some(x => x.type === 'combo' && x.kind === 'bind_aoe'), '足止め → 範囲攻撃で連携');
  const k = S.spawnEnemy(M, 'kasa', { x: 500, y: 500 }); k.hp = k.maxHp = 500; k.face = { x: 1, y: 0 };
  const front = S.hurtEnemy(M, k, 10, { by: 'p1', kind: 'atk', x: 560, y: 500, dir: true });
  const back = S.hurtEnemy(M, k, 10, { by: 'p1', kind: 'atk', x: 440, y: 500, dir: true });
  eq([front, back], [3, 15], 'からかさは正面3割・背中1.5倍');
  // 風で誘導 → 罠
  const M2 = match({ human: true });
  toState(M2, 'Wave'); M2.enemies = []; M2.spawnQ = [];
  M2.traps.w3 = { spot: 'w3', kind: 'bakuchiku', x: 600, y: 538, uses: 0, charges: 4, rearm: 0, owner: 'p1', dmgMul: 1 };
  const t1 = S.spawnEnemy(M2, 'koro', { x: 600, y: 538 }); t1.hp = t1.maxHp = 500; t1.lure = 1; t1.lureBy = 'p1'; t1.speed = 0;
  S.step(M2, DT, {});
  ok(M2.events.some(x => x.type === 'combo' && x.kind === 'lure_trap'), '誘導中の敵が罠にかかると連携');
  ok(500 - t1.hp >= D.TRAPS.bakuchiku.dmg * 2, '誘導 → 罠は罠のダメージ2倍');
}

section('罠・修理・補給（準備だけ・置き場だけ・素材は共有）');
{
  const M = match({ roles: ['guard', 'vanguard', 'medic'], human: true });
  const me = M.members[0]; me.x = 600; me.y = 538; M.materials = 10;
  M.members.forEach(m => { if (m !== me) { m.x = 100; m.y = 1100; } });
  S.step(M, DT, { p1: { act: 'trap:bakuchiku' } });
  ok(!!M.traps.w3 && M.traps.w3.kind === 'bakuchiku', '準備中は置き場に罠を置ける');
  eq(M.materials, 10 - (D.TRAPS.bakuchiku.cost - 1), '結界役は罠の素材が1少ない');
  toState(M, 'Wave'); M.materials = 10; me.x = 225; me.y = 222;
  S.step(M, DT, { p1: { act: 'trap:makibishi' } });
  ok(!M.traps.w1, '襲撃中は罠を置けない');
  toState(M, 'Intermission'); me.x = M.barrier.x; me.y = M.barrier.y + 80; M.barrier.hp = 500; M.materials = 3;
  run(M, 1.2, { p1: { act: 'repair' } });
  ok(M.barrier.hp > 500 && M.materials < 3, '準備中は素材で結界を修理できる');
}

section('強化（3つから1つ・その試合だけ）');
{
  const M = match({ human: true });
  toState(M, 'Intermission');
  const of = M.offers.p1;
  ok(of && of.list.length === 3 && new Set(of.list).size === 3, '3つの候補');
  S.step(M, DT, { p1: { act: 'pick:1' } });
  eq(M.members[0].ups, [of.list[1]], 'えらんだ強化が付く');
  S.step(M, DT, { p1: { act: 'pick:2' } });
  eq(M.members[0].ups.length, 1, '1回の準備で1つだけ');
  toState(M, 'Wave'); toState(M, 'Intermission');
  M.phaseT = 0.01; S.step(M, DT, {});
  eq(M.members[0].ups.length, 2, 'えらばずに準備が終わると、1つ目が自動で付く');
}

section('節目の支援（師匠が1回だけ）');
{
  const M = match({ mission: { support_event_id: 'mend' } });
  toState(M, 'Wave');
  M.barrier.hp = 300; S.step(M, DT, {});
  ok(M.support.used && M.support.at === 'low' && M.barrier.hp >= 300 + 250 - 60, '結界が弱ると早めに支援が来る（結界の修復）');
  M.events.length = 0;
  toState(M, 'Boss');
  eq(M.events.filter(e => e.type === 'support').length, 0, '支援は1試合に1回だけ（夜明け前にもう一度は来ない）');
  const M3 = match({ mission: { support_event_id: 'bell' } }); M3.events.length = 0;
  toState(M3, 'Boss');
  eq(M3.events.filter(e => e.type === 'support').length, 1, 'ふつうは夜明け前（ボス）のはじめに1回');
  const M2 = match({ mission: { support_event_id: 'supply' } }); const m0 = M2.materials;
  toState(M2, 'Intermission'); toState(M2, 'Wave'); toState(M2, 'Intermission');
  ok(M2.support.used && M2.support.at === 'prep3', '素材の差し入れは最終準備のはじめ');
}

section('報酬：session_id ごとに1回・負けは突破した襲撃ごと（上限60）・放置は0');
{
  const P = PR.fresh(T0);
  const M = match({ human: true, sid: 's-1' });
  const me = M.members[0];
  me.stats.moved = 2000; me.stats.actions = 30;
  S.finalize(M, 'win', 'dawn');
  const a = PR.claimReward(P, M.result, 'p1', T0);
  const b = PR.claimReward(P, M.result, 'p1', T0);
  eq([a.tokens, b.tokens, !!b.already, P.tokens], [100, 0, true, 100], '勝利100枚。同じ出撃の再送では増えない');
  const bad = JSON.parse(JSON.stringify(M.result)); bad.session_id = 's-2'; bad.rules_version = 'hack';
  eq(PR.claimReward(P, bad, 'p1', T0).tokens, 0, 'ルールの版が違う結果は受け取れない');
  const L = match({ human: true, sid: 's-3' }); L.members[0].stats.actions = 30; L.wavesCleared = 2;
  S.finalize(L, 'lose', 'barrier');
  eq(PR.claimReward(P, L.result, 'p1', T0).tokens, 40, '負け：突破した襲撃2つで40枚');
  const L2 = JSON.parse(JSON.stringify(L.result)); L2.session_id = 's-4'; L2.wavesCleared = 5;
  eq(PR.claimReward(P, L2, 'p1', T0).tokens, 60, '負けの上限は60枚');
  const I = match({ human: true, sid: 's-5' }); S.finalize(I, 'win', 'dawn');
  const ci = PR.claimReward(P, I.result, 'p1', T0);
  ok(ci.idle && ci.tokens === 0, '移動も行動もない出撃は報酬なし（放置）');
  const Q = match({ human: true, sid: 's-6' }); Q.members[0].stats.moved = 50; Q.members[0].stats.actions = 8; S.finalize(Q, 'win', 'dawn');
  eq(PR.claimReward(P, Q.result, 'p1', T0).tokens, 100, '移動が少なくても、設置・回復・救助・採集などの行動があれば放置ではない');
  const O = match({ human: true, sid: 's-7', mission: { objective_variant_id: 'rescue3' } }); O.members[0].stats.actions = 9; O.team.rescues = 3; S.finalize(O, 'win', 'dawn');
  eq(PR.claimReward(P, O.result, 'p1', T0).tokens, 120, '目標を達成して勝つと+20');
}

section('役割が重なっても標準難易度を攻略できる（NPC だけで確認）');
{
  for (const r of D.ROLE_IDS) {
    let w = 0; const N = 6;
    for (let s = 1; s <= N; s++) { const M = match({ roles: [r, r, r], seed: 100 + s }); run(M, 700); if (M.result && M.result.outcome === 'win') w++; }
    ok(w >= N / 2, D.ROLES[r].name + 'だけのチームでも勝てる（' + w + '/' + N + '）');
  }
}

section('任務監督：承認済みの構成だけ・予算・検証に通らなければルールに戻る');
{
  const good = { mission_template_id: 'escort', enemy_set_id: 'basic', support_event_id: 'rain', objective_variant_id: 'escortAll', briefing: '里人を守って' };
  ok(DIR.validate(good, 'normal').ok, '承認済みの構成は通る');
  ok(!DIR.validate(Object.assign({}, good, { mission_template_id: 'raid' }), 'normal').ok, '承認されていない任務は通らない');
  ok(!DIR.validate({ mission_template_id: 'standard', enemy_set_id: 'mixed', support_event_id: 'mend', objective_variant_id: 'none' }, 'easy').ok, '難易度の敵予算をこえる組み合わせは通らない');
  ok(!DIR.validate(Object.assign({}, good, { support_event_id: 'supply' }), 'normal').ok, '任務で使えない支援は通らない');
  ok(!DIR.validate(Object.assign({}, good, { objective_variant_id: 'trap25' }), 'normal').ok, '任務で使えない目標は通らない');
  ok(!DIR.validate(Object.assign({}, good, { briefing: 'https://example.com を見て' }), 'normal').ok, '文面にリンクは入れられない');
  ok(!DIR.validate(Object.assign({}, good, { place: [{ x: 1, y: 2 }] }), 'normal').ok, '配置の指定（無効な配置）は通らない');
  // 救助が多かったチーム → 護衛任務、罠が活躍したチーム → 分かれ道
  const res = (o) => ({ session_id: 'x', members: [{ role: 'medic', stats: { blocked: 0, downs: 0 } }, { role: 'guard', stats: { blocked: 0, downs: 0 } }, { role: 'vanguard', stats: { blocked: 0, downs: 0 } }], team: Object.assign({ rescues: 0, trapKills: 0, combos: 0 }, o), barrier: { hp: 800, max: 1000 }, outcome: 'win', mission: { mission_template_id: 'standard' } });
  eq(DIR.ruleProposal(DIR.context(res({ rescues: 4 }), 'normal'), () => 0.3, 'hayate').mission_template_id, 'escort', '救助が多かった → 里人の避難');
  eq(DIR.ruleProposal(DIR.context(res({ trapKills: 12 }), 'normal'), () => 0.3, 'hayate').mission_template_id, 'branch', '罠が活躍した → 分かれ道の守り');
  for (let i = 0; i < 20; i++) { const p = DIR.ruleProposal(DIR.context(res({ rescues: i % 4, trapKills: i % 13 }), ['easy', 'normal', 'hard'][i % 3]), Math.random, 'hayate'); ok(DIR.validate(p, ['easy', 'normal', 'hard'][i % 3]).ok, 'ルールの提案はいつも検証に通る #' + i); }
}

section('任務監督：1チームの次の任務に1回・1日3回まで・キャッシュ・AI の失敗');
{
  const P = PR.fresh(T0);
  const res = (sid, o) => ({ session_id: sid, members: [{ role: 'vanguard', stats: { blocked: 0, downs: 0 } }, { role: 'guard', stats: { blocked: 0, downs: 0 } }, { role: 'medic', stats: { blocked: 0, downs: 0 } }], team: Object.assign({ rescues: 0, trapKills: 0, combos: 0 }, o || {}), barrier: { hp: 800, max: 1000 }, outcome: 'win', mission: { mission_template_id: 'standard' } });
  const out = [];
  const r1 = await DIR.generate(P, res('a', { rescues: 1 }), { now: T0 }); out.push(r1);
  const r1b = await DIR.generate(P, res('a', { rescues: 1 }), { now: T0 });
  ok(r1b.same && JSON.stringify(r1b.proposal) === JSON.stringify(r1.proposal), '同じ試合から何度呼んでも同じ提案（次の任務に1回）');
  await DIR.generate(P, res('b', { trapKills: 7 }), { now: T0 });
  await DIR.generate(P, res('c', { trapKills: 11, rescues: 4 }), { now: T0 });
  eq(P.director.gens, 3, '新しい提案は3回');
  const r4 = await DIR.generate(P, res('d', { rescues: 2, trapKills: 6 }), { now: T0 });
  ok(!r4.proposal && /3回まで/.test(r4.note || ''), '4回目の新しい提案は出ない（通常任務で出撃できる）');
  const r5 = await DIR.generate(P, res('e', { rescues: 1 }), { now: T0 });
  ok(r5.proposal && r5.gen === 'cache', '同じ構成ならキャッシュを使う（回数に数えない）');
  const r6 = await DIR.generate(P, res('f', { rescues: 1 }), { now: T0 + 86400000 });
  ok(r6.proposal && P.director.gens <= 1, '日が変わると、また提案できる');
  // AI の接続：失敗・時間切れ・検証に通らない → ルールに戻る
  const P2 = PR.fresh(T0); P2.director.mode = 'ai'; P2.director.endpoint = 'https://ai.example.invalid/propose';
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('network down'));
  const a1 = await DIR.generate(P2, res('g', { rescues: 1 }), { now: T0 });
  ok(a1.gen === 'rule' && a1.proposal && /ルールで作成/.test(a1.note), '通信に失敗したらルールの提案');
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ mission_template_id: 'standard', enemy_set_id: 'mixed', support_event_id: 'mend', objective_variant_id: 'none', briefing: 'x' }) });
  P2.loadout.difficulty = 'easy';
  const a2 = await DIR.generate(P2, res('h', { trapKills: 3 }), { now: T0 });
  ok(a2.gen === 'rule' && /差し戻し/.test(a2.note) && DIR.validate(a2.proposal, 'easy').ok, '予算をこえた AI の案は差し戻してルールに戻る');
  globalThis.fetch = (u, o) => new Promise((res2, rej) => { o.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }); });
  const a3 = await DIR.generate(P2, res('i', { rescues: 3, trapKills: 9 }), { now: T0, timeoutMs: 50 });
  ok(a3.gen === 'rule' && /8秒/.test(a3.note), '時間切れならルールの提案（試合は待たせない）');
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ mission_template_id: 'pillars', enemy_set_id: 'talisman', support_event_id: 'lamp', objective_variant_id: 'pillarsBoth', briefing: '柱を守ってほしい' }) });
  P2.loadout.difficulty = 'normal';
  const P3 = PR.fresh(T0); P3.director.mode = 'ai'; P3.director.endpoint = 'https://ai.example.invalid/propose';
  const a4 = await DIR.generate(P3, res('j', {}), { now: T0 });
  ok(a4.gen === 'ai' && a4.proposal.mission_template_id === 'pillars', '検証に通った AI の案はそのまま使う');
  const P4 = PR.fresh(T0); P4.director.mode = 'ai'; P4.director.endpoint = 'http://insecure.example';
  const a5 = await DIR.generate(P4, res('k', {}), { now: T0 });
  ok(a5.gen === 'rule', 'https でない接続先は使わない');
  globalThis.fetch = realFetch;
  const P5 = PR.fresh(T0); P5.director.mode = 'rotation';
  const ro = [];
  for (let i = 0; i < 4; i++) { const r = await DIR.generate(P5, res('r' + i, { rescues: i }), { now: T0 + i }); ro.push(r.proposal ? r.proposal.mission_template_id : null); DIR.consume(P5); P5.director.gens = 0; }
  eq(ro, ['standard', 'escort', 'branch', 'pillars'], '固定ローテーションは同じ順番（比べる用）');
}

section('切断・再接続（枠は60秒保持・戻らなければ NPC が引き継ぐ・人数補正は次の準備で）');
{
  const M = match({ human: true });
  toState(M, 'Wave');
  const me = M.members[0];
  S.disconnect(M, 'p1');
  const n0 = M.n;
  run(M, 5);
  ok(!me.connected && !me.takeover, '切断中は枠を保つ');
  eq(M.n, n0, '切断してもすぐには人数補正を変えない');
  ok(S.rejoin(M, 'p1') && me.connected, '60秒以内なら同じ試合に戻れる');
  S.disconnect(M, 'p1');
  run(M, D.BAL.slotHold + 1);
  ok(me.takeover, '60秒たつと NPC が引き継ぐ');
  ok(!S.rejoin(M, 'p1'), '引き継いだあとは戻れない');
  toState(M, 'Intermission');
  eq(S.humansNow(M), 1, '人数は次の準備で数え直す（最低1）');
  ok(M.log.some(l => l.ev === 'disconnect') && M.log.some(l => l.ev === 'rejoin'), '切断・再接続を記録する');
}

section('週の固定任務（全員同じ・AI の提案とは別）');
{
  const a = D.weeklyMission(T0), b = D.weeklyMission(T0 + 3600000), c = D.weeklyMission(T0 + 7 * 86400000);
  eq(a, b, '同じ週なら同じ任務');
  ok(a.week !== c.week, '週が変わると変わる');
  ok(DIR.validate(a.mission, 'normal').ok && a.difficulty === 'normal', '週の任務は承認済みの構成・難易度ふつう');
  eq(D.isoWeek(Date.parse('2026-09-28T12:00:00Z')), '2026-W40', 'ISO 週の計算');
}

section('記録・修行課題・絆・忍術の解放');
{
  const P = PR.fresh(T0);
  ok(!PR.unlockJutsu(P, 'mist').ok, '修行札が足りないと解放できない');
  P.tokens = 200;
  ok(PR.unlockJutsu(P, 'mist').ok && P.tokens === 50 && PR.jutsuOwned(P, 'mist'), '150枚で別の型を解放');
  ok(!PR.unlockJutsu(P, 'fire').ok, 'はじめの忍術は解放のものではない');
  ok(PR.validLoadout(P, { role: 'guard', jutsu: ['mist', 'stone'], difficulty: 'normal' }), '解放した型は編成に入れられる');
  ok(!PR.validLoadout(P, { role: 'guard', jutsu: ['fireline', 'stone'], difficulty: 'normal' }), '解放していない型は入れられない');
  ok(!PR.validLoadout(P, { role: 'guard', jutsu: ['stone', 'stone'], difficulty: 'normal' }), '同じ忍術を2枠には入れられない');
  const M = match({ human: true, roles: ['medic', 'guard', 'vanguard'], sid: 'rec-1' });
  M.members[0].stats.rescues = 8; M.members[0].stats.actions = 20; M.members[0].stats.healed = 700;
  S.finalize(M, 'win', 'dawn');
  const rec = PR.recordMatch(P, M.result, 'p1', { mentor: 'hayate', mode: 'normal' }, T0);
  ok(rec.tasksDone.some(t => t.id === 'm1') && rec.tasksDone.some(t => t.id === 'm2'), '救援の修行課題が進む');
  ok(P.owned.trail_sakura && P.owned.outfit_wakaba, '課題のごほうびの外見がもらえる');
  ok(rec.bondUp && rec.bondUp.id === 'hayate', '師匠との絆が深まる');
  const rec2 = PR.recordMatch(P, M.result, 'p1', { mentor: 'hayate' }, T0);
  eq(rec2.tasksDone.length + (rec2.bondUp ? 1 : 0), 0, '同じ出撃を二重に記録しない');
  ok(!PR.setLook(P, 'outfit', 'outfit_fuji'), '持っていない外見は着られない');
  ok(PR.setLook(P, 'outfit', 'outfit_wakaba'), '手に入れた外見は着られる');
}

section('最初の任務（ひとりで最後まで）');
{
  const log = [];
  const T = TUT.create({ tut: () => {}, done: (id) => log.push(id), step: () => {} });
  const cfg = TUT.config({ session_id: 'tut', look: D.DEFAULT_LOOK, mentor: 'hayate' });
  cfg.script = T.script;
  const M = S.createMatch(cfg);
  S.start(M);
  const me = M.members[0];
  // 台本どおりに動く「人」のかわり
  let guard = 0;
  while (M.state !== 'Result' && guard++ < 30 * 400) {
    const st = T.list[T.i] ? T.list[T.i].id : null;
    const it = { autoAtk: true };
    const go = (x, y) => { const d = Math.hypot(x - me.x, y - me.y); if (d > 8) { it.mx = (x - me.x) / d; it.my = (y - me.y) / d; } };
    if (st === 'move' && T.marker) go(T.marker.x, T.marker.y);
    if ((st === 'attack' || st === 'raid' || st === 'boss' || st === 'dodge') && M.enemies.length) { const e = M.enemies[0]; go(e.x, e.y + 30); it.j0 = true; it.j1 = true; it.sp = st === 'boss'; }
    if (st === 'dodge') { M.zones.forEach(z => { if (z.kind === 'tele' && S.inTele(z, me)) { it.mx = me.x - z.x || 1; it.my = me.y - z.y; it.dodge = true; } }); }
    if (st === 'gather') go(250, 800);
    if (st === 'trap') { go(600, 538); it.act = 'trap:makibishi'; }
    if (st === 'rescue') go(M.members[1].x, M.members[1].y + 20);
    if (st === 'rescued') it.pin = { x: me.x + 60, y: me.y };
    S.step(M, DT, { p1: it }); M.events.length = 0;
  }
  eq([M.state, M.result && M.result.outcome], ['Result', 'win'], '最初の任務を最後まで終えられる（' + Math.round(M.t) + '秒）');
  eq(log, ['move', 'attack', 'dodge', 'gather', 'trap', 'raid', 'rescue', 'rescued', 'boss'].slice(0, log.length), '手順の順番どおりに進む');
  ok(M.t < 300, '5分以内に終わる');
}

section('キャラクター（39体）とセリフ');
{
  const L = globalThis.NYT_LINES.LINES;
  eq(Object.keys(L), CH.CHARS.map(c => c.id), '39体すべてにセリフがある（名鑑と同じ順番）');
  ok(Object.values(L).every(e => e.tips.length === 3 && e.ask.length === 2 && e.bond.length === 2 && e.support && e.win && e.lose && e.intro), 'セリフの項目がそろっている');
  const all = JSON.stringify(L);
  ok(!/(殺|死ね|課金|ガチャ|購入|お金|https?:)/.test(all), 'セリフに使わない言葉がない');
  ok(DIR.CLIENT_ORDER.length === 39 && new Set(DIR.CLIENT_ORDER).size === 39 && DIR.CLIENT_ORDER.every(id => CH.BY_ID[id]), '依頼人の順番は39体をちょうど1回ずつ');
}

section('処理の重さ（敵が多いときも軽い）');
{
  const M = match();
  toState(M, 'Wave');
  for (let i = 0; i < 60; i++) S.spawnEnemy(M, i % 5 === 0 ? 'kasa' : i % 7 === 0 ? 'fuda' : 'koro', { lane: i % 2 ? 'west' : 'east' });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) { S.step(M, 1 / 60, {}); M.events.length = 0; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 300;
  ok(ms < 4, '敵60体でも1ステップ ' + ms.toFixed(2) + 'ms（30fps の目安に十分な余裕）');
}

console.log(`\n結果: ${pass} 件合格 / ${fail} 件不合格`);
process.exit(fail ? 1 : 0);
