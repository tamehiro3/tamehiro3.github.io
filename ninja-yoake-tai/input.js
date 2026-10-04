/* ニンジャ夜明け隊（RPG） — 入力（キーボード・タッチ・マウス）
 * キー → 意味（up/down/left/right/ok/back/menu/fast/auto/minus/plus）に直して game.js へ渡す。
 * 画面をなぞると歩く（指の位置に小さなスティック）。さっと触れるだけなら「タップ」として、行き先・ねらう相手に使う。
 */
(function (root) {
  'use strict';
  var KEYMAP = {
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    Enter: 'ok', ' ': 'ok', z: 'ok', Z: 'ok', Escape: 'back', x: 'back', X: 'back', Backspace: 'back',
    m: 'menu', M: 'menu', Tab: 'menu', f: 'fast', F: 'fast', r: 'auto', R: 'auto', q: 'minus', Q: 'minus', e: 'plus', E: 'plus'
  };
  var DIRK = { up: 1, down: 1, left: 1, right: 1 };
  var IN = { held: [], stick: null, h: null, cv: null, stickEl: null, enabled: true };

  function init(cv, handlers) {
    IN.cv = cv; IN.h = handlers; IN.stickEl = document.getElementById('stick');
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k && DIRK[k]) IN.held = IN.held.filter(function (x) { return x !== k; }); });
    root.addEventListener('blur', function () { IN.held = []; endStick(); });
    cv.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    document.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.isTrusted) markTouch(e.pointerType !== 'mouse'); }, true);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function markTouch(touch) {
    var UI = root.NYT_UI; if (!UI) return;
    UI.kbd = false;
    document.body.classList.toggle('no-kbd', !!touch);
  }
  function onKey(e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.key === 'Enter' && IN.h.onKey) { IN.h.onKey('ok', e); } return; }
    var k = KEYMAP[e.key];
    if (!k) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var UI = root.NYT_UI; if (UI) { UI.kbd = true; document.body.classList.remove('no-kbd'); }
    // ボタンにフォーカスがあるときの Enter・スペースは、ボタン自身が押される
    if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (k === 'menu' && e.key === 'Tab') e.preventDefault();
    if (e.key === ' ' || DIRK[k] || e.key === 'Backspace') e.preventDefault();
    if (DIRK[k] && !e.repeat) { IN.held = IN.held.filter(function (x) { return x !== k; }); IN.held.push(k); }
    if (IN.h.onKey) IN.h.onKey(k, e);
  }
  // ---- タッチ・マウス ----
  function onDown(e) {
    if (!IN.enabled) return;
    if (e.button != null && e.button > 0) return;
    if (IN.stick) return;
    IN.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false, type: e.pointerType };
    try { IN.cv.setPointerCapture(e.pointerId); } catch (er) { }
    if (IN.h.onPress) IN.h.onPress(e.clientX, e.clientY);
  }
  function onMove(e) {
    var s = IN.stick; if (!s || e.pointerId !== s.id) return;
    s.x = e.clientX; s.y = e.clientY;
    var dx = s.x - s.x0, dy = s.y - s.y0;
    if (!s.moved && Math.hypot(dx, dy) > 14) {
      s.moved = true;
      if (IN.h.stickOK && IN.h.stickOK()) showStick(s);
    }
    if (s.moved && IN.stickEl && !IN.stickEl.hidden) {
      var L = Math.min(40, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
      IN.stickEl.firstChild.style.transform = 'translate(' + Math.cos(a) * L + 'px,' + Math.sin(a) * L + 'px)';
    }
  }
  function onUp(e) {
    var s = IN.stick; if (!s || e.pointerId !== s.id) return;
    var quick = !s.moved && performance.now() - s.t0 < 450;
    endStick();
    if (quick && IN.h.onTap) IN.h.onTap(s.x0, s.y0);
  }
  function showStick(s) { var el = IN.stickEl; if (!el) return; el.hidden = false; el.style.left = s.x0 + 'px'; el.style.top = s.y0 + 'px'; }
  function endStick() { IN.stick = null; if (IN.stickEl) { IN.stickEl.hidden = true; IN.stickEl.firstChild.style.transform = ''; } }
  // いま押している向き（キーが先、なければスティック）
  function dir() {
    if (IN.held.length) return IN.held[IN.held.length - 1];
    var s = IN.stick;
    if (s && s.moved) {
      var dx = s.x - s.x0, dy = s.y - s.y0;
      if (Math.hypot(dx, dy) < 14) return null;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    return null;
  }
  function stickActive() { return !!(IN.stick && IN.stick.moved); }
  function clear() { IN.held = []; endStick(); }

  root.NYT_INPUT = { init: init, dir: dir, stickActive: stickActive, clear: clear, state: IN };
})(typeof window !== 'undefined' ? window : globalThis);
