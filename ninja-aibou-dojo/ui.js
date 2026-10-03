/* ニンジャ相棒道場 — 画面（タイトル・相棒づくり・道場・出発・作戦・振り返り・着がえ・回想・メニュー） */
(function () {
  'use strict';
  var G = window.NAD, D = window.NAD_DATA, P = window.NAD_POLICY, S = window.NAD_SIM, CH = window.NAD_CHARS, R = window.NAD_R, ST = window.NAD_STORY, L = window.NAD_LINES || {};
  var $ = G.$, esc = G.esc;
  var U = G.ui = {};
  var KIND_NAME = { rescue: '救助修行', explore: '探索修行', escort: '護衛修行', tutorial: '最初の修行', exam: '師匠の試験' };
  var SRC_NAME = { review: '振り返り', words: '言葉で教える', rule: '作戦の出し入れ', undo: '取り消し', reset: 'はじめにもどす', teach: '指導', tutorial: '最初の修行の振り返り' };

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function charName(id) { var c = CH.BY_ID[id]; return c ? c.name : id; }
  function line(id, key, fb) { var l = L[id]; return G.fill(l && l[key] ? l[key] : (fb || '')); }
  function faceOf(id, expr) { var d = G.whoDef(id); return d ? R.faceSvg(d, expr) : ''; }
  function stars(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '★' : '<span class="off">★</span>'; return s; }
  function axisText(a, v) { return v >= 60 ? a.hi : (v <= 35 ? a.lo : 'ほどほど'); }
  function signed(n) { return (n > 0 ? '+' : '') + n; }

  /* ================= タイトル ================= */
  // タイトルの絵で見守る師匠（日替わり）
  var TITLE_MASTERS = ['hayate', 'jin', 'sakuya', 'kohaku', 'nagisa', 'karma', 'shion', 'aum', 'sekishusai', 'ibuki', 'karura', 'magoichi', 'izuna', 'rei', 'uka', 'atoza', 'quon', 'ichiya', 'dan', 'kanaoni', 'torika', 'anne'];
  U.boot = function () {
    var tc = $('#title-chars');
    var has = G.S && G.S.companion;
    // 相棒は、もう作っていれば自分の相棒。まだなら見本
    var partner = has ? G.partnerDef() : CH.partnerArt({ outfit: 'ai', hair: 'short', hairColor: 'kuro', acc: 'scarf' });
    var mid = TITLE_MASTERS[((G.dayNo() % TITLE_MASTERS.length) + TITLE_MASTERS.length) % TITLE_MASTERS.length];
    try { tc.innerHTML = R.titleSvg({ partner: partner, player: CH.playerArt(), master: CH.BY_ID[mid].art }); } catch (e) { tc.innerHTML = ''; }
    $('#btn-continue').hidden = !has;
    $('#btn-start').textContent = has ? 'はじめから' : 'はじめる';
    if (has) { $('#btn-start').className = 'btn big'; $('#btn-continue').className = 'btn primary big'; }
    $('#btn-continue').onclick = function () { $('#title').hidden = true; G.showHome(); if (G.S && G.S.chapters.done.indexOf('ch1') < 0) U.resumeTutorial(); };
    $('#btn-start').onclick = function () {
      if (has) G.confirm('今の記録（相棒・作戦・修行の記録）を消して、はじめからにします。道場札で交換した見た目は残ります。', newGame, 'はじめから');
      else newGame();
    };
  };
  function newGame() {
    var dev = G.S ? G.S.deviceId : null;
    G.S = P.newSave(Date.now(), dev);
    $('#title').hidden = true;
    G.mode = 'story';
    G.talk(ST.CH.ch1.intro, function () { U.openCreate(true); });
  }
  U.resumeTutorial = function () {
    // 最初の修行の前でやめていたら、そこから
    G.talk([['hayate', 'おかえり。まずは最初の修行を終えよう。']], function () { startChapter(D.CHAPTERS[0]); });
  };

  /* ================= 相棒づくり ================= */
  var cr = null;
  U.openCreate = function (isNew) {
    var c = G.S.companion;
    cr = c ? { name: c.name, voice: c.voice, look: P.copy(c.look) } : { name: CH.PARTNER_NAMES[Math.floor(Math.random() * CH.PARTNER_NAMES.length)], voice: 'boku', look: { outfit: 'ai', hair: 'short', hairColor: 'kuro', acc: 'none' } };
    $('#create').hidden = false; G.mode = 'create';
    function sw(box, list, cur, fn, dot) {
      box.innerHTML = '';
      list.forEach(function (it) {
        var b = h('button', 'sw' + (it.id === cur ? ' on' : ''), (dot ? '<span class="dot" style="background:' + dot(it) + '"></span>' : '') + esc(it.name));
        b.onclick = function () { fn(it.id); draw(); };
        box.appendChild(b);
      });
    }
    function draw() {
      $('#cr-preview').innerHTML = R.bodySvg(CH.partnerArt(cr.look), { yaw: -20, w: 180 });
      $('#cr-name').textContent = cr.name;
      sw($('#cr-outfit'), CH.PARTNER_OUTFITS, cr.look.outfit, function (id) { cr.look.outfit = id; }, function (it) { return it.top; });
      sw($('#cr-hair'), CH.PARTNER_HAIRS, cr.look.hair, function (id) { cr.look.hair = id; });
      sw($('#cr-hc'), CH.PARTNER_HAIR_COLORS, cr.look.hairColor, function (id) { cr.look.hairColor = id; }, function (it) { return it.color; });
      sw($('#cr-acc'), CH.PARTNER_ACCS, cr.look.acc, function (id) { cr.look.acc = id; });
      sw($('#cr-names'), CH.PARTNER_NAMES.map(function (n) { return { id: n, name: n }; }), cr.name, function (id) { cr.name = id; });
      sw($('#cr-voice'), CH.PARTNER_VOICES, cr.voice, function (id) { cr.voice = id; });
    }
    $('#cr-lot').onclick = function () {
      var r = function (l) { return l[Math.floor(Math.random() * l.length)]; };
      cr.name = r(CH.PARTNER_NAMES); cr.look = { outfit: r(CH.PARTNER_OUTFITS).id, hair: r(CH.PARTNER_HAIRS).id, hairColor: r(CH.PARTNER_HAIR_COLORS).id, acc: r(CH.PARTNER_ACCS).id }; cr.voice = r(CH.PARTNER_VOICES).id;
      draw();
    };
    $('#btn-create').textContent = isNew ? 'この相棒と修行をはじめる' : 'この見た目にする';
    $('#btn-create').onclick = function () {
      $('#create').hidden = true;
      if (isNew) {
        G.S.companion = { name: cr.name, voice: cr.voice, look: cr.look, costume: null, weapon: null, pose: null, exp: 0, bond: 0, createdAt: Date.now() };
        G.S.met = [];
        G.save(true);
        G.mode = 'story';
        G.talk(ST.CH.ch1.met.concat(ST.CH.ch1.pre), function () { startChapter(D.CHAPTERS[0]); });
      } else {
        G.S.companion.name = cr.name; G.S.companion.voice = cr.voice; G.S.companion.look = cr.look;
        R.clear('partner'); G.save(); G.showHome(); U.openDress();
      }
    };
    draw();
  };

  /* ================= 道場 ================= */
  U.refreshHome = function () {
    var S2 = G.S, c = S2.companion; if (!c) return;
    var lv = G.level(), nx = P.nextLevelExp(c.exp), prev = D.BAL.levels[lv - 1];
    $('#hh-pname').textContent = c.name; $('#hh-lv').textContent = lv;
    $('#hh-exp').style.width = nx ? Math.round((c.exp - prev) / (nx - prev) * 100) + '%' : '100%';
    $('#hh-tokens').textContent = S2.tokens; $('#hh-bond').textContent = c.bond;
    $('#hh-preset').innerHTML = '作戦：<b>' + esc(G.slot().name) + '</b>';
    // 次の課題
    var ch = G.nextChapter(), card = $('#card-next');
    if (ch && lv >= ch.need) card.innerHTML = '<div class="face">' + faceOf(ch.master) + '</div><div><span class="muted">第' + ch.num + '章</span><b>「' + esc(ch.title) + '」</b><span class="muted">' + esc(charName(ch.master)) + 'が待っている</span></div><span class="go-tag">出発</span>';
    else if (ch) card.innerHTML = '<div class="face">' + faceOf(ch.master) + '</div><div><span class="muted">第' + ch.num + '章「' + esc(ch.title) + '」はLv' + ch.need + 'から</span><b>修行で経験をためよう</b><span class="muted">あと ' + Math.max(0, D.BAL.levels[ch.need - 1] - c.exp) + ' の経験</span></div><span class="go-tag">出発</span>';
    else card.innerHTML = '<div class="face">' + faceOf('hayate') + '</div><div><b>免許皆伝！</b><span class="muted">好きな修行で、作戦をためそう</span></div><span class="go-tag">出発</span>';
    card.onclick = function () { U.openDepart(); };
    var td = P.tendency(S2.lessons);
    var tags = td.cards.map(function (x) { var cls = { rescue: 'sup', search: 'exp', retreat: 'cau' }[x.id] || ''; return '<span class="tag ' + cls + '">' + esc(x.text) + (x.rate ? ' ' + x.rate + '%' : '') + '</span>'; }).join(' ');
    var ax = G.policy().axes;
    $('#card-tend').innerHTML = '<b style="font-size:13px">最近の傾向</b> ' + tags + ' <span class="muted">（直近' + td.n + '回の判断）</span><br><span class="muted">🤝' + ax.support + '　🔍' + ax.explore + '　🛡️' + ax.caution + (G.policy().rules.length ? '　作戦：' + G.policy().rules.map(P.ruleName).join('・') : '') + '</span>';
  };
  U.tapHome = function (x, y) {
    var r = R.partnerRect; if (!r) return;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      var c = G.S.companion, ax = G.policy().axes, T = D.PARTNER_TALK, pool = T.idle.slice();
      if (ax.support >= 60) pool = pool.concat(T.support); if (ax.explore >= 60) pool = pool.concat(T.explore);
      if (ax.caution >= 60) pool = pool.concat(T.caution); if (ax.caution <= 30) pool = pool.concat(T.bold);
      if (G.policy().rules.indexOf('stay_close') >= 0) pool = pool.concat(T.close);
      if (c.bond >= 10) pool.push('きみと修行した日のこと、ぜんぶ日記に書いてある{V}。');
      var t = pool[Math.floor(Math.random() * pool.length)];
      G.home.talk = { text: G.fill(t), until: performance.now() / 1000 + 3.2 };
      G.home.happyT = performance.now() / 1000 + 1.4;
    }
  };
  document.querySelectorAll('#nav button').forEach(function (b) {
    b.onclick = function () {
      var go = b.getAttribute('data-go');
      if (go === 'depart') U.openDepart(); else if (go === 'strategy') U.openStrategy(); else if (go === 'dress') U.openDress(); else if (go === 'memory') U.openMemory(); else U.openMenu();
    };
  });
  $('#hh-name').onclick = function () { U.openStrategy(); };
  $('#hh-preset').onclick = function () { U.openStrategy(); };

  /* ================= パネル ================= */
  var curPanel = null;
  function openPanel(title, tabs, render, startTab) {
    $('#panel-title').textContent = title;
    var tb = $('#panel-tabs'); tb.innerHTML = '';
    var cur = startTab || (tabs && tabs[0] && tabs[0].id);
    function go(id) { cur = id; Array.prototype.forEach.call(tb.children, function (b) { b.classList.toggle('on', b.getAttribute('data-id') === id); }); var body = $('#panel-body'); body.innerHTML = ''; render(body, id, go); body.scrollTop = 0; }
    (tabs || []).forEach(function (t) { var b = h('button', '', esc(t.label)); b.setAttribute('data-id', t.id); b.onclick = function () { go(t.id); }; tb.appendChild(b); });
    $('#panel').hidden = false; curPanel = { render: render, go: go };
    go(cur);
    return go;
  }
  U.closePanel = function () { $('#panel').hidden = true; curPanel = null; if (G.mode === 'home') U.refreshHome(); };
  $('#panel-close').onclick = U.closePanel;

  /* ================= 出発（修行を選ぶ） ================= */
  U.openDepart = function () {
    openPanel('修行に出発', null, function (body) {
      var S2 = G.S, lv = G.level();
      var top = h('div', 'rule on');
      top.innerHTML = '<span>作戦：<b>' + esc(G.slot().name) + '</b>　🤝' + G.policy().axes.support + ' 🔍' + G.policy().axes.explore + ' 🛡️' + G.policy().axes.caution + '</span>';
      var chg = h('button', 'btn small', '作戦を見る'); chg.onclick = function () { U.openStrategy(); }; top.appendChild(chg);
      body.appendChild(top);
      var ch = G.nextChapter();
      if (ch) {
        body.appendChild(h('h3', '', '物語'));
        var it = h('div', 'item' + (lv >= ch.need ? ' on' : ''));
        it.innerHTML = '<div class="ic">' + faceOf(ch.master) + '</div><div class="tx"><b>第' + ch.num + '章「' + esc(ch.title) + '」</b><br>' + esc(charName(ch.master)) + (ch.master2 ? '・' + esc(charName(ch.master2)) : '') + '　' + esc(KIND_NAME[ch.training.kind]) + (lv < ch.need ? '<br><span class="lock">Lv' + ch.need + 'から（いまLv' + lv + '）</span>' : '') + '</div>';
        var bt = h('button', 'btn primary', '出発'); bt.disabled = lv < ch.need; bt.onclick = function () { U.closePanel(); startChapter(ch); };
        it.appendChild(bt); body.appendChild(it);
      }
      if (S2.chapters.done.indexOf('ch1') >= 0) {
        body.appendChild(h('h3', '', '今日の修行（師匠は日替わり）'));
        ['rescue', 'explore', 'escort'].forEach(function (kind) {
          var tr = D.TRAININGS[kind], m = G.todayMaster(kind);
          var it2 = h('div', 'item');
          it2.innerHTML = '<div class="ic">' + faceOf(m) + '</div><div class="tx"><b>' + tr.icon + ' ' + tr.name + '</b>　師匠：' + esc(charName(m)) + '<br>「' + esc(line(m, 'task', tr.goal)) + '」<br><span class="muted">★1 ' + esc(tr.goal) + '／★2 ' + esc(tr.star2) + '／★3 ' + esc(D.STAR3) + '</span></div>';
          var b2 = h('button', 'btn primary', '出発'); b2.onclick = function () { U.closePanel(); startFree(kind, m); };
          it2.appendChild(b2); body.appendChild(it2);
        });
        var tip = G.todayMaster('explore');
        body.appendChild(h('p', 'muted', '今日のひとこと（' + esc(charName(tip)) + '）：「' + esc(line(tip, 'tip', '')) + '」'));
      }
      var pr = h('div', 'set-row', '<span>練習設定（からくりがゆっくり・弱くなる。アクションが苦手な人向け）</span>');
      var ck = h('input'); ck.type = 'checkbox'; ck.checked = !!S2.settings.practice; ck.onchange = function () { S2.settings.practice = ck.checked; G.save(); };
      pr.appendChild(ck); body.appendChild(pr);
      if (lv >= 6) { var ad = h('div', 'set-row', '<span>上級（からくりが少し手ごわい）</span>'); var ck2 = h('input'); ck2.type = 'checkbox'; ck2.checked = !!S2.settings.advanced; ck2.onchange = function () { S2.settings.advanced = ck2.checked; G.save(); }; ad.appendChild(ck2); body.appendChild(ad); }
      body.appendChild(h('p', 'muted', '操作：指でなぞって移動（パソコンは矢印キー／WASD）。からくりに近づくと自動で攻撃。回避はスペース、指示は 1 集合・2 助けて・3 下がって。へとへとの仲間や宝箱のそばで止まると、助け起こす・調べる。'));
    });
  };
  function startChapter(ch) {
    var tr = ch.training, cfg = { kind: tr.kind, masterId: ch.master };
    if (tr.zones) cfg.zones = tr.zones;
    if (tr.stages) cfg.stages = tr.stages;
    if (ch.id === 'ch1') cfg.cast = ['anne', 'oto'];
    if (ch.guest) { cfg.escortId = ch.guest; cfg.exclude = [ch.guest]; }
    if (ch.master2) cfg.exclude = (cfg.exclude || []).concat([ch.master2]);
    var pre = ST.CH[ch.id].pre;
    G.mode = 'story';
    var begin = function () { G.startTraining(cfg, { chapter: ch.id, masterId: ch.master, title: '第' + ch.num + '章「' + ch.title + '」', kind: tr.kind }); };
    if (ch.id === 'ch1') begin();
    else G.talk(pre, begin);
  }
  function startFree(kind, masterId) {
    G.mode = 'story';
    var tr = D.TRAININGS[kind];
    G.talk([[masterId, L[masterId] ? L[masterId].task : tr.goal]], function () {
      G.startTraining({ kind: kind, masterId: masterId }, { masterId: masterId, title: tr.name + '（師匠：' + charName(masterId) + '）', kind: kind });
    });
  }

  /* ================= 修行中：最初の振り返り・段の切りかえ ================= */
  U.midReview = function () {
    var T = G.T, st = T.st;
    var les = st.lessons.filter(function (l) { return st.zones[l.zone].variant === 1; })[0];
    if (!les) { T.paused = false; return; }
    T.inModal = true;
    var opts = P.teachOptions(les, rulesForTeach());
    var sel = { option: null, withRule: true };
    function render() {
      var html = '<h3>振り返り：' + esc(les.sceneName) + '</h3><p>' + esc(G.fill(ST.GUIDE.review1[1])) + '</p>';
      html += '<div class="dcard"><div class="what">' + esc(G.S.companion.name) + 'の判断：' + esc(P.actPhrase(les.chosen.act, les.chosen.targetName)) + '</div><div class="why">' + esc(les.reason.text) + '</div>' + candBars(les) + '</div>';
      html += '<div class="teach" id="mr-opts"></div><div id="mr-rule"></div><div id="mr-diff"></div>';
      G.modal(html, [{ label: '今回は教えない', cls: 'ghost', fn: function () { finish(null); } }, { label: 'これで教える', cls: 'primary', keep: true, fn: function () { if (!sel.option) { G.toast('教えることを1つ選んでね'); return; } G.closeModal(); finish(sel); } }]);
      var box = $('#mr-opts');
      opts.forEach(function (o) {
        var b = h('button', 'btn' + (sel.option === o ? ' on' : ''), esc(o.label) + (o.id === 'next_rescue' ? ' <span class="rec">おすすめ</span>' : ''));
        b.onclick = function () { sel.option = o; render(); };
        box.appendChild(b);
      });
      if (sel.option) {
        var o = sel.option;
        if (o.rule) { var rb = h('label', 'rulebox', '<input type="checkbox" id="mr-ck"' + (sel.withRule ? ' checked' : '') + '> 作戦「' + esc(P.ruleName(o.rule)) + '」もいっしょに覚える（数値より優先される）'); $('#mr-rule').appendChild(rb); $('#mr-ck').onchange = function (e) { sel.withRule = e.target.checked; render(); }; }
        else if (o.ruleLocked) $('#mr-rule').appendChild(h('p', 'muted', '作戦「' + esc(P.ruleName(o.ruleLocked)) + '」は、まだ使えません（' + unlockWhen(o.ruleLocked) + '）。数値だけ変わります。'));
        $('#mr-diff').appendChild(diffBox(P.previewTeaching(G.policy(), [sel])));
      }
    }
    function finish(pick) {
      T.inModal = false;
      if (pick) {
        var res = P.applyTeaching(G.policy(), [pick], { source: 'tutorial', at: Date.now(), lessonIds: [les.id], note: pick.option.label });
        G.setPolicy(res.policy); S.setPolicy(st, res.policy);
        les.feedback = { option: pick.option.id, label: pick.option.label, rule: pick.withRule ? pick.option.rule : null, v: res.policy.version, at: Date.now() };
        T.taught = pick.option.id;
        G.metric('instruction_proposed', { via: 'review', option: pick.option.id }); G.metric('instruction_confirmed', { via: 'review', option: pick.option.id, v: res.policy.version });
        st.log.push({ id: 'T' + st.no + '-E' + (++st.evSeq), t: st.t, type: 'teach', who: 'player', name: '', label: pick.option.label, zone: les.zone });
        G.S.companion.bond += 1;
        G.toast(G.fill(D.PARTNER_TALK.taught[0]));
      } else T.taught = null;
      T.paused = false;
    }
    G.talk([['hayate', ST.GUIDE.review1[1]]], render);
  };
  U.stageSwitch = function (s) {
    var T = G.T;
    T.inModal = true;
    var msg = ST.CH.ch5.stage[s.stage] ? ST.CH.ch5.stage[s.stage][1] : '';
    var slots = G.S.presets.slots;
    var html = '<h3>' + esc(['救助', '探索', '護衛'][s.stage] || '') + 'の段</h3><p><b>ハヤテ</b>：' + esc(msg) + '</p><p class="muted">作戦を切りかえるなら、選んでください。</p><div class="list" id="ss-list"></div>';
    G.modal(html, [{ label: 'このまま続ける', cls: 'primary', fn: function () { T.inModal = false; T.paused = false; } }]);
    var box = $('#ss-list');
    slots.forEach(function (sl) {
      var it = h('div', 'item' + (sl.id === G.S.presets.active ? ' on' : ''), '<div class="tx"><b>' + esc(sl.name) + '</b><br>🤝' + sl.policy.axes.support + ' 🔍' + sl.policy.axes.explore + ' 🛡️' + sl.policy.axes.caution + (sl.policy.rules.length ? '　' + sl.policy.rules.map(P.ruleName).join('・') : '') + '</div>');
      var b = h('button', 'btn small', sl.id === G.S.presets.active ? 'いまの作戦' : 'これにする');
      b.disabled = sl.id === G.S.presets.active;
      b.onclick = function () { G.S.presets.active = sl.id; S.setPolicy(T.st, sl.policy, sl.id); G.save(); G.closeModal(); T.inModal = false; T.paused = false; G.toast('作戦を「' + sl.name + '」に切りかえた'); };
      it.appendChild(b); box.appendChild(it);
    });
  };
  function rulesForTeach() { return G.S.rulesUnlocked.length ? G.S.rulesUnlocked : ['ally_first', 'stay_close']; }
  function unlockWhen(rule) { var u = D.RULES[rule].unlock; var ch = D.CHAPTERS.filter(function (c) { return c.id === u; })[0]; return ch ? '第' + ch.num + '章「' + ch.title + '」で使えるようになる' : ''; }
  function candBars(les) {
    var list = les.cands.slice(0, 3), max = Math.max.apply(null, list.map(function (c) { return Math.max(1, c.score); }));
    return '<div class="cands">' + list.map(function (c) {
      var ch = c.act === les.chosen.act && c.target === les.chosen.target;
      return '<div class="cand' + (ch ? ' chosen' : '') + '"><span class="nm">' + (S.ACT_ICON[c.act] || '') + ' ' + esc(P.actPhrase(c.act, c.targetName)) + '</span><span class="bar"><i style="width:' + Math.max(3, Math.round(Math.max(0, c.score) / max * 100)) + '%"></i></span><span class="sc">' + Math.round(c.score) + '</span></div>';
    }).join('') + '</div>';
  }
  function diffBox(pv) {
    var d = h('div', 'diffbox');
    var html = '<b>変更案</b>' + (pv.capped ? '<span class="muted">（1回の指導で変わるのは各±10まで）</span>' : '') + '<div class="axes" style="margin-top:6px">';
    D.AXES.forEach(function (a) {
      var b0 = pv.before.axes[a.id], b1 = pv.after.axes[a.id], df = b1 - b0;
      html += '<div class="axis ' + a.id + '"><div class="top">' + a.icon + ' ' + a.name + '<span class="v">' + b0 + (df ? ' → ' + b1 + ' <span class="delta ' + (df > 0 ? 'up' : 'down') + '">' + signed(df) + '</span>' : '') + '</span></div><div class="meter"><i class="old" style="width:' + b0 + '%"></i><i class="now" style="width:' + b1 + '%"></i></div><div class="desc">' + esc(axisText(a, b1)) + '</div></div>';
    });
    html += '</div>';
    if (pv.rulesAdd.length) html += '<p>作戦を覚える：' + pv.rulesAdd.map(function (r) { return '「' + esc(P.ruleName(r)) + '」'; }).join('') + '</p>';
    if (pv.rulesRemove.length) html += '<p>作戦をはずす：' + pv.rulesRemove.map(function (r) { return '「' + esc(P.ruleName(r)) + '」'; }).join('') + '</p>';
    if (pv.rulesFull.length) html += '<p class="muted">作戦の枠（3つ）がいっぱいなので、作戦は増やせません。「作戦」ではずしてから教えてね。</p>';
    d.innerHTML = html;
    return d;
  }

  /* ================= 振り返り ================= */
  U.review = function (T) {
    var st = T.st, r = T.result, S2 = G.S, c = S2.companion, meta = T.meta;
    G.mode = 'review';
    ['#tr-hud', '#tr-ctrl', '#tr-boss', '#tr-banner', '#tr-dec'].forEach(function (q) { $(q).hidden = true; });
    // 記録（LessonEvent・経験・札・絆）
    var kind = meta.kind || st.kind;
    var rw = P.rewardsFor(r, kind === 'exam' ? 'exam' : kind);
    var lvBefore = G.level();
    c.exp += rw.exp; S2.tokens += rw.tokens + (r.chestTokens || 0);
    if (r.success) c.bond += 1;
    S2.trainings++; if (r.success) S2.successes++;
    S2.byKind[kind] = (S2.byKind[kind] || 0) + 1;
    S2.met = S2.met || [];
    [meta.masterId].concat(st.allies.map(function (a) { return a.charId; })).concat(st.escort ? [st.escort.charId] : []).forEach(function (id) { if (id && S2.met.indexOf(id) < 0) S2.met.push(id); });
    // 前と違う行動をした？（同じ場面の直前の記録と比べる）
    st.lessons.forEach(function (l) {
      var prev = null;
      for (var i = S2.lessons.length - 1; i >= 0; i--) if (S2.lessons[i].scene === l.scene && S2.lessons[i].sceneDecision && !S2.lessons[i].forced) { prev = S2.lessons[i]; break; }
      l.prevRef = prev ? { id: prev.id, act: prev.chosen.act, targetName: prev.chosen.targetName, v: prev.policyVersion, axes: prev.axes, rules: prev.rules, date: prev.date } : null;
      l.date = G.today();
      if (prev && prev.chosen.act !== l.chosen.act) G.metric('behavior_changed', { scene: l.scene, from: prev.chosen.act, to: l.chosen.act, v1: prev.policyVersion, v2: l.policyVersion });
    });
    S2.lessons = S2.lessons.concat(st.lessons);
    S2.history = S2.history || [];
    var rec = { no: st.no, date: G.today(), kind: kind, success: r.success, stars: r.stars, time: r.time, masterId: meta.masterId, v: G.policy().version, slot: G.slot().name, fail: r.fail || null };
    S2.history.push(rec); if (S2.history.length > 100) S2.history = S2.history.slice(-100);
    G.metric('lesson_complete', { kind: kind, success: r.success, stars: r.stars, time: r.time });
    G.save(true);

    var reps = P.pickRepresentative(st.lessons, kind === 'tutorial' ? null : (D.TRAININGS[kind] ? D.TRAININGS[kind].key : null));
    if (meta.chapter === 'ch1') reps = st.lessons.filter(function (l) { return st.zones[l.zone].variant === 2; }).concat(reps.filter(function (l) { return st.zones[l.zone].arena; })).slice(0, 2);
    var picks = {};
    var box = $('#review-body');
    var failText = { wipe: '見習いも相棒も、へとへとになった', playerDown: 'きみがへとへとのまま、20秒たった', escort: '護衛役が、道場にもどった', quit: '途中でやめた' }[r.fail] || '課題が終わらなかった';
    function render() {
      box.innerHTML = '';
      var head = h('div', 'res-head', '<p class="muted">' + esc(meta.title || KIND_NAME[kind]) + '</p><h2>' + (r.success ? '修行 成功！' : '修行 おわり') + '</h2><div class="stars">' + stars(r.stars) + '</div>' + (r.success ? '' : '<p class="muted">' + esc(failText) + '。相棒や装備はなくならない。指導の機会はそのまま使える。</p>'));
      box.appendChild(head);
      var tr = D.TRAININGS[kind];
      if (tr) box.appendChild(h('div', 'res-stars', '<div>' + (r.star1 ? '★' : '☆') + ' ' + esc(tr.goal) + '</div><div>' + (r.star1 && r.star2 ? '★' : '☆') + ' ' + esc(tr.star2) + '</div><div>' + (r.star1 && r.star3 ? '★' : '☆') + ' ' + esc(D.STAR3) + '</div>'));
      box.appendChild(h('div', 'rewards', '<span class="chip">経験 +' + rw.exp + '</span><span class="chip">🎴 道場札 +' + (rw.tokens + (r.chestTokens || 0)) + '</span>' + (r.success ? '<span class="chip">🤝 絆 +1</span>' : '') + '<span class="chip">⏱ ' + r.time + '秒</span>'));
      // 師匠の評価（実際の出来事から）
      var mid = meta.masterId || 'hayate';
      var evalText = ST.evaluation(r, charName(mid), c.name);
      var say = r.success ? line(mid, 'praise', '見事だ。') : line(mid, 'advice', '次は、作戦を変えてみよう。');
      box.appendChild(h('div', 'master-say', '<div class="face">' + faceOf(mid) + '</div><div><b>' + esc(charName(mid)) + '</b><br>' + esc(evalText) + '<br>「' + esc(say) + '」</div>'));
      // 代表的な判断（最大2件）
      if (reps.length) {
        box.appendChild(h('h3', '', '振り返り：' + esc(c.name) + 'の判断（' + reps.length + '件）'));
        box.appendChild(h('p', 'muted', 'よかったらほめて、ちがう行動をしてほしければ教えよう。確定するまで、方針は変わらない。'));
      } else box.appendChild(h('p', 'muted', '今回は、振り返る判断場面がなかった。'));
      reps.forEach(function (les) { box.appendChild(decisionCard(les)); });
      var pickList = Object.keys(picks).map(function (k) { return picks[k]; }).filter(function (p) { return p.option; });
      if (pickList.length) box.appendChild(diffBox(P.previewTeaching(G.policy(), pickList)));
      var btns = h('div', 'review-btns');
      if (reps.length) {
        var skip = h('button', 'btn ghost', '今回は教えない'); skip.onclick = function () { confirmTeach([]); };
        var ok = h('button', 'btn primary big', 'これで教える'); ok.disabled = !pickList.length; ok.onclick = function () { confirmTeach(pickList); };
        btns.appendChild(skip); btns.appendChild(ok);
      } else { var nx = h('button', 'btn primary big', '次へ'); nx.onclick = function () { confirmTeach([]); }; btns.appendChild(nx); }
      box.appendChild(btns);
    }
    function decisionCard(les) {
      var card = h('div', 'dcard');
      var ch = les.chosen;
      card.appendChild(h('h3', '', '場面「' + esc(les.sceneName) + '」'));
      var sc = h('div', 'scene');
      var cvs = document.createElement('canvas'); sc.appendChild(cvs);
      var info = h('div', '', '<div class="what">' + (S.ACT_ICON[ch.act] || '') + ' ' + esc(P.actPhrase(ch.act, ch.targetName)) + '</div><div class="why">' + esc(les.reason.text) + '</div><div class="out">' + esc(outcomeText(les)) + '</div><div class="muted" style="font-size:11px">方針 v' + les.policyVersion + '・場面の配置 seed ' + les.seed + '</div>');
      sc.appendChild(info); card.appendChild(sc);
      setTimeout(function () { R.mini(cvs, les); }, 0);
      card.appendChild(h('div', '', candBars(les)));
      if (les.prevRef && les.prevRef.act !== ch.act) {
        var pr = les.prevRef, diffs = [];
        D.AXES.forEach(function (a) { if (pr.axes && pr.axes[a.id] !== les.axes[a.id]) diffs.push(a.name + ' ' + pr.axes[a.id] + '→' + les.axes[a.id]); });
        var ra = (les.rules || []).filter(function (x) { return (pr.rules || []).indexOf(x) < 0; });
        if (ra.length) diffs.push('作戦' + ra.map(function (x) { return '「' + P.ruleName(x) + '」'; }).join('') + 'を追加');
        card.appendChild(h('div', 'compare', '前に同じ場面では「' + esc(P.actPhrase(pr.act, pr.targetName)) + '」（方針 v' + pr.v + '）。今回は「' + esc(P.actPhrase(ch.act, ch.targetName)) + '」（v' + les.policyVersion + '）。' + (diffs.length ? '方針のちがい：' + esc(diffs.join('、')) : '方針は同じで、場面の配置がちがった。')));
      }
      var opts = P.teachOptions(les, rulesForTeach());
      var sel = picks[les.id] || (picks[les.id] = { option: null, withRule: true, replaceRule: null });
      var tb = h('div', 'teach');
      opts.forEach(function (o) {
        var b = h('button', 'btn' + (sel.option && sel.option.id === o.id ? ' on' : ''), esc(o.label));
        b.onclick = function () { sel.option = sel.option && sel.option.id === o.id ? null : o; render(); };
        tb.appendChild(b);
      });
      card.appendChild(tb);
      if (sel.option && sel.option.rule && G.policy().rules.indexOf(sel.option.rule) < 0) {
        var rb = h('label', 'rulebox', '<input type="checkbox"' + (sel.withRule ? ' checked' : '') + '> 作戦「' + esc(P.ruleName(sel.option.rule)) + '」もいっしょに覚える（' + esc(D.RULES[sel.option.rule].short) + '）');
        rb.querySelector('input').onchange = function (e) { sel.withRule = e.target.checked; render(); };
        card.appendChild(rb);
        if (sel.withRule && G.policy().rules.length >= D.BAL.maxRules) {
          var rep = h('div', 'rulebox', '作戦の枠がいっぱい。かわりにはずす作戦：');
          var s2 = document.createElement('select');
          s2.innerHTML = '<option value="">（はずさない）</option>' + G.policy().rules.map(function (x) { return '<option value="' + x + '"' + (sel.replaceRule === x ? ' selected' : '') + '>' + esc(P.ruleName(x)) + '</option>'; }).join('');
          s2.onchange = function () { sel.replaceRule = s2.value || null; render(); };
          rep.appendChild(s2); card.appendChild(rep);
        }
      } else if (sel.option && sel.option.ruleLocked) card.appendChild(h('p', 'muted', '作戦「' + esc(P.ruleName(sel.option.ruleLocked)) + '」は、まだ使えない（' + esc(unlockWhen(sel.option.ruleLocked)) + '）。数値だけ変わる。'));
      return card;
    }
    function outcomeText(les) {
      var o = les.outcome || {}, t = [];
      if (o.savedBy) t.push('このあと仲間は' + (o.savedBy === 'player' ? '見習い' : c.name) + 'が助け起こした');
      if (o.chestBy) t.push('宝箱は' + (o.chestBy === 'player' ? '見習い' : c.name) + 'が開けた');
      if (o.gaveUp) t.push('待ちきれずに帰った仲間がいた');
      if (o.hazard) t.push(c.name + 'は危ない床を通った');
      if (o.partnerDown) t.push(c.name + 'がへとへとになった');
      return t.length ? t.join('。') + '。' : '';
    }
    function confirmTeach(list) {
      var before = G.policy();
      var taughtLabel = null;
      if (list.length) {
        var res = P.applyTeaching(before, list, { source: 'review', at: Date.now(), lessonIds: reps.map(function (l) { return l.id; }), note: list.map(function (p) { return p.option.label; }).join('・') });
        G.setPolicy(res.policy);
        reps.forEach(function (les) { var pk = picks[les.id]; if (pk && pk.option) { var sv = S2.lessons.filter(function (x) { return x.id === les.id; })[0]; if (sv) sv.feedback = { option: pk.option.id, label: pk.option.label, rule: pk.withRule ? pk.option.rule : null, v: res.policy.version, at: Date.now() }; } });
        list.forEach(function (p) { G.metric('instruction_proposed', { via: 'review', option: p.option.id }); G.metric('instruction_confirmed', { via: 'review', option: p.option.id, v: res.policy.version }); });
        c.bond += list.length;
        taughtLabel = list.map(function (p) { return p.option.label; }).join('・');
        st.log.push({ id: 'T' + st.no + '-E' + (++st.evSeq), t: st.t, type: 'teach', who: 'player', name: '', label: taughtLabel });
      }
      // 承認した出来事だけを記憶に（日記はここから作る）
      var ids = st.log.map(function (e) { return e.id; });
      S2.memory.approved = S2.memory.approved.concat(ids);
      S2.memory.summaries.push({ no: st.no, date: G.today(), kind: kind, success: r.success, eventIds: ids.slice(0, 40) });
      var v = CH.pick(CH.PARTNER_VOICES, c.voice);
      var dia = P.diaryFor({ events: st.log, masterName: charName(meta.masterId || 'hayate'), kindName: KIND_NAME[kind], success: r.success }, c, v);
      var entry = { date: G.today(), no: st.no, text: dia.text, eventIds: dia.eventIds, src: 'template' };
      S2.memory.diary.push(entry);
      G.save(true);
      afterTeach(taughtLabel, entry, lvBefore, list);
    }
    function afterTeach(taughtLabel, entry, lvB, list) {
      box.innerHTML = '';
      var react = list.length ? (list.some(function (p) { return p.option.praise; }) && list.length === 1 ? D.PARTNER_TALK.praised[0] : D.PARTNER_TALK.taught[1]) : (r.success ? 'やった！ 次の修行も楽しみ{E}。' : D.PARTNER_TALK.tired[0]);
      box.appendChild(h('div', 'master-say', '<div class="face">' + R.faceSvg(G.partnerDef(), 'happy') + '</div><div><b>' + esc(c.name) + '</b><br>' + esc(G.fill(react)) + '</div>'));
      box.appendChild(h('h3', '', '📖 ' + esc(c.name) + 'の日記'));
      box.appendChild(h('div', 'diary', esc(entry.text)));
      var lv = G.level();
      if (lv > lvB) { var ul = []; for (var k = lvB + 1; k <= lv; k++) if (D.LEVEL_UNLOCKS[k]) ul.push('Lv' + k + '：' + D.LEVEL_UNLOCKS[k]); box.appendChild(h('div', 'compare', '🎉 ' + esc(c.name) + 'はLv' + lv + 'になった！' + (ul.length ? '<br>' + esc(ul.join('／')) + ' が開いた' : ''))); }
      aiDiary(entry, st.log);
      var btns = h('div', 'review-btns');
      var nx = h('button', 'btn primary big', meta.chapter ? '次へ' : '道場へもどる');
      nx.onclick = function () { chapterAfter(); };
      btns.appendChild(nx); box.appendChild(btns);
      box.scrollTop = 0; $('#review').scrollTop = 0;
    }
    function chapterAfter() {
      var chId = meta.chapter;
      if (!chId) { G.T = null; G.showHome(); return; }
      var ch = D.CHAPTERS.filter(function (x) { return x.id === chId; })[0];
      var bad = !r.success || r.stats.partnerDowns > 0 || st.log.some(function (e) { return e.type === 'gaveup'; }) || st.log.some(function (e) { return e.type === 'down' && e.who === 'partner'; });
      // 第1章と試験は成功で、第2〜4章は途中でやめたとき以外で「おえた」になる（失敗も物語の一部）
      var lines = [], done = r.fail !== 'quit';
      if (chId === 'ch1') { done = r.success; lines = r.success ? ST.CH.ch1.end : [['hayate', 'だいじょうぶだ。もう一度やってみよう。「練習設定」を使ってもいいぞ。']]; }
      if (chId === 'ch2') lines = bad ? ST.CH.ch2.postFail : ST.CH.ch2.postOk;
      if (chId === 'ch3') lines = ST.CH.ch3.post;
      if (chId === 'ch4') lines = r.success ? ST.CH.ch4.postOk : ST.CH.ch4.postFail;
      if (!done && chId !== 'ch1' && chId !== 'ch5') lines = [[ch.master, (L[ch.master] && L[ch.master].advice) || 'また来るといい。']];
      if (chId === 'ch5') { lines = r.success ? ST.CH.ch5.postOk : ST.CH.ch5.postFail; done = r.success; }
      $('#review').hidden = true; G.mode = 'story'; G.T = null;
      G.showHome(); G.mode = 'story';
      G.talk(lines, function () {
        if (done && S2.chapters.done.indexOf(chId) < 0) {
          S2.chapters.done.push(chId);
          var un = ch.unlock || {};
          (un.rules || []).forEach(function (x) { if (S2.rulesUnlocked.indexOf(x) < 0) S2.rulesUnlocked.push(x); });
          (un.kinds || []).forEach(function (x) { if (S2.kindsUnlocked.indexOf(x) < 0) S2.kindsUnlocked.push(x); });
          (un.slots || []).forEach(function (x) { P.unlockSlot(S2, x); });
          c.bond += 2;
          G.metric('chapter_complete', { chapter: chId });
          G.save(true);
          var title = chId === 'ch5' ? '免許皆伝' : '第' + ch.num + '章「' + ch.title + '」';
          U.takePhoto({ title: title, sub: chId === 'ch5' ? '師匠の試験に合格' : '章をおえた記念', masterId: ch.master, guestId: ch.guest || ch.master2 || (st.allies[0] && st.allies[0].charId), frame: chId === 'ch5' ? 'kaiden' : null }, function () {
            if (chId === 'ch1') chooseNext(); else { G.showHome(); }
          });
        } else G.showHome();
      });
    }
    function chooseNext() {
      var html = '<h3>次に教えたいことは？</h3><p><b>ハヤテ</b>：次に' + esc(c.name) + 'に教えたいことを選べ。</p><div class="list" id="nf-list"></div>';
      G.modal(html, [{ label: 'あとで決める', cls: 'ghost', fn: function () { G.showHome(); } }]);
      ST.NEXT_FOCUS.forEach(function (f) {
        var it = h('div', 'item', '<div class="tx"><b>' + esc(f.label) + '</b><br><span class="muted">' + esc(f.note) + '</span></div>');
        var b = h('button', 'btn small', 'これにする'); b.onclick = function () { S2.chapters.flags.nextFocus = f.id; G.save(); G.closeModal(); G.showHome(); G.toast('「' + f.label + '」を目標にした。出発から修行を選ぼう'); };
        it.appendChild(b); $('#nf-list').appendChild(it);
      });
    }
    $('#review').hidden = false; $('#review').scrollTop = 0;
    render();
  };
  // AIの日記（試験機能・1日1回）。出来事IDが承認済みの文だけを残す
  function aiDiary(entry, events) {
    var S2 = G.S, url = S2.settings.aiEndpoint;
    if (!/^https:\/\//.test(url || '') || P.quotaLeft(S2, 'diary', Date.now()) <= 0) return;
    P.useQuota(S2, 'diary', Date.now());
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, D.BAL.aiTimeoutMs);
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'diary', voice: G.S.companion.voice, events: events.map(function (e) { return { id: e.id, type: e.type, who: e.who, name: e.name }; }) }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (out) { clearTimeout(timer); var v = P.validateAiDiary(out, S2.memory.approved); if (v.ok) { entry.text = v.text; entry.eventIds = v.eventIds; entry.src = 'ai'; G.save(); } })
      .catch(function () { clearTimeout(timer); });
  }

  /* ================= 作戦 ================= */
  U.openStrategy = function (startTab) {
    var tabs = G.S.presets.slots.map(function (s) { return { id: s.id, label: s.name + (s.id === G.S.presets.active ? '（いま）' : '') }; });
    if (G.S.settings.words !== false) tabs.push({ id: '_words', label: '💬 言葉で教える' });
    openPanel('作戦', tabs, function (body, id) {
      if (id === '_words') return wordsPanel(body);
      var slot = G.S.presets.slots.filter(function (s) { return s.id === id; })[0], pol = slot.policy;
      if (slot.id !== G.S.presets.active) {
        var use = h('button', 'btn primary', 'この作戦で修行に出る'); use.onclick = function () { G.S.presets.active = slot.id; G.save(); G.toast('作戦を「' + slot.name + '」にした'); U.openStrategy(slot.id); };
        body.appendChild(use);
      }
      body.appendChild(h('p', 'muted', '3つの軸は性格の診断ではなく、ゲームでの方針です。明示的な作戦（3つまで）は、数値より優先されます。'));
      var ax = h('div', 'axes');
      D.AXES.forEach(function (a) {
        var v = pol.axes[a.id];
        ax.appendChild(h('div', 'axis ' + a.id, '<div class="top">' + a.icon + ' ' + a.name + '<span class="v">' + v + '</span></div><div class="meter"><i class="now" style="width:' + v + '%"></i></div><div class="desc">いま：' + esc(axisText(a, v)) + '<br>高いと：' + esc(a.hi) + '／低いと：' + esc(a.lo) + '</div>'));
      });
      body.appendChild(ax);
      body.appendChild(h('h3', '', '作戦（' + pol.rules.length + '/' + D.BAL.maxRules + '）'));
      var rl = h('div', 'rules');
      D.RULE_IDS.forEach(function (rid) {
        var R0 = D.RULES[rid], on = pol.rules.indexOf(rid) >= 0, unlocked = G.S.rulesUnlocked.indexOf(rid) >= 0;
        var it = h('div', 'rule' + (on ? ' on' : ''), '<span style="font-size:20px">' + R0.icon + '</span><div><b>' + esc(R0.name) + '</b><br><span class="muted">' + esc(R0.short) + '</span>' + (unlocked ? '' : '<br><span class="lock">' + esc(unlockWhen(rid)) + '</span>') + '</div>');
        if (unlocked) {
          var b = h('button', 'btn small' + (on ? '' : ' primary'), on ? 'はずす' : '覚える');
          b.disabled = !on && pol.rules.length >= D.BAL.maxRules;
          b.onclick = function () {
            var np = on ? P.applyChanges(pol, {}, [], [rid], { source: 'rule', at: Date.now(), note: '作戦「' + R0.name + '」をはずした' }) : P.applyChanges(pol, {}, [rid], [], { source: 'rule', at: Date.now(), note: '作戦「' + R0.name + '」を覚えた' });
            slot.policy = np; G.save(); G.metric('instruction_confirmed', { via: 'rule', rule: rid, on: !on, v: np.version }); U.openStrategy(slot.id);
          };
          it.appendChild(b);
        }
        rl.appendChild(it);
      });
      body.appendChild(rl);
      body.appendChild(h('h3', '', '指導の履歴（方針 v' + pol.version + '）'));
      var row = h('div', 'row left');
      var ub = h('button', 'btn small', '↶ 直前の変更をもどす'); ub.disabled = !P.canUndo(pol);
      ub.onclick = function () { var np = P.undo(pol, Date.now()); slot.policy = np; G.save(); G.metric('policy_undo', { v: np.version }); G.toast(G.fill(D.PARTNER_TALK.undo[0])); U.openStrategy(slot.id); };
      var rb = h('button', 'btn small ghost', 'はじめの方針にもどす');
      rb.onclick = function () { G.confirm('この作戦を、はじめの方針にもどします（無料）。履歴は残ります。', function () { var np = P.reset(pol, Date.now()); slot.policy = np; G.save(); G.metric('policy_undo', { v: np.version, reset: true }); U.openStrategy(slot.id); }, 'もどす'); };
      row.appendChild(ub); row.appendChild(rb); body.appendChild(row);
      var hs = pol.history.slice().reverse().slice(0, 12);
      if (!hs.length) body.appendChild(h('p', 'muted', 'まだ指導していません。'));
      hs.forEach(function (e) {
        var dt = e.at ? new Date(e.at) : null, parts = [];
        Object.keys(e.diff || {}).forEach(function (k) { parts.push(P.axisName(k) + signed(e.diff[k])); });
        (e.rulesAdded || []).forEach(function (x) { parts.push('＋「' + P.ruleName(x) + '」'); });
        (e.rulesRemoved || []).forEach(function (x) { parts.push('−「' + P.ruleName(x) + '」'); });
        if (e.source === 'undo') parts.push('v' + e.revertOf + ' の変更を戻した');
        if (e.source === 'reset') parts.push('はじめの方針');
        body.appendChild(h('div', 'hist' + (e.undone ? ' undone' : ''), '<b>v' + e.v + '</b> ' + esc(SRC_NAME[e.source] || e.source) + (e.note ? '「' + esc(e.note) + '」' : '') + '：' + esc(parts.join('、') || '変化なし') + (dt ? ' <span class="muted">' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</span>' : '')));
      });
    }, startTab || G.S.presets.active);
  };
  // 言葉で教える（試験機能）
  function wordsPanel(body) {
    var S2 = G.S, ai = /^https:\/\//.test(S2.settings.aiEndpoint || '');
    body.appendChild(h('p', '', '短い言葉で作戦を教えられます（試験機能）。例：「宝箱より仲間を先に助けて」「あぶない所には入らないで」'));
    body.appendChild(h('p', 'muted', ai ? 'AIの接続先が設定されています（1日' + D.BAL.wordsPerDay + '回まで。のこり' + P.quotaLeft(S2, 'words', Date.now()) + '回。8秒で答えがなければ、この端末の中で読み取ります）。' : '言葉はこの端末の中で読み取ります（どこにも送りません）。読み取れた作戦は、確定するまで変わりません。'));
    var ta = h('textarea', 'words'); ta.maxLength = 40; ta.placeholder = '40文字まで'; body.appendChild(ta);
    var b = h('button', 'btn primary', '相棒に伝える');
    b.onclick = function () {
      var text = ta.value;
      G.metric('instruction_proposed', { via: 'words', len: text.length });
      interpret(text, function (res) { showProposal(res, text); });
    };
    body.appendChild(b);
    body.appendChild(h('p', 'muted', '「敵を全部一撃で」など、相棒の力そのものを変えるお願いは受けつけません。あいまいな言葉のときは、作戦の選択肢を出します。入力した文は保存しません。'));
  }
  function interpret(text, cb) {
    var S2 = G.S, url = S2.settings.aiEndpoint, local = function () { cb(P.parseWords(text, { unlockedRules: S2.rulesUnlocked })); };
    var pre = P.parseWords(text, { unlockedRules: S2.rulesUnlocked });
    if (!pre.ok && pre.code !== 'ambiguous') return cb(pre); // 入力検査で止まるものは送らない
    if (!/^https:\/\//.test(url || '') || !P.useQuota(S2, 'words', Date.now())) return local();
    G.loading(true);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, done = false;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); if (!done) { done = true; G.loading(false); G.toast('時間がかかったので、この端末で読み取りました'); local(); } }, D.BAL.aiTimeoutMs);
    var les = S2.lessons[S2.lessons.length - 1];
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'instruction', text: text, event_id: les ? les.id : null, policy: { axes: G.policy().axes, rules: G.policy().rules }, allowed_rules: S2.rulesUnlocked, intents: Object.keys(D.INTENTS) }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (out) {
        if (done) return; done = true; clearTimeout(timer); G.loading(false);
        var p = { intent: out.intent, changes: out.changes || {}, rule: out.proposed_rule || null, explanation: out.explanation || '', source: 'ai' };
        var v = P.validateProposal(p, S2.rulesUnlocked);
        if (!v.ok) { G.toast('AIの答えが作戦の決まりに合わなかったので、この端末で読み取りました'); return local(); }
        p.ok = true; cb(p);
      })
      .catch(function () { if (done) return; done = true; clearTimeout(timer); G.loading(false); local(); });
  }
  function showProposal(res, text) {
    var S2 = G.S;
    if (!res.ok) {
      var html = '<h3>' + esc(res.message) + '</h3>';
      if (res.choices) html += '<div class="list" id="wp-ch"></div>';
      G.modal(html, [{ label: 'とじる', cls: 'ghost' }]);
      (res.choices || []).forEach(function (iid) {
        var it = D.INTENTS[iid]; if (!it) return;
        var row = h('div', 'item', '<div class="tx"><b>' + esc(it.label) + '</b></div>');
        var b = h('button', 'btn small', 'これにする'); b.onclick = function () { G.closeModal(); showProposal(P.proposal(iid, 'choice', S2.rulesUnlocked), text); };
        row.appendChild(b); $('#wp-ch').appendChild(row);
      });
      return;
    }
    var opt = { id: 'words:' + res.intent, label: res.explanation, changes: res.changes, rule: res.rule };
    var pick = { option: opt, withRule: !!res.rule };
    var pv = P.previewTeaching(G.policy(), [pick]);
    G.modal('<h3>' + esc(G.S.companion.name) + 'への変更案</h3><p>「' + esc(res.explanation) + '」として受け取りました。' + (res.source === 'ai' ? '（AI）' : '') + '</p>' + (res.ruleLocked ? '<p class="muted">作戦「' + esc(P.ruleName(res.ruleLocked)) + '」はまだ使えないので、数値だけ変わります。</p>' : '') + '<div id="wp-diff"></div>', [
      { label: 'やめる', cls: 'ghost' },
      { label: '確定する', cls: 'primary', fn: function () {
        var r2 = P.applyTeaching(G.policy(), [pick], { source: 'words', at: Date.now(), note: res.explanation });
        G.setPolicy(r2.policy); G.metric('instruction_confirmed', { via: 'words', intent: res.intent, v: r2.policy.version, src: res.source });
        G.S.companion.bond += 1; G.save();
        G.toast(G.fill(D.PARTNER_TALK.taught[0])); U.openStrategy(G.S.presets.active);
      } }]);
    $('#wp-diff').appendChild(diffBox(pv));
  }

  /* ================= 着がえ・道場札の交換 ================= */
  U.openDress = function (startTab) {
    openPanel('着がえ・道場札の交換', [{ id: 'look', label: '見た目' }, { id: 'costume', label: '衣装' }, { id: 'weapon', label: '木刀' }, { id: 'dojo', label: '道場' }, { id: 'pose', label: '登場ポーズ' }], function (body, id) {
      var c = G.S.companion;
      body.appendChild(h('div', 'row', '<div style="width:140px;height:190px">' + R.bodySvg(G.partnerDef(), { yaw: -20, w: 140 }) + '</div><div style="align-self:center"><b>🎴 道場札 ' + G.S.tokens + '</b><br><span class="muted">見た目だけが変わります。絆や判断の性能は変わりません。</span></div>'));
      if (id === 'look') { var b = h('button', 'btn', '見た目と呼び名を変える'); b.onclick = function () { U.closePanel(); U.openCreate(false); }; body.appendChild(b); return; }
      var slots = id === 'dojo' ? ['wall', 'floor', 'deco'] : [id];
      slots.forEach(function (slot) {
        if (id === 'dojo') body.appendChild(h('h3', '', { wall: '壁（掛け軸）', floor: '床', deco: '置物' }[slot]));
        var list = h('div', 'list');
        D.SHOP.filter(function (it) { return it.slot === slot; }).forEach(function (it) {
          var owned = G.owns(it.id), cur = slot === 'costume' ? c.costume : slot === 'weapon' ? c.weapon : slot === 'pose' ? c.pose : G.S.dojo[slot];
          var lvOk = !it.level || G.level() >= it.level;
          var ic = slot === 'costume' ? R.bodySvg(G.partnerDef(null, it.id), { yaw: -20, w: 64 }) : ({ weapon: '🗡️', wall: '📜', floor: '🟫', deco: '🏮', pose: '✨' }[slot]);
          var row = h('div', 'item' + (cur === it.id ? ' on' : ''), '<div class="ic">' + ic + '</div><div class="tx"><b>' + esc(it.name) + '</b><br>' + (owned ? '<span class="muted">交換ずみ</span>' : '🎴 ' + it.price + (lvOk ? '' : '　<span class="lock">Lv' + it.level + 'から</span>')) + '</div>');
          var btn;
          if (owned) {
            btn = h('button', 'btn small', cur === it.id ? 'はずす' : 'つける');
            btn.onclick = function () { setEquip(slot, cur === it.id ? null : it.id); U.openDress(id); };
          } else {
            btn = h('button', 'btn small primary', '交換');
            btn.disabled = G.S.tokens < it.price || !lvOk;
            btn.onclick = function () {
              if (G.owns(it.id)) return;
              G.confirm('「' + it.name + '」を道場札 ' + it.price + ' で交換しますか？', function () {
                if (G.S.tokens < it.price || G.owns(it.id)) return;
                G.S.tokens -= it.price; G.E.owned.push(it.id); G.E.updatedAt = Date.now();
                setEquip(slot, it.id); G.save(true); G.toast('交換した！'); U.openDress(id);
              }, '交換する');
            };
          }
          row.appendChild(btn); list.appendChild(row);
        });
        body.appendChild(list);
      });
    }, startTab);
  };
  function setEquip(slot, id) {
    var c = G.S.companion;
    if (slot === 'costume') c.costume = id; else if (slot === 'weapon') c.weapon = id; else if (slot === 'pose') c.pose = id; else G.S.dojo[slot] = id;
    R.clear('partner'); G.save();
  }

  /* ================= 回想 ================= */
  U.openMemory = function (startTab) {
    G.metric('memory_view', {});
    openPanel('回想', [{ id: 'ch', label: '章' }, { id: 'diary', label: '日記' }, { id: 'photo', label: '写真' }, { id: 'log', label: '修行の記録' }, { id: 'roster', label: '忍者名鑑' }], function (body, id) {
      var S2 = G.S, c = S2.companion;
      if (id === 'ch') {
        D.CHAPTERS.forEach(function (ch) {
          var done = S2.chapters.done.indexOf(ch.id) >= 0;
          var it = h('div', 'item' + (done ? ' on' : ''), '<div class="ic">' + faceOf(ch.master) + '</div><div class="tx"><b>第' + ch.num + '章「' + esc(ch.title) + '」</b><br>' + (done ? '<span class="muted">おえた</span>' : '<span class="lock">Lv' + ch.need + 'から</span>') + '</div>');
          if (done) { var b = h('button', 'btn small', 'もう一度読む'); b.onclick = function () { U.closePanel(); G.mode = 'story'; var st2 = ST.CH[ch.id]; var ls = (st2.intro || []).concat(st2.pre || []).concat(st2.postOk || st2.post || st2.end || []); G.talk(ls, function () { G.showHome(); }); }; it.appendChild(b); }
          body.appendChild(it);
        });
        body.appendChild(h('p', 'muted', '絆の記録：' + c.bond + '（指導やいっしょの達成で増える。お金では増えない）'));
      } else if (id === 'diary') {
        body.appendChild(h('p', 'muted', '日記は、修行で実際に起きたこと（承認した出来事）だけから書かれます。'));
        var ds = S2.memory.diary.slice().reverse();
        if (!ds.length) body.appendChild(h('p', '', 'まだ日記はありません。'));
        ds.slice(0, 40).forEach(function (d) { body.appendChild(h('div', 'diary', '<b>' + esc(d.date) + '</b>　' + esc(d.text))); });
        var del = h('button', 'btn small ghost', '日記と思い出を消す'); del.style.marginTop = '10px';
        del.onclick = function () { G.confirm('日記と、覚えている出来事の記憶を消します（方針や見た目はそのまま）。', function () { S2.memory = { approved: [], summaries: [], diary: [] }; G.save(true); U.openMemory('diary'); }, '消す'); };
        body.appendChild(del);
      } else if (id === 'photo') {
        var ps = (S2.photos || []).slice().reverse();
        if (!ps.length) body.appendChild(h('p', '', 'まだ写真はありません。章をおえると記念写真を撮ります。'));
        ps.forEach(function (p) { var it = h('div', 'item', '<div class="ic">📷</div><div class="tx"><b>' + esc(p.title) + '</b><br><span class="muted">' + esc(p.date) + '</span></div>'); var b = h('button', 'btn small', '見る'); b.onclick = function () { showPhoto(p); }; it.appendChild(b); body.appendChild(it); });
      } else if (id === 'log') {
        var hs = (S2.history || []).slice().reverse();
        body.appendChild(h('p', 'muted', '修行 ' + S2.trainings + '回・成功 ' + S2.successes + '回'));
        hs.slice(0, 40).forEach(function (x) { body.appendChild(h('div', 'hist', '<b>' + esc(x.date) + '</b> ' + esc(KIND_NAME[x.kind] || x.kind) + '　' + (x.success ? '成功' : 'おわり') + ' ' + '★'.repeat(x.stars) + '　師匠：' + esc(charName(x.masterId || 'hayate')) + '　作戦「' + esc(x.slot || '') + '」v' + x.v)); });
      } else if (id === 'roster') {
        body.appendChild(h('p', 'muted', 'CryptoNinja の忍者39体。修行で会った忍者は金色の枠。絵をタップすると、キャラクターシートを開きます。'));
        var gr = h('div', 'sheets-grid');
        CH.CHARS.forEach(function (ch) { var met = (S2.met || []).indexOf(ch.id) >= 0; var a = h('a', met ? 'met' : '', '<img loading="lazy" src="sheets/thumb/' + ch.id + '.jpg" alt="' + esc(ch.name) + 'のキャラクターシート">' + esc(ch.name)); a.href = 'sheets/' + ch.id + '.jpg'; a.target = '_blank'; a.rel = 'noopener'; gr.appendChild(a); });
        body.appendChild(gr);
      }
    }, startTab);
  };
  // 写真：設定だけを保存し、見るときに描き直す
  U.takePhoto = function (o, done) {
    var c = G.S.companion, td = P.tendency(G.S.lessons);
    var lv = G.level();
    var spec = { title: o.title, sub: o.sub, date: G.today(), level: lv, tags: td.cards.filter(function (x) { return x.rate; }).map(function (x) { return x.text; }), masterId: o.masterId, guestId: o.guestId, frame: o.frame || (lv >= 10 ? 'kaiden' : lv >= 8 ? 'gold' : null), look: P.copy(c.look), costume: c.costume, weapon: c.weapon, name: c.name };
    G.S.photos.push(spec); G.save();
    showPhoto(spec, done);
  };
  function showPhoto(p, done) {
    G.loading(true);
    R.photo({ partnerDef: G.partnerDef(p.look, p.costume, p.weapon), partnerName: p.name, playerDef: CH.playerArt(), masterId: p.masterId, guestId: p.guestId, title: p.title, sub: p.sub, date: p.date, level: p.level, tags: p.tags, frame: p.frame }, function (cvs) {
      G.loading(false);
      var url = cvs.toDataURL('image/png');
      G.modal('<h3>📷 ' + esc(p.title) + '</h3><img class="photo-img" src="' + url + '" alt="記念写真"><p class="muted">写真には、選んだ呼び名と修行の記録だけがのります。</p>', [
        { label: '保存', keep: true, fn: function () { var a = document.createElement('a'); a.href = url; a.download = 'aibou-dojo.png'; document.body.appendChild(a); a.click(); a.remove(); } },
        { label: '共有', keep: true, fn: function () { cvs.toBlob(function (b) { try { var f = new File([b], 'aibou-dojo.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'ニンジャ相棒道場' }).catch(function () { }); else G.toast('この端末では画像の共有ができません。「保存」をどうぞ'); } catch (e) { G.toast('この端末では画像の共有ができません。「保存」をどうぞ'); } }); } },
        { label: 'とじる', cls: 'primary', fn: function () { if (done) done(); } }]);
    });
  }

  /* ================= メニュー ================= */
  U.openMenu = function (startTab) {
    openPanel('メニュー', [{ id: 'set', label: '設定' }, { id: 'move', label: '引き継ぎ' }, { id: 'about', label: 'このゲームについて' }], function (body, id) {
      var S2 = G.S, st = S2.settings;
      if (id === 'set') {
        function toggle(label, key, note) {
          var r = h('div', 'set-row', '<span>' + label + (note ? '<br><span class="muted">' + note + '</span>' : '') + '</span>');
          var ck = h('input'); ck.type = 'checkbox'; ck.checked = !!st[key]; ck.onchange = function () { st[key] = ck.checked; G.save(); };
          r.appendChild(ck); body.appendChild(r);
        }
        toggle('練習設定', 'practice', 'からくりがゆっくり・弱くなり、仲間も長く待ってくれる');
        if (G.level() >= 6) toggle('上級', 'advanced', 'からくりが少し手ごわくなる（Lv6から）');
        toggle('言葉で教える（試験機能）', 'words', '「作戦」に短い言葉の入力欄を出す');
        var ar = h('div', 'set-row', '<span>AIの接続先（試験機能・https だけ）<br><span class="muted">空なら、言葉はこの端末の中だけで読み取ります。設定すると、言葉（1日' + D.BAL.wordsPerDay + '回）と日記（1日' + D.BAL.diaryAiPerDay + '回）を送ります。答えは作戦の決まりで検査してから使います。</span></span>');
        var inp = h('input'); inp.type = 'text'; inp.placeholder = 'https://…'; inp.value = st.aiEndpoint || '';
        inp.onchange = function () { var v = inp.value.trim(); st.aiEndpoint = /^https:\/\//.test(v) ? v : ''; if (v && !st.aiEndpoint) G.toast('https の接続先だけ使えます'); G.save(); };
        ar.appendChild(inp); body.appendChild(ar);
        var ex = h('button', 'btn small', '記録を書き出す（この端末の計測）');
        ex.onclick = function () { var b = new Blob([JSON.stringify({ metrics: S2.metrics, history: S2.history, lessons: S2.lessons.map(function (l) { return { id: l.id, scene: l.scene, seed: l.seed, v: l.policyVersion, chosen: l.chosen, feedback: l.feedback }; }) }, null, 1)], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'aibou-dojo-log.json'; a.click(); };
        body.appendChild(h('h3', '', '記録')); body.appendChild(ex);
        body.appendChild(h('p', 'muted', '計測（教えた回数・行動の変化・修行の結果など）は端末の中だけで数えます。外には送りません。'));
        var rs = h('button', 'btn small red', 'はじめからやり直す'); rs.style.marginTop = '14px';
        rs.onclick = function () { G.confirm('相棒・作戦・修行の記録をすべて消して、最初からやり直します。道場札で交換した見た目は残ります。元に戻せません。', function () { try { localStorage.removeItem(P.SAVE_KEY); localStorage.removeItem(P.SAVE_KEY + '_bak'); } catch (e) { } location.reload(); }, '消してやり直す'); };
        body.appendChild(rs);
      } else if (id === 'move') {
        body.appendChild(h('p', '', '別の端末に相棒を引っ越すための「引き継ぎコード」です。通信はしません。コードをコピーして、新しい端末の「コードを読みこむ」に貼ってください。'));
        var out = h('button', 'btn', '引き継ぎコードをつくる');
        out.onclick = function () { encode({ s: slim(S2), e: G.E }).then(function (code) { G.modal('<h3>引き継ぎコード</h3><p class="muted">他人には見せないでください（相棒の記録がすべて入っています）。</p><textarea class="code" readonly>' + esc(code) + '</textarea>', [{ label: 'コピー', keep: true, fn: function () { copyText(code); } }, { label: 'とじる', cls: 'primary' }]); }); };
        var inn = h('button', 'btn', 'コードを読みこむ');
        inn.onclick = function () {
          G.modal('<h3>引き継ぎコードを読みこむ</h3><textarea class="code" id="imp-code" placeholder="NADZ.… または NAD1.…"></textarea>', [{ label: 'やめる', cls: 'ghost' }, { label: '読みこむ', cls: 'primary', keep: true, fn: function () { var v = $('#imp-code').value; decode(v).then(function (o) { G.closeModal(); importFlow(o); }, function (e) { G.toast(e.message || '読みこめませんでした'); }); } }]);
        };
        body.appendChild(h('div', 'row left')).appendChild(out); body.lastChild.appendChild(inn);
        var bk = readBackup();
        if (bk) { var rb = h('button', 'btn small ghost', '選ばなかった記録にもどす（' + new Date(bk.at).toLocaleDateString() + 'まで保管）'); rb.style.marginTop = '10px'; rb.onclick = function () { importFlow({ s: bk.save, e: G.E }, true); }; body.appendChild(rb); }
        body.appendChild(h('p', 'muted', '見た目の交換（道場札）は進みぐあいと別に守られます。どちらの記録を選んでも、交換した物はなくなりません。'));
      } else {
        body.appendChild(h('p', '', 'ニンジャ相棒道場（試作版）は、CryptoNinja（CC0・Ninja DAO）のキャラクターを使った個人制作の非公式ファンゲームです。相棒はこのゲーム独自のキャラクターで、セリフ・師匠としての設定は本作の創作です。'));
        body.appendChild(h('div', 'row left', '<a class="btn small" href="about.html">遊び方・保護者の方へ</a><a class="btn small" href="sheets/">キャラクターシート（40枚）</a><a class="btn small" href="../">しのびのゲーム工房</a>'));
        body.appendChild(h('p', 'muted', '課金・ガチャ・スタミナはありません。遊ぶ画面に広告は表示しません。記録はこの端末の中だけに保存されます。'));
      }
    }, startTab);
  };
  function slim(s) { var o = P.copy(s); o.lessons = o.lessons.slice(-60).map(function (l) { delete l.snap; (l.cands || []).forEach(function (c) { delete c.parts; }); return l; }); o.metrics = o.metrics.slice(-100); return o; }
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var s = atob(t), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function encode(obj) {
    var json = JSON.stringify(obj);
    if (typeof CompressionStream === 'undefined') return Promise.resolve(P.exportCode(obj.s, obj.e));
    var cs = new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(cs).arrayBuffer().then(function (buf) { return 'NADZ.' + b64u(new Uint8Array(buf)); });
  }
  function decode(code) {
    code = String(code || '').trim();
    if (code.indexOf('NAD1.') === 0) { var r = P.importCode(code); return r.ok ? Promise.resolve({ s: r.save, e: r.ent }) : Promise.reject(new Error(r.message)); }
    var m = /^NADZ\.([A-Za-z0-9_-]+)$/.exec(code);
    if (!m) return Promise.reject(new Error('コードの形がちがいます'));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('この端末では読めません'));
    var ds = new Blob([unb64u(m[1])]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(ds).text().then(function (t) { var o = JSON.parse(t); var s = P.migrate(o.s); if (!s) throw new Error('読みこめない記録です'); return { s: s, e: o.e }; });
  }
  function copyText(text) {
    var fallback = function () { var ta = document.querySelector('#modal textarea.code'); if (ta) { ta.focus(); ta.select(); } G.toast('コピーできませんでした。選んだ文字を長押ししてコピーしてください', 3200); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { G.toast('コピーしました'); }, fallback); return; } } catch (e) { }
    fallback();
  }
  function readBackup() { try { var b = JSON.parse(localStorage.getItem(P.BACKUP_KEY) || 'null'); if (b && b.at > Date.now()) return b; } catch (e) { } return null; }
  // 二つの記録がぶつかったら：比べて選ぶ。選ばなかった方は7日残す。見た目の権利は合わせる
  function importFlow(o, fromBackup) {
    var local = G.S, inc = o.s;
    var cf = P.conflict(local, inc);
    function apply(which) {
      var keep = which === 'incoming' ? inc : local, drop = which === 'incoming' ? local : inc;
      try { if (drop && drop.companion) localStorage.setItem(P.BACKUP_KEY, JSON.stringify({ at: Date.now() + D.BAL.backupDays * 86400000, save: drop })); } catch (e) { }
      G.E = P.mergeEntitlements(G.E, o.e);
      G.S = keep; G.save(true); G.closeModal(); R.clear('partner'); U.closePanel(); G.showHome();
      G.toast(which === 'incoming' ? '記録を読みこみました' : 'この端末の記録のままにしました');
    }
    if (!cf.conflict) return apply(cf.pick);
    function col(s, k) { return '<div' + (cf.suggest === k ? ' class="sug"' : '') + '><b>' + (k === 'local' ? 'この端末' : (fromBackup ? '保管していた記録' : '読みこんだコード')) + '</b><br>' + esc(s.name) + '　Lv' + s.level + '<br>章 ' + s.chapters + '/5・修行 ' + s.trainings + '回<br><span class="muted">最後に遊んだ日：' + (s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '—') + '</span>' + (cf.suggest === k ? '<br><span class="tag">新しいほう</span>' : '') + '</div>'; }
    G.modal('<h3>どちらの記録で続けますか？</h3><p class="muted">数値をまぜることはしません。選ばなかった記録は' + D.BAL.backupDays + '日間、この端末に残ります。交換した見た目は、どちらを選んでもなくなりません。</p><div class="cmp">' + col(cf.a, 'local') + col(cf.b, 'incoming') + '</div>', [
      { label: 'この端末の記録', cls: cf.suggest === 'local' ? 'primary' : '', fn: function () { apply('local'); } },
      { label: fromBackup ? '保管していた記録' : '読みこんだ記録', cls: cf.suggest === 'incoming' ? 'primary' : '', fn: function () { apply('incoming'); } }]);
  }
})();
