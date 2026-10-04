/* ニンジャ夜明け隊（RPG） — 遊びの状態（仲間・道具・旗・図鑑）と保存
 * 画面に依存しない。save/load は localStorage がなくても動く（そのときは保存しない）。
 */
(function (root) {
  'use strict';
  var KEY = 'nyt_rpg_save_v1', VERSION = 1;
  function B() { return root.NYT_BASE; }
  function CH() { return root.NYT_CHARS.CHARS; }
  function SK() { return root.NYT_SKILLS.SKILLS; }
  function IT() { return root.NYT_ITEMS; }

  function fresh(name, look) {
    var S = {
      v: VERSION, name: (name || 'ヒナタ').slice(0, 8), look: look || { set: 'ai', hair: 'short' },
      diff: 'normal', gold: 50, frag: 0, chapter: 0,
      flags: {}, members: {}, order: [],
      items: { kizugusuri: 3 }, charms: {}, mats: {}, keys: {},
      map: { id: 'koka', x: 0, y: 0, dir: 'down' },
      opened: {}, cleared: {}, dex: {}, seen: {},
      time: 0, steps: 0, battles: 0, seed: (Date.now() >>> 0) % 2147483647,
      settings: { sound: true, bgm: true, text: 2, fast: false, auto: false, shake: true },
      learned: {}   // 物語で覚える忍術（主人公の暁の術など） id → [skillId]
    };
    addMember(S, 'hero', 1);
    return S;
  }

  // ---- 仲間 ----
  function addMember(S, id, lv) {
    if (S.members[id]) return S.members[id];
    var c = CH()[id]; if (!c) throw new Error('仲間がいない: ' + id);
    var L = Math.max(c.join || 1, lv || 1);
    var m = { id: id, lv: L, exp: 0, hp: 0, sp: 0, wlv: 1, charms: [null, null] };
    S.members[id] = m;
    S.order.push(id);
    var st = stats(S, id); m.hp = st.hp; m.sp = st.sp;
    S.seen[id] = 1;
    return m;
  }
  function recruit(S, id) {
    if (S.members[id]) return { already: true, m: S.members[id] };
    var act = active(S), sum = 0;
    act.forEach(function (a) { sum += S.members[a].lv; });
    var avg = act.length ? Math.round(sum / act.length) : 1;
    var m = addMember(S, id, Math.max(1, avg - 1));
    return { m: m, lv: m.lv };
  }
  function active(S) { return S.order.slice(0, 4).filter(function (id) { return !!S.members[id]; }); }
  function standby(S) { return S.order.slice(4, 8).filter(function (id) { return !!S.members[id]; }); }
  function count(S) { return S.order.length; }
  function has(S, id) { return !!S.members[id]; }
  function swapOrder(S, i, j) {
    var o = S.order; if (i < 0 || j < 0 || i >= o.length || j >= o.length) return false;
    var t = o[i]; o[i] = o[j]; o[j] = t;
    ensureHero(S); return true;
  }
  // 主人公は前列（1〜4番）にいる
  function ensureHero(S) {
    var i = S.order.indexOf('hero');
    if (i >= 4) { var t = S.order[3]; S.order[3] = 'hero'; S.order[i] = t; }
  }

  // ---- 能力 ----
  function charmList(S, m) { return (m.charms || []).filter(Boolean).map(function (c) { return IT().CHARMS[c]; }).filter(Boolean); }
  function stats(S, id) {
    var m = S.members[id], c = CH()[id], b = B();
    var o = {};
    b.STAT_KEYS.forEach(function (k) { o[k] = b.statAt(c.arch, c.mods, k, m.lv); });
    var wb = 1 + IT().WEAPON_BONUS * ((m.wlv || 1) - 1);
    o.atk = Math.round(o.atk * wb); o.mag = Math.round(o.mag * wb);
    var fl = {};
    charmList(S, m).forEach(function (ch) {
      if (ch.st) for (var k in ch.st) o[k] = (o[k] || 0) + ch.st[k];
      if (ch.fl) for (var f in ch.fl) fl[f] = (fl[f] || 0) + ch.fl[f];
    });
    o.flags = fl;
    return o;
  }
  function skillsOf(S, id) {
    var m = S.members[id], c = CH()[id], out = [];
    (c.sk || []).forEach(function (p) { if (m.lv >= p[1]) out.push(p[0]); });
    (S.learned[id] || []).forEach(function (s) { if (out.indexOf(s) < 0) out.push(s); });
    return out;
  }
  function learn(S, id, skill) {
    S.learned[id] = S.learned[id] || [];
    if (S.learned[id].indexOf(skill) < 0) S.learned[id].push(skill);
  }

  // ---- 経験値（仲間全員が同じだけもらう）----
  function gainExp(S, n) {
    var b = B(), ups = [];
    S.order.forEach(function (id) {
      var m = S.members[id]; if (!m) return;
      var before = skillsOf(S, id), from = m.lv;
      var old = stats(S, id);
      m.exp += n;
      while (m.lv < b.MAX_LV && m.exp >= b.expNeed(m.lv)) { m.exp -= b.expNeed(m.lv); m.lv++; }
      if (m.lv >= b.MAX_LV) m.exp = 0;
      if (m.lv > from) {
        var st = stats(S, id);
        m.hp = Math.min(st.hp, m.hp + (st.hp - old.hp));
        m.sp = Math.min(st.sp, m.sp + (st.sp - old.sp));
        var after = skillsOf(S, id);
        ups.push({ id: id, from: from, to: m.lv, learned: after.filter(function (s) { return before.indexOf(s) < 0; }) });
      }
    });
    return ups;
  }
  function healAll(S) {
    S.order.forEach(function (id) { var st = stats(S, id); S.members[id].hp = st.hp; S.members[id].sp = st.sp; });
  }
  function clampMember(S, id) {
    var m = S.members[id], st = stats(S, id);
    m.hp = Math.max(0, Math.min(st.hp, Math.round(m.hp)));
    m.sp = Math.max(0, Math.min(st.sp, Math.round(m.sp)));
  }

  // ---- 道具・お守り・素材・大事な物・両 ----
  function addItem(S, id, n) {
    n = n == null ? 1 : n;
    if (IT().ITEMS[id]) { S.items[id] = Math.max(0, (S.items[id] || 0) + n); if (!S.items[id]) delete S.items[id]; return true; }
    if (IT().CHARMS[id]) { S.charms[id] = Math.max(0, (S.charms[id] || 0) + n); if (!S.charms[id]) delete S.charms[id]; return true; }
    if (IT().MATS[id]) { S.mats[id] = Math.max(0, (S.mats[id] || 0) + n); if (!S.mats[id]) delete S.mats[id]; return true; }
    if (IT().KEYS[id]) { if (n > 0) S.keys[id] = (S.keys[id] || 0) + n; else { S.keys[id] = Math.max(0, (S.keys[id] || 0) + n); if (!S.keys[id]) delete S.keys[id]; } return true; }
    return false;
  }
  function itemCount(S, id) { return S.items[id] || S.charms[id] || S.mats[id] || S.keys[id] || 0; }
  function itemName(id) { var I = IT(); var d = I.ITEMS[id] || I.CHARMS[id] || I.MATS[id] || I.KEYS[id]; return d ? d.n : id; }
  function addGold(S, n) { S.gold = Math.max(0, Math.min(999999, Math.round(S.gold + n))); }
  function spend(S, n) { if (S.gold < n) return false; S.gold -= n; return true; }

  // お守り：持っている数 − つけている数 が「空き」
  function charmFree(S, cid) {
    var used = 0; S.order.forEach(function (id) { (S.members[id].charms || []).forEach(function (c) { if (c === cid) used++; }); });
    return (S.charms[cid] || 0) - used;
  }
  function equipCharm(S, id, slot, cid) {
    var m = S.members[id]; if (!m || slot < 0 || slot > 1) return false;
    if (cid && charmFree(S, cid) <= 0) return false;
    m.charms[slot] = cid || null;
    clampMember(S, id);
    return true;
  }

  // 鍛冶
  function forgeCost(S, id) { var m = S.members[id]; if (!m || m.wlv >= IT().WEAPON_MAX) return null; return IT().FORGE[m.wlv]; }
  function forge(S, id) {
    var c = forgeCost(S, id); if (!c) return false;
    if (S.gold < c.gold || (S.mats.tamahagane || 0) < c.tama) return false;
    S.gold -= c.gold; addItem(S, 'tamahagane', -c.tama); S.members[id].wlv++;
    return true;
  }

  // ---- 図鑑 ----
  function dexSeen(S, eid) { S.dex[eid] = S.dex[eid] || { seen: 1, won: 0, weak: {} }; return S.dex[eid]; }
  function dexWeak(S, eid, ty) { dexSeen(S, eid).weak[ty] = 1; }

  // ---- 旗 ----
  function flag(S, f) { return !!S.flags[f]; }
  function setFlag(S, f, v) { if (v === false || v === 0) delete S.flags[f]; else S.flags[f] = v == null ? 1 : v; }

  // ---- 保存 ----
  function storage() { try { var s = root.localStorage; if (!s) return null; s.setItem('nyt_probe', '1'); s.removeItem('nyt_probe'); return s; } catch (e) { return null; } }
  function save(S, slot) {
    var st = storage(); if (!st) return false;
    try { st.setItem(KEY + (slot ? '_' + slot : ''), JSON.stringify(S)); return true; } catch (e) { return false; }
  }
  function loadRaw(slot) {
    var st = storage(); if (!st) return null;
    try { var t = st.getItem(KEY + (slot ? '_' + slot : '')); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  function validate(S) {
    if (!S || typeof S !== 'object' || S.v !== VERSION || !S.members || !S.members.hero || !Array.isArray(S.order)) return null;
    var base = fresh(S.name, S.look);
    for (var k in base) if (S[k] == null) S[k] = base[k];
    ['flags', 'items', 'charms', 'mats', 'keys', 'opened', 'cleared', 'dex', 'seen', 'learned', 'settings'].forEach(function (k) { if (typeof S[k] !== 'object' || Array.isArray(S[k])) S[k] = base[k]; });
    for (var s in base.settings) if (S.settings[s] == null) S.settings[s] = base.settings[s];
    S.order = S.order.filter(function (id, i, a) { return S.members[id] && CH()[id] && a.indexOf(id) === i; });
    Object.keys(S.members).forEach(function (id) { if (!CH()[id]) delete S.members[id]; else if (S.order.indexOf(id) < 0) S.order.push(id); });
    S.order.forEach(function (id) { var m = S.members[id]; m.lv = Math.max(1, Math.min(B().MAX_LV, m.lv | 0)); m.wlv = Math.max(1, Math.min(IT().WEAPON_MAX, m.wlv | 0)); if (!Array.isArray(m.charms)) m.charms = [null, null]; clampMember(S, id); });
    ensureHero(S);
    S.gold = Math.max(0, Math.round(S.gold || 0));
    [S.items, S.charms, S.mats].forEach(function (o) { for (var i in o) { o[i] = Math.max(0, o[i] | 0); if (!o[i]) delete o[i]; } });
    if (!DIFF_OK(S.diff)) S.diff = 'normal';
    return S;
  }
  function DIFF_OK(d) { return !!B().DIFF[d]; }
  function load(slot) { return validate(loadRaw(slot)); }
  function hasSave(slot) { return !!loadRaw(slot); }
  function clearSave(slot) { var st = storage(); if (!st) return; try { st.removeItem(KEY + (slot ? '_' + slot : '')); } catch (e) { } }

  var api = {
    KEY: KEY, VERSION: VERSION, fresh: fresh, addMember: addMember, recruit: recruit, active: active, standby: standby, count: count, has: has,
    swapOrder: swapOrder, ensureHero: ensureHero, stats: stats, skillsOf: skillsOf, learn: learn, gainExp: gainExp, healAll: healAll, clampMember: clampMember,
    addItem: addItem, itemCount: itemCount, itemName: itemName, addGold: addGold, spend: spend, charmFree: charmFree, equipCharm: equipCharm,
    forgeCost: forgeCost, forge: forge, dexSeen: dexSeen, dexWeak: dexWeak, flag: flag, setFlag: setFlag,
    storage: storage, save: save, load: load, loadRaw: loadRaw, validate: validate, hasSave: hasSave, clearSave: clearSave
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_STATE = api;
})(typeof window !== 'undefined' ? window : globalThis);
