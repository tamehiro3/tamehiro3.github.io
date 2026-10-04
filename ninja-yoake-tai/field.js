/* ニンジャ夜明け隊（RPG） — フィールドの判定
 * マス目の地図（文字の行）・ものの置き場所・歩けるかどうか・道さがし・妖怪シンボルの動き・障害物。
 * 画面に依存しない（Node のテストでも使う）。描画は render_field.js。
 */
(function (root) {
  'use strict';
  function MP() { return root.NYT_MAPS; }
  function ST() { return root.NYT_STATE; }

  // マスの種類：w=歩ける / tall=高さのある物（木など：描画で上にかぶる）
  var TILES = {
    '.': { n: 'grass', w: 1 }, ',': { n: 'path', w: 1 }, '_': { n: 'stone', w: 1 }, '"': { n: 'tallgrass', w: 1 }, 'f': { n: 'flowers', w: 1 },
    's': { n: 'sand', w: 1 }, ':': { n: 'deck', w: 1 }, 'd': { n: 'cave', w: 1 }, 'p': { n: 'floor', w: 1 }, 'c': { n: 'cloud', w: 1 },
    'k': { n: 'dark', w: 1 }, 'l': { n: 'lily', w: 1 }, '=': { n: 'bridge', w: 1 }, 'g': { n: 'gravel', w: 1 },
    '~': { n: 'water', w: 0 }, 'T': { n: 'tree', w: 0, tall: 1 }, 'Y': { n: 'pine', w: 0, tall: 1 }, 'B': { n: 'bamboo', w: 0, tall: 1 },
    't': { n: 'bush', w: 0 }, '#': { n: 'cliff', w: 0 }, 'D': { n: 'cavewall', w: 0 }, 'W': { n: 'wall', w: 0 }, 'F': { n: 'fence', w: 0 },
    'r': { n: 'rock', w: 0 }, 'S': { n: 'stonewall', w: 0 }, 'x': { n: 'void', w: 0 }, 'v': { n: 'cloudedge', w: 0 }
  };
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var DIR_LIST = ['up', 'down', 'left', 'right'];
  function dirOf(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
  function opposite(d) { return { up: 'down', down: 'up', left: 'right', right: 'left' }[d]; }

  // ---- 条件（旗・仲間・道具・かけら）。'a&b' はどちらも、'!a' は否定 ----
  function cond(S, c) {
    if (!c) return true;
    var parts = String(c).split('&');
    for (var i = 0; i < parts.length; i++) if (!one(S, parts[i].trim())) return false;
    return true;
  }
  function one(S, c) {
    if (!c) return true;
    if (c[0] === '!') return !one(S, c.slice(1));
    var m;
    if ((m = /^has:(\w+)$/.exec(c))) return ST().has(S, m[1]);
    if ((m = /^active:(\w+)$/.exec(c))) return ST().active(S).indexOf(m[1]) >= 0;
    if ((m = /^item:(\w+)(?:>=(\d+))?$/.exec(c))) return ST().itemCount(S, m[1]) >= (m[2] ? +m[2] : 1);
    if ((m = /^frag>=(\d+)$/.exec(c))) return (S.frag || 0) >= +m[1];
    if ((m = /^gold>=(\d+)$/.exec(c))) return S.gold >= +m[1];
    if ((m = /^lv>=(\d+)$/.exec(c))) return S.members.hero.lv >= +m[1];
    if ((m = /^count>=(\d+)$/.exec(c))) return S.order.length >= +m[1];
    if ((m = /^ability:(\w+)$/.exec(c))) return hasAbility(S, m[1]);
    if ((m = /^cleared:(\w+)$/.exec(c))) return !!S.cleared[m[1]];
    if ((m = /^opened:(\w+)$/.exec(c))) return !!S.opened[m[1]];
    return !!S.flags[c];
  }
  // 探索の術（仲間にいれば使える）
  var ABILITY = { push: 'xiaolan', hawk: 'hayate', wind: 'fuuta', bomb: 'hinanojoh' };
  var ABILITY_NAME = { push: 'リーリー', hawk: '鷹の目', wind: '風遁', bomb: '焙烙玉' };
  function hasAbility(S, a) { return !!S.members[ABILITY[a]]; }

  // ---- 地図を読む ----
  function load(S, id) {
    var def = MP().MAPS[id];
    if (!def) throw new Error('地図がない: ' + id);
    var h = def.rows.length, w = def.rows[0].length;
    var F = { id: id, def: def, w: w, h: h, tiles: new Array(w * h), objs: [], deco: [] };
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) F.tiles[y * w + x] = def.rows[y][x] || 'x';
    (def.objs || []).forEach(function (o, i) {
      var ob = clone(o); ob.key = id + ':' + (o.id || (o.k + i));
      if (o.k === 'deco') { F.deco.push(ob); return; }
      F.objs.push(ob);
    });
    refresh(S, F);
    return F;
  }
  function clone(o) { var r = {}; for (var k in o) r[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; return r; }
  // 旗が変わったら、出ている物・消えた障害物・開いた宝箱を見なおす
  function refresh(S, F) {
    F.objs.forEach(function (o) {
      o.on = cond(S, o.show);
      if (o.k === 'chest') o.open = !!S.opened[o.key];
      if (o.k === 'obst') {
        var c = S.cleared[o.key];
        if (o.kind === 'boulder' && c && typeof c === 'object') { o.x = c.x; o.y = c.y; o.on = o.on && !c.gone; }
        else if (c) o.on = false;
      }
      if (o.k === 'pit') o.on = o.on && !S.cleared[o.key];
      if (o.k === 'gate') o.on = o.on && !cond(S, o.open);
      if (o.k === 'enemy' && o.beaten) o.on = false;
      if (o.k === 'pickup') o.on = o.on && !S.opened[o.key];
    });
  }
  function tileAt(F, x, y) { if (x < 0 || y < 0 || x >= F.w || y >= F.h) return 'x'; return F.tiles[y * F.w + x]; }
  function tileInfo(ch) { return TILES[ch] || TILES.x; }
  function decoBlocks(F, x, y) {
    for (var i = 0; i < F.deco.length; i++) {
      var d = F.deco[i]; if (d.block === 0) continue;
      var dw = d.w || 1, dh = d.h || 1;
      if (x >= d.x && x < d.x + dw && y >= d.y && y < d.y + dh) {
        if (d.pass) { for (var j = 0; j < d.pass.length; j++) if (d.pass[j][0] === x - d.x && d.pass[j][1] === y - d.y) return false; }
        return true;
      }
    }
    return false;
  }
  var BLOCKING = { npc: 1, chest: 1, sign: 1, obst: 1, gate: 1, pit: 1, spot: 0, pickup: 0, enemy: 0, exit: 0, step: 0 };
  function objsAt(F, x, y) {
    return F.objs.filter(function (o) {
      if (!o.on) return false;
      var w = o.w || 1, h = o.h || 1;
      return x >= o.x && x < o.x + w && y >= o.y && y < o.y + h;
    });
  }
  function walkable(F, x, y, opts) {
    opts = opts || {};
    if (x < 0 || y < 0 || x >= F.w || y >= F.h) return false;
    if (!tileInfo(tileAt(F, x, y)).w) {
      // 消えた「隠し道」はその上を歩ける（clear に hidden があれば、まだ見つけていない隠し道も通れるものとして数える：自動テスト用）
      if (!opts.ignoreHidden) {
        var hid = F.objs.filter(function (o) { return o.k === 'obst' && o.kind === 'hidden' && o.x === x && o.y === y && (!o.on || (opts.clear && opts.clear.hidden)); });
        if (hid.length) return true;
      }
      return false;
    }
    if (decoBlocks(F, x, y)) return false;
    var os = objsAt(F, x, y);
    for (var i = 0; i < os.length; i++) {
      var o = os[i];
      if (o.k === 'npc' && opts.ignoreNpc) continue;
      if (o.k === 'obst' && opts.clear && opts.clear[o.kind]) continue;
      if (BLOCKING[o.k]) return false;
    }
    return true;
  }
  function front(x, y, dir) { var d = DIRS[dir]; return [x + d[0], y + d[1]]; }

  // ---- 道さがし（幅優先。行き先が歩けないときは、となりまで）----
  function path(F, sx, sy, tx, ty, opts) {
    opts = opts || {};
    var adj = !walkable(F, tx, ty, opts) || opts.adjacent;
    var goal = function (x, y) { return adj ? (Math.abs(x - tx) + Math.abs(y - ty) === 1) : (x === tx && y === ty); };
    if (goal(sx, sy)) return [];
    var W = F.w, prev = new Int32Array(W * F.h).fill(-2), q = [sy * W + sx], head = 0;
    prev[sy * W + sx] = -1;
    var limit = opts.limit || 4000, found = -1;
    while (head < q.length && head < limit) {
      var cur = q[head++], cx = cur % W, cy = (cur / W) | 0;
      for (var i = 0; i < 4; i++) {
        var d = DIRS[DIR_LIST[i]], nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= F.h) continue;
        var ni = ny * W + nx;
        if (prev[ni] !== -2) continue;
        if (!walkable(F, nx, ny, opts)) continue;
        prev[ni] = cur;
        if (goal(nx, ny)) { found = ni; break; }
        q.push(ni);
      }
      if (found >= 0) break;
    }
    if (found < 0) return null;
    var out = [];
    for (var p = found; p !== sy * W + sx && p >= 0; p = prev[p]) out.push([p % W, (p / W) | 0]);
    return out.reverse();
  }

  // ---- 調べる（前のマス）----
  function interactAt(F, x, y) {
    var os = objsAt(F, x, y).filter(function (o) { return o.k !== 'exit' && o.k !== 'step'; });
    return os[0] || null;
  }
  // 歩いて乗ったときに起きること（出口・踏むと始まる出来事・拾える物）
  function stepAt(S, F, x, y) {
    return objsAt(F, x, y).filter(function (o) {
      if (o.k === 'exit') return true;
      if (o.k === 'step') return !(o.once && S.flags['step_' + o.key]);
      return false;
    });
  }

  // ---- 障害物 ----
  // 返り値：{ ok, need, msg, moved }
  function useObstacle(S, F, o, px, py) {
    if (!o || o.k !== 'obst' || !o.on) return null;
    var need = { boulder: 'push', fog: 'wind', crack: 'bomb', hidden: 'hawk' }[o.kind];
    if (!hasAbility(S, need)) return { ok: false, need: need };
    if (o.kind === 'boulder') {
      var dx = o.x - px, dy = o.y - py, nx = o.x + dx, ny = o.y + dy;
      var pit = F.objs.filter(function (p) { return p.k === 'pit' && p.on && p.x === nx && p.y === ny; })[0];
      if (pit) {
        S.cleared[pit.key] = 1; S.cleared[o.key] = { x: nx, y: ny, gone: 1 };
        refresh(S, F);
        return { ok: true, need: need, filled: pit.key };
      }
      // 岩は、歩ける・何もないマスへだけ動く
      o.on = false;
      var free = walkable(F, nx, ny, { ignoreHidden: true }) && !objsAt(F, nx, ny).some(function (q) { return q.k === 'enemy' || q.k === 'exit' || q.k === 'pickup' || q.k === 'spot'; });
      o.on = true;
      if (!free) return { ok: false, need: need, stuck: true };
      S.cleared[o.key] = { x: nx, y: ny };
      o.x = nx; o.y = ny;
      return { ok: true, need: need, moved: [nx, ny] };
    }
    S.cleared[o.key] = 1;
    if (o.grp) F.objs.forEach(function (q) { if (q.k === 'obst' && q.grp === o.grp) S.cleared[q.key] = 1; });
    refresh(S, F);
    return { ok: true, need: need };
  }

  // ---- 妖怪シンボル ----
  // 群れを決める（めずらしい妖怪が出ることも）
  function spawnEnemies(S, F, rng) {
    var E = root.NYT_ENEMIES;
    F.objs.forEach(function (o) {
      if (o.k !== 'enemy') return;
      o.home = o.home || [o.x, o.y]; o.x = o.home[0]; o.y = o.home[1];
      o.beaten = false; o.cool = 0;
      o.on = cond(S, o.show);
      if (o.group) { o.enemies = o.group.slice(); return; }
      var pool = E.POOLS[o.pool] || [['koro']];
      o.enemies = pool[Math.floor(rng() * pool.length)].slice();
      if (E.RARE[o.pool] && rng() < 0.06) o.enemies = [E.RARE[o.pool]];
      o.lv = Math.max.apply(null, o.enemies.map(function (id) { return E.ENEMIES[id].lv; }));
    });
  }
  // 1歩ぶん動かす。隊が強いと逃げる、弱いと追ってくる
  function enemyStep(S, F, o, px, py, rng) {
    if (!o.on || o.beaten || o.fixed) return null;
    var lv = S.members.hero.lv, dx = px - o.x, dy = py - o.y, dist = Math.abs(dx) + Math.abs(dy);
    var mode = 'wander';
    if (dist <= 4) mode = lv >= (o.lv || 1) + 7 ? 'flee' : 'chase';
    var r = o.r == null ? 3 : o.r, hx = o.home[0], hy = o.home[1];
    var cands = DIR_LIST.map(function (d) { var v = DIRS[d]; return { d: d, x: o.x + v[0], y: o.y + v[1] }; }).filter(function (c) {
      if (!walkable(F, c.x, c.y)) return false;
      if (Math.abs(c.x - hx) + Math.abs(c.y - hy) > r + (mode === 'chase' ? 3 : 0)) return false;
      return !F.objs.some(function (q) { return q !== o && q.k === 'enemy' && q.on && !q.beaten && q.x === c.x && q.y === c.y; });
    });
    if (!cands.length) return null;
    var pick;
    if (mode === 'chase') { cands.sort(function (a, b) { return (Math.abs(px - a.x) + Math.abs(py - a.y)) - (Math.abs(px - b.x) + Math.abs(py - b.y)); }); pick = cands[0]; }
    else if (mode === 'flee') { cands.sort(function (a, b) { return (Math.abs(px - b.x) + Math.abs(py - b.y)) - (Math.abs(px - a.x) + Math.abs(py - a.y)); }); pick = cands[0]; }
    else { if (rng() < 0.45) return null; pick = cands[Math.floor(rng() * cands.length)]; }
    o.dir = pick.d; o.x = pick.x; o.y = pick.y;
    return pick;
  }
  function enemyAt(F, x, y) { return F.objs.filter(function (o) { return o.k === 'enemy' && o.on && !o.beaten && o.x === x && o.y === y; })[0] || null; }

  var api = {
    TILES: TILES, DIRS: DIRS, DIR_LIST: DIR_LIST, dirOf: dirOf, opposite: opposite, cond: cond, hasAbility: hasAbility, ABILITY: ABILITY, ABILITY_NAME: ABILITY_NAME,
    load: load, refresh: refresh, tileAt: tileAt, tileInfo: tileInfo, objsAt: objsAt, walkable: walkable, front: front, path: path,
    interactAt: interactAt, stepAt: stepAt, useObstacle: useObstacle, spawnEnemies: spawnEnemies, enemyStep: enemyStep, enemyAt: enemyAt, decoBlocks: decoBlocks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_FIELD = api;
})(typeof window !== 'undefined' ? window : globalThis);
