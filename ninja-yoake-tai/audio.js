/* ニンジャ夜明け隊（RPG） — 音（WebAudio で合成。音声ファイルは使わない）
 * 曲は「和の音階」で作った短いくり返し（町・野・洞・砦・天・根の国・戦い・ボス・最後の戦い・エンディング）。
 * 曲の書き方：16分音符が1歩。'd5:4' は D5 を4歩。'r:4' は休み。和音は 'd4+a4:16'。
 * 伴奏（分散和音・低音・太鼓）は、和音の並び（chords）から作る。
 */
(function (root) {
  'use strict';
  var A = { ctx: null, master: null, sfxG: null, musG: null, sound: true, music: true, cur: null, want: null, timer: null, last: {}, noise: null, jingleUntil: 0, resumeSong: null };

  function ensure() {
    if (A.ctx) { if (A.ctx.state === 'suspended') { try { A.ctx.resume(); } catch (e) { } } return A.ctx; }
    var C = root.AudioContext || root.webkitAudioContext; if (!C) return null;
    try {
      A.ctx = new C();
      A.master = A.ctx.createGain(); A.master.gain.value = 0.55;
      var comp = A.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      A.master.connect(comp); comp.connect(A.ctx.destination);
      A.sfxG = A.ctx.createGain(); A.sfxG.gain.value = A.sound ? 0.9 : 0; A.sfxG.connect(A.master);
      A.musG = A.ctx.createGain(); A.musG.gain.value = A.music ? 0.55 : 0; A.musG.connect(A.master);
      var len = A.ctx.sampleRate, buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.noise = buf;
      A.timer = setInterval(sched, 30);
    } catch (e) { A.ctx = null; return null; }
    return A.ctx;
  }
  function unlock() { var c = ensure(); if (c && A.want !== undefined && !A.cur && A.want) startSong(A.want); }

  // ---- 音を鳴らす部品 ----
  function env(g, t, a, peak, dec, sus, rel, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sus), t + a + dec);
    g.gain.setValueAtTime(Math.max(0.0002, peak * sus), t + Math.max(a + dec, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + dec, dur) + rel);
    return t + Math.max(a + dec, dur) + rel;
  }
  function osc(type, f, t, end, dest, detune) { var o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune; o.connect(dest); o.start(t); o.stop(end + 0.05); return o; }
  function gainTo(dest, v) { var g = A.ctx.createGain(); g.gain.value = v == null ? 1 : v; g.connect(dest); return g; }
  function noiseAt(t, dur, vol, type, freq, q, dest) {
    var s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    s.buffer = A.noise; f.type = type || 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || A.sfxG); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  var INS = {
    koto: function (f, t, dur, v, dest) { var g = gainTo(dest, 1), e = env(g, t, 0.004, v, 0.18, 0.25, 0.35, Math.min(dur, 0.25)); osc('triangle', f, t, e, g); var g2 = gainTo(dest, 1); env(g2, t, 0.002, v * 0.35, 0.08, 0.1, 0.1, 0.05); osc('square', f * 2, t, t + 0.3, g2); },
    flute: function (f, t, dur, v, dest) {
      var g = gainTo(dest, 1), e = env(g, t, 0.06, v, 0.1, 0.8, 0.18, dur * 0.95);
      var o = osc('sine', f, t, e, g), lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.value = f * 0.006; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t + 0.15); lfo.stop(e + 0.05);
      var g2 = gainTo(dest, 1); env(g2, t, 0.06, v * 0.18, 0.1, 0.6, 0.15, dur * 0.9); osc('triangle', f * 2, t, e, g2);
      noiseAt(t, 0.08, v * 0.25, 'bandpass', 2400, 1.2, dest);
    },
    lead: function (f, t, dur, v, dest) { var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(dest); var g = gainTo(lp, 1), e = env(g, t, 0.01, v, 0.12, 0.55, 0.08, dur * 0.9); osc('square', f, t, e, g); osc('square', f, t, e, g, 7); },
    saw: function (f, t, dur, v, dest) { var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(dest); var g = gainTo(lp, 1), e = env(g, t, 0.01, v, 0.1, 0.6, 0.08, dur * 0.9); osc('sawtooth', f, t, e, g); osc('sawtooth', f, t, e, g, -9); },
    bass: function (f, t, dur, v, dest) { var g = gainTo(dest, 1), e = env(g, t, 0.006, v, 0.15, 0.5, 0.06, dur * 0.85); osc('triangle', f, t, e, g); var g2 = gainTo(dest, 1); env(g2, t, 0.004, v * 0.3, 0.06, 0.1, 0.05, 0.04); osc('square', f, t, t + 0.2, g2); },
    pad: function (f, t, dur, v, dest) { var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(dest); var g = gainTo(lp, 1), e = env(g, t, Math.min(0.5, dur * 0.3), v, 0.2, 0.75, 0.5, dur); osc('sawtooth', f, t, e, g, -6); osc('sawtooth', f, t, e, g, 6); },
    bell: function (f, t, dur, v, dest) { [[1, 1], [2.76, 0.35], [5.4, 0.15], [2, 0.3]].forEach(function (p) { var g = gainTo(dest, 1), e = env(g, t, 0.003, v * p[1], 1.2, 0.0001, 0.2, 0.01); osc('sine', f * p[0], t, Math.min(e, t + 2.5), g); }); }
  };
  var DRUM = {
    taiko: function (t, v, dest) { var g = gainTo(dest, 1), o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); o.connect(g); o.start(t); o.stop(t + 0.5); noiseAt(t, 0.06, v * 0.4, 'lowpass', 500, 0.7, dest); },
    kick: function (t, v, dest) { var g = gainTo(dest, 1), o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); o.start(t); o.stop(t + 0.25); },
    shime: function (t, v, dest) { var g = gainTo(dest, 1), o = A.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.08); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(g); o.start(t); o.stop(t + 0.15); noiseAt(t, 0.05, v * 0.5, 'bandpass', 1800, 1, dest); },
    snare: function (t, v, dest) { noiseAt(t, 0.14, v, 'bandpass', 2200, 0.6, dest); var g = gainTo(dest, 1), o = A.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190; g.gain.setValueAtTime(v * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(g); o.start(t); o.stop(t + 0.1); },
    hat: function (t, v, dest) { noiseAt(t, 0.035, v, 'highpass', 7000, 0.7, dest); },
    wood: function (t, v, dest) { var g = gainTo(dest, 1), o = A.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1180; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); o.connect(g); o.start(t); o.stop(t + 0.06); },
    drip: function (t, v, dest) { var g = gainTo(dest, 1), o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1600, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.1); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.connect(g); o.start(t); o.stop(t + 0.2); }
  };

  // ---- 楽譜 ----
  var NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function midi(tok) {
    var m = /^([a-g])(#|b)?(-?\d)$/.exec(tok); if (!m) return null;
    return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  // 'd5:4 e5:2 r:2 d4+a4:8' → [{s, d, n:[midi]}], 長さ
  function parse(str) {
    var out = [], s = 0, last = 2;
    str.split(/\s+/).forEach(function (tok) {
      if (!tok || tok === '|') return;
      var p = tok.split(':'), d = p[1] ? +p[1] : last; last = d;
      if (p[0] !== 'r') { var ns = p[0].split('+').map(midi).filter(function (x) { return x != null; }); if (ns.length) out.push({ s: s, d: d, n: ns }); }
      s += d;
    });
    return { ev: out, len: s };
  }
  // 和音：'D' 'Bm' 'G5'（根と5度）'Asus'（根・4度・5度）
  var ROOT = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function chord(name, oct) {
    var m = /^([A-G](?:#|b)?)(m|5|sus)?$/.exec(name); if (!m) return [48];
    var r = 12 * (oct + 1) + ROOT[m[1]];
    if (m[2] === 'm') return [r, r + 3, r + 7, r + 12, r + 15];
    if (m[2] === '5') return [r, r + 7, r + 12, r + 19, r + 24];
    if (m[2] === 'sus') return [r, r + 5, r + 7, r + 12, r + 17];
    return [r, r + 4, r + 7, r + 12, r + 16];
  }
  function compile(def) {
    var tracks = [], bars = def.chords ? def.chords.split(/\s+/).length : 0;
    (def.parts || []).forEach(function (p) { var pr = parse(p.notes); tracks.push({ ins: p.ins, v: p.v, ev: pr.ev, len: pr.len }); });
    var ch = def.chords ? def.chords.split(/\s+/) : [];
    if (def.arp) {
      var ev = [], pat = def.arp.pat || [0, 1, 2, 3, 2, 1, 2, 1], step = def.arp.step || 2;
      ch.forEach(function (c, b) { var ns = chord(c, def.arp.oct || 4); for (var k = 0; k < 16 / step; k++) ev.push({ s: b * 16 + k * step, d: step, n: [ns[pat[k % pat.length] % ns.length]] }); });
      tracks.push({ ins: def.arp.ins || 'koto', v: def.arp.v, ev: ev, len: bars * 16 });
    }
    if (def.bass) {
      var bev = [];
      ch.forEach(function (c, b) {
        var ns = chord(c, def.bass.oct || 2), s = 0;
        def.bass.pat.split(/\s+/).forEach(function (tok) { var p = tok.split(':'), d = +p[1] || 4; var k = p[0]; if (k !== 'r') bev.push({ s: b * 16 + s, d: d, n: [k === 'R' ? ns[0] : k === 'F' ? ns[2] - 12 : k === 'O' ? ns[0] + 12 : k === 'T' ? ns[1] : ns[2]] }); s += d; });
      });
      tracks.push({ ins: def.bass.ins || 'bass', v: def.bass.v, ev: bev, len: bars * 16 });
    }
    if (def.pad) {
      var pev = [];
      ch.forEach(function (c, b) { var ns = chord(c, def.pad.oct || 3); pev.push({ s: b * 16, d: 16, n: ns.slice(0, 3) }); });
      tracks.push({ ins: 'pad', v: def.pad.v, ev: pev, len: bars * 16 });
    }
    var drums = [];
    for (var dk in (def.drums || {})) {
      var pt = def.drums[dk], arr = Array.isArray(pt) ? pt : [pt, 0.2];
      drums.push({ k: dk, pat: arr[0].replace(/\s/g, ''), v: arr[1] });
    }
    var len = 0; tracks.forEach(function (t) { len = Math.max(len, t.len); });
    drums.forEach(function (d) { len = Math.max(len, d.pat.length); });
    // 歩ごとに引けるように
    tracks.forEach(function (t) { t.at = {}; t.ev.forEach(function (e) { (t.at[e.s] = t.at[e.s] || []).push(e); }); });
    return { bpm: def.bpm, tracks: tracks, drums: drums, len: len, loop: def.loop !== false, swing: def.swing || 0 };
  }

  var SONGS = {
    title: { bpm: 76, chords: 'D D G A G D A D',
      parts: [{ ins: 'flute', v: 0.12, notes: 'a4:4 d5:4 e5:4 g5:4 | a5:8 g5:4 e5:4 | d5:4 e5:2 g5:2 a5:4 b5:4 | a5:12 r:4 | b5:4 a5:4 g5:4 e5:4 | d5:8 e5:4 g5:4 | e5:4 d5:4 b4:4 a4:4 | d5:12 r:4' }],
      arp: { ins: 'koto', v: 0.06, oct: 3, pat: [0, 2, 3, 4, 3, 2, 3, 2] }, bass: { v: 0.12, pat: 'R:16' }, pad: { v: 0.025, oct: 3 }, drums: { taiko: ['x.......x.......', 0.18] } },
    town: { bpm: 100, chords: 'D D G A D G A D',
      parts: [{ ins: 'koto', v: 0.13, notes: 'd5:2 e5:2 g5:4 a5:2 g5:2 e5:4 | d5:2 e5:2 g5:2 a5:2 b5:4 a5:4 | g5:2 a5:2 b5:4 a5:2 g5:2 e5:4 | g5:2 e5:2 d5:4 e5:8 | d5:2 e5:2 g5:4 a5:2 g5:2 e5:4 | d5:2 b4:2 a4:4 b4:2 d5:2 e5:4 | g5:2 e5:2 d5:2 b4:2 a4:4 b4:4 | d5:12 r:4' },
        { ins: 'flute', v: 0.05, notes: 'r:16 | r:16 | d5:16 | e5:16 | r:16 | b4:16 | a4:16 | a4:16' }],
      bass: { v: 0.14, pat: 'R:4 F:4 R:4 F:4' }, drums: { taiko: ['x.......x.......', 0.2], wood: ['....x.......x...', 0.05], hat: ['..x...x...x...x.', 0.03] } },
    town2: { bpm: 112, chords: 'C F C G C F G C',
      parts: [{ ins: 'koto', v: 0.13, notes: 'c5:2 e5:2 f5:2 g5:2 b5:4 g5:4 | f5:2 g5:2 f5:2 e5:2 c5:8 | e5:2 f5:2 g5:2 b5:2 c6:4 b5:2 g5:2 | f5:4 e5:4 g5:8 | c6:2 b5:2 g5:2 f5:2 e5:4 g5:4 | f5:2 e5:2 c5:2 e5:2 f5:8 | e5:2 f5:2 g5:4 b4:4 c5:2 e5:2 | c5:12 r:4' }],
      bass: { v: 0.14, pat: 'R:4 R:2 F:2 R:4 F:4' }, drums: { taiko: ['x.....x...x.....', 0.18], hat: ['..x...x...x...x.', 0.035], wood: ['....x.......x...', 0.05] } },
    field: { bpm: 120, chords: 'D D G A D G A D',
      parts: [{ ins: 'flute', v: 0.12, notes: 'a4:4 d5:2 e5:2 g5:4 e5:4 | a5:6 g5:2 e5:4 d5:4 | e5:4 g5:2 a5:2 b5:4 a5:4 | g5:2 e5:2 d5:4 e5:8 | a4:4 d5:2 e5:2 g5:4 a5:4 | b5:6 a5:2 g5:4 e5:4 | g5:4 e5:2 d5:2 b4:4 e5:4 | d5:12 r:4' }],
      arp: { ins: 'koto', v: 0.06, oct: 4, pat: [0, 1, 2, 3, 2, 1, 2, 1] }, bass: { v: 0.14, pat: 'R:2 R:2 F:2 R:2 R:2 F:2 R:2 F:2' }, drums: { taiko: ['x...x...x...x...', 0.16], shime: ['....x.......x...', 0.06], hat: ['..x...x...x...x.', 0.03] } },
    field2: { bpm: 92, chords: 'Esus F Am E Am C F E',
      parts: [{ ins: 'flute', v: 0.12, notes: 'e5:6 f5:2 a5:8 | b5:4 a5:4 f5:4 e5:4 | e5:6 c6:2 b5:8 | a5:4 b5:2 a5:2 f5:8 | a5:6 b5:2 c6:8 | e6:4 c6:4 b5:4 a5:4 | b5:4 a5:2 f5:2 e5:4 f5:4 | e5:16' }],
      arp: { ins: 'koto', v: 0.05, oct: 3, step: 4, pat: [0, 2, 3, 1] }, bass: { v: 0.12, pat: 'R:16' }, pad: { v: 0.02, oct: 3 }, drums: { taiko: ['x...............', 0.16], wood: ['........x.......', 0.04] } },
    field3: { bpm: 108, chords: 'G C G D G C D G',
      parts: [{ ins: 'koto', v: 0.13, notes: 'g5:2 b5:2 c6:4 d6:4 b5:4 | c6:2 b5:2 g5:4 f#5:4 g5:4 | b5:2 c6:2 d6:4 f#6:4 d6:4 | c6:4 b5:4 g5:8 | d6:2 c6:2 b5:4 c6:2 b5:2 g5:4 | f#5:2 g5:2 b5:4 c6:8 | b5:2 c6:2 d6:2 c6:2 b5:4 f#5:4 | g5:12 r:4' },
        { ins: 'flute', v: 0.04, notes: 'd5:16 | e5:16 | d5:16 | a4:16 | d5:16 | e5:16 | f#5:16 | d5:16' }],
      bass: { v: 0.14, pat: 'R:4 F:2 R:2 R:4 F:4' }, drums: { taiko: ['x.....x.x.......', 0.16], hat: ['x.x.x.x.x.x.x.x.', 0.025] } },
    field4: { bpm: 126, chords: 'Dm Dm Dm Gm Bb Gm Eb Dm',
      parts: [{ ins: 'flute', v: 0.11, notes: 'd5:2 eb5:2 g5:4 a5:2 bb5:2 a5:4 | g5:2 a5:2 eb5:4 d5:8 | d5:2 eb5:2 g5:4 a5:2 bb5:2 d6:4 | bb5:4 a5:4 g5:8 | bb5:4 a5:2 g5:2 a5:4 eb5:4 | d5:2 eb5:2 g5:2 a5:2 bb5:8 | a5:2 bb5:2 a5:2 g5:2 eb5:4 g5:4 | d5:12 r:4' }],
      bass: { v: 0.14, pat: 'R:2 R:2 F:2 R:2 T:2 R:2 F:2 R:2' }, drums: { taiko: ['x..x..x...x..x..', 0.17], shime: ['....x.......x...', 0.07] } },
    cave: { bpm: 80, chords: 'E5 F5 E5 D5',
      parts: [{ ins: 'bell', v: 0.08, notes: 'e5:8 r:8 | f5:4 c5:4 r:8 | b4:8 r:8 | a4:4 e5:4 r:8' }],
      pad: { v: 0.03, oct: 2 }, bass: { v: 0.08, pat: 'R:16' }, drums: { drip: ['......x.........' + '...........x....', 0.05] } },
    fortress: { bpm: 132, chords: 'Gm Gm Gm D Eb Ab Cm Gm',
      parts: [{ ins: 'lead', v: 0.07, notes: 'g4:2 g4:2 d5:4 c5:2 d5:2 eb5:4 | d5:2 c5:2 ab4:4 g4:8 | g4:2 g4:2 d5:4 eb5:2 f5:2 g5:4 | f5:4 eb5:4 d5:8 | g5:4 f5:2 eb5:2 d5:4 c5:4 | d5:2 eb5:2 d5:2 c5:2 ab4:8 | c5:2 d5:2 eb5:2 d5:2 c5:4 ab4:4 | g4:12 r:4' }],
      bass: { v: 0.15, pat: 'R:2 R:2 F:2 R:2 R:2 R:2 F:2 R:2' }, drums: { taiko: ['x.x...x.x.x...x.', 0.2], shime: ['..x...x...x...x.', 0.06] } },
    sky: { bpm: 88, chords: 'D G Em A G D A D',
      parts: [{ ins: 'bell', v: 0.07, notes: 'a5:4 d6:4 e6:4 a6:4 | g6:8 e6:8 | d6:4 e6:4 g6:4 b6:4 | a6:16 | b6:4 a6:4 g6:4 e6:4 | d6:8 b5:8 | a5:4 b5:4 d6:4 e6:4 | d6:16' }],
      arp: { ins: 'koto', v: 0.045, oct: 4, pat: [0, 2, 3, 4, 3, 2, 1, 2] }, pad: { v: 0.03, oct: 3 }, bass: { v: 0.09, pat: 'R:8 F:8' } },
    final_dungeon: { bpm: 96, chords: 'Bm C Em Bm Em C F#m Bm',
      parts: [{ ins: 'flute', v: 0.11, notes: 'b4:8 c5:4 e5:4 | f#5:6 g5:2 f#5:4 e5:4 | c5:8 b4:4 g4:4 | f#4:12 r:4 | e5:4 f#5:4 g5:4 b5:4 | c6:8 b5:4 g5:4 | f#5:4 e5:4 c5:4 e5:4 | b4:16' }],
      pad: { v: 0.03, oct: 2 }, bass: { v: 0.12, pat: 'R:12 F:4' }, drums: { taiko: ['x..x............', 0.18] } },
    battle: { bpm: 152, chords: 'Am Am F E Am Dm E Am',
      parts: [{ ins: 'lead', v: 0.075, notes: 'a4:2 c5:2 d5:2 e5:2 g5:4 e5:4 | d5:2 e5:2 c5:2 a4:2 g4:4 a4:4 | a4:2 c5:2 d5:2 e5:2 a5:4 g5:2 e5:2 | g5:4 a5:4 e5:8 | c6:2 b5:2 a5:2 g5:2 e5:4 g5:4 | a5:2 g5:2 e5:2 d5:2 c5:4 d5:4 | e5:2 g5:2 a5:2 c6:2 b5:4 g5:4 | a5:12 r:4' }],
      arp: { ins: 'koto', v: 0.04, oct: 4, step: 2, pat: [0, 2, 3, 2] },
      bass: { ins: 'saw', v: 0.06, pat: 'R:2 R:2 O:2 R:2 R:2 O:2 F:2 R:2' }, drums: { kick: ['x...x...x...x...', 0.28], snare: ['....x.......x...', 0.11], hat: ['x.x.x.x.x.x.x.x.', 0.03], taiko: ['x...............', 0.12] } },
    boss: { bpm: 160, chords: 'Dm Dm Dm A Bb Gm Eb Dm',
      parts: [{ ins: 'lead', v: 0.075, notes: 'd5:2 d5:2 a5:4 g5:2 a5:2 bb5:4 | a5:2 g5:2 eb5:4 d5:4 c5:4 | d5:2 d5:2 a5:4 bb5:2 c6:2 d6:4 | c6:4 bb5:4 a5:8 | d6:2 c6:2 bb5:2 a5:2 g5:4 a5:4 | bb5:2 a5:2 g5:2 eb5:2 d5:4 eb5:4 | g5:2 a5:2 bb5:2 a5:2 g5:4 eb5:4 | d5:12 r:4' }],
      bass: { ins: 'saw', v: 0.07, pat: 'R:2 R:2 O:2 R:2 T:2 R:2 F:2 R:2' }, pad: { v: 0.02, oct: 3 },
      drums: { kick: ['x..x..x.x..x..x.', 0.3], snare: ['....x.......x.xx', 0.11], hat: ['xxxxxxxxxxxxxxxx', 0.018], taiko: ['x.......x.......', 0.16] } },
    final: { bpm: 156, chords: 'Em D C D Em D C B',
      parts: [{ ins: 'lead', v: 0.07, notes: 'e5:4 b4:2 e5:2 g5:4 f#5:2 e5:2 | d5:4 a4:2 d5:2 f#5:8 | e5:4 g5:2 a5:2 b5:4 a5:2 g5:2 | f#5:4 g5:4 a5:8 | b5:4 a5:2 g5:2 e5:4 g5:4 | a5:4 g5:2 f#5:2 d5:4 f#5:4 | g5:2 a5:2 b5:2 d6:2 c6:4 b5:4 | b5:12 r:4' },
        { ins: 'flute', v: 0.05, notes: 'b4:16 | a4:16 | g4:16 | a4:16 | b4:16 | a4:16 | g4:16 | f#4:16' }],
      bass: { ins: 'saw', v: 0.065, pat: 'R:2 R:2 O:2 R:2 R:2 O:2 F:2 R:2' }, pad: { v: 0.022, oct: 3 },
      drums: { kick: ['x...x...x...x...', 0.3], snare: ['....x.......x...', 0.12], hat: ['x.x.x.x.x.x.x.x.', 0.03], taiko: ['x.....x.x.......', 0.2] } },
    ending: { bpm: 88, chords: 'D Bm G A Bm G A D',
      parts: [{ ins: 'flute', v: 0.12, notes: 'f#5:4 a5:4 b5:4 a5:4 | d6:8 b5:4 a5:4 | g5:4 a5:4 b5:4 d6:4 | e6:12 r:4 | d6:4 b5:4 a5:4 f#5:4 | e5:4 f#5:4 a5:8 | b5:4 a5:4 f#5:4 e5:4 | d5:12 r:4' }],
      arp: { ins: 'koto', v: 0.055, oct: 4, pat: [0, 1, 2, 3, 4, 3, 2, 1] }, pad: { v: 0.03, oct: 3 }, bass: { v: 0.11, pat: 'R:8 F:8' }, drums: { taiko: ['x.......x.......', 0.12] } },
    // 短い節（くり返さない）
    victory: { bpm: 140, loop: false, chords: 'G D G G',
      parts: [{ ins: 'lead', v: 0.08, notes: 'd5:2 g5:2 b5:2 d6:6 c6:2 b5:2 | a5:2 c6:2 b5:4 a5:4 f#5:4 g5:16 r:16' }, { ins: 'koto', v: 0.08, notes: 'g4:2 b4:2 d5:2 g5:10 | f#4:2 a4:2 d5:2 a4:2 d5:4 c5:4 | b4:2 d5:2 g5:12 r:16' }],
      bass: { v: 0.12, pat: 'R:4 R:4 F:4 R:4' }, drums: { taiko: ['x.......x...x...x...............x.......x.......x...............', 0.2] } },
    join: { bpm: 120, loop: false, parts: [{ ins: 'koto', v: 0.12, notes: 'a4:2 d5:2 f#5:2 a5:6 g5:2 f#5:2 e5:2 d5:10 r:8' }, { ins: 'flute', v: 0.06, notes: 'd5:8 e5:8 f#5:16' }, { ins: 'bass', v: 0.12, notes: 'd3:8 a2:8 d3:16' }] },
    frag: { bpm: 90, loop: false, parts: [{ ins: 'bell', v: 0.1, notes: 'd5:2 a5:2 d6:4 e6:4 a6:16 r:8' }, { ins: 'pad', v: 0.035, notes: 'd4+a4+d5:16 e4+a4+c#5:16' }, { ins: 'koto', v: 0.07, notes: 'd4:1 f#4:1 a4:1 d5:1 f#5:1 a5:1 d6:2 r:24' }] }
  };
  var COMPILED = {};
  function song(name) { if (!SONGS[name]) return null; if (!COMPILED[name]) COMPILED[name] = compile(SONGS[name]); return COMPILED[name]; }

  // ---- 曲を進める（少し先の音まで予約しておく）----
  function startSong(name) {
    if (!A.ctx) return;
    var sg = song(name); if (!sg) { A.cur = null; return; }
    var t = A.ctx.currentTime + 0.08;
    A.cur = { name: name, sg: sg, step: 0, t: t, dt: 60 / sg.bpm / 4, gain: gainTo(A.musG, 1) };
    A.cur.gain.gain.setValueAtTime(0.0001, t); A.cur.gain.gain.exponentialRampToValueAtTime(1, t + 0.3);
  }
  function stopSong(fade) {
    var c = A.cur; if (!c || !A.ctx) { A.cur = null; return; }
    var t = A.ctx.currentTime;
    try { c.gain.gain.cancelScheduledValues(t); c.gain.gain.setValueAtTime(Math.max(0.0001, c.gain.gain.value), t); c.gain.gain.exponentialRampToValueAtTime(0.0001, t + (fade || 0.35)); } catch (e) { }
    var g = c.gain; setTimeout(function () { try { g.disconnect(); } catch (e) { } }, 1500);
    A.cur = null;
  }
  function sched() {
    if (!A.ctx || A.ctx.state !== 'running') return;
    var c = A.cur; if (!c) return;
    var until = A.ctx.currentTime + 0.15, sg = c.sg;
    while (c.t < until) {
      if (!sg.loop && c.step >= sg.len) { var after = A.resumeSong; A.resumeSong = null; stopSong(0.2); if (after) startSong(after); return; }
      var s = sg.loop ? c.step % sg.len : c.step;
      sg.tracks.forEach(function (tr) {
        var at = tr.at[s % tr.len]; if (!at) return;
        at.forEach(function (e) { e.n.forEach(function (n) { INS[tr.ins](hz(n), c.t, e.d * c.dt, tr.v, c.gain); }); });
      });
      sg.drums.forEach(function (d) { var ch = d.pat[s % d.pat.length]; if (ch === 'x') DRUM[d.k](c.t, d.v, c.gain); });
      c.step++; c.t += c.dt;
    }
  }
  // 曲をかえる。同じ曲ならそのまま。null で止める
  function bgm(name) {
    A.want = name;
    if (!A.ctx) return;
    if (A.cur && A.cur.name === name) return;
    var nonLoop = name && SONGS[name] && SONGS[name].loop === false;
    stopSong(nonLoop ? 0.15 : 0.5);
    if (!name) return;
    A.resumeSong = null;
    var go = function () { if (A.want === name && !A.cur) startSong(name); };
    if (nonLoop) go(); else setTimeout(go, 380);
  }
  // 短い節をはさんで、元の曲にもどる
  function jingle(name) {
    if (!A.ctx) return;
    var back = A.cur ? A.cur.name : A.want;
    stopSong(0.15);
    startSong(name);
    A.resumeSong = back;
  }

  // ---- 効果音 ----
  function tone(f, dur, type, vol, slide, delay) {
    var t = A.ctx.currentTime + (delay || 0), g = gainTo(A.sfxG, 1), o = A.ctx.createOscillator();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.03);
  }
  function nz(dur, vol, freq, delay, type, q) { noiseAt(A.ctx.currentTime + (delay || 0), dur, vol, type, freq, q); }
  function arp(base, steps, gap, type, vol, len) { steps.forEach(function (st, i) { tone(base * Math.pow(2, st / 12), len || 0.2, type || 'triangle', vol || 0.12, 0, i * gap); }); }
  var SFX = {
    blip: function () { tone(880 + Math.random() * 60, 0.03, 'square', 0.025); },
    click: function () { tone(760, 0.05, 'triangle', 0.1); },
    cursor: function () { tone(1040, 0.035, 'triangle', 0.06); },
    back: function () { tone(520, 0.06, 'triangle', 0.08, -160); },
    ok: function () { arp(784, [0, 7], 0.05, 'triangle', 0.1, 0.12); },
    ng: function () { tone(220, 0.12, 'square', 0.06, -40); },
    encounter: function () { arp(392, [0, 3, 7, 12, 15], 0.035, 'square', 0.06, 0.1); nz(0.2, 0.08, 1800); },
    bossWarn: function () { tone(78, 0.9, 'sawtooth', 0.16, -18); tone(117, 0.9, 'sine', 0.12, -20); DRUM.taiko(A.ctx.currentTime, 0.5, A.sfxG); DRUM.taiko(A.ctx.currentTime + 0.35, 0.5, A.sfxG); },
    slash: function () { nz(0.09, 0.22, 3600, 0, 'bandpass', 0.9); tone(1600, 0.06, 'triangle', 0.05, -900); },
    hit: function () { DRUM.kick(A.ctx.currentTime, 0.35, A.sfxG); nz(0.06, 0.15, 900); },
    shoot: function () { tone(1400, 0.08, 'triangle', 0.08, -900); nz(0.05, 0.1, 4000, 0.04); },
    fire: function () { nz(0.35, 0.28, 700, 0, 'bandpass', 0.6); tone(160, 0.3, 'sawtooth', 0.06, -80); },
    water: function () { tone(640, 0.16, 'sine', 0.16, -340); tone(900, 0.12, 'sine', 0.1, -420, 0.07); nz(0.2, 0.08, 1200, 0.02); },
    thunder: function () { nz(0.35, 0.3, 5000, 0, 'highpass'); tone(1300, 0.07, 'square', 0.07, -1100); DRUM.kick(A.ctx.currentTime + 0.03, 0.3, A.sfxG); },
    wind: function () { nz(0.45, 0.22, 1300, 0, 'bandpass', 0.5); },
    shine: function () { arp(1320, [0, 4, 7, 12], 0.03, 'sine', 0.07, 0.25); },
    weak: function () { tone(1760, 0.07, 'square', 0.05, 0, 0.04); tone(2350, 0.09, 'square', 0.05, 0, 0.09); },
    crit: function () { DRUM.kick(A.ctx.currentTime, 0.4, A.sfxG); nz(0.12, 0.2, 2600); },
    miss: function () { nz(0.12, 0.1, 2600, 0, 'highpass'); },
    poison: function () { tone(300, 0.2, 'sine', 0.08, -120); tone(240, 0.2, 'sine', 0.06, -80, 0.08); },
    heal: function () { arp(660, [0, 4, 7, 12], 0.06, 'sine', 0.1, 0.25); },
    up: function () { arp(523, [0, 4, 7], 0.04, 'triangle', 0.08, 0.15); },
    debuff: function () { arp(523, [7, 4, 0], 0.05, 'triangle', 0.07, 0.15); },
    kzfull: function () { arp(784, [0, 5, 7, 12, 17], 0.05, 'triangle', 0.1, 0.25); },
    break: function () { nz(0.3, 0.3, 2400, 0, 'bandpass', 0.5); tone(1200, 0.25, 'square', 0.06, -800); DRUM.taiko(A.ctx.currentTime, 0.5, A.sfxG); arp(1046, [0, 3, 7], 0.04, 'square', 0.04, 0.12); },
    charge: function () { tone(180, 0.6, 'sawtooth', 0.07, 260); },
    daze: function () { tone(900, 0.1, 'sine', 0.05, -300); tone(700, 0.1, 'sine', 0.05, -300, 0.1); },
    guard: function () { tone(330, 0.14, 'square', 0.06, 60); },
    bigcast: function () { tone(110, 0.6, 'sawtooth', 0.09, -40); nz(0.5, 0.15, 600); },
    cutin: function () { nz(0.3, 0.16, 3000, 0, 'highpass'); arp(659, [0, 7, 12], 0.05, 'square', 0.06, 0.2); },
    poof: function () { nz(0.25, 0.18, 800, 0, 'lowpass'); tone(500, 0.15, 'triangle', 0.05, -300); },
    down: function () { tone(330, 0.45, 'triangle', 0.13, -210); },
    revive: function () { arp(523, [0, 7, 12, 16, 19], 0.06, 'sine', 0.1, 0.3); },
    transform: function () { tone(80, 1.2, 'sawtooth', 0.14, 60); nz(1.0, 0.2, 400, 0, 'lowpass'); },
    rescue: function () { arp(523, [0, 7, 12, 16], 0.08, 'triangle', 0.12, 0.25); },
    swap: function () { nz(0.15, 0.1, 2000); tone(600, 0.08, 'triangle', 0.06, 200); },
    flee: function () { arp(880, [0, -3, -5, -8], 0.04, 'triangle', 0.06, 0.08); },
    reveal: function () { arp(988, [0, 5], 0.06, 'sine', 0.08, 0.2); },
    learn: function () { arp(659, [0, 4, 7, 12, 16], 0.07, 'triangle', 0.1, 0.3); },
    levelup: function () { arp(523, [0, 4, 7, 12, 16, 19, 24], 0.06, 'triangle', 0.1, 0.25); },
    lose: function () { arp(392, [7, 5, 2, 0, -5], 0.18, 'triangle', 0.1, 0.4); },
    buy: function () { tone(1318, 0.06, 'square', 0.04); tone(1760, 0.1, 'square', 0.04, 0, 0.06); },
    forge: function () { tone(1500, 0.08, 'square', 0.06); nz(0.1, 0.15, 5000, 0, 'highpass'); tone(1500, 0.08, 'square', 0.05, 0, 0.18); nz(0.1, 0.12, 5000, 0.18, 'highpass'); },
    door: function () { nz(0.25, 0.08, 500, 0, 'lowpass'); },
    chest: function () { arp(784, [0, 4, 7, 12], 0.05, 'triangle', 0.09, 0.2); },
    item: function () { arp(1046, [0, 4, 7], 0.05, 'sine', 0.08, 0.2); },
    warn: function () { tone(1560, 0.1, 'square', 0.06); tone(1560, 0.1, 'square', 0.06, 0, 0.16); },
    stone: function () { tone(90, 0.3, 'triangle', 0.25, -30); nz(0.2, 0.12, 300, 0, 'lowpass'); },
    bell: function () { INS.bell(392, A.ctx.currentTime, 2, 0.2, A.sfxG); INS.bell(392, A.ctx.currentTime + 1.6, 2, 0.16, A.sfxG); },
    save: function () { arp(880, [0, 5, 7], 0.05, 'sine', 0.07, 0.2); },
    boost: function () { tone(880, 0.06, 'triangle', 0.08, 300); },
    push: function () { tone(70, 0.35, 'triangle', 0.25, -10); nz(0.3, 0.1, 250, 0, 'lowpass'); },
    bomb: function () { DRUM.kick(A.ctx.currentTime, 0.5, A.sfxG); nz(0.5, 0.3, 500, 0, 'lowpass'); },
    hawk: function () { tone(1800, 0.2, 'sine', 0.06, 700); tone(1600, 0.25, 'sine', 0.05, 900, 0.15); },
    windfx: function () { nz(0.7, 0.2, 900, 0, 'bandpass', 0.4); },
    step: function () { nz(0.03, 0.03, 400, 0, 'lowpass'); }
  };
  var GAP = { blip: 0.035, cursor: 0.03, hit: 0.03, slash: 0.03, step: 0.1 };
  function play(name) {
    if (!A.sound || !SFX[name]) return;
    if (!ensure() || A.ctx.state !== 'running') return;
    var t = A.ctx.currentTime;
    if (A.last[name] && t - A.last[name] < (GAP[name] || 0.02)) return;
    A.last[name] = t;
    try { SFX[name](); } catch (e) { }
  }
  function setSound(on) { A.sound = !!on; if (A.sfxG) A.sfxG.gain.value = on ? 0.9 : 0; }
  function setMusic(on) { A.music = !!on; if (A.musG) A.musG.gain.setTargetAtTime(on ? 0.55 : 0, A.ctx.currentTime, 0.1); }

  root.NYT_AUDIO = { play: play, bgm: bgm, jingle: jingle, unlock: unlock, setSound: setSound, setMusic: setMusic, SONGS: SONGS, compile: compile, sfxNames: Object.keys(SFX), state: A };
})(typeof window !== 'undefined' ? window : globalThis);
