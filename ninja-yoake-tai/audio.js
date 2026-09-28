/* ニンジャ夜明け隊 — 音（WebAudio で合成。音声ファイルは使わない）
 * 呪符使いの「発射前の音」は、目で見なくても気づけるよう高めの2音にしている。
 */
(function (root) {
  'use strict';
  var A = { ctx: null, out: null, on: true, last: {}, bgmOn: true, bgmT: 0, bgmStep: 0, tempo: 0.42, scale: [0, 2, 4, 7, 9, 12, 14] };
  function ensure() {
    if (!A.ctx) {
      var C = root.AudioContext || root.webkitAudioContext;
      if (!C) return null;
      try { A.ctx = new C(); A.out = A.ctx.createGain(); A.out.gain.value = 0.32; A.out.connect(A.ctx.destination); } catch (e) { A.ctx = null; return null; }
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  }
  function tone(f, dur, type, vol, slide, delay) {
    var c = A.ctx; if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, f + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.out); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(dur, vol, freq, delay, type) {
    var c = A.ctx; if (!c) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var t0 = c.currentTime + (delay || 0);
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = type || 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol || 0.2, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(A.out); s.start(t0); s.stop(t0 + dur + 0.02);
  }
  function arp(base, steps, gap, type, vol) { steps.forEach(function (st, i) { tone(base * Math.pow(2, st / 12), 0.22, type || 'triangle', vol || 0.14, 0, i * gap); }); }
  var SFX = {
    slash: function () { noise(0.07, 0.12, 3200); },
    hit: function () { tone(260, 0.05, 'square', 0.06, -90); },
    fire: function () { noise(0.35, 0.28, 700); tone(140, 0.3, 'sawtooth', 0.07, -70); },
    water: function () { tone(620, 0.16, 'sine', 0.16, -320); tone(880, 0.12, 'sine', 0.1, -420, 0.07); },
    wind: function () { noise(0.4, 0.2, 1400); },
    stone: function () { tone(90, 0.28, 'triangle', 0.3, -30); noise(0.15, 0.12, 300); },
    thunder: function () { noise(0.28, 0.25, 5200); tone(1300, 0.06, 'square', 0.07, -1000); },
    heal: function () { arp(660, [0, 4, 7, 12], 0.07, 'sine', 0.12); },
    dome: function () { tone(420, 0.45, 'sine', 0.16, 220); tone(630, 0.45, 'sine', 0.08, 330); },
    issen: function () { noise(0.18, 0.22, 4200); tone(900, 0.12, 'triangle', 0.08, 600); },
    dodge: function () { noise(0.12, 0.14, 2600); },
    warn: function () { tone(1560, 0.1, 'square', 0.08); tone(1560, 0.1, 'square', 0.08, 0, 0.16); },
    bossWarn: function () { tone(78, 0.7, 'sawtooth', 0.18, -18); tone(117, 0.7, 'sine', 0.12, -20); },
    drum: function () { tone(68, 0.3, 'sine', 0.45, -25); noise(0.06, 0.2, 400); tone(68, 0.3, 'sine', 0.35, -25, 0.28); },
    combo: function () { arp(784, [0, 5, 7, 12, 17], 0.05, 'triangle', 0.13); },
    purify: function () { tone(1180, 0.09, 'sine', 0.05, 380); },
    down: function () { tone(330, 0.45, 'triangle', 0.16, -210); },
    rescue: function () { arp(523, [0, 7, 12, 16], 0.08, 'sine', 0.14); },
    trap: function () { noise(0.3, 0.3, 520, 0, 'lowpass'); tone(110, 0.2, 'square', 0.08, -40); },
    gather: function () { tone(940, 0.05, 'sine', 0.06); },
    repair: function () { tone(700, 0.05, 'triangle', 0.06, 200); },
    click: function () { tone(760, 0.04, 'sine', 0.08); },
    support: function () { arp(392, [0, 4, 7, 11, 14, 19], 0.06, 'sine', 0.13); },
    win: function () { arp(523, [0, 2, 4, 7, 9, 12, 16, 19, 24], 0.1, 'triangle', 0.16); },
    lose: function () { arp(392, [7, 5, 2, 0, -5], 0.16, 'triangle', 0.13); },
    ping: function () { tone(1040, 0.08, 'sine', 0.1); tone(1300, 0.1, 'sine', 0.08, 0, 0.08); },
    blocked: function () { tone(1400, 0.06, 'sine', 0.06, -300); }
  };
  var GAP = { hit: 0.05, slash: 0.06, purify: 0.05, gather: 0.08, repair: 0.08, warn: 0.2, blocked: 0.1 };
  function play(name) {
    if (!A.on || !SFX[name]) return;
    if (!ensure()) return;
    var t = A.ctx.currentTime, g = GAP[name] || 0.03;
    if (A.last[name] && t - A.last[name] < g) return;
    A.last[name] = t;
    SFX[name]();
  }
  // 小さな音楽（和音階の琴のような音。場面で速さを変える）
  function bgm(dt, mood) {
    if (!A.on || !A.bgmOn || !A.ctx || A.ctx.state !== 'running') return;
    A.bgmT -= dt;
    if (A.bgmT > 0) return;
    var tempo = mood === 'fight' ? 0.28 : mood === 'boss' ? 0.22 : mood === 'dawn' ? 0.36 : 0.5;
    A.bgmT = tempo;
    var base = mood === 'boss' ? 196 : 262, step = A.bgmStep++;
    var pat = mood === 'boss' ? [0, 3, 5, 7, 3, 0, 5, 3] : [0, 2, 4, 7, 4, 2, 9, 7, 4, 2, 0, 4];
    var n = pat[step % pat.length];
    if (step % 2 === 0 || mood !== 'calm') tone(base * Math.pow(2, n / 12), tempo * 1.6, 'triangle', mood === 'calm' ? 0.035 : 0.045);
    if (step % 4 === 0) tone(base / 2 * Math.pow(2, pat[(step + 4) % pat.length] / 12), tempo * 3, 'sine', 0.04);
    if ((mood === 'fight' || mood === 'boss') && step % 2 === 0) { noise(0.05, 0.05, 300, 0, 'lowpass'); }
  }
  var api = { play: play, bgm: bgm, unlock: ensure, set: function (on) { A.on = !!on; }, get on() { return A.on; } };
  root.NYT_AUDIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
