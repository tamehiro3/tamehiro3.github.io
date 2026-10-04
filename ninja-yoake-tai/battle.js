/* ニンジャ夜明け隊（RPG） — 戦闘の判定
 * ラウンド制。ラウンドのはじめに「すばやさ」で順番が決まる（次のラウンドの順番も先に決めて見せる）。
 * 弱点で当てると構えが減り、0で「崩し」（今と次のラウンドの番がとび、受けるダメージ1.6倍）。
 * 印（いん）を重ねると強くなる。絆ゲージがたまると絆技。
 * 画面に依存しない。判定はすぐに状態へ反映し、画面のための「できごと（ev）」を積む。
 */
(function (root) {
  'use strict';
  function BS() { return root.NYT_BASE; }
  function RU() { return root.NYT_BASE.RULE; }
  function ST() { return root.NYT_STATE; }
  function SKD() { return root.NYT_SKILLS; }
  function END() { return root.NYT_ENEMIES; }
  function CHD() { return root.NYT_CHARS.CHARS; }
  function ITD() { return root.NYT_ITEMS; }

  function skillDef(id) { return (SKD().SKILLS[id]) || (END().ESK[id]) || null; }
  function emptySt() { return { poison: 0, sleep: 0, seal: 0, stun: 0, cover: 0, counter: 0, evade: 0, regen: null, taunt: 0, clone: 0, curse: null, mist: 0 }; }
  function emptyBuf() { return { atk: null, def: null, spd: null }; }

  // ---------- 戦闘をつくる ----------
  // opts: { enemies: [id...], ambush: 'party'|'enemy'|null, noFlee, guests: [charId], seed, bg, story }
  function create(S, opts) {
    opts = opts || {};
    var b = BS();
    var B = {
      S: S, opts: opts, rng: b.rng(opts.seed != null ? opts.seed : (S.seed + S.battles * 7919)),
      round: 0, units: [], order: [], nextOrder: null, turn: -1, kz: 0, ev: [], result: null,
      standbyUsed: false, uid: 0, cur: null, tested: {}, diff: b.DIFF[S.diff] || b.DIFF.normal
    };
    var act = ST().active(S), stb = ST().standby(S);
    act.forEach(function (id, i) { B.units.push(partyUnit(B, id, i, false)); });
    stb.forEach(function (id, i) { B.units.push(partyUnit(B, id, 4 + i, true)); });
    (opts.guests || []).forEach(function (gid) {
      var slot = front(B).length;
      if (slot >= 4) { var drop = front(B)[3]; drop.bench = true; drop.slot = 8; slot = 3; }
      B.units.push(guestUnit(B, gid, opts.guestLv || 1, slot));
    });
    (opts.enemies || []).forEach(function (eid, i) { B.units.push(enemyUnit(B, eid, i)); });
    S.battles = (S.battles || 0) + 1;
    // 先制：妖怪の構え−1。印の守り：印2で始まる
    B.units.forEach(function (u) {
      if (u.side === 'p') u.bp = u.flags.bp2 ? 2 : RU().bpStart;
      if (u.side === 'e') ST().dexSeen(S, u.eid);
    });
    if (opts.ambush === 'party') enemies(B).forEach(function (e) { if (e.mshield > 1) e.shield = Math.max(1, e.shield - 1); });
    return B;
  }

  function partyUnit(B, id, slot, bench) {
    var S = B.S, m = S.members[id], st = ST().stats(S, id), c = CHD()[id];
    var nm = id === 'hero' ? S.name : (root.NSL_CHARS && root.NSL_CHARS.BY_ID[id] ? root.NSL_CHARS.BY_ID[id].name : id);
    return {
      uid: ++B.uid, side: 'p', id: id, name: nm, slot: slot, bench: !!bench, lv: m.lv,
      mhp: st.hp, hp: Math.min(st.hp, m.hp), msp: st.sp, sp: Math.min(st.sp, m.sp),
      atk: st.atk, def: st.def, mag: st.mag, mdf: st.mdf, spd: st.spd, luk: st.luk, flags: st.flags || {},
      wt: c.wt, wmag: !!c.wmag, skills: ST().skillsOf(S, id),
      st: emptySt(), buf: emptyBuf(), bp: 1, boostedLast: false, guard: false, ko: m.hp <= 0, endureUsed: false
    };
  }
  function guestUnit(B, id, lv, slot) {
    var c = CHD()[id], b = BS(), o = {};
    b.STAT_KEYS.forEach(function (k) { o[k] = b.statAt(c.arch, c.mods, k, lv); });
    var sk = (c.sk || []).filter(function (p) { return lv >= p[1]; }).map(function (p) { return p[0]; });
    return {
      uid: ++B.uid, side: 'p', id: id, name: root.NSL_CHARS && root.NSL_CHARS.BY_ID[id] ? root.NSL_CHARS.BY_ID[id].name : id, slot: slot, bench: false, guest: true, lv: lv,
      mhp: o.hp, hp: o.hp, msp: o.sp, sp: o.sp, atk: o.atk, def: o.def, mag: o.mag, mdf: o.mdf, spd: o.spd, luk: o.luk, flags: {},
      wt: c.wt, wmag: !!c.wmag, skills: sk, st: emptySt(), buf: emptyBuf(), bp: 1, boostedLast: false, guard: false, ko: false, endureUsed: false
    };
  }
  function enemyUnit(B, eid, slot) {
    var d = END().ENEMIES[eid]; if (!d) throw new Error('妖怪がいない: ' + eid);
    var std = BS().enemyStd(d.lv), m = d.m || {}, df = B.diff;
    var u = {
      uid: ++B.uid, side: 'e', id: eid, eid: eid, name: d.n, slot: slot, lv: d.lv,
      mhp: Math.max(1, Math.round(std.hp * (m.hp || 1) * df.ehp)),
      atk: Math.round(std.atk * (m.atk || 1) * df.eatk * (d.boss ? RU().bossAtk : 1)), mag: Math.round(std.mag * (m.mag || m.atk || 1) * df.eatk * (d.boss ? RU().bossAtk : 1)),
      def: Math.round(std.def * (m.def || 1)), mdf: Math.round(std.mdf * (m.mdf || m.def || 1)),
      spd: Math.round(std.spd * (m.spd || 1)), luk: std.luk, msp: 0, sp: 0, flags: {},
      boss: !!d.boss, shield: d.shield, mshield: d.shield, weak: (d.weak || []).slice(), res: (d.res || []).slice(),
      known: {}, brokenUntil: -1, charging: null, turns: 0, once: {}, duel: d.duel || 0, cn: d.cn || null, tpr: d.tpr || (d.boss ? 2 : 1),
      wt: d.cn ? CHD()[d.cn].wt : 'da', wmag: d.cn ? !!CHD()[d.cn].wmag : false,
      st: emptySt(), buf: emptyBuf(), ko: false, fled: false, rare: !!d.rare
    };
    u.hp = u.mhp;
    var dex = B.S.dex[eid];
    if (dex && dex.weak) for (var t in dex.weak) u.known[t] = 1;
    return u;
  }

  // ---------- しらべる ----------
  function party(B) { return B.units.filter(function (u) { return u.side === 'p'; }); }
  function front(B) { return B.units.filter(function (u) { return u.side === 'p' && !u.bench; }); }
  function bench(B) { return B.units.filter(function (u) { return u.side === 'p' && u.bench; }); }
  function enemies(B) { return B.units.filter(function (u) { return u.side === 'e' && !u.fled; }); }
  function alive(list) { return list.filter(function (u) { return !u.ko; }); }
  function opp(B, u) { return u.side === 'p' ? alive(enemies(B)) : alive(front(B)); }
  function mates(B, u) { return u.side === 'p' ? front(B) : enemies(B); }
  function byUid(B, id) { for (var i = 0; i < B.units.length; i++) if (B.units[i].uid === id) return B.units[i]; return null; }
  function isBroken(B, u) { return u.side === 'e' && u.brokenUntil >= B.round; }
  function bufMul(u, k) { var b = u.buf[k]; return b ? (RU().buffMul[b.v] || 1) : 1; }
  function eff(u, k) {
    var v = u[k];
    if (k === 'atk' || k === 'mag') v *= bufMul(u, 'atk');
    if (k === 'def' || k === 'mdf') v *= bufMul(u, 'def');
    if (k === 'spd') v *= bufMul(u, 'spd');
    return v;
  }
  function push(B, e) { B.ev.push(e); return e; }
  function addKz(B, n) {
    if (B.result) return;
    var mul = 1; front(B).forEach(function (u) { if (u.flags.kz) mul = Math.max(mul, 1 + u.flags.kz); });
    var before = B.kz;
    B.kz = Math.min(RU().kz.max, B.kz + Math.round(n * mul));
    if (B.kz !== before) push(B, { t: 'kz', v: B.kz });
  }

  // ---------- 順番 ----------
  function rollOrder(B) {
    var list = B.units.filter(function (u) { return !u.ko && !(u.side === 'p' && u.bench) && !u.fled; });
    var keyed = [];
    list.forEach(function (u) {
      keyed.push({ u: u, k: eff(u, 'spd') * (0.88 + B.rng() * 0.24) });
      for (var i = 1; i < (u.tpr || 1); i++) keyed.push({ u: u, k: eff(u, 'spd') * (0.5 - 0.15 * (i - 1)) * (0.9 + B.rng() * 0.2) });
    });
    keyed.sort(function (a, b) { return b.k - a.k; });
    return keyed.map(function (x) { return x.u.uid; });
  }
  function beginRound(B) {
    B.round++;
    var ord = B.nextOrder || rollOrder(B);
    // 順番を決めたあとに入った仲間・呼ばれた妖怪は、すばやさの位置に入れる
    var present = {}; ord.forEach(function (id) { present[id] = 1; });
    B.units.forEach(function (u) {
      if (u.ko || u.fled || (u.side === 'p' && u.bench) || present[u.uid]) return;
      var i = 0; while (i < ord.length && eff(byUid(B, ord[i]), 'spd') >= eff(u, 'spd')) i++;
      ord.splice(i, 0, u.uid);
    });
    if (B.round === 1 && B.opts.ambush) {
      var first = B.opts.ambush === 'party' ? 'p' : 'e';
      ord = ord.filter(function (id) { return byUid(B, id).side === first; }).concat(ord.filter(function (id) { return byUid(B, id).side !== first; }));
    }
    B.order = ord.filter(function (id) { var u = byUid(B, id); return u && !u.ko && !u.fled && !(u.side === 'p' && u.bench); });
    B.nextOrder = rollOrder(B);
    B.turn = -1;
    push(B, { t: 'round', n: B.round });
  }
  function endRound(B) {
    enemies(B).forEach(function (e) {
      if (e.brokenUntil === B.round) { e.brokenUntil = -1; e.shield = e.mshield; push(B, { t: 'recover', tg: e.uid }); }
    });
  }
  // 次に動く者。いなければ null（戦闘の終わり）
  function nextActor(B) {
    if (B.result) return null;
    if (B.round === 0) beginRound(B);
    for (var guard = 0; guard < 200; guard++) {
      B.turn++;
      if (B.turn >= B.order.length) { endRound(B); beginRound(B); continue; }
      var u = byUid(B, B.order[B.turn]);
      if (!u || u.ko || u.fled || (u.side === 'p' && u.bench)) continue;
      B.cur = u;
      var why = startTurn(B, u);
      if (B.result) return null;
      if (u.ko) { continue; }
      if (why) { push(B, { t: 'skip', u: u.uid, why: why }); endTurn(B, u); if (B.result) return null; continue; }
      push(B, { t: 'turn', u: u.uid });
      return u;
    }
    return null;
  }
  // 番のはじめ：毒・呪い・再生 → 動けるかどうか → 印+1
  function startTurn(B, u) {
    u.guard = false;
    if (u.st.poison > 0) {
      var rate = u.boss ? RU().poisonRateBoss : RU().poisonRate;
      var dmg = Math.max(1, Math.round(u.mhp * rate));
      dealRaw(B, null, u, dmg, { dot: 'poison' });
      u.st.poison--; if (u.st.poison <= 0) push(B, { t: 'st', tg: u.uid, st: 'poison', on: false });
      if (u.ko || B.result) return 'ko';
    }
    if (u.st.curse) {
      dealRaw(B, null, u, u.st.curse.dmg, { dot: 'curse' });
      u.st.curse.t--; if (u.st.curse.t <= 0) { u.st.curse = null; push(B, { t: 'st', tg: u.uid, st: 'curse', on: false }); }
      if (u.ko || B.result) return 'ko';
    }
    var regen = (u.st.regen ? u.st.regen.v : 0) + (u.flags.regen || 0);
    if (regen > 0 && u.hp < u.mhp) heal(B, u, Math.max(1, Math.round(u.mhp * regen)), { regen: 1 });
    if (u.st.regen) { u.st.regen.t--; if (u.st.regen.t <= 0) u.st.regen = null; }
    if (isBroken(B, u)) return 'broken';
    if (u.st.sleep > 0) { u.st.sleep--; if (u.st.sleep <= 0) push(B, { t: 'st', tg: u.uid, st: 'sleep', on: false }); return 'sleep'; }
    if (u.st.stun > 0) { u.st.stun = 0; push(B, { t: 'st', tg: u.uid, st: 'stun', on: false }); return 'stun'; }
    if (u.side === 'p') {
      if (!u.boostedLast) { var nb = Math.min(RU().bpMax, u.bp + 1); if (nb !== u.bp) { u.bp = nb; push(B, { t: 'bp', tg: u.uid, n: u.bp }); } }
      u.boostedLast = false;
    }
    return null;
  }
  function endTurn(B, u) {
    ['atk', 'def', 'spd'].forEach(function (k) { var b = u.buf[k]; if (b) { b.t--; if (b.t <= 0) { u.buf[k] = null; push(B, { t: 'buff', tg: u.uid, k: k, v: 0 }); } } });
    ['cover', 'counter', 'taunt', 'mist', 'seal'].forEach(function (k) { if (u.st[k] > 0) { u.st[k]--; if (u.st[k] <= 0) push(B, { t: 'st', tg: u.uid, st: k, on: false }); } });
    if (u.side === 'e') u.turns++;
    checkEnd(B);
  }

  // ---------- 命令が使えるか ----------
  function canUse(B, u, a) {
    if (!a) return '命令がない';
    if (a.boost && (a.boost < 0 || a.boost > RU().boostMax || a.boost > u.bp)) return '印が足りない';
    if (a.cmd === 'skill') {
      var s = skillDef(a.skill);
      if (!s || u.skills.indexOf(a.skill) < 0) return 'その術は使えない';
      if (u.st.seal > 0) return '術を封じられている';
      if (u.sp < (s.sp || 0)) return '術力が足りない';
      if (s.fx && s.fx.some(function (f) { return f.escape; }) && B.opts.noFlee) return 'ここでは逃げられない';
      if (s.tg === 'ko' && !front(B).some(function (x) { return x.ko; })) return '倒れた仲間がいない';
    }
    if (a.cmd === 'item') {
      var it = ITD().ITEMS[a.item];
      if (!it || !(B.S.items[a.item] > 0)) return '道具がない';
      if (it.k === 'flee' && B.opts.noFlee) return 'ここでは逃げられない';
      if (it.k === 'revive' && !front(B).some(function (x) { return x.ko; })) return '倒れた仲間がいない';
    }
    if (a.cmd === 'flee' && B.opts.noFlee) return 'ここでは逃げられない';
    if (a.cmd === 'swap') { var w = byUid(B, a.with); if (!w || !w.bench || w.ko) return '交代できる仲間がいない'; }
    if (a.cmd === 'kizuna') {
      if (B.kz < RU().kz.max) return '絆ゲージが足りない';
      if (a.id !== 'sougakari' && !kizunaReady(B, u).some(function (z) { return z.id === a.id; })) return 'その絆技は使えない';
    }
    return null;
  }
  function kizunaReady(B, u) {
    var fr = alive(front(B)), ids = {}; fr.forEach(function (x) { ids[x.id] = 1; });
    return SKD().KIZUNA.filter(function (z) { return (z.a === u.id || z.b === u.id) && ids[z.a] && ids[z.b]; });
  }

  // ---------- 仲間の命令 ----------
  function act(B, u, a) {
    var err = canUse(B, u, a);
    if (err) return { error: err };
    var boost = a.boost || 0;
    if (boost) { u.bp -= boost; u.boostedLast = true; push(B, { t: 'bp', tg: u.uid, n: u.bp, used: boost }); }
    switch (a.cmd) {
      case 'attack': doAttack(B, u, a.target, boost); break;
      case 'skill': doSkill(B, u, a.skill, a.target, boost); break;
      case 'item': doItem(B, u, a.item, a.target); break;
      case 'guard':
        u.guard = true; push(B, { t: 'act', u: u.uid, name: '防御', kind: 'guard', an: 'guard' });
        if (u.side === 'p' && u.bp < RU().bpMax) { u.bp++; push(B, { t: 'bp', tg: u.uid, n: u.bp }); }
        break;
      case 'swap': doSwap(B, u, byUid(B, a.with)); break;
      case 'flee': doFlee(B, u); break;
      case 'kizuna': doKizuna(B, u, a.id, a.target); break;
      default: return { error: 'わからない命令' };
    }
    endTurn(B, u);
    return { ok: true };
  }

  function pickTarget(B, u, want, side) {
    var list = side === 'opp' ? opp(B, u) : alive(mates(B, u));
    if (!list.length) return null;
    var t = want != null ? byUid(B, want) : null;
    if (t && list.indexOf(t) >= 0) return t;
    if (side === 'opp' && u.side === 'e') return enemyPick(B, list);
    return list[0];
  }
  // 妖怪がねらう相手：引きつけ×5
  function enemyPick(B, list) {
    var w = list.map(function (x) { return x.st.taunt > 0 ? 5 : 1; }), sum = 0;
    w.forEach(function (v) { sum += v; });
    var r = B.rng() * sum;
    for (var i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  // かばう：ひとりを狙う攻撃は、かばっている仲間が受ける
  function coverRedirect(B, att, tg) {
    if (!att || att.side === tg.side) return tg;
    var cov = alive(mates(B, tg)).filter(function (x) { return x !== tg && x.st.cover > 0; });
    if (!cov.length) return tg;
    push(B, { t: 'cover', by: cov[0].uid, for: tg.uid });
    return cov[0];
  }

  function doAttack(B, u, want, boost) {
    var tg = pickTarget(B, u, want, 'opp'); if (!tg) return;
    push(B, { t: 'act', u: u.uid, name: 'こうげき', kind: 'attack', an: 'attack', ty: u.wt, boost: boost });
    var hits = 1 + boost;
    if (u.st.clone > 0) { hits *= 2; u.st.clone = 0; push(B, { t: 'st', tg: u.uid, st: 'clone', on: false }); }
    for (var i = 0; i < hits; i++) {
      if (tg.ko) { tg = pickTarget(B, u, null, 'opp'); if (!tg) break; }
      strike(B, u, tg, { ty: u.wt, st: u.wmag ? 'm' : 'p', pw: u.wmag ? 92 : 100, single: true, normal: true });
      if (B.result) return;
    }
  }

  // 1回ぶんの攻撃（弱点・耐性・崩し・会心・かわし・反撃まで）
  function strike(B, u, tg, o) {
    if (!tg || tg.ko) return null;
    if (o.single && !o.noCover) tg = coverRedirect(B, u, tg);
    var ty = o.ty;
    if (ty === 'rand') ty = BS().TYPE_IDS[B.rng.int(8)];
    // かわし（見切り・霧の衣）
    if (!o.sure && o.single) {
      if (tg.st.evade > 0) {
        tg.st.evade--; push(B, { t: 'hit', u: u.uid, tg: tg.uid, miss: 1, ty: ty, why: 'evade' });
        if (tg.st.counter > 0 && !o.counter) counterAttack(B, tg, u);
        return null;
      }
      if (tg.st.mist > 0 && ty !== 'kaze' && B.rng() < 0.5) { push(B, { t: 'hit', u: u.uid, tg: tg.uid, miss: 1, ty: ty, why: 'mist' }); return null; }
    }
    if (tg.st.mist > 0 && ty === 'kaze') { tg.st.mist = 0; push(B, { t: 'st', tg: tg.uid, st: 'mist', on: false, msg: '霧が晴れた！' }); }
    var phys = o.st !== 'm';
    var A = eff(u, phys ? 'atk' : 'mag'), D = eff(tg, phys ? 'def' : 'mdf');
    var pw = o.pw;
    if (o.lowhp) pw *= 1 + 1.5 * (1 - u.hp / u.mhp);
    var dmg = A * pw / 100 * 120 / (120 + D) * (0.92 + B.rng() * 0.16);
    var weak = false, res = false, brk = false, crit = false;
    if (tg.side === 'e') {
      if (tg.weak.indexOf(ty) >= 0) { weak = true; dmg *= RU().weakMul; }
      else if (tg.res.indexOf(ty) >= 0) { res = true; dmg *= RU().resMul; }
    }
    if (isBroken(B, tg)) dmg *= RU().breakMul;
    var cc = 0.04 + (u.luk || 0) / 500 + (o.crit || 0) + (u.flags.crit || 0);
    if (B.rng() < cc) { crit = true; dmg *= RU().critMul; }
    if (tg.guard) dmg *= RU().guardMul;
    dmg = Math.max(1, Math.round(dmg * (o.mul || 1)));
    var e = push(B, { t: 'hit', u: u.uid, tg: tg.uid, dmg: dmg, ty: ty, weak: weak ? 1 : 0, res: res ? 1 : 0, crit: crit ? 1 : 0 });
    if (weak) {
      if (!tg.known[ty]) { tg.known[ty] = 1; ST().dexWeak(B.S, tg.eid, ty); push(B, { t: 'reveal', tg: tg.uid, ty: ty }); }
      addKz(B, RU().kz.weak);
      if (!isBroken(B, tg) && tg.shield > 0) {
        tg.shield = Math.max(0, tg.shield - 1 - (o.shield || 0));
        e.shield = tg.shield;
        if (tg.shield === 0) brk = true;
      }
    }
    if (u.side === 'p') { B.tested[tg.uid] = B.tested[tg.uid] || {}; B.tested[tg.uid][ty] = 1; }
    dealRaw(B, u, tg, dmg, { noEvent: true, ev: e });
    if (brk && !tg.ko) breakUnit(B, tg);
    if (o.drain && dmg > 0 && !u.ko) heal(B, u, Math.round(dmg * o.drain), {});
    if (!tg.ko && tg.st.sleep > 0) { tg.st.sleep = 0; push(B, { t: 'st', tg: tg.uid, st: 'sleep', on: false }); }
    if (!tg.ko && tg.st.counter > 0 && phys && o.single && !o.counter && u.side !== tg.side && !u.ko) counterAttack(B, tg, u);
    return e;
  }
  function breakUnit(B, tg) {
    tg.brokenUntil = B.round + 1;
    push(B, { t: 'break', tg: tg.uid });
    addKz(B, RU().kz.brk);
    if (tg.charging) { tg.charging = null; push(B, { t: 'cancel', tg: tg.uid }); }
  }
  function counterAttack(B, who, target) {
    if (who.ko || target.ko || B.result) return;
    push(B, { t: 'act', u: who.uid, name: '反撃', kind: 'counter', an: 'attack', ty: who.wt });
    strike(B, who, target, { ty: who.wt, st: who.wmag ? 'm' : 'p', pw: who.wmag ? 92 : 100, single: true, counter: true, noCover: true });
  }

  // HPを減らす（倒れる・身代わり人形・腕試しの勝負あり・控えのかけつけ）
  function dealRaw(B, u, tg, dmg, o) {
    o = o || {};
    if (tg.ko) return;
    tg.hp -= dmg;
    if (!o.noEvent) push(B, { t: 'hit', u: u ? u.uid : null, tg: tg.uid, dmg: dmg, dot: o.dot || null });
    if (tg.duel && tg.hp <= tg.mhp * tg.duel) {
      tg.hp = Math.max(1, Math.ceil(tg.mhp * tg.duel));
      if (o.ev) o.ev.hpAfter = tg.hp;
      if (enemies(B).filter(function (x) { return !x.ko; }).every(function (x) { return !x.duel || x.hp <= x.mhp * x.duel + 1; })) {
        push(B, { t: 'msg', text: '勝負あり！' });
        B.result = 'win'; push(B, { t: 'end', result: 'win', duel: 1 });
      }
      return;
    }
    if (tg.hp <= 0) {
      if (tg.flags && tg.flags.endure && !tg.endureUsed) { tg.endureUsed = true; tg.hp = 1; push(B, { t: 'msg', text: tg.name + 'は身代わり人形で持ちこたえた！' }); if (o.ev) o.ev.hpAfter = 1; return; }
      tg.hp = 0; tg.ko = true;
      tg.st = emptySt(); tg.buf = emptyBuf(); tg.charging = null;
      if (o.ev) o.ev.ko = 1;
      push(B, { t: 'ko', tg: tg.uid });
      if (tg.side === 'e') {
        addKz(B, RU().kz.kill);
        var d = END().ENEMIES[tg.eid];
        if (d.next) { transform(B, tg, d.next); return; }
        ST().dexSeen(B.S, tg.eid).won = (B.S.dex[tg.eid].won || 0) + 1;
      } else {
        addKz(B, RU().kz.down);
        standbyRescue(B);
      }
      checkEnd(B);
    }
    if (o.ev) o.ev.hpAfter = Math.max(0, tg.hp);
  }
  function transform(B, tg, nextId) {
    var d = END().ENEMIES[nextId], nu = enemyUnit(B, nextId, tg.slot);
    nu.uid = tg.uid;
    for (var k in nu) tg[k] = nu[k];
    tg.ko = false;
    push(B, { t: 'transform', tg: tg.uid, into: nextId, name: d.n });
    var fx = END().ENEMIES[tg.eid === nextId ? prevOf(nextId) : tg.eid];
    var nf = fx && fx.nextFx;
    if (nf) {
      if (nf.msg) push(B, { t: 'msg', text: nf.msg, big: 1 });
      front(B).forEach(function (u) {
        if (u.ko) revive(B, u, nf.heal || 0.5); else if (nf.heal) heal(B, u, u.mhp * nf.heal, {});
        if (nf.bpMax) { u.bp = RU().bpMax; push(B, { t: 'bp', tg: u.uid, n: u.bp }); }
      });
      if (nf.learn) {
        ST().learn(B.S, nf.learn[0], nf.learn[1]);
        party(B).forEach(function (u) { if (u.id === nf.learn[0] && u.skills.indexOf(nf.learn[1]) < 0) { u.skills.push(nf.learn[1]); push(B, { t: 'learn', tg: u.uid, skill: nf.learn[1] }); } });
      }
    }
  }
  function prevOf(id) { var E = END().ENEMIES; for (var k in E) if (E[k].next === id) return k; return id; }
  function standbyRescue(B) {
    if (alive(front(B)).length) return;
    var bs = alive(bench(B));
    if (!bs.length || B.standbyUsed) return;
    B.standbyUsed = true;
    var outs = front(B), ins = bs.slice(0, 4);
    ins.forEach(function (b, i) { var o = outs[i]; if (o) { o.bench = true; var s = o.slot; o.slot = b.slot; b.slot = s; } else { b.slot = front(B).length; } b.bench = false; });
    push(B, { t: 'standby', units: ins.map(function (x) { return x.uid; }) });
  }
  function checkEnd(B) {
    if (B.result) return B.result;
    if (!alive(enemies(B)).length) {
      B.result = 'win';
      push(B, { t: 'end', result: 'win' });
    } else if (!alive(front(B)).length && (B.standbyUsed || !alive(bench(B)).length)) {
      B.result = 'lose'; push(B, { t: 'end', result: 'lose' });
    }
    return B.result;
  }

  function heal(B, tg, n, o) {
    if (tg.ko) return 0;
    var before = tg.hp;
    tg.hp = Math.min(tg.mhp, tg.hp + Math.max(0, Math.round(n)));
    var got = tg.hp - before;
    push(B, { t: 'heal', tg: tg.uid, n: got, hpAfter: tg.hp, regen: o && o.regen ? 1 : 0 });
    return got;
  }

  // ---------- 術 ----------
  function targetsFor(B, u, s, want) {
    var tg = s.tg;
    if (tg === 'e1') { var t = pickTarget(B, u, want, 'opp'); return t ? [t] : []; }
    if (tg === 'ea') return opp(B, u);
    if (tg === 'er') return opp(B, u);
    if (tg === 'a1') { var a = want != null ? byUid(B, want) : null; if (!a || a.ko || a.side !== u.side || (a.side === 'p' && a.bench)) a = lowestAlly(B, u); return a ? [a] : []; }
    if (tg === 'aa') return alive(mates(B, u));
    if (tg === 'me') return [u];
    if (tg === 'ko') { var k = want != null ? byUid(B, want) : null; var kos = mates(B, u).filter(function (x) { return x.ko; }); if (!k || kos.indexOf(k) < 0) k = kos[0]; return k ? [k] : []; }
    return [];
  }
  function lowestAlly(B, u) {
    var list = alive(mates(B, u)); if (!list.length) return null;
    return list.slice().sort(function (a, b) { return a.hp / a.mhp - b.hp / b.mhp; })[0];
  }
  function doSkill(B, u, sid, want, boost) {
    var s = skillDef(sid);
    if (u.side === 'p') u.sp -= (s.sp || 0);
    push(B, { t: 'act', u: u.uid, name: s.n, kind: s.k, an: s.an || 'cast', ty: s.ty || null, ult: s.ult ? 1 : 0, skill: sid, boost: boost, side: u.side });
    useEffect(B, u, s, want, boost || 0);
  }
  function fxHas(s, key) { return (s.fx || []).some(function (f) { return f[key] != null; }); }
  function fxGet(s, key) { var r = null; (s.fx || []).forEach(function (f) { if (f[key] != null) r = f; }); return r; }

  function useEffect(B, u, s, want, boost) {
    var R = RU(), list = targetsFor(B, u, s, want);
    var crit = fxGet(s, 'crit'), sure = fxHas(s, 'sure'), lowhp = fxHas(s, 'lowhp'), drain = fxGet(s, 'drain'), shieldX = fxGet(s, 'shield');
    if (s.k === 'atk') {
      var hits = s.hits || 1, pw = s.pw;
      var multi = s.tg === 'er' || hits > 1;
      if (multi) hits += boost; else pw *= R.skillBoost[boost];
      if (u.st.clone > 0) { hits *= 2; u.st.clone = 0; push(B, { t: 'st', tg: u.uid, st: 'clone', on: false }); }
      var tys = s.tys || [s.ty];
      var oBase = { st: s.st || 'm', pw: pw, crit: crit ? crit.crit : 0, sure: sure, lowhp: lowhp, drain: drain ? drain.drain : 0, shield: shieldX ? shieldX.shield : 0 };
      if (s.tg === 'er') {
        for (var i = 0; i < hits; i++) {
          var pool = opp(B, u); if (!pool.length) break;
          var t = u.side === 'e' ? enemyPick(B, pool) : pool[B.rng.int(pool.length)];
          strike(B, u, t, extend(oBase, { ty: tys[i % tys.length], single: true, noCover: true }));
          if (B.result) return;
        }
      } else {
        for (var h = 0; h < hits; h++) {
          for (var k = 0; k < list.length; k++) {
            var tg = list[k]; if (tg.ko) { if (s.tg === 'e1') { tg = pickTarget(B, u, null, 'opp'); if (!tg) break; } else continue; }
            for (var y = 0; y < tys.length; y++) {
              strike(B, u, tg, extend(oBase, { ty: tys[y], single: s.tg === 'e1' }));
              if (B.result) return;
            }
          }
        }
      }
      list = s.tg === 'er' ? [] : list.filter(function (x) { return !x.ko; });
    } else if (s.k === 'heal') {
      var mul = R.healBoost[boost];
      list.forEach(function (tg) {
        if (s.tg === 'ko') return;
        var n = s.pw >= 999 ? tg.mhp : eff(u, 'mag') * s.pw / 100 * (0.95 + B.rng() * 0.1) * mul;
        heal(B, tg, n, {});
        addKz(B, R.kz.heal);
      });
    }
    applyFx(B, u, s, list, boost);
  }
  function extend(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  function applyFx(B, u, s, list, boost) {
    var R = RU();
    (s.fx || []).forEach(function (f) {
      var tgs = f.to === 'me' ? [u] : f.to === 'aa' ? alive(mates(B, u)) : f.to === 'ea' ? opp(B, u) : list;
      tgs = tgs.filter(function (x) { return x && !x.ko; });
      if (f.st) tgs.forEach(function (tg) { inflict(B, tg, f.st, f.ch); });
      if (f.buff) tgs.forEach(function (tg) { buff(B, tg, f.buff, f.v, R.buffTurns + boost); });
      if (f.reveal) (f.reveal === 'ea' ? opp(B, u) : tgs).forEach(function (tg) { reveal(B, tg); });
      if (f.cover) { u.st.cover = f.cover + boost; push(B, { t: 'st', tg: u.uid, st: 'cover', on: true }); }
      if (f.counter) { u.st.counter = Math.max(u.st.counter, f.counter + boost); push(B, { t: 'st', tg: u.uid, st: 'counter', on: true }); }
      if (f.evade) tgs.forEach(function (tg) { tg.st.evade = Math.max(tg.st.evade, f.evade); push(B, { t: 'st', tg: tg.uid, st: 'evade', on: true }); });
      if (f.taunt) { u.st.taunt = f.taunt + boost; push(B, { t: 'st', tg: u.uid, st: 'taunt', on: true }); }
      if (f.clone) { u.st.clone = 1; push(B, { t: 'st', tg: u.uid, st: 'clone', on: true }); }
      if (f.mist) { u.st.mist = f.mist; push(B, { t: 'st', tg: u.uid, st: 'mist', on: true }); }
      if (f.regen) tgs.forEach(function (tg) { tg.st.regen = { v: f.regen, t: f.t + boost }; push(B, { t: 'st', tg: tg.uid, st: 'regen', on: true }); });
      if (f.cure) tgs.forEach(function (tg) { cure(B, tg); });
      if (f.revive) list.forEach(function (tg) { if (tg.ko) revive(B, tg, f.revive); });
      if (f.reviveAll) mates(B, u).forEach(function (tg) { if (tg.ko && !(tg.side === 'p' && tg.bench)) revive(B, tg, f.reviveAll); });
      if (f.sacrifice) list.forEach(function (tg) { if (tg.ko) { revive(B, tg, 1); u.hp = 1; push(B, { t: 'hit', u: u.uid, tg: u.uid, dmg: 0, sac: 1, hpAfter: 1 }); } });
      if (f.bp) tgs.forEach(function (tg) { if (tg.side !== 'p') return; tg.bp = Math.min(R.bpMax, tg.bp + f.bp); push(B, { t: 'bp', tg: tg.uid, n: tg.bp, gain: f.bp }); });
      if (f.kz) addKz(B, f.kz);
      if (f.curse) tgs.forEach(function (tg) { if (tg.side === u.side) return; tg.st.curse = { dmg: Math.max(1, Math.round(eff(u, 'mag') * f.curse / 100 * 120 / (120 + eff(tg, 'mdf')))), t: f.t + boost }; push(B, { t: 'st', tg: tg.uid, st: 'curse', on: true }); });
      if (f.healAll) alive(mates(B, u)).forEach(function (tg) { heal(B, tg, eff(u, 'mag') * f.healAll / 100, {}); });
      if (f.stunAll) opp(B, u).forEach(function (tg) { inflict(B, tg, 'stun', f.stunAll); });
      if (f.escape) { flee(B, true); }
      if (f.fortune) for (var i = 0; i < f.fortune; i++) fortune(B, u);
      if (f.summon) summon(B, u, f.summon, f.n || 1);
      if (f.flee) { u.fled = true; push(B, { t: 'flee', who: u.uid }); checkEnd(B); }
    });
  }
  function inflict(B, tg, st, ch) {
    if (tg.ko) return false;
    if (tg.boss && (st === 'sleep' || st === 'stun' || st === 'seal')) return false;
    var fl = tg.flags || {};
    if ((st === 'poison' && fl.noPoison) || (st === 'sleep' && fl.noSleep) || (st === 'seal' && fl.noSeal) || (st === 'stun' && fl.noStun)) { push(B, { t: 'msg', text: tg.name + 'はお守りで防いだ！' }); return false; }
    if (B.rng() >= (ch == null ? 1 : ch)) { push(B, { t: 'resist', tg: tg.uid, st: st }); return false; }
    var R = RU();
    if (st === 'poison') tg.st.poison = R.poisonTurns;
    else if (st === 'sleep') tg.st.sleep = R.sleepTurns;
    else if (st === 'seal') tg.st.seal = R.sealTurns;
    else if (st === 'stun') { if (isBroken(B, tg)) return false; tg.st.stun = 1; }
    push(B, { t: 'st', tg: tg.uid, st: st, on: true });
    return true;
  }
  function cure(B, tg) {
    ['poison', 'sleep', 'seal', 'stun'].forEach(function (k) { if (tg.st[k] > 0) { tg.st[k] = 0; push(B, { t: 'st', tg: tg.uid, st: k, on: false }); } });
    if (tg.st.curse) { tg.st.curse = null; push(B, { t: 'st', tg: tg.uid, st: 'curse', on: false }); }
  }
  function buff(B, tg, k, v, t) {
    var cur = tg.buf[k] ? tg.buf[k].v : 0, nv = Math.max(-2, Math.min(2, cur + v));
    tg.buf[k] = nv ? { v: nv, t: t } : null;
    push(B, { t: 'buff', tg: tg.uid, k: k, v: nv, d: v });
  }
  function reveal(B, tg) {
    if (tg.side !== 'e') return;
    var any = false;
    tg.weak.forEach(function (ty) { if (!tg.known[ty]) { tg.known[ty] = 1; ST().dexWeak(B.S, tg.eid, ty); push(B, { t: 'reveal', tg: tg.uid, ty: ty }); any = true; } });
    if (!any) push(B, { t: 'msg', text: tg.name + 'の弱点は、もう分かっている' });
  }
  function revive(B, tg, rate) {
    tg.ko = false; tg.hp = Math.max(1, Math.round(tg.mhp * rate));
    push(B, { t: 'revive', tg: tg.uid, hp: tg.hp });
  }
  function summon(B, u, eid, n) {
    var cur = alive(enemies(B)).length, added = [];
    for (var i = 0; i < n && cur + added.length < 5; i++) {
      var slot = 0, used = {}; enemies(B).forEach(function (e) { if (!e.ko) used[e.slot] = 1; });
      while (used[slot]) slot++;
      var nu = enemyUnit(B, eid, slot); B.units.push(nu); added.push(nu.uid);
    }
    if (added.length) push(B, { t: 'summon', units: added, by: u.uid });
    else push(B, { t: 'msg', text: 'しかし、だれも来なかった' });
  }
  var FORTUNES = [
    { n: 'みんなが元気になる未来', f: function (B, u) { alive(mates(B, u)).forEach(function (t) { heal(B, t, eff(u, 'mag') * 2.5, {}); }); } },
    { n: '印があふれる未来', f: function (B, u) { alive(front(B)).forEach(function (t) { t.bp = Math.min(RU().bpMax, t.bp + 2); push(B, { t: 'bp', tg: t.uid, n: t.bp, gain: 2 }); }); } },
    { n: '妖怪がすくむ未来', f: function (B, u) { opp(B, u).forEach(function (t) { inflict(B, t, 'stun', t.boss ? 0 : 1); }); } },
    { n: '光が落ちてくる未来', f: function (B, u) { opp(B, u).forEach(function (t) { strike(B, u, t, { ty: 'hikari', st: 'm', pw: 200, sure: true }); }); } },
    { n: '絆がつながる未来', f: function (B, u) { addKz(B, 100); } },
    { n: '倒れた仲間が起きる未来', ok: function (B) { return front(B).some(function (x) { return x.ko; }); }, f: function (B, u) { front(B).forEach(function (t) { if (t.ko) revive(B, t, 0.6); }); } }
  ];
  function fortune(B, u) {
    var list = FORTUNES.filter(function (x) { return !x.ok || x.ok(B); });
    var pick = list[B.rng.int(list.length)];
    push(B, { t: 'msg', text: '猫の目がひかる…「' + pick.n + '」をえらんだ！' });
    pick.f(B, u);
  }

  // ---------- 道具・交代・逃げる・絆技 ----------
  function doItem(B, u, iid, want) {
    var it = ITD().ITEMS[iid];
    ST().addItem(B.S, iid, -1);
    push(B, { t: 'act', u: u.uid, name: it.n, kind: 'item', an: it.k === 'throw' ? 'throw' : 'item', ty: it.ty || null, item: iid });
    var tg;
    if (it.k === 'throw') {
      tg = pickTarget(B, u, want, 'opp'); if (!tg) return;
      var heroLv = B.S.members.hero ? B.S.members.hero.lv : 1;
      var base = ITD().throwDamage(heroLv);
      strikeFixed(B, u, tg, base, it.ty);
      return;
    }
    if (it.k === 'reveal') { tg = pickTarget(B, u, want, 'opp'); if (tg) reveal(B, tg); return; }
    if (it.k === 'flee') { flee(B, true); return; }
    if (it.k === 'healall') { alive(front(B)).forEach(function (t) { heal(B, t, it.v, {}); }); return; }
    if (it.k === 'revive') { var kos = front(B).filter(function (x) { return x.ko; }); tg = byUid(B, want); if (!tg || kos.indexOf(tg) < 0) tg = kos[0]; if (tg) revive(B, tg, it.v); return; }
    tg = byUid(B, want); if (!tg || tg.ko || tg.side !== 'p') tg = lowestAlly(B, u); if (!tg) return;
    if (it.k === 'heal') { heal(B, tg, it.v, {}); if (it.cure) cure(B, tg); }
    if (it.k === 'cure') cure(B, tg);
    if (it.k === 'sp') { var b = tg.sp; tg.sp = Math.min(tg.msp, tg.sp + it.v); push(B, { t: 'sp', tg: tg.uid, n: tg.sp - b }); }
  }
  // 投げ物：守りに関係なく決まったダメージ（弱点・崩しは効く）
  function strikeFixed(B, u, tg, base, ty) {
    var dmg = base * (0.95 + B.rng() * 0.1), weak = tg.weak.indexOf(ty) >= 0, res = !weak && tg.res.indexOf(ty) >= 0;
    if (weak) dmg *= RU().weakMul; if (res) dmg *= RU().resMul;
    if (isBroken(B, tg)) dmg *= RU().breakMul;
    dmg = Math.max(1, Math.round(dmg));
    var e = push(B, { t: 'hit', u: u.uid, tg: tg.uid, dmg: dmg, ty: ty, weak: weak ? 1 : 0, res: res ? 1 : 0 });
    var brk = false;
    if (weak) {
      if (!tg.known[ty]) { tg.known[ty] = 1; ST().dexWeak(B.S, tg.eid, ty); push(B, { t: 'reveal', tg: tg.uid, ty: ty }); }
      addKz(B, RU().kz.weak);
      if (!isBroken(B, tg) && tg.shield > 0) { tg.shield--; e.shield = tg.shield; if (!tg.shield) brk = true; }
    }
    dealRaw(B, u, tg, dmg, { noEvent: true, ev: e });
    if (brk && !tg.ko) breakUnit(B, tg);
  }
  function doSwap(B, u, w) {
    var s = u.slot; u.slot = w.slot; w.slot = s; u.bench = true; w.bench = false;
    push(B, { t: 'swap', out: u.uid, in: w.uid });
  }
  function flee(B, sure) {
    if (B.opts.noFlee) { push(B, { t: 'msg', text: 'ここでは逃げられない！' }); return false; }
    if (sure || B.rng() < RU().flee) { B.result = 'flee'; push(B, { t: 'end', result: 'flee' }); return true; }
    push(B, { t: 'msg', text: '回りこまれてしまった！' });
    return false;
  }
  function doFlee(B, u) { push(B, { t: 'act', u: u.uid, name: '逃げる', kind: 'flee', an: 'flee' }); flee(B, false); }
  function doKizuna(B, u, zid, want) {
    B.kz = 0; push(B, { t: 'kz', v: 0 });
    if (zid === 'sougakari') {
      push(B, { t: 'act', u: u.uid, name: SKD().SOUGAKARI.n, kind: 'kizuna', an: 'all_out', kz: 'sougakari', cut: alive(front(B)).map(function (x) { return x.id; }) });
      alive(front(B)).forEach(function (m) {
        var tg = pickTarget(B, m, want, 'opp'); if (!tg || B.result) return;
        strike(B, m, tg, { ty: m.wt, st: m.wmag ? 'm' : 'p', pw: SKD().SOUGAKARI.pw, single: false, sure: true });
      });
      return;
    }
    var z = SKD().KIZUNA_BY[zid];
    push(B, { t: 'act', u: u.uid, name: z.n, kind: 'kizuna', an: 'kizuna', kz: zid, cut: [z.a, z.b] });
    useEffect(B, u, z, want, 0);
  }

  // ---------- 妖怪の行動 ----------
  function cond(B, u, c) {
    if (!c) return true;
    var m = /^hp<([\d.]+)$/.exec(c); if (m) return u.hp / u.mhp < +m[1];
    if (c === 'allyHurt') return enemies(B).some(function (e) { return !e.ko && e.hp / e.mhp < 0.6; });
    if (c === 'noMist') return !(u.st.mist > 0);
    return true;
  }
  function enemyChoose(B, u) {
    var d = END().ENEMIES[u.eid];
    if (u.charging) { var s = u.charging; u.charging = null; return { cmd: 'skill', skill: s, fromCharge: true }; }
    if (d.cn) {
      var sk = (d.skills || []).filter(function (x) { return u.st.seal <= 0; });
      if (sk.length && B.rng() < 0.6) return { cmd: 'skill', skill: sk[B.rng.int(sk.length)] };
      return { cmd: 'attack' };
    }
    var acts = d.acts || [{ s: 'tai', w: 1 }];
    // ため（n回に1回）
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.charge && a.every && (u.turns + 1) % a.every === 0) return { cmd: 'charge', skill: a.s };
    }
    // 1回だけの技
    for (i = 0; i < acts.length; i++) {
      a = acts[i];
      if (a.once && !u.once[a.s] && cond(B, u, a.if)) { u.once[a.s] = 1; return { cmd: 'skill', skill: a.s }; }
    }
    var pool = acts.filter(function (x) { return !x.charge && !x.once && cond(B, u, x.if); });
    if (u.st.seal > 0) pool = pool.filter(function (x) { var s = skillDef(x.s); return s && s.k === 'atk' && s.st === 'p'; });
    if (!pool.length) return { cmd: 'skill', skill: 'tai' };
    var sum = 0; pool.forEach(function (x) { sum += x.w || 1; });
    var r = B.rng() * sum;
    for (i = 0; i < pool.length; i++) { r -= pool[i].w || 1; if (r <= 0) return { cmd: 'skill', skill: pool[i].s }; }
    return { cmd: 'skill', skill: pool[pool.length - 1].s };
  }
  function enemyAct(B, u) {
    var a = enemyChoose(B, u);
    if (a.cmd === 'charge') {
      u.charging = a.skill;
      push(B, { t: 'charge', u: u.uid, name: skillDef(a.skill).n });
    } else if (a.cmd === 'attack') {
      doAttack(B, u, null, 0);
    } else {
      var s = skillDef(a.skill);
      push(B, { t: 'act', u: u.uid, name: s.n, kind: s.k, an: s.an || 'bump', ty: s.ty || null, skill: a.skill, side: 'e', big: a.fromCharge ? 1 : 0 });
      useEffect(B, u, s, null, 0);
    }
    endTurn(B, u);
  }

  // ---------- おまかせ（仲間の自動の命令）----------
  function dmgOptions(B, u) {
    var out = [{ cmd: 'attack', ty: u.wt, hits: 1, pw: u.wmag ? 92 : 100, multi: false, tg: 'e1', sp: 0 }];
    if (u.st.seal > 0) return out;
    u.skills.forEach(function (sid) {
      var s = skillDef(sid); if (!s || s.k !== 'atk' || u.sp < (s.sp || 0)) return;
      out.push({ cmd: 'skill', skill: sid, ty: s.ty, hits: s.hits || 1, pw: s.pw, multi: s.tg === 'er' || (s.hits || 1) > 1, tg: s.tg, sp: s.sp || 0, rand: s.ty === 'rand' });
    });
    return out;
  }
  function auto(B, u) {
    var R = RU();
    var foes = opp(B, u); if (!foes.length) return { cmd: 'guard' };
    var fr = alive(front(B)), kos = front(B).filter(function (x) { return x.ko; });
    var has = function (pred) { for (var i = 0; i < u.skills.length; i++) { var s = skillDef(u.skills[i]); if (s && pred(s) && u.sp >= (s.sp || 0) && u.st.seal <= 0) return u.skills[i]; } return null; };
    // 1) 倒れた仲間を起こす
    if (kos.length) {
      var rv = has(function (s) { return s.tg === 'ko' || fxHas(s, 'reviveAll'); });
      if (rv) return { cmd: 'skill', skill: rv, target: kos[0].uid, boost: 0 };
      if ((B.S.items.kitsuke || 0) > 0 && (u.id === 'hero' || u.id === 'oen')) return { cmd: 'item', item: 'kitsuke', target: kos[0].uid };
    }
    // 2) 回復
    var hurt = fr.filter(function (x) { return x.hp / x.mhp < 0.42; });
    if (hurt.length) {
      var allH = has(function (s) { return s.k === 'heal' && s.tg === 'aa'; });
      var oneH = has(function (s) { return s.k === 'heal' && (s.tg === 'a1' || (s.tg === 'me' && hurt[0] === u)); });
      if (hurt.length >= 2 && allH) return { cmd: 'skill', skill: allH, boost: Math.min(u.bp > 2 ? 1 : 0, u.bp) };
      if (oneH) return { cmd: 'skill', skill: oneH, target: hurt[0].uid, boost: 0 };
      if (allH) return { cmd: 'skill', skill: allH, boost: 0 };
      if ((B.S.items.kizugusuri || 0) > 0 && hurt[0].hp / hurt[0].mhp < 0.25) return { cmd: 'item', item: 'kizugusuri', target: hurt[0].uid };
    }
    // 3) 絆技
    if (B.kz >= R.kz.max) {
      var zs = kizunaReady(B, u);
      if (zs.length) return { cmd: 'kizuna', id: zs[0].id, target: foes[0].uid };
      if (fr.length >= 3) return { cmd: 'kizuna', id: 'sougakari', target: foes[0].uid };
    }
    // 4) 崩れている敵 → いちばん強い技を印で
    var opts = dmgOptions(B, u);
    var broken = foes.filter(function (e) { return isBroken(B, e); });
    var bstBoost = Math.min(u.bp, R.boostMax);
    if (broken.length) {
      var best = null, bv = -1;
      opts.forEach(function (o) {
        var v = o.pw * (o.multi ? (o.hits + bstBoost) : R.skillBoost[bstBoost]) * (o.tg === 'ea' ? broken.length + 0.3 * (foes.length - broken.length) : 1);
        if (o.tg === 'er') v = o.pw * (o.hits + bstBoost);
        if (v > bv) { bv = v; best = o; }
      });
      return toAction(best, broken[0], bstBoost);
    }
    // 5) 分かっている弱点で構えを削る（崩せそうなら印）
    var plan = null, pv = -1;
    foes.forEach(function (e) {
      opts.forEach(function (o) {
        if (o.rand) return;
        var weakHit = e.known[o.ty] && e.weak.indexOf(o.ty) >= 0;
        var testedNo = B.tested[e.uid] && B.tested[e.uid][o.ty] && !weakHit;
        var v;
        if (weakHit) {
          var n = o.tg === 'ea' ? foes.filter(function (f) { return f.known[o.ty] && f.weak.indexOf(o.ty) >= 0 && !isBroken(B, f); }).length : 1;
          v = 100 + (o.multi ? o.hits : 1) * 30 * n + (o.tg === 'ea' ? 20 * n : 0) - o.sp * 0.5;
        } else if (!testedNo && Object.keys(e.known).length < e.weak.length && !(B.tested[e.uid] && B.tested[e.uid][o.ty])) {
          v = 60 - o.sp;   // まだためしていない型でさぐる
        } else v = o.pw / 10 - o.sp * 0.3;
        if (e.res.indexOf(o.ty) >= 0 && B.tested[e.uid] && B.tested[e.uid][o.ty]) v -= 50;
        if (v > pv) { pv = v; plan = { o: o, e: e, weak: weakHit }; }
      });
    });
    if (!plan) return { cmd: 'attack', target: foes[0].uid, boost: 0 };
    var boost = 0;
    if (plan.weak) {
      var per = plan.o.multi ? plan.o.hits : 1, need = plan.e.shield;
      if (plan.o.cmd === 'attack') { var k = Math.max(0, need - 1); if (k <= u.bp && k <= R.boostMax) boost = k; }
      else if (plan.o.multi && per < need) { var k2 = need - per; if (k2 <= u.bp && k2 <= R.boostMax) boost = k2; }
    }
    if (!boost && u.bp >= R.bpMax) boost = 1;
    return toAction(plan.o, plan.e, boost);
  }
  function toAction(o, e, boost) {
    if (o.cmd === 'attack') return { cmd: 'attack', target: e.uid, boost: boost };
    return { cmd: 'skill', skill: o.skill, target: e.uid, boost: boost };
  }

  // ---------- 戦闘のあと ----------
  function finish(B) {
    var S = B.S, out = { result: B.result, exp: 0, gold: 0, drops: [], ups: [] };
    party(B).forEach(function (u) {
      if (u.guest) return;
      var m = S.members[u.id]; if (!m) return;
      m.hp = u.ko ? (B.result === 'lose' ? 0 : 1) : u.hp; m.sp = u.sp;
      ST().clampMember(S, u.id);
      if (B.result !== 'lose' && m.hp <= 0) m.hp = 1;
    });
    if (B.result === 'win') {
      var expMul = 1, goldMul = 1;
      front(B).forEach(function (u) { if (u.flags.exp) expMul = Math.max(expMul, 1 + u.flags.exp); if (u.flags.gold) goldMul = Math.max(goldMul, 1 + u.flags.gold); });
      B.units.forEach(function (u) {
        if (u.side !== 'e' || u.fled || !u.ko && !u.duel) return;
        if (!u.ko && u.duel && !(u.hp <= u.mhp * u.duel + 1)) return;
        var d = END().ENEMIES[u.eid], std = BS().enemyStd(d.lv), m = d.m || {};
        out.exp += Math.round(std.exp * (m.exp || 1) * B.diff.exp);
        out.gold += Math.round(std.gold * (m.gold || 1));
        (d.drops || []).forEach(function (dr) {
          if (B.rng() < dr.ch) { var id = dr.i || dr.c || dr.m; out.drops.push(id); ST().addItem(S, id, 1); }
        });
        if (u.duel) ST().dexSeen(S, u.eid).won = (S.dex[u.eid].won || 0) + 1;
      });
      out.exp = Math.round(out.exp * expMul); out.gold = Math.round(out.gold * goldMul);
      ST().addGold(S, out.gold);
      out.ups = ST().gainExp(S, out.exp);
    }
    return out;
  }

  // テスト・おまかせ用：決着まで回す（仲間は auto、妖怪は通常）
  function runAuto(B, maxTurns, chooser) {
    var n = 0;
    while (!B.result && n < (maxTurns || 2000)) {
      var u = nextActor(B); if (!u) break;
      n++;
      if (u.side === 'p') { var a = (chooser || auto)(B, u); var r = act(B, u, a); if (r.error) act(B, u, { cmd: 'guard' }); }
      else enemyAct(B, u);
    }
    return B.result;
  }

  var api = {
    create: create, nextActor: nextActor, act: act, enemyAct: enemyAct, enemyChoose: enemyChoose, auto: auto, finish: finish, runAuto: runAuto,
    canUse: canUse, kizunaReady: kizunaReady, skillDef: skillDef, isBroken: isBroken, front: front, bench: bench, enemies: enemies, party: party, alive: alive, byUid: byUid, eff: eff
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_BATTLE = api;
})(typeof window !== 'undefined' ? window : globalThis);
