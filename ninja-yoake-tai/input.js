/* ニンジャ夜明け隊 — 入力（PC とタッチ）
 * PC：WASD／矢印で移動、マウスでねらう、Q・E＝忍術、R／右クリック＝役割技、スペース＝回避、F・G＝設置など、1・2・3＝合図
 * タッチ：左で自由スティック、通常攻撃は自動、技と回避はボタン（タップ＝標的補助で自動でねらう／引っぱる＝自分でねらう）
 * ここで作るのは「入力の意図」だけ。判定はすべて sim.js がする。
 */
(function (root) {
  'use strict';
  var RN = function () { return root.NYT_RENDER; };
  var I = {
    keys: {}, edge: {}, mouse: { x: 0, y: 0, t: -99, inside: false },
    stick: { id: null, ox: 0, oy: 0, dx: 0, dy: 0, el: null, knob: null },
    drag: null, act: null, hold: null, ping: null, pin: null, touch: false, now: 0, enabled: false, mapTap: null
  };
  var KEYMAP = { KeyQ: 'j0', KeyE: 'j1', KeyR: 'sp', Space: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyF: 'ctx1', KeyG: 'ctx2', KeyB: 'bomb', KeyT: 'ready', Enter: 'ready', Digit1: 'ping1', Digit2: 'ping2', Digit3: 'ping3', KeyZ: 'pin', Escape: 'pause', KeyP: 'pause' };

  function init(cv, opt) {
    opt = opt || {};
    I.onKey = opt.onKey || function () {};
    root.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      var k = e.code;
      if (!I.keys[k]) { var a = KEYMAP[k]; if (a) { I.edge[a] = true; I.onKey(a); } }
      I.keys[k] = true;
      if (I.enabled && (k === 'Space' || k.indexOf('Arrow') === 0)) e.preventDefault();
    });
    root.addEventListener('keyup', function (e) { I.keys[e.code] = false; });
    root.addEventListener('blur', function () { I.keys = {}; stickEnd(); });
    cv.addEventListener('mousemove', function (e) { I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.t = I.now; I.mouse.inside = true; });
    cv.addEventListener('mouseleave', function () { I.mouse.inside = false; });
    cv.addEventListener('mousedown', function (e) {
      I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.t = I.now;
      if (e.button === 2) I.edge.sp = true; else { I.edge.click = true; I.mouse.down = true; I.mapTap = { x: e.clientX, y: e.clientY }; }
    });
    root.addEventListener('mouseup', function (e) { if (e.button === 0) I.mouse.down = false; });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // タッチ：左半分でスティック、右側のタップはピン（ダウン中）
    cv.addEventListener('touchstart', function (e) {
      I.touch = true;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.clientX < root.innerWidth * 0.5 && I.stick.id == null) stickStart(t);
        else I.mapTap = { x: t.clientX, y: t.clientY };
      }
      if (I.enabled) e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; if (t.identifier === I.stick.id) stickMove(t); }
      if (I.enabled) e.preventDefault();
    }, { passive: false });
    var end = function (e) { for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === I.stick.id) stickEnd(); };
    cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
    I.stick.el = opt.stickEl || null; I.stick.knob = opt.stickEl ? opt.stickEl.querySelector('i') : null;
  }
  function stickStart(t) {
    I.stick.id = t.identifier; I.stick.ox = t.clientX; I.stick.oy = t.clientY; I.stick.dx = 0; I.stick.dy = 0;
    if (I.stick.el) { I.stick.el.style.left = t.clientX + 'px'; I.stick.el.style.top = t.clientY + 'px'; I.stick.el.classList.add('on'); }
  }
  function stickMove(t) {
    var dx = t.clientX - I.stick.ox, dy = t.clientY - I.stick.oy, l = Math.hypot(dx, dy), R = 56;
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    I.stick.dx = dx / R; I.stick.dy = dy / R;
    if (I.stick.knob) I.stick.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function stickEnd() {
    I.stick.id = null; I.stick.dx = 0; I.stick.dy = 0;
    if (I.stick.el) I.stick.el.classList.remove('on');
    if (I.stick.knob) I.stick.knob.style.transform = '';
  }

  // 技のボタン：タップで自動、引っぱってねらう
  function bindSkill(btn, slot) {
    var st = null;
    var down = function (e) {
      e.preventDefault(); e.stopPropagation();
      var p = e.touches ? e.touches[0] : e;
      st = { x: p.clientX, y: p.clientY, id: e.touches ? e.touches[0].identifier : 'm', aiming: false, slot: slot };
      I.drag = st;
    };
    var move = function (e) {
      if (!st) return;
      var p = pickTouch(e, st.id); if (!p) return;
      var dx = p.clientX - st.x, dy = p.clientY - st.y;
      if (Math.hypot(dx, dy) > 14) st.aiming = true;
      st.dx = dx; st.dy = dy;
      if (st.aiming) e.preventDefault();
    };
    var up = function (e) {
      if (!st) return;
      var p = pickTouch(e, st.id, true);
      if (p === null && e.changedTouches) return;
      I.edge[slot] = true;
      I.aimFrom = st.aiming ? { dx: st.dx, dy: st.dy } : null;
      st = null; I.drag = null;
    };
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('mousedown', function (e) { if (e.button !== 0) return; down(e); });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('mousemove', move);
    root.addEventListener('touchend', up); root.addEventListener('touchcancel', up);
    root.addEventListener('mouseup', up);
  }
  function pickTouch(e, id, changed) {
    if (!e.touches && !e.changedTouches) return e;
    var list = changed ? e.changedTouches : e.touches;
    for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }

  // 1回分の入力の意図（sim へ渡す）
  function intent(me, M, opt) {
    opt = opt || {};
    var it = { mx: 0, my: 0, aim: null, autoAtk: opt.autoAtk !== false };
    var k = I.keys;
    var kx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    var ky = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    if (kx || ky) { var l = Math.hypot(kx, ky); it.mx = kx / l; it.my = ky / l; }
    else { it.mx = I.stick.dx; it.my = I.stick.dy; }
    var R = RN();
    // ねらい：引っぱった向き → マウス（最近動かした）→ なし（自動）
    var range = function (slot) { return opt.rangeOf ? opt.rangeOf(slot) : 200; };
    var aimFor = function (slot) {
      if (I.aimFrom && me) { var d = Math.hypot(I.aimFrom.dx, I.aimFrom.dy) || 1, s = Math.min(1, d / 90) * range(slot); return { x: me.x + I.aimFrom.dx / d * s, y: me.y + I.aimFrom.dy / d * s }; }
      if (!I.touch && I.mouse.inside && I.now - I.mouse.t < 4 && R) return R.s2w(I.mouse.x, I.mouse.y);
      return null;
    };
    var e = I.edge;
    ['j0', 'j1', 'sp'].forEach(function (s) { if (e[s]) { it[s] = true; it.aim = aimFor(s); } });
    if (e.dodge) it.dodge = true;
    if (!opt.autoAtk && (k.KeyJ || (I.mouse.down))) it.atk = true;
    if (e.click && !opt.autoAtk) it.atk = true;
    if (I.act) { it.act = I.act; }
    else if (I.hold) it.act = I.hold;
    if (e.ctx1 && opt.ctx1) it.act = opt.ctx1;
    if (e.ctx2 && opt.ctx2) it.act = opt.ctx2;
    if (e.bomb) it.act = 'bomb';
    if (e.ready) it.act = 'ready';
    if (I.ping) it.ping = I.ping;
    if (e.ping1) it.ping = 'gather'; if (e.ping2) it.ping = 'defend'; if (e.ping3) it.ping = 'help';
    // ダウン中：タップ（クリック）した所に「安全」ピン
    if (me && me.down) {
      var tap = I.mapTap;
      if (tap && R) it.pin = R.s2w(tap.x, tap.y);
      else if (e.pin && R && I.mouse.inside) it.pin = R.s2w(I.mouse.x, I.mouse.y);
    }
    if (it.act === 'bomb' && !it.aim) it.aim = aimFor('bomb');
    // 使った1回ものの入力を消す
    I.edge = {}; I.act = null; I.ping = null; I.mapTap = null; I.aimFrom = null;
    return it;
  }
  // PC の照準（画面に出す）
  function reticle(me, range) {
    var R = RN();
    if (I.drag && I.drag.aiming && me) { var d = Math.hypot(I.drag.dx, I.drag.dy) || 1, s = Math.min(1, d / 90) * range; return { x: me.x + I.drag.dx / d * s, y: me.y + I.drag.dy / d * s, ok: true }; }
    if (!I.touch && I.mouse.inside && I.now - I.mouse.t < 4 && R && me) { var w = R.s2w(I.mouse.x, I.mouse.y); var ok = Math.hypot(w.x - me.x, w.y - me.y) <= range; return { x: w.x, y: w.y, ok: ok }; }
    return null;
  }
  function clear() { I.keys = {}; I.edge = {}; I.act = null; I.hold = null; I.ping = null; I.mapTap = null; I.aimFrom = null; stickEnd(); }

  var api = { I: I, init: init, bindSkill: bindSkill, intent: intent, reticle: reticle, clear: clear,
    setAct: function (a) { I.act = a; }, setHold: function (a) { I.hold = a; }, setPing: function (p) { I.ping = p; }, tick: function (t) { I.now = t; } };
  root.NYT_INPUT = api;
})(typeof window !== 'undefined' ? window : globalThis);
