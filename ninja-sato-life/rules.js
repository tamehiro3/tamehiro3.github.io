/* ニンジャ里ライフ — 判定の正本（DOMなし・Nodeでも動く）
 *
 * 設計書 §9「配置は範囲・重なり・所持数をサーバー検査」を、将来サーバーへ移せる形でここに集める。
 * 画面（game.js）は状態を直接いじらず、必ずここの関数を通す。
 *  - 配置・移動・回転・倉庫戻し：範囲・重なり・入口・水辺・所持数・上限を検査（理由つき）
 *  - 生産：信頼できる時刻との差で計算・最大8時間・時計を戻しても増えない（高水位）
 *  - 報酬：上限をこえた分は「受け取り箱」へ（無言で捨てない）。受け取りIDで二重取りしない
 *  - 依頼・住民・里レベル・店・分析イベント
 */
(function (root) {
  'use strict';
  var D = root.NSL_DATA || require('./data.js');
  var CH = root.NSL_CHARS || require('./chars.js');
  var BAL = D.BAL, ITEM = D.ITEM;
  var MIN = 60000, HOUR = 3600000;
  var VERSION = 1;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dayKey(t) { var d = new Date(t + 9 * HOUR); return d.toISOString().slice(0, 10); } // 日本時間の日付
  function weekKey(t) { var d = new Date(t + 9 * HOUR); var day = Math.floor((d - new Date('2026-01-05T00:00:00Z')) / (7 * 24 * HOUR)); return 'w' + day; }

  /* ================= 状態 ================= */
  function newState(now) {
    return {
      v: VERSION, created: now, seq: 1,
      clock: { offset: 0, synced: false, hwm: now, lastLocal: now },
      player: { set: 'ai', hair: 'short', outfit: null, outfits: ['ai', 'wakakusa', 'kurenai'], frame: 'basic' },
      village: { name: '見習いの里', level: 1, size: 12, theme: 'standard', layoutVersion: 1 },
      res: { coin: BAL.startCoin, wood: 0, herb: 0, seal: 0 },
      mailbox: [],
      inv: {}, invLv: {},
      objs: [],
      debris: {},
      gather: {},
      residents: {},
      met: {},
      quests: { active: [], done: 0, history: [], claimed: {}, placedSince: {} },
      clerk: { day: '', gens: 0, mode: 'rule', ratings: [] },
      tutorial: { step: 0, done: false, firstHarvestFree: true },
      stats: { harvests: 0, placed: 0, moved: 0, questsDone: 0, trainings: 0, photos: 0, visits: 0, talks: 0, gathers: 0, trainDay: '', trainToday: 0, decoPlaced: 0 },
      theme: { week: '', id: '', done: false },
      visitBonus: { day: '', count: 0, seen: {} },
      purchases: [], owned: { theme: ['standard', 'kusa'], frame: ['basic'], outfit: [] },
      recentClaims: [],
      metrics: { firstDecoAt: 0, firstDecoSession: '', movedAfterDeco: false, sessions: [], d1: false },
      events: [],
      settings: { volume: 0.6, reduceMotion: false, clerkMode: 'rule', aiEndpoint: '' }
    };
  }

  function migrate(s) {
    if (!s || typeof s !== 'object') return null;
    var base = newState(s.created || Date.now());
    // 足りない項目を補う（古い保存データでも壊れない）
    (function fill(dst, src) {
      for (var k in src) {
        if (!(k in dst)) dst[k] = clone(src[k]);
        else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) fill(dst[k], src[k]);
      }
    })(s, base);
    s.v = VERSION;
    // 壊れた物（知らない id・範囲外）は倉庫へ戻す
    s.objs = (s.objs || []).filter(function (o) {
      if (!ITEM[o.id]) return false;
      return true;
    });
    return s;
  }

  /* ================= 時刻（信頼できる時刻と高水位） ================= */
  // now：端末の時刻（ms）。offset：サーバー時刻との差（同期できたときだけ）。
  function trustedNow(s, localNow) { return localNow + (s.clock.offset || 0); }
  function syncClock(s, localNow, serverNow) {
    var off = serverNow - localNow;
    var ev = null;
    if (!s.clock.synced || Math.abs(off - s.clock.offset) > 2 * MIN) {
      if (s.clock.synced || Math.abs(off) > 5 * MIN) ev = { kind: 'clockFixed', diffMin: Math.round((off - s.clock.offset) / MIN) };
    }
    s.clock.offset = off; s.clock.synced = true; s.clock.lastSync = serverNow;
    return ev;
  }
  // 生産を進める。時計が戻っていたら進めない（高水位より前は数えない）
  function tick(s, localNow) {
    var now = trustedNow(s, localNow);
    var hwm = s.clock.hwm || now;
    var out = { elapsed: 0, capped: false, back: false };
    if (now < hwm - 1000) { out.back = true; s.clock.lastLocal = localNow; return out; }
    var e = now - hwm;
    if (e > BAL.offlineMaxH * HOUR) { e = BAL.offlineMaxH * HOUR; out.capped = true; }
    out.elapsed = e;
    s.clock.hwm = Math.max(hwm, now);
    s.clock.lastLocal = localNow;
    if (e <= 0) return out;
    s.objs.forEach(function (o) {
      var it = ITEM[o.id];
      if (it.prod !== 'herb') return;
      var lv = BAL.field.byLevel[o.lv || 1];
      var cyc = BAL.field.cycleMin * MIN;
      o.prod = o.prod || { acc: 0, stored: 0 };
      if (o.prod.stored >= lv.keep) { o.prod.acc = 0; return; }
      o.prod.acc += e;
      while (o.prod.acc >= cyc && o.prod.stored < lv.keep) { o.prod.stored++; o.prod.acc -= cyc; }
      if (o.prod.stored >= lv.keep) o.prod.acc = 0;
    });
    return out;
  }
  function fieldInfo(s, o) {
    var lv = BAL.field.byLevel[o.lv || 1], cyc = BAL.field.cycleMin * MIN;
    var p = o.prod || { acc: 0, stored: 0 };
    return { stored: p.stored, keep: lv.keep, yieldPer: lv.yield, nextMs: p.stored >= lv.keep ? 0 : Math.max(0, cyc - p.acc), full: p.stored >= lv.keep };
  }

  /* ================= 上限・報酬・受け取り箱 ================= */
  function caps(s) {
    var c = { wood: BAL.caps.wood, herb: BAL.caps.herb };
    s.objs.forEach(function (o) {
      if (o.id === 'souko') { var L = ITEM.souko.levels[o.lv || 1]; if (L && L.caps) c = { wood: L.caps.wood, herb: L.caps.herb }; }
    });
    return c;
  }
  // 受け取る前に「どこに入るか」を見せる
  function previewGrant(s, reward) {
    var cp = caps(s), fits = {}, over = {};
    ['coin', 'seal', 'wood', 'herb'].forEach(function (k) {
      var n = reward[k] || 0; if (!n) return;
      if (k === 'wood' || k === 'herb') {
        var room = Math.max(0, cp[k] - s.res[k]);
        fits[k] = Math.min(n, room); if (n > room) over[k] = n - room;
      } else fits[k] = n;
    });
    return { fits: fits, over: over, hasOver: Object.keys(over).length > 0, item: reward.item || null };
  }
  function grant(s, reward, from) {
    var pv = previewGrant(s, reward);
    for (var k in pv.fits) s.res[k] += pv.fits[k];
    if (pv.hasOver) s.mailbox.push({ id: 'm' + (s.seq++), res: pv.over, from: from || '', at: s.clock.hwm });
    if (reward.item) { s.inv[reward.item] = (s.inv[reward.item] || 0) + 1; }
    return pv;
  }
  function claimMailbox(s, id) {
    var i = s.mailbox.findIndex(function (m) { return m.id === id; });
    if (i < 0) return { ok: false, reason: 'もう受け取りずみです' };
    var m = s.mailbox[i], cp = caps(s), got = {}, left = {};
    for (var k in m.res) {
      var room = Math.max(0, cp[k] - s.res[k]), n = m.res[k];
      var take = Math.min(room, n); s.res[k] += take; got[k] = take; if (n - take > 0) left[k] = n - take;
    }
    if (Object.keys(left).length) m.res = left; else s.mailbox.splice(i, 1);
    return { ok: true, got: got, left: left };
  }
  function pay(s, cost) { for (var k in cost) s.res[k] -= cost[k]; }
  function missing(s, cost) {
    var m = {}; if (!cost) return m;
    for (var k in cost) if ((s.res[k] || 0) < cost[k]) m[k] = cost[k] - (s.res[k] || 0);
    return m;
  }
  // 受け取りID（通信の再送・連打で二重に受け取らない）
  function seenClaim(s, id) {
    if (!id) return false;
    if (s.recentClaims.indexOf(id) >= 0) return true;
    s.recentClaims.push(id); if (s.recentClaims.length > 80) s.recentClaims.shift();
    return false;
  }

  /* ================= 敷地・配置 ================= */
  function plot(s) { var o = BAL.plotOrigin; return { x0: o, y0: o, x1: o + s.village.size - 1, y1: o + s.village.size - 1 }; }
  function dims(it, rot) { return (rot % 2) ? { w: it.h, h: it.w } : { w: it.w, h: it.h }; }
  function doorTile(o) {
    var it = ITEM[o.id], d = dims(it, o.rot);
    switch (o.rot % 4) {
      case 0: return { x: o.x + Math.floor(d.w / 2), y: o.y + d.h };
      case 1: return { x: o.x + d.w, y: o.y + Math.floor(d.h / 2) };
      case 2: return { x: o.x + Math.floor(d.w / 2), y: o.y - 1 };
      default: return { x: o.x - 1, y: o.y + Math.floor(d.h / 2) };
    }
  }
  function occ(s, ignoreUid) { // マス → 物
    var m = {};
    s.objs.forEach(function (o) {
      if (o.uid === ignoreUid) return;
      var d = dims(ITEM[o.id], o.rot);
      for (var x = o.x; x < o.x + d.w; x++) for (var y = o.y; y < o.y + d.h; y++) m[x + ',' + y] = o;
    });
    return m;
  }
  function debrisAt(s) {
    var m = {};
    BAL.debris.forEach(function (d) { if (!s.debris[d.id]) m[d.x + ',' + d.y] = d; });
    return m;
  }
  function countItem(s, id, ignoreUid) { return s.objs.filter(function (o) { return o.id === id && o.uid !== ignoreUid; }).length; }
  function villageTags(s) {
    var t = {};
    s.objs.forEach(function (o) { ITEM[o.id].tags.forEach(function (g) { t[g] = (t[g] || 0) + 1; }); });
    return t;
  }

  // 置けるか（理由つき）。opt.move: 動かす物の uid（その物自身とは重ならない扱い・費用なし）
  function canPlace(s, id, x, y, rot, opt) {
    opt = opt || {};
    var it = ITEM[id];
    if (!it) return { ok: false, reason: 'この物は置けません' };
    if (s.readOnly) return { ok: false, reason: '見学中は置けません' };
    if (!opt.move && it.unlock && s.village.level < it.unlock) return { ok: false, reason: '里Lv' + it.unlock + 'で解放されます' };
    if (!opt.move && it.max && countItem(s, id) >= it.max) return { ok: false, reason: it.name + 'は' + it.max + 'つまでです' };
    if (!opt.move && s.objs.length >= BAL.maxObjects) return { ok: false, reason: '置ける数の上限（' + BAL.maxObjects + '）です' };
    var d = dims(it, rot), P = plot(s);
    if (x < P.x0 || y < P.y0 || x + d.w - 1 > P.x1 || y + d.h - 1 > P.y1) return { ok: false, reason: '敷地の外です' };
    var oc = occ(s, opt.move), db = debrisAt(s);
    for (var xx = x; xx < x + d.w; xx++) for (var yy = y; yy < y + d.h; yy++) {
      var k = xx + ',' + yy;
      if (db[k]) return { ok: false, reason: '荒れた場所を先に片付けてください' };
      if (oc[k]) return { ok: false, reason: ITEM[oc[k].id].name + 'と重なっています' };
    }
    // 入口の前は1マスあける（通路の最低条件）
    if (it.door) {
      var dt = doorTile({ id: id, x: x, y: y, rot: rot });
      if (dt.x < P.x0 || dt.y < P.y0 || dt.x > P.x1 || dt.y > P.y1) return { ok: false, reason: '入口が敷地の外を向いています（回してみてください）' };
      var o2 = oc[dt.x + ',' + dt.y];
      if (o2 && !ITEM[o2.id].walkable) return { ok: false, reason: '入口の前をあけてください（' + ITEM[o2.id].name + 'がじゃまです）' };
      if (db[dt.x + ',' + dt.y]) return { ok: false, reason: '入口の前の荒れた場所を片付けてください' };
    }
    // 置いた物が、ほかの建物の入口をふさがない
    for (var i = 0; i < s.objs.length; i++) {
      var ob = s.objs[i]; if (ob.uid === opt.move || !ITEM[ob.id].door || it.walkable) continue;
      var t = doorTile(ob);
      if (t.x >= x && t.x < x + d.w && t.y >= y && t.y < y + d.h) return { ok: false, reason: ITEM[ob.id].name + 'の入口の前です' };
    }
    if (it.rule === 'nearWater') {
      var near = false;
      s.objs.forEach(function (o) {
        if (o.uid === opt.move || ITEM[o.id].tags.indexOf('water') < 0 || o.id === 'kobashi') return;
        var od = dims(ITEM[o.id], o.rot);
        if (x <= o.x + od.w && x + d.w >= o.x && y <= o.y + od.h && y + d.h >= o.y) {
          // となり合う（角だけは除く）
          var ox = !(x + d.w <= o.x || x >= o.x + od.w), oy = !(y + d.h <= o.y || y >= o.y + od.h);
          if (ox || oy) near = true;
        }
      });
      if (!near) return { ok: false, reason: '水辺（池や鹿威し）のとなりに置いてください' };
    }
    var fromInv = !opt.move && (s.inv[id] || 0) > 0;
    if (!opt.move && !fromInv) {
      if (!it.cost) return { ok: false, reason: 'これは店では作れません（ごほうびの品）' };
      var m = missing(s, it.cost);
      if (Object.keys(m).length) return { ok: false, reason: '素材が足りません', missing: m };
    }
    return { ok: true, fromInv: fromInv, cost: fromInv || opt.move ? null : it.cost };
  }

  function place(s, id, x, y, rot, now, origin) {
    var c = canPlace(s, id, x, y, rot);
    if (!c.ok) return c;
    var it = ITEM[id], lv = 1;
    if (c.fromInv) {
      s.inv[id]--; if (!s.inv[id]) delete s.inv[id];
      var lvs = s.invLv[id]; if (lvs && lvs.length) { lvs.sort(function (a, b) { return b - a; }); lv = lvs.shift(); if (!lvs.length) delete s.invLv[id]; }
    } else pay(s, it.cost);
    var o = { uid: 'o' + (s.seq++), id: id, x: x, y: y, rot: rot % 4, lv: lv, placedAt: now || s.clock.hwm, origin: origin || (c.fromInv ? '' : '手づくり') };
    if (it.prod) o.prod = { acc: 0, stored: 0 };
    var firstOfItem = countItem(s, id) === 0;
    var tagsBefore = villageTags(s);
    s.objs.push(o);
    s.village.layoutVersion++;
    s.stats.placed++;
    if (it.cat !== 'facility') s.stats.decoPlaced++;
    // 依頼の「新しく置く」を数える
    it.tags.forEach(function (t) { s.quests.placedSince[t] = (s.quests.placedSince[t] || 0) + 1; });
    s.quests.placedSince['item:' + id] = (s.quests.placedSince['item:' + id] || 0) + 1;
    var newTags = it.tags.filter(function (t) { return !tagsBefore[t]; });
    event(s, 'object_placed', { id: id, x: x, y: y, rot: rot, fromInv: !!c.fromInv });
    if (it.cat !== 'facility' && !s.metrics.firstDecoAt) { s.metrics.firstDecoAt = s.clock.hwm; s.metrics.firstDecoSession = s.metrics.sessions[s.metrics.sessions.length - 1] || ''; event(s, 'first_decoration', { id: id }); }
    return { ok: true, uid: o.uid, obj: o, firstOfItem: firstOfItem, newTags: newTags, fromInv: c.fromInv };
  }
  function getObj(s, uid) { for (var i = 0; i < s.objs.length; i++) if (s.objs[i].uid === uid) return s.objs[i]; return null; }
  // 移動・回転（生産中の時刻はそのまま）
  function move(s, uid, x, y, rot, voluntary) {
    var o = getObj(s, uid); if (!o) return { ok: false, reason: 'もうありません' };
    var c = canPlace(s, o.id, x, y, rot, { move: uid });
    if (!c.ok) return c;
    var changed = o.x !== x || o.y !== y || o.rot !== rot % 4;
    o.x = x; o.y = y; o.rot = rot % 4;
    if (changed) {
      s.village.layoutVersion++; s.stats.moved++;
      event(s, 'object_moved', { id: o.id, voluntary: !!voluntary });
      if (voluntary && s.metrics.firstDecoAt) {
        var cur = s.metrics.sessions[s.metrics.sessions.length - 1] || '';
        if (cur === s.metrics.firstDecoSession) s.metrics.movedAfterDeco = true;
      }
      checkQuestsFeasible(s);
    }
    return { ok: true, changed: changed };
  }
  // 倉庫へ戻す（購入品やレベルは失わない。たまった薬草は受け取る）
  function store(s, uid) {
    if (s.readOnly) return { ok: false, reason: '見学中はさわれません' };
    var i = s.objs.findIndex(function (o) { return o.uid === uid; });
    if (i < 0) return { ok: false, reason: 'もうありません' };
    var o = s.objs[i], got = null;
    if (o.prod && o.prod.stored) got = harvest(s, uid, 'store:' + uid + ':' + s.seq);
    if (o.home && s.residents[o.home]) s.residents[o.home].home = null;
    s.objs.splice(i, 1);
    s.inv[o.id] = (s.inv[o.id] || 0) + 1;
    if ((o.lv || 1) > 1) { s.invLv[o.id] = s.invLv[o.id] || []; s.invLv[o.id].push(o.lv); }
    s.village.layoutVersion++;
    event(s, 'object_stored', { id: o.id });
    var replaced = checkQuestsFeasible(s);
    return { ok: true, harvested: got, replaced: replaced };
  }
  function upgradeCost(s, uid) {
    var o = getObj(s, uid); if (!o) return null;
    var it = ITEM[o.id]; if (!it.levels) return null;
    var next = it.levels[(o.lv || 1) + 1]; if (!next) return null;
    return { lv: (o.lv || 1) + 1, cost: next.cost, note: next.note };
  }
  function upgrade(s, uid) {
    if (s.readOnly) return { ok: false, reason: '見学中はさわれません' };
    var o = getObj(s, uid), u = upgradeCost(s, uid);
    if (!o || !u) return { ok: false, reason: 'これ以上は強化できません' };
    var m = missing(s, u.cost);
    if (Object.keys(m).length) return { ok: false, reason: '素材が足りません', missing: m };
    pay(s, u.cost); o.lv = u.lv;
    event(s, 'facility_upgraded', { id: o.id, lv: o.lv });
    return { ok: true, lv: o.lv };
  }

  /* ================= 収穫・採集・片付け ================= */
  function harvest(s, uid, claimId) {
    if (s.readOnly) return { ok: false, reason: '見学中はさわれません' };
    if (seenClaim(s, claimId)) return { ok: false, dup: true, gained: 0 };
    var o = getObj(s, uid); if (!o || !o.prod) return { ok: false, reason: '収穫できません', gained: 0 };
    var lv = BAL.field.byLevel[o.lv || 1];
    if (!o.prod.stored) return { ok: false, reason: 'まだ育っていません', gained: 0 };
    var room = Math.max(0, caps(s).herb - s.res.herb);
    if (room <= 0) return { ok: false, reason: '薬草がいっぱいです（倉庫を強化するか、使ってください）', full: true, gained: 0 };
    // 1回分ずつ、入るだけ受け取る（入らない回は畑に残る。半端は受け取り箱へ＝捨てない）
    var took = 0, gained = 0;
    while (o.prod.stored > 0) {
      var rm = caps(s).herb - s.res.herb;
      if (rm <= 0) break;
      var n = Math.min(lv.yield, rm);
      s.res.herb += n; gained += n; o.prod.stored--; took++;
      if (n < lv.yield) { s.mailbox.push({ id: 'm' + (s.seq++), res: { herb: lv.yield - n }, from: '畑', at: s.clock.hwm }); break; }
    }
    s.stats.harvests += took;
    bumpAct(s, 'harvest', took);
    event(s, 'harvest', { gained: gained });
    return { ok: true, gained: gained, left: o.prod.stored, cycles: took };
  }
  // 収穫の前に、どれだけ入るかを見せる（上限の事前表示）
  function harvestPreview(s, uid) {
    var o = getObj(s, uid); if (!o || !o.prod) return null;
    var lv = BAL.field.byLevel[o.lv || 1], total = o.prod.stored * lv.yield, room = Math.max(0, caps(s).herb - s.res.herb);
    var take = Math.min(total, room), cyclesFit = Math.floor(room / lv.yield);
    return { total: total, room: room, fits: take, staysInField: Math.max(0, o.prod.stored - Math.ceil(take / lv.yield)) * lv.yield, toMailbox: (take % lv.yield) ? lv.yield - (take % lv.yield) : 0, full: room <= 0 };
  }
  // 最初の10分：初回だけすぐ収穫できる
  function firstHarvestBoost(s, uid) {
    var o = getObj(s, uid);
    if (!o || !o.prod || !s.tutorial.firstHarvestFree) return false;
    s.tutorial.firstHarvestFree = false;
    o.prod.stored = Math.max(o.prod.stored, 1);
    return true;
  }
  function gatherSpots(s) {
    return [{ id: 'g1', x: 0, y: 5 }, { id: 'g2', x: 0, y: 11 }, { id: 'g3', x: 7, y: 0 }, { id: 'g4', x: 14, y: 0 }];
  }
  function gatherReady(s, id) {
    var g = s.gather[id]; return !g || s.clock.hwm >= g.next;
  }
  function gather(s, id, claimId) {
    if (s.readOnly) return { ok: false };
    if (seenClaim(s, claimId)) return { ok: false, dup: true };
    if (!gatherReady(s, id)) return { ok: false, reason: 'まだ育っていません', nextMs: s.gather[id].next - s.clock.hwm };
    var pv = previewGrant(s, { wood: BAL.gather.yield });
    if (!pv.fits.wood) return { ok: false, reason: '木材がいっぱいです', full: true };
    s.res.wood += pv.fits.wood;
    if (pv.over.wood) s.mailbox.push({ id: 'm' + (s.seq++), res: { wood: pv.over.wood }, from: '竹やぶ', at: s.clock.hwm });
    s.gather[id] = { next: s.clock.hwm + BAL.gather.cycleMin * MIN };
    s.stats.gathers++;
    bumpAct(s, 'gather', 1);
    return { ok: true, gained: pv.fits.wood };
  }
  function clearDebris(s, id) {
    if (s.readOnly) return { ok: false };
    var d = BAL.debris.filter(function (x) { return x.id === id; })[0];
    if (!d || s.debris[id]) return { ok: false, reason: 'もう片付けました' };
    s.debris[id] = true;
    grant(s, d.gain, '片付け');
    event(s, 'debris_cleared', { id: id });
    return { ok: true, gained: d.gain, allClear: BAL.debris.every(function (x) { return s.debris[x.id]; }) };
  }
  function sell(s, kind, lots) {
    var rule = BAL.sell[kind]; if (!rule) return { ok: false };
    var ch = s.objs.filter(function (o) { return o.id === 'chaya'; })[0];
    if (!ch) return { ok: false, reason: '茶屋がありません' };
    lots = Math.max(1, lots || 1);
    var n = rule.per * lots;
    if (s.res[kind] < n) return { ok: false, reason: resName(kind) + 'が足りません（' + n + '個で売れます）' };
    var bonus = [0, 1, 1.1, 1.2][ch.lv || 1];
    var coin = Math.round(rule.coin * lots * bonus);
    s.res[kind] -= n; s.res.coin += coin;
    event(s, 'sell', { kind: kind, n: n, coin: coin });
    return { ok: true, coin: coin, n: n };
  }

  /* ================= 依頼 ================= */
  function bumpAct(s, act, n, at) {
    s.quests.active.forEach(function (q) {
      var t = D.QUEST[q.template];
      if (t.need.kind === 'act' && t.need.act === act && (!t.need.at || t.need.at === at || at === 'any')) q.prog = Math.min(t.need.n, (q.prog || 0) + (n || 1));
    });
  }
  function questProgress(s, q) {
    var t = D.QUEST[q.template], nd = t.need;
    if (nd.kind === 'give') return { cur: Math.min(s.res[nd.res], nd.n), n: nd.n, ready: s.res[nd.res] >= nd.n, label: resName(nd.res) + ' ' + Math.min(s.res[nd.res], nd.n) + '/' + nd.n };
    if (nd.kind === 'place') {
      var key = nd.item ? 'item:' + nd.item : nd.tag;
      var cur = Math.max(0, (s.quests.placedSince[key] || 0) - (q.base || 0));
      return { cur: Math.min(cur, nd.n), n: nd.n, ready: cur >= nd.n, label: (nd.item ? ITEM[nd.item].name : D.TAG_NAMES[nd.tag] + 'の物') + 'を置く ' + Math.min(cur, nd.n) + '/' + nd.n };
    }
    if (nd.kind === 'act') { var c = q.prog || 0; return { cur: c, n: nd.n, ready: c >= nd.n, label: actName(nd.act, nd.at) + ' ' + c + '/' + nd.n }; }
    if (nd.kind === 'near') { var ok = nearOk(s, nd); return { cur: ok ? 1 : 0, n: 1, ready: ok, label: ITEM[nd.item].name + 'を' + D.TAG_NAMES[nd.tag] + 'のそばに置く ' + (ok ? 1 : 0) + '/1' }; }
    return { cur: 0, n: 1, ready: false, label: '' };
  }
  function nearOk(s, nd) {
    var a = s.objs.filter(function (o) { return o.id === nd.item; }), b = s.objs.filter(function (o) { return ITEM[o.id].tags.indexOf(nd.tag) >= 0; });
    return a.some(function (o) { return b.some(function (p) { return Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= nd.dist + 1; }); });
  }
  function resName(k) { return { coin: '里コイン', wood: '木材', herb: '薬草', seal: '交流印' }[k] || k; }
  function actName(a, at) { return { train: at === 'water' ? '水辺で修行' : '修行', photo: '写真を撮る', visit: '見本の里を見学', harvest: '収穫', gather: '竹やぶで採集' }[a] || a; }
  // テンプレートの前提（未解放の場所・生産できない素材を求めない）
  function templateFeasible(s, t, tags) {
    tags = tags || villageTags(s);
    if (t.req.level && s.village.level < t.req.level) return false;
    if (t.req.item && !s.objs.some(function (o) { return o.id === t.req.item; })) return false;
    if (t.req.tags) for (var i = 0; i < t.req.tags.length; i++) if (!tags[t.req.tags[i]]) return false;
    if (t.need.kind === 'give' && t.need.res === 'herb' && !tags.farm) return false;
    if (t.need.kind === 'act' && t.need.act === 'train' && !t.need.at && !s.objs.some(function (o) { return o.id === 'shugyoba'; })) return false;
    if (t.need.kind === 'place' && t.need.item && !canAfford(s, ITEM[t.need.item]) && !(s.inv[t.need.item] > 0) && s.village.level < (ITEM[t.need.item].unlock || 1)) return false;
    if (t.need.kind === 'place' && t.need.tag === 'flower' && s.village.level < 1) return false;
    return true;
  }
  function canAfford(s, it) { return it && it.cost && Object.keys(missing(s, it.cost)).length === 0; }
  function addQuest(s, q) {
    var t = D.QUEST[q.template];
    q.qid = 'q' + (s.seq++);
    q.state = q.state || 'open';
    q.claimId = 'c_' + q.qid;
    q.createdAt = s.clock.hwm;
    if (t.need.kind === 'place') q.base = s.quests.placedSince[t.need.item ? 'item:' + t.need.item : t.need.tag] || 0;
    q.prog = 0;
    s.quests.active.push(q);
    s.quests.history.push(q.template); if (s.quests.history.length > 6) s.quests.history.shift();
    return q;
  }
  function acceptQuest(s, qid) {
    var q = s.quests.active.filter(function (x) { return x.qid === qid; })[0];
    if (!q) return { ok: false };
    if (q.state === 'open') { q.state = 'active'; q.acceptedAt = s.clock.hwm; var t = D.QUEST[q.template]; if (t.need.kind === 'place') q.base = s.quests.placedSince[t.need.item ? 'item:' + t.need.item : t.need.tag] || 0; q.prog = 0; }
    event(s, 'quest_accept', { template: q.template, gen: q.gen || 'rule' });
    return { ok: true };
  }
  function deliverQuest(s, qid, claimId) {
    if (s.readOnly) return { ok: false, reason: '見学中です' };
    if (claimId && s.quests.claimed[claimId]) return { ok: false, dup: true, reason: 'もう受け取りました' };
    var i = s.quests.active.findIndex(function (x) { return x.qid === qid; });
    if (i < 0) return { ok: false, dup: true, reason: 'もう受け取りました' };
    var q = s.quests.active[i], t = D.QUEST[q.template];
    if (q.state !== 'active') return { ok: false, reason: '先に受けてください' };
    var pr = questProgress(s, q);
    if (!pr.ready) return { ok: false, reason: 'まだ条件を満たしていません' };
    if (t.need.kind === 'give') s.res[t.need.res] -= t.need.n;
    s.quests.claimed[claimId || q.claimId] = s.clock.hwm;
    s.quests.active.splice(i, 1);
    var rw = grant(s, t.reward, '依頼：' + t.title);
    s.quests.done++; s.stats.questsDone++;
    // 終えた依頼も「最近の依頼」に入れる（すぐ同じ依頼が来ないように）
    if (s.quests.history[s.quests.history.length - 1] !== q.template) { s.quests.history.push(q.template); if (s.quests.history.length > 6) s.quests.history.shift(); }
    if (q.npc && s.residents[q.npc]) addBond(s, q.npc, 3);
    event(s, 'quest_complete', { template: q.template, gen: q.gen || 'rule', npc: q.npc });
    return { ok: true, reward: t.reward, got: rw, quest: q };
  }
  // 施設を撤去して遂行できなくなった依頼は、無料で差し替える
  function checkQuestsFeasible(s) {
    var tags = villageTags(s), out = [];
    s.quests.active.forEach(function (q) {
      var t = D.QUEST[q.template];
      if (!templateFeasible(s, t, tags)) { q.broken = true; out.push(q); }
    });
    return out;
  }
  function dropQuest(s, qid) {
    var i = s.quests.active.findIndex(function (x) { return x.qid === qid; });
    if (i >= 0) s.quests.active.splice(i, 1);
  }
  function rateQuest(s, template, gen, good) {
    s.clerk.ratings.push({ t: template, g: gen, v: good ? 1 : 0, at: s.clock.hwm });
    if (s.clerk.ratings.length > 100) s.clerk.ratings.shift();
    event(s, 'quest_rating', { template: template, gen: gen, good: !!good });
  }

  /* ================= 住民・来訪 ================= */
  var BOND = [0, 0, 3, 7, 12, 18]; // 段階1〜5になる点
  function bondStage(pts) { var st = 1; for (var i = 2; i <= 5; i++) if (pts >= BOND[i]) st = i; return st; }
  function addBond(s, id, n) {
    var r = s.residents[id]; if (!r) return null;
    var before = bondStage(r.bond);
    r.bond += n;
    var after = bondStage(r.bond), memo = null;
    if (after > before) {
      var ch = CH.BY_ID[id];
      for (var st = before + 1; st <= after; st++) {
        var text = st === 2 ? ch.memo[0] : st === 4 ? ch.memo[1] : st === 3 ? ch.name + 'と、好きなもの（' + ch.likes.map(function (t) { return D.TAG_NAMES[t]; }).join('・') + '）の話をした。' : ch.name + 'との思い出を石碑に刻んだ。';
        r.memories.push({ stage: st, text: text, at: s.clock.hwm });
        memo = { stage: st, text: text };
        if (st === 5) grant(s, { item: 'kinen' }, ch.name + 'との思い出');
      }
      event(s, 'bond_stage', { id: id, stage: after });
    }
    return { stage: after, memo: memo };
  }
  function residentCount(s) { return Object.keys(s.residents).length; }
  function residentCap(s) {
    var k = s.objs.filter(function (o) { return o.id === 'koya'; })[0];
    return D.residentCap(s.village.level, k ? k.lv : 1);
  }
  function addResident(s, id, homeUid, starter) {
    if (s.residents[id]) return { ok: false, reason: 'もう住んでいます' };
    if (!starter && residentCount(s) >= residentCap(s)) return { ok: false, reason: '里の定員（' + residentCap(s) + '人）です。里レベルを上げると増えます' };
    s.residents[id] = { since: s.clock.hwm, bond: 0, talkDay: '', memories: [], home: homeUid || null, starter: !!starter };
    s.met[id] = s.met[id] || { visits: 1, first: s.clock.hwm };
    if (homeUid) { var o = getObj(s, homeUid); if (o) o.home = id; }
    event(s, 'resident_move_in', { id: id });
    return { ok: true };
  }
  // 来訪者が住めるか：居場所の物が空いていて、定員に余裕がある
  function freeHomeFor(s, id) {
    var ch = CH.BY_ID[id]; if (!ch) return null;
    for (var i = 0; i < s.objs.length; i++) { var o = s.objs[i]; if (o.id === ch.home && !o.home) return o; }
    return null;
  }
  function canMoveIn(s, id) {
    if (s.residents[id]) return { ok: false, reason: 'もう住んでいます' };
    var m = s.met[id];
    if (!m || m.visits < 2) return { ok: false, reason: 'もう少し仲良くなってから（2回目の来訪で誘える）' };
    var h = freeHomeFor(s, id);
    if (!h) return { ok: false, reason: '居場所（' + ITEM[CH.BY_ID[id].home].name + '）が空いていません' };
    if (residentCount(s) >= residentCap(s)) return { ok: false, reason: '里の定員（' + residentCap(s) + '人）です' };
    return { ok: true, home: h };
  }
  function meet(s, id) {
    var first = !s.met[id];
    s.met[id] = s.met[id] || { visits: 0, first: s.clock.hwm };
    s.met[id].visits++;
    s.met[id].last = s.clock.hwm;
    event(s, 'visitor_meet', { id: id, first: first });
    return { first: first, visits: s.met[id].visits };
  }
  // 来訪候補の重み（里の物のタグと好みが合うほど来やすい）
  function visitorWeights(s, exclude) {
    var tags = villageTags(s), out = [];
    CH.CHARS.forEach(function (ch) {
      if (s.residents[ch.id] || (exclude && exclude.indexOf(ch.id) >= 0)) return;
      var w = 0, why = null;
      ch.likes.forEach(function (t) { if (tags[t]) { w += 2 + Math.min(3, tags[t]); why = why || t; } });
      if (s.objs.some(function (o) { return o.id === ch.home; })) { w += 4; why = why || ITEM[ch.home].tags[0]; }
      if (!w) return;
      if (!s.met[ch.id]) w += 2; // まだ会っていない忍者が少し来やすい
      out.push({ id: ch.id, w: w, why: why });
    });
    return out;
  }
  function talk(s, id) {
    var r = s.residents[id]; if (!r) return { ok: false };
    var today = dayKey(s.clock.hwm), res = { ok: true, first: false, bond: null };
    s.stats.talks++;
    if (r.talkDay !== today) { r.talkDay = today; res.first = true; res.bond = addBond(s, id, 1); }
    return res;
  }
  function giftHerb(s, id) {
    var r = s.residents[id]; if (!r) return { ok: false };
    if (s.res.herb < 5) return { ok: false, reason: '薬草が5個いります' };
    var today = dayKey(s.clock.hwm);
    if (r.giftDay === today) return { ok: false, reason: '今日はもうわたしました' };
    s.res.herb -= 5; r.giftDay = today;
    return { ok: true, bond: addBond(s, id, 2) };
  }

  /* ================= 修行 ================= */
  function train(s, score, at) {
    var today = dayKey(s.clock.hwm);
    if (s.stats.trainDay !== today) { s.stats.trainDay = today; s.stats.trainToday = 0; }
    s.stats.trainToday++;
    s.stats.trainings++;
    bumpAct(s, 'train', 1, at || 'any');
    var reward = null;
    if (s.stats.trainToday <= BAL.trainingRewardPerDay) {
      var sh = s.objs.filter(function (o) { return o.id === 'shugyoba'; })[0];
      var bonus = sh ? [0, 0, 2, 4][sh.lv || 1] : 0;
      reward = { coin: 8 + score * 6 + bonus };
      grant(s, reward, '修行');
    }
    // 修行の回数でもらえる衣装
    if (s.stats.trainings >= 5 && s.owned.outfit.indexOf('outfit_kuro') < 0) { s.owned.outfit.push('outfit_kuro'); reward = reward || {}; reward.outfit = 'outfit_kuro'; }
    event(s, 'training', { score: score, at: at || '' });
    return { ok: true, reward: reward, left: Math.max(0, BAL.trainingRewardPerDay - s.stats.trainToday) };
  }

  /* ================= 里レベル・拡張 ================= */
  function taskDone(s, t) {
    if (t.check === 'item') return countItem(s, t.item) >= t.n;
    if (t.check === 'stat') return (s.stats[t.stat] || 0) >= t.n;
    if (t.check === 'deco') return s.objs.filter(function (o) { return ITEM[o.id].cat !== 'facility'; }).length >= t.n;
    if (t.check === 'residents') return residentCount(s) >= t.n;
    return false;
  }
  function levelInfo(s) {
    var L = D.LEVELS[s.village.level];
    var tasks = (L.tasks || []).map(function (t) { return { id: t.id, label: t.label, done: taskDone(s, t) }; });
    return { level: s.village.level, name: L.name, tasks: tasks, canLevel: s.village.level < D.MAX_LEVEL && tasks.length > 0 && tasks.every(function (t) { return t.done; }), max: s.village.level >= D.MAX_LEVEL, next: D.LEVELS[s.village.level + 1] };
  }
  function levelUp(s) {
    var li = levelInfo(s);
    if (!li.canLevel) return { ok: false, reason: '課題がまだ残っています' };
    var L = D.LEVELS[s.village.level];
    s.village.level++;
    if (L.reward) grant(s, L.reward, '里Lv' + s.village.level);
    event(s, 'village_level', { level: s.village.level });
    return { ok: true, level: s.village.level, reward: L.reward, unlock: D.LEVELS[s.village.level].unlock };
  }
  function nextExpand(s) {
    for (var i = 1; i < BAL.expand.length; i++) if (BAL.expand[i].size > s.village.size) return BAL.expand[i];
    return null;
  }
  function expand(s) {
    var e = nextExpand(s); if (!e) return { ok: false, reason: 'これ以上は広げられません' };
    if (s.village.level < e.level) return { ok: false, reason: '里Lv' + e.level + 'で広げられます' };
    var m = missing(s, e.cost); if (Object.keys(m).length) return { ok: false, reason: '素材が足りません', missing: m };
    pay(s, e.cost); s.village.size = e.size; s.village.layoutVersion++;
    event(s, 'village_expand', { size: e.size });
    return { ok: true, size: e.size };
  }

  /* ================= 週のお題 ================= */
  function currentTheme(s) {
    var wk = weekKey(s.clock.hwm);
    if (s.theme.week !== wk) { var idx = Math.abs(parseInt(wk.slice(1), 10)) % D.THEMES.length; s.theme = { week: wk, id: D.THEMES[idx].id, done: false }; }
    var th = D.THEMES.filter(function (t) { return t.id === s.theme.id; })[0];
    var tags = villageTags(s);
    var prog = th.need.map(function (n) {
      var have = n.item ? countItem(s, n.item) : (tags[n.tag] || 0);
      return { label: (n.item ? ITEM[n.item].name : D.TAG_NAMES[n.tag] + 'の物') + ' ' + Math.min(have, n.n) + '/' + n.n, done: have >= n.n };
    });
    return { theme: th, prog: prog, ready: prog.every(function (p) { return p.done; }) && !s.theme.done, done: s.theme.done };
  }
  function completeTheme(s) {
    var c = currentTheme(s); if (!c.ready) return { ok: false };
    s.theme.done = true; grant(s, c.theme.reward, 'お題：' + c.theme.name);
    event(s, 'theme_complete', { id: c.theme.id });
    return { ok: true, reward: c.theme.reward };
  }

  /* ================= 店（里コインだけ） ================= */
  function shopOwned(s, it) {
    if (it.kind === 'theme') return s.owned.theme.indexOf(it.theme) >= 0;
    if (it.kind === 'frame') return s.owned.frame.indexOf(it.frame) >= 0;
    if (it.kind === 'outfit') return s.owned.outfit.indexOf(it.id) >= 0;
    if (it.kind === 'set') return s.purchases.some(function (p) { return p.id === it.id; });
    return false;
  }
  function buy(s, shopId) {
    var it = D.SHOP.filter(function (x) { return x.id === shopId; })[0];
    if (!it) return { ok: false, reason: '商品がありません' };
    if (shopOwned(s, it)) return { ok: false, owned: true, reason: '購入済みです（もう一度買う必要はありません）' };
    var m = missing(s, it.price); if (Object.keys(m).length) return { ok: false, reason: '里コインが足りません', missing: m };
    pay(s, it.price);
    s.purchases.push({ id: it.id, at: s.clock.hwm, price: it.price });
    applyPurchase(s, it);
    event(s, 'shop_buy', { id: it.id });
    return { ok: true, item: it };
  }
  function applyPurchase(s, it) {
    if (it.kind === 'theme' && s.owned.theme.indexOf(it.theme) < 0) s.owned.theme.push(it.theme);
    if (it.kind === 'frame' && s.owned.frame.indexOf(it.frame) < 0) s.owned.frame.push(it.frame);
    if (it.kind === 'outfit' && s.owned.outfit.indexOf(it.id) < 0) s.owned.outfit.push(it.id);
    if (it.kind === 'set') for (var k in it.items) s.inv[k] = (s.inv[k] || 0) + it.items[k];
  }
  // 購入の復元：購入記録（引き継ぎコードに入っている）から、持ち物を戻す。セットの家具は二重にしない
  function restorePurchases(s, ledger) {
    var restored = [];
    (ledger || s.purchases).forEach(function (p) {
      var it = D.SHOP.filter(function (x) { return x.id === p.id; })[0]; if (!it) return;
      if (it.kind === 'set') { if (!s.purchases.some(function (q) { return q.id === p.id; })) { s.purchases.push(p); applyPurchase(s, it); restored.push(it.name); } return; }
      if (!shopOwned(s, it)) { applyPurchase(s, it); restored.push(it.name); if (!s.purchases.some(function (q) { return q.id === p.id; })) s.purchases.push(p); }
    });
    return restored;
  }

  /* ================= 分析イベント（端末の中だけ） ================= */
  function event(s, name, data) {
    s.events.push({ t: s.clock.hwm, n: name, d: data || null });
    if (s.events.length > 600) s.events.splice(0, s.events.length - 600);
  }
  function startSession(s, localNow) {
    var day = dayKey(trustedNow(s, localNow));
    var ss = s.metrics.sessions;
    if (ss[ss.length - 1] !== day) ss.push(day);
    if (ss.length > 60) ss.shift();
    if (ss.length >= 2) {
      var first = new Date(ss[0]), second = new Date(ss[1]);
      if ((second - first) / (24 * HOUR) === 1) s.metrics.d1 = true;
    }
    event(s, 'session_start', { day: day });
  }
  function metrics(s) {
    var ev = s.events, count = function (n) { return ev.filter(function (e) { return e.n === n; }).length; };
    return {
      firstDecoration: !!s.metrics.firstDecoAt,
      rearrangedSameSession: !!s.metrics.movedAfterDeco,
      d1: !!s.metrics.d1,
      sessions: s.metrics.sessions.length,
      placed: count('object_placed'), moved: count('object_moved'), questAccept: count('quest_accept'), questComplete: count('quest_complete'),
      visits: count('village_visit'), photos: count('photo_created'), themePreview: count('theme_preview'),
      clerk: (function () { var r = s.clerk.ratings; var by = { rule: [0, 0], gen: [0, 0] }; r.forEach(function (x) { var k = x.g === 'rule' ? 'rule' : 'gen'; by[k][0] += x.v; by[k][1]++; }); return by; })()
    };
  }

  /* ================= 共有（見学用の静的な里データ） ================= */
  function shareData(s) {
    return { v: 1, n: s.village.name, l: s.village.level, s: s.village.size, t: s.village.theme, r: Object.keys(s.residents).slice(0, 12), o: s.objs.map(function (o) { return [o.id, o.x, o.y, o.rot, o.lv || 1]; }) };
  }
  // 見学する里のデータを検査して、閲覧専用の状態をつくる（知らない物・範囲外・重なりは捨てる）
  function visitState(data, now) {
    if (!data || typeof data !== 'object') return null;
    var s = newState(now || Date.now());
    s.readOnly = true;
    s.village.name = String(data.n || '友だちの里').replace(/[<>&"']/g, '').slice(0, 16);
    s.village.level = Math.max(1, Math.min(D.MAX_LEVEL, data.l | 0 || 1));
    var size = data.s | 0; s.village.size = [12, 16, 20].indexOf(size) >= 0 ? size : 12;
    s.village.theme = D.THEME_NAMES[data.t] ? data.t : 'standard';
    BAL.debris.forEach(function (d) { s.debris[d.id] = true; });
    var list = Array.isArray(data.o) ? data.o.slice(0, BAL.maxObjects) : [];
    var tmp = { objs: [], village: s.village, debris: s.debris, inv: {}, res: { coin: 1e9, wood: 1e9, herb: 1e9, seal: 1e9 }, readOnly: false, quests: { placedSince: {} }, metrics: { sessions: [] }, events: [], stats: { placed: 0, decoPlaced: 0 }, clock: { hwm: 0 } };
    list.forEach(function (a) {
      if (!Array.isArray(a) || !ITEM[a[0]]) return;
      var id = a[0], x = a[1] | 0, y = a[2] | 0, rot = (a[3] | 0) % 4;
      var it = ITEM[id];
      if (canPlace(tmp, id, x, y, rot, { move: '__visit' }).ok) tmp.objs.push({ uid: 'v' + tmp.objs.length, id: id, x: x, y: y, rot: rot, lv: Math.max(1, Math.min(3, a[4] | 0 || 1)) });
    });
    s.objs = tmp.objs;
    (Array.isArray(data.r) ? data.r : []).slice(0, 12).forEach(function (id) { if (CH.BY_ID[id]) s.residents[id] = { since: 0, bond: 0, memories: [], home: null }; });
    return s;
  }

  var api = {
    VERSION: VERSION, newState: newState, migrate: migrate, clone: clone, dayKey: dayKey,
    trustedNow: trustedNow, syncClock: syncClock, tick: tick, fieldInfo: fieldInfo,
    caps: caps, previewGrant: previewGrant, grant: grant, claimMailbox: claimMailbox, missing: missing,
    plot: plot, dims: dims, doorTile: doorTile, occ: occ, debrisAt: debrisAt, villageTags: villageTags, countItem: countItem,
    canPlace: canPlace, place: place, move: move, store: store, upgradeCost: upgradeCost, upgrade: upgrade, getObj: getObj,
    harvest: harvest, harvestPreview: harvestPreview, firstHarvestBoost: firstHarvestBoost, gatherSpots: gatherSpots, gatherReady: gatherReady, gather: gather, clearDebris: clearDebris, sell: sell,
    questProgress: questProgress, templateFeasible: templateFeasible, addQuest: addQuest, acceptQuest: acceptQuest, deliverQuest: deliverQuest, checkQuestsFeasible: checkQuestsFeasible, dropQuest: dropQuest, rateQuest: rateQuest, bumpAct: bumpAct, resName: resName,
    bondStage: bondStage, addBond: addBond, residentCount: residentCount, residentCap: residentCap, addResident: addResident, freeHomeFor: freeHomeFor, canMoveIn: canMoveIn, meet: meet, visitorWeights: visitorWeights, talk: talk, giftHerb: giftHerb,
    train: train, levelInfo: levelInfo, levelUp: levelUp, nextExpand: nextExpand, expand: expand,
    currentTheme: currentTheme, completeTheme: completeTheme,
    shopOwned: shopOwned, buy: buy, restorePurchases: restorePurchases,
    event: event, startSession: startSession, metrics: metrics,
    shareData: shareData, visitState: visitState
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NSL_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis);
