// 設計書 §13 の受入テスト（物理 engine.js／判定 rules.js／保存と公開までの状態 store.js）。ブラウザなしで動く。
//   node ninja-karakuri-kobo/tools/test_rules.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js'));
globalThis.KK_DATA = D;
const E = require(path.join(ROOT, 'engine.js'));
globalThis.KK_ENGINE = E;
const R = require(path.join(ROOT, 'rules.js'));
globalThis.KK_RULES = R;
const ST = require(path.join(ROOT, 'store.js'));
globalThis.NinjaArt = require(path.join(ROOT, 'art.js'));
const C = require(path.join(ROOT, 'chars.js'));
const { STAGES, TEMPLATES } = require(path.join(ROOT, 'stages.js'));
const { SOLUTIONS } = require(path.join(ROOT, 'solutions.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  NG: ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '  (' + JSON.stringify(a) + ' != ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('■ ' + t); }
// JPEG の幅と高さ（SOF の見出しから読む）
function jpegSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
const codes = v => (v.errors || []).map(e => e.code);

const T0 = Date.parse('2026-09-28T01:00:00Z');
let clock = T0;
const now = () => clock;
const newStore = (storage, opt) => new ST.Store(storage || new ST.MemStorage(), Object.assign({ now }, opt || {}));
const tpl = id => TEMPLATES.filter(t => t.id === id)[0];
const lvOf = t => R.fromAscii(t.rows, Object.assign({ theme: t.theme }, t.meta || {}));
const stageLv = id => lvOf(STAGES.filter(s => s.id === id)[0]);
const solOf = key => SOLUTIONS[key].runs;
const RIGHT = E.IN.R, JUMP = E.IN.J;
// 見本から作って、検証 → 作者クリア → （自動審査で）公開までを1度に行う
function publishTemplate(s, id) {
  const r = s.create(lvOf(tpl(id)), id);
  s.check(r.level_id);
  const c = s.recordClear(r.level_id, solOf(id));
  const sub = s.submit(r.level_id);
  return { lid: r.level_id, clear: c, sub };
}

section('物理と記録の再生：運営の試験39本と見本6本は、記録した入力でクリアできる（どの端末でも同じ結果）');
{
  eq(STAGES.length, 39, '運営の試験は39本');
  eq(TEMPLATES.length, 6, '見本は6本');
  let bad = [];
  STAGES.map(s => [String(s.id), lvOf(s)]).concat(TEMPLATES.map(t => [t.id, lvOf(t)])).forEach(([key, lv]) => {
    const sol = SOLUTIONS[key];
    if (!sol || sol.hash !== R.contentHash(lv)) { bad.push(key + ':hash'); return; }
    const rp = E.replay(lv, sol.runs);
    if (!rp.cleared || rp.frames !== sol.frames) bad.push(key + ':replay');
  });
  eq(bad, [], '全45本がハッシュ一致・再生でクリア・コマ数一致');
  const lv = stageLv(35), a = E.replay(lv, solOf('35')), b = E.replay(lv, solOf('35'));
  eq([a.frames, a.deaths.length], [b.frames, b.deaths.length], '同じ入力なら同じ結果（移動足場の試験）');
  const cut = solOf('35').slice(0, -1);
  ok(!E.replay(lv, cut).cleared, '入力が足りない記録ではクリアにならない');
  const idle = E.replay(stageLv(1), [[0, 8000]]);
  ok(!idle.cleared && idle.status === 3 && idle.frames === D.LIMIT.timeFrames, '制限時間120秒で時間切れ');
}

section('§4 失敗したら直近のチェックポイントへ（残機なし・0.5秒で再開、はじめからは1操作）');
{
  const lv = R.fromAscii([
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '.S....C.................G.......',
    '############____################'], { theme: 'chikurin' });
  ok(R.validate(lv).ok, 'テスト用の試験は検証に通る');
  const w = E.createWorld(lv), s = E.initState(w), log = [];
  for (let f = 0; f < 200 && s.deaths === 0; f++) { const ev = []; E.step(w, s, RIGHT, ev); ev.forEach(e => log.push([s.f, e.t])); }
  const dieAt = (log.find(e => e[1] === 'die') || [0])[0];
  ok(log.some(e => e[1] === 'check'), 'チェックポイントに触れた');
  ok(dieAt > 0, '落とし穴で失敗した');
  let resp = 0;
  for (let f = 0; f < 120 && !resp; f++) { const ev = []; E.step(w, s, 0, ev); if (ev.some(e => e.t === 'respawn')) resp = s.f; }
  ok(resp > 0 && resp - dieAt <= 2 * 60, '失敗から2秒以内に再開（' + (resp - dieAt) + 'コマ）');
  eq([s.px, s.py, s.status], [6.5, 1, 0], '再開の場所はチェックポイント');
  ok(s.deaths === 1 && s.status === 0, '残機はなく、何度でも続けられる');
  const s2 = E.initState(w);
  eq([s2.px, s2.py, s2.f, s2.deaths], [1.5, 1, 0, 0], 'はじめからのやり直しは状態を作り直すだけ（1操作）');
}

section('§13-1 未接続の扉・埋まったゴール・部品の上限超過を、公開前に検出する');
{
  const base = lvOf(tpl('door_switch'));
  ok(R.validate(base).ok, '見本（扉とスイッチ）は検証に通る');
  const noLink = R.clone(base); noLink.connections = [];
  const v1 = R.validate(noLink);
  ok(!v1.ok && codes(v1).includes('nolink') && v1.errors.some(e => /扉/.test(e.msg) && e.at), '未接続の扉・スイッチを場所つきで検出');
  const buried = lvOf(tpl('blank'));
  const g = buried.parts.find(p => p.part_id === 'goal');
  buried.parts.push({ id: R.nextPartId(buried), part_id: 'floor', x: g.x, y: g.y + 1, len: 1, dir: 'h', skin: 0 });
  ok(codes(R.validate(buried)).includes('buried'), 'ゴールの上に足場があると「埋まっている」');
  const many = lvOf(tpl('blank'));
  for (let i = 0; many.parts.length <= D.LIMIT.parts; i++) many.parts.push({ id: R.nextPartId(many), part_id: 'deco', x: i % 32, y: 3 + Math.floor(i / 32), kind: 0, dir: 'r' });
  ok(codes(R.validate(many)).includes('parts'), '部品が80をこえると検出（' + many.parts.length + '）');
  const act = lvOf(tpl('blank'));
  for (let i = 0; i < 11; i++) act.parts.push({ id: R.nextPartId(act), part_id: 'trap', x: 4 + i * 2, y: 1, rate: 2, dir: 'up' });
  ok(codes(R.validate(act)).includes('active'), '動作する仕掛けが10をこえると検出');
  const cps = lvOf(tpl('blank'));
  [6, 12, 18].forEach(x => cps.parts.push({ id: R.nextPartId(cps), part_id: 'check', x, y: 1 }));
  ok(codes(R.validate(cps)).includes('check'), 'チェックポイント3つは検出');
  const noStart = lvOf(tpl('blank')); noStart.parts = noStart.parts.filter(p => p.part_id !== 'start');
  ok(codes(R.validate(noStart)).includes('start'), 'スタートがないと検出');
  const danger = lvOf(tpl('blank'));
  danger.parts.push({ id: R.nextPartId(danger), part_id: 'trap', x: 2, y: 1, rate: 2, dir: 'up' });
  ok(codes(R.validate(danger)).includes('danger'), 'スタート・チェックポイントのそばの危険物は置けない');
  const s = newStore();
  const r = s.create(noLink, 'door_switch');
  const ck = s.check(r.level_id);
  eq(s.draftOf(r.level_id).state, 'invalid', '検証で「修正必要」になる');
  ok(!ck.result.ok && !s.canSubmit(r.level_id).ok && !s.submit(r.level_id).ok, '修正必要の版は申請できない');
}

section('§13-2 動く足場・罠のあるコースは作者クリアが必要で、編集するとクリア記録は無効になる');
{
  const s = newStore();
  const r = s.create(lvOf(tpl('mover_bridge')), 'mover_bridge'), lid = r.level_id;
  ok(/作者クリア|検証/.test(s.canSubmit(lid).error), '作ったばかりの版は申請できない');
  s.check(lid);
  eq(s.draftOf(lid).state, 'testable', '検証に通ると「テスト可」');
  ok(!s.recordClear(lid, [[RIGHT, 120]]).ok, 'クリアにならない入力は作者クリアとして記録しない');
  const c = s.recordClear(lid, solOf('mover_bridge'));
  ok(c.ok && s.draftOf(lid).state === 'cleared' && s.draftOf(lid).clear.verified, '入力を再生してクリアを確かめて記録');
  ok(s.canSubmit(lid).ok, '作者クリア後は申請できる');
  const orig = R.clone(s.draftOf(lid).content), edited = R.clone(orig);
  edited.parts.push({ id: R.nextPartId(edited), part_id: 'deco', x: 20, y: 1, kind: 2, dir: 'r' });
  s.update(lid, edited);
  ok(s.draftOf(lid).clear === null && s.draftOf(lid).state === 'draft', '編集するとクリア記録が消えて下書きに戻る');
  ok(!s.canSubmit(lid).ok, '編集後は申請できない');
  s.update(lid, orig);
  ok(!s.canSubmit(lid).ok, '元の形に戻しても、もう一度テストするまで申請できない');
  s.check(lid); s.recordClear(lid, solOf('mover_bridge'));
  const v = s.draftOf(lid); v.clear.rules = 'k0';
  ok(!s.canSubmit(lid).ok, 'ルールの版がちがう作者クリアでは申請できない');
}

section('§13-3 読み込みに失敗しても・途中でやめても、下書きは消えず、前の保存に戻れる');
{
  const mem = new ST.MemStorage(), s = newStore(mem);
  const r = s.create(lvOf(tpl('first_path')), 'first_path'), lid = r.level_id;
  const c1 = R.clone(s.draftOf(lid).content);
  const c2 = R.clone(c1); c2.parts.push({ id: R.nextPartId(c2), part_id: 'floor', x: 20, y: 4, len: 2, dir: 'h', skin: 0 });
  clock += 1000; s.update(lid, c2);
  const c3 = R.clone(c2); c3.parts.push({ id: R.nextPartId(c3), part_id: 'deco', x: 6, y: 1, kind: 1, dir: 'r' });
  clock += 1000; s.update(lid, c3);
  mem.setItem('kk1.levels', '{こわれた');
  mem.setItem('kk1.ver.' + r.version_id, '');
  const s2 = newStore(mem);
  ok(!!s2.levels[lid], '一覧がこわれても予備（.bak）から戻る');
  eq(R.contentHash(s2.draftOf(lid).content), R.contentHash(c3), '版の中身も予備から戻り、最後の保存のまま');
  const list = s2.autosaves(lid);
  eq(list.length, 3, '自動保存の履歴が3つ');
  s2.restore(lid, 0);
  eq(R.contentHash(s2.draftOf(lid).content), R.contentHash(c1), '履歴から前の版に戻せる');
  for (let i = 0; i < 20; i++) { const ci = R.clone(c1); ci.parts.push({ id: R.nextPartId(ci), part_id: 'deco', x: 6 + (i % 10), y: 4 + Math.floor(i / 10), kind: 0, dir: 'r' }); s2.update(lid, ci); }
  eq(s2.autosaves(lid).length, D.LIMIT.saves, '自動保存の履歴は12件まで');
  // 保存領域がいっぱい（書きこみ失敗）でも、前に保存した中身は残る
  const full = new ST.MemStorage(), s3 = newStore(full);
  const r3 = s3.create(lvOf(tpl('first_path')), 'first_path');
  const before = R.contentHash(s3.draftOf(r3.level_id).content);
  full.setItem = function () { throw new Error('QuotaExceeded'); };
  const up = s3.update(r3.level_id, c2);
  ok(!up.ok && s3.writable === false, '書きこめないときは失敗を返す（黙って消さない）');
  delete full.setItem;
  eq(R.contentHash(newStore(full).draftOf(r3.level_id).content), before, '読み直すと、前に保存した中身が残っている');
}

section('§13-4 異常なJSON・他人の owner_id・未検証の版の公開を拒否する');
{
  ok(codes(R.validate(null)).includes('format') && codes(R.validate({ parts: 'x' })).includes('format'), '形のこわれたデータは検証で不合格');
  let threw = false;
  [{ parts: [null, 1, 'a', {}] }, { parts: [{ part_id: 'toString', id: 'p1', x: 0, y: 0 }] }, { parts: [], connections: 'x' }].forEach(b => { try { ok(!R.validate(b).ok, '不合格：' + JSON.stringify(b).slice(0, 40)); } catch (e) { threw = true; } });
  ok(!threw, '異常なデータでも検証が止まらない');
  const n = R.normalize({ theme: 'mars', title: { a: 999 }, parts: [{ id: 'p1', part_id: 'floor', x: 0, y: 0, len: 3, dir: 'h', skin: 0, onload: '<script>' }, { part_id: 'laser', x: 1, y: 1 }], connections: [{ from: 1, to: {} }] });
  ok(n.theme === 'chikurin' && n.title.a === 0 && !('onload' in n.parts[0]) && n.parts.length === 1 && n.connections.length === 0 && n._dropped === 1, '知らない項目・部品・値は取りこまない');
  const weird = lvOf(tpl('blank')); weird.parts.push({ id: 'p<1>', part_id: 'deco', x: 3, y: 3, kind: 0, dir: 'r' });
  ok(codes(R.validate(weird)).includes('id'), 'おかしな ID は不合格');
  const out = lvOf(tpl('blank')); out.parts.push({ id: 'z1', part_id: 'floor', x: 30, y: 5, len: 5, dir: 'h', skin: 0 });
  ok(codes(R.validate(out)).includes('range'), 'はみ出す部品は不合格');
  const big = lvOf(tpl('blank')); big.pad = 'x'.repeat(D.LIMIT.jsonBytes);
  ok(codes(R.validate(big)).includes('size'), '大きすぎるデータは不合格');
  const s = newStore();
  const r = s.create(lvOf(tpl('first_path')), 'first_path');
  s.levels[r.level_id].owner_id = 'u_someone_else';
  ok(!s.update(r.level_id, lvOf(tpl('blank'))).ok && !s.check(r.level_id).ok && !s.submit(r.level_id).ok, '他人の owner_id の作品は書き換え・検証・申請できない');
  // 未検証の版：審査中に中身をすり替えても、承認で弾く
  const s2 = newStore(); s2.profile.settings.autoReview = false;
  const r2 = s2.create(lvOf(tpl('first_path')), 'first_path');
  s2.check(r2.level_id); s2.recordClear(r2.level_id, solOf('first_path'));
  const sub = s2.submit(r2.level_id);
  const v = s2.draftOf(r2.level_id); v.content.parts.push({ id: R.nextPartId(v.content), part_id: 'trap', x: 20, y: 1, rate: 3, dir: 'up' });
  ok(!s2.approve(sub.case_id, 'operator').ok, '申請後に中身がすり替わった版は公開しない');
  const s3 = newStore(); s3.profile.settings.autoReview = false;
  const r3 = s3.create(lvOf(tpl('first_path')), 'first_path');
  ok(!s3.submit(r3.level_id).ok, '作者クリアのない版は申請できない');
  s3.check(r3.level_id); s3.recordClear(r3.level_id, solOf('first_path'));
  const sub3 = s3.submit(r3.level_id);
  s3.draftOf(r3.level_id).clear.runs = [[RIGHT, 30]];
  ok(!s3.approve(sub3.case_id, 'operator').ok, '作者クリアの記録が再生でクリアにならない版は公開しない');
  // コードの読みこみ
  const A = newStore(), B = newStore();
  const pub = publishTemplate(A, 'first_path');
  const code = A.shareCode(pub.lid).code;
  ok(!A.importLevel(code).ok && A.importLevel(code).own, '自分の作品のコードは友だちの試験に入れない');
  const broken = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
  ok(!B.importLevel(broken).ok, '1文字こわれたコードは読みこまない（CRC）');
  const d = R.decodeLevel(code);
  const fake = R.encodeLevel(d.level, Object.assign({}, d.meta, { runs: [[RIGHT, 40]] }));
  ok(/作者クリア/.test(B.importLevel(fake).error), 'クリアできない記録のついたコードは読みこまない');
  ok(!B.importLevel('KRK1-' + 'A'.repeat(40)).ok && !B.importLevel('{"parts":[]}').ok, 'でたらめな文字列は読みこまない');
  ok(B.importLevel(code).ok, '正しいコードは読みこめる');
}

section('§13-5 AI の提案に未知の部品・座標外・任意コードがあっても使わない');
{
  const base = lvOf(tpl('first_path'));
  const bad = [
    [{ objects: [{ part_id: 'laser', x: 3, y: 1 }] }, '未知の部品'],
    [{ objects: [{ part_id: 'constructor', x: 3, y: 1 }] }, '組みこみの名前の部品（constructor）'],
    [JSON.parse('{"objects":[{"part_id":"__proto__","x":3,"y":1}]}'), '組みこみの名前の部品（__proto__）'],
    [{ objects: [{ part_id: 'floor', x: 40, y: 1, len: 2, dir: 'h', skin: 0 }] }, '座標外'],
    [{ objects: [{ part_id: 'floor', x: 5, y: -1 }] }, '負の座標'],
    [{ objects: [], note: '<script>alert(1)</script>' }, 'スクリプト'],
    [{ objects: [{ part_id: 'floor', x: 5, y: 3, len: 'function(){}' }] }, '関数の文字列'],
    [{ objects: [{ part_id: 'deco', x: 5, y: 3, kind: { $gt: 1 } }] }, '入れ子の値'],
    [{ objects: [], run: 'fetch()' }, '知らない項目'],
    [{ objects: [{ part_id: 'goal', x: 10, y: 1 }] }, 'ゴールの追加'],
    [{ template_id: 'cross_water', objects: [{ part_id: 'water', x: 8, y: 1, length: 3 }] }, '部品の知らない項目（length）'],
    [{ objects: [{ part_id: 'floor', x: 5, y: 0, len: 3, dir: 'h', skin: 0 }] }, '重なる案（検証で不合格）'],
    [[1, 2, 3], '配列'],
    [null, 'null']
  ];
  bad.forEach(([p, why]) => { const c = R.checkProposal(p, base); ok(!c.ok, '不合格にする：' + why); });
  const before = R.contentHash(base);
  R.checkProposal({ objects: [{ part_id: 'floor', x: 20, y: 5, len: 3, dir: 'h', skin: 0 }] }, base);
  eq(R.contentHash(base), before, '検査しただけでは試験は変わらない（採用するまで反映しない）');
  const good = R.checkProposal({ template_id: 'first_path', objects: [{ id: 'n1', part_id: 'floor', x: 20, y: 4, len: 3, dir: 'h', skin: 1 }], connections: [], difficulty_hint: 'easy' }, base);
  ok(good.ok && good.level.parts.length === base.parts.length + 1, '正しい案は検査に通り、差分だけが足される');
  let n = 0;
  ['water', 'mover', 'trap', 'door', 'pit', 'jump'].forEach(gm => {
    const sg = R.suggest(lvOf(tpl('blank')), { theme: 'chikurin', level: 'easy', gimmick: gm }, 7919);
    if (sg.ok && R.validate(sg.level).ok) n++;
  });
  eq(n, 6, '定型の提案は6種の仕掛けすべてで、検証に通る案を出す');
  eq([D.LIMIT.aiPerDay, D.LIMIT.aiTimeoutMs], [3, 12000], '生成は1日3回・12秒で見本に切りかえ');
  const s = newStore();
  eq(s.aiLeft(), 3, 'はじめは今日あと3回');
  s.aiUse(); s.aiUse(); s.aiUse();
  eq(s.aiLeft(), 0, '3回使うと0回');
  clock += 86400000;
  eq(s.aiLeft(), 3, '次の日には3回に戻る');
  clock = T0;
}

section('§13-6 通報・非公開・再申請・作者非表示の一連の操作');
{
  const A = newStore(), B = newStore();
  const pub = publishTemplate(A, 'cross_water');
  ok(pub.sub.ok && pub.sub.auto && pub.sub.result.approved, '自動審査（試作）で公開される');
  eq(A.stateOf(pub.lid).live, 'published', '公開中');
  const code = A.shareCode(pub.lid).code;
  ok(B.importLevel(code).ok && B.friendList().length === 1, '友だちがコードで受け取る');
  ok(!B.report(pub.lid, 'spam').ok, '決まった種類以外の通報は受け付けない');
  const rp = B.report(pub.lid, 'impossible');
  ok(rp.ok && B.friendList().length === 0, '通報するとその端末ではすぐ表示を止める');
  ok(B.openCases().some(m => m.kind === 'report' && m.category === 'impossible'), '運営の確認待ちに入る');
  B.resolveReport(rp.case_id, true);
  eq(B.friendList().length, 1, '問題なければ表示に戻す');
  const rp2 = B.report(pub.lid, 'bad');
  B.resolveReport(rp2.case_id, false);
  ok(B.friendList().length === 0 && !!B.friends[pub.lid], '停止のままでも、通報の数だけで消さない（データは残る）');
  const C2 = newStore();
  C2.importLevel(code);
  C2.blockOwner(A.profile.owner_id, true);
  eq(C2.friendList().length, 0, '作者を非表示にすると一覧から消える');
  ok(/非表示/.test(C2.importLevel(code).error), '非表示の作者のコードは読みこまない');
  C2.blockOwner(A.profile.owner_id, false);
  eq(C2.friendList().length, 1, '非表示をやめると戻る');
  // 非公開 → 再申請
  ok(A.unpublish(pub.lid).ok && A.stateOf(pub.lid).priv === 'private', '非公開にできる');
  ok(!A.shareCode(pub.lid).ok, '非公開の作品はコードにできない');
  const rs = A.resubmit(pub.lid);
  ok(rs.ok && A.stateOf(pub.lid).live === 'published', '再申請して公開に戻る');
  // 差戻し → 直して再申請 → 承認。公開中の版は書き換えず、新しい版を作る
  A.profile.settings.autoReview = false;
  ok(!A.update(pub.lid, lvOf(tpl('blank'))).ok, '公開中の版は直接書き換えられない');
  const nv = A.newVersion(pub.lid);
  ok(nv.ok && nv.version_id !== A.levels[pub.lid].live, '変更は新しい version_id の版で行う');
  A.check(pub.lid); A.recordClear(pub.lid, solOf('cross_water'));
  const sub = A.submit(pub.lid);
  eq(A.draftOf(pub.lid).state, 'review', '審査待ち');
  ok(A.withdraw(pub.lid).ok && A.draftOf(pub.lid).state === 'cleared', '申請を取り消せる');
  const sub2 = A.submit(pub.lid);
  A.reject(sub2.case_id, 'shape', { x: 5, y: 3 }, 'operator');
  const rv = A.draftOf(pub.lid);
  ok(rv.state === 'rejected' && rv.reject.text.length > 0 && rv.reject.cell.x === 5, '差戻しには理由と直す場所がつく');
  eq(A.stateOf(pub.lid).live, 'published', '差戻し中も、公開中の前の版はそのまま遊ばれる');
  const fixed = R.clone(rv.content); fixed.parts.push({ id: R.nextPartId(fixed), part_id: 'deco', x: 3, y: 4, kind: 4, dir: 'r' });
  A.update(pub.lid, fixed); A.check(pub.lid); A.recordClear(pub.lid, solOf('cross_water'));
  const sub3 = A.submit(pub.lid);
  const oldLive = A.levels[pub.lid].live;
  ok(A.approve(sub3.case_id, 'operator').ok, '直して再申請すると承認できる');
  ok(A.getVersion(oldLive).state === 'archived' && A.levels[pub.lid].live !== oldLive, '前の版は旧版になり、記録は旧版に結びついたまま');
  ok(sub.ok && sub2.ok, '申請はいつでも出し直せる');
}

section('§8 公開枠3本・下書き10本');
{
  const s = newStore();
  ['first_path', 'cross_water', 'door_switch'].forEach(id => publishTemplate(s, id));
  eq(s.publishedCount(), 3, '3本公開');
  const r = s.create(lvOf(tpl('trap_road')), 'trap_road');
  s.check(r.level_id); s.recordClear(r.level_id, solOf('trap_road'));
  ok(/公開枠/.test(s.canSubmit(r.level_id).error), '4本目は公開枠がいっぱい');
  s.unpublish(s.list().find(l => l.live).level_id);
  ok(s.canSubmit(r.level_id).ok, '1本を非公開にすると枠が空く');
}

section('§13-7 下書き枠の購入の復元と、解約・返金後も既存の下書きを読める。枠をこえたら新規作成を止め、勝手に消さない');
{
  const s = newStore();
  s.profile.draftBonus = 40; // 工房拡張（下書き50）を持っている想定。試作版には購入はない
  for (let i = 0; i < 12; i++) ok(s.create(lvOf(tpl('blank')), 'blank').ok, '拡張ありで下書き ' + (i + 1) + ' 本目');
  s.profile.draftBonus = 0; // 解約・返金
  eq(s.draftCount(), 12, '枠が10本に戻っても、12本の下書きは消えない');
  const ids = s.list().map(l => l.level_id);
  ok(ids.every(id => !!s.draftOf(id)), '既存の下書きはすべて読める');
  ok(s.update(ids[0], lvOf(tpl('first_path'))).ok, '既存の下書きは編集もできる');
  const r = s.create(lvOf(tpl('blank')), 'blank');
  ok(!r.ok && /下書きがいっぱい/.test(r.error) && s.draftCount() === 12, '新規作成は止めるが、1本も消さない');
  s.deleteDraft(ids[1]); s.deleteDraft(ids[2]); s.deleteDraft(ids[3]);
  ok(s.create(lvOf(tpl('blank')), 'blank').ok, '本人が消して枠内に戻ると、また作れる');
  s.profile.draftBonus = 40; // 購入の復元
  ok(s.create(lvOf(tpl('blank')), 'blank').ok, '購入を復元すると、また枠が広がる');
}

section('§9 修行印は運営の試験の合格でだけ増える（作品を作る・自分の作品を周回するだけでは増えない）');
{
  const s = newStore();
  let g = s.officialClear(1, 600, 15);
  eq(g.seals, 2, 'はじめての合格＋目標タイム以内で2つ');
  g = s.officialClear(1, 500, 15);
  eq(g.seals, 0, '2回目の合格では増えない');
  eq(s.officialClear(2, 20 * 60, 15).seals, 1, '目標タイムをこえた合格は1つ');
  const before = s.profile.seals;
  for (let i = 0; i < 5; i++) s.create(lvOf(tpl('blank')), 'blank');
  for (let i = 0; i < 10; i++) s.addAttempt({ level_id: 'l_mine', content_hash: 'x', kind: 'mine', result: 'clear', frames: 300 });
  eq(s.profile.seals, before, '作品を5本作っても、10回周回しても増えない');
  ok(!s.buy('outfit_kogane').ok, '足りないと交換できない');
  ok(s.buy('fx_sakura').ok && !s.buy('fx_sakura').ok, '交換は1回だけ（見た目だけ・現実のお金では買えない）');
  ok(D.SHOP.every(x => x.price > 0 && !('yen' in x) && !('robux' in x)), '店は修行印だけ');
  // 週のお題（週に1回）
  let t = T0; while (D.WEEKLY[((ST.weekIndex(t) % 6) + 6) % 6].id !== 'short') t += 7 * 86400000;
  clock = t;
  const s2 = newStore();
  const r = s2.create(lvOf(tpl('first_path')), 'first_path');
  s2.check(r.level_id); s2.recordClear(r.level_id, solOf('first_path'));
  const cw = s2.claimWeekly(r.level_id);
  ok(cw.ok && cw.seals === D.SEAL.weekly, '週のお題に合う作者クリアで修行印' + D.SEAL.weekly + 'つ');
  ok(!s2.claimWeekly(r.level_id).ok, '同じ週は1回だけ');
  clock = T0;
}

section('§7 攻略メモ（友だちの結果）と改善の提案。試行が少ないときは出さない');
{
  const A = newStore();
  const pub = publishTemplate(A, 'trap_road');
  const code = A.shareCode(pub.lid).code;
  const lv = A.liveOf(pub.lid).content, hash = A.liveOf(pub.lid).content_hash;
  const trap = lv.parts.filter(p => p.part_id === 'trap').sort((a, b) => a.x - b.x)[1];
  const players = [];
  for (let k = 0; k < 3; k++) {
    const B = newStore();
    B.importLevel(code);
    for (let i = 0; i < 5; i++) B.addAttempt({ level_id: pub.lid, content_hash: hash, kind: 'friend', result: i === 4 ? 'clear' : 'fail', frames: 900, deaths: [{ x: trap.x, y: trap.y, cause: 'trap' }] });
    B.react(pub.lid, hash, 'hard');
    const m = B.makeResult(pub.lid);
    ok(m.ok && /^KRR1-/.test(m.code), '攻略メモのコードを作れる（' + (k + 1) + '人目）');
    players.push(m.code);
  }
  const r1 = A.importResult(players[0]);
  ok(r1.ok, '作者が攻略メモを読みこめる');
  const h1 = R.improveHints(lv, A.othersAttempts(pub.lid, hash));
  ok(!h1.enough && h1.hints.length === 0, '1人・5回では提案を出さない');
  A.importResult(players[1]); A.importResult(players[2]);
  const h2 = R.improveHints(lv, A.othersAttempts(pub.lid, hash));
  ok(h2.enough && h2.hints.some(h => /2番目の予告付き罠で失敗が集中/.test(h.msg) && h.at.x === trap.x), '3人・15回で「2番目の予告付き罠で失敗が集中」');
  eq(R.contentHash(A.liveOf(pub.lid).content), hash, '提案は作者が採用するまで試験に反映しない');
  ok(!A.importResult(players[0].slice(0, -2) + 'AA').ok, 'こわれた攻略メモは読みこまない');
  const other = newStore();
  ok(/あなたの作品/.test(other.importResult(players[0]).error), '自分の作品でない攻略メモは読みこまない');
}

section('§11 試験コードと内容のハッシュ（検証済みの版だけを配る）');
{
  const A = newStore();
  const r = A.create(lvOf(tpl('door_switch')), 'door_switch');
  ok(!A.shareCode(r.level_id).ok, '公開していない版はコードにできない');
  const pub = publishTemplate(A, 'mover_bridge');
  A.profile.sign.f = 1;
  const code = A.shareCode(pub.lid).code;
  const d = R.decodeLevel(code);
  eq(R.contentHash(R.normalize(d.level)), A.liveOf(pub.lid).content_hash, 'コードを読んでも内容のハッシュは同じ');
  eq([d.meta.sign.c, d.meta.sign.f], [A.profile.sign.c, 1], '制作者の看板（決まった言葉と飾り）が入る');
  ok(!R.decodeLevel(code + 'AAAA').ok, '後ろに余計な文字があるコードは読まない');
  const shuffled = R.clone(A.liveOf(pub.lid).content); shuffled.parts.reverse(); shuffled.parts.forEach((p, i) => { p.id = 'q' + i; });
  shuffled.connections = [];
  const plain = R.clone(A.liveOf(pub.lid).content); plain.connections = [];
  eq(R.contentHash(shuffled), R.contentHash(plain), 'ハッシュは部品の並び順や ID の付け方に左右されない');
}

section('§13 イベントの記録（端末の中だけ）');
{
  const names = ['level_start', 'level_finish', 'level_retry', 'editor_start', 'part_place', 'test_start', 'creator_clear', 'publish_submit', 'publish_approve', 'publish_reject', 'level_report', 'ai_draft_accepted'];
  const src = ['ui.js', 'editor.js', 'store.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const missing = names.filter(n => !new RegExp("log\\('" + n + "'").test(src));
  eq(missing, [], '設計書のイベント12種を記録している');
  const s = newStore();
  publishTemplate(s, 'first_path');
  const got = s.events.map(e => e.n);
  ok(['creator_clear', 'publish_submit', 'publish_approve'].every(n => got.includes(n)), '作者クリア・申請・承認が記録される');
  const k = s.kpi();
  ok(k.counts.creator_clear === 1 && typeof k.threeOrMore === 'boolean', '記録の画面で数えられる');
}

section('§2・§12 運営の試験（投稿が少なくても遊べる）：39人の試験官・3テーマ');
{
  const byTheme = {};
  STAGES.forEach(s => { byTheme[s.theme] = (byTheme[s.theme] || 0) + 1; });
  eq(byTheme, { chikurin: 13, yashiki: 13, tenku: 13 }, '竹林・屋敷・天空道場が13本ずつ');
  eq(STAGES.filter(s => !C.BY_STAGE[s.id]).map(s => s.id), [], 'どの試験にも CryptoNinja の試験官がいる');
  eq(new Set(C.CHARS.map(c => c.exam.stage)).size, 39, '39人がそれぞれ別の試験を担当');
  ok(STAGES.filter(s => s.tags.includes('first')).length >= 5, '「初めての試験」が5本以上');
  ok(STAGES.filter(s => s.tags.includes('think')).length >= 5, '「考える」が5本以上');
  const slow = STAGES.filter(s => SOLUTIONS[String(s.id)].frames > 90 * 60).map(s => s.id);
  eq(slow, [], 'お手本の走りはどれも90秒以内');
  const bad = STAGES.filter(s => { const v = R.validate(stageLv(s.id)); return !v.ok; }).map(s => s.id);
  eq(bad, [], '全試験が検証に通る（部品80・仕掛け10・チェックポイント2 以内）');
  const sheets = C.CHARS.filter(c => !fs.existsSync(path.join(ROOT, 'sheets', c.id + '.jpg')) || !fs.existsSync(path.join(ROOT, 'sheets', 'thumb', c.id + '.jpg'))).map(c => c.id);
  eq(sheets, [], '39体のキャラクターシート（本体と縮小版）がある');
  const SH = require(path.join(ROOT, 'sheet.js'));
  const sv = SH.sheetSvg(C.BY_ID.kohaku, { officialHref: 'x.jpg', figureHref: 'f.jpg', look: ['赤い耳と青い模様の白い狐面'] });
  ok(sv.indexOf('<image href="x.jpg"') >= 0 && sv.indexOf('原型　公式イラスト') >= 0 && sv.indexOf('<image href="f.jpg"') >= 0 && sv.indexOf('原型　公式3Dフィギュア（全身）') >= 0 &&
    sv.indexOf('本作での役') >= 0 && sv.indexOf('第二の試験「足場わたり」試験官') >= 0 && sv.indexOf('ゲームの中の姿') >= 0 && sv.indexOf('しぐさ') >= 0, 'シートの主役は原型（公式イラストと公式3Dフィギュア）で、担当の試験とゲームの中の姿をそえる');
  ok(C.CHARS.every(c => { const s = SH.sheetSvg(c, {}); return s.indexOf('NaN') < 0 && s.indexOf('undefined') < 0; }), '39体すべてのシートを描ける');
  const wrong = C.CHARS.filter(c => JSON.stringify(jpegSize(path.join(ROOT, 'sheets', c.id + '.jpg'))) !== JSON.stringify([SH.W, SH.H])).map(c => c.id);
  eq(wrong, [], 'シートの画像は今の並び（' + SH.W + '×' + SH.H + '）で作り直してある');
  // ゲームの中の絵：公式イラストに忠実な絵柄（約2.7頭身）。描画エンジンは3作で同じファイル
  const A = globalThis.NinjaArt;
  ok(A.style === 'official' && A.builds('official').normal.hs > 0.7, 'ゲームの中の絵の既定は、公式イラストに忠実な絵柄（約2.7頭身）');
  const same = ['ninja-aibou-dojo', 'ninja-sato-life'].every(g => fs.readFileSync(path.join(ROOT, '..', g, 'art.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8'));
  ok(same, '描画エンジン（art.js）は、相棒道場・里ライフと同じファイル');
  const defs = C.CHARS.map(c => c.art).concat(C.APPRENTICE_SETS.map(s => C.apprenticeArt(s.id, 'pony')));
  const moves = [['run', 0], ['run', 1], ['run', 2], ['run', 3], ['run', 4], ['run', 5], ['jump', 0], ['fall', 0], ['oops', 0], ['land', 0], ['guard', 0], ['cheer', 0], ['stand', 0]];
  ok(defs.every(d => moves.every(m => { const s = A.render(d, { pose: m[0], frame: m[1], yaw: 62 }); return s.indexOf('NaN') < 0 && s.indexOf('undefined') < 0; })), '39体と見習いを、その絵柄で横スクロールのうごき（走る6コマ・跳ぶ・落ちる・当たる・着地・しぐさ）まで描ける');
  const runA = A.render(C.BY_ID.jin.art, { pose: 'run', frame: 0, yaw: 62 }), runB = A.render(C.BY_ID.jin.art, { pose: 'run', frame: 3, yaw: 62 });
  ok(runA !== runB && runA.indexOf('rotate(') >= 0, '走るときは、コマで脚と腕が入れかわり、体を前へ傾ける');
}

console.log(`\n結果: ${pass} 件合格 / ${fail} 件不合格`);
process.exit(fail ? 1 : 0);
