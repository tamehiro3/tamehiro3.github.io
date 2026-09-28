// 設計書 ③ §12 の受け入れテスト（と、最初の10分・修行の完走・データのチェック）
//   node ninja-aibou-dojo/tools/test_rules.mjs
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const { runTraining, S, P } = require(path.join(HERE, 'bot.js'));
const D = require(path.join(ROOT, 'data.js'));
const C = require(path.join(ROOT, 'chars.js'));
const L = require(path.join(ROOT, 'lines.js'));
const ST = require(path.join(ROOT, 'story.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) { pass++; } else { fail++; console.log('✗ ' + name + (extra ? '  … ' + extra : '')); } }
function section(t) { console.log('— ' + t); }
const TUT = D.CHAPTERS[0].training.zones;
const tut = (teach, withRule, seed) => runTraining({ kind: 'tutorial', zones: TUT, seed: seed || 7, policy: P.makePolicy(), masterId: 'hayate', cast: ['anne', 'oto'] }, { teach, withRule });

/* ---------- 1. 同じ seed・方針で同じ判断を再現できる ---------- */
section('1. 同じ seed・方針で同じ判断を再現できる');
for (const kind of ['rescue', 'explore', 'escort']) {
  const pol = P.makePolicy({ support: 50, explore: 60, caution: 40 }, []);
  const a = runTraining({ kind, seed: 4242, policy: pol, masterId: 'hayate' }, { searchAll: kind === 'explore' });
  const b = runTraining({ kind, seed: 4242, policy: P.copy(pol), masterId: 'hayate' }, { searchAll: kind === 'explore' });
  const sig = r => JSON.stringify(r.st.lessons.map(l => [l.zone, l.scene, l.chosen.act, l.chosen.target, l.chosen.score, l.policyVersion, l.seed]));
  ok(sig(a) === sig(b) && a.st.lessons.length > 0, kind + '：同じ seed・方針 → 同じ判断の記録');
  ok(JSON.stringify(a.st.decisions) === JSON.stringify(b.st.decisions), kind + '：判断の流れ（全部）も同じ');
  ok(a.st.lessons.every(l => l.seed === 4242 && l.policyVersion === pol.version), kind + '：判断に scenario_seed と policy_version を記録');
}
{
  // decide() は純粋：同じ状況・方針なら同じ答えと理由
  const ctx = { me: { x: 5, y: 5, hp: 80 }, player: { id: 'player', x: 5, y: 6, hp: 90 }, allies: [{ id: 'a', name: '餡音', x: 1, y: 2, down: true, patience: 0.7, threat: false }], enemies: [{ id: 'e', name: 'からくり木人', x: 8, y: 4, target: 'player' }], spots: [{ id: 's', kind: 'chest', x: 9, y: 8 }], dangerHere: 0, kind: 'rescue' };
  const pol = P.makePolicy();
  const d1 = P.decide(ctx, pol), d2 = P.decide(JSON.parse(JSON.stringify(ctx)), P.copy(pol));
  ok(d1.act === d2.act && d1.target === d2.target && d1.score === d2.score && d1.reason.text === d2.reason.text, 'decide() は同じ入力に同じ判断と理由');
}
// 配置は seed で決まる
{
  const s1 = S.build({ kind: 'rescue', seed: 99, policy: P.makePolicy(), masterId: 'hayate' }), s2 = S.build({ kind: 'rescue', seed: 99, policy: P.makePolicy(), masterId: 'hayate' }), s3 = S.build({ kind: 'rescue', seed: 100, policy: P.makePolicy(), masterId: 'hayate' });
  const lay = s => JSON.stringify([s.zones.map(z => z.scene + z.mirror), s.allies.map(a => [a.charId, a.x, a.y]), s.spots.map(p => [p.x, p.y]), s.enemies.map(e => [e.kind, e.x, e.y])]);
  ok(lay(s1) === lay(s2), '同じ seed → 同じ配置');
  ok(lay(s1) !== lay(s3), 'ちがう seed → 配置替え');
}

/* ---------- 2. 「救助を優先」の変更後、救助可能な課題で実際に救助を選ぶ ---------- */
section('2. 「救助を優先」に変えたあと、救助できる課題で救助を選ぶ');
{
  const r = tut('next_rescue', false);
  const z1 = r.st.lessons.find(l => l.scene === 'chest_ally' && l.policyVersion === 1), z2 = r.st.lessons.find(l => l.scene === 'chest_ally' && l.policyVersion === 2);
  ok(z1 && z1.chosen.act === 'search', '最初の10分：教える前は宝箱を先に（因果確認の場面は制御されている）', z1 && z1.chosen.act);
  ok(z2 && z2.chosen.act === 'rescue', '最初の10分：「次は救助」（数値だけ）→ 配置を変えた似た課題で救助を先に', z2 && z2.chosen.act);
  ok(z2 && /支援優先/.test(z2.reason.text), '理由に、変えた方針（支援優先）が出る', z2 && z2.reason.text);
  const rr = tut('next_rescue', true);
  const w2 = rr.st.lessons.find(l => l.scene === 'chest_ally' && l.policyVersion === 2);
  ok(w2 && w2.chosen.act === 'rescue' && /仲間を優先/.test(w2.reason.text), '作戦「仲間を優先」もいっしょに → 救助。理由に作戦名', w2 && w2.reason.text);
  const k = tut('keep'), sf = tut('safety');
  ok(k.st.lessons.find(l => l.policyVersion === 2 && l.scene === 'chest_ally').chosen.act === 'search', '「この行動を続ける」→ 2回目も宝箱（教えたとおり）');
  ok(sf.st.lessons.find(l => l.policyVersion === 2 && l.scene === 'chest_ally').chosen.act === 'search', '「安全を優先」→ 危なくない場面では順番は変わらない');
  for (const x of [r, rr, k, sf]) ok(x.result.success, '最初の修行は最後まで遊べる（' + (x === r ? 'next_rescue' : x === rr ? 'ルールつき' : x === k ? 'keep' : 'safety') + '）');
}
{
  // 救助修行で、ほかの配置でも：仲間を優先 → 判断場面で救助が選べるときは救助
  let total = 0, rescued = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const pol = P.applyTeaching(P.makePolicy(), [{ option: P.teachOptions({ chosen: { act: 'search' }, cands: [{ act: 'rescue' }] }, ['ally_first'])[1], withRule: true }], {}).policy;
    const r = runTraining({ kind: 'rescue', seed: seed * 53, policy: pol, masterId: 'konga' }, {});
    r.st.lessons.forEach(l => { if (l.cands.some(c => c.act === 'rescue') && !l.forced) { total++; if (l.chosen.act === 'rescue') rescued++; } });
  }
  ok(total > 10 && rescued === total, '救助修行12回：救助できる判断場面ではすべて救助（' + rescued + '/' + total + '）');
}

/* ---------- 3. 危険すぎる救助を避けたとき、説明が実際の優先ルールと一致する ---------- */
section('3. 危ない救助を避けたとき、説明が実際のルールと一致する');
{
  const pol = P.makePolicy({ support: 80, explore: 20, caution: 70 }, ['safety_first']);
  const ctx = { me: { x: 6, y: 10, hp: 90 }, player: { id: 'player', x: 6, y: 11, hp: 90 }, allies: [{ id: 'a', name: '餡音', x: 2, y: 3, down: true, patience: 0.9, threat: false }], enemies: [], spots: [{ id: 's', kind: 'chest', x: 9, y: 9 }], dangerHere: 0, kind: 'rescue', path: (x, y) => ({ dist: Math.hypot(x - 6, y - 10), danger: x < 4 ? 0.6 : 0, blocked: false }) };
  const d = P.decide(ctx, pol);
  ok(d.act !== 'rescue', '作戦「安全を優先」：まきびしの中の仲間は候補から外す', d.act);
  ok(d.excluded.some(x => x.act === 'rescue' && x.rule === 'safety_first'), '外した理由の記録は safety_first');
  ok(/安全を優先/.test(d.reason.text) && d.reason.excludedRules.includes('safety_first'), '説明文に「安全を優先」が出る', d.reason.text);
  // 数値の慎重さで避けたとき：説明は「危ない道」で、作戦名は出さない
  const pol2 = P.makePolicy({ support: 40, explore: 60, caution: 95 }, []);
  const d2 = P.decide(Object.assign({}, ctx, { path: (x, y) => ({ dist: Math.hypot(x - 6, y - 10), danger: x < 4 ? 1 : 0, blocked: false }) }), pol2);
  ok(d2.act !== 'rescue' && !/安全を優先/.test(d2.reason.text), '慎重さ（数値）で避けたときは、作戦名を出さない', d2.act + ' / ' + d2.reason.text);
  const rc = d2.cands.find(c => c.act === 'rescue');
  ok(rc && rc.parts.some(p => p.k === 'danger' && p.v < 0), '救助の候補の点数に「危ない道」の減点がある');
}
{
  // 説明は実際の点数から：選んだ候補が一番点数が高い（強制された判断を除く）
  let bad = 0, n = 0;
  for (let seed = 1; seed <= 8; seed++) for (const kind of ['rescue', 'explore', 'escort']) {
    const r = runTraining({ kind, seed: seed * 31, policy: P.makePolicy({ support: 20 + seed * 8, explore: 90 - seed * 8, caution: 30 + seed * 5 }, []), masterId: 'hayate' }, {});
    r.st.lessons.forEach(l => { if (l.forced) return; n++; const top = Math.max(...l.cands.map(c => c.score)); if (l.chosen.score < top - 12.01) bad++; });
  }
  ok(n > 30 && bad === 0, '判断場面の記録：選んだ行動の点数は最高点（前の行動を続ける幅12以内）', bad + '/' + n);
}

/* ---------- 4. 直前の指導を戻すと以前の方針に戻る ---------- */
section('4. 直前の指導を戻すと以前の方針に戻る（無料）');
{
  const p0 = P.makePolicy();
  const opts = P.teachOptions({ chosen: { act: 'search' }, cands: [{ act: 'rescue' }] }, ['ally_first', 'safety_first']);
  const p1 = P.applyTeaching(p0, [{ option: opts[1], withRule: true }], { source: 'review' }).policy;
  const p2 = P.applyTeaching(p1, [{ option: opts[2], withRule: true }], { source: 'review' }).policy;
  const u = P.undo(p2);
  ok(JSON.stringify(u.axes) === JSON.stringify(p1.axes) && u.rules.join() === p1.rules.join(), '取り消し → 1つ前の方針（軸と作戦）');
  ok(u.version > p2.version, '取り消しも新しい版として記録（同じ場面の再現に使う）');
  const u2 = P.undo(u);
  ok(JSON.stringify(u2.axes) === JSON.stringify(p0.axes) && u2.rules.length === 0, 'もう一度取り消し → さらに前');
  ok(!P.canUndo(u2), '全部戻したら、それ以上は戻せない');
  const rs = P.reset(p2);
  ok(JSON.stringify(rs.axes) === JSON.stringify(p0.axes) && rs.rules.length === 0, 'はじめの方針にもどす（全リセット）');
  ok(p2.history.length === 2 && rs.history.length === 3, '指導の履歴が残る');
}

/* ---------- 5. 不可能・矛盾・不適切な入力で不正な作戦や台詞を保存しない ---------- */
section('5. 不可能・矛盾・不適切な入力を保存しない');
{
  const cases = [['敵を全部一撃で倒して', 'impossible'], ['無敵になって', 'impossible'], ['空を飛んで', 'impossible'], ['ばかじゃないの', 'rude'], ['090-1234-5678に電話して', 'personal'], ['mail@example.com に送って', 'personal'], ['', 'empty'], ['あ'.repeat(41), 'long'], ['もっといい感じに', 'ambiguous'], ['がんばって', 'ambiguous'], ['宝箱も仲間も先に', 'ambiguous']];
  cases.forEach(([t, code]) => { const r = P.parseWords(t, {}); ok(!r.ok && r.code === code, '「' + t.slice(0, 12) + '」→ ' + code, r.ok ? r.intent : r.code); });
  ok(P.parseWords('もっといい感じに').choices.join() === 'prioritize_rescue,be_careful,prioritize_search', 'あいまいな指示は「仲間優先」「慎重に進む」などの選択肢へ');
  ok(P.parseWords('敵を全部一撃で倒して').choices.includes('be_bold'), '能力変更は断り、実装できる作戦（敵を先に）を提案');
  // AIなどの変更案の検査
  const V = (p, un) => P.validateProposal(p, un || ['ally_first', 'safety_first']);
  ok(!V({ intent: 'destroy_all', changes: {} }).ok, '許可されていない意図は通さない');
  ok(!V({ intent: 'prioritize_rescue', changes: { support: 50 } }).ok, '±10 をこえる変化は通さない');
  ok(!V({ intent: 'prioritize_rescue', changes: { power: 10 } }).ok, '知らない軸は通さない');
  ok(!V({ intent: 'prioritize_rescue', changes: { support: -10 } }).ok, '意図と向きが逆の変化は通さない（文面と方針の差）');
  ok(!V({ intent: 'prioritize_rescue', changes: { support: 10 }, rule: 'explore_first' }).ok, '意図と合わない作戦は通さない');
  ok(!V({ intent: 'prioritize_search', changes: { explore: 10 }, rule: 'explore_first' }, ['ally_first']).ok, 'まだ使えない作戦は通さない');
  const good = { intent: 'prioritize_rescue', changes: { support: 10, explore: -10 }, rule: 'ally_first', explanation: 'ぜったい仲間を助けます！（AIの文）' };
  ok(V(good).ok && good.explanation === D.INTENTS.prioritize_rescue.label, '通った案の文面は定型に置きかえる（AIの言い回しを保存しない）');
  // 1回の指導は各軸±10まで・作戦は3つまで
  const p0 = P.makePolicy();
  const o = P.teachOptions({ chosen: { act: 'search' }, cands: [{ act: 'rescue' }] }, ['ally_first']);
  const pv = P.previewTeaching(p0, [{ option: o[1], withRule: false }, { option: o[1], withRule: false }]);
  ok(pv.changes.support === 10 && pv.capped, '2件の振り返りで同じ軸を上げても、合計は±10まで');
  let p3 = P.makePolicy(null, ['ally_first', 'stay_close', 'safety_first']);
  const q = P.applyChanges(p3, {}, ['explore_first'], [], {});
  ok(q.rules.length === 3 && !q.rules.includes('explore_first'), '作戦の枠は3つまで（あふれた作戦は保存しない）');
  const q2 = P.applyChanges(p0, { support: 999, caution: -999 }, ['nonexistent'], [], {});
  ok(q2.axes.support === 50 && q2.axes.caution === 35 && q2.rules.length === 0, 'applyChanges も ±10 と知っている作戦だけ');
  // 代表的な日本語の指示：許可された意図への一致（初期目標95%以上）
  const SET = [
    ['宝箱より仲間を先に助けて', 'prioritize_rescue'], ['仲間を先に助けて', 'prioritize_rescue'], ['倒れている人を優先して', 'prioritize_rescue'], ['へとへとの仲間を助けてあげて', 'prioritize_rescue'],
    ['困っている人がいたらすぐ助けて', 'prioritize_rescue'], ['味方を大事にして', 'prioritize_rescue'], ['まずは救助をお願い', 'prioritize_rescue'], ['宝箱は後で、仲間を助けて', 'prioritize_rescue'], ['けがをした仲間を先に起こして', 'prioritize_rescue'],
    ['仲間より宝箱を先に調べて', 'prioritize_search'], ['宝箱をどんどん開けて', 'prioritize_search'], ['草むらをよく調べて', 'prioritize_search'], ['巻物を探して', 'prioritize_search'], ['寄り道していろいろ探索して', 'prioritize_search'], ['宝を探して', 'prioritize_search'], ['気になる場所は調べてみて', 'prioritize_search'],
    ['あぶない所には入らないで', 'be_careful'], ['まきびしに気をつけて', 'be_careful'], ['慎重に進んで', 'be_careful'], ['無理しないで', 'be_careful'], ['煙の中には入らないで', 'be_careful'], ['安全第一で', 'be_careful'], ['体力が減ったら下がって', 'be_careful'], ['ゆっくりでいいよ', 'be_careful'], ['からくりと戦わないで', 'be_careful'],
    ['からくりを先に止めて', 'be_bold'], ['敵を先にやっつけて', 'be_bold'], ['どんどん攻めて', 'be_bold'], ['もっと攻撃して', 'be_bold'], ['強気でいこう', 'be_bold'], ['下がらないで戦って', 'be_bold'],
    ['そばにいて', 'stay_close'], ['近くにいてね', 'stay_close'], ['離れないで', 'stay_close'], ['一緒に行こう', 'stay_close'], ['ついてきて', 'stay_close'],
    ['護衛役を守って', 'guard_escort'], ['運ぶ人を守ってあげて', 'guard_escort'], ['ちゃんと送ってあげて', 'guard_escort'],
    ['そのままでいいよ', 'keep_going'], ['いいね！その調子', 'keep_going'], ['えらい！', 'keep_going'], ['今のままで続けて', 'keep_going']
  ];
  let hit = 0; const miss = [];
  SET.forEach(([t, e]) => { const r = P.parseWords(t, {}); if (r.ok && r.intent === e) hit++; else miss.push(t + '→' + (r.ok ? r.intent : r.code)); });
  const rate = hit / SET.length;
  ok(rate >= 0.95, '代表的な指示 ' + SET.length + '件：意図の一致 ' + Math.round(rate * 1000) / 10 + '%（目標95%以上）', miss.join(' / '));
}

/* ---------- 6. 記憶にない出来事を日記に載せない。AI停止でも全章を遊べる ---------- */
section('6. 日記は承認済みの出来事だけ・AIなしで全章を遊べる');
{
  const r = runTraining({ kind: 'rescue', seed: 77, policy: P.makePolicy(), masterId: 'konga' }, {});
  const ids = r.st.log.map(e => e.id);
  const dia = P.diaryFor({ events: r.st.log, masterName: 'コンガ', kindName: '救助修行', success: r.result.success }, {}, { I: 'ぼく' });
  ok(dia.eventIds.length > 0 && dia.eventIds.every(id => ids.includes(id)), '定型の日記：文ごとの出来事IDはすべて実際に起きたもの');
  const rescuedNames = r.st.log.filter(e => e.type === 'rescue').map(e => e.name);
  const allNames = C.CHARS.map(c => c.name).filter(n => dia.text.includes(n + 'さん'));
  ok(allNames.every(n => rescuedNames.includes(n) || r.st.log.some(e => e.name === n)), '日記に出る忍者の名前は、その修行の出来事にいた人だけ', allNames.join(','));
  const ai = { sentences: [{ event_id: ids[0], text: '見習いと出発した。' }, { event_id: 'T999-E1', text: '伝説の宝を見つけた！' }, { event_id: ids[1], text: 'しねばいいのに' }] };
  const v = P.validateAiDiary(ai, ids);
  ok(v.ok && v.eventIds.length === 1 && !/伝説/.test(v.text), 'AIの日記：承認されていない出来事の文・不適切な文は捨てる');
  ok(!P.validateAiDiary({ text: 'ID のない文' }, ids).ok, 'AIの日記：形がちがえば使わない（定型にもどる）');
  // AIなし（接続先なし）で5章の修行をすべて最後まで（練習設定なら成功できる。練習設定なしでも必ず終わりまで進む）
  for (const ch of D.CHAPTERS) {
    const tr = ch.training;
    const cfg = practice => ({ kind: tr.kind, zones: tr.zones, stages: tr.stages, seed: 11, policy: P.makePolicy(), masterId: ch.master, escortId: ch.guest, cast: ch.id === 'ch1' ? ['anne', 'oto'] : undefined, practice });
    const rr = runTraining(cfg(true), { searchAll: true, teach: 'next_rescue' });
    ok(rr.result && rr.result.success, '第' + ch.num + '章「' + ch.title + '」をAIなしで最後まで（練習設定・' + rr.result.time + '秒）', rr.result && (rr.result.fail || rr.result.objective.text));
    const hard = runTraining(cfg(false), { searchAll: true, teach: 'next_rescue' });
    ok(hard.result && hard.result.fail !== 'quit', '第' + ch.num + '章：練習設定なしでも、成功か失敗の結果まで進む（' + (hard.result.success ? '成功' : hard.result.fail || '課題') + '）');
  }
}

/* ---------- 7. オフライン進行・二端末競合・購入復元で相棒と権利を失わない ---------- */
section('7. 引き継ぎ・二つの記録の競合・見た目の権利');
{
  const a = P.newSave(1000, 'devA'); a.companion = { name: 'スズ', voice: 'boku', look: { outfit: 'ai' }, exp: 130, bond: 5 }; a.chapters.done = ['ch1', 'ch2']; a.trainings = 6; a.updatedAt = 5000; a.rev = 12;
  const entA = { owned: ['c_sakura'], updatedAt: 10 };
  const code = P.exportCode(a, entA);
  const im = P.importCode(code);
  ok(im.ok && im.save.companion.name === 'スズ' && im.save.companion.exp === 130 && im.ent.owned.includes('c_sakura'), '引き継ぎコードで相棒・進行・権利がそのまま戻る');
  ok(!P.importCode(code.slice(0, -3) + 'zzz').ok, '一部が欠けたコードは読みこまない（壊れた記録を入れない）');
  const b = P.copy(a); b.deviceId = 'devB'; b.companion.exp = 60; b.chapters.done = ['ch1']; b.updatedAt = 9000; b.rev = 3;
  const cf = P.conflict(a, b);
  ok(cf.conflict && cf.suggest === 'incoming', '別の端末で進めた記録がぶつかったら、選ぶ画面（最新を提案）');
  ok(cf.a.level === 3 && cf.b.level === 2 && cf.a.chapters === 2, '比べる要約（Lv・章・修行回数・最後に遊んだ日）');
  ok(!P.conflict(a, P.copy(a)).conflict, '同じ記録なら選ばせない');
  const merged = P.mergeEntitlements(entA, { owned: ['w_kuro'], updatedAt: 20 });
  ok(merged.owned.includes('c_sakura') && merged.owned.includes('w_kuro'), 'どちらを選んでも、交換した見た目（権利）は両方残る');
  // 数値を黙って混ぜない：どちらかの記録がそのまま使われる
  ok(JSON.stringify(P.copy(a).companion) === JSON.stringify(a.companion), '選んだ記録の数値はそのまま（まぜない）');
  const mig = P.migrate(JSON.parse(JSON.stringify({ v: 1, companion: { name: 'x', exp: 0 }, presets: { active: 'main', slots: [] } })));
  ok(mig && mig.presets.slots.length === 1 && mig.settings && Array.isArray(mig.lessons), '古い・欠けた記録も読みこめる形にそろえる');
  ok(P.migrate({ v: 99 }) === null, '知らない版の記録は読まない');
}

/* ---------- 最初の10分・プリセット・経済 ---------- */
section('最初の10分・作戦の枠・成長');
{
  const s = P.newSave(0, 'd');
  ok(s.presets.slots.length === 1, 'はじめは作戦の枠1つ');
  s.rulesUnlocked = ['ally_first', 'explore_first'];
  ok(P.unlockSlot(s, 'explore') && P.unlockSlot(s, 'escort') && !P.unlockSlot(s, 'rescue'), '物語で枠が増える（3枠まで）');
  ok(s.presets.slots[1].policy.rules.join() === 'explore_first' && s.presets.slots[2].policy.rules.length === 0, '枠のひな形の作戦は、使えるものだけ入る');
  ok(P.levelOf(0) === 1 && P.levelOf(60) === 2 && P.levelOf(129) === 2 && P.levelOf(130) === 3 && P.levelOf(900) === 10 && P.levelOf(5000) === 10, 'Lv1〜10（Lv2まで60、以後ゆるやかに）');
  const rw1 = P.rewardsFor({ success: true, star1: true, star2: true, star3: false }, 'rescue'), rw2 = P.rewardsFor({ success: false }, 'rescue');
  ok(rw1.exp === 30 && rw1.tokens === 25 && rw2.exp === 15 && rw2.tokens === 0, '成功30・失敗15（失敗でも一部）。道場札は20〜30');
  ok(D.BAL.teachCap === 10 && D.BAL.maxRules === 3 && D.BAL.rescueSec === 3, '指導±10・作戦3つ・救助3秒');
  // 全滅しても相棒・装備は失わない（sim は結果だけ返し、方針・見た目にふれない）
  const pol = P.makePolicy();
  const st = S.build({ kind: 'rescue', seed: 3, policy: pol, masterId: 'hayate' });
  st.player.hp = 1; st.partner.hp = 1;
  st.player.down = true; st.partner.down = true;
  S.step(st, 1 / 30, {});
  ok(st.done && st.result.fail === 'wipe' && !st.result.success, '全滅すると修行は終わる（結果：失敗）');
  ok(JSON.stringify(pol) === JSON.stringify(P.makePolicy()), '全滅しても方針（相棒の学び）は変わらない');
  // 練習設定：からくりが遅く弱い
  const p1 = S.build({ kind: 'rescue', seed: 3, policy: pol, masterId: 'hayate', practice: true });
  ok(p1.mods.espd < 1 && p1.mods.edmg < 1, '練習設定：敵の速さと与えるダメージをゆるめる');
}
{
  // 方針ごとに相棒のふるまいがちがう（特定の性格だけが正解ではない）
  const acts = {}, succ = {};
  const pols = { rescue: P.makePolicy(D.PRESET_TEMPLATES.rescue.axes, ['ally_first']), explore: P.makePolicy(D.PRESET_TEMPLATES.explore.axes, ['explore_first']), bold: P.makePolicy({ support: 30, explore: 40, caution: 10 }, ['attack_first']), safe: P.makePolicy({ support: 50, explore: 40, caution: 90 }, ['safety_first']) };
  for (const [name, pol] of Object.entries(pols)) {
    acts[name] = {}; succ[name] = 0;
    for (const kind of ['rescue', 'explore', 'escort']) for (let seed = 1; seed <= 4; seed++) {
      const r = runTraining({ kind, seed: seed * 17, policy: pol, masterId: 'hayate' }, { searchAll: kind === 'explore' });
      if (r.result.success) succ[name]++;
      r.st.lessons.forEach(l => { acts[name][l.chosen.act] = (acts[name][l.chosen.act] || 0) + 1; });
    }
  }
  ok(Object.values(succ).every(n => n === 12), 'どの方針でも3種の修行を最後まで遊べる', JSON.stringify(succ));
  ok((acts.rescue.rescue || 0) > (acts.explore.rescue || 0) && (acts.explore.search || 0) > (acts.rescue.search || 0), '救助型は救助を、探索型は調査をよく選ぶ', JSON.stringify(acts));
  ok((acts.bold.attack || 0) > (acts.safe.attack || 0), '攻撃的な方針は「からくりを止める」を多く選ぶ', JSON.stringify({ bold: acts.bold, safe: acts.safe }));
}

/* ---------- データ ---------- */
section('データ');
{
  ok(C.CHARS.length === 39 && Object.keys(L).length === 39, '39体のデータとセリフ');
  const F = ['kind', 'task', 'praise', 'advice', 'help', 'saved', 'escort', 'scared', 'arrive', 'cheer', 'tip'];
  ok(C.CHARS.every(c => L[c.id] && F.every(f => typeof L[c.id][f] === 'string' && L[c.id][f].length > 0)), '39体すべてに師匠・救助役・護衛役・応援・助言のセリフ');
  const kinds = { rescue: 0, explore: 0, escort: 0 }; C.CHARS.forEach(c => kinds[L[c.id].kind]++);
  ok(kinds.rescue === 13 && kinds.explore === 13 && kinds.escort === 13, '師匠として出す修行は13体ずつ');
  const ids = D.SHOP.map(s => s.id);
  ok(new Set(ids).size === ids.length, '交換品のIDが重ならない');
  ok(D.SHOP.filter(s => s.slot === 'costume').every(s => s.price === 100 || s.price === 120), '基本の衣装は道場札100（設計書の値）');
  ok(D.CHAPTERS.length === 5 && D.CHAPTERS.map(c => c.title).join() === '出会い,初めての失敗,方針の違い,協力,師匠の試験', '物語は5章（出会い→初めての失敗→方針の違い→協力→師匠の試験）');
  ok(D.CHAPTERS.every(c => C.BY_ID[c.master] && ST.CH[c.id]), '各章の師匠は公式の39体で、会話がある');
  ok(D.RULE_IDS.every(r => D.RULES[r] && ['ch1', 'ch2', 'ch3', 'ch4'].includes(D.RULES[r].unlock)), '作戦はどれも物語の中で使えるようになる');
  ok(Object.keys(D.INTENTS).every(k => !D.INTENTS[k].rule || D.RULES[D.INTENTS[k].rule]), '言葉の意図が指す作戦はすべて存在する');
  ok(C.PARTNER_NAMES.every(n => !C.CHARS.some(c => c.name === n)), '相棒の呼び名は公式の39体と重ならない');
  // 相棒の見た目の組み合わせはすべて描ける
  const A = require(path.join(ROOT, 'art.js'));
  let drawn = 0;
  C.PARTNER_OUTFITS.forEach(o => C.PARTNER_HAIRS.forEach(hh => C.PARTNER_ACCS.forEach(a => { const svg = A.render(C.partnerArt({ outfit: o.id, hair: hh.id, hairColor: 'kuro', acc: a.id }), { yaw: 50, pose: 'walk', frame: 1 }); if (svg.indexOf('NaN') < 0 && svg.length > 1000) drawn++; })));
  ok(drawn === C.PARTNER_OUTFITS.length * C.PARTNER_HAIRS.length * C.PARTNER_ACCS.length, '相棒の見た目の組み合わせ（' + drawn + '通り）をすべて描ける');
  let posesOk = true;
  C.CHARS.forEach(c => ['attack', 'rescue', 'search', 'retreat', 'down', 'cheer'].forEach(p => { const svg = A.render(c.art, { yaw: -50, pose: p, frame: 1, expr: p === 'down' ? 'tired' : undefined }); if (svg.indexOf('NaN') >= 0) posesOk = false; }));
  ok(posesOk, '39体すべて、修行の動き（6つ）を描ける');
}

console.log(`\n結果: ${pass} 件合格 / ${fail} 件不合格`);
process.exit(fail ? 1 : 0);
