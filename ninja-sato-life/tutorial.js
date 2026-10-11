/* ニンジャ里ライフ — 最初の10分（設計書 §3）
 * 0〜1分 見習いの服と色（無料の3セット）→ 1〜2分 荒れた場所を3か所片付け（木材30・コイン50）
 * → 2〜4分 小屋と畑を指定エリアに置く（素材は支給・回転と移動を体験）→ 4〜6分 初回だけすぐ収穫
 * → 6〜8分 住民の依頼を1つ終える（提灯をもらって好きな場所へ）→ 8〜10分 写真 or 見本の里 → 次の目標
 * 途中で閉じても、同じ段階から再開できる（段階は保存データの tutorial.step）。
 */
(function () {
  'use strict';
  var G = window.NSL, D = NSL_DATA, R = NSL_RULES, C = NSL_CLERK, CH = NSL_CHARS, I = NSL_ISO;
  var $ = G.$;
  var SPOT = { koya: { x: 3, y: 3, rot: 0 }, hatake: { x: 7, y: 3, rot: 0 } };

  G.tutorialActive = function () { return G.S && !G.S.tutorial.done; };
  function S() { return G.S; }
  function step() { return S().tutorial.step; }
  function setStep(n) { S().tutorial.step = n; R.event(S(), 'tutorial_step', { step: n }); G.save(); run(); }

  function guide(msg, btns, opt) {
    opt = opt || {};
    $('#guide-face').innerHTML = G.face(opt.face || 'ganzi');
    $('#guide-name').textContent = opt.name || '岩爺';
    $('#guide-msg').textContent = msg;
    var box = $('#guide-btns'); box.innerHTML = '';
    (btns || []).forEach(function (b) { var e = document.createElement('button'); e.className = 'btn small ' + (b.cls || ''); e.textContent = b.label; e.onclick = b.fn; box.appendChild(e); });
    $('#guide').classList.toggle('low', !!opt.low);
    $('#guide').hidden = false;
    document.body.classList.add('guiding');
  }
  function hideGuide() { $('#guide').hidden = true; document.body.classList.remove('guiding'); point(null); }
  function point(p) { G.pointAt = p; if (!p) $('#pointer').hidden = true; }

  function run() {
    if (!G.S || G.S.tutorial.done || G.mode !== 'home') { hideGuide(); return; }
    var s = S(), st = step();
    point(null);
    if (st <= 1) {
      guide('ほっほ、来たか見習い。わしは岩爺。この里は長いこと荒れたままでな……。今日からおぬしが「里守」じゃ。住む者の居場所を、ひとつずつ増やしていこう。', [{ label: 'まかせて！', cls: 'primary', fn: function () { setStep(2); } }]);
      return;
    }
    if (st === 2) {
      var left = D.BAL.debris.filter(function (d) { return !s.debris[d.id]; });
      if (!left.length) { setStep(3); return; }
      guide('まずは荒れた場所を片付けよう。✋の印をタップじゃ。（あと' + left.length + 'か所）', [], { low: true });
      var d = left[0]; point({ world: { x: d.x + 0.5, y: d.y + 0.5, z: 70 } });
      G.centerOn(d.x + 0.5, d.y + 0.5);
      return;
    }
    if (st === 3) {
      if (R.countItem(s, 'koya')) { setStep(4); return; }
      if (!s.inv.koya) s.inv.koya = 1;
      guide('片付いたな。木材とコインも手に入ったぞ。次は住まいじゃ。小屋を光っている場所に置こう。「↻ 回す」で向きを変えられる。入口の前は1マスあけておくんじゃぞ。できたら「✓ 決定」。', [{ label: '小屋を置く', cls: 'primary', fn: function () { placeTut('koya'); } }], { low: true });
      if (!G.build.ghost) placeTut('koya');
      return;
    }
    if (st === 4) {
      if (R.countItem(s, 'hatake')) { setStep(5); return; }
      if (!s.inv.hatake) s.inv.hatake = 1;
      guide('よし、立派な小屋じゃ。次は畑。薬草が育つぞ。ドラッグで場所を動かしてから「✓ 決定」じゃ。', [{ label: '畑を置く', cls: 'primary', fn: function () { placeTut('hatake'); } }], { low: true });
      if (!G.build.ghost) placeTut('hatake');
      return;
    }
    if (st === 5) {
      var f = s.objs.filter(function (o) { return o.id === 'hatake'; })[0];
      if (!f) { setStep(4); return; }
      if (G.build.on) G.setBuild(false);
      if (s.tutorial.firstHarvestFree) { R.firstHarvestBoost(s, f.uid); G.save(); }
      guide('畑に薬草が育ったぞ。🌿をタップして収穫じゃ。今回だけすぐ育ったが、ふだんは10分で5個、3回分までたまる。', [], { low: true });
      point({ world: { x: f.x + 1, y: f.y + 1, z: 90 } });
      G.centerOn(f.x + 1, f.y + 1);
      return;
    }
    if (st === 6) {
      if (G.build.on) G.setBuild(false);
      if (!s.residents.shiba) R.addResident(s, 'shiba', null, true);
      var q = s.quests.active.filter(function (x) { return x.template === 'deliver_herb' && x.npc === 'shiba'; })[0];
      if (!q) { q = R.addQuest(s, { template: 'deliver_herb', npc: 'shiba', loc: 'farm', text: '薬草を5個わけてほしいワン！', gen: 'rule' }); G.save(); }
      var w = G.walker('shiba');
      if (!w) { var gt = I.gateOf(s); w = G.spawn('shiba', 'resident', gt.x, gt.y + 1); var f2 = s.objs.filter(function (o) { return o.id === 'hatake'; })[0]; var t = f2 ? G.nearTile(f2, gt) : null; if (t) G.walkTo(w, t.x, t.y); }
      w.questMark = true;
      guide('おや、柴が来たぞ。畑の見張り番じゃ。📜の出ている柴をタップして、話を聞いてみよう。', [], { low: true });
      point({ walker: 'shiba' });
      G.hud();
      return;
    }
    if (st === 7) {
      if (s.objs.some(function (o) { return o.id === 'chochin'; })) { setStep(8); return; }
      if (!s.inv.chochin) s.inv.chochin = 1;
      guide('柴から提灯をもらったな。好きな場所に置いてみよう。どこに置いても正解じゃ。あとで何度でも置き直せる。', [{ label: '提灯を置く', cls: 'primary', fn: function () { G.startPlace('chochin'); } }], { low: true });
      if (!G.build.ghost) G.startPlace('chochin');
      return;
    }
    if (st === 8) {
      if (G.build.on) G.setBuild(false);
      guide('見事じゃ！ 里らしくなってきた。できあがった里を見てみるのもよいぞ。見本の里を見学するか、里の写真を撮ってみよう。', [
        { label: '見本の里へ', cls: 'primary', fn: function () { hideGuide(); G.visitSample('sample_mizube'); } },
        { label: '写真を撮る', fn: function () { hideGuide(); G.takePhoto(); } }]);
      return;
    }
    if (st >= 9) {
      if (!s.residents.sakuya) {
        R.addResident(s, 'sakuya', null, true);
        var gt2 = I.gateOf(s), w2 = G.spawn('sakuya', 'resident', gt2.x, gt2.y + 1), k = s.objs.filter(function (o) { return o.id === 'koya'; })[0], t2 = k ? G.nearTile(k, gt2) : null;
        if (t2) G.walkTo(w2, t2.x, t2.y, function () { w2.emote = { text: '♪', until: G.time + 4 }; });
        G.save();
      }
      guide('孫の咲耶も来おった。……おぬしの里が気に入ったようじゃな。次の目標は「里Lv2」。課題は 📜依頼 →「里の目標」で見られる。好きな物を置くと、ほかの忍者たちも遊びに来るぞ。', [{ label: 'はじめる！', cls: 'primary', fn: finish }]);
      return;
    }
  }
  function placeTut(id) {
    var sp = SPOT[id];
    if (!sp) { G.startPlace(id); return; }
    var P = R.plot(S()), at = { x: P.x0 + sp.x - 2, y: P.y0 + sp.y - 2, rot: sp.rot };
    G.startPlace(id, at);
    G.centerOn(at.x + 1, at.y + 1);
  }
  function finish() {
    var s = S();
    s.tutorial.done = true; s.tutorial.step = 10;
    R.event(s, 'tutorial_done', {});
    C.refill(s);
    G.nextVisit = G.time + 25;
    hideGuide(); G.save(); G.hud();
    G.toast('📜 依頼が届いています。下の「依頼」から見てみよう', 3200);
  }

  // ゲーム内のできごとから呼ばれる
  G.tutHook = function (kind, a, b) {
    if (!G.S || G.S.tutorial.done) {
      return null;
    }
    var st = step(), s = S();
    if (kind === 'debris' && st === 2) { if (b && b.allClear) setStep(3); else run(); return null; }
    if (kind === 'placed') {
      var id = a.obj.id;
      if (st === 3 && id === 'koya') { G.setBuild(false); setStep(4); }
      else if (st === 4 && id === 'hatake') { G.setBuild(false); setStep(5); }
      else if (st === 7 && id === 'chochin') { G.setBuild(false); setStep(8); }
      return null;
    }
    if (kind === 'harvest' && st === 5) { setStep(6); return null; }
    if (kind === 'quest_accept' && st === 6) { return null; }
    if (kind === 'quest_done' && st === 6 && a && a.template === 'deliver_herb') { // 依頼カードから納品した場合も同じごほうび
      s.inv.chochin = (s.inv.chochin || 0) + 1; s.tutorial.step = 7; G.save();
      return { item: 'chochin', html: '<p>柴「助かったワン！ お礼にこの提灯をどうぞだワン」</p>' };
    }
    if (kind === 'place_reward' && st === 7) { setTimeout(run, 100); return null; }
    if (kind === 'talk' && st === 6 && a.id === 'shiba') {
      var q = s.quests.active.filter(function (x) { return x.template === 'deliver_herb' && x.npc === 'shiba'; })[0];
      if (!q) return false;
      var ch = CH.BY_ID.shiba;
      var talk = G.$('#talk');
      var show = function (text, btns) {
        G.$('#talk-face').innerHTML = G.face('shiba'); G.$('#talk-name').textContent = ch.name; G.$('#talk-text').textContent = text;
        var box = G.$('#talk-btns'); box.innerHTML = '';
        btns.forEach(function (bb) { var e = document.createElement('button'); e.className = 'btn small ' + (bb.cls || ''); e.textContent = bb.label; e.onclick = bb.fn; box.appendChild(e); });
        talk.hidden = false;
      };
      hideGuide();
      show(ch.greet + '\nさっそくだけど、薬草を5個わけてほしいワン！（ごほうび：コイン30・交流印1）', [{ label: '受ける', cls: 'primary', fn: function () {
        R.acceptQuest(s, q.qid); s.trackQ = q.qid; G.save(); G.hud();
        show('ありがとうワン！ 薬草はさっき収穫したのがあるワン？', [{ label: '納品する', cls: 'primary', fn: function () {
          G.closeTalk();
          var r = R.deliverQuest(s, q.qid, q.claimId);
          if (!r.ok) { G.toast(r.reason); return; }
          s.inv.chochin = (s.inv.chochin || 0) + 1; s.tutorial.step = 7;
          G.sfx('coin'); G.save(); G.hud();
          G.modal('<div class="big-emoji">🎉</div><h3>はじめての依頼達成！</h3><p>柴「助かったワン！ お礼にこの提灯をどうぞだワン」</p>' + G.rewardHtml({ coin: 30, seal: 1, item: 'chochin' }), [{ label: 'さっそく里に置く', cls: 'primary', fn: function () { setStep(7); } }]);
        } }]);
      } }]);
      return true;
    }
    if ((kind === 'visit_back' || kind === 'photo') && st === 8) { setTimeout(function () { setStep(9); }, kind === 'photo' ? 400 : 50); return null; }
    if (kind === 'visit' && st === 8) { hideGuide(); return null; }
    return null;
  };
  G.tutStart = function () { if (G.S && !G.S.tutorial.done) setTimeout(run, 300); };
  G.onBuildClosed = function () { if (G.tutorialActive() && [3, 4, 7].indexOf(step()) >= 0) run(); };

  // 柴を指す矢印（人は動くので毎フレーム追う）
  var origDraw = null;
  setInterval(function () {
    var p = G.pointAt;
    if (p && p.walker) {
      var w = G.walker(p.walker), el = $('#pointer');
      if (w && w.sx) { el.hidden = false; el.style.left = w.sx + 'px'; el.style.top = (w.sy - 10) + 'px'; }
    }
  }, 50);
})();
