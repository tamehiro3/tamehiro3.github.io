// 設計書 §11 の受入テスト（判定 rules.js / 依頼係 clerk.js）。ブラウザなしで動く。
//   node ninja-sato-life/tools/test_rules.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js'));
globalThis.NSL_DATA = D;
globalThis.NSL_CHARS = require(path.join(ROOT, 'chars.js'));
const R = require(path.join(ROOT, 'rules.js'));
globalThis.NSL_RULES = R;
const C = require(path.join(ROOT, 'clerk.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  NG: ' + msg); } }
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
const MIN = 60000, HOUR = 3600000;
const T0 = Date.parse('2026-09-28T01:00:00Z');
function fresh() {
  const s = R.newState(T0);
  D.BAL.debris.forEach(d => { s.debris[d.id] = true; });
  s.res.coin = 1000; s.res.wood = 150; s.res.herb = 20;
  return s;
}
function rng(seed) { let x = seed || 7; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }
const total = s => s.objs.length + Object.values(s.inv).reduce((a, b) => a + b, 0);

section('配置の検査（範囲・重なり・入口・水辺・所持数・理由の表示）');
{
  const s = fresh();
  ok(R.canPlace(s, 'chochin', 0, 0, 0).reason === '敷地の外です', '敷地の外は置けない');
  ok(R.place(s, 'koya', 3, 3, 0, T0).ok, '小屋を置ける');
  ok(/重なって/.test(R.canPlace(s, 'chochin', 3, 3, 0).reason), '重なりは理由つきで拒否');
  const dt = R.doorTile(R.getObj(s, s.objs[0].uid));
  ok(/入口/.test(R.canPlace(s, 'niwaishi', dt.x, dt.y, 0).reason), '入口の前はふさげない');
  ok(/水辺/.test(R.canPlace(s, 'kobashi', 8, 8, 0).reason), '橋は水辺のとなりが必要');
  ok(R.place(s, 'koike', 8, 8, 0, T0).ok, '池を置ける');
  ok(R.canPlace(s, 'kobashi', 10, 8, 0).ok, '池のとなりなら橋を置ける');
  ok(/1つまで/.test(R.canPlace(s, 'koya', 10, 3, 0).reason), '小屋は1つまで');
  ok(/里Lv2/.test(R.canPlace(s, 'shugyoba', 10, 3, 0).reason), '修行場は里Lv2で解放');
  const poor = fresh(); poor.res.coin = 0;
  const c = R.canPlace(poor, 'sakura', 5, 5, 0);
  ok(!c.ok && c.missing && c.missing.coin === 40, '素材不足は不足量つき');
}

section('§11-1 家具を移動中に終了しても、再起動後に複製・消失しない');
{
  const s = fresh();
  const p = R.place(s, 'endai', 5, 5, 0, T0);
  const saved = JSON.stringify(s);
  // 画面側で「移動中」（ドラッグ中）の状態は保存データに書かない → そのまま終了して再起動
  const back = R.migrate(JSON.parse(saved));
  eq(back.objs.map(o => [o.id, o.x, o.y, o.rot]), [['endai', 5, 5, 0]], '再起動後も元の位置に1つだけ');
  eq(total(back), total(s), '物の総数（置いた物＋倉庫）が変わらない');
  // 失敗する移動は何も変えない
  const before = JSON.stringify(back.objs);
  ok(!R.move(back, p.uid, 0, 0, 0).ok && JSON.stringify(back.objs) === before, '失敗した移動は状態を変えない');
  // 倉庫に戻して置き直しても数は保存される
  const n0 = total(back);
  R.store(back, p.uid); eq(total(back), n0, '倉庫へ戻しても総数は同じ');
  R.place(back, 'endai', 7, 7, 1, T0); eq(total(back), n0, '倉庫から置いても総数は同じ（費用もかからない）');
}

section('§11-2 収穫の連打・通信の再送・端末の時計変更で素材を増やせない');
{
  const s = fresh(); s.tutorial.firstHarvestFree = false;
  const f = R.place(s, 'hatake', 4, 4, 0, T0);
  R.tick(s, T0 + 35 * MIN);
  eq(R.fieldInfo(s, R.getObj(s, f.uid)).stored, 3, '35分で3回分（最大3回分で止まる）');
  const h0 = s.res.herb;
  const a = R.harvest(s, f.uid, 'tap-1');
  eq(a.gained, 15, '1回目の収穫で15個');
  ok(R.harvest(s, f.uid, 'tap-1').dup, '同じ受け取りIDの再送は無効');
  eq(R.harvest(s, f.uid, 'tap-2').gained, 0, '連打しても0個');
  eq(s.res.herb, h0 + 15, '薬草は15個だけ増えた');
  // 時計を戻す → 生産しない
  const r1 = R.tick(s, T0 + 20 * MIN);
  ok(r1.back && R.getObj(s, f.uid).prod.stored === 0, '時計を戻しても生産は進まない');
  // 時計を10時間進める → 8時間で打ち切り、その後に戻しても取り返せない
  const r2 = R.tick(s, T0 + 35 * MIN + 10 * HOUR);
  ok(r2.capped, 'オフライン生産は最大8時間で打ち切り');
  R.harvest(s, f.uid, 'tap-3');
  const got = s.res.herb;
  R.tick(s, T0 + 60 * MIN); // 本当の時刻に戻す
  eq(R.getObj(s, f.uid).prod.stored, 0, '時計を元に戻すと、進めた分が過ぎるまで生産しない');
  eq(s.res.herb, got, '戻したあとも増えない');
  // サーバー時刻で同期していれば、端末の時計を進めても意味がない
  const s2 = fresh(); s2.tutorial.firstHarvestFree = false;
  const f2 = R.place(s2, 'hatake', 4, 4, 0, T0);
  R.syncClock(s2, T0 + 5 * HOUR, T0); // 端末は5時間先、サーバーは T0
  R.tick(s2, T0 + 5 * HOUR);
  eq(R.getObj(s2, f2.uid).prod.stored, 0, '同期後は端末の時計が進んでいても生産しない');
  // 依頼の報酬の二重受け取り（再送）
  const s3 = fresh();
  R.place(s3, 'hatake', 4, 4, 0, T0);
  const q = R.addQuest(s3, { template: 'deliver_herb', npc: null, loc: 'farm', text: '' });
  R.acceptQuest(s3, q.qid);
  const c0 = s3.res.coin;
  ok(R.deliverQuest(s3, q.qid, q.claimId).ok, '依頼を納品できる');
  ok(R.deliverQuest(s3, q.qid, q.claimId).dup, '同じ納品の再送は無効');
  eq(s3.res.coin, c0 + 30, '報酬のコインは1回分だけ');
}

section('§11-3 訪問者は持ち主の配置・在庫を変更できない');
{
  const s = fresh();
  const f = R.place(s, 'hatake', 4, 4, 0, T0);
  R.place(s, 'sakura', 8, 8, 0, T0);
  R.tick(s, T0 + 30 * MIN);
  const owner = JSON.stringify(s);
  const v = R.visitState(JSON.parse(JSON.stringify(R.shareData(s))), T0);
  ok(v.readOnly && v.objs.length === 2, '見学用の里は閲覧専用で、物は同じ数');
  ok(!R.canPlace(v, 'chochin', 6, 6, 0).ok, '見学中は置けない');
  ok(!R.store(v, v.objs[0].uid).ok, '見学中は倉庫に戻せない');
  ok(!R.harvest(v, v.objs[0].uid, 'x').ok, '見学中は収穫できない');
  ok(!R.upgrade(v, v.objs[0].uid).ok, '見学中は強化できない');
  ok(JSON.stringify(s) === owner, '持ち主の状態は変わらない');
  const bad = R.visitState({ n: '<script>', s: 99, o: [['nope', 1, 1, 0], ['chochin', -5, 0, 0], ['chochin', 5, 5, 0], ['chochin', 5, 5, 0]] }, T0);
  ok(bad.objs.length === 1 && bad.village.size === 12 && !/[<>]/.test(bad.village.name), '見学データの不正な物・範囲外・重なり・名前は取り除く');
}

section('§11-4 在庫上限のときは受け取り先を事前に表示し、報酬を無言で捨てない');
{
  const s = fresh(); s.res.herb = 98;
  const pv = R.previewGrant(s, { herb: 5, coin: 10 });
  ok(pv.fits.herb === 2 && pv.over.herb === 3 && pv.hasOver, '事前表示：2個入って3個は受け取り箱');
  R.grant(s, { herb: 5, coin: 10 }, 'テスト');
  ok(s.res.herb === 100 && s.mailbox.length === 1 && s.mailbox[0].res.herb === 3, 'あふれた3個は受け取り箱へ');
  s.res.herb = 90; R.claimMailbox(s, s.mailbox[0].id);
  ok(s.res.herb === 93 && s.mailbox.length === 0, '空きができたら受け取れる');
  // 収穫でも捨てない
  const s2 = fresh(); s2.tutorial.firstHarvestFree = false; s2.res.herb = 97;
  const f = R.place(s2, 'hatake', 4, 4, 0, T0); R.tick(s2, T0 + 30 * MIN);
  const hp = R.harvestPreview(s2, f.uid);
  ok(hp.fits === 3 && hp.room === 3, '収穫前に「3個だけ入る」と分かる');
  R.harvest(s2, f.uid, 'h');
  ok(s2.res.herb === 100 && R.getObj(s2, f.uid).prod.stored === 2 && s2.mailbox.length === 1 && s2.mailbox[0].res.herb === 2, '入らない分は畑に残り、半端は受け取り箱へ');
}

section('§11-5 AI停止・不正な施設ID・遂行不能な依頼で通常依頼に戻る');
{
  const s = fresh();
  R.addResident(s, 'shiba', null, true); R.addResident(s, 'sakuya', null, true);
  R.place(s, 'hatake', 4, 4, 0, T0);
  ok(!C.validate(s, { template_id: 'nope', npc_id: 'shiba', location_tag: 'farm' }).ok, '承認されていないテンプレートは拒否');
  ok(!C.validate(s, { template_id: 'water_training', npc_id: 'shiba', location_tag: 'water' }).ok, '里にない場所（水辺）を求める依頼は拒否');
  ok(!C.validate(s, { template_id: 'deliver_herb', npc_id: 'jin', location_tag: 'farm' }).ok, '住民でない人物は拒否');
  ok(!C.validate(s, { template_id: 'deliver_herb', npc_id: 'shiba', location_tag: 'farm', text: 'https://example.com を見て' }).ok, '承認外の文面は拒否');
  // AIが落ちている／遅い → ルールの依頼
  s.settings.clerkMode = 'ai'; s.settings.aiEndpoint = 'https://example.invalid/ai';
  globalThis.fetch = () => Promise.reject(new Error('停止中'));
  const r1 = await C.generate(s, { kind: 'first_facility', tag: 'farm' }, { rnd: rng(3) });
  ok(r1.gen === 'rule' && r1.proposal && C.validate(s, r1.proposal).ok, 'AI停止時はルールの依頼になる');
  globalThis.fetch = (u, o) => new Promise((res, rej) => { o.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }); });
  const r2 = await C.generate(s, { kind: 'quest_done' }, { rnd: rng(4), timeoutMs: 50 });
  ok(r2.gen === 'rule' && /8秒/.test(r2.proposal.fallback || ''), '時間切れ（8秒）でルールの依頼に切り替わる');
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ template_id: 'build_bridge', npc_id: 'shiba', location_tag: 'water' }) });
  const s3 = fresh(); R.addResident(s3, 'shiba', null, true); R.place(s3, 'hatake', 4, 4, 0, T0); s3.settings.clerkMode = 'ai'; s3.settings.aiEndpoint = 'x';
  const r3 = await C.generate(s3, { kind: 'first_facility', tag: 'farm' }, { rnd: rng(5) });
  ok(r3.gen === 'rule', 'AIが遂行できない依頼（水辺がないのに橋）を返してもルールに戻る');
  // 1日2回まで
  const s4 = fresh(); R.addResident(s4, 'shiba', null, true); R.place(s4, 'hatake', 4, 4, 0, T0); R.place(s4, 'koike', 8, 8, 0, T0);
  const g1 = await C.generate(s4, { kind: 'first_facility', tag: 'water' }, { rnd: rng(1) });
  const g2 = await C.generate(s4, { kind: 'first_facility', tag: 'farm' }, { rnd: rng(2) });
  const g3 = await C.generate(s4, { kind: 'first_facility', tag: 'water' }, { rnd: rng(3) });
  ok(g1.gen === 'reason' && g2.gen === 'reason' && g3.gen === 'rule' && /上限/.test(g3.proposal.fallback || ''), '生成は1日2回まで（3回目はルール）');
  ok(g1.proposal.reason_tag === 'new_water_area', '池を置いた理由（水辺ができた）が依頼に入る');
  // 施設を撤去して遂行できなくなった依頼は無料で差し替え
  const s5 = fresh(); R.addResident(s5, 'shiba', null, true); R.place(s5, 'hatake', 4, 4, 0, T0);
  const pond = R.place(s5, 'koike', 8, 8, 0, T0);
  const wq = R.addQuest(s5, { template: 'water_training', npc: 'shiba', loc: 'water', text: '' });
  R.acceptQuest(s5, wq.qid);
  const st = R.store(s5, pond.uid);
  ok(st.replaced.length === 1, '池を倉庫に戻すと、水辺の依頼が遂行不能になる');
  const rep = C.replaceBroken(s5, rng(9));
  ok(rep.length === 1 && rep[0].neu && !s5.quests.active.some(q => q.template === 'water_training') && R.templateFeasible(s5, D.QUEST[rep[0].neu.template]), '遂行できる依頼に無料で差し替わる');
}

section('§11-6 購入済みテーマを再購入させず、購入の復元で戻る');
{
  const s = fresh();
  ok(R.buy(s, 'theme_yozakura').ok, '夜桜の外観を買える（里コイン）');
  const c1 = s.res.coin;
  const again = R.buy(s, 'theme_yozakura');
  ok(!again.ok && again.owned && s.res.coin === c1, '購入済みは再購入させない（コインも減らない）');
  const ledger = JSON.parse(JSON.stringify(s.purchases));
  const other = fresh();
  const restored = R.restorePurchases(other, ledger);
  ok(other.owned.theme.includes('yozakura') && restored.length === 1, '別の端末で購入の記録から復元できる');
  eq(R.restorePurchases(other, ledger).length, 0, '二度復元しても増えない');
  const s2 = fresh(); R.buy(s2, 'set_hajime');
  const inv1 = JSON.stringify(s2.inv); R.restorePurchases(s2, s2.purchases);
  eq(JSON.stringify(s2.inv), inv1, 'セットの家具は復元で二重にならない');
}

section('生産・最初の10分・里レベル・住民');
{
  const s = R.newState(T0);
  ok(s.res.coin === 50, '初期の里コインは50');
  D.BAL.debris.forEach(d => R.clearDebris(s, d.id));
  eq([s.res.wood, s.res.coin], [30, 100], '荒れた場所3か所の片付けで木材30・コイン50');
  s.inv.koya = 1; s.inv.hatake = 1;
  const k = R.place(s, 'koya', 3, 3, 0, T0); ok(k.ok && k.fromInv, '小屋は支給品から置ける（費用なし）');
  const f = R.place(s, 'hatake', 7, 3, 0, T0); ok(f.ok, '畑を置ける');
  ok(R.firstHarvestBoost(s, f.uid) && R.harvest(s, f.uid, 'first').gained === 5, '初回だけすぐ収穫できる（5個）');
  ok(!R.firstHarvestBoost(s, f.uid), '2回目からは待ち時間がある');
  R.tick(s, T0 + 10 * MIN); eq(R.fieldInfo(s, R.getObj(s, f.uid)).stored, 1, '10分で1回分');
  R.addResident(s, 'ganzi', null, true); R.addResident(s, 'shiba', null, true); R.addResident(s, 'sakuya', null, true);
  ok(R.residentCap(s) === 4, '里Lv1の定員は4人');
  ok(/2回目/.test(R.canMoveIn(s, 'jin').reason), '一度会っただけでは住めない');
  R.meet(s, 'jin'); R.meet(s, 'jin');
  ok(/居場所/.test(R.canMoveIn(s, 'jin').reason), '居場所（石灯籠）がないと住めない');
  s.res.coin += 100; R.place(s, 'ishidoro', 10, 10, 0, T0);
  ok(R.canMoveIn(s, 'jin').ok, '石灯籠を置くと刃が住める');
  const li = R.levelInfo(s); ok(!li.canLevel, '課題が残っているとレベルは上がらない');
  s.res.coin = 99999; ok(!R.levelUp(s).ok, '所持金ではレベルは上がらない');
}

section('キャラクターシート（原型＝公式イラストと公式3Dフィギュア、ゲームの中の姿）');
{
  const SH = require(path.join(ROOT, 'sheet.js'));
  const CH = globalThis.NSL_CHARS;
  const sv = SH.sheetSvg(CH.BY_ID.kohaku, { officialHref: 'x.jpg', figureHref: 'f.jpg', look: ['赤い耳と青い模様の白い狐面'] });
  ok(sv.indexOf('<image href="x.jpg"') >= 0 && sv.indexOf('原型　公式イラスト') >= 0 && sv.indexOf('<image href="f.jpg"') >= 0 && sv.indexOf('原型　公式3Dフィギュア（全身）') >= 0 &&
    sv.indexOf('顔のアップ') >= 0 && sv.indexOf('見た目のポイント') >= 0 && sv.indexOf('ゲームの中の姿') >= 0 && sv.indexOf('かくれる') >= 0, 'シートの主役は原型（公式イラストと公式3Dフィギュア）で、下にゲームの中の姿をのせる');
  ok(CH.CHARS.every(c => { const s = SH.sheetSvg(c, {}); return s.indexOf('NaN') < 0 && s.indexOf('undefined') < 0; }), '39体すべてのシートを描ける');
  const miss = CH.CHARS.filter(c => !fs.existsSync(path.join(ROOT, 'sheets', c.id + '.jpg')) || !fs.existsSync(path.join(ROOT, 'sheets', 'thumb', c.id + '.jpg'))).map(c => c.id);
  eq(miss, [], '39体のキャラクターシート（本体と縮小版）がある');
  const wrong = CH.CHARS.filter(c => JSON.stringify(jpegSize(path.join(ROOT, 'sheets', c.id + '.jpg'))) !== JSON.stringify([SH.W, SH.H])).map(c => c.id);
  eq(wrong, [], 'シートの画像は今の並び（' + SH.W + '×' + SH.H + '）で作り直してある');
}

console.log(`\n結果: ${pass} 件合格 / ${fail} 件不合格`);
process.exit(fail ? 1 : 0);
