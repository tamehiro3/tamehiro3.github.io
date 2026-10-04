/* ニンジャ夜明け隊（RPG） — メニュー・店・鍛冶・旅の地図
 * メニューのタブ：仲間／隊列／道具／お守り／鍛冶（金鬼が仲間になってから）／仲間帳／図鑑／記録。
 * ctx（game.js から）：{ S, objective(), save(), toTitle(), close() }
 */
(function (root) {
  'use strict';
  function UI() { return root.NYT_UI; }
  function ST() { return root.NYT_STATE; }
  function CHD() { return root.NYT_CHARS; }
  function SK() { return root.NYT_SKILLS; }
  function IT() { return root.NYT_ITEMS; }
  function BS() { return root.NYT_BASE; }
  function FD() { return root.NYT_FIELD; }
  function EN() { return root.NYT_ENEMIES.ENEMIES; }
  function NSL() { return root.NSL_CHARS; }
  function $(id) { return document.getElementById(id); }
  function el(t, c, h) { return UI().el(t, c, h); }
  function esc(s) { return UI().esc(s); }
  function sfx(n) { UI().sfx(n); }
  var M = { open: false, tab: 'party', ctx: null, onClose: null, kind: null };

  // ---- 枠 ----
  function frame(title, tabs, cur, onTab) {
    var p = $('panel'); p.innerHTML = ''; p.hidden = false;
    var box = el('div', 'pbox win'); box.setAttribute('role', 'dialog');
    var hd = el('header'); hd.innerHTML = '<h2>' + esc(title) + '</h2>';
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', '閉じる'); x.onclick = function () { close(); };
    hd.appendChild(x); box.appendChild(hd);
    if (tabs) {
      var tb = el('div', 'tabs');
      tabs.forEach(function (t) { var b = el('button', t[0] === cur ? 'on' : '', esc(t[1])); b.type = 'button'; b.onclick = function () { sfx('cursor'); onTab(t[0]); }; tb.appendChild(b); });
      box.appendChild(tb);
    }
    var body = el('div', 'pbody'); box.appendChild(body);
    p.appendChild(box);
    p.onclick = function (e) { if (e.target === p) close(); };
    M.open = true;
    return body;
  }
  function close() {
    if (!M.open) return;
    $('panel').hidden = true; $('panel').innerHTML = '';
    M.open = false; sfx('back');
    var f = M.onClose; M.onClose = null; M.kind = null;
    if (f) f();
  }
  M.close = close;
  function goldLine(S, extra) { return '<div class="gold-line"><span>両 <b>' + S.gold + '</b></span><span>暁のかけら <b>' + S.frag + '/5</b></span>' + (extra || '') + '</div>'; }
  function bar(v, mx, cls) { return '<div class="bar' + (cls ? ' ' + cls : '') + '"><i style="width:' + Math.max(0, Math.min(100, v / Math.max(1, mx) * 100)) + '%"></i></div>'; }
  function faceBox(id, size) { var f = el('div', 'face-s'); var fe = UI().faceEl(id, size || 44); if (fe) f.appendChild(fe); return f; }
  function roleTags(id) { return CHD().CHARS[id].roles.map(function (r) { var R = BS().ROLES[r]; return '<span class="tag" style="background:' + R.color + '">' + R.name + '</span>'; }).join(''); }
  function fmtTime(s) { s = Math.floor(s || 0); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h + '時間' + (m < 10 ? '0' : '') + m + '分'; }

  // ====================== メニュー ======================
  function tabsFor(S) {
    var t = [['party', '仲間'], ['form', '隊列'], ['items', '道具'], ['charms', 'お守り']];
    if (S.members.kanaoni) t.push(['forge', '鍛冶']);
    t.push(['roster', '仲間帳'], ['dex', '図鑑'], ['rec', '記録・設定']);
    return t;
  }
  M.menu = function (ctx, tab, onClose) {
    M.ctx = ctx; M.onClose = onClose; M.kind = 'menu';
    show(tab || (M.tab && M.tab !== 'member' ? M.tab : 'party'));   // 仲間のくわしい画面で閉じたときは、一覧から
  };
  function show(tab, arg) {
    var S = M.ctx.S;
    M.tab = tab;
    var body = frame('メニュー', tabsFor(S), tab, function (t) { show(t); });
    var R = { party: tabParty, form: tabForm, items: tabItems, charms: tabCharms, forge: tabForge, roster: tabRoster, dex: tabDex, rec: tabRec, member: memberDetail };
    (R[tab] || tabParty)(body, S, arg);
    if (UI().kbd) { var on = body.parentNode.querySelector('.tabs .on'); if (on) on.focus(); else UI().focusFirst(body); }
  }
  M.show = show;

  // ---- 仲間 ----
  function tabParty(body, S) {
    body.innerHTML = goldLine(S, '<span>仲間 <b>' + (S.order.length - 1) + '/39</b></span>') + '<div class="note" style="margin-bottom:8px">いまの目的：' + esc(M.ctx.objective()) + '</div>';
    var list = el('div', 'list');
    S.order.forEach(function (id, i) {
      var m = S.members[id], st = ST().stats(S, id);
      var r = el('button', 'row');
      r.type = 'button';
      r.appendChild(faceBox(id));
      var info = el('div', 'nm', esc(UI().cname(id)) + ' <span class="sub">Lv' + m.lv + '　' + (i < 4 ? '前' : i < 8 ? '控え' : '待機') + '</span><br>' + roleTags(id));
      r.appendChild(info);
      var bars = el('div', 'bars', '<span class="sub">HP ' + m.hp + '/' + st.hp + '</span>' + bar(m.hp, st.hp) + bar(m.sp, st.sp, 'sp'));
      r.appendChild(bars);
      r.onclick = function () { sfx('click'); show('member', id); };
      list.appendChild(r);
    });
    body.appendChild(list);
  }
  var ABIL_D = { push: 'リーリー：大岩を押して動かせる', hawk: '鷹の目：見えない道を見つけられる', wind: '風遁：濃い霧を晴らせる', bomb: '焙烙玉：ひびの入った岩をこわせる' };
  function memberDetail(body, S, id) {
    var m = S.members[id], c = CHD().CHARS[id], st = ST().stats(S, id), nsl = NSL() && NSL().BY_ID[id];
    var top = el('div', '');
    var back = el('button', 'btn small', '← 一覧'); back.type = 'button'; back.onclick = function () { sfx('back'); show('party'); };
    top.appendChild(back); body.appendChild(top);
    var d = el('div', 'detail');
    var big = el('div', 'big');
    big.appendChild(UI().spriteCanvas(id === 'hero' ? root.NYT_SPRITES.heroDef(S) : root.NYT_SPRITES.cnDef(id), 150, { full: true, yaw: 25, expr: 'happy' }));
    d.appendChild(big);
    var right = el('div', '');
    var need = BS().expNeed(m.lv);
    var h = '<h3 class="p-h3" style="margin-top:0">' + esc(UI().cname(id)) + (nsl ? ' <span class="sub">' + esc(nsl.clan) + '・No.' + esc(nsl.num) + '</span>' : '') + '</h3>';
    h += '<div>' + roleTags(id) + ' <span class="sub">武器：' + esc(c.wn) + '（' + BS().TYPES[c.wt].name + 'の型' + (c.wmag ? '・忍術の力' : '') + '）Lv' + m.wlv + '</span></div>';
    h += '<div class="sub" style="margin-top:4px">Lv ' + m.lv + (m.lv < BS().MAX_LV ? '　次まで ' + (need - m.exp) : '　最大') + '</div>' + bar(m.exp, need, 'exp');
    h += '<dl class="kv">';
    var NM = BS().STAT_NAME;
    [['hp', m.hp + '/' + st.hp], ['sp', m.sp + '/' + st.sp], ['atk', st.atk], ['def', st.def], ['mag', st.mag], ['mdf', st.mdf], ['spd', st.spd], ['luk', st.luk]].forEach(function (p) { h += '<dt>' + NM[p[0]] + '</dt><dd>' + p[1] + '</dd>'; });
    h += '</dl>';
    if (c.field) h += '<div class="note">探索の術：' + esc(ABIL_D[c.field]) + '</div>';
    right.innerHTML = h;
    // お守り
    var ch = el('div', ''); ch.innerHTML = '<div class="p-h3">お守り（2つまで）</div>';
    var slots = el('div', 'list');
    [0, 1].forEach(function (k) {
      var cid = m.charms[k], cd = cid ? IT().CHARMS[cid] : null;
      var b = el('button', 'row', '<span class="nm">' + (cd ? esc(cd.n) + ' <span class="sub">' + esc(cd.d) + '</span>' : '<span class="sub">（空き）タップでつける</span>') + '</span>');
      b.type = 'button'; b.onclick = function () { sfx('click'); charmPicker(id, k); };
      slots.appendChild(b);
    });
    ch.appendChild(slots); right.appendChild(ch);
    d.appendChild(right);
    body.appendChild(d);
    // 忍術
    var sk = el('div', ''); sk.innerHTML = '<div class="p-h3">忍術</div>';
    var sl = el('div', 'sk-list');
    var have = ST().skillsOf(S, id);
    var all = (c.sk || []).map(function (p) { return p; });
    (S.learned[id] || []).forEach(function (s) { if (!all.some(function (p) { return p[0] === s; })) all.push([s, 0]); });
    if (id === 'hero') ['h_ak1', 'h_ak2', 'h_ak3', 'h_ak4', 'h_ak5'].forEach(function (s) { if (!all.some(function (p) { return p[0] === s; })) all.push([s, -1]); });
    all.forEach(function (p) {
      var s = SK().SKILLS[p[0]]; if (!s) return;
      var ok = have.indexOf(p[0]) >= 0;
      var r = el('div', 'sk-row' + (ok ? '' : ' lock'));
      var ty = s.ty && s.ty !== 'rand' ? UI().typeIcon(s.ty) : '<span class="ty" style="background:#c8c8d8">' + (s.k === 'heal' ? '癒' : '術') + '</span>';
      r.innerHTML = ty + '<div style="flex:1;min-width:0"><b>' + esc(ok || p[1] > 0 ? s.n : '？？？') + '</b>' + (s.ult ? ' <span class="tag" style="background:#a83a6a">大技</span>' : '') + ' <span class="sub">術力' + (s.sp || 0) + '</span><div class="d">' + (ok ? esc(s.d || '') : p[1] > 0 ? 'Lv' + p[1] + 'で覚える' : '暁のかけらを取り戻すと覚える') + '</div></div>';
      sl.appendChild(r);
    });
    sk.appendChild(sl); body.appendChild(sk);
    // 絆技
    var kz = SK().KIZUNA.filter(function (z) { return z.a === id || z.b === id; });
    if (kz.length) {
      var kb = el('div', ''); kb.innerHTML = '<div class="p-h3">絆技（絆ゲージがいっぱいのとき）</div>';
      kz.forEach(function (z) { var o = z.a === id ? z.b : z.a; kb.appendChild(el('div', 'sk-row' + (S.members[o] ? '' : ' lock'), '<div><b>' + esc(z.n) + '</b>　<span class="sub">' + esc(UI().cname(o)) + 'といっしょに' + (S.members[o] ? '' : '（まだ仲間でない）') + '</span><div class="d">' + esc(z.d) + '</div></div>')); });
      body.appendChild(kb);
    }
    if (nsl) {
      var pf = el('div', '');
      pf.innerHTML = '<div class="p-h3">公式プロフィール</div><div class="note">クラン：' + esc(nsl.clan) + '　忍術：' + esc(nsl.jutsu) + '　武器：' + esc(nsl.weapon) + '　誕生日：' + esc(nsl.birthday) + (nsl.bio ? '<br>' + esc(nsl.bio) : '') + '<br>（技・セリフ・物語はゲームの創作です）</div>';
      body.appendChild(pf);
    }
  }
  function charmPicker(id, slot) {
    var S = M.ctx.S, m = S.members[id];
    var body = frame('お守りをえらぶ', null);
    body.innerHTML = '<div class="note">' + esc(UI().cname(id)) + 'の ' + (slot + 1) + 'つめ。いまつけているもの：' + (m.charms[slot] ? esc(IT().CHARMS[m.charms[slot]].n) : 'なし') + '</div>';
    var list = el('div', 'list');
    var none = el('button', 'row', '<span class="nm">はずす</span>'); none.type = 'button';
    none.onclick = function () { ST().equipCharm(S, id, slot, null); sfx('click'); show('member', id); };
    list.appendChild(none);
    Object.keys(IT().CHARMS).forEach(function (cid) {
      var have = S.charms[cid] || 0; if (!have) return;
      var free = ST().charmFree(S, cid), cd = IT().CHARMS[cid];
      var b = el('button', 'row' + (free > 0 ? '' : ' off'), '<span class="nm">' + esc(cd.n) + '<br><span class="sub">' + esc(cd.d) + '</span></span><span class="num">空き ' + free + '/' + have + '</span>');
      b.type = 'button';
      b.onclick = function () { if (free <= 0) { UI().toast('ほかの仲間がつけている'); sfx('ng'); return; } ST().equipCharm(S, id, slot, cid); sfx('ok'); show('member', id); };
      list.appendChild(b);
    });
    if (list.children.length === 1) list.appendChild(el('div', 'note', 'お守りを持っていない。町のお店で買えるよ。'));
    body.appendChild(list);
    M.open = true;
  }

  // ---- 隊列 ----
  var formSel = -1;
  function tabForm(body, S) {
    body.innerHTML = '<div class="note">前の4人が戦う。控えの4人は、前の仲間が全員倒れたとき1度だけかけつける（戦いの中の「交代」でも入れかえられる）。<br>2人を順にタップすると入れかわる。' + esc(S.name) + 'はいつも前にいる。</div>';
    var mk = function (title, from, to, cls) {
      body.appendChild(el('div', 'p-h3', title));
      var g = el('div', 'form-slots');
      for (var i = from; i < to; i++) {
        (function (i) {
          var id = S.order[i];
          var b = el('button', 'form-slot ' + cls + (formSel === i ? ' sel' : ''));
          b.type = 'button';
          if (id) { b.appendChild(faceBox(id, 52)); b.appendChild(el('div', '', esc(UI().cname(id)) + '<br><span class="sub">Lv' + S.members[id].lv + '</span>')); }
          else b.appendChild(el('div', 'sub', '空き'));
          b.onclick = function () { pickSlot(i); };
          g.appendChild(b);
        })(i);
      }
      body.appendChild(g);
    };
    mk('前（戦う4人）', 0, 4, 'front');
    mk('控え', 4, 8, '');
    if (S.order.length > 8) mk('待機（戦いには出ない）', 8, S.order.length + ((4 - (S.order.length - 8) % 4) % 4), '');
    var auto = el('button', 'btn small', 'レベルの高い順にならべる'); auto.type = 'button'; auto.style.marginTop = '12px';
    auto.onclick = function () { var rest = S.order.filter(function (x) { return x !== 'hero'; }).sort(function (a, b) { return S.members[b].lv - S.members[a].lv; }); S.order = ['hero'].concat(rest); formSel = -1; sfx('ok'); show('form'); };
    body.appendChild(auto);
  }
  function pickSlot(i) {
    var S = M.ctx.S;
    if (i >= S.order.length && formSel < 0) return;
    if (formSel < 0) { formSel = i; sfx('cursor'); show('form'); return; }
    if (formSel === i) { formSel = -1; show('form'); return; }
    var j = Math.min(i, S.order.length - 1);
    ST().swapOrder(S, formSel, j); formSel = -1; sfx('ok');
    show('form');
  }
  M.formation = function (ctx, onClose) { M.ctx = ctx; M.onClose = onClose; M.kind = 'menu'; formSel = -1; show('form'); };

  // ---- 道具 ----
  var FIELD_USE = { heal: 1, sp: 1, healall: 1 };
  function tabItems(body, S) {
    body.innerHTML = goldLine(S);
    var list = el('div', 'list');
    var any = false;
    IT().ITEM_ORDER.forEach(function (id) {
      var n = S.items[id] || 0; if (!n) return; any = true;
      var it = IT().ITEMS[id], can = FIELD_USE[it.k];
      var b = el('button', 'row' + (can ? '' : ' off'), (it.ty ? UI().typeIcon(it.ty) : '') + '<span class="nm">' + esc(it.n) + '<br><span class="sub">' + esc(it.d) + (can ? '' : '（戦いで使う）') + '</span></span><span class="num">×' + n + '</span>');
      b.type = 'button';
      b.onclick = function () { if (!can) { UI().toast('戦いの中で使う道具'); return; } sfx('click'); useItemField(id); };
      list.appendChild(b);
    });
    if (!any) list.appendChild(el('div', 'note', '道具を持っていない'));
    body.appendChild(list);
    var keys = Object.keys(S.keys).filter(function (k) { return S.keys[k] > 0; });
    var mats = Object.keys(S.mats);
    if (keys.length || mats.length) {
      body.appendChild(el('div', 'p-h3', '大事な物・素材'));
      var kl = el('div', 'list');
      mats.forEach(function (k) { kl.appendChild(el('div', 'row', '<span class="nm">' + esc(IT().MATS[k].n) + '<br><span class="sub">' + esc(IT().MATS[k].d) + '</span></span><span class="num">×' + S.mats[k] + '</span>')); });
      keys.forEach(function (k) { var d = IT().KEYS[k]; if (d) kl.appendChild(el('div', 'row', '<span class="nm">' + esc(d.n) + '<br><span class="sub">' + esc(d.d) + '</span></span>' + (S.keys[k] > 1 ? '<span class="num">×' + S.keys[k] + '</span>' : ''))); });
      body.appendChild(kl);
    }
  }
  function useItemField(id) {
    var S = M.ctx.S, it = IT().ITEMS[id];
    if (it.k === 'healall') {
      S.order.forEach(function (m) { var st = ST().stats(S, m); S.members[m].hp = Math.min(st.hp, S.members[m].hp + it.v); });
      ST().addItem(S, id, -1); sfx('heal'); UI().toast('みんなのHPが回復した'); show('items'); return;
    }
    var body = frame(it.n + 'をだれに？', null);
    var list = el('div', 'list');
    S.order.forEach(function (mid) {
      var m = S.members[mid], st = ST().stats(S, mid);
      var full = it.k === 'heal' ? m.hp >= st.hp : m.sp >= st.sp;
      var b = el('button', 'row' + (full ? ' off' : ''));
      b.type = 'button';
      b.appendChild(faceBox(mid));
      b.appendChild(el('div', 'nm', esc(UI().cname(mid)) + '<br><span class="sub">HP ' + m.hp + '/' + st.hp + '　術力 ' + m.sp + '/' + st.sp + '</span>'));
      b.onclick = function () {
        if (!(S.items[id] > 0)) { show('items'); return; }
        if (full) { UI().toast('もう満タン'); return; }
        if (it.k === 'heal') m.hp = Math.min(st.hp, m.hp + it.v); else m.sp = Math.min(st.sp, m.sp + it.v);
        ST().addItem(S, id, -1); sfx('heal');
        if (S.items[id] > 0) useItemField(id); else show('items');
      };
      list.appendChild(b);
    });
    var back = el('button', 'btn small', '← もどる'); back.type = 'button'; back.onclick = function () { show('items'); };
    body.appendChild(back); body.appendChild(list);
  }

  // ---- お守り ----
  function tabCharms(body, S) {
    body.innerHTML = '<div class="note">お守りは1人2つまで。仲間の画面でつけかえられる。</div>';
    var list = el('div', 'list'), any = false;
    Object.keys(IT().CHARMS).forEach(function (cid) {
      var have = S.charms[cid] || 0; if (!have) return; any = true;
      var who = S.order.filter(function (id) { return S.members[id].charms.indexOf(cid) >= 0; }).map(UI().cname);
      list.appendChild(el('div', 'row', '<span class="nm">' + esc(IT().CHARMS[cid].n) + '<br><span class="sub">' + esc(IT().CHARMS[cid].d) + (who.length ? '　つけている：' + esc(who.join('、')) : '') + '</span></span><span class="num">×' + have + '</span>'));
    });
    if (!any) list.appendChild(el('div', 'note', 'お守りを持っていない。町の道具屋で買える。'));
    body.appendChild(list);
  }

  // ---- 鍛冶 ----
  function tabForge(body, S) {
    body.innerHTML = goldLine(S, '<span>玉鋼 <b>' + (S.mats.tamahagane || 0) + '</b></span>') + '<div class="note">金鬼が武器を鍛えてくれる。1段ごとに攻撃と忍術が10%上がる（最大Lv5）。玉鋼は強い妖怪が落とす。</div>';
    var list = el('div', 'list');
    S.order.forEach(function (id) {
      var m = S.members[id], cost = ST().forgeCost(S, id), c = CHD().CHARS[id];
      var can = cost && S.gold >= cost.gold && (S.mats.tamahagane || 0) >= cost.tama;
      var b = el('button', 'row' + (can ? '' : ' off'));
      b.type = 'button';
      b.appendChild(faceBox(id));
      b.appendChild(el('div', 'nm', esc(UI().cname(id)) + '　<span class="sub">' + esc(c.wn) + '</span><br><span class="sub">武器Lv ' + m.wlv + (cost ? '　→ ' + (m.wlv + 1) + '：' + cost.gold + '両・玉鋼' + cost.tama : '（最大）') + '</span>'));
      b.onclick = function () {
        if (!cost) { UI().toast('もう最大まで鍛えてある'); return; }
        if (!can) { UI().toast(S.gold < cost.gold ? '両が足りない' : '玉鋼が足りない'); sfx('ng'); return; }
        ST().forge(S, id); sfx('forge'); UI().toast(UI().cname(id) + 'の' + c.wn + 'が Lv' + m.wlv + ' になった！');
        show('forge');
      };
      list.appendChild(b);
    });
    body.appendChild(list);
  }

  // ---- 仲間帳 ----
  function tabRoster(body, S, sel) {
    var n = CHD().ORDER.filter(function (id) { return S.members[id]; }).length;
    body.innerHTML = '<div class="gold-line"><span>仲間になった忍者 <b>' + n + '/39</b></span></div><div class="note">CryptoNinja の39人。まだ会っていない忍者は、ヒントを見てさがそう。</div>';
    var g = el('div', 'grid-cn');
    CHD().ORDER.forEach(function (id) {
      var joined = !!S.members[id], nsl = NSL() && NSL().BY_ID[id];
      var b = el('button', 'cn-cell' + (joined ? '' : ' no') + (sel === id ? ' sel' : ''));
      b.type = 'button';
      var ph = el('div', 'ph'); var im = new Image(); im.alt = ''; im.loading = 'lazy'; im.src = UI().portrait(id); ph.appendChild(im);
      b.appendChild(ph); b.appendChild(el('div', '', joined ? esc(nsl ? nsl.name : id) : (nsl ? 'No.' + esc(nsl.num) : '？？？')));
      b.onclick = function () {
        sfx('click');
        if (joined) { show('member', id); return; }
        var hint = CHD().CHARS[id].hint || (root.NYT_STORY.STORY_HINT || {})[id] || '物語を進めると会えるかも';
        var box = $('roster-hint'); box.innerHTML = '<b>' + (nsl ? 'No.' + esc(nsl.num) + '（' + esc(nsl.clan) + '）' : '') + '</b><br>ヒント：' + esc(hint);
        box.hidden = false; box.scrollIntoView({ block: 'nearest' });
      };
      g.appendChild(b);
    });
    var hint = el('div', 'row'); hint.id = 'roster-hint'; hint.hidden = true; hint.style.marginBottom = '8px';
    body.appendChild(hint);
    body.appendChild(g);
  }

  // ---- 図鑑 ----
  function tabDex(body, S) {
    var all = Object.keys(EN()).filter(function (k) { var e = EN()[k]; return !e.duel && !e.tut && !/_s$/.test(k); });
    var seen = all.filter(function (k) { return S.dex[k]; });
    body.innerHTML = '<div class="gold-line"><span>出会った妖怪 <b>' + seen.length + '/' + all.length + '</b></span></div><div class="note">弱点は、戦いで当てると記録される。</div>';
    var list = el('div', 'list');
    all.forEach(function (k) {
      var e = EN()[k], dx = S.dex[k];
      var r = el('div', 'row' + (dx ? '' : ' off'));
      var f = el('div', 'face-s'); if (dx) f.appendChild(UI().yokaiCanvas(k, 44)); r.appendChild(f);
      if (!dx) { r.appendChild(el('div', 'nm', '？？？')); list.appendChild(r); return; }
      var ws = (e.weak || []).map(function (t) { return dx.weak && dx.weak[t] ? UI().typeIcon(t) : '<span class="ty" style="background:#556;color:#fff">?</span>'; }).join('');
      r.appendChild(el('div', 'nm', esc(e.n) + ' <span class="sub">Lv' + e.lv + (e.boss ? '・大将' : '') + (e.rare ? '・めずらしい' : '') + '　倒した数 ' + (dx.won || 0) + '</span><br><span class="sub">弱点 </span>' + ws + '<br><span class="sub">' + esc(e.desc || '') + '</span>'));
      list.appendChild(r);
    });
    body.appendChild(list);
  }

  // ---- 記録・設定 ----
  function tabRec(body, S) {
    body.innerHTML = '<div class="gold-line"><span>プレイ時間 <b>' + fmtTime(S.time) + '</b></span><span>戦い <b>' + (S.battles || 0) + '</b></span><span>歩いた数 <b>' + (S.steps || 0) + '</b></span></div>';
    var sv = el('button', 'btn gold', '記録する'); sv.type = 'button';
    sv.onclick = function () { var ok = M.ctx.save(); UI().toast(ok ? '記録しました' : 'この端末では記録できません'); sfx(ok ? 'ok' : 'ng'); };
    body.appendChild(sv);
    body.appendChild(el('div', 'note', '町に入ったとき・宿にとまったときも、自動で記録されます。'));
    body.appendChild(el('div', 'p-h3', '設定'));
    var set = S.settings;
    var rowSel = function (label, opts, get, put) {
      var r = el('div', 'set-row'); r.appendChild(el('span', '', esc(label)));
      var sg = el('div', 'seg');
      opts.forEach(function (o) { var b = el('button', get() === o[0] ? 'on' : '', esc(o[1])); b.type = 'button'; b.onclick = function () { put(o[0]); sfx('cursor'); show('rec'); }; sg.appendChild(b); });
      r.appendChild(sg); body.appendChild(r);
    };
    rowSel('文字の速さ', [[1, 'おそい'], [2, 'ふつう'], [3, 'はやい']], function () { return set.text; }, function (v) { set.text = v; });
    rowSel('戦いの速さ', [[false, 'ふつう'], [true, 'はやい']], function () { return !!set.fast; }, function (v) { set.fast = v; });
    rowSel('戦いのおまかせ', [[false, '自分でえらぶ'], [true, 'おまかせ']], function () { return !!set.auto; }, function (v) { set.auto = v; });
    rowSel('難しさ', [['normal', 'ふつう'], ['easy', 'やさしい']], function () { return S.diff; }, function (v) { S.diff = v; });
    rowSel('効果音', [[true, 'あり'], [false, 'なし']], function () { return !!set.sound; }, function (v) { set.sound = v; if (root.NYT_AUDIO) root.NYT_AUDIO.setSound(v); });
    rowSel('音楽', [[true, 'あり'], [false, 'なし']], function () { return !!set.bgm; }, function (v) { set.bgm = v; if (root.NYT_AUDIO) root.NYT_AUDIO.setMusic(v); });
    rowSel('画面のゆれ', [[true, 'あり'], [false, 'なし']], function () { return set.shake !== false; }, function (v) { set.shake = v; if (root.NYT_RBATTLE) root.NYT_RBATTLE.R.noShake = !v; });
    body.appendChild(el('div', 'p-h3', '遊び方'));
    var hb = el('div', ''); hb.innerHTML = UI().helpHTML(); body.appendChild(hb);
    var tt = el('button', 'btn small', 'タイトルへもどる'); tt.type = 'button'; tt.style.marginTop = '12px';
    tt.onclick = function () {
      if (!tt.dataset.ask) { tt.dataset.ask = 1; tt.textContent = '記録してタイトルへ（もう一度おす）'; return; }
      M.ctx.save(); close(); M.ctx.toTitle();
    };
    body.appendChild(tt);
    body.appendChild(el('div', 'note', 'CryptoNinja（CC0・Ninja DAO）の非公式ファンゲーム（試作版）。技・セリフ・物語はゲームの創作で、公式の設定ではありません。'));
  }

  // ====================== 店 ======================
  M.shop = function (ctx, town, onClose) {
    M.ctx = ctx; M.onClose = onClose; M.kind = 'shop';
    shopView(town, 'buy');
  };
  function shopView(town, mode) {
    var S = M.ctx.S, sh = IT().SHOPS[town];
    var body = frame('道具屋', [['buy', '買う'], ['sell', '売る']], mode, function (t) { shopView(town, t); });
    body.innerHTML = goldLine(S);
    var list = el('div', 'list');
    if (mode === 'buy') {
      sh.items.forEach(function (id) { list.appendChild(buyRow(town, id, IT().ITEMS[id], S.items[id] || 0)); });
      if (sh.charms.length) { list.appendChild(el('div', 'p-h3', 'お守り')); sh.charms.forEach(function (id) { list.appendChild(buyRow(town, id, IT().CHARMS[id], S.charms[id] || 0)); }); }
    } else {
      var any = false;
      IT().ITEM_ORDER.forEach(function (id) { var n = S.items[id] || 0; if (!n || !(IT().ITEMS[id].price > 0)) return; any = true; list.appendChild(sellRow(town, id, IT().ITEMS[id], n)); });
      Object.keys(S.charms).forEach(function (id) { var free = ST().charmFree(S, id); if (free <= 0 || !(IT().CHARMS[id].price > 0)) return; any = true; list.appendChild(sellRow(town, id, IT().CHARMS[id], free)); });
      if (!any) list.appendChild(el('div', 'note', '売れる物を持っていない（つけているお守りは売れない）'));
    }
    body.appendChild(list);
    if (UI().kbd) UI().focusFirst(body);
  }
  function buyRow(town, id, d, have) {
    var S = M.ctx.S;
    var b = el('button', 'row' + (S.gold >= d.price ? '' : ' off'), (d.ty ? UI().typeIcon(d.ty) : '') + '<span class="nm">' + esc(d.n) + '<br><span class="sub">' + esc(d.d) + '　持っている数 ' + have + '</span></span><span class="num">' + d.price + '両</span>');
    b.type = 'button';
    b.onclick = function () { if (S.gold < d.price) { UI().toast('両が足りない'); sfx('ng'); return; } qty(town, id, d, 'buy'); };
    return b;
  }
  function sellRow(town, id, d, n) {
    var b = el('button', 'row', '<span class="nm">' + esc(d.n) + '<br><span class="sub">持っている数 ' + n + '</span></span><span class="num">' + IT().sellPrice(d.price) + '両</span>');
    b.type = 'button'; b.onclick = function () { qty(town, id, d, 'sell'); };
    return b;
  }
  function qty(town, id, d, mode) {
    var S = M.ctx.S;
    var max = mode === 'buy' ? Math.max(1, Math.min(99, Math.floor(S.gold / d.price))) : (IT().CHARMS[id] ? ST().charmFree(S, id) : S.items[id] || 0);
    var n = 1;
    var body = frame(mode === 'buy' ? '買う' : '売る', null);
    var draw = function () {
      var price = mode === 'buy' ? d.price * n : IT().sellPrice(d.price) * n;
      body.innerHTML = goldLine(S) + '<div class="row"><span class="nm">' + esc(d.n) + '<br><span class="sub">' + esc(d.d || '') + '</span></span></div>';
      var q = el('div', 'set-row');
      q.innerHTML = '<span>いくつ？</span>';
      var qq = el('div', 'qty');
      var mi = el('button', '', '−'); mi.type = 'button'; mi.onclick = function () { n = Math.max(1, n - 1); sfx('cursor'); draw(); };
      var pl = el('button', '', '＋'); pl.type = 'button'; pl.onclick = function () { n = Math.min(max, n + 1); sfx('cursor'); draw(); };
      qq.appendChild(mi); qq.appendChild(el('b', '', String(n))); qq.appendChild(pl);
      q.appendChild(qq); body.appendChild(q);
      body.appendChild(el('div', 'gold-line', '<span>' + (mode === 'buy' ? 'お代' : '売値') + ' <b>' + price + '両</b></span>'));
      var go = el('div', 'rs-btns');
      var ok = el('button', 'btn gold', mode === 'buy' ? '買う' : '売る'); ok.type = 'button';
      ok.onclick = function () {
        if (mode === 'buy') { if (!ST().spend(S, price)) { UI().toast('両が足りない'); return; } ST().addItem(S, id, n); sfx('buy'); UI().toast(d.n + 'を' + n + 'つ買った'); }
        else { ST().addItem(S, id, -n); ST().addGold(S, price); sfx('buy'); UI().toast(d.n + 'を' + n + 'つ売った'); }
        shopView(town, mode);
      };
      var bk = el('button', 'btn', 'やめる'); bk.type = 'button'; bk.onclick = function () { sfx('back'); shopView(town, mode); };
      go.appendChild(bk); go.appendChild(ok); body.appendChild(go);
      if (UI().kbd) ok.focus();
    };
    draw();
  }
  M.forge = function (ctx, onClose) { M.ctx = ctx; M.onClose = onClose; M.kind = 'menu'; show('forge'); };

  // ====================== 旅の地図 ======================
  var TV = { open: false, cb: null, nodes: [], cur: null, cv: null, sel: 0 };
  M.travel = function (S, cur, cb) {
    var MP = root.NYT_MAPS, box = $('travel');
    TV.open = true; TV.cb = cb; TV.cur = cur;
    TV.nodes = MP.TRAVEL.nodes.filter(function (n) { return FD().cond(S, n.show); });
    TV.sel = Math.max(0, TV.nodes.map(function (n) { return n.map; }).indexOf(cur));
    box.innerHTML = '<canvas id="tv-cv"></canvas><div class="tv-head">旅の地図　行き先をえらぶ</div><button class="btn tv-back" type="button" id="tv-back">もどる</button><div class="tv-list" id="tv-list"></div>';
    box.hidden = false;
    TV.cv = $('tv-cv');
    $('tv-back').onclick = function () { travelDone(null); };
    var ls = $('tv-list');
    TV.nodes.forEach(function (n, i) {
      var b = el('button', 'btn' + (n.map === cur ? ' here' : ''), esc(n.name) + (n.map === cur ? '（いまここ）' : ''));
      b.type = 'button'; b.onclick = function () { travelDone(n); };
      ls.appendChild(b);
    });
    TV.cv.onclick = function (e) {
      var r = TV.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 40;
      TV.nodes.forEach(function (n) { var p = tvPos(n); var d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = n; } });
      if (best) travelDone(best);
    };
    drawTravel(S);
    if (UI().kbd) UI().focusFirst(ls);
  };
  function travelDone(n) { if (!TV.open) return; TV.open = false; $('travel').hidden = true; $('travel').innerHTML = ''; sfx(n ? 'ok' : 'back'); var cb = TV.cb; TV.cb = null; if (cb) cb(n); }
  M.travelOpen = function () { return TV.open; };
  M.travelKey = function (k) {
    if (!TV.open) return false;
    if (k === 'back') { travelDone(null); return true; }
    UI().nav($('tv-list'), k === 'left' ? 'up' : k === 'right' ? 'down' : k);
    if (k === 'ok') { var a = document.activeElement; if (a && $('travel').contains(a)) a.click(); }
    return true;
  };
  var TVW = 960, TVH = 580;
  // 地図の置き場所：横長なら右に行き先の列、縦長なら下に列
  function tvScale() {
    var w = root.innerWidth, h = root.innerHeight, land = w > h;
    var aw = land ? w - 200 : w, ah = land ? h - 44 : h * 0.55;
    var s = Math.min(aw / TVW, ah / TVH) * 0.97;
    return { s: s, ox: (aw - TVW * s) / 2, oy: 44 + (ah - 44 - TVH * s) / 2 + (land ? 0 : 0) };
  }
  function tvPos(n) { var k = tvScale(); return [k.ox + n.x * k.s, k.oy + (n.y + 30) * k.s]; }
  function drawTravel(S) {
    var cv = TV.cv, dpr = Math.min(2, root.devicePixelRatio || 1), w = root.innerWidth, h = root.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var c = cv.getContext('2d'), DW = root.NYT_DRAW, k = tvScale();
    c.scale(dpr, dpr);
    var lv = Math.min(6, S.flags.dawn ? 6 : S.frag);
    var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, DW.mix('#141a3a', '#8ab8e8', lv / 6)); g.addColorStop(1, DW.mix('#2a2a4a', '#f0d8b0', lv / 6));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.save(); c.translate(k.ox, k.oy); c.scale(k.s, k.s);
    // 紙
    DW.rrect(c, 10, 10, TVW - 20, TVH - 20, 18, '#efe2c4', '#8a6a3a', 4);
    var rnd = DW.rnd(7);
    for (var i = 0; i < 160; i++) DW.circle(c, 20 + rnd() * (TVW - 40), 20 + rnd() * (TVH - 40), 1 + rnd() * 2, 'rgba(160,120,70,.08)');
    // 海（右下）・山
    c.fillStyle = 'rgba(90,150,200,.35)';
    c.beginPath(); c.moveTo(TVW - 20, 330); c.bezierCurveTo(820, 380, 720, 420, 690, 540); c.lineTo(560, TVH - 20); c.lineTo(TVW - 20, TVH - 20); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,110,170,.4)'; c.lineWidth = 2; for (var wv = 0; wv < 9; wv++) { var wx = 740 + (wv % 3) * 60, wy = 430 + Math.floor(wv / 3) * 40; c.beginPath(); c.moveTo(wx, wy); c.quadraticCurveTo(wx + 12, wy - 6, wx + 24, wy); c.stroke(); }
    [[520, 160], [570, 190], [470, 230], [860, 180], [900, 230], [800, 270]].forEach(function (m) { DW.poly(c, [[m[0] - 34, m[1] + 30], [m[0], m[1] - 24], [m[0] + 34, m[1] + 30]], 'rgba(120,100,80,.35)', 'rgba(90,70,50,.5)', 2); });
    [[160, 360], [200, 410], [140, 420], [230, 380]].forEach(function (t) { DW.circle(c, t[0], t[1] + 30, 16, 'rgba(70,120,60,.35)'); });
    DW.ell(c, 640, 70, 120, 26, 'rgba(255,255,255,.6)');
    // 道
    var byId = {}; TV.nodes.forEach(function (n) { byId[n.id] = n; });
    root.NYT_MAPS.TRAVEL.edges.forEach(function (e) {
      var a = byId[e[0]], b = byId[e[1]]; if (!a || !b) return;
      c.save();
      c.strokeStyle = e[2] === 'sea' ? 'rgba(40,100,180,.8)' : e[2] === 'sky' ? 'rgba(220,170,40,.9)' : 'rgba(120,80,40,.8)';
      c.lineWidth = 4; c.setLineDash(e[2] === 'sky' ? [3, 9] : [12, 8]); c.lineCap = 'round';
      c.beginPath(); c.moveTo(a.x, a.y + 30); c.quadraticCurveTo((a.x + b.x) / 2 + 30, (a.y + b.y) / 2 + 30 - 20, b.x, b.y + 30); c.stroke();
      c.restore();
    });
    // 場所
    TV.nodes.forEach(function (n) {
      var x = n.x, y = n.y + 30, here = n.map === TV.cur;
      DW.circle(c, x, y, here ? 20 : 16, here ? '#e8603a' : '#fff6e0', '#5a3a1a', 3);
      DW.text(c, here ? '★' : '●', x, y + 1, here ? 16 : 10, here ? '#fff' : '#8a5a2a');
      c.font = '900 20px "Hiragino Maru Gothic ProN","Zen Maru Gothic",sans-serif'; var tw = c.measureText(n.name).width;
      DW.rrect(c, x - tw / 2 - 8, y + 22, tw + 16, 28, 10, 'rgba(255,250,235,.95)', '#8a6a3a', 2);
      DW.text(c, n.name, x, y + 36.5, 20, '#3a2a1a');
    });
    c.restore();
  }

  root.NYT_MENU = M;
})(typeof window !== 'undefined' ? window : globalThis);
