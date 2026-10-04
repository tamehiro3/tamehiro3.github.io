// 判定のテスト（状態・戦闘・イベント・フィールド）。ブラウザなしで動く。設計書 §13 の 3〜5 にあたる。
//   node ninja-yoake-tai/tools/test_core.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('./load.cjs');
const ST = G.NYT_STATE, BT = G.NYT_BATTLE, SC = G.NYT_SCRIPT, FD = G.NYT_FIELD, BS = G.NYT_BASE, IT = G.NYT_ITEMS, CH = G.NYT_CHARS;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  NG: ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '  (' + JSON.stringify(a) + ' != ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('■ ' + t); }
const clone = o => JSON.parse(JSON.stringify(o));
function party(ids, lv) {
  const S = ST.fresh('テスト');
  ids.forEach(id => { if (id !== 'hero') ST.addMember(S, id, lv); });
  S.order.forEach(id => { S.members[id].lv = lv; });
  ST.healAll(S);
  return S;
}
const evs = (B, t, f) => B.ev.filter(e => e.t === t && (!f || f(e)));
const unitOf = (B, id) => B.units.find(u => u.id === id);

// ---------------- 状態 ----------------
section('状態（仲間・道具・お金・保存）');
{
  const S = ST.fresh('ながいながいなまえです', { set: 'kurenai', hair: 'bob' });
  eq(S.name.length <= 8, true, '名前は8文字まで');
  eq(S.order, ['hero'], 'はじめは主人公だけ');
  ok(S.items.kizugusuri === 3 && S.gold === 50, 'はじめの傷薬3つ・50両');
  const m = ST.addMember(S, 'sakuya', 1);
  ok(m.hp > 0 && m.hp === ST.stats(S, 'sakuya').hp, '加入した仲間はHP満タン');
  eq(ST.addMember(S, 'sakuya', 9), m, '同じ仲間は2度加わらない');
  S.members.hero.lv = 10; S.members.sakuya.lv = 12;
  const r = ST.recruit(S, 'oen');
  eq(r.lv, 10, '途中で加わる仲間は、前の仲間の平均−1のレベル（加入の最低レベル以上）');
  eq(ST.recruit(S, 'oen').already, true, '加入ずみなら already');
  ['xiaolan', 'uka', 'oto', 'izuna', 'nemu'].forEach(id => ST.addMember(S, id, 1));
  ST.swapOrder(S, 0, 6);
  ok(S.order.indexOf('hero') < 4, '主人公はいつも前の4人にいる');
  eq(ST.active(S).length, 4, '前は4人'); eq(ST.standby(S).length, 4, '控えは4人');
  ST.addGold(S, -9999); eq(S.gold, 0, 'お金は負にならない');
  ST.addItem(S, 'kizugusuri', -10); eq(S.items.kizugusuri, undefined, '道具の数は負にならない（0で消える）');
  ok(!ST.spend(S, 1), '足りなければ払えない');
  // お守り：持っている数より多くはつけられない
  ST.addItem(S, 'chikara', 1);
  ok(ST.equipCharm(S, 'hero', 0, 'chikara'), 'お守りをつける');
  ok(!ST.equipCharm(S, 'sakuya', 0, 'chikara'), '空きがないお守りはつけられない');
  eq(ST.stats(S, 'hero').atk, BS.statAt('all', null, 'atk', 10) + 6, '力の守りで攻撃+6');
  // 鍛冶
  S.gold = 100; ST.addItem(S, 'tamahagane', 1);
  ok(ST.forge(S, 'hero') && S.members.hero.wlv === 2 && S.gold === 0 && !S.mats.tamahagane, '鍛冶：100両と玉鋼1で武器Lv2');
  ok(!ST.forge(S, 'hero'), 'お金と玉鋼が足りなければ鍛えられない');
  // 経験値とレベル
  const before = ST.skillsOf(S, 'sakuya').length;
  const ups = ST.gainExp(S, 20000);
  ok(ups.length > 0 && S.members.sakuya.lv > 12, '経験値でレベルが上がる');
  ok(ST.skillsOf(S, 'sakuya').length > before, 'レベルで新しい忍術を覚える');
  ok(S.order.every(id => S.members[id].lv <= BS.MAX_LV), 'レベルは最大50');
  // 保存と読みこみ
  const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  S.map = { id: 'iga', x: 5, y: 6, dir: 'left' }; S.flags.ch1_clear = 1; S.opened['koka:c1'] = 1; ST.dexWeak(S, 'koro', 'sha');
  ok(ST.save(S), '保存できる');
  const L = ST.load();
  eq([L.map, L.flags.ch1_clear, L.opened['koka:c1'], L.dex.koro.weak.sha, L.order, L.members.sakuya.lv], [S.map, 1, 1, 1, S.order, S.members.sakuya.lv], '読みこむと場所・旗・宝箱・図鑑・仲間が元に戻る');
  mem[ST.KEY] = '{"v":1,"members":{},"order":[]}';
  eq(ST.load(), null, 'こわれた記録は読みこまない');
  mem[ST.KEY] = JSON.stringify(Object.assign(clone(S), { gold: -50, items: { kizugusuri: -3, kunai: 2 } }));
  const V = ST.load();
  ok(V.gold === 0 && !V.items.kizugusuri && V.items.kunai === 2, '読みこむとき、お金と道具の数を直す');
  delete globalThis.localStorage;
}

// ---------------- 戦闘 ----------------
section('戦闘（弱点・構え・崩し・印・絆・控え・腕だめし・変身・再現性）');
{
  const S = party(['hero', 'sakuya', 'oen', 'xiaolan'], 10);
  const B = BT.create(S, { enemies: ['koro'], seed: 5 });
  const sa = unitOf(B, 'sakuya'), e = B.units.find(u => u.side === 'e');
  e.mhp = e.hp = 99999;
  eq(e.shield, 2, 'ころ玉の構えは2');
  BT.act(B, sa, { cmd: 'attack', target: e.uid, boost: 0 });
  const h = evs(B, 'hit', x => x.u === sa.uid)[0];
  ok(h && h.weak === 1 && h.ty === 'sha', '咲耶のこうげき（射）はころ玉の弱点');
  eq(e.shield, 1, '弱点で構えが1減る');
  ok(evs(B, 'reveal', x => x.ty === 'sha').length === 1 && S.dex.koro.weak.sha === 1, '当てた弱点は見破られ、図鑑に残る');
  const hero = unitOf(B, 'hero');
  hero.bp = 3;
  const hp0 = e.hp;
  BT.act(B, hero, { cmd: 'attack', target: e.uid, boost: 0 });
  ok(e.hp < hp0 && e.shield === 1, '弱点でない型は、構えを減らさない');
  BT.act(B, sa, { cmd: 'attack', target: e.uid, boost: 0 });
  if (!e.ko) {
    eq(e.shield, 0, '構え0');
    ok(evs(B, 'break').length === 1 && BT.isBroken(B, e), '構え0で「崩し」');
  } else ok(true, '（たおれた）');
}
{
  // 崩れた相手には1.6倍・番がとぶ
  const S = party(['hero', 'sakuya'], 30);
  const B = BT.create(S, { enemies: ['ponpoko'], seed: 9 });
  const sa = unitOf(B, 'sakuya'), e = B.units.find(u => u.side === 'e');
  e.shield = 1; e.weak = ['sha'];
  BT.act(B, sa, { cmd: 'attack', target: e.uid, boost: 0 });
  ok(BT.isBroken(B, e) && e.brokenUntil === B.round + 1, '崩れは今と次のラウンドまで');
  // 同じ攻撃のダメージを、崩れの前後でくらべる（乱数を固定）
  const dmg = (broken) => { const B2 = BT.create(clone(S), { enemies: ['ponpoko'], seed: 3 }); const s2 = unitOf(B2, 'hero'), e2 = B2.units.find(u => u.side === 'e'); e2.weak = []; if (broken) e2.brokenUntil = 5; BT.act(B2, s2, { cmd: 'attack', target: e2.uid, boost: 0 }); return evs(B2, 'hit', x => x.u === s2.uid)[0].dmg; };
  const d0 = dmg(false), d1 = dmg(true);
  ok(Math.abs(d1 / d0 - BS.RULE.breakMul) < 0.05, '崩れた相手へのダメージは1.6倍（' + d0 + '→' + d1 + '）');
  // 印：こうげきの回数がふえる
  const hero = unitOf(B, 'hero'); hero.bp = 3;
  const n0 = evs(B, 'hit', x => x.u === hero.uid).length;
  BT.act(B, hero, { cmd: 'attack', target: e.uid, boost: 2 });
  eq(evs(B, 'hit', x => x.u === hero.uid).length - n0, 3, '印2つで、こうげき3回');
  eq(hero.bp, 1, '使った印はへる');
  ok(BT.act(B, hero, { cmd: 'attack', target: e.uid, boost: 3 }).error, '持っていない印は使えない');
  // 術の印：威力
  const sk = BT.skillDef('h_hi');
  ok(sk && BS.RULE.skillBoost[2] > BS.RULE.skillBoost[1], '術の印は威力が上がる');
  // 防御：印+1・ダメージ半分
  hero.bp = 1; BT.act(B, hero, { cmd: 'guard' });
  ok(hero.guard && hero.bp === 2, '防御で印+1');
  // 絆技
  B.kz = 100;
  const before = B.ev.length;
  const r = BT.act(B, sa, { cmd: 'kizuna', id: 'sougakari', target: e.uid });
  ok(!r.error && B.ev.slice(before).some(x => x.t === 'kz' && x.v === 0) && B.kz < 100, '絆ゲージがいっぱいなら総がかり（ゲージは0から）');
  ok(B.ev.slice(before).filter(x => x.t === 'hit').length >= 2, '総がかりは前の仲間が1回ずつ攻撃');
  ok(BT.act(B, sa, { cmd: 'kizuna', id: 'sougakari' }).error, 'ゲージがなければ絆技は使えない');
  ok(BT.canUse(B, sa, { cmd: 'flee' }) === null, '雑魚戦なら逃げられる');
  const B3 = BT.create(clone(S), { enemies: ['ponpoko'], noFlee: true });
  ok(BT.canUse(B3, unitOf(B3, 'hero'), { cmd: 'flee' }), 'ボス戦では逃げられない');
}
{
  // 印は番ごとに+1。使った次の番は増えない
  const S = party(['hero'], 50);
  const B = BT.create(S, { enemies: ['yogarasu'], seed: 2 });
  const log = [];
  let boosted = false, guard = 0;
  for (let i = 0; i < 40 && !B.result && log.length < 3; i++) {
    const u = BT.nextActor(B); if (!u) break;
    if (u.side === 'e') { BT.enemyAct(B, u); continue; }
    log.push(u.bp);
    if (!boosted) { BT.act(B, u, { cmd: 'attack', boost: 1 }); boosted = true; } else BT.act(B, u, { cmd: 'guard' });
  }
  eq(log.slice(0, 3), [2, 1, 3], '印：番のはじめに+1、使った次の番は+0、防御で+1');
}
{
  // 控えのかけつけは1度だけ
  const S = party(['hero', 'sakuya', 'oen', 'xiaolan', 'uka', 'oto'], 3);
  S.order.slice(0, 4).forEach(id => { S.members[id].hp = 1; });
  const B = BT.create(S, { enemies: ['yogarasu'], seed: 4 });
  BT.runAuto(B, 400);
  eq(evs(B, 'standby').length, 1, '前が全員倒れたら、控えが1度だけかけつける');
  eq(B.result, 'lose', 'かけつけたあと全員倒れたら負け');
  const out = BT.finish(B);
  ok(out.exp === 0 && S.members.hero.hp === 0, '負けたら経験値なし');
}
{
  // 腕だめし：相手のHPが3割で勝負あり
  const S = party(['hero', 'sakuya', 'oen', 'xiaolan'], 15);
  const B = BT.create(S, { enemies: ['d_konga'], seed: 8 });
  const e = B.units.find(u => u.side === 'e');
  BT.runAuto(B, 600);
  ok(B.result === 'win' && !e.ko && e.hp >= Math.ceil(e.mhp * 0.3) - 1, '腕だめしは倒さずに「勝負あり」');
  const out = BT.finish(B);
  ok(out.exp > 0, '勝負ありでも経験値がもらえる');
}
{
  // 最後のボス：変身・仲間の回復・主人公が暁の術を覚える
  const S = party(['hero', 'sakuya', 'oen', 'xiaolan'], 40);
  const B = BT.create(S, { enemies: ['yogarasu'], seed: 6 });
  const e = B.units.find(u => u.side === 'e'), hero = unitOf(B, 'hero');
  e.hp = 1;
  BT.act(B, hero, { cmd: 'attack', target: e.uid });
  ok(evs(B, 'transform', x => x.into === 'yogarasu2').length === 1 && !e.ko && e.eid === 'yogarasu2', '夜鴉は倒れると姿を変える');
  ok((S.learned.hero || []).indexOf('h_ak5') >= 0 && hero.skills.indexOf('h_ak5') >= 0, '変身のとき、主人公が暁の術を覚える');
  ok(B.units.filter(u => u.side === 'p' && !u.bench).every(u => u.bp === BS.RULE.bpMax), '仲間の印が満タンになる');
}
{
  // 同じ種なら同じ結果
  const S = party(['hero', 'sakuya', 'oen', 'xiaolan'], 12);
  const run = () => { const B = BT.create(clone(S), { enemies: ['kodama', 'karakasa', 'bakekitsune'], seed: 1234 }); BT.runAuto(B, 3000); return [B.result, B.round, B.ev.length, B.units.map(u => u.hp)]; };
  eq(run(), run(), '同じ乱数の種なら、戦闘の結果が同じ');
  // 勝つとお金・経験値・図鑑
  const S2 = clone(S), B = BT.create(S2, { enemies: ['koro', 'koro'], seed: 3 });
  BT.runAuto(B, 3000);
  const out = BT.finish(B);
  ok(B.result === 'win' && out.exp > 0 && out.gold > 0 && S2.dex.koro.won === 2, '勝つと経験値・両・図鑑の倒した数');
  ok(S2.order.every(id => S2.members[id].hp >= 1), '勝ったあと、倒れた仲間はHP1で起きる');
}
{
  // おまかせ：どの仲間・どの章でも、命令がエラーにならない
  let errs = 0;
  for (const id of CH.ORDER) {
    const S = party(['hero', id], 30);
    const B = BT.create(S, { enemies: ['kagezamurai', 'onibi'], seed: 77 });
    for (let i = 0; i < 300 && !B.result; i++) {
      const u = BT.nextActor(B); if (!u) break;
      if (u.side === 'e') BT.enemyAct(B, u);
      else { const r = BT.act(B, u, BT.auto(B, u)); if (r.error) { errs++; BT.act(B, u, { cmd: 'guard' }); } }
    }
  }
  eq(errs, 0, '39人それぞれの「おまかせ」の命令が正しい');
}

// ---------------- イベント ----------------
section('イベント（分かれ道・えらぶ・戦いの勝ち負け・加入・かけら）');
{
  const S = ST.fresh('テスト');
  const calls = [];
  const host = {
    S, say: (w, t, done) => { calls.push('say'); done(); }, ask: (w, q, o, done) => done(1),
    battle: (o, done) => { calls.push('battle'); done(o.enemies[0] === 'koro' ? 'lose' : 'win'); },
    join: (id, lv, done) => { calls.push('join:' + id); done(); }, got: (i, n, done) => done(), fragment: (n, sk, done) => { calls.push('frag' + n); done(); },
    refresh() { }, title: (t, s, done) => done()
  };
  const R = SC.create(host, [
    { set: 'a' }, { if: 'a', go: 'L' }, { set: 'bad' }, { lbl: 'L' },
    { ask: 'どっち？', opts: ['P', 'Q'], go: ['P', 'Q'] }, { lbl: 'P' }, { set: 'p' }, { end: 1 }, { lbl: 'Q' }, { set: 'q' },
    { battle: ['koro'], lose: 'continue', loseGo: 'lost' }, { set: 'won' }, { end: 1 },
    { lbl: 'lost' }, { set: 'lost' }, { join: 'oen' }, { give: 'kunai', n: 2 }, { gold: 30 }, { frag: 1 }
  ], { name: 'test' });
  SC.run(R);
  ok(R.done, 'イベントが最後まで進む');
  ok(S.flags.a && !S.flags.bad && S.flags.q && !S.flags.p, 'if/go と、えらんだ答えで分かれる');
  ok(S.flags.lost && !S.flags.won, '戦いに負けたら loseGo へ');
  ok(S.members.oen && calls.indexOf('join:oen') >= 0, '加入');
  ok(S.items.kunai === 2 && S.gold === 80, '道具とお金をもらう');
  ok(S.frag === 1 && S.keys.kane === 1 && (S.learned.hero || []).indexOf('h_ak1') >= 0, 'かけらを取り戻すと、主人公が暁の術を覚える');
  // 同じ命令の並びを2回使っても、元の並びは変わらない（ask/battle の分かれ道）
  const cmds = [{ ask: '?', opts: ['a', 'b'], go: ['x', 'y'] }, { lbl: 'x' }, { set: 'x' }, { end: 1 }, { lbl: 'y' }, { set: 'y' }];
  const snap = JSON.stringify(cmds);
  SC.run(SC.create(host, cmds)); SC.run(SC.create(host, cmds));
  eq(JSON.stringify(cmds), snap, 'イベントの命令の並びは書きかわらない');
  let threw = false; try { SC.run(SC.create(host, [{ go: 'nowhere' }])); } catch (e) { threw = true; }
  ok(threw, 'ないラベルへの go はエラーにする');
}

// ---------------- フィールド ----------------
section('フィールド（条件・歩ける場所・道さがし・障害物）');
{
  const S = ST.fresh('テスト');
  ST.addMember(S, 'xiaolan', 5);
  ok(FD.cond(S, 'has:xiaolan&!has:oen&item:kizugusuri>=3&frag>=0'), '条件：has・否定・道具の数・かけら');
  ok(!FD.cond(S, 'item:kizugusuri>=4') && !FD.cond(S, 'ability:hawk') && FD.cond(S, 'ability:push'), '条件：探索の術');
  const F = FD.load(S, 'koka');
  ok(FD.path(F, 15, 9, 14, 19) !== null, '甲賀の里：社から南の出口まで道がある');
  ok(!FD.walkable(F, 15, 6), '人のいるマスは歩けない');
  // 稲荷の洞：大岩を押して穴を埋める
  const I = FD.load(S, 'inari');
  const b1 = I.objs.find(o => o.id === 'b1' && o.k === 'obst');
  const r1 = FD.useObstacle(S, I, b1, b1.x, b1.y + 1);
  ok(r1 && r1.ok && r1.moved, '大岩を押すと1マス動く');
  const r2 = FD.useObstacle(S, I, b1, b1.x, b1.y + 1);
  ok(r2 && r2.ok && r2.filled, '穴に落ちると埋まって道になる');
  const I2 = FD.load(S, 'inari');
  eq(I2.objs.find(o => o.id === 'b1' && o.k === 'obst').on, false, '動かした大岩は、地図に入りなおしても元に戻らない');
  // 霧：まとまり（grp）ごと晴れる
  const S2 = ST.fresh('テスト');
  const sh = FD.load(S2, 'shiokaze');
  const fog = sh.objs.find(o => o.k === 'obst' && o.kind === 'fog' && o.grp);
  const need = FD.useObstacle(S2, sh, fog, fog.x - 1, fog.y);
  ok(need && !need.ok && need.need === 'wind', '風太がいないと霧は晴らせない');
  ST.addMember(S2, 'fuuta', 15);
  FD.useObstacle(S2, sh, fog, fog.x - 1, fog.y);
  ok(sh.objs.filter(o => o.k === 'obst' && o.grp === fog.grp).every(o => !o.on), '霧はまとまりごと晴れる');
  // 踏むイベントは once なら1度だけ
  const S3 = ST.fresh('テスト');
  const kf = FD.load(S3, 'kitsunebi');
  const st = kf.objs.find(o => o.k === 'step' && o.once);
  ok(FD.stepAt(S3, kf, st.x, st.y).length === 1, '踏むと始まる出来事');
  S3.flags['step_' + st.key] = 1;
  ok(FD.stepAt(S3, kf, st.x, st.y).length === 0, 'once の出来事は2度目は起きない');
  // 妖怪のシンボル：強くなると逃げる
  const S4 = ST.fresh('テスト'); S4.members.hero.lv = 40;
  const k2 = FD.load(S4, 'kitsunebi'); FD.spawnEnemies(S4, k2, BS.rng(1));
  const en = k2.objs.find(o => o.k === 'enemy' && o.on);
  const d0 = Math.abs(en.x - (en.x + 2)) + 0;
  const px = en.x + 2, py = en.y;
  const before = Math.abs(en.x - px) + Math.abs(en.y - py);
  FD.enemyStep(S4, k2, en, px, py, BS.rng(2));
  ok(Math.abs(en.x - px) + Math.abs(en.y - py) >= before || d0 === 0, 'レベルが高いと、妖怪は近づいてこない');
}

console.log(`\n結果: ${pass} 件合格 / ${fail} 件不合格`);
process.exit(fail ? 1 : 0);
