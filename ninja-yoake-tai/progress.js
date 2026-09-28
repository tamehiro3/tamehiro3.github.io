/* ニンジャ夜明け隊 — 記録と報酬（RewardClaim・SeasonProgress にあたる部分）
 *
 * 報酬は session_id ごとに1回だけ（結果の画面を開き直しても、再送しても増えない）。
 * 放置の判定は、攻撃量だけでなく移動・設置・回復・救助・採集をふくめた「行動」で見る。
 * 途中で画面を閉じた・別のアプリを見た、などの短い無操作は放置あつかいにしない（その間は試合が止まる）。
 * 課金額・広告の記録・チャットは持たない（そもそも無い）。記録は端末の中だけ。
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA || require('./data.js');
  var KEY = 'nyt_profile_v1';
  var FREE = ['outfit_ai', 'outfit_akane', 'outfit_moegi', 'outfit_sumi', 'band_white', 'band_red', 'band_navy', 'weapon_steel', 'weapon_wood',
    'trail_white', 'trail_sky', 'pose_happy', 'pose_wave', 'pose_seal', 'crest_sun', 'crest_moon', 'crest_mount'];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fresh(now) {
    var owned = {}; FREE.forEach(function (id) { owned[id] = 1; });
    return {
      v: 1, created: now || 0, tokens: 0, unlocked: {}, owned: owned, look: clone(D.DEFAULT_LOOK),
      mentor: D.FIRST_MENTOR, bonds: {},
      loadout: { role: 'vanguard', jutsu: ['fire', 'water'], buddies: ['auto', 'auto'], difficulty: 'normal' },
      tasks: {}, weekly: { week: null, best: 0, cleared: false, bonus: false },
      claims: {}, claimOrder: [],
      stats: { matches: 0, wins: 0, losses: 0, byDiff: {}, byRole: {}, rematches: 0, tutorial: false, tutorialSkipped: false, afterTutorial: null, combos: 0, rescues: 0, byMode: {}, proposalsShown: 0, proposalsPicked: 0 },
      director: { mode: 'rule', endpoint: '', day: null, gens: 0, cache: {}, pending: null, rot: 0, lastKey: null },
      settings: { sound: true, shake: true, autoAtk: true },
      next: null, history: [], log: []
    };
  }
  function load(storage, now) {
    var P = null;
    try { var raw = storage && storage.getItem(KEY); if (raw) P = JSON.parse(raw); } catch (e) { P = null; }
    var base = fresh(now);
    if (!P || typeof P !== 'object' || P.v !== 1) return base;
    // 足りない項目をおぎなう（古い保存でも動く）
    Object.keys(base).forEach(function (k) { if (P[k] == null) P[k] = base[k]; });
    ['stats', 'director', 'settings', 'loadout', 'weekly'].forEach(function (k) { Object.keys(base[k]).forEach(function (j) { if (P[k][j] == null) P[k][j] = base[k][j]; }); });
    FREE.forEach(function (id) { P.owned[id] = 1; });
    if (!validLoadout(P, P.loadout)) P.loadout = base.loadout;
    return P;
  }
  function save(storage, P) {
    try { if (storage) storage.setItem(KEY, JSON.stringify(P)); return true; } catch (e) { return false; }
  }
  function logEvent(P, name, data, now) {
    P.log.push({ ev: name, at: now || 0, data: data || {} });
    if (P.log.length > 300) P.log.splice(0, P.log.length - 300);
  }

  /* ---------- 忍術（はじめの6つ ＋ 修行札で解放する別の選択肢）---------- */
  function jutsuOwned(P, id) { return D.JUTSU_BASE.indexOf(id) >= 0 || !!P.unlocked[id]; }
  function availableJutsu(P) { return D.JUTSU_BASE.concat(D.JUTSU_VARIANTS.filter(function (id) { return P.unlocked[id]; })); }
  function unlockJutsu(P, id) {
    if (D.JUTSU_VARIANTS.indexOf(id) < 0) return { ok: false, reason: '解放できる忍術ではありません' };
    if (P.unlocked[id]) return { ok: false, reason: 'もう解放しています' };
    if (P.tokens < D.UNLOCK_COST) return { ok: false, reason: '修行札が足りません（' + D.UNLOCK_COST + '枚）' };
    P.tokens -= D.UNLOCK_COST; P.unlocked[id] = 1;
    return { ok: true };
  }
  function validLoadout(P, L) {
    if (!L || !D.ROLES[L.role]) return false;
    if (!L.jutsu || L.jutsu.length !== 2 || L.jutsu[0] === L.jutsu[1]) return false;
    if (!L.jutsu.every(function (j) { return D.JUTSU[j] && jutsuOwned(P, j); })) return false;
    if (!D.DIFF[L.difficulty]) return false;
    return true;
  }

  /* ---------- 外見 ---------- */
  function owns(P, id) { return !!P.owned[id]; }
  function setLook(P, kind, id) {
    if (kind === 'hairColor') { if (D.LOOKS.hairColor.indexOf(id) >= 0) { P.look.hairColor = id; return true; } return false; }
    if (kind === 'hair') { if (D.LOOKS.hair.some(function (h) { return h.id === id; })) { P.look.hair = id; return true; } return false; }
    if (!owns(P, id)) return false;
    P.look[kind] = id; return true;
  }

  /* ---------- 師匠の絆（セリフと外見色だけ。強さは変わらない）---------- */
  function bondLevel(P, id) { var n = P.bonds[id] || 0, lv = 0; D.BOND_STEPS.forEach(function (s) { if (n >= s) lv++; }); return lv; }

  /* ---------- 報酬（session_id ごとに1回だけ）---------- */
  function isIdle(me) { return !me || (me.stats.moved < D.BAL.idleMove && me.stats.actions < D.BAL.idleActions); }
  function claimReward(P, result, humanId, now) {
    if (!result || !result.session_id) return { tokens: 0, parts: [], invalid: true };
    if (result.rules_version !== D.RULES_VERSION) return { tokens: 0, parts: [], invalid: true };
    if (P.claims[result.session_id]) return { tokens: 0, parts: [], already: true };
    var me = result.members.filter(function (m) { return m.id === humanId; })[0];
    var parts = [];
    if (result.outcome === 'win') parts.push({ name: '夜明けまで守りきった', n: D.REWARD.win });
    else parts.push({ name: '突破した襲撃 ×' + result.wavesCleared, n: Math.min(D.REWARD.loseCap, D.REWARD.perWave * result.wavesCleared) });
    if (result.outcome === 'win' && result.objective && result.objective.done) parts.push({ name: '目標「' + D.OBJECTIVES[result.objective.id].name + '」', n: D.REWARD.objective });
    if (result.weekly && result.outcome === 'win') {
      var wk = D.isoWeek(now || 0);
      if (P.weekly.week !== wk) P.weekly = { week: wk, best: 0, cleared: false, bonus: false };
      if (!P.weekly.bonus) { parts.push({ name: '今週の固定任務・はじめてのクリア', n: D.REWARD.weeklyFirst }); P.weekly.bonus = true; }
    }
    var idle = isIdle(me);
    var total = 0;
    if (idle) parts = [{ name: 'この出撃では操作がほとんどなかったため、報酬はありません', n: 0 }];
    parts.forEach(function (p) { total += p.n; });
    P.tokens += total;
    P.claims[result.session_id] = { at: now || 0, n: total };
    P.claimOrder.push(result.session_id);
    while (P.claimOrder.length > 200) delete P.claims[P.claimOrder.shift()];
    return { tokens: total, parts: parts, idle: idle };
  }

  /* ---------- 試合の記録（修行課題・絆・週の任務・集計）---------- */
  function recordMatch(P, result, humanId, ctx, now) {
    ctx = ctx || {};
    var out = { tasksDone: [], bondUp: null, gifts: [] };
    if (!result || P.history.some(function (h) { return h.sid === result.session_id; })) return out;
    var me = result.members.filter(function (m) { return m.id === humanId; })[0];
    var st = P.stats, win = result.outcome === 'win';
    st.matches++; if (win) st.wins++; else st.losses++;
    var bd = st.byDiff[result.difficulty] = st.byDiff[result.difficulty] || { n: 0, w: 0 }; bd.n++; if (win) bd.w++;
    if (me) {
      var br = st.byRole[me.role] = st.byRole[me.role] || { n: 0, w: 0, rescues: 0, combos: 0, healed: 0, blocked: 0 };
      br.n++; if (win) br.w++; br.rescues += me.stats.rescues; br.combos += me.stats.combos; br.healed += Math.round(me.stats.healed); br.blocked += Math.round(me.stats.blocked);
      st.combos += me.stats.combos; st.rescues += me.stats.rescues;
    }
    if (ctx.mode) { var bm = st.byMode[ctx.mode] = st.byMode[ctx.mode] || { n: 0, w: 0, rematch: 0 }; bm.n++; if (win) bm.w++; }
    // 役割別の修行課題（その役割で出撃したときだけ）
    if (me && !isIdle(me)) {
      D.TASKS.forEach(function (t) {
        if (t.role !== me.role) return;
        var s = P.tasks[t.id] = P.tasks[t.id] || { n: 0, done: false };
        if (s.done) return;
        s.n = Math.min(t.goal, s.n + Math.round(me.stats[t.stat] || 0));
        if (s.n >= t.goal) { s.done = true; P.tokens += t.tokens; if (t.gift) { P.owned[t.gift] = 1; out.gifts.push(t.gift); } out.tasksDone.push(t); }
      });
      // 師匠の絆
      if (ctx.mentor) {
        var before = bondLevel(P, ctx.mentor);
        P.bonds[ctx.mentor] = (P.bonds[ctx.mentor] || 0) + 1;
        var after = bondLevel(P, ctx.mentor);
        if (after > before) { out.bondUp = { id: ctx.mentor, level: after }; if (after >= 3) { P.owned['outfit_cn_' + ctx.mentor] = 1; out.gifts.push('outfit_cn_' + ctx.mentor); } }
      }
    }
    // 週の固定任務
    if (result.weekly) {
      var wk = D.isoWeek(now || 0);
      if (P.weekly.week !== wk) P.weekly = { week: wk, best: 0, cleared: false, bonus: false };
      P.weekly.best = Math.max(P.weekly.best, result.wavesCleared);
      if (win && !P.weekly.cleared) { P.weekly.cleared = true; if (!P.owned.outfit_akatsuki) { P.owned.outfit_akatsuki = 1; out.gifts.push('outfit_akatsuki'); } if (!P.owned.crest_dawn) { P.owned.crest_dawn = 1; out.gifts.push('crest_dawn'); } }
    }
    P.history.push({ sid: result.session_id, at: now || 0, outcome: result.outcome, reason: result.reason, waves: result.wavesCleared, mission: result.mission.mission_template_id, set: result.mission.enemy_set_id, difficulty: result.difficulty, role: me ? me.role : null, weekly: !!result.weekly, mode: ctx.mode || null, proposal: !!ctx.proposal });
    if (P.history.length > 40) P.history.shift();
    return out;
  }
  // 再出撃（結果の画面から同じ編成でもう一度）を数える
  function countRematch(P) {
    P.stats.rematches++;
    var last = P.history[P.history.length - 1];
    if (last && last.mode) { var bm = P.stats.byMode[last.mode]; if (bm) bm.rematch++; }
  }
  // 計測のまとめ（端末の中だけ）
  function metrics(P) {
    var st = P.stats, h = P.history;
    var played = h.length, rem = st.rematches;
    var diffW = {}; Object.keys(st.byDiff).forEach(function (k) { var b = st.byDiff[k]; diffW[k] = b.n ? Math.round(b.w / b.n * 100) : null; });
    return {
      matches: st.matches, winRate: st.matches ? Math.round(st.wins / st.matches * 100) : null, byDiff: diffW,
      tutorial: st.tutorial, afterTutorial: st.afterTutorial, rematchRate: played ? Math.round(rem / played * 100) : null,
      proposalPickRate: st.proposalsShown ? Math.round(st.proposalsPicked / st.proposalsShown * 100) : null
    };
  }

  var api = {
    KEY: KEY, FREE: FREE, fresh: fresh, load: load, save: save, logEvent: logEvent,
    jutsuOwned: jutsuOwned, availableJutsu: availableJutsu, unlockJutsu: unlockJutsu, validLoadout: validLoadout,
    owns: owns, setLook: setLook, bondLevel: bondLevel, isIdle: isIdle, claimReward: claimReward, recordMatch: recordMatch, countRematch: countRematch, metrics: metrics
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_PROGRESS = api;
})(typeof window !== 'undefined' ? window : globalThis);
