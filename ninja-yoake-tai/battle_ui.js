/* ニンジャ夜明け隊（RPG） — 戦闘の流れと操作
 * battle.js の判定を1つずつ進め、積まれた「できごと」を順番に見せる（render_battle.js）。
 * 仲間の番：こうげき・忍術・道具・防御・絆技・交代・逃げる。印（いん）は＋−で使う数を決める。
 * 画面に出すHPなどは「見せている途中の値（D）」で、できごとを見せるたびに少しずつ本当の値に近づく。
 */
(function (root) {
  'use strict';
  function BT() { return root.NYT_BATTLE; }
  function RB() { return root.NYT_RBATTLE; }
  function UI() { return root.NYT_UI; }
  function ST() { return root.NYT_STATE; }
  function SK() { return root.NYT_SKILLS; }
  function IT() { return root.NYT_ITEMS; }
  function BS() { return root.NYT_BASE; }
  function EN() { return root.NYT_ENEMIES.ENEMIES; }
  function AU() { return root.NYT_AUDIO; }
  function sfx(n) { if (AU()) AU().play(n); }
  function $(id) { return document.getElementById(id); }
  function el(t, c, h) { return UI().el(t, c, h); }
  function esc(s) { return UI().esc(s); }

  var Q = null;
  var TYSFX = { zan: 'slash', da: 'hit', sha: 'shoot', hi: 'fire', mizu: 'water', rai: 'thunder', kaze: 'wind', hikari: 'shine' };

  // ====================== はじめる ======================
  // opts: { enemies, ambush, noFlee, guests, guestLv, boss, bbg, bgm, tut, story, lose }  done(result, out, choice)
  function start(S, opts, done) {
    var B = BT().create(S, { enemies: opts.enemies, ambush: opts.ambush || null, noFlee: !!opts.noFlee, guests: opts.guests, guestLv: opts.guestLv });
    Q = {
      S: S, B: B, opts: opts, done: done, D: {}, evi: B.ev.length, wait: 0, after: null, act: null, cur: null, curUid: null,
      boost: 0, tgtMode: null, tgts: null, hover: null, hoverT: 0, lastTarget: null, t: 0, win: false, introT: 1.0, kz: 0,
      stripIdx: -1, ended: false, helpStep: 0, faces: {}, view: 'cmd'
    };
    RB().reset();
    B.units.forEach(function (u) { Q.D[u.uid] = disp(u); });
    buildDom();
    renderCards(); renderOrder(); renderKz();
    var names = {}; B.units.forEach(function (u) { if (u.side === 'e') names[u.name] = 1; });
    var nm = Object.keys(names), boss = B.units.filter(function (u) { return u.side === 'e' && u.boss; })[0];
    var txt = boss ? boss.name + 'があらわれた！' : (nm.length === 1 && B.units.filter(function (u) { return u.side === 'e'; }).length > 1 ? nm[0] + 'たちがあらわれた！' : nm.join('と') + 'があらわれた！');
    if (opts.enemies.some(function (id) { return EN()[id] && EN()[id].duel; })) txt = '腕だめしの勝負！';
    banner(txt, 1.2);
    if (opts.ambush === 'party') setTimeout(function () { if (Q && Q.B === B) banner('先制！ 妖怪の構えがくずれた', 1.2); }, 650);
    if (opts.ambush === 'enemy') setTimeout(function () { if (Q && Q.B === B) banner('不意をつかれた！', 1.2); }, 650);
    if (AU()) AU().bgm(opts.bgm || (boss ? 'boss' : 'battle'));
    sfx(boss ? 'bossWarn' : 'encounter');
    Q.introT = boss ? 1.4 : 0.9;
  }
  function stCopy(st) { var o = {}; for (var k in st) { var v = st[k]; o[k] = v && (typeof v === 'object' || v > 0) ? 1 : 0; } return o; }
  function disp(u) {
    var known = {}; for (var k in (u.known || {})) known[k] = 1;
    return {
      uid: u.uid, side: u.side, id: u.id, eid: u.eid, name: u.name, lv: u.lv, hp: u.hp, mhp: u.mhp, sp: u.sp, msp: u.msp, bp: u.bp || 0,
      shield: u.shield, mshield: u.mshield, ko: u.ko, broken: u.side === 'e' && BT().isBroken(Q.B, u), st: stCopy(u.st), known: known,
      weak: (u.weak || []).slice(), charging: !!u.charging, fled: !!u.fled, bench: !!u.bench, slot: u.slot, boss: !!u.boss, guest: !!u.guest
    };
  }
  function syncAll() {
    Q.B.units.forEach(function (u) {
      var d = Q.D[u.uid];
      if (!d) { Q.D[u.uid] = disp(u); return; }
      var n = disp(u);
      for (var k in n) d[k] = n[k];
    });
    Q.kz = Q.B.kz;
  }

  // ====================== 画面の部品 ======================
  function buildDom() {
    var bt = $('bt'); bt.innerHTML = ''; bt.hidden = false;
    bt.innerHTML =
      '<div class="bt-top"><div id="bt-order"></div><div class="bt-tog"><button id="bt-fast" type="button">はやい<kbd>F</kbd></button><button id="bt-auto" type="button">おまかせ<kbd>R</kbd></button></div></div>' +
      '<div id="bt-banner"></div><div id="bt-help" hidden></div><div id="bt-cut" hidden></div>' +
      '<div id="bt-kz" title="絆ゲージ"><b>絆</b><i></i></div>' +
      '<div id="bt-cmd" class="win" hidden></div><div id="bt-list" class="win" hidden></div><div id="bt-tgt" class="win" hidden></div>' +
      '<div id="bt-party"></div>';
    $('bt-fast').onclick = function () { toggleFast(); };
    $('bt-auto').onclick = function () { toggleAuto(); };
    updToggles();
  }
  function updToggles() { $('bt-fast').classList.toggle('on', !!Q.S.settings.fast); $('bt-auto').classList.toggle('on', !!Q.S.settings.auto); }
  function toggleFast() { Q.S.settings.fast = !Q.S.settings.fast; sfx('click'); updToggles(); }
  function toggleAuto() {
    Q.S.settings.auto = !Q.S.settings.auto; sfx('click'); updToggles();
    if (Q.S.settings.auto && Q.cmdU && !Q.after) { var u = Q.cmdU; closeCmd(); doAct(u, BT().auto(Q.B, u)); }
  }
  function speed() { return Q.S.settings.turbo ? 20 : Q.S.settings.fast ? 2.2 : 1; }

  var bannerT = null;
  function banner(text, sec, ult) {
    var b = $('bt-banner'); if (!b) return;
    b.textContent = text; b.classList.add('on'); b.classList.toggle('ult', !!ult);
    clearTimeout(bannerT); bannerT = setTimeout(function () { b.classList.remove('on'); }, (sec || 1) * 1000 / (Q ? speed() : 1));
  }

  // 顔（順番の帯・札）
  function faceSmall(d) {
    if (d.side === 'e') {
      var key = 'e:' + d.eid;
      if (!Q.faces[key]) Q.faces[key] = UI().yokaiCanvas(d.eid, 40);
      return copyCanvas(Q.faces[key]);
    }
    if (d.id === 'hero') {
      if (!Q.faces.hero) { Q.faces.hero = UI().faceEl('hero', 40); [400, 1200, 2500].forEach(function (ms) { setTimeout(function () { if (Q) renderOrder(); }, ms); }); }
      return copyCanvas(Q.faces.hero);
    }
    var im = new Image(); im.alt = ''; im.src = UI().portrait(d.id); return im;
  }
  function copyCanvas(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; try { c.getContext('2d').drawImage(src, 0, 0); } catch (e) { } return c; }

  function renderOrder() {
    var box = $('bt-order'); if (!box) return;
    box.innerHTML = '';
    var B = Q.B;
    var add = function (uid, cls) { var d = Q.D[uid]; if (!d || d.fled) return; var o = el('div', 'o' + (d.side === 'e' ? ' e' : '') + (cls ? ' ' + cls : '')); o.appendChild(faceSmall(d)); if (d.ko) o.classList.add('done'); box.appendChild(o); };
    (B.order || []).forEach(function (uid, i) { add(uid, i < Q.stripIdx ? 'done' : i === Q.stripIdx ? 'cur' : ''); });
    if (B.nextOrder && B.nextOrder.length) { box.appendChild(el('span', 'sep', '次')); B.nextOrder.forEach(function (uid) { add(uid, ''); }); }
  }
  function renderKz() { var k = $('bt-kz'); if (!k) return; var v = Q.kz, mx = BS().RULE.kz.max; k.querySelector('i').style.width = Math.round(v / mx * 100) + '%'; k.classList.toggle('full', v >= mx); }

  // 仲間の札（前の4人）
  function frontDisp() { var out = []; for (var k in Q.D) { var d = Q.D[k]; if (d.side === 'p' && !d.bench) out.push(d); } return out.sort(function (a, b) { return a.slot - b.slot; }); }
  function renderCards() {
    var box = $('bt-party'); if (!box) return;
    var list = frontDisp(), key = list.map(function (d) { return d.uid; }).join(',');
    if (box._key !== key) {
      box._key = key; box.innerHTML = '';
      list.forEach(function (d) {
        var c = el('div', 'pc'); c.dataset.uid = d.uid;
        c.innerHTML = '<div class="nm"></div><div class="hpn"><span>HP</span><b></b></div><div class="bar"><i></i></div><div class="bar sp"><i></i></div><div class="bp"></div><div class="sts"></div>';
        c.onclick = function () { cardTap(d.uid); };
        box.appendChild(c);
      });
    }
    list.forEach(function (d) {
      var c = box.querySelector('[data-uid="' + d.uid + '"]'); if (!c) return;
      c.querySelector('.nm').innerHTML = esc(d.name) + '<span class="lv">Lv' + d.lv + (d.guest ? '・助っ人' : '') + '</span>';
      c.querySelector('.hpn b').textContent = Math.max(0, Math.round(d.hp)) + '/' + d.mhp;
      c.querySelector('.bar i').style.width = Math.max(0, d.hp / d.mhp * 100) + '%';
      c.querySelector('.bar i').style.background = d.hp / d.mhp < 0.25 ? '#f0604a' : d.hp / d.mhp < 0.5 ? '#f0c040' : '';
      c.querySelector('.bar.sp i').style.width = (d.msp ? Math.max(0, d.sp / d.msp * 100) : 0) + '%';
      var bp = '', use = Q.cmdU && Q.cmdU.uid === d.uid ? Q.boost : 0;
      for (var i = 0; i < BS().RULE.bpMax; i++) bp += '<i class="' + (i < d.bp - use ? 'on' : i < d.bp ? 'use' : '') + '"></i>';
      c.querySelector('.bp').innerHTML = bp;
      var sts = '';
      for (var k in d.st) if (d.st[k] && BS().STATUS[k]) sts += '<span style="background:' + BS().STATUS[k].color + '">' + BS().STATUS[k].name + '</span>';
      c.querySelector('.sts').innerHTML = sts;
      c.classList.toggle('ko', !!d.ko);
      c.classList.toggle('cur', Q.curUid === d.uid);
      c.classList.toggle('tgt', !!(Q.tgts && Q.tgts.indexOf(d.uid) >= 0));
    });
  }

  // ====================== 進める ======================
  function play(cb) { Q.after = cb; }
  function update(dt) {
    if (!Q) return;
    Q.t += dt;
    RB().tick(dt);
    if (Q.hoverT > 0) { Q.hoverT -= dt; if (Q.hoverT <= 0) Q.hover = null; }
    if (Q.ended) return;
    if (Q.introT > 0) { Q.introT -= dt * speed(); if (Q.introT <= 0) nextTurn(); return; }
    if (Q.after) pump(dt);
  }
  function pump(dt) {
    if (Q.wait > 0) { Q.wait -= dt * speed(); if (Q.wait > 0) return; }
    var B = Q.B;
    while (Q.evi < B.ev.length) {
      var e = B.ev[Q.evi++];
      var d = applyEvent(e);
      if (d > 0) { Q.wait = d; return; }
    }
    var f = Q.after; Q.after = null;
    if (f) f();
  }
  function nextTurn() {
    if (!Q || Q.ended) return;
    if (Q.B.result) { play(endBattle); return; }
    var u = BT().nextActor(Q.B);
    Q.cur = u;
    play(function () {
      if (!u || Q.B.result) { endBattle(); return; }
      if (u.side === 'p') {
        if (Q.S.settings.auto) doAct(u, BT().auto(Q.B, u));
        else openCmd(u);
      } else {
        BT().enemyAct(Q.B, u);
        play(afterAction);
      }
    });
  }
  function afterAction() { syncAll(); renderCards(); renderKz(); nextTurn(); }
  function doAct(u, a) {
    var r = BT().act(Q.B, u, a);
    if (r.error) {
      UI().toast(r.error); sfx('ng');
      if (Q.S.settings.auto) BT().act(Q.B, u, { cmd: 'guard' }); else { openCmd(u); return; }
    }
    closeCmd();
    if (a.target != null && Q.D[a.target] && Q.D[a.target].side === 'e') Q.lastTarget = a.target;
    hideHelp();
    play(afterAction);
  }

  // ---- できごとを1つ見せる（待つ秒数を返す）----
  function applyEvent(e) {
    var D = Q.D, d, tg;
    switch (e.t) {
      case 'round': Q.stripIdx = -1; renderOrder(); break;
      case 'turn': case 'skip':
        Q.curUid = e.u;
        var i = Q.B.order.indexOf(e.u, Math.max(0, Q.stripIdx + 1)); if (i >= 0) Q.stripIdx = i;
        renderOrder(); renderCards();
        if (e.t === 'skip' && e.why === 'broken') sfx('daze');
        break;
      case 'act': {
        d = D[e.u];
        if (d && d.side === 'e' && d.charging && e.big) d.charging = false;
        var who = d ? d.name : '';
        if (e.kind === 'kizuna') { cutIn(e.cut || [], e.name, true); sfx('cutin'); }
        else if (e.ult) { cutIn([d.id], e.name, false); sfx('cutin'); }
        else if (e.kind !== 'attack' && e.kind !== 'counter' && e.kind !== 'guard') banner(who + 'の' + e.name, 1.0, e.big);
        else if (e.kind === 'counter') banner(who + 'の反撃！', 0.8);
        if (e.kind === 'guard') sfx('guard');
        if (e.big) sfx('bigcast');
        var dur = RB().onEvent(e, Qv());
        if (e.kind === 'kizuna' || e.ult) dur += 1.15;
        if (e.big) { banner(who + 'の' + e.name + '！', 1.2, true); }
        return dur;
      }
      case 'hit':
        tg = D[e.tg];
        if (tg) {
          tg.hp = e.hpAfter != null ? e.hpAfter : Math.max(0, tg.hp - (e.dmg || 0));
          if (e.shield != null) tg.shield = e.shield;
          if (e.ko) tg.ko = true;
        }
        if (e.miss) sfx('miss');
        else if (e.dot) sfx('poison');
        else if (!e.sac) { sfx(TYSFX[e.ty] || 'hit'); if (e.weak) sfx('weak'); if (e.crit) sfx('crit'); }
        if (tg && tg.side === 'e' && e.weak) tip('weak');
        renderCards();
        break;
      case 'heal': tg = D[e.tg]; if (tg) tg.hp = e.hpAfter; renderCards(); if (!e.regen) sfx('heal'); break;
      case 'sp': tg = D[e.tg]; if (tg) tg.sp = Math.min(tg.msp, tg.sp + e.n); renderCards(); sfx('heal'); break;
      case 'bp': tg = D[e.tg]; if (tg) tg.bp = e.n; renderCards(); if (e.gain) sfx('up'); break;
      case 'kz': Q.kz = e.v; renderKz(); if (e.v >= BS().RULE.kz.max) { sfx('kzfull'); tip('kizuna'); } break;
      case 'break': tg = D[e.tg]; if (tg) { tg.broken = true; tg.shield = 0; tg.charging = false; } sfx('break'); tip('break'); break;
      case 'recover': tg = D[e.tg]; if (tg) { tg.broken = false; var ru = BT().byUid(Q.B, e.tg); tg.shield = ru ? ru.mshield : tg.mshield; } break;
      case 'charge': tg = D[e.u]; if (tg) tg.charging = true; sfx('charge'); tip('charge'); break;
      case 'cancel': tg = D[e.tg]; if (tg) tg.charging = false; break;
      case 'st': tg = D[e.tg]; if (tg) tg.st[e.st] = e.on ? 1 : 0; renderCards(); if (e.on && BS().STATUS[e.st] && BS().STATUS[e.st].bad) sfx('debuff'); break;
      case 'buff': if (e.d != null) sfx(e.d > 0 ? 'up' : 'debuff'); break;
      case 'ko': tg = D[e.tg]; if (tg) { tg.ko = true; tg.hp = 0; tg.charging = false; } sfx(tg && tg.side === 'e' ? 'poof' : 'down'); renderCards(); break;
      case 'revive': tg = D[e.tg]; if (tg) { tg.ko = false; tg.hp = e.hp; } sfx('revive'); renderCards(); break;
      case 'summon': (e.units || []).forEach(function (uid) { var u = BT().byUid(Q.B, uid); if (u) { Q.D[uid] = disp(u); Q.D[uid].hp = u.mhp; } }); sfx('poof'); break;
      case 'transform': { var tu = BT().byUid(Q.B, e.tg); if (tu) { var nd = disp(tu); nd.hp = nd.mhp; nd.shield = nd.mshield; nd.ko = false; Q.D[e.tg] = nd; } banner(e.name + 'に姿を変えた！', 1.6, true); sfx('transform'); break; }
      case 'swap': case 'standby':
        Q.B.units.forEach(function (u) { if (u.side === 'p' && Q.D[u.uid]) { Q.D[u.uid].bench = !!u.bench; Q.D[u.uid].slot = u.slot; } });
        if (e.t === 'standby') { banner('控えの仲間がかけつけた！', 1.4, true); sfx('rescue'); } else sfx('swap');
        renderCards();
        break;
      case 'flee': tg = D[e.who]; if (tg) tg.fled = true; sfx('flee'); break;
      case 'reveal': tg = D[e.tg]; if (tg) tg.known[e.ty] = 1; sfx('reveal'); break;
      case 'msg': banner(e.text, e.big ? 1.6 : 1.0, e.big); return e.big ? 1.5 : 0.8;
      case 'learn': { var s = BT().skillDef(e.skill), ld = D[e.tg]; banner((ld ? ld.name : '') + 'は「' + (s ? s.n : e.skill) + '」を覚えた！', 2.0, true); sfx('learn'); return 1.6; }
      case 'resist': sfx('miss'); break;
      case 'cover': sfx('guard'); break;
      case 'end': break;
    }
    return RB().onEvent(e, Qv());
  }
  // render_battle に渡す小さな窓口
  function Qv() {
    return {
      B: Q.B, D: Q.D, get act() { return Q.act; }, set act(v) { Q.act = v; },
      peek: function (uid) { var ev = Q.B.ev; for (var i = Q.evi; i < ev.length; i++) { if (ev[i].t === 'hit' && ev[i].u === uid) return ev[i].tg; if (ev[i].t === 'act' || ev[i].t === 'turn') break; } return null; }
    };
  }
  // 大技の絵（公式の絵が横切る）
  function cutIn(ids, name, kizuna) {
    var c = $('bt-cut'); if (!c) return;
    c.innerHTML = '';
    var band = el('div', 'cut-band' + (kizuna ? ' kz' : '') + ((ids || []).length > 2 ? ' many' : ''));
    (ids || []).slice(0, 4).forEach(function (id) {
      var f = el('div', 'cut-face');
      if (id === 'hero') f.appendChild(UI().faceEl('hero', 120)); else { var im = new Image(); im.alt = ''; im.src = UI().portrait(id); f.appendChild(im); }
      band.appendChild(f);
    });
    band.appendChild(el('div', 'cut-name', esc(name)));
    c.appendChild(band); c.hidden = false;
    c.classList.remove('go'); c.getBoundingClientRect(); c.classList.add('go');
    setTimeout(function () { c.hidden = true; }, 1150 / speed());
  }

  // ====================== コマンド ======================
  function openCmd(u) {
    Q.cmdU = u; Q.boost = 0; Q.view = 'cmd'; Q.tgtMode = null; Q.tgts = null; Q.curUid = u.uid;
    renderCards();
    showCmd();
    if (Q.opts.tut) tutStep(u);
    else if (u.bp >= 3) tip('boost');
  }
  function closeCmd() { Q.cmdU = null; Q.tgtMode = null; Q.tgts = null; ['bt-cmd', 'bt-list', 'bt-tgt'].forEach(function (id) { var e = $(id); if (e) e.hidden = true; }); }
  function maxBoost(u) { return Math.min(u.bp, BS().RULE.boostMax); }
  function boostHead(u) {
    var h = el('div', 'cmd-head');
    h.innerHTML = '<span><b>' + esc(u.name) + '</b> の番</span>';
    var bx = el('div', 'boost');
    var pips = '';
    for (var i = 0; i < BS().RULE.bpMax; i++) pips += '<i class="' + (i < Q.boost ? 'use' : i < u.bp ? 'have' : '') + '"></i>';
    bx.innerHTML = '<span class="lb">印</span><button type="button" data-b="-" aria-label="印をへらす">−<kbd>Q</kbd></button><span class="pips">' + pips + '</span><button type="button" data-b="+" aria-label="印をふやす">＋<kbd>E</kbd></button>';
    bx.querySelector('[data-b="-"]').disabled = Q.boost <= 0;
    bx.querySelector('[data-b="+"]').disabled = Q.boost >= maxBoost(u);
    bx.querySelector('[data-b="-"]').onclick = function () { setBoost(Q.boost - 1); };
    bx.querySelector('[data-b="+"]').onclick = function () { setBoost(Q.boost + 1); };
    h.appendChild(bx);
    return h;
  }
  function setBoost(n) {
    var u = Q.cmdU; if (!u) return;
    n = Math.max(0, Math.min(maxBoost(u), n));
    if (n === Q.boost) { sfx('ng'); return; }
    Q.boost = n; sfx(n ? 'boost' : 'cursor');
    renderCards();
    if (Q.view === 'cmd') showCmd(); else if (Q.view === 'skill') showSkills();
  }
  function boostNote() {
    if (!Q.boost) return '';
    return '<small>印' + Q.boost + '：こうげき' + (1 + Q.boost) + '回／術の威力×' + BS().RULE.skillBoost[Q.boost] + '</small>';
  }
  function showCmd() {
    var u = Q.cmdU; if (!u) return;
    Q.view = 'cmd';
    $('bt-list').hidden = true; $('bt-tgt').hidden = true;
    var box = $('bt-cmd'); box.innerHTML = ''; box.hidden = false;
    box.appendChild(boostHead(u));
    var g = el('div', 'cmd-grid');
    var T = BS().TYPES[u.wt];
    var btn = function (key, label, sub, cls, dis) { var b = el('button', 'btn' + (cls ? ' ' + cls : ''), esc(label) + (sub ? '<small>' + sub + '</small>' : '')); b.type = 'button'; b.dataset.c = key; if (dis) b.disabled = true; b.onclick = function () { cmd(key); }; g.appendChild(b); return b; };
    btn('attack', 'こうげき', (T ? T.name + 'の型' : '') + (Q.boost ? '×' + (1 + Q.boost) : ''));
    btn('skill', '忍術', u.st.seal > 0 ? '封印中' : '術力' + u.sp, '', u.st.seal > 0);
    btn('item', '道具', '');
    btn('guard', '防御', '印+1');
    var kzFull = Q.B.kz >= BS().RULE.kz.max;
    btn('kizuna', '絆技', kzFull ? 'ためた！' : Math.round(Q.B.kz) + '%', 'kz', !kzFull);
    var benchOk = BT().bench(Q.B).some(function (x) { return !x.ko; });
    btn('swap', '交代', '控えと', '', !benchOk);
    btn('flee', '逃げる', '', '', !!Q.B.opts.noFlee);
    btn('info', 'しらべる', '妖怪');
    box.appendChild(g);
    if (Q.boost) box.appendChild(el('div', 'note', '印を' + Q.boost + 'つ使う：こうげきは' + (1 + Q.boost) + '回、術は威力×' + BS().RULE.skillBoost[Q.boost] + '（全体・連続の術は回数がふえる）'));
    if (UI().kbd) { var f = g.querySelector('button:not([disabled])'); if (f) f.focus(); }
  }
  function cmd(key) {
    var u = Q.cmdU; if (!u) return;
    sfx('click');
    if (key === 'attack') { pickTarget('e', function (tg) { doAct(u, { cmd: 'attack', target: tg, boost: Q.boost }); }); return; }
    if (key === 'skill') { showSkills(); return; }
    if (key === 'item') { showItems(); return; }
    if (key === 'guard') { doAct(u, { cmd: 'guard' }); return; }
    if (key === 'kizuna') { showKizuna(); return; }
    if (key === 'swap') { showSwap(); return; }
    if (key === 'flee') { doAct(u, { cmd: 'flee' }); return; }
    if (key === 'info') { showInfo(); return; }
  }
  function listBox(title, rows, note) {
    $('bt-cmd').hidden = true; $('bt-tgt').hidden = true;
    var box = $('bt-list'); box.innerHTML = ''; box.hidden = false;
    var h = el('div', 'lhead'); h.innerHTML = '<b>' + esc(title) + '</b>' + (note || '');
    var back = el('button', 'btn small', 'もどる<kbd>Esc</kbd>'); back.type = 'button'; back.onclick = function () { sfx('back'); showCmd(); };
    h.appendChild(back); box.appendChild(h);
    if (Q.view === 'skill') box.insertBefore(boostHead(Q.cmdU), h.nextSibling);
    var body = el('div', 'lbody');
    rows.forEach(function (r) { body.appendChild(r); });
    if (!rows.length) body.appendChild(el('div', 'note', 'ありません'));
    box.appendChild(body);
    if (UI().kbd) { var f = body.querySelector('button:not(.off)') || back; f.focus(); }
  }
  function row(html, num, off, fn) {
    var b = el('button', 'row' + (off ? ' off' : ''), html + (num != null ? '<span class="num">' + num + '</span>' : ''));
    b.type = 'button'; b.onclick = function () { if (off) { UI().toast(off); sfx('ng'); return; } fn(); };
    return b;
  }
  function showSkills() {
    var u = Q.cmdU; Q.view = 'skill';
    var rows = u.skills.map(function (sid) {
      var s = BT().skillDef(sid); if (!s) return null;
      var err = BT().canUse(Q.B, u, { cmd: 'skill', skill: sid });
      var ty = s.ty && s.ty !== 'rand' ? UI().typeIcon(s.ty) : s.tys ? s.tys.map(UI().typeIcon).join('') : '<span class="ty" style="background:#c8c8d8">' + (s.k === 'heal' ? '癒' : s.ty === 'rand' ? '？' : '術') + '</span>';
      return row(ty + '<span class="nm">' + esc(s.n) + (s.ult ? ' <span class="tag" style="background:#a83a6a">大技</span>' : '') + '<br><span class="sub">' + esc(s.d || '') + '</span></span>', s.sp || 0, err, function () { useSkill(sid); });
    }).filter(Boolean);
    listBox('忍術（術力 ' + u.sp + '/' + u.msp + '）', rows);
  }
  function useSkill(sid) {
    var u = Q.cmdU, s = BT().skillDef(sid);
    var go = function (tg) { doAct(u, { cmd: 'skill', skill: sid, target: tg, boost: Q.boost }); };
    if (s.tg === 'e1') pickTarget('e', go);
    else if (s.tg === 'a1') pickTarget('p', go);
    else if (s.tg === 'ko') pickTarget('ko', go);
    else go(null);
  }
  var BATTLE_ITEM = { heal: 1, sp: 1, cure: 1, revive: 1, throw: 1, reveal: 1, flee: 1, healall: 1 };
  function showItems() {
    var u = Q.cmdU; Q.view = 'item';
    var rows = IT().ITEM_ORDER.filter(function (id) { return (Q.S.items[id] || 0) > 0 && BATTLE_ITEM[IT().ITEMS[id].k]; }).map(function (id) {
      var it = IT().ITEMS[id], err = BT().canUse(Q.B, u, { cmd: 'item', item: id });
      var ic = it.ty ? UI().typeIcon(it.ty) : '<span class="ty" style="background:#e8d8b0">薬</span>';
      return row(ic + '<span class="nm">' + esc(it.n) + '<br><span class="sub">' + esc(it.d) + (it.k === 'throw' ? '（' + IT().throwDamage(Q.S.members.hero.lv) + 'ほど）' : '') + '</span></span>', '×' + Q.S.items[id], err, function () { useItem(id); });
    });
    listBox('道具', rows);
  }
  function useItem(id) {
    var u = Q.cmdU, it = IT().ITEMS[id];
    var go = function (tg) { doAct(u, { cmd: 'item', item: id, target: tg }); };
    if (it.tg === 'e1') pickTarget('e', go);
    else if (it.tg === 'a1') pickTarget('p', go);
    else if (it.tg === 'ko') pickTarget('ko', go);
    else go(null);
  }
  function showKizuna() {
    var u = Q.cmdU; Q.view = 'kizuna';
    var rows = BT().kizunaReady(Q.B, u).map(function (z) {
      var tys = (z.tys || (z.ty ? [z.ty] : [])).map(UI().typeIcon).join('');
      return row(tys + '<span class="nm">' + esc(z.n) + '<br><span class="sub">' + esc(UI().cname(z.a)) + '×' + esc(UI().cname(z.b)) + '：' + esc(z.d) + '</span></span>', null, null, function () { useKizuna(z.id, z.tg); });
    });
    var all = BT().alive(BT().front(Q.B)).length;
    rows.push(row('<span class="ty" style="background:#ff8ac0">総</span><span class="nm">' + esc(SK().SOUGAKARI.n) + '<br><span class="sub">' + esc(SK().SOUGAKARI.d) + '</span></span>', null, all < 2 ? '前の仲間が2人以上いるときに使える' : null, function () { useKizuna('sougakari', 'e1'); }));
    listBox('絆技（ゲージを全部使う）', rows);
  }
  function useKizuna(id, tg) {
    var u = Q.cmdU, go = function (t) { doAct(u, { cmd: 'kizuna', id: id, target: t }); };
    if (tg === 'e1') pickTarget('e', go); else go(null);
  }
  function showSwap() {
    var u = Q.cmdU; Q.view = 'swap';
    var rows = BT().bench(Q.B).filter(function (x) { return !x.ko; }).map(function (b) {
      return row('<span class="nm">' + esc(b.name) + ' <span class="sub">Lv' + b.lv + '</span><br><span class="sub">HP ' + b.hp + '/' + b.mhp + '　術力 ' + b.sp + '</span></span>', null, null, function () { doAct(u, { cmd: 'swap', with: b.uid }); });
    });
    listBox(u.name + 'と交代する仲間', rows, '<span class="note">交代した仲間は、次の番から動きます</span>');
  }
  function showInfo() {
    Q.view = 'info';
    var rows = BT().alive(BT().enemies(Q.B)).map(function (e) {
      var d = Q.D[e.uid], ws = d.weak.map(function (ty) { return d.known[ty] ? UI().typeIcon(ty) : '<span class="ty" style="background:#556">?</span>'; }).join('');
      var desc = EN()[e.eid] && EN()[e.eid].desc ? EN()[e.eid].desc : '';
      return row('<span class="nm">' + esc(e.name) + ' <span class="sub">Lv' + e.lv + (d.broken ? '　<b style="color:#ff7a5a">崩れている</b>' : '　構え ' + d.shield) + (d.charging ? '　<b style="color:#ff7a5a">ため中</b>' : '') + '</span><br><span class="sub">弱点 </span>' + ws + '<br><span class="sub">' + esc(desc) + '</span></span>', null, null, function () { Q.hover = e.uid; Q.hoverT = 2; });
    });
    listBox('妖怪をしらべる', rows, '<span class="note">弱点は、当ててみると分かります</span>');
  }

  // ---- ねらう相手 ----
  function pickTarget(kind, cb) {
    var B = Q.B, list;
    if (kind === 'e') list = BT().alive(BT().enemies(B));
    else if (kind === 'p') list = BT().alive(BT().front(B));
    else list = BT().front(B).filter(function (x) { return x.ko; });
    list = list.slice().sort(function (a, b) { var pa = RB().pos(a.uid), pb = RB().pos(b.uid); return (pa ? pa.y : 0) - (pb ? pb.y : 0); });
    if (!list.length) { UI().toast(kind === 'ko' ? '倒れた仲間がいない' : 'ねらう相手がいない'); return; }
    if (list.length === 1 && kind === 'e' && !Q.S.settings.confirmOne) { cb(list[0].uid); return; }
    var idx = 0;
    if (kind === 'e' && Q.lastTarget != null) { var li = list.map(function (x) { return x.uid; }).indexOf(Q.lastTarget); if (li >= 0) idx = li; }
    if (kind === 'p') { var lo = 0; list.forEach(function (x, i) { if (x.hp / x.mhp < list[lo].hp / list[lo].mhp) lo = i; }); idx = lo; }
    Q.tgtMode = { kind: kind, list: list.map(function (x) { return x.uid; }), idx: idx, cb: cb, back: Q.view };
    Q.tgts = [Q.tgtMode.list[idx]];
    $('bt-cmd').hidden = true; $('bt-list').hidden = true;
    var box = $('bt-tgt'); box.hidden = false;
    box.innerHTML = '';
    var lab = el('span', '', kind === 'e' ? 'だれをねらう？（妖怪をタップ／◀▶）' : kind === 'ko' ? 'だれを起こす？（札をタップ／◀▶）' : 'だれに？（札をタップ／◀▶）');
    var prev = el('button', 'btn small', '◀'); prev.type = 'button'; prev.onclick = function () { cycle(-1); };
    var next = el('button', 'btn small', '▶'); next.type = 'button'; next.onclick = function () { cycle(1); };
    var ok = el('button', 'btn small gold', '決定<kbd>Enter</kbd>'); ok.type = 'button'; ok.onclick = function () { confirmTarget(); };
    var back = el('button', 'btn small', 'もどる'); back.type = 'button'; back.onclick = function () { cancelTarget(); };
    [lab, prev, next, ok, back].forEach(function (x) { box.appendChild(x); });
    renderCards();
    if (UI().kbd) ok.focus();
  }
  function cycle(d) {
    var m = Q.tgtMode; if (!m) return;
    m.idx = (m.idx + d + m.list.length) % m.list.length; Q.tgts = [m.list[m.idx]]; sfx('cursor'); renderCards();
  }
  function confirmTarget(uid) {
    var m = Q.tgtMode; if (!m) return;
    var tg = uid != null ? uid : m.list[m.idx];
    Q.tgtMode = null; Q.tgts = null; $('bt-tgt').hidden = true;
    sfx('click');
    m.cb(tg);
  }
  function cancelTarget() {
    var m = Q.tgtMode; if (!m) return;
    Q.tgtMode = null; Q.tgts = null; $('bt-tgt').hidden = true; sfx('back');
    renderCards();
    if (m.back === 'skill') showSkills(); else if (m.back === 'item') showItems(); else if (m.back === 'kizuna') showKizuna(); else showCmd();
  }
  function cardTap(uid) {
    var m = Q && Q.tgtMode; if (!m) return;
    if (m.list.indexOf(uid) >= 0) confirmTarget(uid);
  }
  // 画面をタップ
  function tap(x, y) {
    if (!Q) return;
    var m = Q.tgtMode;
    if (m) {
      var hit = RB().hitTest(x, y, m.kind === 'e' ? 'e' : 'p');
      if (hit != null && m.list.indexOf(hit) >= 0) { if (Q.tgts && Q.tgts[0] === hit) confirmTarget(hit); else { m.idx = m.list.indexOf(hit); Q.tgts = [hit]; sfx('cursor'); confirmTarget(hit); } }
      return;
    }
    var h = RB().hitTest(x, y, 'e');
    if (h != null) { Q.hover = h; Q.hoverT = 2.2; var d = Q.D[h]; if (d) UI().toast(d.name + '　弱点：' + d.weak.map(function (t) { return d.known[t] ? BS().TYPES[t].name : '？'; }).join('・') + (d.broken ? '（崩れている）' : '　構え' + d.shield)); }
  }

  // ---- 手ほどき（はじめての戦い）と、はじめて見たときのヒント ----
  var TIPS = {
    weak: '弱点に当たった！ 盾の数字（構え）が減った。0にすると「崩し」だよ。',
    break: '崩し！ 崩れた妖怪は動けず、受けるダメージも大きい。印をためた大技のチャンス！',
    charge: '「ため」は大技の合図。崩すと止められる。止められないときは「防御」で受けよう。',
    boost: '印（●）が3つたまった。「＋」で使うと、こうげきの回数や術の威力が上がる！',
    kizuna: '絆ゲージがいっぱい！ 「絆技」で、仲よしの合わせ技か「総がかり」が使えるよ。'
  };
  function tip(key) {
    var f = 'tip_' + key;
    if (Q.S.flags[f]) return;
    Q.S.flags[f] = 1;
    help(TIPS[key]);
  }
  function help(t) { var h = $('bt-help'); if (!h) return; h.innerHTML = t; h.hidden = false; clearTimeout(help._t); help._t = setTimeout(hideHelp, 9000); }
  function hideHelp() { var h = $('bt-help'); if (h) h.hidden = true; }
  function tutStep(u) {
    Q.helpStep++;
    if (Q.helpStep === 1) help('<b>はじめての戦い</b>：妖怪の下の「？」が弱点。咲耶の<b>こうげき（射）</b>や、' + esc(Q.S.name) + 'の<b>忍術（火・水）</b>でためしてみよう。');
    else if (Q.helpStep === 2) help('盾の数字は「構え」。弱点で当てるたびに1つ減って、0で<b>崩し</b>！');
    else if (Q.helpStep === 3) help('<b>印</b>（札の●）は番ごとに1つたまる。「＋」で使うと、こうげきが2回・3回になるよ。');
  }

  // ====================== おわり ======================
  function endBattle() {
    if (Q.ended) return;
    Q.ended = true;
    closeCmd(); hideHelp();
    syncAll(); renderCards();
    var B = Q.B, res = B.result || 'lose';
    var out = BT().finish(B);
    if (res === 'win') {
      Q.win = true;
      if (AU()) AU().bgm('victory');
      var a = Q.D, front = [];
      for (var k in a) if (a[k].side === 'p' && !a[k].bench) front.push(+k);
      setTimeout(function () { showWin(out); }, 900);
    } else if (res === 'flee') {
      banner('うまく逃げきれた！', 1.2); sfx('flee');
      setTimeout(function () { finish('flee', out); }, 900);
    } else {
      if (AU()) AU().bgm(null);
      sfx('lose');
      setTimeout(function () { showLose(out); }, 900);
    }
  }
  function showWin(out) {
    var box = $('result'); box.innerHTML = ''; box.hidden = false;
    var w = el('div', 'rs-box win');
    var html = '<h2>勝利！</h2>';
    html += '<div class="ln"><span>経験値（仲間みんな）</span><b>+' + out.exp + '</b></div>';
    html += '<div class="ln"><span>両</span><b>+' + out.gold + '</b></div>';
    if (out.drops.length) { var cnt = {}; out.drops.forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; }); html += '<div class="ln"><span>手に入れた物</span><b>' + Object.keys(cnt).map(function (id) { return esc(ST().itemName(id)) + (cnt[id] > 1 ? '×' + cnt[id] : ''); }).join('、') + '</b></div>'; }
    if (out.ups.length) {
      html += '<div class="ups">';
      var front = BT().front(Q.B).map(function (u) { return u.id; });
      var ups = out.ups.slice().sort(function (a, b) { return (front.indexOf(a.id) < 0) - (front.indexOf(b.id) < 0); });
      ups.slice(0, 12).forEach(function (u) {
        html += '<div class="up"><b>' + esc(UI().cname(u.id)) + '</b> Lv' + u.from + ' → <b>' + u.to + '</b>' + u.learned.map(function (s) { var sd = BT().skillDef(s); return '　「' + esc(sd ? sd.n : s) + '」を覚えた！'; }).join('') + '</div>';
      });
      if (ups.length > 12) html += '<div class="note">ほか ' + (ups.length - 12) + '人もレベルが上がった</div>';
      html += '</div>';
      sfx('levelup');
    }
    html += '<div class="rs-btns"><button class="btn gold" id="rs-ok" type="button">つづける<kbd>Enter</kbd></button></div>';
    w.innerHTML = html; box.appendChild(w);
    $('rs-ok').onclick = function () { box.hidden = true; finish('win', out); };
    if (UI().kbd) $('rs-ok').focus();
  }
  function showLose(out) {
    var box = $('result'); box.innerHTML = ''; box.hidden = false;
    var w = el('div', 'rs-box win'), o = Q.opts;
    var html = '<h2>' + (o.lose === 'continue' ? '負けてしまった…' : 'やられてしまった…') + '</h2>';
    var btns = [];
    if (o.lose === 'continue') { html += '<p class="note">今回は相手が一枚上手だったようだ。</p>'; btns.push(['ok', 'つづける', 'gold']); }
    else {
      html += '<p class="note">' + (o.story ? '戦いの前から、やり直せます。仲間の入れかえ・道具の準備をしてもいいよ。' : '戦いの前からやり直すか、最後に休んだ宿へもどれます（お金や経験値はへりません）。') + '</p>';
      btns.push(['retry', 'もう一度たたかう', 'gold']);
      if (Q.S.diff !== 'easy') btns.push(['easy', '「やさしい」にしてもう一度', '']);
      if (o.story) btns.push(['prep', '準備してからやり直す', '']);
      else btns.push(['town', '宿にもどる', '']);
    }
    html += '<div class="rs-btns">' + btns.map(function (b) { return '<button class="btn ' + b[2] + '" type="button" data-k="' + b[0] + '">' + esc(b[1]) + '</button>'; }).join('') + '</div>';
    w.innerHTML = html; box.appendChild(w);
    Array.prototype.forEach.call(w.querySelectorAll('[data-k]'), function (b) { b.onclick = function () { box.hidden = true; sfx('click'); finish('lose', out, b.dataset.k); }; });
    if (UI().kbd) UI().focusFirst(w);
  }
  function finish(res, out, choice) {
    var cb = Q.done;
    $('bt').hidden = true; $('bt').innerHTML = ''; $('result').hidden = true;
    RB().reset();
    Q = null;
    if (cb) cb(res, out, choice);
  }

  // ====================== 描画・キー ======================
  function area() {
    var vw = root.innerWidth, vh = root.innerHeight;
    var side = document.body.classList.contains('bt-side');
    if (side) {
      var colW = Math.min(360, vw * 0.42);
      return { x: 0, y: 46, w: vw - colW, h: vh - 46 - 104 };
    }
    var cards = 84, cmd = Math.min(196, vh * 0.3);
    return { x: 0, y: 48, w: vw, h: Math.max(160, vh - 48 - cards - cmd) };
  }
  function draw(t, dt, dawn, bbg) {
    if (!Q) return;
    var vw = root.innerWidth, vh = root.innerHeight;
    document.body.classList.toggle('bt-side', vw > vh * 1.2 && vw >= 640);   // 横長の画面：コマンドは右の列、戦う場所は左に広く
    RB().frame({ B: Q.B, D: Q.D, area: area(), dawn: dawn, bbg: Q.opts.bbg || bbg || 'village', t: t, dt: dt, cur: Q.curUid, tgts: Q.tgts, hover: Q.hover, win: Q.win });
  }
  // k: 'up','down','left','right','ok','back','menu','fast'(F),'auto'(R),'minus'(Q),'plus'(E)
  function key(k) {
    if (!Q) return false;
    var r = $('result');
    if (!r.hidden) { if (k === 'ok') { var b = document.activeElement; if (b && r.contains(b) && b.tagName === 'BUTTON') b.click(); else { var f = r.querySelector('button'); if (f) f.click(); } } else if (/up|down|left|right/.test(k)) UI().nav(r, k); return true; }
    if (k === 'fast') { toggleFast(); return true; }
    if (k === 'auto') { toggleAuto(); return true; }
    if (Q.tgtMode) {
      if (k === 'left' || k === 'up') cycle(-1); else if (k === 'right' || k === 'down') cycle(1);
      else if (k === 'ok') confirmTarget(); else if (k === 'back') cancelTarget();
      return true;
    }
    if (!Q.cmdU) return true;
    if (k === 'minus') { setBoost(Q.boost - 1); return true; }
    if (k === 'plus') { setBoost(Q.boost + 1); return true; }
    var box = !$('bt-list').hidden ? $('bt-list') : $('bt-cmd');
    if (k === 'back') { if (Q.view !== 'cmd') { sfx('back'); showCmd(); } return true; }
    if (k === 'ok') { var a = document.activeElement; if (a && box.contains(a) && a.tagName === 'BUTTON') a.click(); else UI().focusFirst(box); return true; }
    if (/up|down|left|right/.test(k)) { UI().nav(box, k); return true; }
    return true;
  }
  function active() { return !!Q; }

  root.NYT_BUI = { start: start, update: update, draw: draw, key: key, tap: tap, active: active, get Q() { return Q; } };
})(typeof window !== 'undefined' ? window : globalThis);
