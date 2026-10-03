// 試験用の自動の見習い（修行が最後まで通るか・数値のつりあいを見るため）。ゲームでは使わない。
// const { runTraining } = require('./bot.js');  runTraining(cfg, { teach })
'use strict';
const path = require('path');
const ROOT = path.dirname(__dirname);
global.NAD_DATA = require(path.join(ROOT, 'data.js'));
global.NAD_POLICY = require(path.join(ROOT, 'policy.js'));
global.NinjaArt = require(path.join(ROOT, 'art.js'));
global.NAD_CHARS = require(path.join(ROOT, 'chars.js'));
try { global.NAD_LINES = require(path.join(ROOT, 'lines.js')); } catch (e) { global.NAD_LINES = {}; }
const S = require(path.join(ROOT, 'sim.js'));
const P = global.NAD_POLICY;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// 見習いの動き：へとへとの相棒・仲間を助ける → 近いからくりに向かう → 大技をよける → 次の門へ
function botInput(st, opt) {
  const pl = st.player, pa = st.partner;
  const inp = { mx: 0, my: 0, dodge: false, cmd: null };
  if (pl.down) return inp;
  let goal = null;
  // 大技の輪の中なら外へ
  for (const e of st.enemies) {
    if (e.hp > 0 && e.tele > 0 && dist(e, pl) < 2.6) { const u = { x: pl.x - e.x, y: pl.y - e.y }; const d = Math.hypot(u.x, u.y) || 1; inp.mx = u.x / d; inp.my = u.y / d; inp.dodge = true; return inp; }
  }
  if (pa.down) goal = pa;
  if (!goal && opt.lazy !== true) {
    // 相棒が行っていない仲間
    const target = st.allies.filter(a => a.state === 'down' && !(pa.dec && pa.dec.target === a.id)).sort((a, b) => dist(a, pl) - dist(b, pl))[0];
    const act = st.enemies.filter(e => e.hp > 0 && (e.active || e.dummy) && dist(e, pl) < 7).sort((a, b) => dist(a, pl) - dist(b, pl))[0];
    if (act) goal = act;
    else if (target && (opt.helpAllies !== false)) goal = target;
  }
  if (!goal && opt.searchAll) {
    const s = st.spots.filter(s => !s.opened && S.zoneIdx(st, s.y) === S.zoneIdx(st, pl.y)).sort((a, b) => dist(a, pl) - dist(b, pl))[0];
    if (s) goal = s;
    // 巻物が足りなければ、開いている場所の取り残しを探しにもどる
    const ob = S.objective(st);
    if (!goal && (st.kind === 'explore' || st.kind === 'exam') && !ob.done && ob.n < (ob.need || 0) + 1) {
      const any = st.spots.filter(s => !s.opened && (st.zones[s.zone].open || S.zoneIdx(st, s.y) === S.zoneIdx(st, pl.y) || st.zones[s.zone].entered)).sort((a, b) => dist(a, pl) - dist(b, pl))[0];
      if (any && st.kind === 'explore') goal = any;
    }
  }
  const es = st.escort;
  if (!goal && es && es.state !== 'arrived' && es.state !== 'hidden' && es.state !== 'turned') {
    if (es.threat && dist(es, pl) > 2) goal = es;
    else if (!es.blocked && dist(es, pl) > 3.5) goal = es;                 // 迎えに行く
    else if (es.blocked) {                                               // 止まっている理由を片づける
      const zE = S.zoneIdx(st, es.y);
      const z = st.zones.find((zz, i) => i >= Math.max(0, zE) && !zz.cleared);
      if (z) { const left = st.enemies.filter(e => e.zone === z.i && e.hp > 0).sort((a, b) => dist(a, pl) - dist(b, pl))[0] || st.allies.filter(a => a.zone === z.i && a.state === 'down')[0]; if (left) goal = left; }
    }
  }
  if (!goal) {
    // 次の閉じた門の手前か、ゴールへ
    const zi = S.zoneIdx(st, pl.y);
    const z = st.zones[Math.min(zi, st.zones.length - 1)];
    if (z && zi >= 0 && zi < st.zones.length) {
      if (!z.cleared) {
        // まだ片づいていない：場所の中央あたりで待つ（相棒の行動を見る）
        goal = { x: 5.5, y: z.y0 + z.h * 0.55 };
        // 残りの仲間・からくりへ
        const left = st.allies.filter(a => a.zone === z.i && a.state === 'down')[0] || st.enemies.filter(e => e.zone === z.i && e.hp > 0)[0];
        if (left && (st.t % 20 > 6 || st.escort)) goal = left;
      } else goal = { x: 5.5, y: z.y0 - 1.5 };
    } else if (zi < 0) goal = { x: 5.5, y: st.zones[0].y1 - 1.5 };
    else goal = { x: 5.5, y: 0.8 };
  }
  const d = dist(goal, pl);
  if (d > 0.7) {
    // かんたんな経路
    const p = S.astar(st, pl.x | 0, pl.y | 0, goal.x | 0, goal.y | 0, null);
    let tx = goal.x, ty = goal.y;
    if (p && p.cells.length > 1) { const c = p.cells[0]; tx = (c % st.W) + 0.5; ty = ((c / st.W) | 0) + 0.5; }
    const u = { x: tx - pl.x, y: ty - pl.y }; const n = Math.hypot(u.x, u.y) || 1;
    inp.mx = u.x / n; inp.my = u.y / n;
  }
  return inp;
}

function runTraining(cfg, opt) {
  opt = opt || {};
  const st = S.build(cfg);
  const dt = 1 / 30;
  let steps = 0, reviewDone = false;
  const signals = [];
  while (!st.done && steps < 30 * 60 * 12) {
    const inp = botInput(st, opt);
    if (opt.cmdAt && opt.cmdAt[steps]) inp.cmd = opt.cmdAt[steps];
    // 最初の修行：木人を止めたら「集合」をためす
    if (st.kind === 'tutorial' && !st.usedCmd && st.enemies.some(e => e.dummy && e.hp <= 0)) inp.cmd = 'gather';
    S.step(st, dt, inp);
    for (const s of st.signals) {
      signals.push(s.type);
      if (s.type === 'goalShort') S.finishNow(st);
      if (s.type === 'clear' && s.tutorialReview && !reviewDone && opt.teach) {
        reviewDone = true;
        const ev = st.lessons[st.lessons.length - 1];
        const opts = P.teachOptions(ev, ['ally_first', 'stay_close']);
        const pick = opts.find(o => o.id === opt.teach) || opts[0];
        const res = P.applyTeaching(st.policy, [{ option: pick, withRule: !!opt.withRule }], { source: 'review' });
        S.setPolicy(st, res.policy);
      }
    }
    st.signals.length = 0;
    steps++;
  }
  if (!st.done) S.quit(st);
  return { st, result: st.result, signals };
}

module.exports = { runTraining, botInput, S, P };
