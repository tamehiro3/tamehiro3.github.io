/* ニンジャからくり工房 — 試験の物理（60コマ/秒の固定ステップ）
 *
 * 画面に依存しない。同じ試験データと同じ入力なら、どの端末でも同じ結果になる（三角関数は使わない）。
 * 作者クリアの入力記録をこれで再生して、本当にクリアできるかを確かめられる（サーバーへ移しても同じ判定）。
 *
 * 座標はマス単位。x は右へ、y は上へ（y=0 がいちばん下の段）。見習いの位置 (px, py) は足もとの中央。
 * 入力は1コマごとのビット：1=左 2=右 4=ジャンプ（押している間） 8=術（押したコマ）
 * 移動足場と罠は「何コマ目か」だけで位置と状態が決まる（状態を持たない）。
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var P = D.PHYS, GW = D.GRID.W, GH = D.GRID.H;
  var EPS = 1e-6, HW = P.w / 2, PH = P.h, DT = P.dt;
  var IN = { L: 1, R: 2, J: 4, T: 8 };

  /* ---------- 試験データ → 物理の世界 ---------- */
  function createWorld(level) {
    var w = {
      level: level, solid: new Uint8Array(GW * GH), movers: [], traps: [], doors: [], switches: [], waters: [], pits: [],
      refills: [], checks: [], start: null, goal: null, doorIndex: {}, switchIndex: {}
    };
    var parts = level.parts || [];
    var i, p, k;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      switch (p.part_id) {
        case 'floor':
          for (k = 0; k < p.len; k++) {
            var fx = p.dir === 'v' ? p.x : p.x + k, fy = p.dir === 'v' ? p.y + k : p.y;
            if (fx >= 0 && fx < GW && fy >= 0 && fy < GH) w.solid[fy * GW + fx] = 1;
          }
          break;
        case 'mover': {
          var dx = p.x2 - p.x, dy = p.y2 - p.y, dist = Math.sqrt(dx * dx + dy * dy);
          var travel = Math.max(1, Math.round(dist / P.moverSpeed[p.speed] * 60));
          w.movers.push({ id: p.id, x: p.x, y: p.y, x2: p.x2, y2: p.y2, speed: p.speed, travel: travel, dwell: P.moverDwell, period: 2 * (travel + P.moverDwell) });
          break;
        }
        case 'trap': w.traps.push({ id: p.id, x: p.x, y: p.y, rate: p.rate, dir: p.dir || 'up', cycle: P.trapCycle[p.rate] }); break;
        case 'door': w.doorIndex[p.id] = w.doors.length; w.doors.push({ id: p.id, x: p.x, y: p.y, color: p.color, sw: 0 }); break;
        case 'switch': w.switchIndex[p.id] = w.switches.length; w.switches.push({ id: p.id, x: p.x, y: p.y, door: -1 }); break;
        case 'water': w.waters.push({ x: p.x, y: p.y, len: p.len }); break;
        case 'pit': w.pits.push({ x: p.x, y: p.y, len: p.len }); break;
        case 'refill': w.refills.push({ id: p.id, x: p.x, y: p.y, count: p.count }); break;
        case 'check': w.checks.push({ id: p.id, x: p.x, y: p.y }); break;
        case 'start': w.start = { x: p.x, y: p.y }; break;
        case 'goal': w.goal = { x: p.x, y: p.y }; break;
      }
    }
    // スイッチ → 扉（扉ごとに、開けられるスイッチのビット）
    (level.connections || []).forEach(function (c) {
      var si = w.switchIndex[c.from], di = w.doorIndex[c.to];
      if (si == null || di == null) return;
      w.switches[si].door = di;
      w.doors[di].sw |= (1 << si);
    });
    if (!w.start) w.start = { x: 0, y: 0 };
    // 動く物の箱（前のコマ・いまのコマ）を先に用意しておく（毎コマ作らない）
    w.bp = mkBoxes(w); w.bn = mkBoxes(w);
    return w;
  }
  function mkBoxes(w) {
    var a = [], i;
    for (i = 0; i < w.doors.length; i++) a.push({ k: 1, i: i, on: true, x0: 0, y0: 0, x1: 0, y1: 0 });
    for (i = 0; i < w.movers.length; i++) a.push({ k: 2, i: i, on: true, x0: 0, y0: 0, x1: 0, y1: 0 });
    return a;
  }

  /* ---------- 時間で決まる仕掛け ---------- */
  function moverU(m, f) {
    var t = f % m.period;
    if (t < m.dwell) return 0;
    if (t < m.dwell + m.travel) return (t - m.dwell) / m.travel;
    if (t < 2 * m.dwell + m.travel) return 1;
    return 1 - (t - 2 * m.dwell - m.travel) / m.travel;
  }
  function moverPos(m, f, out) {
    var u = moverU(m, f);
    out = out || {};
    out.x = m.x + (m.x2 - m.x) * u; out.y = m.y + (m.y2 - m.y) * u;
    return out;
  }
  // 0=引っこんでいる 1=光って知らせる 2=トゲが出ている
  function trapPhase(t, f) {
    var ph = f % t.cycle;
    if (ph >= t.cycle - P.trapActive) return 2;
    if (ph >= t.cycle - P.trapActive - P.trapWarn) return 1;
    return 0;
  }
  function fillBoxes(w, sw, f, a) {
    var nd = w.doors.length, i, b, d, m, u;
    for (i = 0; i < nd; i++) { b = a[i]; d = w.doors[i]; b.on = !(d.sw & sw); b.x0 = d.x; b.y0 = d.y; b.x1 = d.x + 1; b.y1 = d.y + 2; }
    for (i = 0; i < w.movers.length; i++) {
      b = a[nd + i]; m = w.movers[i]; u = moverU(m, f);
      b.x0 = m.x + (m.x2 - m.x) * u; b.y0 = m.y + (m.y2 - m.y) * u; b.x1 = b.x0 + P.moverW; b.y1 = b.y0 + 1;
    }
    return a;
  }

  /* ---------- 状態（数だけ。複製が安い） ---------- */
  function initState(w) {
    return {
      f: 0, px: w.start.x + 0.5, py: w.start.y, vx: 0, vy: 0, face: 1,
      ground: 0,       // 0=空中 1=足場 2=移動足場 3=水面（術）
      gm: -1,          // 乗っている移動足場の番号
      coyote: 0, buf: 0, held: 0, rising: 0,
      charges: 0, jt: 0, sw: 0,
      cpx: w.start.x, cpy: w.start.y, cpc: 0, cpi: -1, cpMask: 0,
      status: 0,       // 0=挑戦中 1=失敗して止まっている 2=合格 3=時間切れ
      dt: 0, deaths: 0, jumps: 0
    };
  }
  function cloneState(s) { var o = {}; for (var k in s) o[k] = s[k]; return o; }

  /* ---------- 当たり判定 ---------- */
  function solidAt(w, cx, cy) {
    if (cx < 0 || cx >= GW || cy >= GH) return true;   // 左右のかべと天井
    if (cy < 0) return false;                          // 下は抜けている（落ちる）
    return w.solid[cy * GW + cx] === 1;
  }
  function boxHitsTiles(w, x0, y0, x1, y1) {
    var cx0 = Math.floor(x0), cx1 = Math.floor(x1), cy0 = Math.floor(y0), cy1 = Math.floor(y1);
    for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) if (solidAt(w, cx, cy)) return true;
    return false;
  }
  function overlap(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) { return ax0 < bx1 - EPS && ax1 > bx0 + EPS && ay0 < by1 - EPS && ay1 > by0 + EPS; }

  // 横に動かす（かべ・閉じた扉・移動足場で止まる）
  function moveX(w, s, dx, boxes, skip) {
    if (dx === 0) return false;
    var nx = s.px + dx, y0 = s.py, y1 = s.py + PH, hit = false, cy0 = Math.floor(y0 + EPS), cy1 = Math.floor(y1 - EPS), cy, cx, i, b;
    if (dx > 0) {
      cx = Math.floor(nx + HW - EPS);
      if (cx > Math.floor(s.px + HW - EPS)) for (cy = cy0; cy <= cy1; cy++) if (solidAt(w, cx, cy)) { nx = cx - HW; hit = true; break; }
    } else {
      cx = Math.floor(nx - HW + EPS);
      if (cx < Math.floor(s.px - HW + EPS)) for (cy = cy0; cy <= cy1; cy++) if (solidAt(w, cx, cy)) { nx = cx + 1 + HW; hit = true; break; }
    }
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i]; if (!b.on || b === skip) continue;
      if (!(y0 < b.y1 - EPS && y1 > b.y0 + EPS)) continue;
      if (dx > 0 && s.px + HW <= b.x0 + EPS && nx + HW > b.x0) { nx = b.x0 - HW; hit = true; }
      else if (dx < 0 && s.px - HW >= b.x1 - EPS && nx - HW < b.x1) { nx = b.x1 + HW; hit = true; }
    }
    s.px = nx;
    return hit;
  }
  // 縦に動かす。着地なら 1=足場 2=移動足場 3=水面、頭をぶつけたら -1
  function moveY(w, s, dy, boxes, skip, water) {
    if (dy === 0) return 0;
    var ny = s.py + dy, x0 = s.px - HW, x1 = s.px + HW, res = 0, gm = -1, cx0 = Math.floor(x0 + EPS), cx1 = Math.floor(x1 - EPS), cx, cy, i, b;
    if (dy < 0) {
      cy = Math.floor(ny + EPS);
      if (cy >= 0 && s.py >= cy + 1 - EPS) for (cx = cx0; cx <= cx1; cx++) if (solidAt(w, cx, cy)) { ny = cy + 1; res = 1; break; }
      for (i = 0; i < boxes.length; i++) {
        b = boxes[i]; if (!b.on || b === skip) continue;
        if (!(x0 < b.x1 - EPS && x1 > b.x0 + EPS)) continue;
        if (s.py >= b.y1 - 1e-4 && ny < b.y1 && b.y1 >= ny) { ny = b.y1; res = b.k === 2 ? 2 : 1; gm = b.k === 2 ? b.i : -1; }
      }
      if (water) { // 術の間は水面に乗れる（上からだけ）
        for (i = 0; i < w.waters.length; i++) {
          var wa = w.waters[i], top = wa.y + 1;
          if (x0 < wa.x + wa.len - EPS && x1 > wa.x + EPS && s.py >= top - EPS && ny < top && top >= ny) { ny = top; if (!res) res = 3; }
        }
      }
    } else {
      cy = Math.floor(ny + PH - EPS);
      if (cy > Math.floor(s.py + PH - EPS)) for (cx = cx0; cx <= cx1; cx++) if (solidAt(w, cx, cy)) { ny = cy - PH; res = -1; break; }
      for (i = 0; i < boxes.length; i++) {
        b = boxes[i]; if (!b.on || b === skip) continue;
        if (!(x0 < b.x1 - EPS && x1 > b.x0 + EPS)) continue;
        if (s.py + PH <= b.y0 + 1e-4 && ny + PH > b.y0) { ny = b.y0 - PH; res = -1; }
      }
    }
    s.py = ny;
    if (res > 0) s.gm = gm;
    return res;
  }
  // 足もとに何かあるか（立ったまま動かないときの確認）
  function groundBelow(w, s, boxes, water) {
    var x0 = s.px - HW, x1 = s.px + HW, y = s.py, ry = Math.round(y), i, b;
    if (Math.abs(y - ry) < 1e-4 && ry >= 1) {
      for (var cx = Math.floor(x0 + EPS); cx <= Math.floor(x1 - EPS); cx++) if (solidAt(w, cx, ry - 1)) { s.gm = -1; return 1; }
    }
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i]; if (!b.on) continue;
      if (x0 < b.x1 - EPS && x1 > b.x0 + EPS && Math.abs(b.y1 - y) < 1e-4) { s.gm = b.k === 2 ? b.i : -1; return b.k === 2 ? 2 : 1; }
    }
    if (water) for (i = 0; i < w.waters.length; i++) { var wa = w.waters[i]; if (x0 < wa.x + wa.len - EPS && x1 > wa.x + EPS && Math.abs(wa.y + 1 - y) < 1e-4) { s.gm = -1; return 3; } }
    s.gm = -1;
    return 0;
  }

  /* ---------- 失敗と再開 ---------- */
  function die(s, cause, ev) {
    s.status = 1; s.dt = P.deadFrames; s.deaths++;
    if (ev) ev.push({ t: 'die', cause: cause, x: Math.max(0, Math.min(GW - 1, Math.floor(s.px))), y: Math.max(0, Math.min(GH - 1, Math.floor(s.py + 0.3))) });
  }
  function respawn(s, ev) {
    s.status = 0; s.px = s.cpx + 0.5; s.py = s.cpy; s.vx = 0; s.vy = 0; s.ground = 0; s.gm = -1;
    s.coyote = 0; s.buf = 0; s.rising = 0; s.jt = 0; s.charges = s.cpc;
    if (ev) ev.push({ t: 'respawn' });
  }

  /* ---------- 1コマ進める ---------- */
  function step(w, s, input, ev) {
    if (s.status >= 2) return s;
    var f = s.f, i, b;
    s.f = f + 1;
    if (s.f >= D.LIMIT.timeFrames) { s.status = 3; if (ev) ev.push({ t: 'timeout' }); return s; }
    if (s.status === 1) { // 失敗の演出中（時間と仕掛けは進む）
      if (--s.dt <= 0) respawn(s, ev);
      s.held = input & IN.J;
      return s;
    }
    var bp = fillBoxes(w, s.sw, f, w.bp), bn = fillBoxes(w, s.sw, f + 1, w.bn), nd = w.doors.length;
    var water = s.jt > 0;

    // 1) 乗っている移動足場に運ばれる
    if (s.ground === 2 && s.gm >= 0) {
      var o = bp[nd + s.gm], n = bn[nd + s.gm], mdx = n.x0 - o.x0, mdy = n.y1 - o.y1;
      if (mdy > 0) moveY(w, s, mdy, bn, n, false);
      if (mdx !== 0) moveX(w, s, mdx, bn, n);
      if (mdy < 0) s.py += mdy;
      if (s.px + HW > n.x0 + EPS && s.px - HW < n.x1 - EPS && Math.abs(s.py - n.y1) < 0.08) s.py = n.y1;
    }
    // 2) 動いてきた足場に押される（乗っていない足場）
    for (i = nd; i < bn.length; i++) {
      b = bn[i];
      if (s.ground === 2 && b.i === s.gm) continue;
      if (!overlap(s.px - HW, s.py, s.px + HW, s.py + PH, b.x0, b.y0, b.x1, b.y1)) continue;
      var ob = bp[i], rise = b.y0 - ob.y0;
      var penL = (s.px + HW) - b.x0, penR = b.x1 - (s.px - HW), penD = (s.py + PH) - b.y0, penU = b.y1 - s.py;
      var mn = Math.min(penL, penR, penD, penU);
      if (mn === penU || (rise > 0 && penU <= 0.25)) { s.py = b.y1; if (s.vy < 0) s.vy = 0; s.ground = 2; s.gm = b.i; }
      else if (mn === penD) { s.py = b.y0 - PH; if (s.vy > 0) s.vy = 0; }
      else if (mn === penL) s.px = b.x0 - HW;
      else s.px = b.x1 + HW;
    }

    // 3) 入力
    var dir = ((input & IN.R) ? 1 : 0) - ((input & IN.L) ? 1 : 0);
    var jumpHeld = (input & IN.J) ? 1 : 0;
    if (jumpHeld && !s.held) s.buf = P.buffer;
    s.held = jumpHeld;
    if ((input & IN.T) && s.charges > 0 && s.jt === 0) { s.jt = P.jutsuFrames; s.charges--; water = true; if (ev) ev.push({ t: 'jutsu' }); }
    if (dir) s.face = dir;
    var onG = s.ground > 0;
    var target = dir * P.run, acc = onG ? (dir ? P.accG : P.decG) : (dir ? P.accA : P.decA);
    if (s.vx < target) s.vx = Math.min(target, s.vx + acc * DT);
    else if (s.vx > target) s.vx = Math.max(target, s.vx - acc * DT);
    if (onG) s.coyote = P.coyote; else if (s.coyote > 0) s.coyote--;
    if (s.buf > 0) {
      if (s.coyote > 0) { s.vy = P.jump; s.buf = 0; s.coyote = 0; s.ground = 0; s.gm = -1; s.rising = 1; s.jumps++; if (ev) ev.push({ t: 'jump' }); }
      else s.buf--;
    }
    if (s.rising && !jumpHeld && s.vy > P.cut) s.vy = P.cut;
    if (s.vy <= 0) s.rising = 0;
    s.vy -= P.grav * DT;
    if (s.vy < -P.fall) s.vy = -P.fall;

    // 4) 動く（横 → 縦）
    if (moveX(w, s, s.vx * DT, bn, null)) s.vx = 0;
    var wasAir = s.ground === 0, vyBefore = s.vy;
    var ry = moveY(w, s, s.vy * DT, bn, null, water);
    if (ry > 0) { s.ground = ry; s.vy = 0; s.rising = 0; }
    else if (ry < 0) { s.vy = 0; s.rising = 0; s.ground = 0; s.gm = -1; }
    else if (s.vy <= 0) { s.ground = groundBelow(w, s, bn, water); if (s.ground) s.vy = 0; }
    else { s.ground = 0; s.gm = -1; }
    if (wasAir && s.ground && vyBefore < -6 && ev) ev.push({ t: 'land' });
    if (s.jt > 0) { s.jt--; if (s.jt === 0 && ev) ev.push({ t: 'jutsuEnd' }); }

    // 5) 判定
    var x0 = s.px - HW, x1 = s.px + HW, y0 = s.py, y1 = s.py + PH;
    // つぶされた（かべ・閉じた扉・移動足場と大きく重なった）
    if (boxHitsTiles(w, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05)) { die(s, 'crush', ev); return s; }
    for (i = 0; i < bn.length; i++) { b = bn[i]; if (b.on && overlap(x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, b.x0, b.y0, b.x1, b.y1)) { die(s, 'crush', ev); return s; } }
    // ゴール
    var g = w.goal;
    if (g && overlap(x0, y0, x1, y1, g.x + 0.1, g.y, g.x + 0.9, g.y + 2)) { s.status = 2; if (ev) ev.push({ t: 'clear' }); return s; }
    // 下へ落ちた
    if (s.py < -1.2) { die(s, 'fall', ev); return s; }
    // 予告付き罠（トゲが出ているときだけ）
    for (i = 0; i < w.traps.length; i++) {
      var t = w.traps[i];
      if (trapPhase(t, s.f) !== 2) continue;
      var ty0 = t.dir === 'down' ? t.y + 0.25 : t.y, ty1 = t.dir === 'down' ? t.y + 1 : t.y + 0.75;
      if (overlap(x0, y0, x1, y1, t.x + 0.14, ty0, t.x + 0.86, ty1)) { die(s, 'trap', ev); return s; }
    }
    // 落とし穴・水（体の中心が入ったら）
    var cxp = s.px;
    for (i = 0; i < w.pits.length; i++) { var pt = w.pits[i]; if (cxp > pt.x && cxp < pt.x + pt.len && s.py < pt.y + 0.7 && s.py > pt.y - 1.5) { die(s, 'pit', ev); return s; } }
    for (i = 0; i < w.waters.length; i++) {
      var wt = w.waters[i];
      if (s.ground !== 3 && cxp > wt.x && cxp < wt.x + wt.len && s.py < wt.y + 0.72 && s.py > wt.y - 1.5) { die(s, 'water', ev); return s; }
    }
    // スイッチ（一度触れたら、その挑戦のあいだは押されたまま）
    for (i = 0; i < w.switches.length; i++) {
      var sw = w.switches[i];
      if ((s.sw >> i) & 1) continue;
      if (overlap(x0, y0, x1, y1, sw.x + 0.1, sw.y, sw.x + 0.9, sw.y + 0.5)) {
        s.sw |= (1 << i);
        if (ev) { ev.push({ t: 'switch', i: i }); if (sw.door >= 0) ev.push({ t: 'door', i: sw.door }); }
      }
    }
    // 忍術補給（回数ぶんまでためる。何度でも取れる）
    for (i = 0; i < w.refills.length; i++) {
      var rf = w.refills[i];
      if (s.charges >= rf.count) continue;
      if (overlap(x0, y0, x1, y1, rf.x + 0.15, rf.y + 0.05, rf.x + 0.85, rf.y + 0.95)) { s.charges = Math.min(P.chargeMax, rf.count); if (ev) ev.push({ t: 'refill', i: i }); }
    }
    // チェックポイント（最後に触れた旗から再開。術の回数もそのときの数に戻る）
    for (i = 0; i < w.checks.length; i++) {
      var cp = w.checks[i];
      if (!overlap(x0, y0, x1, y1, cp.x + 0.2, cp.y, cp.x + 0.8, cp.y + 1.4)) continue;
      if (s.cpi !== i) { s.cpi = i; s.cpx = cp.x; s.cpy = cp.y; s.cpMask |= (1 << i); if (ev) ev.push({ t: 'check', i: i }); }
      s.cpc = s.charges;
    }
    return s;
  }

  /* ---------- 入力の記録（1コマごとのビットを連長圧縮） ---------- */
  function Recorder() { this.runs = []; this.last = -1; }
  Recorder.prototype.push = function (m) {
    var r = this.runs;
    if (m === this.last && r.length && r[r.length - 1][1] < 65535) r[r.length - 1][1]++;
    else { r.push([m, 1]); this.last = m; }
  };
  Recorder.prototype.frames = function () { var n = 0; this.runs.forEach(function (r) { n += r[1]; }); return n; };

  // 記録を再生して結果を返す（作者クリアの確認に使う）
  function replay(level, runs, maxFrames) {
    var w = createWorld(level), s = initState(w), ev = [], deaths = [];
    var limit = maxFrames || D.LIMIT.timeFrames;
    for (var i = 0; i < runs.length && s.status < 2; i++) {
      var m = runs[i][0], n = runs[i][1];
      for (var k = 0; k < n && s.status < 2 && s.f < limit; k++) {
        ev.length = 0; step(w, s, m, ev);
        for (var e = 0; e < ev.length; e++) if (ev[e].t === 'die') deaths.push(ev[e]);
      }
    }
    return { cleared: s.status === 2, frames: s.f, status: s.status, deaths: deaths, checkpoints: s.cpMask };
  }

  var api = {
    IN: IN, createWorld: createWorld, initState: initState, cloneState: cloneState, step: step, moverPos: moverPos, moverU: moverU,
    trapPhase: trapPhase, Recorder: Recorder, replay: replay, solidAt: solidAt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KK_ENGINE = api;
})(typeof window !== 'undefined' ? window : globalThis);
