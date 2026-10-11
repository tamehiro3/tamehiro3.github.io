/* ニンジャからくり工房 — 効果音（WebAudio で作る。音のファイルは使わない） */
(function (root) {
  'use strict';
  var ctx = null, on = true;
  function ac() {
    if (!on) return null;
    if (!ctx) { try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f0, f1, dur, type, vol, delay) {
    var a = ac(); if (!a) return;
    var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, hp) {
    var a = ac(); if (!a) return;
    var n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 800;
    s.buffer = b; g.gain.value = vol || 0.08; s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  }
  var SFX = {
    jump: function () { tone(420, 880, 0.12, 'square', 0.05); },
    land: function () { tone(160, 90, 0.07, 'triangle', 0.06); },
    die: function () { tone(520, 120, 0.28, 'sawtooth', 0.05); noise(0.18, 0.05, 1200); },
    respawn: function () { tone(660, 990, 0.1, 'triangle', 0.05); },
    'switch': function () { tone(880, 0, 0.05, 'square', 0.06); tone(1320, 0, 0.06, 'square', 0.05, 0.05); },
    door: function () { noise(0.25, 0.04, 400); tone(220, 330, 0.25, 'triangle', 0.04); },
    refill: function () { [880, 1175, 1568].forEach(function (f, i) { tone(f, 0, 0.09, 'triangle', 0.05, i * 0.06); }); },
    jutsu: function () { noise(0.3, 0.05, 2000); tone(300, 900, 0.3, 'sine', 0.06); },
    jutsuEnd: function () { tone(700, 300, 0.2, 'sine', 0.05); },
    check: function () { tone(784, 0, 0.1, 'triangle', 0.06); tone(1047, 0, 0.16, 'triangle', 0.06, 0.09); },
    clear: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.14, 'triangle', 0.07, i * 0.1); }); },
    timeout: function () { tone(330, 110, 0.5, 'sawtooth', 0.05); },
    place: function () { tone(600, 0, 0.04, 'triangle', 0.05); },
    erase: function () { tone(300, 180, 0.07, 'triangle', 0.05); },
    ng: function () { tone(180, 140, 0.15, 'square', 0.05); },
    tap: function () { tone(900, 0, 0.03, 'triangle', 0.04); },
    splash: function () { noise(0.3, 0.07, 500); }
  };
  root.KK_SOUND = {
    play: function (name) { if (on && SFX[name]) { try { SFX[name](); } catch (e) { /* 音が出せない端末 */ } } },
    set: function (v) { on = !!v; },
    unlock: function () { ac(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
