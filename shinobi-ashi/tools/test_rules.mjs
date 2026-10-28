// 忍び足 — ルール（rules.js）のテスト。ブラウザなしで動く。
//   node shinobi-ashi/tools/test_rules.mjs
// docs/SPEC.md の 2.2 と 5 の一覧、境界の値を確かめる。
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js'));
const CH = require(path.join(ROOT, 'chars.js'));
const R = require(path.join(ROOT, 'rules.js'));
const C = D.CONFIG;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  NG: ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + (A === B ? '' : '  (' + A + ' != ' + B + ')')); }
function section(t) { console.log('■ ' + t); }
const types = (ev) => ev.map(e => e.type);
const ofType = (ev, t) => ev.filter(e => e.type === t);
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => a[0] < b[0] ? -1 : 1));

const T0 = '2026-10-26'; // 月曜
function mk(mainId = 'anne', mode = 'otona', today = T0, route = 'sim') { return R.newState({ mainId, mode, today, route }); }
function hours(map) { const b = new Array(24).fill(0); for (const h in map) b[+h] = map[h]; return b; }
function day(date, steps, buckets = null, src = 'sim') { return { date, steps, buckets, src }; }
function run(s, date, steps, buckets = null, today = date) { return R.ingest(s, [day(date, steps, buckets)], { today }); }

// 来訪累計をちょうど target まで歩かせる（1日16,500まで。同じ日を何度も読み直す）
function walker(s, start = T0) {
  const w = { s, date: start, steps: 0, events: [] };
  w.to = (target) => {
    while (w.s.visitTotal < target) {
      const room = C.DAY_CAP - w.steps;
      if (room <= 0) { w.date = R.addDays(w.date, 1); w.steps = 0; continue; }
      w.steps += Math.min(room, target - w.s.visitTotal);
      const r = run(w.s, w.date, w.steps);
      w.s = r.state; w.events.push(...r.events);
    }
    return w;
  };
  w.take = () => { const e = w.events; w.events = []; return e; };
  return w;
}

/* ------------------------------------------------------------------ */
section('はじめの状態・Node から require できる・時計と乱数を使わない');
{
  const s = mk('anne', 'kodomo', '2026-10-27', 'ios');
  eq(s.slots, ['anne', null, null], '主相棒1体に100%');
  eq(s.alloc, [100, 0, 0], '割り当ては 100/0/0');
  eq(s.goal, 10000, 'こどもの目標の既定は10,000');
  eq(mk('anne', 'otona').goal, 8000, 'おとなの目標の既定は8,000');
  eq(s.chars.anne.joined, '2026-10-27', '主相棒の joined は今日');
  eq(s.dyes, ['none', 'ai'], 'はじめの染め色');
  ok(R.validate(s).ok, 'newState は validate を通る');
  ok(typeof globalThis.SA === 'object' && globalThis.SA.Rules === R, 'SA.Rules に生えている');
  let threw = false; try { R.newState({ mainId: 'jin', mode: 'otona', today: T0 }); } catch (e) { threw = true; }
  ok(threw, '刃は主相棒にできない');
  const src = fs.readFileSync(path.join(ROOT, 'rules.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Date\.now|new Date\(\)|Math\.random|fetch\(|XMLHttpRequest|WebSocket|document\.|localStorage|navigator\./.test(src), 'rules.js は時計・乱数・通信・DOM を使わない');
}

section('冪等（同じ日を何度読んでも二重に足さない・差分だけ・減った値は無視）');
{
  let s = mk();
  const before = JSON.stringify(s);
  let r = run(s, T0, 5000);
  eq(JSON.stringify(s), before, 'ingest は元の state を変えない');
  s = r.state;
  eq([s.visitTotal, s.roadTotal, s.chars.anne.shugyo], [5000, 5000, 5000], '5,000歩');
  r = run(s, T0, 5000); s = r.state;
  eq([s.visitTotal, s.chars.anne.shugyo, r.events.length], [5000, 5000, 0], '同じ値を読み直しても増えない・出来事なし');
  r = run(s, T0, 8000); s = r.state;
  eq([s.visitTotal, s.chars.anne.shugyo, s.daily[T0].shugyo], [8000, 8000, 8000], '増えた3,000だけ足す');
  r = run(s, T0, 6000); s = r.state;
  eq([s.visitTotal, s.daily[T0].shugyo, s.recent[T0]], [8000, 8000, 8000], '減った値は無視');
  r = R.ingest(s, [day(T0, 9000), day(T0, 9000), day(T0, 7000)], { today: T0 }); s = r.state;
  eq(s.visitTotal, 9000, '同じ日が1回の取り込みに何度あっても二重に足さない');
  r = R.ingest(s, [day(R.addDays(T0, 1), 3000)], { today: T0 });
  eq(r.state.visitTotal, 9000, '今日より先の日は読まない');
  r = R.ingest(s, [], { today: 'bad' });
  ok(r.error && r.state === s, 'today がおかしいときは何もしない');
}

section('1日の上限 16,500（ちょうど・超え・手前）');
{
  let r = run(mk(), T0, 16499);
  eq([r.state.daily[T0].shugyo, r.state.daily[T0].capped], [16499, false], '16,499 は上限に届かない');
  r = run(mk(), T0, 16500);
  eq([r.state.daily[T0].shugyo, r.state.daily[T0].capped], [16500, true], '16,500 ちょうどで今日はここまで');
  ok(ofType(r.events, 'cap').length === 1, 'cap イベント');
  let s = r.state;
  r = run(s, T0, 16501);
  eq([r.state.daily[T0].shugyo, r.state.visitTotal, ofType(r.events, 'cap').length], [16500, 16500, 0], '16,501 でも修行値は16,500・cap は1回だけ');
  r = run(mk(), T0, 30000);
  eq([r.state.visitTotal, r.state.chars.anne.shugyo], [16500, 16500], '超えた分は修行値にならない');
}

section('不採用（1時間12,000歩・毎分200歩）');
{
  let r = run(mk(), T0, 12000, hours({ 10: 12000 }));
  eq([r.state.daily[T0].rejected, r.state.daily[T0].shugyo], [0, 12000], '12,000/時 ちょうどは採用');
  r = run(mk(), T0, 12001, hours({ 10: 12001 }));
  eq([r.state.daily[T0].rejected, r.state.daily[T0].shugyo], [12001, 0], '12,001/時 は区間まるごと不採用');
  r = run(mk(), T0, 16000, hours({ 9: 3000, 10: 12001 }));
  eq([r.state.daily[T0].rejected, r.state.daily[T0].shugyo], [12001, 3999], '採用＝合計−不採用（合計が区間の和より大きい分は採用側）');
  const q = new Array(96).fill(0); q[40] = 3000; q[41] = 3001;
  r = run(mk(), T0, 6001, q);
  eq([r.state.daily[T0].rejected, r.state.daily[T0].shugyo], [3001, 3000], '15分区間: 3,000（毎分200）は採用、3,001 は不採用');
  r = run(mk(), T0, 5000, null);
  eq(r.state.daily[T0].rejected, 0, '区間なしは不採用0');
}

section('こどもモードの深夜（0〜5時は修行値に入れない）');
{
  let r = run(mk('anne', 'kodomo'), T0, 3000, hours({ 4: 1000, 5: 2000 }));
  eq([r.state.daily[T0].rejected, r.state.daily[T0].shugyo], [1000, 2000], 'こども: 4時台は不採用、5時台は採用');
  r = run(mk('anne', 'kodomo'), T0, 1000, hours({ 0: 1000 }));
  eq(r.state.daily[T0].shugyo, 0, 'こども: 0時台は不採用');
  r = run(mk('anne', 'otona'), T0, 3000, hours({ 4: 1000, 5: 2000 }));
  eq(r.state.daily[T0].shugyo, 3000, 'おとな: 4時台も採用');
  r = run(mk('anne', 'kodomo'), T0, 3000, null);
  eq(r.state.daily[T0].shugyo, 3000, 'こども: 区間なしは深夜の判定ができないので不採用0');
  const q = new Array(96).fill(0); q[19] = 500; q[20] = 500; // 4:45〜 と 5:00〜
  r = run(mk('anne', 'kodomo'), T0, 1000, q);
  eq(r.state.daily[T0].shugyo, 500, 'こども: 15分区間でも4時台だけ不採用');
}

section('修行枠への配分（端数切り捨て・余りは主相棒）');
{
  let s = mk('anne');
  s.chars.sakuya = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  s.chars.karma = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  s = R.setSlots(s, ['sakuya', 'anne', 'karma'], [50, 30, 20]);
  const r = run(s, '2026-10-27', 1001);
  const a = r.state.daily['2026-10-27'].alloc;
  eq([a.sakuya, a.anne, a.karma], [500, 301, 200], '1,001 を 50/30/20 → 500/300+余り1/200');
  eq(r.state.chars.anne.shugyo + r.state.chars.sakuya.shugyo + r.state.chars.karma.shugyo, 1001, '配った合計は増えた分と同じ');
  // 割り当ての変更はまだ取り込んでいない分から効く
  let s2 = R.setSlots(r.state, ['sakuya', 'anne', 'karma'], [0, 100, 0]);
  s2 = run(s2, '2026-10-27', 2001).state;
  eq([s2.chars.sakuya.shugyo, s2.chars.anne.shugyo], [500, 1301], '割り当ての変更は配り済みを動かさない');
}

section('setSlots の検査（違反は state を変えずに { error }）');
{
  let s = mk('anne');
  s.chars.sakuya = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  const snap = JSON.stringify(s);
  eq(R.setSlots(s, ['sakuya', null, null], [100, 0, 0]).error, 'mainMissing', '主相棒は必ず枠に');
  eq(R.setSlots(s, ['anne', 'kohaku', null], [50, 50, 0]).error, 'notVisited', '来訪済みのみ');
  eq(R.setSlots(s, ['anne', 'anne', null], [50, 50, 0]).error, 'duplicate', '重複なし');
  eq(R.setSlots(s, ['anne', null, null], [90, 10, 0]).error, 'nullAlloc', 'null 枠の割り当ては0');
  eq(R.setSlots(s, ['anne', 'sakuya', null], [50, 40, 0]).error, 'allocSum', '合計100');
  eq(R.setSlots(s, ['anne', 'sakuya', null], [55, 45, 0]).error, 'allocStep', '10きざみ');
  eq(R.setSlots(s, ['anne', 'nope', null], [50, 50, 0]).error, 'unknownChar', '知らない体');
  eq(R.setSlots(s, ['anne', 'sakuya'], [50, 50]).error, 'slotsLength', '枠は3つ');
  eq(JSON.stringify(s), snap, '違反のとき state は変わらない');
  const ok1 = R.setSlots(s, ['sakuya', 'anne', null], [70, 30, 0]);
  ok(!ok1.error && ok1.slots[1] === 'anne', '正しい割り当ては通る');
  ok(!R.setSlots(s, ['anne', 'sakuya', null], [50, 50, 0]).error, '見本「二人で分ける」');
  s.chars.kohaku = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  ok(!R.setSlots(s, ['anne', 'sakuya', 'kohaku'], [34, 33, 33]).error, '見本「三人で分ける」34/33/33 は10きざみでなくても通る');
  ok(!R.setSlots(s, ['anne', 'sakuya', 'kohaku'], [100, 0, 0]).error, '体の入った枠の0%は可');
}

section('相性（全 type。judgeAffinity と取り込みの両方）');
{
  const base = (o) => Object.assign({ date: '2026-10-27', mode: 'otona', bi: null, home: false, family: false, goal: 8000, shugyo: 5000, prevShugyo: 5000, present: [], visited: () => true, rankOf: () => 0 }, o);
  const bi = (b) => R.bucketInfo(b, 'otona');
  const J = (spec, id, o) => R.judgeAffinity(spec, id, base(o));
  // clan（甲賀の朝5〜9時、こどもは7〜9時）
  eq(J({ type: 'clan' }, 'sakuya', { bi: bi(hours({ 5: 1000 })) }), true, 'clan: 甲賀 5時台1,000で合う');
  eq(J({ type: 'clan' }, 'sakuya', { bi: bi(hours({ 5: 999 })) }), false, 'clan: 999 は合わない');
  eq(J({ type: 'clan' }, 'sakuya', { mode: 'kodomo', bi: R.bucketInfo(hours({ 6: 1000 }), 'kodomo') }), false, 'clan: こどもは6時台では合わない（kids 7〜9時）');
  eq(J({ type: 'clan' }, 'sakuya', { mode: 'kodomo', bi: R.bucketInfo(hours({ 7: 1000 }), 'kodomo') }), true, 'clan: こどもは7時台で合う');
  eq(J({ type: 'clan' }, 'sakuya', { bi: null }), null, 'clan: 区間なしは判定なし');
  // win（猫又 20〜23時、こどもは16〜18時。to は含まない）
  const neko = D.AFFINITY.nekomata;
  eq(J(neko, 'nekomata', { bi: bi(hours({ 22: 1000 })) }), true, 'win: 22時台は合う');
  eq(J(neko, 'nekomata', { bi: bi(hours({ 23: 1000 })) }), false, 'win: 23時台は含まない');
  eq(J(neko, 'nekomata', { bi: bi(hours({ 20: 500, 21: 500 })) }), true, 'win: 時間帯の合計で1,000');
  eq(J(neko, 'nekomata', { mode: 'kodomo', bi: R.bucketInfo(hours({ 17: 1000 }), 'kodomo') }), true, 'win: こどもは kids の時間帯');
  eq(J(neko, 'nekomata', { mode: 'kodomo', bi: R.bucketInfo(hours({ 21: 1000 }), 'kodomo') }), false, 'win: こどもは夜の時間帯では合わない');
  eq(J(neko, 'nekomata', {}), null, 'win: 区間なしは判定なし');
  // cont
  eq(J({ type: 'cont' }, 'hayate', { bi: bi(hours({ 9: 3000 })) }), true, 'cont: 1時間3,000');
  eq(J({ type: 'cont' }, 'hayate', { bi: bi(hours({ 9: 2999, 10: 2999 })) }), false, 'cont: 2,999 は合わない');
  const q = new Array(96).fill(0); q[38] = 750; q[39] = 750; q[40] = 750; q[41] = 750;
  eq(J({ type: 'cont' }, 'hayate', { bi: bi(q) }), true, 'cont: 15分区間の連続4つで3,000（時をまたいでも）');
  eq(J({ type: 'cont' }, 'hayate', {}), null, 'cont: 区間なしは判定なし');
  // bits
  eq(J({ type: 'bits' }, 'nagisa', { bi: bi(hours({ 8: 100, 9: 100, 10: 100, 11: 100, 12: 100, 13: 100 })) }), true, 'bits: 100歩以上の時間が6つ');
  eq(J({ type: 'bits' }, 'nagisa', { bi: bi(hours({ 8: 100, 9: 100, 10: 100, 11: 100, 12: 100, 13: 99 })) }), false, 'bits: 5つでは合わない');
  eq(J({ type: 'bits' }, 'nagisa', {}), null, 'bits: 区間なしは判定なし');
  // holiday / weekday
  eq(J({ type: 'holiday' }, 'fuuta', { date: '2026-11-01' }), true, 'holiday: 日曜');
  eq(J({ type: 'holiday' }, 'fuuta', { date: '2026-10-31' }), true, 'holiday: 土曜');
  eq(J({ type: 'holiday' }, 'fuuta', { date: '2026-11-03' }), true, 'holiday: 文化の日（火）');
  eq(J({ type: 'holiday' }, 'fuuta', { date: '2026-05-06' }), true, 'holiday: 振替休日');
  eq(J({ type: 'holiday' }, 'fuuta', { date: '2026-09-22' }), true, 'holiday: 国民の休日');
  eq(J({ type: 'holiday' }, 'fuuta', { date: '2026-10-27' }), false, 'holiday: 平日は合わない');
  eq(J({ type: 'weekday' }, 'benten', { date: '2026-10-27' }), true, 'weekday: 平日');
  eq(J({ type: 'weekday' }, 'benten', { date: '2026-11-03' }), false, 'weekday: 祝日は合わない');
  // restAfter
  eq(J({ type: 'restAfter' }, 'rotten', { prevShugyo: 2999 }), true, 'restAfter: 前の日 2,999');
  eq(J({ type: 'restAfter' }, 'rotten', { prevShugyo: 3000 }), false, 'restAfter: 前の日 3,000 は休みではない');
  eq(J({ type: 'restAfter' }, 'rotten', { prevShugyo: 0 }), true, 'restAfter: 記録のない日も休み');
  // home / road / family
  eq([J({ type: 'home' }, 'nemu', { home: true }), J({ type: 'home' }, 'nemu', { home: false })], [true, false], 'home');
  eq([J({ type: 'road' }, 'ichiya', { home: false }), J({ type: 'road' }, 'ichiya', { home: true })], [true, false], 'road');
  eq([J({ type: 'family' }, 'x', { family: true }), J({ type: 'family' }, 'x', { family: false })], [true, false], 'family');
  // goal
  eq([J({ type: 'goal' }, 'konga', { shugyo: 8000 }), J({ type: 'goal' }, 'konga', { shugyo: 7999 })], [true, false], 'goal: 目標ちょうどで合う');
  // with / withRank
  eq(J(D.AFFINITY.kohaku, 'kohaku', { present: ['kohaku', 'sakuya'] }), true, 'with: 咲耶が同じ日に枠にいる');
  eq(J(D.AFFINITY.kohaku, 'kohaku', { present: ['kohaku', 'anne'] }), false, 'with: いなければ合わない');
  eq(J(D.AFFINITY.kohaku, 'kohaku', { present: ['kohaku', 'sakuya'], visited: () => false }), false, 'with: 来訪済みであること');
  eq(J(D.AFFINITY.kanaoni, 'kanaoni', { present: ['kanaoni', 'anne'], rankOf: (o) => o === 'anne' ? 3 : 0 }), true, 'withRank: 中忍以上の別の相棒');
  eq(J(D.AFFINITY.kanaoni, 'kanaoni', { present: ['kanaoni', 'anne'], rankOf: (o) => o === 'anne' ? 2 : 5 }), false, 'withRank: 下忍では合わない（自分の位は数えない）');
  // fullmoon / sekki / steady
  eq([J({ type: 'fullmoon' }, 'sattva', { date: '2026-10-26' }), J({ type: 'fullmoon' }, 'sattva', { date: '2026-10-19' })], [true, false], 'fullmoon');
  eq([J({ type: 'sekki' }, 'torika', { date: '2026-02-04' }), J({ type: 'sekki' }, 'torika', { date: '2026-02-05' })], [true, false], 'sekki');
  eq(J({ type: 'steady' }, 'janome', { shugyo: 5000, prevShugyo: 4000 }), true, 'steady: 25%以内（+1,000/4,000）');
  eq(J({ type: 'steady' }, 'janome', { shugyo: 5001, prevShugyo: 4000 }), false, 'steady: 25%を超える');
  eq(J({ type: 'steady' }, 'janome', { shugyo: 1999, prevShugyo: 1999 }), false, 'steady: 2,000未満は合わない');
  eq(J({ type: 'steady' }, 'janome', { shugyo: 3000, prevShugyo: 0 }), false, 'steady: 前の日がないと合わない');
  // 39体すべてに相性があり、type が仕様の一覧にある
  const TYPES = ['clan', 'win', 'cont', 'bits', 'holiday', 'weekday', 'restAfter', 'home', 'road', 'family', 'goal', 'with', 'withRank', 'fullmoon', 'sekki', 'steady'];
  ok(CH.CHARS.every(c => D.AFFINITY[c.id] && TYPES.includes(D.AFFINITY[c.id].type)), '39体の相性の type が仕様の一覧にある');
  ok(CH.CHARS.every(c => { const a = D.AFFINITY[c.id]; return R.judgeAffinity(a, c.id, base({ bi: bi(hours({ 8: 2000, 12: 2000, 15: 2000, 18: 2000, 21: 2000 })) })) !== undefined; }), '39体すべて判定できる');

  // 取り込みでの相性: その日はじめて合ったら、配り済みの 0.2 倍をまとめて足す
  let s = mk('anne');
  let r = run(s, T0, 5000, hours({ 10: 5000 })); s = r.state;
  eq([s.chars.anne.shugyo, ofType(r.events, 'affinity').length], [5000, 0], '餡音（14〜16時）: 10時だけでは合わない');
  r = run(s, T0, 6000, hours({ 10: 5000, 14: 1000 })); s = r.state;
  eq(ofType(r.events, 'affinity'), [{ type: 'affinity', id: 'anne', date: T0 }], '14時台に1,000で相性イベント');
  eq(s.chars.anne.shugyo, 7200, '合った日はその日の配分の1.2倍（6,000→7,200）');
  r = run(s, T0, 7000, hours({ 10: 5000, 14: 1000, 9: 1000 })); s = r.state;
  eq([s.chars.anne.shugyo, ofType(r.events, 'affinity').length], [8400, 0], '以後も1.2倍・相性イベントはその日1回');
  eq(s.visitTotal, 7000, '来訪累計には倍率はかからない');
  // 区間なしの日は時間帯の相性が判定なし（1.0倍）
  r = run(mk('anne'), T0, 6000, null);
  eq(r.state.chars.anne.shugyo, 6000, '区間なし: 時間帯の相性は1.0倍');
  // with を取り込みで
  s = mk('sakuya');
  s.chars.kohaku = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  s = R.setSlots(s, ['sakuya', 'kohaku', null], [50, 50, 0]);
  r = run(s, '2026-10-27', 2000, hours({ 12: 2000 }));
  eq([r.state.chars.kohaku.shugyo, r.state.chars.sakuya.shugyo], [1200, 1000], '狐白は咲耶と同じ日に枠で1.2倍（咲耶は朝ではないので1.0倍）');
  // goal 型は目標に届いた時点で合い、それまでの分にもさかのぼる
  s = mk('sakuya'); s.chars.hinanojoh = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  s = R.setSlots(s, ['sakuya', 'hinanojoh', null], [50, 50, 0]);
  s = run(s, '2026-10-27', 6000).state;
  eq(s.chars.hinanojoh.shugyo, 3000, '雛之丞: 目標前は1.0倍');
  s = run(s, '2026-10-27', 8000).state;
  eq(s.chars.hinanojoh.shugyo, 4800, '雛之丞: 目標に届いたら、その日の分（4,000）の1.2倍');
}

section('位と奥義の境界');
{
  eq([R.rankOf(0), R.rankOf(9999), R.rankOf(10000)], [0, 0, 1], '位: 9,999 / 10,000');
  eq([R.rankOf(39999), R.rankOf(40000), R.rankOf(99999), R.rankOf(100000)], [1, 2, 2, 3], '位: 4万 / 10万');
  eq([R.rankOf(249999), R.rankOf(250000), R.rankOf(899999), R.rankOf(900000)], [3, 4, 4, 5], '位: 25万 / 90万');
  eq([R.okugiOf(1199999), R.okugiOf(1200000), R.okugiOf(1499999), R.okugiOf(1500000), R.okugiOf(3000000)], [0, 1, 1, 2, 2], '奥義: 120万 / 150万');
  let s = mk('anne');
  let r = run(s, T0, 9999); s = r.state;
  eq(ofType(r.events, 'rank').length, 0, '9,999 では位は上がらない');
  r = run(s, T0, 10000); s = r.state;
  eq(ofType(r.events, 'rank'), [{ type: 'rank', id: 'anne', rank: 1 }], '10,000 で見習い');
  s.chars.anne.shugyo = 1199999; s.chars.anne.rank = 5;
  r = run(s, '2026-10-27', 1); s = r.state;
  eq(ofType(r.events, 'okugi'), [{ type: 'okugi', id: 'anne', level: 1 }], '120万で奥義1');
  s.chars.anne.shugyo = 1499998;
  r = run(s, '2026-10-27', 3); s = r.state;
  eq(ofType(r.events, 'okugi'), [{ type: 'okugi', id: 'anne', level: 2 }], '150万で奥義2');
  s = mk('anne'); s.chars.anne.shugyo = 899999; s.chars.anne.rank = 4;
  r = run(s, T0, 1);
  eq(ofType(r.events, 'rank'), [{ type: 'rank', id: 'anne', rank: 5 }], '90万で免許皆伝');
  ok(r.state.dyes.includes('kin') && ofType(r.events, 'dyeUnlock').some(e => e.dyeId === 'kin'), '免許皆伝で金の染めが使えるようになる');
  s = mk('anne'); s.chars.anne.shugyo = 25000;
  r = run(s, T0, 16500);
  eq(ofType(r.events, 'rank').map(e => e.rank), [1, 2], 'まとめて上がると1段ずつイベント');
  const ri = R.rankInfo(25000);
  eq([ri.rank, ri.nextAt, ri.toNext], [1, 40000, 15000], 'rankInfo: 次の位まで');
}

section('来訪の順（主相棒の除外・最初の7体・14万で8体）');
{
  const expect = {
    anne: ['sakuya', 'kohaku', 'shiba', 'karma', 'hayate', 'nemu', 'hinanojoh'],
    sakuya: ['kohaku', 'shiba', 'anne', 'karma', 'hayate', 'nemu', 'hinanojoh'],
    kohaku: ['sakuya', 'shiba', 'anne', 'karma', 'hayate', 'nemu', 'hinanojoh'],
    shiba: ['sakuya', 'kohaku', 'anne', 'karma', 'hayate', 'nemu', 'hinanojoh']
  };
  for (const main of Object.keys(expect)) {
    const s0 = mk(main);
    eq(R.queue(s0).slice(0, 7), expect[main], main + ': 列の先頭7体');
    eq(R.queue(s0).length, 38, main + ': 列は38体（主相棒を除く）');
    eq(R.queue(s0)[37], 'jin', main + ': 刃は列の最後（38番目）');
    const w = walker(s0).to(140000);
    eq(ofType(w.take(), 'visit').map(e => e.id), expect[main], main + ': 14万までに来た7体');
    eq(Object.keys(w.s.chars).sort(), D.FIRST8.slice().sort(), main + ': 14万で最初の8体がそろう');
  }
}

section('VISIT_AT の各境界（38回）と刃の影・名乗り');
{
  const w = walker(mk('anne'));
  let allOk = true;
  for (let k = 0; k < D.VISIT_AT.length; k++) {
    w.to(D.VISIT_AT[k] - 1);
    if (w.s.visits !== k) { allOk = false; console.log('    visits@' + (D.VISIT_AT[k] - 1) + '=' + w.s.visits); }
    w.to(D.VISIT_AT[k]);
    if (w.s.visits !== k + 1) { allOk = false; console.log('    visits@' + D.VISIT_AT[k] + '=' + w.s.visits); }
  }
  ok(allOk, '各 VISIT_AT の1歩手前では来ず、ちょうどで来る（38か所）');
  const ev = w.take();
  const visits = ofType(ev, 'visit');
  eq(visits.length, 37, 'visit イベントは37回（1..37）');
  eq(visits.map(e => e.n), Array.from({ length: 37 }, (_, i) => i + 1), 'n は1から37');
  eq(visits.map(e => e.id), D.VISIT_ORDER.filter(id => id !== 'anne' && id !== 'jin'), '来訪の順は固定順から主相棒を除いたもの');
  eq(ofType(ev, 'jinShadow').length, 1, '38回目（115万）は刃の影');
  ok(w.s.chars.jin && w.s.chars.jin.shadow === true && w.s.jin.shadow && !w.s.jin.revealed, 'chars に jin が入り「なぞの影」の印');
  ok(ofType(ev, 'hideOpen').length === 1, '14万でかくれる探しが始まる（1回）');
  w.to(C.JIN_REVEAL_AT - 1);
  eq(ofType(w.take(), 'jinReveal').length, 0, '119万9,999 では名乗らない');
  w.to(C.JIN_REVEAL_AT);
  eq(ofType(w.take(), 'jinReveal').length, 1, '120万で刃が名乗る');
  ok(w.s.jin.revealed && w.s.chars.jin.shadow === false, '名乗ったら影の印が外れる');
  eq(R.queue(w.s), [], '全員来たら列は空');
  w.to(1300000);
  eq(ofType(w.take(), 'visit').length + ofType(w.take(), 'jinShadow').length, 0, 'それ以上は来訪なし');
}

section('宿場（2万歩ちょうど・吉原・染め・二巡目）');
{
  const w = walker(mk('anne'));
  w.to(19999);
  eq(w.s.stationsReached, 0, '19,999 では宿場に着かない');
  w.take();
  w.to(20000);
  let ev = w.take();
  eq(ofType(ev, 'station'), [{ type: 'station', idx: 1, round: 1 }], '2万歩ちょうどで宿場1（甲賀）');
  ok(ofType(ev, 'dyeUnlock').some(e => e.dyeId === 'shu') && w.s.dyes.includes('shu'), '甲賀で朱が使えるようになる');
  w.to(40000); ev = w.take();
  ok(ofType(ev, 'dyeUnlock').some(e => e.dyeId === 'hai'), '土山で灰（街道）');
  w.to(17 * 20000); ev = w.take();
  eq(ofType(ev, 'stationEvent'), [{ type: 'stationEvent', idx: 17, kind: 'atoza' }], '宿場17（吉原）でアトザ');
  w.to(21 * 20000); ev = w.take();
  ok(ofType(ev, 'dyeUnlock').some(e => e.dyeId === 'matsuba'), '小田原で松葉');
  w.to(50 * 20000); ev = w.take();
  ok(ofType(ev, 'dyeUnlock').some(e => e.dyeId === 'shio'), '雑賀崎で潮色');
  eq([w.s.stationsReached, w.s.round], [50, 1], '50宿で一巡目のおわり');
  w.to(51 * 20000); ev = w.take();
  eq(ofType(ev, 'station'), [{ type: 'station', idx: 49, round: 2 }], '51回目は二巡目の宿場49');
  eq(w.s.round, 2, 'round=2');
  w.to(83 * 20000); ev = w.take();
  ok(ofType(ev, 'station').some(e => e.idx === 17 && e.round === 2) && ofType(ev, 'stationEvent').length === 0, '二巡目の吉原では会話を出さない');
  w.to(100 * 20000); ev = w.take();
  eq(ofType(ev, 'station').pop(), { type: 'station', idx: 0, round: 2 }, '100回目で伊賀上野へ戻る');
  w.to(101 * 20000);
  eq([ofType(w.take(), 'station').length, w.s.stationsReached], [0, 100], '二巡目のあとは宿場イベントなし');
  eq(R.stationOf(50), { idx: 50, round: 1 }, 'stationOf(50)');
  ok(w.s.diary.length === 100 && w.s.diary[0].idx === 1, '旅の日記に着いた宿場が残る');
}

section('巻物（1,000歩ごと）と忍術の間');
{
  let s = mk('anne');
  let r = run(s, T0, 999); s = r.state;
  eq([s.scrolls, ofType(r.events, 'scroll').length], [0, 0], '999歩では巻物なし');
  ok(R.openScroll(s, 'anne') === null, '巻物がなければ null');
  r = run(s, T0, 1000); s = r.state;
  eq(ofType(r.events, 'scroll'), [{ type: 'scroll', n: 1 }], '1,000歩で巻物1本');
  r = run(s, T0, 3500); s = r.state;
  eq([ofType(r.events, 'scroll')[0].n, s.scrolls], [2, 3], '3,500歩で合計3本（またいだ数）');
  const o = R.openScroll(s, 'anne');
  eq(o.jutsu, { charId: 'anne', fx: 'shadowstitch', rank: 0, okugi: 0, secret: false }, '開くと忍術の情報');
  eq([o.state.scrollsOpened, R.summary(o.state, T0).scrolls], [1, 2], '残りは2本');
  eq(R.openScroll(s, 'sakuya'), null, '来訪していない体では開けない');
  s.chars.rei = { joined: T0, shugyo: 0, rank: 2, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  eq(R.openScroll(s, 'rei').jutsu.secret, true, '令は「ひみつの術」');
}

section('我が家の付け替え（setChoice）');
{
  let s = mk('anne');
  s = R.setChoice(s, T0, { home: true }, T0);
  let r = run(s, T0, 10000); s = r.state;
  eq([s.visitTotal, s.roadTotal, s.hideTotal], [10000, 0, 10000], '取り込みの前に我が家: 道は進まず隠れ里へ');
  eq(r.state.chars.anne.shugyo, 10000, '我が家の日も修行値は入る');
  s = R.setChoice(s, T0, { home: false }, T0);
  eq([s.roadTotal, s.hideTotal], [10000, 0], '取り込みの後に付け替え（道へ戻す）');
  // 宿場に着いたあとで我が家に付け替えても、着いた宿場の数は減らない
  s = mk('anne');
  s = run(s, T0, 12000).state;
  s = run(s, '2026-10-27', 9000).state;
  eq(s.stationsReached, 1, '2万をこえて宿場1');
  s = R.setChoice(s, '2026-10-27', { home: true }, '2026-10-27');
  eq([s.roadTotal, s.hideTotal, s.stationsReached], [12000, 9000, 1], '付け替えても stationsReached は減らない');
  r = R.ingest(s, [day('2026-10-28', 16500)], { today: '2026-10-28' }); s = r.state;
  eq([s.roadTotal, s.stationsReached], [28500, 1], '次の宿場は「いちばん先に着いた宿場の次」（4万）');
  // 「今日は」の選択なので、ほかの日は付け替えられない
  eq(R.setChoice(s, '2026-10-27', { home: false }, '2026-10-28'), s, '過去の日は付け替えられない（state はそのまま）');
  eq(R.setChoice(s, '2026-10-29', { home: true }, '2026-10-28'), s, '先の日も選べない');
  eq(R.setChoice(s, '2026-10-27', { home: false }), s, 'today なしの呼び方でも、最後に取り込んだ日より前の日は断る');
  eq(R.setChoice(s, '2026-10-27', { home: false }, { today: '2026-10-28' }), s, '{ today } の形でも過去の日は断る');
  {
    // 指摘の例: 前回の同期日と今日の間の過去の日（today を渡せば断る）
    let q = mk('anne');
    q = run(q, '2026-10-15', 5000).state;
    eq(R.setChoice(q, '2026-10-20', { home: true }, '2026-10-28'), q, '前回の同期日と今日の間の過去の日も断る');
    eq(R.setChoice(q, '2026-10-20', { home: true }, { today: '2026-10-28' }), q, '{ today } の形でも同じ');
    const ok = R.setChoice(q, '2026-10-28', { home: true }, { today: '2026-10-28' });
    eq([ok !== q, ok.daily['2026-10-28'].home], [true, true], '取り込み前の今日は選べる（{ today } の形）');
    eq(R.setChoice(null, '2026-10-28', { home: true }, '2026-10-28'), null, 'state がないときは投げずにそのまま');
  }
  s = R.setChoice(s, '2026-10-28', { home: true }, '2026-10-28');
  eq([s.roadTotal, s.hideTotal], [12000, 25500], '今日の分は付け替えられる');
  s = R.setChoice(s, '2026-10-28', { home: false }, '2026-10-28');
  r = R.ingest(s, [], { today: '2026-10-28' });
  eq([r.state.roadTotal, r.state.stationsReached, ofType(r.events, 'station').length], [28500, 1, 0], '道に戻しても4万までは着かない');
  r = R.ingest(r.state, [day('2026-10-29', 11500)], { today: '2026-10-29' });
  eq([r.state.roadTotal, r.state.stationsReached], [40000, 2], '4万で宿場2');
  const sf = R.setFamilyDay(mk(), T0, true);
  ok(sf.daily[T0].family === true, '家族で歩いた日');
}

section('我が家と道の相性は同じ日に両方合わない');
{
  const prep = () => {
    let s = mk('anne');
    for (const id of ['nemu', 'ichiya']) s.chars[id] = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
    return R.setSlots(s, ['anne', 'nemu', 'ichiya'], [0, 50, 50]);
  };
  // 道の日に取り込み → 我が家に付け替え → もう一度取り込み
  let s = prep();
  let r = run(s, T0, 4000); s = r.state;
  eq(ofType(r.events, 'affinity').map(e => e.id), ['ichiya'], '道の日: 一夜（道）が合う');
  s = R.setChoice(s, T0, { home: true }, T0);
  r = run(s, T0, 8000); s = r.state;
  eq(ofType(r.events, 'affinity').length, 0, '我が家に付け替えても、ネム（我が家）は同じ日には合わない');
  eq(Object.keys(s.daily[T0].aff), ['ichiya'], 'その日の相性は先に合った側だけ');
  eq([s.chars.ichiya.shugyo, s.chars.nemu.shugyo], [4800, 4000], '1.2倍は一夜だけ');
  // 逆（我が家の日に取り込み → 道に戻す）
  s = R.setChoice(prep(), T0, { home: true }, T0);
  r = run(s, T0, 4000); s = r.state;
  eq(ofType(r.events, 'affinity').map(e => e.id), ['nemu'], '我が家の日: ネムが合う');
  s = R.setChoice(s, T0, { home: false }, T0);
  r = run(s, T0, 8000); s = r.state;
  eq([ofType(r.events, 'affinity').length, Object.keys(s.daily[T0].aff)], [0, ['nemu']], '道に戻しても一夜は合わない');
  const sm = R.summary(s, T0);
  eq(sm.slots.find(x => x.id === 'ichiya').affNow, false, 'summary: 一夜の affNow は false');
}

section('配分は何回に分けて読んでも同じ（増えた分の累計で割る）');
{
  const three = () => {
    let s = mk('anne');
    for (const id of ['sakuya', 'kohaku']) s.chars[id] = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
    return R.setSlots(s, ['anne', 'sakuya', 'kohaku'], [34, 33, 33]);
  };
  let s = three();
  for (let i = 1; i <= 1000; i++) s = run(s, T0, 9 * i).state;
  eq(sortKeys(s.daily[T0].alloc), { anne: 3060, kohaku: 2970, sakuya: 2970 }, '9歩ずつ1,000回でも 3,060/2,970/2,970');
  eq(sortKeys(run(three(), T0, 9000).state.daily[T0].alloc), { anne: 3060, kohaku: 2970, sakuya: 2970 }, '一度に9,000歩と同じ');
  let t = three();
  for (let i = 1; i <= 50; i++) t = run(t, T0, i).state;
  const a = t.daily[T0].alloc;
  eq((a.anne || 0) + (a.sakuya || 0) + (a.kohaku || 0), 50, '1歩ずつでも配った合計は増えた分と同じ');
  eq(sortKeys(a), sortKeys(run(three(), T0, 50).state.daily[T0].alloc), '1歩ずつ50回と一度に50歩が同じ');
  // 90/10 で 9,999 → 10,000
  let u = mk('anne');
  u.chars.sakuya = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  u = R.setSlots(u, ['anne', 'sakuya', null], [90, 10, 0]);
  u = run(u, T0, 9999).state;
  eq(u.daily[T0].alloc.sakuya, 999, '9,999歩: 咲耶は999');
  const r = run(u, T0, 10000);
  eq([r.state.daily[T0].alloc.sakuya, ofType(r.events, 'bond').some(e => e.id === 'sakuya')], [1000, true], '10,000歩で咲耶は1,000になり絆が付く');
  // 割り当てを変えたら新しい累計（配り済みは動かさない）
  let v = R.setSlots(r.state, ['anne', 'sakuya', null], [50, 50, 0]);
  v = run(v, T0, 12000).state;
  eq(sortKeys(v.daily[T0].alloc), { anne: 10000, sakuya: 2000 }, '割り当て変更のあとは、変更後の増えた分だけを新しい割合で');
}

section('割り当て0%の体と、歩いていない日には相性のカードを出さない');
{
  let s = mk('anne');
  s.chars.fuuta = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  s = R.setSlots(s, ['anne', 'fuuta', null], [100, 0, 0]);
  let r = run(s, '2026-11-03', 3000);
  eq(ofType(r.events, 'affinity').filter(e => e.id === 'fuuta').length, 0, '0%の風太には文化の日でも affinity が出ない');
  s = R.setSlots(r.state, ['anne', 'fuuta', null], [50, 50, 0]);
  r = run(s, '2026-11-03', 5000);
  eq(ofType(r.events, 'affinity').map(e => e.id), ['fuuta'], '割り当てが増えたら、その取り込みで合う');
  eq(r.state.chars.fuuta.shugyo, 1200, '風太は増えた分（1,000）の1.2倍');
  r = run(mk('anne'), '2026-11-03', 0);
  eq(ofType(r.events, 'affinity').length, 0, '歩数0の日は相性のカードなし');
}

section('かくれる探し（14万から・14万からの隠れ里の累計5,000ごとに1回・先頭3体・決定的）');
{
  let s = mk('anne');
  s = R.setChoice(s, T0, { home: true }, T0);
  s = run(s, T0, 10000).state;
  eq(R.search(s).found, null, '14万までは探せない');
  eq(R.search(s).reason, 'notOpen', '理由: まだ静か');
  const w = walker(s, '2026-10-27').to(140000);
  s = w.s;
  eq([s.hideBase, R.searchesLeft(s)], [10000, 0], '14万より前の我が家の分（1万）は数えない');
  const d = R.addDays(w.date, 1);
  s = R.setChoice(s, d, { home: true }, d);
  s = run(s, d, 10000).state;
  eq(R.searchesLeft(s), 2, '14万のあとの隠れ里の累計1万で2回');
  eq(R.summary(s, d).hide.toNextSearch, 5000, '次の「探す」まで5,000');
  const cands = R.hideCandidates(s);
  eq(cands, R.queue(s).slice(0, 3), '候補は来訪の列の先頭3体');
  eq(cands, ['ichiya', 'oto', 'uka'], '14万の時点の候補');
  const a1 = R.search(s), a2 = R.search(s);
  eq(a1.found, a2.found, '同じ状態なら同じ体（決定的）');
  ok(cands.includes(a1.found), '見つけるのは候補の中から');
  eq(R.queue(a1.state)[0], a1.found, '見つけた体は来訪の列の先頭へ');
  ok(!R.hideCandidates(a1.state).includes(a1.found) && R.hideCandidates(a1.state).length === 3, '見つけた体は候補から外れ、次の体が候補に入る');
  const b = R.search(a1.state);
  ok(b.found && b.found !== a1.found, '2回目は別の体');
  const c = R.search(b.state);
  eq([c.found, c.reason], [null, 'noSearch'], '回数を使いきったら探せない');
  const w2 = walker(b.state, R.addDays(d, 1)).to(160000);
  eq(ofType(w2.take(), 'visit').map(e => e.id), [a1.found], '次の来訪で見つけた体が来る');
  // 14万をまたぐ取り込みが我が家の日なら、14万より後の分は数える
  const hw = walker(mk('anne')).to(134000);
  const hd = R.addDays(hw.date, 1);
  let h = R.setChoice(hw.s, hd, { home: true }, hd);
  const hr = run(h, hd, 11000);
  eq([ofType(hr.events, 'hideOpen').length, hr.state.hideTotal, hr.state.hideBase, R.searchesLeft(hr.state)], [1, 11000, 6000, 1], '14万をまたいだ日: 14万より後の5,000で1回');
}

section('家族の掲示板（最大5・置き換え・14日）と里の客（7日）');
{
  let s = mk('anne');
  const P = (ci, shugyo, extra = {}) => Object.assign({ charIndex: ci, rank: 1, okugi: 0, shugyo, dye: 0, bond: 3, date: 300, station: 2, round: 1 }, extra);
  let r = R.readGuest(s, P(8, 20000), T0); s = r.state;
  eq([s.board.length, r.entry.id, r.entry.readAt, r.entry.date], [1, 'anne', T0, '2026-10-28'], '1枚貼る（日付は2026-01-01からの日数）');
  r = R.readGuest(s, P(8, 30000), '2026-10-27'); s = r.state;
  eq([s.board.length, s.board[0].shugyo, r.entry.replaced], [1, 30000, true], '同じ charIndex で修行値が少ない古い札は置き換え');
  r = R.readGuest(s, P(8, 30000), '2026-10-28'); s = r.state;
  eq([s.board.length, s.board[0].readAt], [1, '2026-10-28'], '同じ修行値も置き換え');
  r = R.readGuest(s, P(8, 10000), '2026-10-28'); s = r.state;
  eq([s.board.length, r.entry.replaced], [2, false], '修行値が多い札は置き換えない（別の札として貼る）');
  for (let i = 0; i < 3; i++) s = R.readGuest(s, P(i, 5000), R.addDays('2026-10-29', i)).state;
  eq(s.board.length, 5, '5枚まで貼れる');
  r = R.readGuest(s, P(3, 5000), '2026-11-01'); s = r.state;
  eq([s.board.length, r.entry.dropped], [5, 1], '掲示板は最大5枚（6枚目で1枚外す）');
  eq(s.board.map(b => b.readAt), ['2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28'], 'あふれたら読んだ日がいちばん古い札から外す');
  eq(R.readGuest(s, { charIndex: 39 }, T0).error, 'payload', 'charIndex が範囲外なら読まない');
  let b = R.boardOf(s, R.addDays('2026-11-01', 13));
  eq(b.find(x => x.readAt === '2026-11-01').stale, false, '13日目はまだ見える');
  b = R.boardOf(s, R.addDays('2026-11-01', 14));
  eq(b.find(x => x.readAt === '2026-11-01').stale, true, '14日読み直さないと「かくれる」');
  const g = R.readGuest(mk(), P(3, 1000), T0).state;
  eq(R.guestsOf(g, R.addDays(T0, 6)).length, 1, '里の客は7日目まで');
  eq(R.guestsOf(g, R.addDays(T0, 7)).length, 0, '8日目にはいない');
  eq(R.guestsOf(g, T0)[0].id, 'shiba', '客は charIndex の体');
}

section('市の染め（日曜だけ・日曜1回・使える色だけ）');
{
  let s = mk('anne');
  eq(R.weekday('2026-11-01'), 0, '2026-11-01 は日曜');
  let r = R.dye(s, 'anne', 'ai', '2026-10-31');
  eq([r.ok, r.reason], [false, 'notSunday'], '土曜は染められない');
  r = R.dye(s, 'anne', 'ai', '2026-11-01');
  eq([r.ok, r.state.chars.anne.dye], [true, 'ai'], '日曜に藍');
  const r2 = R.dye(r.state, 'anne', 'none', '2026-11-01');
  eq([r2.ok, r2.reason], [false, 'already'], '日曜1回');
  eq(R.dye(r.state, 'anne', 'shu', '2026-11-08').reason, 'locked', 'まだ使えない色（朱）');
  eq(R.dye(r.state, 'anne', 'beni', '2026-11-08').reason, 'unknownDye', '知らない色');
  eq(R.dye(r.state, 'sakuya', 'ai', '2026-11-08').reason, 'noChar', '来訪していない体');
  ok(R.dye(r.state, 'anne', 'none', '2026-11-08').ok, '次の日曜はまた染められる');
  s = walker(mk('anne')).to(20000).s;
  ok(R.dye(s, 'anne', 'shu', '2026-11-01').ok, '甲賀に着いたら朱が使える');
}

section('祝日（2026年の18日と、2027〜2035年の振替・国民の休日・春分秋分）');
{
  const H2026 = ['01-01', '01-12', '02-11', '02-23', '03-20', '04-29', '05-03', '05-04', '05-05', '05-06', '07-20', '08-11', '09-21', '09-22', '09-23', '10-12', '11-03', '11-23'];
  const got = [];
  for (let d = '2026-01-01'; d <= '2026-12-31'; d = R.addDays(d, 1)) if (R.isHoliday(d)) got.push(d.slice(5));
  eq(got, H2026, '2026年の祝日はちょうど18日');
  eq(R.holidayName('2026-05-06'), { name: '振替休日', kana: 'ふりかえきゅうじつ' }, '2026-05-06 振替休日');
  eq(R.holidayName('2026-09-22').name, '国民の休日', '2026-09-22 国民の休日');
  eq(R.holidayName('2026-01-12').name, '成人の日', '成人の日は1月の第2月曜');
  eq(R.holidayName('2026-10-12').name, 'スポーツの日', 'スポーツの日は10月の第2月曜');
  const shunbun = { 2027: 21, 2028: 20, 2029: 20, 2030: 20, 2031: 21, 2032: 20, 2033: 20, 2034: 20, 2035: 21 };
  const shubun = { 2027: 23, 2028: 22, 2029: 23, 2030: 23, 2031: 23, 2032: 22, 2033: 23, 2034: 23, 2035: 23 };
  let all = true;
  for (const y in shunbun) {
    if ((R.holidayName(y + '-03-' + shunbun[y]) || {}).name !== '春分の日') all = false;
    if ((R.holidayName(y + '-09-' + shubun[y]) || {}).name !== '秋分の日') all = false;
  }
  ok(all, '2027〜2035年の春分の日・秋分の日');
  eq([R.weekday('2027-03-21'), R.holidayName('2027-03-22').name], [0, '振替休日'], '2027-03-22 振替休日（春分が日曜）');
  eq([R.weekday('2029-04-29'), R.holidayName('2029-04-30').name], [0, '振替休日'], '2029-04-30 振替休日');
  eq(R.holidayName('2032-09-21').name, '国民の休日', '2032-09-21 国民の休日（敬老の日9/20と秋分の日9/22の間）');
  eq(R.holidayName('2034-01-02').name, '振替休日', '2034-01-02 振替休日（元日が日曜）');
  eq(R.holidayName('2030-05-06').name, '振替休日', '2030-05-06 振替休日（5/5 が日曜）');
  eq(R.holidayName('2031-11-24').name, '振替休日', '2031-11-24 振替休日');
  ok(!R.isHoliday('2026-10-27') && !R.isHoliday('2026-12-31'), '平日は祝日でない');
  let cnt = true;
  for (let y = 2026; y <= 2035; y++) { let n = 0; for (let d = y + '-01-01'; d <= y + '-12-31'; d = R.addDays(d, 1)) if (R.isHoliday(d)) n++; if (n < 16 || n > 19) cnt = false; }
  ok(cnt, '2026〜2035年の祝日の数は毎年16〜19日');
}

section('二十四節気');
{
  eq(R.solarTerm('2026-02-04'), { name: '立春', kana: 'りっしゅん', deg: 315 }, '2026 立春 2/4');
  eq(R.solarTerm('2026-03-20').name, '春分', '2026 春分 3/20');
  eq(R.solarTerm('2026-06-21').name, '夏至', '2026 夏至 6/21');
  eq(R.solarTerm('2026-09-23').name, '秋分', '2026 秋分 9/23');
  eq(R.solarTerm('2026-12-22').name, '冬至', '2026 冬至 12/22');
  eq([R.solarTerm('2026-02-03'), R.solarTerm('2026-02-05')], [null, null], '前後の日は節気でない');
  const terms = [];
  for (let d = '2026-01-01'; d <= '2026-12-31'; d = R.addDays(d, 1)) { const t = R.solarTerm(d); if (t) terms.push(d.slice(5) + t.name); }
  eq(terms, ['01-05小寒', '01-20大寒', '02-04立春', '02-19雨水', '03-05啓蟄', '03-20春分', '04-05清明', '04-20穀雨', '05-05立夏', '05-21小満', '06-06芒種', '06-21夏至',
    '07-07小暑', '07-23大暑', '08-07立秋', '08-23処暑', '09-07白露', '09-23秋分', '10-08寒露', '10-23霜降', '11-07立冬', '11-22小雪', '12-07大雪', '12-22冬至'], '2026年の24節気（暦要項と同じ日）');
  let all24 = true;
  for (let y = 2026; y <= 2035; y++) { let n = 0; for (let d = y + '-01-01'; d <= y + '-12-31'; d = R.addDays(d, 1)) if (R.solarTerm(d)) n++; if (n !== 24) all24 = false; }
  ok(all24, '2026〜2035年は毎年24日');
  ok(R.solarTerm('2026-02-04').kana === 'りっしゅん' && R.solarTerm('2026-12-22').kana === 'とうじ', 'かなが付く');
}

section('満月（月齢13.8〜15.8日）');
{
  // 2026年の満月（日本時間）。国立天文台の暦要項などで公表されている日
  const FULL = ['01-03', '02-02', '03-03', '04-02', '05-02', '05-31', '06-30', '07-29', '08-28', '09-27', '10-26', '11-24', '12-24'];
  const miss = FULL.filter(md => !R.isFullMoon('2026-' + md));
  eq(miss, [], '2026年の13回の満月の日はどれも「満月のころ」');
  const first = [];
  for (let d = '2026-01-01'; d <= '2026-12-31'; d = R.addDays(d, 1)) if (R.isFullMoon(d) && !R.isFullMoon(R.addDays(d, -1))) first.push(d);
  eq(first.length, 13, '2026年は満月のころが13回');
  ok(!R.isFullMoon('2026-10-19') && !R.isFullMoon('2026-11-09'), '新月・半月のころは満月でない');
  const a = R.moonAge('2000-01-07');
  ok(a > 0 && a < 1.5, '基準の新月（2000-01-06 18:14 UTC）の翌日は月齢1前後');
}

section('日付の道具');
{
  eq([R.weekday('2026-10-26'), R.weekday('2026-10-27')], [1, 2], 'weekday');
  eq([R.addDays('2026-12-31', 1), R.addDays('2026-03-01', -1), R.addDays('2028-02-28', 1)], ['2027-01-01', '2026-02-28', '2028-02-29'], 'addDays（年またぎ・うるう年）');
  eq([R.diffDays('2026-10-26', '2026-11-02'), R.diffDays('2026-11-02', '2026-10-26')], [7, -7], 'diffDays(a, b) = b − a');
  eq(R.mondayOf('2026-11-01'), '2026-10-26', '日曜の週の月曜');
}

section('7日の保持（実歩数）');
{
  let s = mk('anne');
  for (let i = 0; i < 8; i++) s = run(s, R.addDays(T0, i), 1000 + i).state;
  const today = R.addDays(T0, 7);
  eq(Object.keys(s.recent).sort(), Array.from({ length: 7 }, (_, i) => R.addDays(T0, i + 1)), '直近7日だけ残り、8日目に消す');
  ok(!(T0 in s.recent) && s.daily[T0].shugyo === 1000, '消えるのは歩数だけ（修行値の記録は残る）');
  ok(!('steps' in s.daily[T0]), 'daily には歩数そのものを持たない');
  eq(R.dayReview(s, T0).steps, null, '7日を過ぎた日のふりかえりは歩数なし');
  eq(R.dayReview(s, today).steps, 1007, '今日の歩数');
}

section('修行お休み（読めない日数を知らせる）');
{
  let s = mk('anne', 'otona', '2026-10-01', 'ios');
  s = run(s, '2026-10-01', 3000).state;
  let days = []; for (let d = '2026-10-04'; d <= '2026-10-10'; d = R.addDays(d, 1)) days.push(day(d, 2000));
  let r = R.ingest(s, days, { today: '2026-10-10' });
  eq(ofType(r.events, 'rest'), [{ type: 'rest', days: 2 }], 'iOS: 9日ぶり → 7日より前の2日（10/2・10/3）がお休み');
  eq(r.state.lastSyncDate, '2026-10-10', '同期日を今日に');
  r = R.ingest(s, days.slice(1), { today: '2026-10-08' });
  eq(ofType(r.events, 'rest').length, 0, 'iOS: 7日以内なら何もない');
  let sb = R.clone(s); sb.route = 'androidB';
  r = R.ingest(sb, days, { today: '2026-10-10' });
  eq(ofType(r.events, 'rest').length, 0, 'Android(b): 10日まで読める');
  let sc = R.clone(s); sc.route = 'androidC';
  r = R.ingest(sc, [day('2026-10-10', 5000)], { today: '2026-10-10' });
  eq(ofType(r.events, 'rest'), [{ type: 'rest', days: 8 }], 'Android(c): あいだの8日は今日に入る（お休みとして知らせる）');
  eq(types(r.events)[0], 'rest', 'お休みは最初に知らせる');
  r = R.ingest(s, [day('2026-10-02', 1000)].concat(days), { today: '2026-10-10' });
  eq(ofType(r.events, 'rest'), [{ type: 'rest', days: 1 }], '読めた日はお休みに数えない');
}

section('絆・目標');
{
  let s = mk('anne');
  let r = run(s, T0, 999); s = r.state;
  eq(ofType(r.events, 'bond').length, 0, '999では絆は増えない');
  r = run(s, T0, 1000); s = r.state;
  eq(ofType(r.events, 'bond'), [{ type: 'bond', id: 'anne', bond: 1, line: true }], '1,000で絆+1（一言が開く）');
  r = run(s, T0, 9000); s = r.state;
  eq([ofType(r.events, 'bond').length, s.chars.anne.bond], [0, 1], '絆はその日1回');
  eq(ofType(r.events, 'goal'), [{ type: 'goal', date: T0 }], '目標8,000に届いて goal');
  r = run(s, T0, 12000);
  eq(ofType(r.events, 'goal').length, 0, 'goal はその日1回');
  r = run(s, '2026-10-27', 1000);
  eq(ofType(r.events, 'bond')[0], { type: 'bond', id: 'anne', bond: 2, line: true }, '次の日にまた絆');
  let s3 = mk('anne'); s3.chars.anne.bond = 2;
  eq(ofType(run(s3, T0, 1000).events, 'bond')[0].line, false, '絆3は一言の節目でない');
  let s4 = mk('anne'); s4.chars.ichiya = { joined: T0, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null };
  s4 = R.setSlots(s4, ['anne', 'ichiya', null], [50, 50, 0]);
  eq(ofType(run(s4, T0, 2000).events, 'bond').find(e => e.id === 'ichiya').line, false, '最初の8体でない体は一言なし');
  ok(R.setGoal(mk(), 7500).goal === 7500 && R.setGoal(mk(), 7600).error === 'goal' && R.setGoal(mk(), 12500).error === 'goal', '目標は3,000〜12,000の500きざみ');
}

section('ふりかえり（一日・週）と診断');
{
  let s = mk('anne');
  s = R.noteOpen(s, T0); s = R.noteOpen(s, T0); s = R.noteWalkingBlock(s, T0);
  s = R.setFamilyDay(s, T0, true);
  for (let i = 0; i < 7; i++) s = run(s, R.addDays(T0, i), i % 2 ? 9000 : 4000, null, R.addDays(T0, 6)).state;
  const wk = R.weekReview(s, '2026-10-29');
  eq(wk.monday, T0, '週は月曜はじまり');
  eq(wk.days.map(d => d.date), Array.from({ length: 7 }, (_, i) => R.addDays(T0, i)), '7日');
  eq([wk.goalDays, wk.total], [3, 4 * 4000 + 3 * 9000], '目標に届いた日の数と合計');
  eq(wk.perChar, [{ id: 'anne', shugyo: 43000 }], '体ごとの修行値');
  ok(!JSON.stringify(wk).match(/streak|連続/), '連続日数は出さない');
  const dr = R.dayReview(s, T0);
  eq([dr.shugyo, dr.goalReached, dr.scrollsToday, dr.family], [4000, false, 4, true], '一日のふりかえり');
  const dg = R.diagnostics(s);
  eq(dg.columns, ['date', 'shugyo', 'rejected', 'capped', 'goal', 'home', 'family', 'opens', 'walkBlocks'], '診断の9項目');
  eq(dg.rows[0], [T0, 4000, 0, 0, 0, 0, 1, 2, 1], '診断の1行目（開いた2回・歩行中判定1回）');
  const sm = R.summary(s, R.addDays(T0, 6));
  eq([sm.steps, sm.shugyo, sm.toCap, sm.scrolls, sm.nextVisit.remain, sm.nextStation.remain], [4000, 4000, 12500, 43, 17000, 17000], 'summary の数');
  ok(sm.slots[0].id === 'anne' && sm.slots[0].affType === 'win' && sm.slots[0].affNeedsBuckets === true, 'summary の枠と相性');
}

section('validate / migrate');
{
  const s = mk('anne');
  ok(R.validate(s).ok, '正しい state');
  const b1 = R.clone(s); b1.slots = ['sakuya', null, null];
  ok(!R.validate(b1).ok, '主相棒のいない枠は不正');
  const b2 = R.clone(s); b2.visitTotal = -1; b2.mode = 'baby';
  const v2 = R.validate(b2);
  ok(!v2.ok && v2.errors.includes('visitTotal') && v2.errors.includes('mode'), '負の累計・知らないモード');
  const b3 = R.clone(s); b3.board = new Array(6).fill({ charIndex: 0, readAt: T0 });
  ok(!R.validate(b3).ok, '掲示板が6枚は不正');
  ok(!R.validate(null).ok && !R.validate({}).ok, '空は不正');
  // 古い版（v なし・足りない項目）
  const old = { app: 'shinobi-ashi', mainId: 'shiba', mode: 'kodomo', createdAt: '2026-10-01', chars: { shiba: { shugyo: 12000 } }, visitTotal: 12000, roadTotal: 12000, daily: { '2026-10-01': { shugyo: 12000 } } };
  const m = R.migrate(old);
  ok(m && R.validate(m).ok, '古い版を今の版にすると validate を通る');
  eq([m.v, m.chars.shiba.shugyo, m.chars.shiba.rank, m.slots[0], m.goal], [1, 12000, 0, 'shiba', 10000], '足りない項目を補い、ある値は残す');
  ok(m.daily['2026-10-01'].aff && m.daily['2026-10-01'].alloc, 'daily の足りない項目も補う');
  ok(R.migrate(JSON.stringify(s)) && R.validate(R.migrate(JSON.stringify(s))).ok, 'JSON の文字列も読める');
  eq(R.migrate({ app: 'other' }), null, 'ほかのアプリのデータは読まない');
  eq(R.migrate({ app: 'shinobi-ashi', v: 99 }), null, '新しすぎる版は読まない');
  eq(R.migrate('not json'), null, '壊れた文字列は null');
  const w = walker(mk('kohaku')).to(300000);
  ok(R.validate(w.s).ok && R.validate(R.migrate(JSON.parse(JSON.stringify(w.s)))).ok, '遊んだあとの state も validate・migrate を通る');
}

section('端末の時計が戻ったときに、先の日の実歩数を消さない');
{
  let s = mk('anne');
  s = run(s, '2026-10-26', 3000).state;
  s = run(s, '2026-10-27', 4000).state;
  const r = R.ingest(s, [day('2026-10-25', 100)], { today: '2026-10-25' });
  eq(sortKeys(r.state.recent), { '2026-10-25': 100, '2026-10-26': 3000, '2026-10-27': 4000 }, '時計が戻っても 10-26・10-27 の歩数は残る');
  eq([r.state.lastSyncDate, R.dayReview(r.state, '2026-10-27').steps], ['2026-10-27', 4000], 'lastSyncDate は戻さない・ふりかえりの歩数も残る');
  const r2 = R.ingest(r.state, [day('2026-11-03', 100)], { today: '2026-11-03' });
  ok(!('2026-10-27' in r2.state.recent) && ('2026-11-03' in r2.state.recent), '時計が進めば、いつもどおり7日を過ぎた日を消す');
}

section('おかしな引数でも例外を投げない（summary・weekReview・dayReview・newState）');
{
  const s = run(mk('anne'), T0, 3000).state;
  let threw = false, sm, wk, dr;
  try { sm = R.summary(s, 'xx'); wk = R.weekReview(s, 'xx'); dr = R.dayReview(s, 'xx'); } catch (e) { threw = true; }
  ok(!threw, 'summary/weekReview/dayReview に変な日付を渡しても投げない');
  eq([sm, wk.days, wk.goalDays, wk.total, dr.shugyo, dr.steps], [null, [], 0, 0, 0, null], '変な日付は null・空のまとめ');
  threw = false; try { R.newState({ mainId: 'ichiya', mode: 'otona', today: T0 }); } catch (e) { threw = true; }
  ok(threw, '主相棒は REPS の4体だけ（一夜は選べない）');
  for (const id of D.REPS.map(r => r.id)) ok(R.validate(mk(id)).ok, id + ' は主相棒にできる');
  eq(R.newState({ mainId: 'anne', mode: 'otona', today: T0, route: 'zzz' }).route, 'none', '知らない経路は none');
  for (const rt of ['ios', 'androidB', 'androidC', 'sim', 'none']) eq(mk('anne', 'otona', T0, rt).route, rt, '経路 ' + rt);
  const bad = R.clone(s); bad.route = 'zzz';
  ok(R.validate(bad).errors.includes('route'), 'validate は知らない経路を通さない');
  const bm = R.clone(s); bm.mainId = 'ichiya'; bm.chars.ichiya = bm.chars.anne; bm.slots = ['ichiya', null, null];
  ok(R.validate(bm).errors.includes('mainId'), 'validate は REPS 以外の主相棒を通さない');
}

section('validate を通る state は ingest で落ちない');
{
  const base = run(mk('anne'), T0, 3000).state;
  const cases = {
    'daily が文字列': (c) => { c.daily['2026-10-27'] = 'x'; },
    'daily が数': (c) => { c.daily['2026-10-27'] = 5; },
    'daily.aff が null': (c) => { c.daily[T0].aff = null; },
    'daily.alloc が null': (c) => { c.daily[T0].alloc = null; },
    'daily.gain が配列': (c) => { c.daily[T0].gain = []; },
    'daily.visits が文字列': (c) => { c.daily[T0].visits = 'x'; },
    'daily.alloc の値が文字列': (c) => { c.daily[T0].alloc.anne = '3000'; },
    'guests の charIndex が99': (c) => { c.guests = [{ charIndex: 99, dye: 'none', until: T0 }]; },
    'board の shugyo が文字': (c) => { c.board = [{ charIndex: 0, rank: 0, okugi: 0, shugyo: 'x', dye: 'none', bond: 0, station: 0, round: 1, date: T0, readAt: T0 }]; },
    'board の charIndex が39': (c) => { c.board = [{ charIndex: 39, rank: 0, okugi: 0, shugyo: 0, dye: 'none', bond: 0, station: 0, round: 1, date: T0, readAt: T0 }]; },
    'board の round が3': (c) => { c.board = [{ charIndex: 0, rank: 0, okugi: 0, shugyo: 0, dye: 'none', bond: 0, station: 0, round: 3, date: T0, readAt: T0 }]; },
    'diary の要素が null': (c) => { c.diary = [null]; },
    'settings.notify が null': (c) => { c.settings.notify = null; }
  };
  for (const [name, f] of Object.entries(cases)) {
    const c = R.clone(base); f(c);
    ok(!R.validate(c).ok, 'validate が見つける: ' + name);
  }
  const g = R.clone(base); g.guests = [{ charIndex: 99, dye: 'none', until: '2026-12-31' }, { charIndex: 3, dye: 'none', until: '2026-12-31' }];
  g.board = [{ charIndex: 99, readAt: T0 }, { charIndex: 3, rank: 0, okugi: 0, shugyo: 0, dye: 'none', bond: 0, station: 0, round: 1, date: T0, readAt: T0 }];
  eq([R.guestsOf(g, T0).map(x => x.id), R.boardOf(g, T0).map(x => x.id)], [['shiba'], ['shiba']], 'guestsOf・boardOf は範囲外の charIndex を捨てる');
}

section('壊れた保存データでも migrate は投げず、migrate → validate が ok');
{
  const base = () => { let s = mk('anne', 'otona', '2026-10-01', 'ios'); s = run(s, '2026-10-01', 5000).state; s.chars.sakuya = { joined: '2026-10-01', shugyo: 100, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null }; return s; };
  const broken = {
    'chars が null': { chars: null },
    'daily が null': { daily: null },
    'dyes が文字列': { dyes: 'abc' },
    'dyes が null': { dyes: null },
    'chars.sakuya が null': (s) => { s.chars.sakuya = null; },
    'chars.sakuya が文字列': (s) => { s.chars.sakuya = 'x'; },
    'chars.anne の数がおかしい': (s) => { s.chars.anne = { shugyo: -3, rank: 'a', okugi: 9, bond: null, dye: 'zzz' }; },
    'daily の1日が "x"': (s) => { s.daily['2026-10-26'] = 'x'; },
    'daily の1日が 5': (s) => { s.daily['2026-10-26'] = 5; },
    'daily の中身の型がおかしい': (s) => { s.daily['2026-10-01'].aff = null; s.daily['2026-10-01'].alloc = 'x'; s.daily['2026-10-01'].visits = null; s.daily['2026-10-01'].shugyo = 'abc'; s.daily['2026-10-01'].allocRun = 5; },
    'recent が null': { recent: null },
    'board が {}': { board: {} },
    'guests が null': { guests: null },
    'jin が null': { jin: null },
    'settings が null': { settings: null },
    'settings.notify が null': (s) => { s.settings.notify = null; },
    'foundIds が null': { foundIds: null },
    'diary が null': { diary: null },
    'visitTotal が -5': { visitTotal: -5 },
    "visitTotal が 'abc'": { visitTotal: 'abc' },
    'goal が 50000': { goal: 50000 },
    'round が 3': { round: 3 },
    'scrollsOpened が scrolls より多い': { scrolls: 2, scrollsOpened: 9 },
    'stationsReached が 500': { stationsReached: 500 },
    'createdAt の形がおかしい': { createdAt: '2026/10/01' },
    'slots が文字列': { slots: 'x', alloc: null },
    'board の要素が壊れている': { board: [null, 5, { charIndex: 99 }, { charIndex: 2, readAt: 'x' }] },
    'guests の要素が壊れている': { guests: [null, { charIndex: 99, until: '2026-10-01', dye: 'none' }] },
    'mainId が REPS でない': { mainId: 'ichiya' },
    'route が知らない値': { route: 'zzz' },
    'lastSync が文字列・lastSyncDate がおかしい': { lastSync: 'x', lastSyncDate: 'y' },
    'hideBase が負': { hideBase: -1 }
  };
  let n = 0;
  for (const [name, b] of Object.entries(broken)) {
    const s = base();
    if (typeof b === 'function') b(s); else Object.assign(s, b);
    let m = null, threw = false;
    try { m = R.migrate(s); } catch (e) { threw = true; }
    const v = m ? R.validate(m) : { ok: false, errors: ['null'] };
    ok(!threw && m && v.ok, '壊れたデータ「' + name + '」: migrate が投げず validate が ok' + (v.ok ? '' : ' ' + JSON.stringify(v.errors)));
    let t2 = false;
    try { if (m) { const r = R.ingest(m, [day('2026-10-02', 6000, hours({ 9: 3000, 15: 3000 }))], { today: '2026-10-02' }); R.summary(r.state, '2026-10-02'); R.weekReview(r.state, '2026-10-02'); } } catch (e) { t2 = true; console.log('    ' + e.message); }
    ok(!t2, '壊れたデータ「' + name + '」: 直したあと ingest・summary が動く');
    n++;
  }
  ok(n >= 20, '壊れたデータは20通り以上（' + n + '）');
  const m1 = R.migrate(Object.assign(base(), { goal: 50000 }));
  eq(m1.goal, 12000, 'goal は範囲に丸める');
  const m2 = R.migrate(Object.assign(base(), { goal: 7777 }));
  eq(m2.goal, 8000, 'goal は500きざみに丸める');
  const m3 = R.migrate(Object.assign(base(), { scrolls: 2, scrollsOpened: 9, stationsReached: 500, round: 3 }));
  eq([m3.scrollsOpened, m3.stationsReached, m3.round], [2, 100, 2], 'scrollsOpened・stationsReached・round を直す');
  const m4 = R.migrate(Object.assign(base(), { createdAt: 'bad' }));
  eq(m4.createdAt, '2026-10-01', 'createdAt がおかしければ、いちばん古い記録の日');
  const m5 = R.migrate(Object.assign(base(), { createdAt: 'bad', daily: {} }));
  eq(m5.createdAt, '2026-01-01', '記録もなければ 2026-01-01');
  const m6 = R.migrate(Object.assign(base(), { dyes: ['shu', 'shu', 'zzz'] }));
  eq(m6.dyes, ['none', 'ai', 'shu'], 'dyes: はじめの色を補い、重複と知らない色を捨てる');
  const m7 = base(); m7.chars.sakuya = null;
  ok(!('sakuya' in R.migrate(m7).chars), 'オブジェクトでない chars[id] は消す');
  eq([R.migrate(5), R.migrate([]), R.migrate(null), R.migrate('[]')], [null, null, null, null], 'オブジェクトでないものは null');
  const loop = base(); loop.self = loop;   // JSON にできない（循環）
  let lt = false, lm; try { lm = R.migrate(loop); } catch (e) { lt = true; }
  ok(!lt && lm === null, '写せないデータは投げずに null');
}

section('長い期間の通し（毎日10,000歩で200日）');
{
  let s = mk('anne', 'otona', '2026-01-01', 'sim');
  const all = [];
  let mid = null;
  for (let i = 0; i < 200; i++) {
    const d = R.addDays('2026-01-01', i);
    const r = R.ingest(s, [day(d, 10000)], { today: d });
    s = r.state; all.push(...r.events);
    if (i === 99) mid = R.clone(s);
  }
  const visitsAt = (t) => D.VISIT_AT.filter(v => v <= t).length;
  eq([mid.visitTotal, mid.visits, mid.stationsReached, mid.round, mid.chars.anne.rank, mid.chars.anne.okugi], [1000000, visitsAt(1000000), 50, 1, 5, 0], '100日目: 来訪累計100万・来訪34回・宿場50・免許皆伝');
  eq(visitsAt(1000000), 34, '100万歩までの来訪は 12+13+9=34回');
  eq([s.visitTotal, s.roadTotal, s.hideTotal], [2000000, 2000000, 0], '200日目: 累計200万');
  eq([s.visits, s.jin.shadow, s.jin.revealed], [38, true, true], '38回の来訪と刃の名乗り');
  eq(Object.keys(s.chars).length, 39, '39体がそろう');
  eq([s.chars.anne.shugyo, s.chars.anne.rank, s.chars.anne.okugi, s.chars.anne.bond], [2000000, 5, 2, 200], '主相棒: 200万・免許皆伝・奥義2・絆200');
  eq([s.scrolls, ofType(all, 'scroll').reduce((a, e) => a + e.n, 0)], [2000, 2000], '巻物2,000本');
  eq([s.stationsReached, s.round, ofType(all, 'station').length], [100, 2, 100], '宿場100回（二巡目のおわり）');
  eq(ofType(all, 'rank').map(e => e.rank), [1, 2, 3, 4, 5], '位のイベントは1〜5の5回');
  const rankDays = ofType(all, 'rank').map(e => e.rank);
  ok(rankDays.length === 5, '位は1段ずつ');
  eq(ofType(all, 'okugi').map(e => e.level), [1, 2], '奥義は2回');
  eq(ofType(all, 'goal').length, 200, '目標に届いた日は200日');
  eq(ofType(all, 'visit').length, 37, 'visit は37回');
  eq([ofType(all, 'jinShadow').length, ofType(all, 'jinReveal').length, ofType(all, 'hideOpen').length], [1, 1, 1], '刃の影・名乗り・かくれる探しの始まりは1回ずつ');
  eq(s.dyes.slice().sort(), ['ai', 'hai', 'kin', 'matsuba', 'none', 'shio', 'shu'], '染め色はすべて使えるようになる');
  eq(Object.keys(s.recent).length, 7, '実歩数は7日分だけ');
  ok(R.validate(s).ok, '通しのあとも validate を通る');
  // 区間ありで同じ通し（相性が合う日は主相棒が多く育つ。来訪・宿場の数は同じ）
  let t = mk('anne', 'otona', '2026-01-01', 'sim');
  for (let i = 0; i < 30; i++) { const d = R.addDays('2026-01-01', i); t = R.ingest(t, [day(d, 10000, hours({ 9: 4000, 14: 3000, 18: 3000 }))], { today: d }).state; }
  eq([t.visitTotal, t.chars.anne.shugyo], [300000, 360000], '区間あり30日: 来訪累計30万、餡音は毎日相性が合って36万');
}

section('ブラウザと同じ読み込み（require も module もない所で window.SA.Rules ができる）');
{
  const vm = await import('vm');
  const win = {};
  const ctx = vm.createContext({ window: win, Math, Date, JSON, Object, Array, Number, String, Error, isFinite, console });
  for (const f of ['chars.js', 'data.js', 'rules.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ok(win.SA && win.SA.Rules && typeof win.SA.Rules.ingest === 'function', 'window.SA.Rules がある');
  const bs = win.SA.Rules.newState({ mainId: 'shiba', mode: 'kodomo', today: T0, route: 'sim' });
  const br = win.SA.Rules.ingest(bs, [{ date: T0, steps: 20000, buckets: null, src: 'sim' }], { today: T0 });
  eq([br.state.visitTotal, br.events.filter(e => e.type === 'scroll')[0].n], [16500, 16], 'ブラウザの形でも同じ計算');
}

console.log(`\n合格 ${pass} / 不合格 ${fail}`);
process.exit(fail ? 1 : 0);
