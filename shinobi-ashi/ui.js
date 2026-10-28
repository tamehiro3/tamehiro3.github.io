/* 忍び足（しのびあし）— 画面の土台 SA.UI
 * ふりがな（furi）、部品づくり（h）、画面の切り替え、カード（出来事）、関門、起動の流れ、取り込み、
 * 歩行中の判定、ためし歩きの引き出し、Service Worker の登録。
 * 各画面の中身は screens.js（SA.Screens）。ほかの担当の部品（SA.Rules など）は「あれば使う」。
 * インターネットには何も送らない（fetch / XHR を使わない）。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var doc = root.document;

  /* ================= ふりがな ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var FURI_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;
  var FURI_RUN_RE = /(?:\{[^{}|]+\|[^{}|]+\})+/g;
  function furiOn() {
    if (App.state && typeof App.state.furigana === 'boolean') return App.state.furigana;
    return App.furiPref !== false;
  }
  /** {漢字|かな} → <ruby>漢字<rt>かな</rt></ruby>（HTML エスケープしてから）。ふりがな「なし」なら漢字だけ。 */
  function furi(text, on) {
    var s = esc(text);
    var show = on === undefined ? furiOn() : !!on;
    if (!show) return s.replace(FURI_RE, '$1');
    // となり合うルビ（{目標|もくひょう}{歩数|ほすう}）は1つのルビにまとめる。ルビは親字の上に重ねて置き、
    // 親字より長いときは左右にはみ出させる（style.css。親字の間が空いて一語に見えなくなるのを防ぐ）。
    // はみ出してよいのは、となりのルビのない文字の幅の半分まで（--al / --ar、単位は親字の em）。
    // それより長いルビの分だけ、外側に少し間をあける（となりのルビどうしが重ならないように）
    var runs = [], m;
    FURI_RUN_RE.lastIndex = 0;
    while ((m = FURI_RUN_RE.exec(s))) runs.push({ at: m.index, end: m.index + m[0].length, run: m[0] });
    if (!runs.length) return s;
    runs.forEach(function (x) {
      var base = '', rt = '';
      x.run.replace(FURI_RE, function (mm, b, r) { base += b; rt += r; return ''; });
      x.base = base; x.rt = rt; x.bl = wlen(base); x.rl = wlen(rt);
      x.need = Math.max(0, (x.rl * FURI_Q - x.bl) / 2);   // 片側にはみ出すおおよその幅（小さい文字のときの大きめの見積もり）
    });
    // あいだの文字の幅を、両どなりのルビで分ける（相手がはみ出さない分はもらう）。文の端は、その外の文字の幅の分
    function allow(gap, other) { return other ? Math.max(gap / 2, gap - other.need) : Math.max(FURI_EDGE, gap); }
    var out = '', last = 0;
    runs.forEach(function (x, i) {
      var base = x.base, rt = x.rt, rl = x.rl, bl = x.bl;
      var lw = allow(wlen(s.slice(i > 0 ? runs[i - 1].end : 0, x.at)), runs[i - 1]);
      var rw = allow(wlen(s.slice(x.end, i < runs.length - 1 ? runs[i + 1].at : s.length)), runs[i + 1]);
      var st = rl > bl ? ' style="--r:' + rl + ';--b:' + bl + ';--al:' + Math.min(FURI_MAX, lw).toFixed(2) + ';--ar:' + Math.min(FURI_MAX, rw).toFixed(2) + '"' : '';
      out += s.slice(last, x.at) + '<ruby' + st + '>' + base + '<rt>' + rt + '</rt></ruby>';
      last = x.end;
    });
    return nobreak(out + s.slice(last));
  }
  // ルビ（inline-block）のまわりでは行頭・行末の禁則が効かないので、ルビのすぐあとの閉じの約物（。、」）！？… など）と、
  // すぐ前の開きかっこ（「（ など）を、ルビと一緒に改行しない1つの span に包む
  var NB_RE = /([「『（【〔［｛〈《]*)(<ruby[^>]*>[^<]*<rt>[^<]*<\/rt><\/ruby>)([。、，．」』）】〕］｝〉》！？!?…‥ー〜・：；]*)/g;
  function nobreak(html) {
    return html.replace(NB_RE, function (m, open, rb, close) { return open || close ? '<span class="nb">' + open + rb + close + '</span>' : m; });
  }
  // 文の端ではみ出してよい幅・いちばん大きくはみ出す幅（親字の em）・ルビの字の大きさの見積もり（14px の文字で 9px）
  var FURI_EDGE = 0.6, FURI_MAX = 1.5, FURI_Q = 0.65;
  /** 見た目のおおよその幅（全角＝1、半角＝0.55、空白＝0.3。句読点・かっこは詰まることがあるので 0.5。
   * HTML の &amp; なども半角として数える） */
  var HALFISH = '、。，．・：；「」『』（）【】〔〕';
  function wlen(t) {
    var w = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      w += c === 32 ? 0.3 : (c < 0x2000 || (c >= 0xff61 && c <= 0xff9f)) ? 0.55 : HALFISH.indexOf(t.charAt(i)) >= 0 ? 0.5 : 1;
    }
    return Math.round(w * 100) / 100;
  }
  /** ふりがな書式を外した文字（title 属性・aria-label 用） */
  function plain(text) { return String(text == null ? '' : text).replace(FURI_RE, '$1'); }
  /** ふりがな書式を外して読み（かな）だけにする（SVG の文字など、ルビが使えないところ用） */
  function kana(text) { return String(text == null ? '' : text).replace(FURI_RE, '$2'); }
  /** 差し込み {name} {rank} {days} {dye} {nums} を置き換える（ふりがな書式の { } は | を含むので触らない） */
  function fill(text, vars) {
    return String(text == null ? '' : text).replace(/\{([a-zA-Z]+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  function n(x) { return String(Math.floor(Number(x) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ================= 部品づくり ================= */
  /** h('div.cls#id', { text, html, on:{click}, attrs, style, disabled }, [子…]) 子の文字列はふりがな書式として扱う */
  function h(sel, props, kids) {
    var m = String(sel).match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i) || [];
    var el = doc.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, function (_, t, v) { if (t === '.') el.classList.add(v); else el.id = v; return ''; });
    if (Array.isArray(props) || typeof props === 'string' || (props && props.nodeType)) { kids = props; props = null; }
    props = props || {};
    if (props.text != null) el.innerHTML = furi(props.text);
    if (props.html != null) el.innerHTML = props.html;
    if (props.cls) String(props.cls).split(/\s+/).forEach(function (c) { if (c) el.classList.add(c); });
    if (props.attrs) Object.keys(props.attrs).forEach(function (k) { var v = props.attrs[k]; if (v === false || v == null) return; el.setAttribute(k, v === true ? '' : v); });
    if (props.style) Object.keys(props.style).forEach(function (k) { el.style.setProperty(k, props.style[k]); });
    if (props.on) Object.keys(props.on).forEach(function (k) { el.addEventListener(k, props.on[k]); });
    if (props.disabled) el.disabled = true;
    if (props.label) el.setAttribute('aria-label', plain(props.label));
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    if (kids == null) return el;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (k) {
      if (k == null || k === false) return;
      if (Array.isArray(k)) { add(el, k); return; }
      if (k.nodeType) el.appendChild(k);
      else { var sp = doc.createElement('span'); sp.innerHTML = furi(k); while (sp.firstChild) el.appendChild(sp.firstChild); }
    });
    return el;
  }
  // ボタンは flex（gap つき）なので、文字は1つの span に包む（ルビと文字の間が空かないように）
  function btn(label, onClick, cls, extra) {
    var p = Object.assign({ cls: 'btn ' + (cls || ''), attrs: { type: 'button' }, on: { click: onClick } }, extra || {});
    p.html = '<span class="bl">' + (p.html != null ? p.html : furi(label)) + '</span>';
    delete p.text;
    return h('button', p);
  }
  function soon(what) { return h('span.soon', { text: '{準備中|じゅんびちゅう}' + (what ? '（' + what + '）' : ''), attrs: { 'data-soon': what || '' } }); }
  function has(ns, fn) { return !!(SA[ns] && (!fn || typeof SA[ns][fn] === 'function')); }

  /* ================= 文字の決まり（名前・位など） ================= */
  function D() { return SA.DATA || {}; }
  function CFG() { return D().CONFIG || {}; }
  function CH() { return root.NSL_CHARS || { CHARS: [], BY_ID: {} }; }
  function charOf(id) { return CH().BY_ID[id] || null; }
  function T() { return SA.TEXT || {}; }

  /* ================= アプリの状態 ================= */
  var App = {
    state: null, info: null, view: false, viewState: null, screen: 'home', params: {},
    syncing: false, walking: false, checking: false, furiPref: true, todayCache: null,
    lastEvents: [], lastSyncAt: 0
  };

  function today() {
    try { if (has('Steps', 'today')) return SA.Steps.today(); } catch (e) { }
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function isNative() {
    try { return !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()); } catch (e) { return false; }
  }
  function isSim() { return !!(App.info && App.info.route === 'sim' && SA.Steps && SA.Steps.sim); }
  function kids() { return !App.state || App.state.mode !== 'otona'; }

  function save() {
    if (!App.state) return Promise.resolve(true);
    if (!has('Store', 'save')) { toast('{保存|ほぞん}の{部品|ぶひん}が{準備中|じゅんびちゅう}です'); return Promise.resolve(false); }
    return SA.Store.save(App.state).then(function (ok) {
      if (!ok) toast((T().special && T().special.saveFail) || '{保存|ほぞん}できませんでした', 'ng');
      return ok;
    }, function () { toast('{保存|ほぞん}できませんでした', 'ng'); return false; });
  }
  /** Rules の関数を呼んで state を置き換える。{ error } が返ったら state はそのまま */
  function apply(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!has('Rules', fn)) { toast('ルールの{部品|ぶひん}が{準備中|じゅんびちゅう}です'); return null; }
    var r;
    try { r = SA.Rules[fn].apply(null, [App.state].concat(args)); } catch (e) { console.warn('SA.Rules.' + fn, e); return null; }
    return r;
  }
  function setState(s) { if (s && !s.error && s.app) App.state = s; return App.state; }
  function summary() {
    if (!App.state || !has('Rules', 'summary')) return null;
    try { return SA.Rules.summary(App.state, today()); } catch (e) { console.warn('summary', e); return null; }
  }

  /* ================= 画面の切り替え ================= */
  var NAV = [
    { id: 'home', label: 'ホーム', icon: 'home' },
    { id: 'shugyo', label: '{修行|しゅぎょう}', icon: 'slot' },
    { id: 'road', label: '{道|みち}', icon: 'road' },
    { id: 'zukan', label: '{図鑑|ずかん}', icon: 'book' },
    { id: 'sato', label: '{里|さと}', icon: 'sato' },
    { id: 'menu', label: 'メニュー', icon: 'menu' }
  ];
  var NAV_VIEW = [
    { id: 'zukan', label: '{図鑑|ずかん}', icon: 'book' },
    { id: 'road', label: '{忍|しの}びの{道|みち}', icon: 'road' },
    { id: 'viewfile', label: 'ファイル', icon: 'file' },
    { id: 'menu', label: 'メニュー', icon: 'menu' }
  ];
  var ICONS = {
    home: '<path d="M4 12 12 5l8 7v8h-5v-5h-6v5H4z"/>',
    slot: '<circle cx="6" cy="9" r="3"/><circle cx="12" cy="7" r="3.4"/><circle cx="18" cy="9" r="3"/><path d="M2 20c1-5 7-5 7-5h6s6 0 7 5z"/>',
    road: '<path d="M5 21c0-6 14-6 14-11S12 3 12 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 3"/><circle cx="12" cy="3.5" r="2"/><circle cx="5" cy="20" r="2"/>',
    book: '<path d="M4 4h7v16H4zM13 4h7v16h-7z"/><path d="M6 8h3M6 11h3M15 8h3M15 11h3" stroke="#f7f1e5" stroke-width="1.4"/>',
    // 里は鳥居の形（ホームの家と見分けられるように）
    sato: '<path d="M2 4.2q10 2.4 20 0v2.6q-10 2-20 0z"/><path d="M4 9.6h16v2.2H4z"/><path d="M5.8 6.6h2.6V21H5.8zM15.6 6.6h2.6V21h-2.6z"/><path d="M10.9 7.2h2.2v2.6h-2.2z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4" fill="#f7f1e5"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' + (ICONS[name] || '') + '</svg>'; }

  function renderNav() {
    var nav = doc.getElementById('nav');
    if (!nav) return;
    nav.innerHTML = '';
    var list = App.view ? NAV_VIEW : NAV;
    if (!App.state && !App.view) { nav.hidden = true; return; }
    nav.hidden = false;
    list.forEach(function (it) {
      var b = h('button', { cls: 'nav-b' + (App.screen === it.id ? ' on' : ''), attrs: { type: 'button', 'data-nav': it.id, 'aria-current': App.screen === it.id ? 'page' : false }, on: { click: function () { go(it.id); } } });
      b.innerHTML = icon(it.icon) + '<span>' + furi(it.label) + '</span>';
      nav.appendChild(b);
    });
  }
  /** 画面へ移る（params はその画面へ渡す） */
  function go(id, params) {
    clearToast();
    simOpen = false;   // ためし歩きの引き出しは、画面を移るときに閉じる（新しい画面を隠さないように）
    if (App.screen === 'parent' && id !== 'parent') App.parentOK = false;   // 保護者設定を出たら、もう一度関門から
    App.screen = id; App.params = params || {};
    render();
    var main = doc.getElementById('screen');
    if (main) main.scrollTop = 0;
  }
  function render() {
    var main = doc.getElementById('screen');
    if (!main) return;
    var S = SA.Screens || {};
    main.innerHTML = '';
    main.setAttribute('data-screen', App.screen);
    var fn = S[App.screen];
    try {
      if (typeof fn === 'function') { var el = fn(App.params || {}); if (el) main.appendChild(el); }
      else main.appendChild(h('section.card', [h('p', { text: 'この{画面|がめん}は' }), soon(App.screen)]));
    } catch (e) {
      console.warn('screen ' + App.screen, e);
      main.appendChild(h('section.card', [h('p', { text: 'この{画面|がめん}は{準備中|じゅんびちゅう}です。' })]));
    }
    renderNav();
    renderBanner();
    renderSim();
    updateBlock();
    histSync();
  }
  function renderBanner() {
    var b = doc.getElementById('banner');
    if (!b) return;
    b.innerHTML = '';
    var msgs = [];
    if (SA.Store && SA.Store.persistent === false) msgs.push((T().special && T().special.noStore) || 'この{端末|たんまつ}では{記録|きろく}が{残|のこ}りません');
    if (App.view) msgs.push('ながめるモード（{図鑑|ずかん}と{忍|しの}びの{道|みち}を{見|み}るだけ）');
    msgs.forEach(function (m) { b.appendChild(h('div.banner-m', { text: m })); });
    b.hidden = !msgs.length;
  }

  /* ================= 小さな知らせ（トースト） ================= */
  var toastTimer = 0, toastAt = 0;
  function toast(text, kind) {
    var t = doc.getElementById('toast');
    if (!t) return;
    t.innerHTML = furi(text);
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    toastAt = Date.now();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }
  /** 画面を移る・重ねるときに、前の画面の知らせを消す（次の画面の中身に重ならないように）。
   * 出したばかり（同じ操作の中で出した知らせ）は消さない */
  function clearToast() {
    if (Date.now() - toastAt < 400) return;
    var t = doc && doc.getElementById('toast');
    clearTimeout(toastTimer);
    if (t) t.className = 'toast';
  }

  /* ================= 重ねる画面（モーダル） ================= */
  var modalStack = [];
  /** modal(内容の要素, { title, cls, onClose, closeLabel, noClose }) → { close, el } */
  function modal(content, opt) {
    opt = opt || {};
    clearToast();
    var layer = doc.getElementById('layer');
    var back = h('div.modal-back');
    var box = h('div.modal', { cls: opt.cls || '', attrs: { role: 'dialog', 'aria-modal': 'true' } });
    if (opt.title) box.appendChild(h('h2.modal-t', { text: opt.title }));
    var body = h('div.modal-body');
    add(body, content);
    box.appendChild(body);
    // スクロールの外に固定する行（出来事のカードの「つぎへ」など）
    if (opt.foot) box.appendChild(add(h('div.modal-nav'), opt.foot));
    var m = { el: box, body: body, closed: false, noClose: !!opt.noClose };
    m.close = function () {
      if (m.closed) return;
      m.closed = true;
      back.remove();
      modalStack = modalStack.filter(function (x) { return x !== m; });
      layer.hidden = !modalStack.length;
      clearToast();
      histSync();
      if (opt.onClose) try { opt.onClose(); } catch (e) { console.warn(e); }
    };
    if (!opt.noClose) {
      var foot = h('div.modal-foot', [btn(opt.closeLabel || 'とじる', function () { m.close(); }, 'ghost', { attrs: { type: 'button', 'data-act': 'close' } })]);
      box.appendChild(foot);
      back.addEventListener('click', function (e) { if (e.target === back && !opt.sticky) m.close(); });
    }
    back.appendChild(box);
    layer.appendChild(back);
    layer.hidden = false;
    modalStack.push(m);
    histSync();
    var f = (opt.focus && box.querySelector(opt.focus)) || box.querySelector('button');
    if (f && f.focus) try { f.focus({ preventScroll: true }); } catch (e) { }
    return m;
  }
  function closeAllModals() { modalStack.slice().forEach(function (m) { m.close(); }); }
  // Esc で、いちばん上の重ねた画面を閉じる（閉じるボタンのない画面は閉じない）
  if (doc) doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (App.walking || !modalStack.length) return;
    var top = modalStack[modalStack.length - 1];
    if (top.noClose) return;
    e.preventDefault();
    top.close();
  });
  /** 確かめる。opt.danger（消す・置きかえるなど、もどせない操作）のときは、進む方を赤い枠の控えめなボタンにし、
   * 緑の主ボタンは使わない。「やめる」はふつうのボタンで右側（目立つ側）に置き、はじめから選ばれた状態にする */
  function confirmBox(text, yes, no, cb, opt) {
    var danger = !!(opt && opt.danger);
    var m = modal([h('p', { text: text }), h('div.row' + (danger ? '.danger-row' : ''), danger ? [
      btn(yes || 'はい', function () { m.close(); cb(true); }, 'ghost red-t', { attrs: { type: 'button', 'data-act': 'confirm-yes' } }),
      btn(no || 'やめる', function () { m.close(); cb(false); }, 'safe', { attrs: { type: 'button', 'data-act': 'confirm-no' } })
    ] : [
      btn(no || 'やめる', function () { m.close(); cb(false); }, 'ghost', { attrs: { type: 'button', 'data-act': 'confirm-no' } }),
      btn(yes || 'はい', function () { m.close(); cb(true); }, 'primary', { attrs: { type: 'button', 'data-act': 'confirm-yes' } })
    ])], { noClose: true, cls: danger ? 'danger' : '', focus: danger ? '[data-act="confirm-no"]' : null });
    return m;
  }

  /* ================= 戻る（ブラウザの「戻る」・Android の戻るボタン） ================= */
  /** 重ねた画面・忍術の間が開いているか */
  function overlayOpen() { var j = doc && doc.getElementById('jutsu'); return modalStack.length > 0 || !!(j && !j.hidden); }
  /** 戻るを1回ぶん片づける。片づけたら true（ホームなどで何もしなければ false） */
  function handleBack() {
    if (App.walking) return overlayOpen();             // 歩いているあいだは何もしない（重ねた画面があれば閉じもしない）
    var j = doc.getElementById('jutsu');
    if (j && !j.hidden) {
      var jb = j.querySelector('[data-act="skip"]') || j.querySelector('[data-act="jutsu-back"]');
      if (jb) jb.click();
      return true;
    }
    if (!modalStack.length) return false;
    var el = modalStack[modalStack.length - 1].el;
    // とじる → 確かめの「やめる」 → 出来事のカードの「つぎへ」（最後のカードでは「とじる」）。どれもなければ戻るを食べるだけ
    var b = el.querySelector('.modal-foot [data-act="close"]') || el.querySelector('[data-act="confirm-no"]') || el.querySelector('[data-act="ev-next"]');
    if (b && !b.disabled) b.click();
    return true;
  }
  // ブラウザ: 履歴を2段まで積む。ホーム（ながめるモードでは図鑑）以外の画面にいるあいだ1段（saScreen）、
  // 重ねた画面・忍術の間が開いているあいだもう1段（saLayer）。「戻る」（popstate）で、いちばん上の重ねた画面を閉じる。
  // 重ねた画面がなければ、ホームへもどる（Android の戻るボタン SA.Cap.back と同じふるまい）。ホームでの「戻る」はページを離れる。
  // 画面のボタンで閉じた・ホームへ移ったときは、積んだ段を自分で戻す（すぐ次の重ねた画面が開くとき＝出来事のカードの「つぎへ」は残す）
  var hist = { ignore: 0, timer: 0 };
  function histOn() { return !!(root.history && root.history.pushState && doc && !isNative()); }
  /** いま積んである段（0: なし、1: 画面、2: 重ねた画面） */
  function histLevel() { try { var st = root.history.state; return st && st.saLayer ? 2 : st && st.saScreen ? 1 : 0; } catch (e) { return 0; } }
  function baseScreen() { return App.view ? 'zukan' : 'home'; }
  /** ホームから離れた画面にいるか（はじめて・記録が読めない画面は数えない） */
  function screenDeep() { return !!((App.state || App.view) && App.screen !== baseScreen() && App.screen !== 'onboard' && App.screen !== 'broken'); }
  function histWant() { return overlayOpen() ? 2 : screenDeep() ? 1 : 0; }
  function histPush(st) { try { root.history.pushState(st, ''); } catch (e) { } }
  function histSync() {
    if (!histOn()) return;
    clearTimeout(hist.timer);
    var want = histWant(), cur = histLevel();
    if (want > cur) {
      if (cur < 1 && want === 2 && screenDeep()) histPush({ saScreen: 1 });
      histPush(want === 2 ? { saLayer: 1 } : { saScreen: 1 });
      return;
    }
    if (want === cur) return;
    hist.timer = setTimeout(function () {
      if (histWant() >= histLevel()) return;
      hist.ignore++;
      try { root.history.back(); } catch (e) { hist.ignore--; }
    }, 0);
  }
  if (root.addEventListener && doc) root.addEventListener('popstate', function () {
    if (hist.ignore > 0) { hist.ignore--; histSync(); return; }
    if (overlayOpen()) handleBack();
    else if (!App.walking && screenDeep()) { go(baseScreen()); return; }   // go → render が histSync を呼ぶ
    histSync();
  });
  // Android: @capacitor/app の backButton から store.js が SA.Cap.back() を呼ぶと、まず 'backbutton' が流れてくる。片づけたら preventDefault。
  // 片づけなければ SA.Cap.back() のふつうの扱い（ホーム以外ならホームへ。ホームならアプリを閉じる）
  if (doc) doc.addEventListener('backbutton', function (e) { if (handleBack()) e.preventDefault(); });
  /** @capacitor/app があれば、その backButton も同じ片づけにつなぐ（無ければ何もしない）。
   * store.js の SA.Cap.wireBack があればそれに任せる（1回の戻るボタンに受け手が2つにならないように）。 */
  function hookNativeBack() {
    try {
      if (SA.Cap && typeof SA.Cap.wireBack === 'function') { SA.Cap.wireBack(); return; }
      var C = root.Capacitor, P = C && C.Plugins && C.Plugins.App;
      if (!isNative() || !P || typeof P.addListener !== 'function') return;
      P.addListener('backButton', function () {
        var done = SA.Cap && typeof SA.Cap.back === 'function' ? SA.Cap.back() : handleBack();
        if (!done && typeof P.exitApp === 'function') P.exitApp();
      });
    } catch (e) { }
  }
  /** 忍術の間（#jutsu）の出し入れも、重ねた画面と同じく履歴に積む */
  function watchJutsu() {
    var j = doc.getElementById('jutsu');
    if (!j || !root.MutationObserver) return;
    new root.MutationObserver(function () { histSync(); }).observe(j, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ================= 音（やさしいチャイム。音が「あり」のときだけ） ================= */
  var actx = null;
  function chime(kind) {
    var s = App.state && App.state.settings;
    if (!s || s.sound === false) return;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      var notes = kind === 'big' ? [523, 659, 784] : [659, 784];
      notes.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * 0.12;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 0.55);
      });
    } catch (e) { }
  }

  /* ================= 関門（保護者だけ） ================= */
  // 数字は大字（壱・弐・参…）で書く。小学校では習わない字なので、こどもが読んで解きにくい
  var DAIJI = ['〇', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖'];
  // まちがえが3回たまるたびに待つ。待つ時間は回を重ねるごとに長くする（1分→5分→15分）
  var GATE_LOCKS = [60000, 300000, 900000];
  var GATE_MISS_MAX = 3;
  var GATE_LEVEL_RESET_MS = 6 * 3600000;   // 最後の待ちから6時間たったら、待つ時間は1分にもどす
  var gateMem = { miss: 0, level: 0, lock: 0, loaded: false };
  function gateLockedUntil() { return Math.max(App.gateLock || 0, gateMem.lock || 0); }
  function gatePut(key, v) {
    if (has('Store', 'setPref')) try { Promise.resolve(SA.Store.setPref(key, v)).catch(function () { }); } catch (e) { }
  }
  /** 待ちの終わりの時刻を、読み直しても残るように保存する */
  function setGateLock(t) { App.gateLock = t; gateMem.lock = t; gatePut('gateLock', t); }
  function setGateMiss(n) { gateMem.miss = n; gatePut('gateMiss', n); }
  function setGateLevel(n) { gateMem.level = n; gatePut('gateLevel', n); }
  /** 保存したまちがいの回数・待ちの段・待ちの終わりを読む（読み直し・開き直しでも数え続ける） */
  function loadGate() {
    function fix() {
      var now = Date.now(), maxMs = GATE_LOCKS[GATE_LOCKS.length - 1];
      // 端末の時計を戻されても、待ちがいちばん長い待ちより長くはならないようにする
      if (gateMem.lock > now + maxMs) gateMem.lock = now + maxMs;
      if (gateMem.level > 0 && gateMem.lock && now - gateMem.lock > GATE_LEVEL_RESET_MS) setGateLevel(0);
      App.gateLock = gateMem.lock;
      return gateLockedUntil();
    }
    if (gateMem.loaded || !has('Store', 'getPref')) return Promise.resolve(fix());
    function num(p) { return Promise.resolve(p).then(function (v) { return Number(v) || 0; }, function () { return 0; }); }
    var g = function (k) { try { return num(SA.Store.getPref(k)); } catch (e) { return Promise.resolve(0); } };
    return Promise.all([g('gateLock'), g('gateMiss'), g('gateLevel')]).then(function (v) {
      gateMem.loaded = true;
      gateMem.lock = Math.max(gateMem.lock, v[0]);
      gateMem.miss = Math.max(gateMem.miss, Math.min(GATE_MISS_MAX, Math.max(0, Math.floor(v[1]))));
      gateMem.level = Math.max(gateMem.level, Math.min(GATE_LOCKS.length, Math.max(0, Math.floor(v[2]))));
      return fix();
    }, function () { return fix(); });
  }
  function gateMiss() {
    var n = gateMem.miss + 1;
    if (n < GATE_MISS_MAX) { setGateMiss(n); return false; }
    var ms = GATE_LOCKS[Math.min(gateMem.level, GATE_LOCKS.length - 1)];
    setGateMiss(0);
    setGateLevel(Math.min(GATE_LOCKS.length, gateMem.level + 1));
    setGateLock(Date.now() + ms);
    return true;
  }
  function gatePassed() { setGateMiss(0); setGateLevel(0); }
  /** 100〜999 の数（どのけたも1〜9）を大字で書く。例: 327 → 参百弐拾漆 */
  function daijiNum3(x) {
    var hd = Math.floor(x / 100), td = Math.floor(x / 10) % 10, od = x % 10;
    return DAIJI[hd] + '百' + DAIJI[td] + '拾' + DAIJI[od];
  }
  // ふりがなを付けない問題文（関門の仕掛け）。各・桁・偶数・奇数・昇順・降順は、小学校で習わないか高学年の字とことば
  var GATE_FORMS = [
    { id: 'low', text: '「{num}」の各桁を、下の桁から順に押してください', f: function (d) { return [d[2], d[1], d[0]]; } },
    { id: 'asc', text: '「{num}」の各桁を、昇順に押してください', f: function (d) { return d.slice().sort(); } },
    { id: 'desc', text: '「{num}」の各桁を、降順に押してください', f: function (d) { return d.slice().sort().reverse(); } },
    { id: 'evenDesc', text: '「{num}」の各桁のうち、偶数だけを大きい順に押してください', f: function (d) { return d.filter(function (x) { return x % 2 === 0; }).sort().reverse(); } },
    { id: 'evenAsc', text: '「{num}」の各桁のうち、偶数だけを小さい順に押してください', f: function (d) { return d.filter(function (x) { return x % 2 === 0; }).sort(); } },
    { id: 'oddDesc', text: '「{num}」の各桁のうち、奇数だけを大きい順に押してください', f: function (d) { return d.filter(function (x) { return x % 2 === 1; }).sort().reverse(); } },
    { id: 'oddAsc', text: '「{num}」の各桁のうち、奇数だけを小さい順に押してください', f: function (d) { return d.filter(function (x) { return x % 2 === 1; }).sort(); } }
  ];
  /** 問題を作る。3けたの大字の数（どのけたもちがう1〜9、偶数と奇数をどちらもふくむ）と、押し方の指示。
   * 答えの数字の個数は1〜3でちがうので、押したあとに「決める」を押す */
  function gateQuestion(rnd) {
    rnd = rnd || Math.random;
    var dg;
    do {
      var pool = [1, 2, 3, 4, 5, 6, 7, 8, 9]; dg = [];
      for (var i = 0; i < 3; i++) dg.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    } while (dg.every(function (x) { return x % 2 === 0; }) || dg.every(function (x) { return x % 2 === 1; }));
    var forms = (T().parent && T().parent.gateForms) || null;
    var fm = GATE_FORMS[Math.floor(rnd() * GATE_FORMS.length)];
    var tmpl = (forms && forms[fm.id]) || fm.text;
    return { text: plain(fill(tmpl, { num: daijiNum3(dg[0] * 100 + dg[1] * 10 + dg[2]) })), answer: fm.f(dg), form: fm.id };
  }
  /** 3秒の長押しボタンを作る。押し切ったら onDone */
  function holdButton(label, onDone, cls) {
    var b = h('button', { cls: 'btn hold ' + (cls || ''), attrs: { type: 'button', 'data-hold': '1' } });
    b.innerHTML = '<span class="hold-fill"></span><span class="hold-l">' + furi(label) + '</span>';
    var timer = 0, start = 0, raf = 0;
    var fillEl = b.querySelector('.hold-fill');
    function tick() { var p = Math.min(1, (Date.now() - start) / 3000); fillEl.style.width = (p * 100) + '%'; if (p < 1) raf = requestAnimationFrame(tick); }
    function down(e) {
      if (e && e.type === 'keydown') { if (e.key !== 'Enter' && e.key !== ' ') return; if (e.repeat) return; e.preventDefault(); }
      if (timer) return;
      start = Date.now();
      timer = setTimeout(function () { timer = 0; cancelAnimationFrame(raf); fillEl.style.width = '0%'; onDone(); }, 3000);
      raf = requestAnimationFrame(tick);
    }
    function up() { if (!timer) return; clearTimeout(timer); timer = 0; cancelAnimationFrame(raf); fillEl.style.width = '0%'; if (Date.now() - start < 2900) toast('3{秒|びょう}{長押|ながお}ししてね'); }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('keydown', down);
    b.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') up(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return b;
  }
  /** 関門を出す。通ったら cb(true)、やめたら cb(false)。問題文にはふりがなを付けない（おとなが読む） */
  function gate(cb) {
    var body = h('div.gate');
    var passed = false;
    var m = modal(body, { title: '{保護者|ほごしゃ}の{方|かた}へ', onClose: function () { if (!passed) cb(false); } });
    function wait() {
      body.innerHTML = '';
      var p = h('p.gate-wait', { attrs: { id: 'gate-wait' } });
      body.appendChild(p);
      (function loop() {
        if (m.closed) return;
        var left = Math.ceil((gateLockedUntil() - Date.now()) / 1000);
        if (left <= 0) { ask(); return; }
        var mm = Math.floor(left / 60), ss = left % 60;
        p.innerHTML = furi((T().parent && T().parent.gateWaitLock) || 'まちがえが{続|つづ}いたので、{少|すこ}し{待|ま}ってね。') + '<br>' + furi('あと') + ' <b>' + mm + ':' + (ss < 10 ? '0' : '') + ss + '</b>';
        setTimeout(loop, 500);
      })();
    }
    function ask() {
      body.innerHTML = '';
      var qa = gateQuestion(), nums = qa.answer;
      var q = h('p.gate-q', { attrs: { id: 'gate-q', lang: 'ja' } });
      q.textContent = qa.text;
      body.appendChild(q);
      var shown = h('div.gate-in', { attrs: { 'aria-live': 'polite' } });
      body.appendChild(shown);
      var got = [];
      function show() { shown.textContent = got.length ? got.map(function () { return '●'; }).join(' ') : ''; }
      var pad = h('div.gate-pad');
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach(function (d) {
        pad.appendChild(h('button', { cls: 'btn gate-k', attrs: { type: 'button', 'data-num': String(d) }, html: String(d), on: { click: function () {
          if (got.length >= 6) return;
          got.push(d); show();
        } } }));
      });
      pad.appendChild(btn('{消|け}す', function () { got = []; show(); }, 'gate-k gate-clear', { attrs: { type: 'button', 'data-act': 'gate-clear' } }));
      pad.appendChild(btn('{決|き}める', function () {
        if (!got.length) return;
        if (got.join() === nums.join()) { passed = true; gatePassed(); m.close(); cb(true); return; }
        if (gateMiss()) { toast((T().parent && T().parent.gateLockToast) || 'まちがえが{続|つづ}いたので、{少|すこ}し{待|ま}ってね', 'ng'); wait(); return; }
        toast((T().parent && T().parent.gateWrong) || 'ちがうみたい。もう{一度|いちど}どうぞ。', 'ng');
        ask();
      }, 'primary gate-k gate-ok', { attrs: { type: 'button', 'data-act': 'gate-ok' } }));
      body.appendChild(pad);
      body.appendChild(h('p.muted', { text: 'お{子|こ}さまが{設定|せってい}を{変|か}えないための{確|たし}かめです。{数字|すうじ}を{押|お}したら「{決|き}める」を{押|お}してください。' }));
    }
    loadGate().then(function (lock) { if (m.closed) return; if (lock > Date.now()) wait(); else ask(); });
    return m;
  }

  /* ================= 歩行中の判定 ================= */
  function updateBlock() {
    var w = doc.getElementById('walk');
    if (w) w.hidden = !App.walking;
    var appEl = doc.getElementById('app');
    if (appEl) {
      appEl.classList.toggle('blocked', !!App.walking);
      appEl.classList.toggle('checking', !!App.checking);
      if (App.walking) appEl.setAttribute('inert', ''); else appEl.removeAttribute('inert');
    }
    var lay = doc.getElementById('layer');
    if (lay) { if (App.walking) lay.setAttribute('inert', ''); else lay.removeAttribute('inert'); }
    // たしかめているあいだは「取り込む」ボタンに「たしかめ中…」と出す（固まったように見えないように）
    var sb = doc.querySelector('[data-act="sync"]');
    if (sb) {
      var bl = sb.querySelector('.bl');
      if (App.checking) {
        if (bl && !sb.hasAttribute('data-label')) { sb.setAttribute('data-label', bl.innerHTML); bl.innerHTML = furi('たしかめ{中|ちゅう}…'); }
        sb.classList.add('checking-b');
      } else {
        if (bl && sb.hasAttribute('data-label')) { bl.innerHTML = sb.getAttribute('data-label'); sb.removeAttribute('data-label'); }
        sb.classList.remove('checking-b');
      }
    }
  }
  var walkPoll = 0;
  /** 3秒たしかめる。歩いていたら全部のボタンを押せなくする。true＝歩いている */
  function walkCheck() {
    if (!has('Steps', 'walkingNow')) return Promise.resolve(false);
    App.checking = true; updateBlock();
    var ms = CFG().WALKING_CHECK_MS || 3000;
    return Promise.resolve(SA.Steps.walkingNow(ms)).then(function (w) { return !!w; }, function () { return false; }).then(function (w) {
      App.checking = false;
      var was = App.walking;
      App.walking = w;
      updateBlock();
      if (w !== was) renderSim();
      if (w && !was && App.state && has('Rules', 'noteWalkingBlock')) { setState(SA.Rules.noteWalkingBlock(App.state, today())); save(); }
      if (w) { clearTimeout(walkPoll); walkPoll = setTimeout(function () { walkCheck().then(function (still) { if (!still) afterUnblock(); }); }, 5000); }
      return w;
    });
  }
  function afterUnblock() { if (App.state && !App.view) sync('unblock'); }

  /* ================= 取り込み ================= */
  function syncFrom(s, t) {
    var R = SA.Rules, hd = (App.info && typeof App.info.historyDays === 'number') ? App.info.historyDays : 7;
    var from = s.lastSyncDate || s.createdAt || t;
    var earliest = R.addDays(t, -Math.max(0, hd - 1));
    if (from < earliest) from = earliest;
    if (from > t) from = t;
    return from;
  }
  /** 前回の同期日から今日までを読んで、ルールに入れて、保存して、出来事を見せる */
  function sync(reason) {
    if (!App.state || App.view || App.syncing) return Promise.resolve([]);
    if (App.walking) return Promise.resolve([]);
    if (!has('Steps', 'read') || !has('Rules', 'ingest')) { render(); return Promise.resolve([]); }
    App.syncing = true;
    var t = today();
    var from = syncFrom(App.state, t);
    // はじめての取り込み: iPhone は過去7日を読める（Android(b) と試遊は今日から）
    if (reason === 'first' && App.info && App.info.route === 'ios') from = SA.Rules.addDays(t, -6);
    setSyncLabel(true);
    var before = syncMark(App.state);
    return Promise.resolve(SA.Steps.read(from, t)).then(function (days) { return days || []; }, function () { return []; }).then(function (days) {
      var r;
      try { r = SA.Rules.ingest(App.state, days, { today: t, now: Date.now() }); } catch (e) { console.warn('ingest', e); r = { state: App.state, events: [] }; }
      setState(r.state);
      App.lastSyncAt = Date.now();
      return save().then(function () {
        if (has('Notify', 'schedule')) { try { Promise.resolve(SA.Notify.schedule(App.state, { ask: reason === 'first' })).catch(function () { }); } catch (e) { } }
        App.syncing = false;
        setSyncLabel(false);
        var evs = (r.events || []).slice();
        var extra = weeklyPrompt(t);
        return extra.then(function (wk) {
          if (wk) evs.push(wk);
          render();
          if (evs.length && SA.Screens && SA.Screens.showEvents) SA.Screens.showEvents(evs);
          // 「取り込む」を押しても何も増えなかったときは、そう知らせる
          else if (reason === 'button' && syncMark(App.state) === before) toast((T().special && T().special.noNew) || 'まだ{新|あたら}しい{歩数|ほすう}はないよ');
          return evs;
        });
      });
    }).catch(function (e) { console.warn('sync', e); App.syncing = false; setSyncLabel(false); render(); return []; });
  }
  /** 取り込みで増えたかどうかを見るための印（今日までの実歩数と来訪累計） */
  function syncMark(s) {
    if (!s) return '';
    var r = s.recent || {}, sum = 0;
    Object.keys(r).forEach(function (k) { sum += Number(r[k]) || 0; });
    return sum + ':' + (s.visitTotal || 0) + ':' + Object.keys(s.daily || {}).length;
  }
  function setSyncLabel(on) {
    var b = doc.querySelector('[data-act="sync"]');
    if (b) { b.disabled = !!on; b.classList.toggle('busy', !!on); }
  }
  // 月曜の朝に先週のふりかえり（1回だけ）
  function weeklyPrompt(t) {
    if (!has('Rules', 'weekday') || SA.Rules.weekday(t) !== 1 || !has('Store', 'getPref')) return Promise.resolve(null);
    if (App.state.createdAt && App.state.createdAt > SA.Rules.addDays(t, -7)) return Promise.resolve(null);
    return SA.Store.getPref('weekShown').then(function (v) {
      if (v === t) return null;
      return SA.Store.setPref('weekShown', t).then(function () { return { type: 'week', monday: SA.Rules.addDays(t, -7) }; });
    }, function () { return null; });
  }

  /* ================= ためし歩き（ブラウザの試遊だけ） ================= */
  var simOpen = false;
  var simOpt = { hour: 'hiru', spread: 'cont' };
  function renderSim() {
    var box = doc.getElementById('sim');
    if (!box) return;
    var appEl = doc.getElementById('app');
    if (!isSim() || isNative() || !App.state || App.view) { box.hidden = true; box.innerHTML = ''; if (appEl) appEl.classList.remove('has-sim'); return; }
    box.hidden = false;
    box.innerHTML = '';
    if (appEl) appEl.classList.add('has-sim');
    placeSim();
    var sim = SA.Steps.sim;
    var st = sim.status ? sim.status() : { today: today(), steps: 0, walking: false };
    var handle = h('button.sim-handle', { attrs: { type: 'button', 'aria-expanded': simOpen ? 'true' : 'false', 'data-act': 'sim-toggle' }, on: { click: function () { simOpen = !simOpen; renderSim(); } } },
      [h('span', { text: 'ためし{歩|ある}き（{試遊版|しゆうばん}だけ）' }), h('span.sim-arrow', { html: simOpen ? '▼' : '▲' })]);
    box.appendChild(handle);
    box.classList.toggle('open', simOpen);
    if (!simOpen) return;
    var p = h('div.sim-panel');
    var wl = h('label.switch', [
      h('input', { attrs: { type: 'checkbox', 'data-act': 'sim-walking', checked: st.walking ? true : false }, on: { change: function (e) {
        sim.setWalking(e.target.checked);
        walkCheck().then(function (w) { if (!w) afterUnblock(); renderSim(); });
      } } }),
      h('span', { text: '{歩|ある}いている（テスト）' })
    ]);
    if (App.walking) { p.appendChild(wl); box.appendChild(p); return; }   // 歩いているあいだは、このスイッチだけ
    p.appendChild(h('p.sim-day', { text: '{今日|きょう}: ' + st.today + '（' + n(st.steps) + '{歩|ほ}）' }));
    var hours = [['asa', '{朝|あさ}'], ['hiru', '{昼|ひる}'], ['yu', '{夕|ゆう}'], ['yoru', '{夜|よる}'], ['shinya', '{深夜|しんや}']];
    var hrow = h('div.seg', { attrs: { role: 'group', 'aria-label': '時間帯' } });
    hours.forEach(function (x) {
      hrow.appendChild(btn(x[1], function () { simOpt.hour = x[0]; renderSim(); }, 'seg-b' + (simOpt.hour === x[0] ? ' on' : ''), { attrs: { type: 'button', 'data-hour': x[0], 'aria-pressed': simOpt.hour === x[0] ? 'true' : 'false' } }));
    });
    p.appendChild(h('div.sim-l', { text: '{時間帯|じかんたい}' }));
    p.appendChild(hrow);
    var srow = h('div.seg');
    [['cont', '{続|つづ}けて'], ['bits', 'こまめに']].forEach(function (x) {
      srow.appendChild(btn(x[1], function () { simOpt.spread = x[0]; renderSim(); }, 'seg-b' + (simOpt.spread === x[0] ? ' on' : ''), { attrs: { type: 'button', 'data-spread': x[0], 'aria-pressed': simOpt.spread === x[0] ? 'true' : 'false' } }));
    });
    p.appendChild(h('div.sim-l', { text: '{歩|ある}き{方|かた}' }));
    p.appendChild(srow);
    var arow = h('div.sim-add');
    [500, 1000, 3000, 10000].forEach(function (k) {
      arow.appendChild(btn('+' + n(k) + '{歩|ほ}', function () {
        sim.addSteps(k, { hour: simOpt.hour, spread: simOpt.spread });
        simClose();   // ホームの輪や棒がふえるところを見られるように、引き出しを閉じる
        sync('sim');
      }, 'primary', { attrs: { type: 'button', 'data-add': String(k) } }));
    });
    p.appendChild(arow);
    var drow = h('div.row');
    drow.appendChild(btn('{次|つぎ}の{日|ひ}へ', function () { sim.nextDay(); simClose(); sync('sim'); }, '', { attrs: { type: 'button', 'data-act': 'sim-next' } }));
    drow.appendChild(btn('7{日|にち}すすめる', function () { sim.skipDays(7); simClose(); sync('sim'); }, '', { attrs: { type: 'button', 'data-act': 'sim-skip7' } }));
    p.appendChild(drow);
    // 開かない日が続いたとき（修行お休みのカード）を試す。読める日数（7日）より長くとばす
    if (typeof sim.skipDays === 'function') p.appendChild(h('div.row', [btn('14{日|にち}とばす（{修行|しゅぎょう}お{休|やす}みを{試|ため}す）', function () { sim.skipDays(14); simClose(); sync('sim'); }, '', { attrs: { type: 'button', 'data-act': 'sim-skip14' } })]));
    p.appendChild(wl);
    p.appendChild(btn('はじめから', function () { resetAll(); }, 'ghost red-t', { attrs: { type: 'button', 'data-act': 'sim-reset' } }));
    box.appendChild(p);
  }

  function simClose() { if (simOpen) { simOpen = false; renderSim(); } }
  /** 引き出しの取っ手を、下のメニューのすぐ上に置く（メニューの高さは端末で変わる） */
  function placeSim() {
    var box = doc.getElementById('sim'), nav = doc.getElementById('nav');
    if (!box) return;
    var hgt = nav && !nav.hidden ? Math.max(0, Math.round(root.innerHeight - nav.getBoundingClientRect().top)) : 0;
    box.style.bottom = hgt + 'px';
  }
  if (root.addEventListener) root.addEventListener('resize', function () { if (doc.getElementById('sim') && !doc.getElementById('sim').hidden) placeSim(); });

  /* ================= はじめから ================= */
  function resetAll(skipConfirm) {
    function doit() {
      var p = has('Store', 'clear') ? SA.Store.clear() : Promise.resolve();
      return Promise.resolve(p).then(function () {
        try { if (SA.Steps && SA.Steps.sim && SA.Steps.sim.reset) SA.Steps.sim.reset(); } catch (e) { }
        try { if (has('Notify', 'cancelAll')) SA.Notify.cancelAll(); } catch (e) { }
        App.state = null; App.view = false; App.viewState = null; App.viewUnlocked = false; App.walking = false; App.broken = null; simOpen = false;
        closeAllModals();
        startOnboarding(0);
      });
    }
    if (skipConfirm) return doit();
    confirmBox('{記録|きろく}をぜんぶ{消|け}して、はじめからにしますか？', '{消|け}す', 'やめる', function (ok1) {
      if (!ok1) return;
      confirmBox('{本当|ほんとう}に{消|け}しますか？ もとにはもどせません。', '{本当|ほんとう}に{消|け}す', 'やめる', function (ok2) { if (ok2) doit(); }, { danger: true });
    }, { danger: true });
  }

  /* ================= 起動 ================= */
  function startOnboarding(step) {
    // はじめての画面を外から始めるときは、前回選んだ相棒・おとな／こどもを残さない（こどもが既定）
    if (SA.Screens && SA.Screens.resetOnboard) SA.Screens.resetOnboard();
    App.screen = 'onboard'; App.params = { step: step || 0 };
    render();
  }
  function enterView(viewState) {
    App.view = true; App.viewState = viewState || null; App.state = null; App.viewUnlocked = false;
    App.screen = App.screen === 'road' ? 'road' : 'zukan';
    render();
  }
  function registerSW() {
    try {
      if (isNative()) return;
      if (!/^https?:$/.test(root.location.protocol)) return;
      if (!root.navigator.serviceWorker) return;
      root.navigator.serviceWorker.register('sw.js').catch(function () { });
    } catch (e) { }
  }
  function onOpen(reason) {
    if (!App.state || App.view) return Promise.resolve();
    if (has('Rules', 'noteOpen')) setState(SA.Rules.noteOpen(App.state, today()));
    return walkCheck().then(function (w) { if (w) { render(); return save(); } return sync(reason); });
  }
  function boot() {
    if (!doc.getElementById('app')) return;
    registerSW();
    hookNativeBack();
    watchJutsu();
    var detect = has('Steps', 'detect') ? Promise.resolve(SA.Steps.detect()).catch(function () { return null; }) : Promise.resolve(null);
    var load = has('Store', 'load') ? Promise.resolve(SA.Store.load()).catch(function () { return null; }) : Promise.resolve(null);
    var pref = has('Store', 'getPref') ? Promise.all([SA.Store.getPref('viewMode'), SA.Store.getPref('furigana')]).catch(function () { return [null, null]; }) : Promise.resolve([null, null]);
    return Promise.all([detect, load, pref]).then(function (a) {
      App.info = a[0] || { route: 'none', canBuckets: false, historyDays: 0 };
      if (a[2] && a[2][1] === false) App.furiPref = false;
      var raw = a[1];
      if (!raw) return { s: null, a: a };
      // store.js が「壊れていて控えも読めない」と知らせたら（SA.Store.isCorrupt）、そのまま「記録が読めませんでした」へ
      if (SA.Store && typeof SA.Store.isCorrupt === 'function' && SA.Store.isCorrupt(raw)) return { s: null, a: a, broken: true };
      var s = usableState(raw);
      // 本体が壊れていて store.js が控えから戻したとき（lastError.recovered）は「ひとつ前の記録にもどしました」を出す
      if (s && SA.Store && SA.Store.lastError && SA.Store.lastError.recovered === true) App.restoredFromBak = true;
      if (s) return { s: s, a: a };
      // 読めなかったら、ひとつ前の保存（:bak）を試す
      return readBackup().then(function (b) {
        var sb = usableState(b);
        if (sb) { App.restoredFromBak = true; return { s: sb, a: a }; }
        return { s: null, a: a, broken: true };
      });
    }).then(function (x) {
      var s = x.s, a = x.a;
      if (x.broken) { showBroken(); return; }
      if (!s) {
        if (a[2] && a[2][0]) { enterView(); return; }   // 「ながめる」を選んだ人（メニューから試遊に移れる）
        if (!has('Rules', 'newState')) { App.screen = 'onboard'; render(); return; }
        startOnboarding(0);
        return;
      }
      App.state = s;
      // 経路が変わったら（ブラウザ→アプリの読み込みなど）今の経路に合わせる
      if (App.info.route && App.state.route !== App.info.route) App.state.route = App.info.route;
      if (App.info.route === 'none') { enterView(App.state); App.viewState = App.state; App.state = null; return; }
      App.screen = 'home';
      render();
      if (App.restoredFromBak) { App.restoredFromBak = false; toast((T().special && T().special.restoredBak) || 'ひとつ{前|まえ}の{記録|きろく}にもどしました'); save(); }
      return onOpen('boot');
    }).catch(function (e) { console.warn('boot', e); showBroken(); });
  }
  /** 検査を通る state だけを返す（migrate で直せるなら直す）。どうしてもだめなら null */
  function usableState(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    if (!has('Rules', 'validate')) return x;
    try { if (SA.Rules.validate(x).ok) return x; } catch (e) { console.warn('validate', e); }
    if (has('Rules', 'migrate')) {
      try {
        var m = SA.Rules.migrate(x);
        if (m && SA.Rules.validate(m).ok) return m;
        if (m) console.warn('validate', SA.Rules.validate(m).errors);
      } catch (e) { console.warn('migrate', e); }
    }
    return null;
  }
  /** ひとつ前の保存を読む（SA.Store.loadBackup があればそれ、ブラウザなら localStorage の :bak） */
  function readBackup() {
    try {
      if (has('Store', 'loadBackup')) return Promise.resolve(SA.Store.loadBackup()).catch(function () { return null; });
      if (SA.Store && SA.Store.backend === 'local' && root.localStorage) {
        var t = root.localStorage.getItem((SA.Store.KEY || 'shinobi-ashi:v1') + ':bak');
        return Promise.resolve(t ? JSON.parse(t) : null);
      }
    } catch (e) { }
    return Promise.resolve(null);
  }
  /** 記録が読めなかったときの画面（書き出しファイルを開く・はじめから） */
  function showBroken() {
    App.state = null; App.view = false; App.viewState = null; App.broken = true;
    App.screen = 'broken'; App.params = {};
    render();
  }
  // 前景に戻ったら取り込む
  if (doc) doc.addEventListener('visibilitychange', function () {
    if (doc.visibilityState !== 'visible' || !App.state || App.view) return;
    if (Date.now() - App.lastSyncAt < 1500) return;
    onOpen('resume');
  });

  /* ================= about.html（遊び方・おうちの方へ） ================= */
  function renderAbout() {
    var box = doc.getElementById('about');
    if (!box) return;
    var P = T().parent || {}, help = T().help || [];
    box.innerHTML = '';
    var sec = function (title, kids) { return h('section.card', [h('h2', { text: title })].concat(kids)); };
    if (P.unofficial) box.appendChild(h('p.unofficial', { text: P.unofficial }));
    if (P.short) box.appendChild(sec('おうちの{方|かた}へ', [h('p', { text: P.short })]));
    if (P.claims) box.appendChild(sec('{大切|たいせつ}なこと', P.claims.map(function (c) { return h('div.claim', [h('h3', { text: c.title }), h('p', { text: c.text })]); })));
    if (P.detail) box.appendChild(sec('くわしく', P.detail.map(function (t) { return h('p', { text: t }); })));
    var more = [P.gate, P.permission, P.revoke, P.exportNote, P.erase, P.medical].filter(Boolean);
    if (more.length) box.appendChild(sec('{設定|せってい}と{記録|きろく}', more.map(function (t) { return h('p', { text: t }); })));
    if (help.length) box.appendChild(sec('{遊|あそ}び{方|かた}', help.map(function (x) { return h('details.qa', [h('summary', { text: x.q }), h('p', { text: x.a })]); })));
    if (P.credit) box.appendChild(sec('このアプリについて', [h('p', { text: P.credit }),
      // ブラウザ版は QR の2つだけ（P.parts）。アプリ版は P.partsApp（QR のほかの部品）と P.creditApp（MPL-2.0 の知らせ）。
      // URL は文字で出すだけ（リンクにしない）
      h('p', { text: (isNative() && P.partsApp) || P.parts || '{使|つか}っている{部品|ぶひん}：QR コードを{作|つく}る{部品|ぶひん}と{読|よ}む{部品|ぶひん}（vendor/LICENSES.md にライセンスを{書|か}いています）。' }),
      isNative() && P.creditApp ? h('p', { text: P.creditApp }) : null]));
    if (!P.short) box.appendChild(h('p', { text: '{文章|ぶんしょう}は{準備中|じゅんびちゅう}です。' }));
  }

  SA.UI = {
    furi: furi, esc: esc, plain: plain, kana: kana, fill: fill, n: n, h: h, add: add, btn: btn, soon: soon, has: has, icon: icon,
    App: App, today: today, isNative: isNative, isSim: isSim, kids: kids, charOf: charOf,
    save: save, apply: apply, setState: setState, summary: summary,
    go: go, render: render, toast: toast, clearToast: clearToast, modal: modal, handleBack: handleBack, closeAllModals: closeAllModals, confirmBox: confirmBox,
    gate: gate, holdButton: holdButton, walkCheck: walkCheck, sync: sync, onOpen: onOpen, chime: chime,
    resetAll: resetAll, startOnboarding: startOnboarding, enterView: enterView, renderSim: renderSim, boot: boot, renderAbout: renderAbout
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.UI;

  if (doc) {
    var start = function () { if (doc.getElementById('about')) renderAbout(); else boot(); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
