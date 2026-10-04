/* ニンジャ夜明け隊（RPG） — 画面の部品（DOM）
 * 会話・えらぶ・見出し・暗転・お知らせ・タイトル・はじめる画面。メニューと店は ui_menu.js、戦闘は battle_ui.js。
 * キーボードでも動かせる（矢印でえらぶ・Enter で決定・Esc でもどる）。
 */
(function (root) {
  'use strict';
  var UI = { kbd: false, S: null };
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function AU() { return root.NYT_AUDIO; }
  function sfx(n) { if (AU()) AU().play(n); }
  UI.$ = $; UI.el = el; UI.esc = esc; UI.sfx = sfx;

  // ---- 名前と顔 ----
  function NSL() { return root.NSL_CHARS; }
  function cname(id) { if (id === 'hero') return UI.S ? UI.S.name : '見習い'; var c = NSL() && NSL().BY_ID[id]; return c ? c.name : id; }
  UI.cname = cname;
  // 公式の絵（ビルドでは root.NYT_PORTRAITS に埋めこむ）
  function portrait(id) { return (root.NYT_PORTRAITS && root.NYT_PORTRAITS[id]) || ('../ninja-sato-life/img/art/' + id + '.jpg'); }
  UI.portrait = portrait;
  // 絵（忍者）を小さなキャンバスに。作り終わるまで何度か描きなおす
  function spriteCanvas(def, size, o) {
    var cv = document.createElement('canvas'), dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    var tries = 0;
    (function draw() {
      var SP = root.NYT_SPRITES, h = (o && o.full ? size : size * 1.9) * dpr;
      var img = SP && SP.get(def, { yaw: (o && o.yaw) || 0, pose: (o && o.pose) || 'stand', h: h, expr: o && o.expr });
      if (img) {
        var c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
        var w = h * 200 / 240;
        if (o && o.full) c.drawImage(img, (cv.width - w) / 2, cv.height - h * SP.FOOT_Y, w, h);
        else c.drawImage(img, (cv.width - w) / 2, -h * 0.06, w, h);
        var st = SP.state.cache;   // まだ作っている途中なら、もう一度
        if (++tries < 40 && SP.state.pending > 0) setTimeout(draw, 120);
      } else if (++tries < 60) setTimeout(draw, 80);
    })();
    return cv;
  }
  function yokaiCanvas(eid, size) {
    var cv = document.createElement('canvas'), dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    var e = root.NYT_ENEMIES.ENEMIES[eid], c = cv.getContext('2d');
    if (!e && root.NYT_YOKAI.SIZE[eid]) e = { shape: eid, col: YOKAI_COL[eid] || 'purple' };
    if (!e) return cv;
    if (e.cn) { return spriteCanvas(root.NYT_SPRITES.cnDef(e.cn), size); }
    var sz = root.NYT_YOKAI.SIZE[e.shape] || 44;
    c.scale(dpr, dpr); c.translate(size / 2, size * 0.86);
    root.NYT_YOKAI.draw(c, e.shape, e.col, { s: size * 0.78 / sz, t: 1, dir: 1, shadow: false });
    return cv;
  }
  // 戦わない妖怪（式神など）の名前と色
  var YOKAI_NAME = { yama: 'ヤーマ', orochi: 'オロチ', seal_stone: '封印の石' }, YOKAI_COL = { yama: 'red', orochi: 'snake', seal_stone: 'violet' };
  UI.spriteCanvas = spriteCanvas; UI.yokaiCanvas = yokaiCanvas;
  // 顔（会話・名簿・順番の帯）。who: 'hero' / 仲間id / 'e:妖怪' / 'v:村人の見た目'
  function faceEl(who, size) {
    size = size || 84;
    var SP = root.NYT_SPRITES;
    if (!who) return null;
    if (who === 'hero') return spriteCanvas(SP.heroDef(UI.S), size, { expr: 'happy' });
    if (who.indexOf('e:') === 0) return yokaiCanvas(who.slice(2), size);
    if (who.indexOf('v:') === 0) return spriteCanvas(SP.villagerDef(who.slice(2)), size);
    if (NSL() && NSL().BY_ID[who]) { var im = new Image(); im.alt = ''; im.decoding = 'async'; im.src = portrait(who); return im; }
    return null;
  }
  UI.faceEl = faceEl;
  function typeIcon(ty) { var T = root.NYT_BASE.TYPES[ty]; if (!T) return ''; return '<span class="ty" style="background:' + T.color + '">' + T.name + '</span>'; }
  UI.typeIcon = typeIcon;

  // ---- お知らせ ----
  var toastT = null;
  UI.toast = function (msg, sec) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, (sec || 1.8) * 1000);
  };

  // ---- 会話 ----
  var DL = { done: null, typing: false, full: '', shown: 0, timer: null, pending: false, choice: null, onChoose: null, sel: 0 };
  function textSpeed() { var s = UI.S && UI.S.settings ? UI.S.settings.text : 2; return s >= 3 ? 120 : s <= 1 ? 26 : 50; }
  function fill(t) { return String(t || '').replace(/\{name\}/g, UI.S ? UI.S.name : '見習い'); }
  // who: null（語り）/ 'hero' / 仲間id / 'e:妖怪id' / 'npc:名前'（look は村人の見た目）
  UI.say = function (who, text, done, o) {
    o = o || {};
    var box = $('dlg'), face = box.querySelector('.face'), nm = box.querySelector('.who'), tx = box.querySelector('.txt');
    DL.pending = false;
    box.hidden = false; box.classList.toggle('narr', !who);
    face.innerHTML = '';
    var name = '', fe = null;
    if (who) {
      if (who.indexOf('npc:') === 0) { name = who.slice(4); fe = o.look ? faceEl('v:' + o.look, 84) : null; }
      else if (who.indexOf('e:') === 0) { var en = root.NYT_ENEMIES.ENEMIES[who.slice(2)]; name = en ? en.n : (YOKAI_NAME[who.slice(2)] || '？？？'); fe = faceEl(who, 84); }
      else { name = cname(who); fe = faceEl(who, 84); }
    }
    if (fe) face.appendChild(fe);
    box.classList.toggle('noface', !fe);
    nm.textContent = name; nm.hidden = !name;
    DL.full = fill(text); DL.shown = 0; DL.done = done; DL.typing = true;
    tx.textContent = '';
    box.querySelector('.more').hidden = true;
    clearInterval(DL.timer);
    var cps = textSpeed(), last = performance.now();
    DL.timer = setInterval(function () {
      var now = performance.now(), n = Math.max(1, Math.floor((now - last) / 1000 * cps));
      last += n * 1000 / cps;
      DL.shown = Math.min(DL.full.length, DL.shown + n);
      tx.textContent = DL.full.slice(0, DL.shown);
      if (DL.shown % 3 === 0) sfx('blip');
      if (DL.shown >= DL.full.length) finishType();
    }, 30);
  };
  function finishType() {
    clearInterval(DL.timer); DL.typing = false;
    var box = $('dlg'); box.querySelector('.txt').textContent = DL.full;
    if (!DL.choice) box.querySelector('.more').hidden = false;
    if (DL.choice) showChoices();
  }
  UI.dlgOpen = function () { return !$('dlg').hidden; };
  UI.dlgNext = function () {
    if ($('dlg').hidden) return false;
    if (DL.typing) { finishType(); return true; }
    if (DL.choice) return true;
    var d = DL.done; DL.done = null;
    if (!d) return true;
    sfx('click');
    DL.pending = true;
    d();
    if (DL.pending) UI.hideDlg();
    return true;
  };
  UI.hideDlg = function () { clearInterval(DL.timer); $('dlg').hidden = true; $('choice').hidden = true; DL.done = null; DL.choice = null; DL.pending = false; };
  // えらぶ
  UI.ask = function (who, q, opts, done, o) {
    DL.choice = opts; DL.sel = 0;
    DL.onChoose = done;
    UI.say(who, q, null, o);
  };
  function showChoices() {
    var ch = $('choice'); ch.innerHTML = ''; ch.hidden = false;
    DL.choice.forEach(function (t, i) {
      var b = el('button', 'btn', esc(t)); b.type = 'button';
      b.onclick = function (ev) { ev.stopPropagation(); choose(i); };
      ch.appendChild(b);
    });
    if (UI.kbd) focusFirst(ch);
  }
  function choose(i) {
    var f = DL.onChoose; DL.onChoose = null; DL.choice = null;
    $('choice').hidden = true;
    sfx('click');
    DL.pending = true;
    if (f) f(i);
    if (DL.pending) UI.hideDlg();
  }
  UI.choiceOpen = function () { return !$('choice').hidden; };

  // ---- 見出し（章）・暗転・光 ----
  UI.card = function (title, sub, done, sec) {
    var c = $('card'); c.innerHTML = '<div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
    c.hidden = false;
    var fin = function () { if (c.hidden) return; c.hidden = true; c.onclick = null; clearTimeout(tm); if (done) done(); };
    var tm = setTimeout(fin, (sec || 2.6) * 1000);
    c.onclick = fin;
    UI.cardSkip = fin;
  };
  UI.cardOpen = function () { return !$('card').hidden; };
  UI.fade = function (dir, done) {
    var f = $('fade');
    if (dir === 'out') f.classList.add('on'); else f.classList.remove('on');
    setTimeout(function () { if (done) done(); }, 280);
  };
  UI.faded = function () { return $('fade').classList.contains('on'); };
  UI.flash = function (col) {
    var f = $('flash'); f.style.transition = 'none'; f.style.background = col || '#fff'; f.style.opacity = '0.9';
    f.getBoundingClientRect();
    f.style.transition = 'opacity .7s'; f.style.opacity = '0';
  };

  // ---- キーボードでえらぶ（いちばん近いボタンへ）----
  function buttons(box) { return Array.prototype.slice.call(box.querySelectorAll('button:not([disabled]),input,[data-nav]')).filter(function (b) { return b.offsetParent !== null; }); }
  function focusFirst(box) { var b = buttons(box)[0]; if (b) { b.focus({ preventScroll: false }); } }
  UI.focusFirst = focusFirst;
  UI.nav = function (box, key) {
    var list = buttons(box); if (!list.length) return false;
    var cur = document.activeElement;
    if (list.indexOf(cur) < 0) { list[0].focus(); return true; }
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bd = 1e9;
    var dx = key === 'left' ? -1 : key === 'right' ? 1 : 0, dy = key === 'up' ? -1 : key === 'down' ? 1 : 0;
    list.forEach(function (b) {
      if (b === cur) return;
      var q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, vx = x - cx, vy = y - cy;
      var along = vx * dx + vy * dy; if (along <= 4) return;
      var side = Math.abs(vx * dy) + Math.abs(vy * dx), d = along + side * 2.2;
      if (d < bd) { bd = d; best = b; }
    });
    if (!best) { var i = list.indexOf(cur), n = list.length; best = list[(i + (dx + dy > 0 ? 1 : n - 1)) % n]; }
    best.focus(); if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest' });
    sfx('cursor');
    return true;
  };

  // ---- タイトル ----
  UI.showTitle = function (hasSave, h) {
    var t = $('title'); t.hidden = false;
    $('tt-continue').hidden = !hasSave;
    $('tt-new').onclick = function () { sfx('click'); h.onNew(); };
    $('tt-continue').onclick = function () { sfx('click'); h.onContinue(); };
    $('tt-help').onclick = function () { sfx('click'); h.onHelp(); };
    if (UI.kbd) focusFirst(t);
  };
  UI.hideTitle = function () { $('title').hidden = true; };

  // ---- はじめる（名前・見た目・難しさ）----
  UI.showNewGame = function (hasSave, h) {
    var CH = root.NYT_CHARS, box = $('newgame');
    var st = { name: 'ヒナタ', set: 'ai', hair: 'short', diff: 'normal', warned: false };
    box.innerHTML = '';
    var w = el('div', 'ng-box win');
    w.innerHTML = '<h2>見習い忍者の名前と姿</h2>' +
      '<div class="ng-row"><div class="ng-prev" id="ng-prev"></div><div class="ng-fields">' +
      '<label>名前（8文字まで）<input id="ng-name" maxlength="8" autocomplete="off" placeholder="ヒナタ" value=""></label>' +
      '<div><div class="note">装束</div><div class="seg" id="ng-set"></div></div>' +
      '<div><div class="note">髪</div><div class="seg" id="ng-hair"></div></div>' +
      '<div><div class="note">難しさ（あとで設定から変えられます）</div><div class="seg" id="ng-diff"></div></div>' +
      '</div></div><p class="note" id="ng-warn" hidden></p>' +
      '<div class="ng-go"><button class="btn" id="ng-back" type="button">もどる</button><button class="btn gold" id="ng-start" type="button">旅に出る</button></div>';
    box.appendChild(w); box.hidden = false;
    function seg(id, list, key) {
      var s = $(id); s.innerHTML = '';
      list.forEach(function (o) {
        var b = el('button', st[key] === o.id ? 'on' : '', esc(o.name)); b.type = 'button';
        b.onclick = function () { st[key] = o.id; sfx('cursor'); seg(id, list, key); prev(); };
        s.appendChild(b);
      });
    }
    function prev() {
      var p = $('ng-prev'); p.innerHTML = '';
      var def = root.NYT_SPRITES.heroDef({ look: { set: st.set, hair: st.hair } });
      p.appendChild(spriteCanvas(def, 120, { full: true, yaw: 20, expr: 'happy' }));
    }
    seg('ng-set', CH.LOOK_SETS, 'set'); seg('ng-hair', CH.LOOK_HAIR, 'hair');
    seg('ng-diff', [{ id: 'normal', name: 'ふつう' }, { id: 'easy', name: 'やさしい' }], 'diff');
    prev();
    $('ng-back').onclick = function () { sfx('back'); box.hidden = true; h.onBack(); };
    $('ng-start').onclick = function () {
      var nm = ($('ng-name').value || '').trim().slice(0, 8) || 'ヒナタ';
      if (hasSave && !st.warned) { st.warned = true; var wn = $('ng-warn'); wn.hidden = false; wn.textContent = '前の記録は消えて、上書きされます。よければ、もう一度「旅に出る」をおしてください。'; $('ng-start').textContent = '上書きして旅に出る'; return; }
      sfx('ok'); box.hidden = true;
      h.onStart({ name: nm, look: { set: st.set, hair: st.hair }, diff: st.diff });
    };
    if (UI.kbd) $('ng-name').focus();
  };

  // ---- 遊び方 ----
  UI.helpHTML = function () {
    return '<div class="note" style="font-size:14px;line-height:1.8">' +
      '<p class="p-h3">うごかす</p>' +
      '<p>スマホ：画面をなぞると歩く（指をはなすと止まる）。行きたい場所をタップしても歩きます。<br>右下の「話す／調べる」で、目の前の人や物を調べます。</p>' +
      '<p>PC：矢印キーかWASDで歩く。Enter・スペース・Zで話す／決定。Esc・Xでもどる。Mでメニュー。</p>' +
      '<p class="p-h3">たたかい（コマンドでえらぶ）</p>' +
      '<p><b>弱点</b>：妖怪の下の「？」は弱点。斬・打・射・火・水・雷・風・光の8つの型をためして見つけよう。</p>' +
      '<p><b>構えと崩し</b>：弱点に当てると盾の数字（構え）が減る。0にすると<b>崩し</b>！ その妖怪は今と次の番に動けず、受けるダメージが大きくなる。</p>' +
      '<p><b>印（いん）</b>：番がくるたびに1つたまる（最大5）。こうげき・忍術の前に「＋」で使うと、こうげきの回数や術の威力が上がる。</p>' +
      '<p><b>絆技</b>：絆ゲージがいっぱいになると、仲よしの2人の合わせ技か「総がかり」が使える。</p>' +
      '<p><b>ため</b>：妖怪が「ため」ているときは、次に大技がくる。崩せば止められる。</p>' +
      '<p class="p-h3">仲間</p>' +
      '<p>39人の忍者が仲間になります。前の4人が戦い、控えの4人は前列が全員倒れたとき1度だけかけつけます。メニューの「隊列」で入れかえよう。</p>' +
      '<p>課金・ガチャ・スタミナはありません。記録はこの端末のブラウザに保存されます。</p></div>';
  };

  root.NYT_UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
