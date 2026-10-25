/* ニンジャからくり工房 — 作る画面（エディター）
 *
 * 左：パーツ（スマホは下の列）／中央：32×12 のマス目／右：選んだパーツの設定（スマホは下から出る板）。
 * 移動・回転・削除・取り消し・やり直し・テストはいつでも使える。変更は約1秒で自動保存（前の保存に戻れる）。
 * 置けない所（重なり・はみ出し）には置かない。支えやつながりの不足は「検証」に出して、直す場所を示す。
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA, E = root.KK_ENGINE, R = root.KK_RULES, RD = root.KK_RENDER, SND = root.KK_SOUND;
  var GW = D.GRID.W, GH = D.GRID.H;
  var $ = function (id) { return document.getElementById(id); };
  var ED = null;
  var PALETTE = ['floor', 'mover', 'pit', 'trap', 'door', 'switch', 'water', 'refill', 'check', 'deco'];
  var SPEED = ['', 'ゆっくり', 'ふつう', 'はやい'];

  function dpr() { return Math.min(2.5, root.devicePixelRatio || 1); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- ひらく・とじる ---------- */
  function open(opts) {
    var store = opts.store, v = store.draftOf(opts.levelId);
    if (!v) return false;
    ED = {
      o: opts, store: store, lid: opts.levelId, c: clone(v.content), undo: [], redo: [], sel: null, tool: 'place', type: 'floor',
      last: { skin: 0, deco: 0, color: 0 }, val: null, saveT: 0, valT: 0, saved: true, drag: null, ptrs: {}, pan: null, focus: null, t0: performance.now(), view: null, layer: null
    };
    buildPalette();
    setTool('place');
    resize();
    fitCamera();
    refresh(true);
    ED.raf = requestAnimationFrame(loop);
    store.log('editor_start', { level: ED.lid });
    return true;
  }
  function close() {
    if (!ED) return;
    flush();
    cancelAnimationFrame(ED.raf);
    ED = null;
  }
  function loop() { if (!ED) return; ED.raf = requestAnimationFrame(loop); if (ED.focus || ED.dirtyDraw) { draw(); ED.dirtyDraw = false; } }

  /* ---------- パーツ ---------- */
  function buildPalette() {
    var el = $('ed-palette'), theme = ED.c.theme;
    el.innerHTML = '';
    PALETTE.forEach(function (id) {
      var b = document.createElement('button');
      b.className = 'pal'; b.dataset.part = id; b.title = D.PARTS[id].desc;
      var ic = RD.partIcon(id, 60, theme); if (ic) b.appendChild(ic);
      var s = document.createElement('span'); s.textContent = D.PARTS[id].name; b.appendChild(s);
      b.addEventListener('click', function () { ED.type = id; setTool('place'); select(null); SND.play('tap'); });
      el.appendChild(b);
    });
  }
  function setTool(t) {
    ED.tool = t;
    document.querySelectorAll('#ed-tools button').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); });
    document.querySelectorAll('#ed-palette .pal').forEach(function (b) { b.classList.toggle('on', t === 'place' && b.dataset.part === ED.type); });
    ED.dirtyDraw = true;
  }

  /* ---------- 大きさ・カメラ ---------- */
  function resize() {
    if (!ED) return;
    var cv = $('ed-cv'), k = dpr(), w = cv.clientWidth || 600, h = cv.clientHeight || 300;
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    var old = ED.view;
    // 広い画面では 32 マスが全部見えるように（1マス24px以上）。スマホは12マスぶんを大きく見せて、左右に動かす
    var cols = w < 600 ? 12 : Math.max(12, Math.min(GW + 1, Math.floor(w / 24)));
    ED.view = new RD.View(cv.width, cv.height, 'edit', { minCols: cols });
    if (old) { ED.view.camX = old.camX; clampCam(); }
    ED.layer = null;
    var mc = $('ed-mini-cv'); mc.width = Math.round(mc.clientWidth * k) || 300; mc.height = Math.round(mc.clientHeight * k) || 24;
    ED.dirtyDraw = true; draw();
  }
  function fitCamera() { var v = ED.view; v.camX = v.visCols >= GW + 1 ? -(v.visCols - GW) / 2 : -0.3; clampCam(); }
  function clampCam() { var v = ED.view; if (v.visCols >= GW + 1) { v.camX = -(v.visCols - GW) / 2; return; } v.camX = Math.max(-0.6, Math.min(GW + 0.6 - v.visCols, v.camX)); }

  /* ---------- 描く ---------- */
  function draw() {
    if (!ED || !ED.view) return;
    var cv = $('ed-cv'), ctx = cv.getContext('2d');
    if (!ED.layer) ED.layer = RD.tileLayer(ED.c, ED.c.theme, ED.view);
    var errs = ED.val ? ED.val.errors : [];
    RD.drawEditor(ctx, { level: ED.c, view: ED.view, layer: ED.layer, selected: ED.sel, errors: errs, ghost: ED.drag && ED.drag.ghost, t: (performance.now() - ED.t0) / 1000, player: ED.o.player, focus: ED.focus, heat: ED.o.heat });
    drawMini();
  }
  function drawMini() {
    var mc = $('ed-mini-cv'), ctx = mc.getContext('2d'), w = mc.width, h = mc.height;
    if (!ED.miniThumb || ED.miniDirty) { ED.miniThumb = RD.thumbnail(ED.c, Math.round(h * 32 / 12), h); ED.miniDirty = false; }
    ctx.fillStyle = '#d8ccb4'; ctx.fillRect(0, 0, w, h);
    var tw = ED.miniThumb ? ED.miniThumb.width : w, ox = (w - tw) / 2;
    if (ED.miniThumb) ctx.drawImage(ED.miniThumb, ox, 0);
    var v = ED.view, k = tw / GW;
    ctx.strokeStyle = '#c8452c'; ctx.lineWidth = 2;
    ctx.strokeRect(ox + v.camX * k, 1, Math.min(GW, v.visCols) * k, h - 2);
  }
  function refresh(first) {
    ED.layer = null; ED.miniDirty = true; ED.dirtyDraw = true;
    clearTimeout(ED.valT);
    ED.valT = setTimeout(function () { if (!ED) return; ED.val = R.validate(ED.c); info(); ED.dirtyDraw = true; }, first ? 0 : 250);
    info(); inspector();
    draw();
  }

  /* ---------- 変更（取り消しできるように） ---------- */
  function change(fn, quiet) {
    var before = JSON.stringify(ED.c);
    fn(ED.c);
    var after = JSON.stringify(ED.c);
    if (before === after) return false;
    ED.undo.push(before); if (ED.undo.length > D.LIMIT.history) ED.undo.shift();
    ED.redo = [];
    ED.saved = false; scheduleSave();
    refresh();
    if (!quiet) SND.play('place');
    return true;
  }
  function undo() { if (!ED.undo.length) return; ED.redo.push(JSON.stringify(ED.c)); ED.c = JSON.parse(ED.undo.pop()); afterJump(); }
  function redo() { if (!ED.redo.length) return; ED.undo.push(JSON.stringify(ED.c)); ED.c = JSON.parse(ED.redo.pop()); afterJump(); }
  function afterJump() { if (ED.sel && !findPart(ED.sel)) ED.sel = null; ED.saved = false; scheduleSave(); SND.play('tap'); refresh(); }
  function setContent(c, label) { // 提案の採用・保存の履歴から戻すとき
    ED.undo.push(JSON.stringify(ED.c)); ED.redo = [];
    ED.c = clone(c); ED.sel = null; ED.saved = false; scheduleSave(); refresh();
    if (label) ED.o.toast && ED.o.toast(label);
  }
  function scheduleSave() {
    clearTimeout(ED.saveT);
    info();
    ED.saveT = setTimeout(flush, 900);
  }
  function flush() {
    if (!ED || ED.saved) return true;
    clearTimeout(ED.saveT);
    var r = ED.store.update(ED.lid, ED.c);
    ED.saved = r.ok;
    if (!r.ok && ED.o.toast) ED.o.toast(r.error);
    info();
    return r.ok;
  }

  /* ---------- 部品を探す・置く ---------- */
  function findPart(id) { for (var i = 0; i < ED.c.parts.length; i++) if (ED.c.parts[i].id === id) return ED.c.parts[i]; return null; }
  // quiet：置いたばかりの部品は、スマホでは設定の板を出さない（もう一度タップすると出る）
  function select(id, quiet) { ED.sel = id; ED.quiet = !!(id && quiet); inspector(); ED.dirtyDraw = true; draw(); }
  function defaultsFor(type, x, y) {
    var p = { id: R.nextPartId(ED.c), part_id: type, x: x, y: y };
    switch (type) {
      case 'floor': p.len = 1; p.dir = 'h'; p.skin = ED.last.skin; break;
      case 'mover': p.x2 = Math.min(GW - 3, x + 4); p.y2 = y; p.speed = 2; if (p.x2 === x) p.x2 = Math.max(0, x - 4); break;
      case 'pit': p.len = 2; break;
      case 'trap': p.rate = 2; p.dir = 'up'; break;
      case 'door': { var used = {}; ED.c.parts.forEach(function (q) { if (q.part_id === 'door') used[q.color] = 1; }); p.color = [0, 1, 2, 3].filter(function (c) { return !used[c]; })[0]; if (p.color == null) p.color = 0; break; }
      case 'water': p.len = 3; break;
      case 'refill': p.count = 1; p.jutsu = 'mizu'; break;
      case 'deco': p.kind = ED.last.deco; p.dir = 'r'; break;
    }
    return p;
  }
  // 候補の部品が「重なり・はみ出し・範囲」の問題を起こさないか
  function placeOk(c, p) {
    var v = R.validate(c), bad = null;
    v.errors.forEach(function (e) { if (!bad && e.id === p.id && (e.code === 'overlap' || e.code === 'range' || e.code === 'param' || e.code === 'mover0')) bad = e; });
    if (!bad && p.part_id === 'check') { var n = c.parts.filter(function (q) { return q.part_id === 'check'; }).length; if (n > D.LIMIT.checkpoints) bad = { msg: 'チェックポイントは' + D.LIMIT.checkpoints + 'つまでです。' }; }
    if (!bad && c.parts.length > D.LIMIT.parts) bad = { msg: '部品は' + D.LIMIT.parts + '個までです。' };
    if (!bad && D.PARTS[p.part_id].active && R.countActive(c) > D.LIMIT.active) bad = { msg: '動作する仕掛けは' + D.LIMIT.active + '個までです。' };
    return bad;
  }
  function tryPlace(type, x, y) {
    if (x < 0 || x >= GW || y < 0 || y >= GH) return null;
    var p = defaultsFor(type, x, y), test = clone(ED.c);
    test.parts.push(p);
    if (type === 'switch') linkNewSwitch(test, p);
    var bad = placeOk(test, p);
    if (bad) { SND.play('ng'); ED.o.toast && ED.o.toast('ここには置けません：' + bad.msg); return null; }
    change(function (c) { c.parts.push(clone(p)); if (type === 'switch') linkNewSwitch(c, p); });
    ED.store.log('part_place', { part: type });
    if (ED.o.onEvent) ED.o.onEvent('part_place', type);
    return p;
  }
  // 新しいスイッチは、まだスイッチのない扉（なければ最後の扉）につなぐ
  function linkNewSwitch(c, sw) {
    var doors = c.parts.filter(function (q) { return q.part_id === 'door'; });
    if (!doors.length) return;
    var linked = {}; (c.connections || []).forEach(function (k) { linked[k.to] = 1; });
    var d = doors.filter(function (q) { return !linked[q.id]; })[0] || doors[doors.length - 1];
    c.connections = (c.connections || []).filter(function (k) { return k.from !== sw.id; });
    c.connections.push({ from: sw.id, to: d.id });
  }
  function removePart(id) {
    var p = findPart(id); if (!p) return;
    if (p.part_id === 'start' || p.part_id === 'goal') { SND.play('ng'); ED.o.toast && ED.o.toast(D.PARTS[p.part_id].name + 'は消せません（動かすことはできます）。'); return; }
    change(function (c) { c.parts = c.parts.filter(function (q) { return q.id !== id; }); c.connections = (c.connections || []).filter(function (k) { return k.from !== id && k.to !== id; }); }, true);
    SND.play('erase');
    if (ED.sel === id) select(null);
  }
  function rotate() {
    var p = ED.sel && findPart(ED.sel); if (!p) return;
    var test = clone(ED.c), q = test.parts.filter(function (x) { return x.id === p.id; })[0];
    if (q.part_id === 'floor') q.dir = q.dir === 'v' ? 'h' : 'v';
    else if (q.part_id === 'trap') q.dir = q.dir === 'down' ? 'up' : 'down';
    else if (q.part_id === 'deco') q.dir = q.dir === 'l' ? 'r' : 'l';
    else { ED.o.toast && ED.o.toast('この部品は回転できません。'); return; }
    var bad = placeOk(test, q);
    if (bad) { SND.play('ng'); ED.o.toast && ED.o.toast('回転できません：' + bad.msg); return; }
    change(function (c) { c.parts = test.parts; });
  }
  function setParam(id, k, val) {
    var test = clone(ED.c), q = test.parts.filter(function (x) { return x.id === id; })[0]; if (!q) return;
    q[k] = val;
    var bad = placeOk(test, q);
    if (bad) { SND.play('ng'); ED.o.toast && ED.o.toast('変えられません：' + bad.msg); return; }
    if (q.part_id === 'floor' && k === 'skin') ED.last.skin = val;
    if (q.part_id === 'deco' && k === 'kind') ED.last.deco = val;
    change(function (c) { c.parts = test.parts; });
  }
  function linkSwitch(swId, doorId) {
    change(function (c) { c.connections = (c.connections || []).filter(function (k) { return k.from !== swId; }); if (doorId) c.connections.push({ from: swId, to: doorId }); });
  }

  /* ---------- 指・マウス ---------- */
  function cellAt(e) {
    var cv = $('ed-cv'), r = cv.getBoundingClientRect(), k = cv.width / r.width;
    return ED.view.cell((e.clientX - r.left) * k, (e.clientY - r.top) * k);
  }
  function onDown(e) {
    if (!ED) return;
    e.preventDefault();
    try { $('ed-cv').setPointerCapture(e.pointerId); } catch (x) { /* なし */ }
    ED.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ED.ptrs);
    if (ids.length >= 2) { // 2本指：左右に動かす
      if (ED.drag) cancelDrag();
      ED.pan = { x: midX(), cam: ED.view.camX };
      return;
    }
    if (e.button === 1 || e.button === 2) { ED.pan = { x: e.clientX, cam: ED.view.camX }; return; }
    var c = cellAt(e);
    ED.focus = null;
    var hit = R.partAt(ED.c, c.x, c.y, ED.sel ? findPart(ED.sel) && findPart(ED.sel).part_id : null);
    // 選んでいる移動足場の B（終点）をつかむ
    var sp = ED.sel && findPart(ED.sel);
    if (sp && sp.part_id === 'mover' && c.y === sp.y2 && c.x >= sp.x2 && c.x < sp.x2 + 3) { startDrag('moverB', sp, c); return; }
    if (ED.tool === 'erase') { if (hit) removePart(hit.id); return; }
    if (ED.tool === 'place' && !hit) {
      var p = tryPlace(ED.type, c.x, c.y);
      if (p) { select(p.id, true); if (p.part_id === 'floor') startDrag('stretch', findPart(p.id), c); }
      return;
    }
    if (hit) { select(hit.id); startDrag('move', hit, c); }
    else select(null);
  }
  function startDrag(kind, p, c) { ED.drag = { kind: kind, id: p.id, from: c, orig: clone(p), before: JSON.stringify(ED.c), ghost: null, moved: false }; }
  function cancelDrag() { if (!ED.drag) return; if (ED.drag.moved) { ED.c = JSON.parse(ED.drag.before); refresh(); } ED.drag = null; }
  function midX() { var ids = Object.keys(ED.ptrs), s = 0; ids.forEach(function (i) { s += ED.ptrs[i].x; }); return s / ids.length; }
  function onMove(e) {
    if (!ED || !(e.pointerId in ED.ptrs)) { if (ED && ED.tool === 'place' && e.pointerType === 'mouse') hover(e); return; }
    ED.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var cv = $('ed-cv'), k = cv.width / cv.getBoundingClientRect().width;
    if (ED.pan) { var x = Object.keys(ED.ptrs).length >= 2 ? midX() : e.clientX; ED.view.camX = ED.pan.cam - (x - ED.pan.x) * k / ED.view.T; clampCam(); ED.dirtyDraw = true; draw(); return; }
    var d = ED.drag; if (!d) return;
    var c = cellAt(e), dx = c.x - d.from.x, dy = c.y - d.from.y, p = findPart(d.id);
    if (!p) return;
    var q = clone(d.orig);
    if (d.kind === 'move') { q.x = d.orig.x + dx; q.y = d.orig.y + dy; if (q.part_id === 'mover') { q.x2 = d.orig.x2 + dx; q.y2 = d.orig.y2 + dy; } }
    else if (d.kind === 'moverB') { q.x2 = Math.max(0, Math.min(GW - 3, d.orig.x2 + dx)); q.y2 = Math.max(0, Math.min(GH - 1, d.orig.y2 + dy)); }
    else if (d.kind === 'stretch') {
      if (Math.abs(dy) > Math.abs(dx)) { q.dir = 'v'; q.x = d.orig.x; q.y = Math.min(d.from.y, c.y); q.len = Math.min(16, Math.abs(dy) + 1); }
      else { q.dir = 'h'; q.y = d.orig.y; q.x = Math.min(d.from.x, c.x); q.len = Math.min(16, Math.abs(dx) + 1); }
    }
    if (dx || dy) d.moved = true;
    var test = JSON.parse(d.before), idx = -1;
    test.parts.forEach(function (x, i) { if (x.id === q.id) idx = i; });
    test.parts[idx] = q;
    var bad = placeOk(test, q);
    d.ghost = { part: q, ok: !bad };
    if (!bad) { ED.c = test; ED.layer = null; }
    ED.dirtyDraw = true; draw();
  }
  function onUp(e) {
    if (!ED) return;
    delete ED.ptrs[e.pointerId];
    if (ED.pan) { if (!Object.keys(ED.ptrs).length) ED.pan = null; return; }
    var d = ED.drag; ED.drag = null;
    if (!d) return;
    if (d.moved) {
      var after = JSON.stringify(ED.c);
      if (after !== d.before) { ED.undo.push(d.before); if (ED.undo.length > D.LIMIT.history) ED.undo.shift(); ED.redo = []; ED.saved = false; scheduleSave(); SND.play('place'); }
      else if (d.ghost && !d.ghost.ok) { SND.play('ng'); if (ED.o.toast) ED.o.toast('そこには動かせません。'); }
    }
    refresh();
  }
  function hover(e) { var c = cellAt(e); if (ED.hover && ED.hover.x === c.x && ED.hover.y === c.y) return; ED.hover = c; }
  function onWheel(e) { if (!ED) return; e.preventDefault(); ED.view.camX += (e.deltaX || e.deltaY) / ED.view.T * dpr(); clampCam(); ED.dirtyDraw = true; draw(); }
  function onMini(e) {
    if (!ED) return;
    var mc = $('ed-mini-cv'), r = mc.getBoundingClientRect(), tw = (ED.miniThumb ? ED.miniThumb.width : mc.width) / (mc.width / r.width), ox = (r.width - tw) / 2;
    var gx = (e.clientX - r.left - ox) / tw * GW;
    ED.view.camX = gx - ED.view.visCols / 2; clampCam(); ED.dirtyDraw = true; draw();
  }
  function onKey(e) {
    if (!ED || document.getElementById('scr-editor').className.indexOf(' on') < 0) return;
    if (document.getElementById('modal').hidden === false) return;
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); }
    else if (e.code === 'Delete' || e.code === 'Backspace') { if (ED.sel) { e.preventDefault(); removePart(ED.sel); } }
    else if (e.code === 'KeyR' && !ctrl) rotate();
    else if (e.code === 'ArrowLeft') { ED.view.camX -= 1; clampCam(); draw(); }
    else if (e.code === 'ArrowRight') { ED.view.camX += 1; clampCam(); draw(); }
    else if (e.code === 'Escape') select(null);
  }
  function bind() {
    var cv = $('ed-cv');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    var mini = $('ed-mini');
    mini.addEventListener('pointerdown', function (e) { mini.setPointerCapture(e.pointerId); mini._d = true; onMini(e); });
    mini.addEventListener('pointermove', function (e) { if (mini._d) onMini(e); });
    mini.addEventListener('pointerup', function () { mini._d = false; });
    document.addEventListener('keydown', onKey);
    document.querySelectorAll('#ed-tools button').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); if (b.dataset.tool !== 'select') select(null); }); });
    $('ed-undo').addEventListener('click', function () { undo(); });
    $('ed-redo').addEventListener('click', function () { redo(); });
    $('ed-rotate').addEventListener('click', function () { rotate(); });
    $('ed-delete').addEventListener('click', function () { if (ED && ED.sel) removePart(ED.sel); else if (ED && ED.o.toast) ED.o.toast('消す部品をえらんでください（または「消す」でマスをタップ）。'); });
    root.addEventListener('resize', function () { if (ED) resize(); });
  }

  /* ---------- 上の情報と右の設定 ---------- */
  function info() {
    if (!ED) return;
    var c = ED.c, n = c.parts.length, act = R.countActive(c), v = ED.store.draftOf(ED.lid), st = v ? v.state : 'draft';
    var stTxt = root.KK_STORE.STATES[st] || st;
    if (!ED.saved) stTxt = '編集中';
    $('ed-info').innerHTML = '<span class="ttl" id="ed-title">' + esc(R.titleText(c.title)) + '</span>' +
      '<span>' + esc(D.THEMES[c.theme].name) + '</span>' +
      '<span>部品 <b>' + n + '</b>/' + D.LIMIT.parts + '</span><span>仕掛け <b>' + act + '</b>/' + D.LIMIT.active + '</span>' +
      '<span class="pill ' + (st === 'cleared' ? 'green' : st === 'invalid' ? 'shu' : '') + '">' + esc(stTxt) + '</span>' +
      '<span class="muted">' + (ED.saved ? '保存済み' : '保存中…') + '</span>';
    var ck = $('ed-check'), val = ED.val;
    if (val) {
      ck.classList.toggle('ok', val.ok && !val.warnings.length); ck.classList.toggle('warn', !val.ok || val.warnings.length > 0);
      ck.textContent = val.ok ? (val.warnings.length ? '検証 ⚠' + val.warnings.length : '検証 ✓') : '検証 ✕' + val.errors.length;
    }
    $('ed-undo').disabled = !ED.undo.length; $('ed-redo').disabled = !ED.redo.length;
    $('ed-rotate').disabled = !(ED.sel && /floor|trap|deco/.test((findPart(ED.sel) || {}).part_id || ''));
    var full = n >= D.LIMIT.parts, afull = act >= D.LIMIT.active;
    document.querySelectorAll('#ed-palette .pal').forEach(function (b) { b.classList.toggle('full', full || (afull && D.PARTS[b.dataset.part].active)); });
    var t = $('ed-title'); if (t) t.onclick = function () { if (ED.o.onTitle) ED.o.onTitle(); };
  }
  function stepper(label, val, min, max, fn) {
    return '<div class="field"><label>' + label + '</label><div class="stepper"><button data-step="-1">−</button><b>' + val + '</b><button data-step="1">＋</button></div></div>';
  }
  function choice(label, opts, cur, key) {
    return '<div class="field"><label>' + label + '</label><div class="choice" data-key="' + key + '">' + opts.map(function (o) {
      return '<button data-val="' + o[0] + '" class="' + (String(o[0]) === String(cur) ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div></div>';
  }
  function inspector() {
    if (!ED) return;
    var el = $('ed-inspector'), p = ED.sel && findPart(ED.sel);
    if (!p) {
      el.classList.add('empty'); el.classList.remove('quiet');
      var c = ED.c;
      el.innerHTML = '<h3>この試験</h3><p class="desc">' + esc(R.titleText(c.title)) + '（' + esc(D.THEMES[c.theme].name) + '）</p>' +
        '<div class="row"><button class="btn small" data-act="title">題名と外観</button><button class="btn small" data-act="history">保存の履歴</button></div>' +
        '<p class="insp-empty" style="margin-top:10px">パーツをえらんでマスをタップすると置けます。足場はなぞると長くなります。置いた部品をタップすると、ここで設定を変えられます。</p>' +
        '<p class="insp-empty">スマホ：2本指で左右に動かせます。上の細い帯をタップしても移動できます。</p>';
      bindInspector(el, null);
      return;
    }
    el.classList.remove('empty');
    el.classList.toggle('quiet', !!ED.quiet);
    var P = D.PARTS[p.part_id], h = '<h3>' + esc(P.name) + '<button class="btn small ghost insp-close" data-act="close">とじる</button></h3><p class="desc">' + esc(P.desc) + '</p>';
    switch (p.part_id) {
      case 'floor': h += stepper('長さ', p.len) + choice('向き', [['h', '横'], ['v', '縦（かべ）']], p.dir, 'dir') + choice('外観', D.THEMES[ED.c.theme].skins.map(function (s, i) { return [i, s]; }), p.skin, 'skin'); break;
      case 'mover': h += choice('速さ', [[1, 'ゆっくり'], [2, 'ふつう'], [3, 'はやい']], p.speed, 'speed') + '<p class="desc">終点は、マス目の「B」の足場をドラッグして動かします（いまは 横' + (p.x2 - p.x) + '・縦' + (p.y2 - p.y) + 'マス）。点線が通り道です。</p>'; break;
      case 'pit': h += stepper('幅', p.len); break;
      case 'trap': h += choice('間隔', [[1, 'ゆっくり'], [2, 'ふつう'], [3, 'はやい']], p.rate, 'rate') + choice('向き', [['up', '上向き（床）'], ['down', '下向き（天井）']], p.dir, 'dir') + '<p class="desc">光って知らせる時間はいつも同じ（0.75秒）です。</p>'; break;
      case 'door': h += choice('色と形', D.COLORS.map(function (c) { return [c.id, '<span class="sw" style="background:' + c.col + '"></span>' + c.name + c.mark]; }), p.color, 'color'); break;
      case 'switch': {
        var doors = ED.c.parts.filter(function (q) { return q.part_id === 'door'; }), cur = (ED.c.connections || []).filter(function (k) { return k.from === p.id; })[0];
        h += '<div class="field"><label>つなぐ扉</label><div class="choice" data-link="1">' + (doors.length ? doors.map(function (d) { var c = D.COLORS[d.color]; return '<button data-door="' + d.id + '" class="' + (cur && cur.to === d.id ? 'on' : '') + '"><span class="sw" style="background:' + c.col + '"></span>' + c.name + c.mark + '（' + d.x + ',' + d.y + '）</button>'; }).join('') : '<span class="insp-empty">先に扉を置いてください。</span>') + '</div></div>';
        if (!cur) h += '<p class="desc" style="color:#c8452c">まだどの扉ともつながっていません。</p>';
        break;
      }
      case 'water': h += stepper('長さ', p.len); break;
      case 'refill': h += '<div class="field"><label>術</label><b>' + D.JUTSU.mizu.name + '</b>（この版では1種類）</div>' + choice('回数', [[1, '1回'], [2, '2回'], [3, '3回']], p.count, 'count'); break;
      case 'deco': h += choice('種類', D.DECOS.map(function (d) { return [d.id, d.name]; }), p.kind, 'kind') + choice('向き', [['r', '右'], ['l', '左']], p.dir, 'dir'); break;
      default: h += '<p class="desc">ドラッグで動かせます。</p>';
    }
    h += '<div class="row" style="margin-top:8px">' + (/floor|trap|deco/.test(p.part_id) ? '<button class="btn small" data-act="rotate">⟳ 回転</button>' : '') + (p.part_id !== 'start' && p.part_id !== 'goal' ? '<button class="btn small ghost" data-act="delete">削除</button>' : '') + '</div>';
    el.innerHTML = h;
    bindInspector(el, p);
  }
  function bindInspector(el, p) {
    el.onclick = function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'close') { select(null); return; }
      if (act === 'rotate') { rotate(); return; }
      if (act === 'delete' && p) { removePart(p.id); return; }
      if (act === 'title' && ED.o.onTitle) { ED.o.onTitle(); return; }
      if (act === 'history' && ED.o.onHistory) { ED.o.onHistory(); return; }
      if (!p) return;
      if (t.dataset.step) { var k = p.part_id === 'pit' || p.part_id === 'water' || p.part_id === 'floor' ? 'len' : null; if (k) { var sp = D.PARTS[p.part_id].params[k]; var nv = Math.max(sp[0], Math.min(sp[1], p[k] + (+t.dataset.step))); if (nv !== p[k]) setParam(p.id, k, nv); } return; }
      if (t.dataset.door) { linkSwitch(p.id, t.dataset.door); return; }
      var box = t.closest('.choice'); if (box && box.dataset.key) { var key = box.dataset.key, raw = t.dataset.val, val = /^\d+$/.test(raw) ? +raw : raw; setParam(p.id, key, val); }
    };
  }
  function focusCell(at) { if (!ED || !at) return; ED.focus = at; ED.view.camX = at.x - ED.view.visCols / 2; clampCam(); ED.dirtyDraw = true; draw(); setTimeout(function () { if (ED && ED.focus === at) { ED.focus = null; ED.dirtyDraw = true; } }, 2600); }

  root.KK_EDITOR = {
    open: open, close: close, bind: bind, resize: resize, flush: flush, undo: undo, redo: redo, setContent: setContent, focusCell: focusCell, select: select,
    content: function () { return ED && ED.c; }, levelId: function () { return ED && ED.lid; }, validation: function () { return ED && (ED.val || R.validate(ED.c)); }, active: function () { return !!ED; },
    setTheme: function (th) { change(function (c) { c.theme = th; }); buildPalette(); setTool(ED.tool); },
    setTitle: function (t) { change(function (c) { c.title = R.cleanTitle(t); }, true); },
    // テスト用
    _place: tryPlace, _remove: removePart, _set: setParam,
    _cellClient: function (x, y) { // マスの中心の、画面上の位置（見えるようにカメラを寄せる）
      var cv = $('ed-cv'), r = cv.getBoundingClientRect(), k = cv.width / r.width, v = ED.view;
      if (x + 1 > v.camX + v.visCols || x < v.camX) { v.camX = x - v.visCols / 2; clampCam(); draw(); }
      return { x: r.left + (x + 0.5 - v.camX) * v.T / k, y: r.top + (v.bottom0 - (y + 0.5 - v.camY) * v.T) / k };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
