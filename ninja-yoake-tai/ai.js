/* ニンジャ夜明け隊 — 仲間の見習い（NPC）の動き（固定ロジック）
 *
 * 生成AIは使わない（ライブ戦闘の制御は固定ロジック・§8）。NPC も人と同じ「入力の意図」を出し、
 * 同じ検証（再使用・距離・素材）を通るので、NPC だけ得をすることはない。
 * 切断中の人の枠も、戻るまではこの動き（結界の近くを守る）で代わりに動く。
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA || require('./data.js');
  var B = D.BAL, MAP = D.MAP;

  var DEFEND = { west: { x: 575, y: 505 }, east: { x: 1025, y: 505 }, center: { x: 800, y: 520 } };
  var UP_PREF = {
    vanguard: ['atk', 'combo', 'cd', 'special', 'swift', 'area', 'tough', 'bind', 'rescue', 'trap'],
    guard: ['special', 'trap', 'bind', 'cd', 'area', 'tough', 'combo', 'rescue', 'swift', 'atk'],
    medic: ['rescue', 'special', 'cd', 'tough', 'area', 'swift', 'bind', 'combo', 'atk', 'trap']
  };

  function think(M, m, dt, H) {
    var ai = m.ai || (m.ai = {});
    var it = { autoAtk: true, mx: 0, my: 0, aim: null };
    var hold = m.kind === 'human' && !m.connected && !m.takeover; // 切断中：結界の近くを守る
    if (m.down) return downed(M, m, H, it);
    if (M.state === 'Result' || M.state === 'Lobby') return it;

    // 1) 予告の中にいたら、まず逃げる（安全地帯へ）。「うっかり」設定では気づかないこともある（勝率のめやす用）
    var esc = escapeDir(M, m, H);
    var cz = ai.casual || 0;
    if (esc && cz) { ai.seen = ai.seen || {}; if (ai.seen[esc.id] == null) ai.seen[esc.id] = M.rnd() > cz * 0.6; if (!ai.seen[esc.id]) esc = null; else if (M.rnd() < cz) esc.urgent = false; }
    // 2) 計画を立て直す（0.25秒ごと）
    ai.t = (ai.t || 0) - dt;
    if (ai.t <= 0 || !ai.plan) { ai.t = 0.25; ai.plan = plan(M, m, H, hold); }
    var p = ai.plan, goal = null;
    if (p) {
      if (p.kind === 'rescue') { goal = rescueGoal(p.who); it.say = 'rescue'; }
      else if (p.kind === 'retreat') { goal = MAP.supply; if (H.dist(m, MAP.supply) < B.supplyRange - 8) it.act = 'potion'; }
      else if (p.kind === 'gather') goal = p.spot;
      else if (p.kind === 'trap') { goal = p.spot; if (H.dist(m, p.spot) < B.trapRange - 10) { it.act = 'trap:' + p.trap; ai.t = 0; } }
      else if (p.kind === 'repair') { goal = { x: M.barrier.x, y: M.barrier.y + M.barrier.r + 40 }; if (H.dist(m, M.barrier) < B.repairRange - 10) it.act = 'repair'; }
      else if (p.kind === 'pick') { it.act = 'pick:' + p.i; ai.t = 0; }
      else if (p.kind === 'fight') goal = fightGoal(M, m, p.e, H);
      else if (p.kind === 'goto') goal = p.at;
      else if (p.kind === 'bomb') { goal = MAP.supply; if (H.dist(m, MAP.supply) < B.supplyRange - 8) { it.act = 'getbomb'; ai.t = 0; } }
    }
    // 3) 技
    useSkills(M, m, H, it, p);
    // 4) 動く
    if (esc) { it.mx = esc.x; it.my = esc.y; if (esc.urgent && m.cd.dodge <= 0) it.dodge = true; }
    else if (goal) {
      var d = H.dist(m, goal), stop = p && (p.kind === 'fight' ? 0 : p.kind === 'rescue' ? B.rescueRange - 14 : p.kind === 'gather' ? B.gatherRadius - 20 : 12);
      if (d > stop) { var v = steer(M, m, goal, H); it.mx = v.x; it.my = v.y; }
    }
    return it;
  }

  // ダウン中：敵から離れる向きにピンを立て、救済時間なら結界へ這う
  function downed(M, m, H, it) {
    var ai = m.ai;
    var e = H.nearestEnemy(M, m, 400);
    if (!m.pin || M.t > (m.pin.until || 0)) {
      var away = e ? H.norm(m.x - e.x, m.y - e.y) : H.norm(M.barrier.x - m.x, M.barrier.y - m.y);
      it.pin = { x: m.x + away.x * 110, y: m.y + away.y * 110 };
    }
    var to = M.grace > 0 ? M.barrier : (e && H.dist(e, m) < 150 ? { x: m.x * 2 - e.x, y: m.y * 2 - e.y } : null);
    if (to) { var d = H.norm(to.x - m.x, to.y - m.y); it.mx = d.x; it.my = d.y; }
    if (!ai.saidDown) { ai.saidDown = true; it.say = 'down'; }
    return it;
  }

  function plan(M, m, H, hold) {
    var ai = m.ai;
    ai.saidDown = false;
    var inPrep = M.state === 'Preparation' || M.state === 'Intermission';
    // 強化を選ぶ
    var of = M.offers[m.id];
    if (inPrep && of && of.picked == null && of.list.length) {
      var pref = UP_PREF[m.role] || UP_PREF.vanguard, bi = 0, bs = 99;
      of.list.forEach(function (u, i) { var s = pref.indexOf(u); if (s >= 0 && s < bs) { bs = s; bi = i; } });
      return { kind: 'pick', i: bi };
    }
    // 助けを求める合図
    var help = M.pings.filter(function (p) { return p.kind === 'help'; })[0];
    // ダウンした味方・里人を助ける（いちばん近い者が行く）
    var downs = M.members.filter(function (x) { return x.down && x !== m; }).map(function (x) { return x; })
      .concat(M.villagers.filter(function (v) { return v.state === 'down'; }));
    if (downs.length) {
      var target = null, bd = 1e9;
      downs.forEach(function (x) {
        var d = H.dist(m, x);
        var mine = M.members.every(function (o) { return o === m || o.down || o.id === (x.id) || H.dist(o, x) >= d - 30 || (o.ai && o.ai.plan && o.ai.plan.kind === 'rescue' && o.ai.plan.who !== x); });
        var priority = help && help.by === x.id ? -400 : 0;
        var waiting = M.t - (x.downAt || 0) > 4; // 4秒たっても誰も来ないなら、だれでも向かう
        if ((mine || priority || waiting) && d + priority < bd) { bd = d + priority; target = x; }
      });
      if (target && !(hold && H.dist(target, M.barrier) > 360)) return { kind: 'rescue', who: target };
    }
    // HP が少ない：補給所へ（素材があれば薬湯）
    if (m.hp < m.maxHp * 0.35 && M.materials >= D.SUPPLY.potion.cost && !(m.jutsu.indexOf('leaf') >= 0 && m.cd.j0 <= 0)) return { kind: 'retreat' };
    // 合図
    if (help && help.by !== m.id) { var hm = H.member(M, help.by); if (hm && !hm.down) return fightNear(M, m, H, hm, 140) || { kind: 'goto', at: { x: hm.x + 30, y: hm.y + 20 } }; }
    var gat = M.pings.filter(function (p) { return p.kind === 'gather'; })[0];
    if (gat && gat.by !== m.id) { var gm = H.member(M, gat.by); if (gm) return fightNear(M, m, H, gm, 120) || { kind: 'goto', at: { x: gm.x - 30, y: gm.y + 24 } }; }
    var dfd = M.pings.filter(function (p) { return p.kind === 'defend'; })[0];
    if (dfd || hold) return fightNear(M, m, H, M.barrier, 220) || { kind: 'goto', at: { x: M.barrier.x + (ai.lane === 'east' ? 70 : -70), y: M.barrier.y - 70 } };

    if (inPrep) {
      var left = M.phaseT;
      if (left > 7) {
        // 先陣がいないチーム：補給所で焙烙玉を受け取る（足りない火力をおぎなう）
        var noVan = !M.members.some(function (o) { return o.role === 'vanguard'; });
        if (noVan && (m.bombs || 0) < 2 && M.materials >= D.SUPPLY.bomb.cost + 3 && M.barrier.hp > M.barrier.max * 0.6) return { kind: 'bomb' };
        // 修理（結界役・救援役が優先。素材を罠のために少し残す）
        if (M.barrier.hp < M.barrier.max * 0.85 && M.materials >= 1 && (m.role !== 'vanguard' || M.barrier.hp < M.barrier.max * 0.6)) return { kind: 'repair' };
        // 罠（自分の道の、あいている置き場）
        var trap = pickTrap(M, m, H);
        if (trap) return trap;
        // 採集（在庫のある、いちばん近い所）
        var g = null, gd = 1e9;
        M.gather.forEach(function (s) { if (s.stock <= 0) return; var d = H.dist(m, s) + (s.id === 'spring' ? 60 : 0); if (d < gd) { gd = d; g = s; } });
        if (g) return { kind: 'gather', spot: g };
      }
      return { kind: 'goto', at: DEFEND[ai.lane] || DEFEND.center };
    }
    // 襲撃中：自分の道 → 結界のまわり → 近くの敵
    var f = fightTarget(M, m, H);
    if (f && (H.dist(f, M.barrier) < 560 || H.dist(f, m) < 160)) return { kind: 'fight', e: f };
    return { kind: 'goto', at: DEFEND[ai.lane] || DEFEND.center };
  }

  function fightNear(M, m, H, c, r) {
    var best = null, bd = 1e9;
    M.enemies.forEach(function (e) { var d = H.dist(e, c); if (d < r && d < bd) { bd = d; best = e; } });
    return best ? { kind: 'fight', e: best } : null;
  }
  // 敵を選ぶ：結界をたたいている敵 → 味方・里人をねらう敵 → 詠唱中の呪符使い → 自分の道の敵 → いちばん近い敵
  function fightTarget(M, m, H) {
    var best = null, bs = -1e9, home = DEFEND[m.ai.lane] || DEFEND.center;
    M.enemies.forEach(function (e) {
      var d = H.dist(m, e), s = -d;
      if (H.dist(e, M.barrier) < M.barrier.r + e.r + 40) s += 420;
      if (e.target && e.target.kind === 'member') s += 160;
      if (e.target && e.target.kind === 'villager') s += 260;
      if (e.type === 'fuda') s += e.tele ? 240 : 120;
      if (H.dist(e, home) < 300) s += 120;
      if (e.boss) s += 60;
      if (H.dist(e, M.barrier) > 540) s -= 320; // 里から遠い敵は追いかけすぎない（守りの位置で待つ）
      if (e.type === 'kasa' && m.role === 'guard') s -= 80;
      if (s > bs) { bs = s; best = e; }
    });
    return best;
  }
  function fightGoal(M, m, e, H) {
    if (!e || e.hp <= 0) return null;
    // からかさは背中へ回る
    if (e.type === 'kasa') return { x: e.x - e.face.x * (e.r + 30), y: e.y - e.face.y * (e.r + 30) };
    if (e.boss) {
      // 大だるま：近づきすぎない（転がり・地ならしに備える）。先陣は近くで、ほかは少し離れる
      var k = H.norm(m.x - e.x, m.y - e.y), keep = m.role === 'vanguard' ? e.r + 40 : e.r + 70;
      return { x: e.x + k.x * keep, y: e.y + k.y * keep };
    }
    var k2 = H.norm(m.x - e.x, m.y - e.y);
    return { x: e.x + k2.x * (e.r + 26), y: e.y + k2.y * (e.r + 26) };
  }
  function rescueGoal(who) {
    if (who.pin && who.pin.until) { // ピンの向きから近づく
      var dx = who.pin.x - who.x, dy = who.pin.y - who.y, l = Math.hypot(dx, dy) || 1;
      return { x: who.x + dx / l * 26, y: who.y + dy / l * 26 };
    }
    return { x: who.x, y: who.y + 24 };
  }
  function pickTrap(M, m, H) {
    // 人の見習いが使う分を残す（素材はチームで共有）。最初の準備は、まず集めてから置く
    var human = M.members.some(function (o) { return o.kind === 'human' && o.connected && !o.takeover; });
    var reserve = (M.barrier.hp < M.barrier.max * 0.9 ? 3 : 1) + (human ? 3 : 0);
    if (human && M.phase && M.phase.id === 'prep1' && M.phaseT > M.phaseLen - 15) return null;
    var cands = M.spots.filter(function (s) { return !M.traps[s.id] && (s.lane === m.ai.lane || M.members.length < 3); });
    if (!cands.length) cands = M.spots.filter(function (s) { return !M.traps[s.id]; });
    if (!cands.length) return null;
    // 結界に近い置き場から（外れにくい）
    cands.sort(function (a, b) { return H.dist(a, M.barrier) - H.dist(b, M.barrier); });
    var s = cands[0];
    var kind = m.role === 'guard' || (s.id.charAt(1) === '2') ? 'bakuchiku' : 'makibishi';
    var cost = function (k) { return Math.max(1, D.TRAPS[k].cost - (m.role === 'guard' ? D.ROLES.guard.trapDiscount : 0) + m.mods.trapCost); };
    if (M.materials < cost(kind) + reserve) kind = 'makibishi';
    if (M.materials < cost(kind) + reserve) return null;
    return { kind: 'trap', spot: s, trap: kind };
  }

  // 予告（赤い範囲）の中にいたら、外へ逃げる向き
  function escapeDir(M, m, H) {
    var out = null;
    M.zones.forEach(function (z) {
      if (z.kind !== 'tele' || out) return;
      if (!H.inTele(z, { x: m.x, y: m.y, r: m.r + 10 })) return;
      var v;
      if (z.shape === 'circle') v = H.norm(m.x - z.x, m.y - z.y);
      else if (z.shape === 'line') { var px = -(z.y2 - z.y), py = z.x2 - z.x, s = (m.x - z.x) * px + (m.y - z.y) * py >= 0 ? 1 : -1; v = H.norm(px * s, py * s); }
      else if (z.shape === 'ring') {
        // いちばん近い安全地帯（すき間）へ。内側の方が近ければ内へ
        var a = Math.atan2(m.y - z.y, m.x - z.x), bestG = z.gaps[0], bd = 9;
        z.gaps.forEach(function (g) { var d = Math.abs(H.angDiff(a, g)); if (d < bd) { bd = d; bestG = g; } });
        var dd = H.dist(m, z);
        if (dd - z.r0 < 40) v = H.norm(z.x - m.x, z.y - m.y);
        else { var tx = z.x + Math.cos(bestG) * dd, ty = z.y + Math.sin(bestG) * dd; v = H.norm(tx - m.x, ty - m.y); }
      } else return;
      if (v.l === 0) v = { x: 1, y: 0 };
      out = { x: v.x, y: v.y, urgent: z.t < 0.4, id: z.src + ':' + Math.round(z.life * 1000) + ':' + Math.round(z.x) };
    });
    return out;
  }
  // 結界石をよけて進む
  function steer(M, m, goal, H) {
    var d = H.norm(goal.x - m.x, goal.y - m.y), b = M.barrier;
    if (H.segDist(m.x, m.y, goal.x, goal.y, b.x, b.y) < b.r + m.r + 8 && H.dist(m, b) > b.r + m.r) {
      var side = (goal.x - m.x) * (b.y - m.y) - (goal.y - m.y) * (b.x - m.x) > 0 ? 1 : -1;
      d = H.norm(d.x + -d.y * side * 1.2, d.y + d.x * side * 1.2);
    }
    return d;
  }

  function countNear(M, p, r, H) { var n = 0; M.enemies.forEach(function (e) { if (H.dist(e, p) <= r + e.r) n++; }); return n; }
  function useSkills(M, m, H, it, p) {
    var fighting = M.state === 'Wave' || M.state === 'Boss' || M.enemies.length > 0;
    if (!fighting) return;
    // 「うっかり」設定：技を思い出すまでに間がある
    var cz = m.ai.casual || 0;
    if (cz) { if (!m.ai.wake || M.t > m.ai.wake + 1) { m.ai.wake = M.t + cz * 2.5 * M.rnd(); } if (M.t < m.ai.wake) return; }
    // 焙烙玉（持っていれば、敵のかたまりへ）
    if (m.bombs > 0 && m.cd.supply <= 0) { var cb = H.bestCluster(M, m, D.SUPPLY.bomb.range, D.SUPPLY.bomb.r); if (cb && cb.n >= 3) { it.act = 'bomb'; it.aim = { x: cb.x, y: cb.y }; return; } }
    // 役割技
    if (m.cd.sp <= 0) {
      if (m.role === 'vanguard') {
        var dir = H.bestLine(M, m, 200), n = 0;
        if (dir) M.enemies.forEach(function (e) { if (H.segDist(m.x, m.y, m.x + dir.x * 200, m.y + dir.y * 200, e.x, e.y) <= 26 + e.r) n++; });
        var fud = M.enemies.filter(function (e) { return e.type === 'fuda' && H.dist(e, m) < 200; })[0];
        if (n >= 2 && dir) { it.sp = true; it.aim = { x: m.x + dir.x * 200, y: m.y + dir.y * 200 }; }
        else if (fud) { it.sp = true; it.aim = { x: fud.x, y: fud.y }; }
      } else if (m.role === 'guard') {
        var dn = M.members.filter(function (x) { return x.down && H.dist(x, m) < 170 && countNear(M, x, 160, H) > 0; })[0];
        var vd = M.villagers.filter(function (v) { return v.state === 'down' && H.dist(v, m) < 170; })[0];
        var hurtAlly = M.members.filter(function (x) { return !x.down && x.hp < x.maxHp * 0.4 && H.dist(x, m) < 170 && countNear(M, x, 90, H) >= 2; })[0];
        if (dn || vd) { var w = dn || vd; it.sp = true; it.aim = { x: w.x, y: w.y }; }
        else if (hurtAlly) { it.sp = true; it.aim = { x: hurtAlly.x, y: hurtAlly.y }; }
        else if (countNear(M, M.barrier, 110, H) >= 4 && H.dist(m, M.barrier) < 170) { it.sp = true; it.aim = { x: M.barrier.x, y: M.barrier.y }; }
      } else if (m.role === 'medic') {
        var low = 0, mid = 0;
        M.members.forEach(function (x) { if (x.down || H.dist(x, m) > 120) return; if (x.hp < x.maxHp * 0.6) low++; if (x.hp < x.maxHp * 0.85) mid++; });
        if (low >= 1 || mid >= 2) it.sp = true;
        else if (M.barrier.hp < M.barrier.max * 0.9 && H.dist(m, M.barrier) < D.ROLES.medic.special.mendRange - 10) it.sp = true;
      }
    }
    // 忍術（1回に使う技は1つ）
    if (it.sp) return;
    for (var s = 0; s < 2; s++) {
      if (m.cd['j' + s] > 0) continue;
      var J = D.JUTSU[m.jutsu[s]], go = false, aim = null;
      if (!J) continue;
      switch (J.id) {
        case 'fire': case 'decoy': case 'thundertrap': {
          var c = H.bestCluster(M, m, J.range, J.r || 80);
          if (c && c.n >= (J.id === 'fire' ? 3 : 3)) { go = true; aim = { x: c.x, y: c.y }; }
          break;
        }
        case 'water': case 'mist': {
          var c2 = H.bestCluster(M, m, J.range, J.r);
          if (c2 && c2.n >= 3) { go = true; aim = { x: c2.x, y: c2.y }; }
          break;
        }
        case 'fireline': { var dl = H.bestLine(M, m, J.len); if (dl) { var k = 0; M.enemies.forEach(function (e) { if (H.segDist(m.x, m.y, m.x + dl.x * J.len, m.y + dl.y * J.len, e.x, e.y) <= J.width / 2 + e.r) k++; }); if (k >= 3) { go = true; aim = { x: m.x + dl.x * J.len, y: m.y + dl.y * J.len }; } } break; }
        case 'wind': {
          var near = countNear(M, m, 110, H);
          var atB = countNear(M, M.barrier, 110, H);
          var tgt = H.nearestEnemy(M, m, 150);
          if (tgt && (near >= 2 || (atB >= 2 && H.dist(m, M.barrier) < 160))) { go = true; aim = { x: tgt.x, y: tgt.y }; }
          break;
        }
        case 'pull': {
          // 罠の上へ集める（誘導 → 罠の連携）
          var bestTrap = null, bn = 1;
          Object.keys(M.traps).forEach(function (id) { var t = M.traps[id]; if (H.dist(t, m) > J.range) return; var n2 = countNear(M, t, J.r, H); if (n2 > bn) { bn = n2; bestTrap = t; } });
          if (bestTrap) { go = true; aim = { x: bestTrap.x, y: bestTrap.y }; }
          else { var c3 = H.bestCluster(M, m, J.range, J.r); if (c3 && c3.n >= 4) { go = true; aim = { x: c3.x, y: c3.y }; } }
          break;
        }
        case 'stone': {
          var t2 = H.nearestEnemy(M, m, 230);
          if (t2 && countNear(M, t2, 110, H) >= 3) { go = true; var kk = H.norm(t2.x - m.x, t2.y - m.y); aim = { x: m.x + kk.x * Math.min(140, H.dist(m, t2) * 0.6), y: m.y + kk.y * Math.min(140, H.dist(m, t2) * 0.6) }; }
          break;
        }
        case 'thunder': {
          var caster = M.enemies.filter(function (e) { return e.type === 'fuda' && e.tele && H.dist(e, m) < J.range; })[0];
          if (caster) { go = true; aim = { x: caster.x, y: caster.y }; }
          else if (countNear(M, m, J.range, H) >= 2) go = true;
          break;
        }
        case 'leaf': case 'guardleaf': {
          var need = 0;
          M.members.forEach(function (x) { if (!x.down && H.dist(x, m) <= J.r && x.hp < x.maxHp * (J.id === 'leaf' ? 0.7 : 0.8)) need++; });
          if (need >= 1 && (J.id === 'leaf' || countNear(M, m, 140, H) >= 2)) go = true;
          break;
        }
      }
      if (go) { it['j' + s] = true; if (aim) it.aim = aim; break; }
    }
  }

  var api = { think: think, DEFEND: DEFEND };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_AI = api;
})(typeof window !== 'undefined' ? window : globalThis);
