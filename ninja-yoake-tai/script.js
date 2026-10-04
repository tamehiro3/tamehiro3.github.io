/* ニンジャ夜明け隊（RPG） — イベントの命令を順に動かす
 * 命令の並び（data_story.js）を1つずつ実行する。会話・戦闘・移動など「待つ」命令は host に頼み、終わったら続きへ。
 * host はブラウザ（game.js）でも、Node の自動テストでも同じ形：host.S（状態）と、say/ask/battle/... の関数。
 */
(function (root) {
  'use strict';
  function ST() { return root.NYT_STATE; }
  function FD() { return root.NYT_FIELD; }

  // 主人公が、かけらを取り戻すたびに覚える術
  var FRAG_SKILL = { 1: 'h_ak1', 2: 'h_ak2', 3: 'h_ak3', 4: 'h_ak4' };

  function create(host, cmds, opts) {
    opts = opts || {};
    var R = { host: host, cmds: (cmds || []).slice(), pc: 0, after: null, done: false, waiting: null, running: false, labels: {}, last: null, onDone: opts.onDone || null, name: opts.name || '' };
    R.cmds.forEach(function (c, i) { if (c && c.lbl) R.labels[c.lbl] = i; });
    return R;
  }
  function jump(R, lbl) {
    if (R.labels[lbl] == null) throw new Error('ラベルがない: ' + lbl + '（' + R.name + '）');
    R.pc = R.labels[lbl];
  }
  function waitFor(R, fn) {
    var token = {}; R.waiting = token;
    fn(function (v) {
      if (R.waiting !== token) return;
      R.waiting = null; R.last = v;
      var f = R.after; R.after = null;
      if (f) f(v);
      if (!R.running) run(R);
    });
  }
  function run(R) {
    if (R.running) return;
    R.running = true;
    var guard = 0;
    while (!R.done && !R.waiting) {
      if (++guard > 100000) throw new Error('イベントが終わらない: ' + R.name);
      if (R.pc >= R.cmds.length) { R.done = true; break; }
      var c = R.cmds[R.pc++];
      exec(R, c);
    }
    R.running = false;
    if (R.done && R.onDone && !R.doneCalled) { R.doneCalled = true; R.onDone(R); }
  }
  function stop(R) { R.done = true; R.waiting = null; }

  function exec(R, c) {
    var H = R.host, S = H.S;
    if (!c) return;
    if (c.lbl) return;
    if (c.go && c.if == null && c.ask == null) { jump(R, c.go); return; }
    if (c.if != null) {
      if (FD().cond(S, c.if)) { if (c.go) jump(R, c.go); else if (c.end) stop(R); }
      return;
    }
    if (c.end) { stop(R); return; }
    if (c.say !== undefined) { waitFor(R, function (done) { H.say(c.say, c.t, done, c); }); return; }
    if (c.msg) { waitFor(R, function (done) { H.say(null, c.msg, done, c); }); return; }
    if (c.ask) {
      // 選んだ番号で、go の行き先へ
      R.after = function (i) { var g = (c.go || [])[i | 0]; if (g) jump(R, g); };
      waitFor(R, function (done) { H.ask(c.who || null, c.ask, c.opts || ['はい', 'いいえ'], done); });
      return;
    }
    if (c.set) { (Array.isArray(c.set) ? c.set : [c.set]).forEach(function (f) { ST().setFlag(S, f); }); if (H.refresh) H.refresh(); return; }
    if (c.unset) { (Array.isArray(c.unset) ? c.unset : [c.unset]).forEach(function (f) { ST().setFlag(S, f, false); }); if (H.refresh) H.refresh(); return; }
    if (c.join) {
      var r = ST().recruit(S, c.join);
      if (H.refresh) H.refresh();
      if (r.already) return;
      waitFor(R, function (done) { H.join(c.join, r.lv, done); });
      return;
    }
    if (c.give) {
      ST().addItem(S, c.give, c.n || 1);
      if (c.quiet) return;
      waitFor(R, function (done) { H.got(c.give, c.n || 1, done); });
      return;
    }
    if (c.take) { ST().addItem(S, c.take, -(c.n || 1)); return; }
    if (c.gold != null) {
      ST().addGold(S, c.gold);
      if (c.gold > 0 && !c.quiet) { waitFor(R, function (done) { H.got('gold', c.gold, done); }); }
      return;
    }
    if (c.battle) {
      R.after = function (res) { if (res !== 'win' && c.loseGo) jump(R, c.loseGo); };
      waitFor(R, function (done) { H.battle({ enemies: c.battle, noFlee: c.noFlee !== 0, bbg: c.bbg, guests: c.guests, guestLv: c.guestLv, boss: c.boss, story: 1, lose: c.lose || 'retry', bgm: c.bgm, tut: c.tut }, done); });
      return;
    }
    if (c.heal) { ST().healAll(S); if (c.quiet) return; waitFor(R, function (done) { H.healFx ? H.healFx(done) : done(); }); return; }
    if (c.inn) { waitFor(R, function (done) { H.inn(c.inn, done); }); return; }
    if (c.shop) { waitFor(R, function (done) { H.shop(c.shop, done); }); return; }
    if (c.forge) { waitFor(R, function (done) { H.forge(done); }); return; }
    if (c.warp) { waitFor(R, function (done) { H.warp(c.warp, c.x, c.y, c.dir || 'down', done); }); return; }
    if (c.travel) { waitFor(R, function (done) { H.travel(done); }); return; }
    if (c.npc) { waitFor(R, function (done) { H.npc(c, done); }); return; }
    if (c.face) { if (H.face) H.face(c.face); return; }
    if (c.walk) { waitFor(R, function (done) { H.walk(c.walk, done); }); return; }
    if (c.wait != null) { waitFor(R, function (done) { H.wait(c.wait, done); }); return; }
    if (c.fade) { waitFor(R, function (done) { H.fade(c.fade, done); }); return; }
    if (c.sfx) { if (H.sfx) H.sfx(c.sfx); return; }
    if (c.bgm !== undefined) { if (H.bgm) H.bgm(c.bgm); return; }
    if (c.shake) { if (H.shake) H.shake(c.shake); return; }
    if (c.flash) { if (H.flash) H.flash(c.flash); return; }
    if (c.emote) { waitFor(R, function (done) { H.emote(c.emote, c.e || '!', done); }); return; }
    if (c.frag) {
      S.frag = (S.frag || 0) + 1;
      ST().addItem(S, 'kane', 1);
      var sk = FRAG_SKILL[S.frag];
      if (sk) ST().learn(S, 'hero', sk);
      waitFor(R, function (done) { H.fragment(S.frag, sk, done); });
      return;
    }
    if (c.learn) { ST().learn(S, c.learn[0], c.learn[1]); return; }
    if (c.title) { waitFor(R, function (done) { H.title(c.title, c.sub || '', done); }); return; }
    if (c.chapter != null) { S.chapter = c.chapter; return; }
    if (c.clear) { S.cleared[c.clear] = 1; if (H.refresh) H.refresh(); return; }
    if (c.open) { S.opened[c.open] = 1; if (H.refresh) H.refresh(); return; }
    if (c.save) { if (H.save) H.save(); return; }
    if (c.ending) { waitFor(R, function (done) { H.ending(done); }); return; }
    if (c.cut) { waitFor(R, function (done) { H.cut(c.cut, c.t || '', done); }); return; }
    if (c.party) { waitFor(R, function (done) { H.formation ? H.formation(done) : done(); }); return; }
    throw new Error('わからない命令: ' + JSON.stringify(c));
  }

  var api = { create: create, run: run, stop: stop, FRAG_SKILL: FRAG_SKILL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_SCRIPT = api;
})(typeof window !== 'undefined' ? window : globalThis);
