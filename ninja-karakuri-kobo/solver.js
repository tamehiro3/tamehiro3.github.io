/* ニンジャからくり工房 — 解答機（開発用。運営ステージが本当にクリアできるかを、物理そのものを動かして探す）
 *
 * 数コマごとに「左・止まる・右」×「ジャンプを押す・押さない」（＋術）を選び、重みつき A* で探す。
 * 見積もり（あと何コマか）は、立てるマスを「歩く・落ちる・跳ぶ」でつないだ図の上の距離（重力を考える）。
 * 扉が閉じていてゴールに届かないときは、スイッチを経由した距離を使う。
 * 同じような状態（位置・速さ・術・スイッチ・近くの仕掛けの時刻）は1つにまとめる。
 * 見つかった入力は engine.replay でもう一度再生して、本当にクリアできることを確かめる。
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var E = root.KK_ENGINE || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var R = root.KK_RULES || (typeof require !== 'undefined' ? require('./rules.js') : null);
  var GW = D.GRID.W, GH = D.GRID.H, INF = 1e9;

  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) {
    var a = this.a; a.push(n);
    var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p].pr <= n.pr) break; a[i] = a[p]; i = p; }
    a[i] = n;
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      var i = 0, n = a.length;
      while (true) {
        var l = i * 2 + 1, r = l + 1, m = i;
        if (l < n && a[l].pr < (m === i ? last.pr : a[m].pr)) m = l;
        if (r < n && a[r].pr < (m === i ? last.pr : a[m].pr)) m = r;
        if (m === i) break;
        a[i] = a[m]; i = m;
      }
      a[i] = last;
    }
    return top;
  };

  /* ---------- 立てるマスの図（扉の開き方ごと） ---------- */
  function Graph(w, doorMask) {
    this.w = w; this.dm = doorMask;
    var pit = {}, water = {}, mover = {};
    w.pits.forEach(function (p) { for (var i = 0; i < p.len; i++) pit[(p.x + i) + ',' + p.y] = 1; });
    w.waters.forEach(function (p) { for (var i = 0; i < p.len; i++) water[(p.x + i) + ',' + p.y] = 1; });
    // 移動足場は「両端の乗り場」だけを足場とみなし、乗り場どうしを乗り物の線でつなぐ（通り道の途中を跳んで登れるとはみなさない）
    var rides = [], mseat = {};
    w.movers.forEach(function (m, mi) {
      var a = [], b = [], i;
      for (i = 0; i < D.PHYS.moverW; i++) {
        mover[(m.x + i) + ',' + m.y] = 1; mover[(m.x2 + i) + ',' + m.y2] = 1; a.push((m.x + i) + ',' + (m.y + 1)); b.push((m.x2 + i) + ',' + (m.y2 + 1));
        mseat[(m.x + i) + ',' + (m.y + 1)] = { m: mi, u: 0 }; mseat[(m.x2 + i) + ',' + (m.y2 + 1)] = { m: mi, u: 1 };
      }
      var cost = (m.travel + m.dwell + m.period / 4) / 60 * D.PHYS.run; // 乗るまでの待ち時間の見込みもふくめる
      rides.push({ a: a, b: b, cost: cost });
    });
    this.pit = pit; this.water = water; this.mover = mover; this.rides = rides; this.mseat = mseat;
    this.adj = null; this.memo = {};
  }
  Graph.prototype.blocked = function (x, y) {
    var w = this.w;
    if (x < 0 || x >= GW || y >= GH) return true;
    if (y < 0) return false;
    if (w.solid[y * GW + x]) return true;
    for (var k = 0; k < w.doors.length; k++) { var d = w.doors[k]; if (!(this.dm & (1 << k)) && d.x === x && (d.y === y || d.y + 1 === y)) return true; }
    return false;
  };
  Graph.prototype.standable = function (x, y) {
    if (x < 0 || x >= GW || y < 1 || y + 1 >= GH + 1) return false;
    if (this.blocked(x, y) || (y + 1 < GH && this.blocked(x, y + 1))) return false;
    var k = x + ',' + y;
    if (this.pit[k] || this.water[k]) return false;
    var b = x + ',' + (y - 1);
    return this.blocked(x, y - 1) || !!this.water[b] || !!this.mover[b];
  };
  Graph.prototype.build = function () {
    if (this.adj) return;
    var adj = {}, self = this, x, y;
    function add(a, b, c) { (adj[b] = adj[b] || []).push([a, c]); } // 逆向き（ゴールから広げる）
    for (y = 1; y < GH; y++) for (x = 0; x < GW; x++) {
      if (!this.standable(x, y)) continue;
      var from = x + ',' + y;
      for (var dx = -1; dx <= 1; dx += 2) {
        var nx = x + dx;
        if (this.standable(nx, y)) add(from, nx + ',' + y, 1);
        else if (!this.blocked(nx, y) && !(y + 1 < GH && this.blocked(nx, y + 1))) { // 端から落ちる（少し流れてもよい）
          for (var drift = 0; drift <= 1; drift++) {
            var fx = nx + dx * drift;
            for (var ny = y - 1; ny >= 1; ny--) {
              if (this.blocked(fx, ny)) break;
              if (this.pit[fx + ',' + ny]) break;
              if (this.standable(fx, ny)) { add(from, fx + ',' + ny, 1 + drift + (y - ny) * 0.3); break; }
            }
          }
        }
      }
      var blk = function (bx, by) { return self.blocked(bx, by); };
      var rc = R.jumpReach(blk, x, y);
      for (var jx = -5; jx <= 5; jx++) for (var jy = -8; jy <= rc.up; jy++) {
        if (!jx && !jy) continue;
        if (Math.abs(jx) > rc.side + (jy <= -1 ? 1 : 0)) continue;
        var tx = x + jx, ty = y + jy;
        if (!this.standable(tx, ty)) continue;
        add(from, tx + ',' + ty, Math.abs(jx) + Math.max(0, jy) * 1.5 + 1.5);
      }
    }
    this.rides.forEach(function (r) {
      r.a.forEach(function (ka) { r.b.forEach(function (kb) { add(ka, kb, r.cost); add(kb, ka, r.cost); }); });
    });
    this.adj = adj;
  };
  // 目的のマス（のまわり）まで、各マスからの距離
  Graph.prototype.distTo = function (tx, ty, reach) {
    var key = tx + ',' + ty + ':' + reach;
    if (this.memo[key]) return this.memo[key];
    this.build();
    var dist = {}, heap = new Heap(), x, y;
    for (y = 1; y < GH; y++) for (x = 0; x < GW; x++) {
      if (!this.standable(x, y)) continue;
      if (Math.abs(x - tx) <= (reach ? 1 : 0) && ty - y <= (reach ? 3 : 0) && ty - y >= (reach ? -1 : 0)) { dist[x + ',' + y] = 0; heap.push({ k: x + ',' + y, pr: 0 }); }
    }
    while (heap.a.length) {
      var n = heap.pop();
      if (n.pr > dist[n.k]) continue;
      var es = this.adj[n.k] || [];
      for (var i = 0; i < es.length; i++) {
        var nk = es[i][0], nd = n.pr + es[i][1];
        if (dist[nk] == null || nd < dist[nk]) { dist[nk] = nd; heap.push({ k: nk, pr: nd }); }
      }
    }
    this.memo[key] = dist;
    return dist;
  };

  function solve(level, opt) {
    opt = opt || {};
    var K = opt.K || 4, maxNodes = opt.maxNodes || 600000, weight = opt.weight == null ? 1.6 : opt.weight;
    var near = opt.near == null ? 7 : opt.near, mode = opt.mode || 'max', gw = opt.gw == null ? 1 : opt.gw; // gw：かかった時間の重み（小さいほど貪欲に探す）
    var w = E.createWorld(level), s0 = E.initState(w);
    if (!w.goal) return { ok: false, reason: 'no goal' };
    var nd = w.doors.length, graphs = {};
    function graph(dm) { return graphs[dm] || (graphs[dm] = new Graph(w, dm)); }
    function doorMaskOf(sw) { var m = 0; for (var i = 0; i < nd; i++) if (w.doors[i].sw & sw) m |= (1 << i); return m; }
    var hMemo = {};
    // (x,y) の立てるマスから、スイッチの押し方 sw でゴールまで
    function hCell(sw, key, depth) {
      var g = graph(doorMaskOf(sw)), dg = g.distTo(w.goal.x, w.goal.y, true);
      if (dg[key] != null) return dg[key];
      if (depth > 4) return 80;
      var best = INF;
      for (var i = 0; i < w.switches.length; i++) {
        if ((sw >> i) & 1) continue;
        var s = w.switches[i], ds = g.distTo(s.x, s.y, false), dv = ds[key];
        if (dv == null) continue;
        var mk = (sw | (1 << i)) + '@' + i, rest = hMemo[mk];
        if (rest == null) rest = hMemo[mk] = hCell(sw | (1 << i), s.x + ',' + s.y, depth + 1);
        best = Math.min(best, dv + rest);
      }
      return best < INF ? best : 80;
    }
    // 通れるマスをたどった距離（重力を無視＝少なめの見積もり）
    var freeMaps = {};
    function freeMap(dm, tx, ty) {
      var mk = dm + ':' + tx + ',' + ty;
      if (freeMaps[mk]) return freeMaps[mk];
      var g = graph(dm), dist = new Float32Array(GW * GH).fill(INF), q = [];
      function pass(x, y) { return x >= 0 && x < GW && y >= 0 && y < GH && !g.blocked(x, y); }
      if (pass(tx, ty)) { dist[ty * GW + tx] = 0; q.push(tx, ty); }
      for (var i = 0; i < q.length; i += 2) {
        var x = q[i], y = q[i + 1], d0 = dist[y * GW + x];
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          var nx = x + dx, ny = y + dy;
          if (!pass(nx, ny)) continue;
          var nd2 = d0 + (dx && dy ? 1.41 : 1);
          if (nd2 < dist[ny * GW + nx]) { dist[ny * GW + nx] = nd2; q.push(nx, ny); }
        }
      }
      return (freeMaps[mk] = dist);
    }
    function hFree(sw, x, y, depth) {
      var dm = doorMaskOf(sw), v = freeMap(dm, w.goal.x, w.goal.y)[y * GW + x];
      if (v < INF) return v;
      if (depth > 4) return 60;
      var best = INF;
      for (var i = 0; i < w.switches.length; i++) {
        if ((sw >> i) & 1) continue;
        var sp = w.switches[i], dv = freeMap(dm, sp.x, sp.y)[y * GW + x];
        if (dv >= INF) continue;
        best = Math.min(best, dv + hFree(sw | (1 << i), sp.x, sp.y, depth + 1));
      }
      return best < INF ? best : 60;
    }
    // 立っていればそのマス、空中なら着地できそうなマス（前後5マス・上3マスまで）
    // 移動足場が乗り場（u=0 か u=1）に着くまでのコマ数
    function timeTo(m, f, end) {
      var t = f % m.period, d = m.dwell, tr = m.travel;
      if (end === 1) {
        if (t < d) return d - t + tr;
        if (t < d + tr) return d + tr - t;
        if (t < 2 * d + tr) return 0;
        return m.period - t + d + tr;
      }
      if (t < d) return 0;
      return m.period - t;
    }
    function hGraph(s) {
      var g = graph(doorMaskOf(s.sw)), x = Math.floor(s.px), y = Math.round(s.py), best = INF;
      if (s.ground === 2 && s.gm >= 0) { // 乗っている足場が乗り場に着くまで＋そこからの距離
        var m = w.movers[s.gm], r = g.rides[s.gm];
        [0, 1].forEach(function (end) {
          var cells = end ? r.b : r.a, tt = timeTo(m, s.f, end) / 60 * D.PHYS.run;
          cells.forEach(function (ck) { if (g.standable(+ck.split(',')[0], +ck.split(',')[1])) { var v = hCell(s.sw, ck, 0) + tt; if (v < best) best = v; } });
        });
        if (best < INF) return best;
      }
      if (s.ground) {
        for (var yy = y; yy >= Math.max(1, y - 1); yy--) if (g.standable(x, yy)) return hCell(s.sw, x + ',' + yy, 0);
      }
      // いまの上向きの速さで届く高さまで（落ちている最中なら、いまより上には着地できない）
      var top = s.py + (s.vy > 0 ? s.vy * s.vy / (2 * D.PHYS.grav) : 0) + 0.15;
      for (var dx = -5; dx <= 5; dx++) {
        var cx = x + dx;
        if (cx < 0 || cx >= GW) continue;
        for (var cy = Math.min(GH - 1, Math.floor(top)); cy >= Math.max(1, y - 9); cy--) {
          if (!g.standable(cx, cy)) continue;
          var seat = g.mseat[cx + ',' + cy];
          if (seat && !g.blocked(cx, cy - 1) && Math.abs(E.moverU(w.movers[seat.m], s.f + 12) - seat.u) > 0.25) continue; // その乗り場に足場が来ていない
          var v = hCell(s.sw, cx + ',' + cy, 0) + Math.abs(cx + 0.5 - s.px) * 0.7 + Math.max(0, cy - s.py) * 0.8;
          if (v < best) best = v;
        }
      }
      return best;
    }
    function h(s) {
      var x = Math.max(0, Math.min(GW - 1, Math.floor(s.px))), y = Math.max(0, Math.min(GH - 1, Math.floor(s.py + 0.5)));
      var f = hFree(s.sw, x, y, 0), gr = mode === 'free' ? 0 : hGraph(s);
      if (gr >= INF) gr = s.ground ? f + 40 : f + 400; // 着地できる所がない（落ちるだけ）
      return (mode === 'graph' ? gr : Math.max(f, gr * 0.85)) / D.PHYS.run * 60;
    }
    // 近くの仕掛けの時刻（遠くの仕掛けは待てば合わせられるので、まとめてよい）
    var timed = [];
    w.traps.forEach(function (t) { timed.push({ x: t.x + 0.5, y: t.y, period: t.cycle, B: 24 }); });
    w.movers.forEach(function (m) { timed.push({ x: (m.x + m.x2) / 2 + 1.5, y: (m.y + m.y2) / 2, span: Math.abs(m.x2 - m.x) / 2 + 2, spanY: Math.abs(m.y2 - m.y) / 2, period: m.period, B: 32 }); });
    function key(s) {
      var k = Math.round(s.px * 6) + ',' + Math.round(s.py * 6) + ',' + Math.round(s.vx / 1.5) + ',' + Math.round(s.vy / 2.5) + ',' + (s.ground ? 1 : 0) + s.held + ',' + s.charges + ',' + (s.jt > 0 ? Math.ceil(s.jt / 30) : 0) + ',' + s.sw + ',' + s.cpi;
      for (var i = 0; i < timed.length; i++) {
        var t = timed[i];
        if (Math.abs(t.x - s.px) > near + (t.span || 0) || Math.abs(t.y - s.py) > 6 + (t.spanY || 0)) continue;
        k += ',' + i + ':' + Math.floor((s.f % t.period) / t.period * t.B);
      }
      return k;
    }
    var ACTS = [];
    [0, 1, 2].forEach(function (d) { [0, 4].forEach(function (j) { ACTS.push((d === 1 ? 1 : d === 2 ? 2 : 0) | j); }); });
    var JUT = [8, 8 | 1, 8 | 2, 8 | 4 | 2, 8 | 4 | 1], WAIT = 16, WAIT2 = 17; // WAIT：足場の上で少し長く待つ（動く仕掛けの時刻合わせ）
    var seen = new Map(), heap = new Heap(), expanded = 0;
    heap.push({ s: s0, p: null, a: 0, pr: weight * h(s0) }); seen.set(key(s0), 1);
    var found = null, bestH = null, bestS = null;
    while (heap.a.length && expanded < maxNodes) {
      var n = heap.pop();
      expanded++;
      if (opt.hist) { var hk = Math.floor(n.s.px) + ',' + Math.floor(n.s.py); opt.hist[hk] = (opt.hist[hk] || 0) + 1; }
      var acts = ACTS;
      if (n.s.charges > 0 && n.s.jt === 0) acts = ACTS.concat(JUT);
      if (n.s.ground === 1 && timed.length) acts = acts.concat([WAIT, WAIT2]);
      for (var ai = 0; ai < acts.length; ai++) {
        var a = acts[ai], s = E.cloneState(n.s), dead = false, len = a === WAIT ? K * 6 : a === WAIT2 ? K * 24 : K;
        for (var k = 0; k < len; k++) {
          E.step(w, s, a >= WAIT ? 0 : (k === 0 ? a : (a & 7)), null);
          if (s.status === 1 || s.status === 3) { dead = true; break; }
          if (s.status === 2) break;
        }
        if (dead) continue;
        var child = { s: s, p: n, a: a, pr: 0 };
        if (s.status === 2) { found = child; break; }
        var kk = key(s);
        if (seen.has(kk)) continue;
        seen.set(kk, 1);
        var hv = h(s);
        if (opt.debug && (bestH == null || hv < bestH)) { bestH = hv; bestS = s; }
        child.pr = s.f * gw + weight * hv;
        heap.push(child);
      }
      if (found) break;
    }
    if (!found) return { ok: false, expanded: expanded, reason: heap.a.length ? 'limit' : 'exhausted', best: bestS, bestH: bestH };
    var path = [];
    for (var c = found; c.p; c = c.p) path.push(c.a);
    path.reverse();
    var rec = new E.Recorder();
    path.forEach(function (a) { if (a >= WAIT) { for (var k2 = 0; k2 < K * (a === WAIT ? 6 : 24); k2++) rec.push(0); return; } for (var k = 0; k < K; k++) rec.push(k === 0 ? a : (a & 7)); });
    var rp = E.replay(level, rec.runs);
    return { ok: rp.cleared, frames: rp.frames, runs: rec.runs, expanded: expanded, replay: rp };
  }

  var api = { solve: solve, Graph: Graph };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KK_SOLVER = api;
})(typeof window !== 'undefined' ? window : globalThis);
