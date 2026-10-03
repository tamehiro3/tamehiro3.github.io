/* ニンジャ相棒道場 — 相棒の方針と判断（画面に依存しない。Node でもブラウザでも動く）
 *
 * 設計書 ③ §4〜§10 の中身：
 *   - 方針の3軸（支援優先・探索優先・慎重さ 0〜100）と、明示的な作戦（3枠まで。数値より優先）
 *   - 行動の5候補（追従・攻撃・救助・調査・退避）を、状況と方針からスコアで選ぶ。実行できない候補は除外。
 *     見習いの直接指示（集合・助けて・下がって）と、体力がのこりわずかな時の退避は優先ルール
 *   - 選んだ理由を、実際に計算した点数と作戦から文章にする（起きていないことは書かない）
 *   - 振り返り：代表的な判断を最大2件。1回の指導で各軸は最大±10。確定するまで変わらない
 *   - 指導の履歴・直前の取り消し・全部もとにもどす（どれも無料）
 *   - 言葉で教える（試験機能）：入力検査 → 意図の抽出 → 許可された作戦と範囲の検証 → 変更案 → 確定
 *   - 日記：承認済みの出来事IDだけから作る
 *   - 保存・引き継ぎ（二つの記録がぶつかったら選ぶ。選ばなかった方は7日残す）・見た目の権利は進行と別に守る
 * 毎フレーム生成AIを呼ぶことはしない。判断はすべてこのファイルの軽いルールと点数で行う。
 */
(function (root) {
  'use strict';
  var D = root.NAD_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var BAL = D.BAL, AXIS_IDS = D.AXIS_IDS;

  /* ================= 小道具 ================= */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function has(arr, v) { return arr.indexOf(v) >= 0; }
  function sameAxes(a, b) { return AXIS_IDS.every(function (k) { return a[k] === b[k]; }); }
  function axisName(k) { for (var i = 0; i < D.AXES.length; i++) if (D.AXES[i].id === k) return D.AXES[i].name; return k; }
  function ruleName(id) { return D.RULES[id] ? D.RULES[id].name : id; }
  function signed(n) { return (n > 0 ? '+' : '') + n; }

  // 決まった乱数（同じ seed なら同じ並び）
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
  }
  function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ================= 方針（PolicyState） ================= */
  function makePolicy(axes, rules) {
    var ax = {}; AXIS_IDS.forEach(function (k) { ax[k] = clamp(Math.round((axes || D.INITIAL_AXES)[k]), 0, 100); });
    return { axes: ax, rules: (rules || []).slice(0, BAL.maxRules), version: 1, history: [], initial: { axes: copy(ax), rules: (rules || []).slice(0, BAL.maxRules) } };
  }
  function snapshot(p) { return { axes: copy(p.axes), rules: p.rules.slice() }; }
  // 変更を加えた新しい版を作る（元の p は変えない）
  function commit(p, next, entry) {
    var q = copy(p);
    q.axes = next.axes; q.rules = next.rules;
    q.version = p.version + 1;
    entry.v = q.version; entry.before = snapshot(p); entry.after = snapshot(q);
    q.history.push(entry);
    if (q.history.length > 60) q.history = q.history.slice(-60);
    return q;
  }
  // changes: {support:+10,...}  rulesAdd / rulesRemove: [id]
  function applyChanges(p, changes, rulesAdd, rulesRemove, meta) {
    meta = meta || {};
    var ax = copy(p.axes), diff = {};
    AXIS_IDS.forEach(function (k) {
      var d = clamp(Math.round((changes || {})[k] || 0), -BAL.teachCap, BAL.teachCap);
      var nv = clamp(ax[k] + d, 0, 100);
      if (nv !== ax[k]) diff[k] = nv - ax[k];
      ax[k] = nv;
    });
    var rules = p.rules.filter(function (r) { return !has(rulesRemove || [], r); });
    var added = [];
    (rulesAdd || []).forEach(function (r) { if (D.RULES[r] && !has(rules, r) && rules.length < BAL.maxRules) { rules.push(r); added.push(r); } });
    var removed = p.rules.filter(function (r) { return !has(rules, r); });
    var entry = { at: meta.at || 0, source: meta.source || 'teach', diff: diff, rulesAdded: added, rulesRemoved: removed, note: meta.note || '', lessonIds: meta.lessonIds || [] };
    return commit(p, { axes: ax, rules: rules }, entry);
  }
  function canUndo(p) {
    for (var i = p.history.length - 1; i >= 0; i--) { var h = p.history[i]; if (h.source !== 'undo' && !h.undone) return true; }
    return false;
  }
  // 直前の変更を戻す（無料）。戻した結果も新しい版として記録する（同じ場面の再現に使う）
  function undo(p, at) {
    var idx = -1;
    for (var i = p.history.length - 1; i >= 0; i--) { var h = p.history[i]; if (h.source !== 'undo' && !h.undone) { idx = i; break; } }
    if (idx < 0) return p;
    var target = p.history[idx];
    var q = commit(p, { axes: copy(target.before.axes), rules: target.before.rules.slice() }, { at: at || 0, source: 'undo', revertOf: target.v, diff: {}, rulesAdded: [], rulesRemoved: [], note: '直前の変更を戻した' });
    q.history[idx].undone = true;
    return q;
  }
  // 全部もとにもどす（無料）
  function reset(p, at) {
    return commit(p, { axes: copy(p.initial.axes), rules: p.initial.rules.slice() }, { at: at || 0, source: 'reset', diff: {}, rulesAdded: [], rulesRemoved: [], note: 'はじめの方針にもどした' });
  }

  /* ================= 判断（行動の5候補とスコア） ================= */
  // ctx:
  //   me {x,y,hp,down}  player {id:'player',x,y,hp,down}
  //   allies [{id,name,x,y,down,patience(0..1),threat(bool)}]   escort {id,name,x,y,threat} | null
  //   enemies [{id,kind,name,x,y,hp,target,strong}]   spots [{id,kind,x,y,value,opened}]
  //   dangerHere 0..1  inTelegraph bool  command null|'gather'|'help'|'back'  kind 'rescue'|'explore'|'escort'|'tutorial'|'exam'
  //   path(x,y) → {dist, danger 0..1, blocked}   （sim.js が方針の慎重さ・作戦で道を選んで答える）
  var WEIGHT = { axis: 50, dist: 1.5, crisis: 30, keep: 12 };

  function part(k, label, v) { return { k: k, label: label, v: r1(v) }; }
  function total(parts) { var s = 0; parts.forEach(function (p) { s += p.v; }); return r1(s); }

  function crisisOf(ctx) {
    if (ctx.player && ctx.player.down) return { on: true, why: '見習いがへとへと' };
    for (var i = 0; i < (ctx.allies || []).length; i++) {
      var a = ctx.allies[i];
      if (a.down && a.threat) return { on: true, why: a.name + 'にからくりが近い' };
      if (a.down && a.patience < 0.35) return { on: true, why: a.name + 'が待ちくたびれている' };
    }
    if (ctx.escort && ctx.escort.threat) return { on: true, why: '護衛役にからくりが近い' };
    return { on: false, why: '' };
  }
  function anyDown(ctx) { if (ctx.player && ctx.player.down) return true; for (var i = 0; i < (ctx.allies || []).length; i++) if (ctx.allies[i].down) return true; return false; }
  function nearestEnemy(ctx, pt, maxD) {
    var best = null, bd = maxD == null ? 1e9 : maxD;
    (ctx.enemies || []).forEach(function (e) { var d = dist(e, pt); if (d < bd) { bd = d; best = e; } });
    return best;
  }
  function entityById(ctx, id) {
    if (!id) return null;
    if (id === 'player') return ctx.player;
    if (id === 'partner') return ctx.me;
    if (ctx.escort && ctx.escort.id === id) return ctx.escort;
    for (var i = 0; i < (ctx.allies || []).length; i++) if (ctx.allies[i].id === id) return ctx.allies[i];
    return null;
  }
  function pathOf(ctx, x, y) {
    if (ctx.path) return ctx.path(x, y);
    return { dist: Math.hypot(x - ctx.me.x, y - ctx.me.y), danger: 0, blocked: false };
  }

  function candidates(ctx, pol) {
    var ax = pol.axes, S = ax.support / 100, E = ax.explore / 100, C = ax.caution / 100;
    var rules = pol.rules, out = [], excluded = [];
    var crisis = crisisOf(ctx), downNow = anyDown(ctx);
    var safety = has(rules, 'safety_first');
    var closeRule = has(rules, 'stay_close');
    function tooFar(x, y) { return closeRule && ctx.player && !ctx.player.down && Math.hypot(x - ctx.player.x, y - ctx.player.y) > 5; }

    // 追従
    var ft = ctx.player, fname = '見習い';
    if (has(rules, 'guard_escort') && ctx.escort) { ft = ctx.escort; fname = ctx.escort.name; }
    if (ft) {
      var fd = dist(ctx.me, ft), fp = [part('base', 'ふだんは' + fname + 'についていく', 20)];
      if (fd > 2.5) fp.push(part('far', 'はなれている（' + r1(fd) + 'マス）', Math.min(45, (fd - 2.5) * 6)));
      if (closeRule) fp.push(part('rule:stay_close', '作戦「そばにいる」', 25));
      if (has(rules, 'guard_escort') && ctx.escort) fp.push(part('rule:guard_escort', '作戦「護衛を守る」', 20));
      out.push({ act: 'follow', target: ft === ctx.player ? 'player' : ft.id, targetName: fname, parts: fp });
    }

    // 攻撃
    (ctx.enemies || []).forEach(function (e) {
      var dMe = dist(ctx.me, e), dPl = ctx.player ? dist(ctx.player, e) : 99;
      var tgt = entityById(ctx, e.target), protecting = !!(tgt && tgt !== ctx.me && dist(e, tgt) < 2.5);
      if (dMe > 7 && dPl > 5 && !protecting) return;
      if (tooFar(e.x, e.y)) { excluded.push({ act: 'attack', target: e.id, targetName: e.name, rule: 'stay_close', why: '見習いから遠い' }); return; }
      var pth = pathOf(ctx, e.x, e.y);
      if (pth.blocked) { excluded.push({ act: 'attack', target: e.id, targetName: e.name, rule: safety ? 'safety_first' : null, why: '近づけない' }); return; }
      var p = [part('base', e.name + 'が近い', 25)];
      if (protecting) {
        p.push(part('protect', (tgt === ctx.player ? '見習い' : tgt.name) + 'がねらわれている', 25));
        p.push(part('support', '支援優先' + ax.support, S * 20));
      }
      if (dMe < 3) p.push(part('near', 'すぐそば', 10));
      p.push(part('bold', '慎重さ' + ax.caution + '（向かっていく気持ち）', (1 - C) * 15));
      if (e.strong) p.push(part('strong', '手ごわい相手', -C * 30));
      if (ctx.me.hp < 40) p.push(part('lowhp', '体力が少ない', -C * 25));
      if (has(rules, 'attack_first')) p.push(part('rule:attack_first', '作戦「敵を先に」', 30));
      if (has(rules, 'guard_escort') && ctx.escort && e.target === ctx.escort.id) p.push(part('rule:guard_escort', '作戦「護衛を守る」', 40));
      p.push(part('dist', 'きょり' + r1(pth.dist), -WEIGHT.dist * pth.dist));
      out.push({ act: 'attack', target: e.id, targetName: e.name, parts: p });
    });

    // 救助（見習い・へとへとの仲間）
    var downs = [];
    if (ctx.player && ctx.player.down) downs.push({ ent: ctx.player, id: 'player', name: '見習い', urg: 85, isPlayer: true });
    (ctx.allies || []).forEach(function (a) { if (a.down) downs.push({ ent: a, id: a.id, name: a.name, urg: 40, a: a }); });
    downs.forEach(function (dn) {
      var ent = dn.ent;
      if (!dn.isPlayer && tooFar(ent.x, ent.y)) { excluded.push({ act: 'rescue', target: dn.id, targetName: dn.name, rule: 'stay_close', why: '見習いから遠い' }); return; }
      var pth = pathOf(ctx, ent.x, ent.y);
      if (pth.blocked || (safety && pth.danger > 0)) { excluded.push({ act: 'rescue', target: dn.id, targetName: dn.name, rule: safety ? 'safety_first' : null, why: pth.blocked ? '近づけない' : 'まきびしや煙の中' }); return; }
      var p = [part('urg', dn.isPlayer ? '見習いがへとへと' : dn.name + 'がへとへと', dn.urg)];
      if (dn.a && dn.a.threat) p.push(part('threat', 'からくりが近い', 25));
      if (dn.a && dn.a.patience < 1) p.push(part('wait', '待ちくたびれてきた', 20 * (1 - dn.a.patience)));
      p.push(part('support', '支援優先' + ax.support, S * WEIGHT.axis));
      if (pth.danger > 0) p.push(part('danger', '危ない道（慎重さ' + ax.caution + '）', -C * 60 * pth.danger));
      if (has(rules, 'ally_first')) p.push(part('rule:ally_first', '作戦「仲間を優先」', 40));
      p.push(part('dist', 'きょり' + r1(pth.dist), -WEIGHT.dist * pth.dist));
      out.push({ act: 'rescue', target: dn.id, targetName: dn.name, parts: p });
    });

    // 調査（宝箱・草むら）
    (ctx.spots || []).forEach(function (s) {
      if (s.opened) return;
      if (dist(ctx.me, s) > 9) return;
      var nm = s.kind === 'chest' ? '宝箱' : '草むら';
      if (tooFar(s.x, s.y)) { excluded.push({ act: 'search', target: s.id, targetName: nm, rule: 'stay_close', why: '見習いから遠い' }); return; }
      var pth = pathOf(ctx, s.x, s.y);
      if (pth.blocked || (safety && pth.danger > 0)) { excluded.push({ act: 'search', target: s.id, targetName: nm, rule: safety ? 'safety_first' : null, why: pth.blocked ? '近づけない' : 'まきびしや煙の中' }); return; }
      var val = s.value != null ? s.value : (s.kind === 'chest' ? 40 : 30);
      if (s.kind !== 'chest' && ctx.kind === 'explore') val += 15;
      var p = [part('value', nm + 'が気になる', val)];
      p.push(part('explore', '探索優先' + ax.explore, E * WEIGHT.axis));
      if (crisis.on) p.push(part('crisis', crisis.why, -WEIGHT.crisis));
      if (pth.danger > 0) p.push(part('danger', '危ない場所（慎重さ' + ax.caution + '）', -C * 60 * pth.danger));
      if (has(rules, 'explore_first') && !nearestEnemy(ctx, ctx.me, 5)) p.push(part('rule:explore_first', '作戦「探索を優先」', 30));
      if (has(rules, 'ally_first') && downNow) p.push(part('rule:ally_first', '作戦「仲間を優先」（仲間が先）', -20));
      p.push(part('dist', 'きょり' + r1(pth.dist), -WEIGHT.dist * pth.dist));
      out.push({ act: 'search', target: s.id, targetName: nm, parts: p });
    });

    // 退避
    var rp = [];
    if (ctx.dangerHere > 0) rp.push(part('hazard', '危ない床の上', ctx.dangerHere * 80 * (0.4 + C)));
    if (ctx.inTelegraph) rp.push(part('tele', '大技が来る', 70 * (0.3 + C)));
    if (ctx.me.hp < 35) rp.push(part('lowhp', '体力が少ない（' + Math.round(ctx.me.hp) + '）', 45 * (0.5 + C)));
    var nearCnt = (ctx.enemies || []).filter(function (e) { return dist(e, ctx.me) < 3; }).length;
    if (nearCnt >= 2 && ctx.me.hp < 60) rp.push(part('crowd', 'からくりに囲まれそう', 15 * C));
    if (safety && ctx.me.hp < 50) rp.push(part('rule:safety_first', '作戦「安全を優先」', 20));
    if (rp.length) { rp.push(part('caution', '慎重さ' + ax.caution, 0)); out.push({ act: 'retreat', target: null, targetName: '', parts: rp }); }

    out.forEach(function (c) { c.score = total(c.parts); });
    out.sort(function (a, b) { return b.score - a.score || order(a) - order(b); });
    return { list: out, excluded: excluded };
  }
  // 同点のときの並び（再現できるよう決めておく）
  var ACT_ORDER = { rescue: 0, attack: 1, search: 2, retreat: 3, follow: 4 };
  function order(c) { return ACT_ORDER[c.act] * 1000 + (String(c.target || '').length); }

  // 判断する。prev は直前の判断（行ったり来たりを防ぐ）
  function decide(ctx, pol, prev) {
    if (ctx.me.down) return { act: 'down', target: null, score: 0, cands: [], excluded: [], forced: 'down', reason: { text: 'へとへとで動けない' } };
    var cs = candidates(ctx, pol);
    var list = cs.list, chosen = null, forced = null;
    // 優先ルール1：見習いの直接指示
    if (ctx.command === 'gather') { chosen = find(list, 'follow', 'player') || { act: 'follow', target: 'player', targetName: '見習い', parts: [], score: 0 }; forced = 'gather'; }
    else if (ctx.command === 'back') { chosen = find(list, 'retreat') || { act: 'retreat', target: null, targetName: '', parts: [], score: 0 }; forced = 'back'; }
    else if (ctx.command === 'help') {
      if (ctx.player && ctx.player.down) chosen = find(list, 'rescue', 'player');
      if (!chosen) {
        var ne = nearestEnemy(ctx, ctx.player, 6);
        if (ne) chosen = find(list, 'attack', ne.id);
      }
      if (!chosen) chosen = find(list, 'follow', 'player') || { act: 'follow', target: 'player', targetName: '見習い', parts: [], score: 0 };
      forced = 'help';
    }
    // 優先ルール2：体力がのこりわずかで危ない
    else if (ctx.me.hp <= 15 && (ctx.dangerHere > 0 || ctx.inTelegraph || nearestEnemy(ctx, ctx.me, 3))) {
      chosen = find(list, 'retreat') || { act: 'retreat', target: null, targetName: '', parts: [], score: 0 }; forced = 'emergency';
    }
    var kept = false;
    if (!chosen) {
      chosen = list[0];
      // 前の行動が今もできて、差が小さければ続ける
      if (prev && prev.act && !prev.forced && prev.act !== 'down') {
        var pc = find(list, prev.act, prev.target);
        if (pc && pc !== chosen && chosen.score - pc.score < WEIGHT.keep) { chosen = pc; kept = true; }
      }
    }
    var res = { act: chosen.act, target: chosen.target, targetName: chosen.targetName, score: chosen.score, parts: chosen.parts, cands: list, excluded: cs.excluded, forced: forced, kept: kept, policyVersion: pol.version };
    res.reason = explain(res, pol);
    return res;
  }
  function find(list, act, target) {
    for (var i = 0; i < list.length; i++) if (list[i].act === act && (target === undefined || list[i].target === target)) return list[i];
    return null;
  }

  /* ================= 理由の文章（実際の点数と作戦だけから作る） ================= */
  var CMD_NAME = { gather: '集合', help: '助けて', back: '下がって' };
  function actPhrase(act, name) {
    switch (act) {
      case 'rescue': return name + 'を助け起こす';
      case 'search': return name + 'を調べる';
      case 'attack': return name + 'を止める';
      case 'retreat': return '下がる';
      case 'follow': return name + 'についていく';
      default: return '休む';
    }
  }
  function runnerUp(d) {
    for (var i = 0; i < d.cands.length; i++) { var c = d.cands[i]; if (c.act !== d.act || c.target !== d.target) return c; }
    return null;
  }
  // 候補から「ルールが決め手だったか」を調べる：ルールの点を抜くと2番手に負けるなら、ルールが決め手
  function decisiveRule(chosen, runner) {
    if (!chosen || !runner || !chosen.parts) return null;
    var best = null;
    chosen.parts.forEach(function (p) {
      if (p.k.indexOf('rule:') !== 0 || p.v <= 0) return;
      var without = chosen.score - p.v;
      var runnerRule = 0;
      runner.parts.forEach(function (q) { if (q.k === p.k) runnerRule += q.v; });
      if (without < runner.score - runnerRule) best = p.k.slice(5);
    });
    return best;
  }
  function topParts(c, n, sign) {
    if (!c || !c.parts) return [];
    return c.parts.filter(function (p) { return sign > 0 ? p.v > 0 : p.v < 0; }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).slice(0, n);
  }
  // 点数の部品を「決め手の種類」にまとめる
  var THEME = { support: 'axis', explore: 'axis', bold: 'axis', caution: 'axis', dist: 'dist', far: 'dist', near: 'dist', danger: 'danger', crisis: 'crisis' };
  function themeOf(k) { return k.indexOf('rule:') === 0 ? 'rule' : (THEME[k] || 'base'); }
  function sumTheme(c) {
    var o = { axis: 0, dist: 0, base: 0, rule: 0, danger: 0, crisis: 0 };
    if (c && c.parts) c.parts.forEach(function (p) { o[themeOf(p.k)] += p.v; });
    return o;
  }
  function axisPart(c) { if (!c || !c.parts) return null; for (var i = 0; i < c.parts.length; i++) if (themeOf(c.parts[i].k) === 'axis') return c.parts[i]; return null; }
  function rulePart(c) { if (!c || !c.parts) return null; var best = null; c.parts.forEach(function (p) { if (themeOf(p.k) === 'rule' && p.v > 0 && (!best || p.v > best.v)) best = p; }); return best; }
  function basePart(c) { if (!c || !c.parts) return null; var best = null; c.parts.forEach(function (p) { if (themeOf(p.k) === 'base' && p.v > 0 && (!best || p.v > best.v)) best = p; }); return best; }
  // 「〜から」につなげるとき、名詞で終わる理由には「だ」をつける
  function pred(label) {
    var core = String(label).replace(/（[^）]*）$/, '');
    return /[うくぐすつぬぶむるいただ]$/.test(core) ? label : core + 'だ' + label.slice(core.length);
  }
  function themeText(th, c, ru) {
    var ca = axisPart(c), ra = axisPart(ru);
    switch (th) {
      case 'axis':
        if (ca && ra && ca.label !== ra.label) return ca.label.replace(/(\d+)/, '（$1）') + 'のほうが、' + ra.label.replace(/(\d+)/, '（$1）') + 'より強い';
        if (ca) return ca.label.replace(/(\d+)/, '（$1）') + 'がきいた';
        return ra ? ra.label.replace(/(\d+)/, '（$1）') + 'が低め' : '方針に合っていた';
      case 'dist': return c.targetName ? (c.targetName + 'のほうが近かった') : '近かった';
      case 'rule': var rp = rulePart(c); return rp ? rp.label + 'がある' : (ru && rulePart(ru) ? rulePart(ru).label + 'の点が足りなかった' : '作戦に合っていた');
      case 'danger': return actPhrase(ru.act, ru.targetName) + 'には、危ない道を通る必要があった';
      case 'crisis':
        var cp = null; (ru.parts || []).forEach(function (p) { if (p.k === 'crisis') cp = p; });
        return (cp ? cp.label : '仲間が危ない') + 'ので、調べるのは後にした';
      default:
        if (ru.act === 'rescue' && c.act !== 'rescue' && !ru.parts.some(function (p) { return p.k === 'threat' || p.k === 'wait'; })) {
          var up = ru.parts[0]; return ru.targetName + 'はまだ待てそうだった（緊急度' + (up ? Math.round(up.v) : 0) + '）';
        }
        var bp = basePart(c); return bp ? pred(bp.label) : '今の場面に合っていた';
    }
  }
  function explain(d, pol) {
    var r = { text: '', rule: null, forced: d.forced || null, excludedRules: [], vs: null, themes: [] };
    var phrase = actPhrase(d.act, d.targetName);
    if (d.forced === 'gather' || d.forced === 'help' || d.forced === 'back') {
      r.text = '見習いの「' + CMD_NAME[d.forced] + '」の指示を優先して、' + phrase + '。';
      return r;
    }
    if (d.forced === 'emergency') { r.text = '体力がのこりわずかなので、いったん下がる。'; return r; }
    var ru = runnerUp(d);
    d.excluded.forEach(function (x) { if (x.rule && !has(r.excludedRules, x.rule)) r.excludedRules.push(x.rule); });
    var exclText = '';
    var exSafety = d.excluded.filter(function (x) { return x.rule === 'safety_first'; });
    var exClose = d.excluded.filter(function (x) { return x.rule === 'stay_close'; });
    if (exSafety.length) exclText += '作戦「安全を優先」があるので、' + exSafety.map(function (x) { return x.why === '近づけない' ? x.targetName : x.why + 'の' + x.targetName; }).slice(0, 2).join('・') + 'には近づかなかった。';
    if (exClose.length) exclText += '作戦「そばにいる」があるので、' + exClose.map(function (x) { return x.targetName; }).slice(0, 2).join('・') + 'には行かなかった。';
    var rule = decisiveRule(d, ru);
    r.rule = rule;
    if (!ru) {
      var bp = basePart(d);
      r.text = phrase + 'ことにした' + (bp ? '（' + bp.label + '）' : '') + '。';
    } else if (rule) {
      r.text = '作戦「' + ruleName(rule) + '」があるので、' + actPhrase(ru.act, ru.targetName) + 'より先に、' + phrase + 'ことにした。';
      r.vs = { act: ru.act, target: ru.target, targetName: ru.targetName, score: ru.score };
    } else {
      // 1番と2番の差を、決め手の種類ごとに比べる（実際の点数の差だけを使う）
      var a = sumTheme(d), b = sumTheme(ru), diffs = [];
      Object.keys(a).forEach(function (k) { var df = r1(a[k] - b[k]); if (df > 0) diffs.push({ th: k, v: df }); });
      diffs.sort(function (x, y) { return y.v - x.v; });
      var tot = r1(d.score - ru.score), use = diffs.slice(0, 2).filter(function (x, i) { return i === 0 || x.v >= Math.max(3, tot * 0.35); });
      r.themes = use.map(function (x) { return x.th; });
      var why = use.map(function (x) { return themeText(x.th, d, ru); }).join('し、');
      r.text = phrase + 'ことにした。' + actPhrase(ru.act, ru.targetName) + 'より先なのは、' + (why || '点数が少し高かった') + 'から。';
      r.vs = { act: ru.act, target: ru.target, targetName: ru.targetName, score: ru.score };
    }
    if (d.kept) r.text += '（今の行動を続けたほうがよいと考えた）';
    r.text += exclText;
    return r;
  }

  /* ================= 振り返り（代表的な判断を最大2件） ================= */
  // 判断場面で記録した LessonEvent から、見せる価値の高いものを選ぶ
  function interest(ev, key) {
    var s = 0, c = ev.chosen;
    if (!c) return -1;
    var keyAct = key === 'protect' ? 'attack' : key;
    if (keyAct && c.act !== keyAct && ev.cands.some(function (x) { return x.act === keyAct; })) s += 50;
    var ru = null;
    for (var i = 0; i < ev.cands.length; i++) if (ev.cands[i].act !== c.act || ev.cands[i].target !== c.target) { ru = ev.cands[i]; break; }
    if (ru) s += 30 * Math.max(0, 1 - (c.score - ru.score) / 40);
    if (ev.outcome && ev.outcome.partnerDown) s += 40;
    if (ev.outcome && ev.outcome.gaveUp) s += 40;
    if (ev.reason && (ev.reason.rule || (ev.reason.excludedRules || []).length)) s += 20;
    if (ev.forced) s -= 60;
    return s;
  }
  function pickRepresentative(events, key) {
    var scene = events.filter(function (e) { return e.sceneDecision && e.chosen && !e.forced; });
    var scored = scene.map(function (e) { return { e: e, s: interest(e, key) }; }).sort(function (a, b) { return b.s - a.s || a.e.t - b.e.t; });
    var out = [], zones = {};
    scored.forEach(function (x) { if (out.length < 2 && !zones[x.e.zone]) { zones[x.e.zone] = 1; out.push(x.e); } });
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  var ACT_TEACH = { rescue: 'next_rescue', search: 'next_search', attack: 'next_attack', follow: 'next_follow', retreat: 'safety' };
  // 1件の判断に出す3つの選択肢：この行動を続ける／次は（2番手の行動）／安全を優先
  function teachOptions(ev, unlockedRules) {
    var c = ev.chosen, opts = [];
    opts.push({ id: 'keep', label: D.TEACH.keep.label, changes: copy(D.KEEP_CHANGES[c.act] || {}), rule: null, praise: true });
    var alt = null;
    for (var i = 0; i < ev.cands.length; i++) { var x = ev.cands[i]; if (x.act !== c.act && ACT_TEACH[x.act] && ACT_TEACH[x.act] !== 'safety') { alt = x.act; break; } }
    if (!alt) alt = c.act === 'rescue' ? 'search' : (c.act === 'follow' ? 'rescue' : 'rescue');
    if (alt === c.act) alt = c.act === 'rescue' ? 'search' : 'rescue';
    var tid = ACT_TEACH[alt];
    var t = D.TEACH[tid];
    opts.push({ id: tid, label: t.label, changes: copy(t.changes), rule: t.rule && has(unlockedRules || [], t.rule) ? t.rule : null, ruleLocked: t.rule && !has(unlockedRules || [], t.rule) ? t.rule : null });
    if (c.act !== 'retreat') {
      var sf = D.TEACH.safety;
      opts.push({ id: 'safety', label: sf.label, changes: copy(sf.changes), rule: has(unlockedRules || [], 'safety_first') ? 'safety_first' : null, ruleLocked: has(unlockedRules || [], 'safety_first') ? null : 'safety_first' });
    } else {
      var nf = D.TEACH.next_follow;
      opts.push({ id: 'next_follow', label: nf.label, changes: copy(nf.changes), rule: has(unlockedRules || [], 'stay_close') ? 'stay_close' : null });
    }
    return opts;
  }
  // picks: [{option, withRule, replaceRule}]。各軸の合計は ±10 まで（1回の指導）
  function previewTeaching(p, picks) {
    var sum = {}; AXIS_IDS.forEach(function (k) { sum[k] = 0; });
    var capped = false, rulesAdd = [], rulesRemove = [], praise = 0;
    (picks || []).forEach(function (pk) {
      var o = pk.option; if (!o) return;
      if (o.praise) praise++;
      AXIS_IDS.forEach(function (k) {
        var v = (o.changes || {})[k] || 0;
        var nv = clamp(sum[k] + v, -BAL.teachCap, BAL.teachCap);
        if (nv !== sum[k] + v) capped = true;
        sum[k] = nv;
      });
      if (pk.withRule && o.rule && !has(p.rules, o.rule) && !has(rulesAdd, o.rule)) {
        rulesAdd.push(o.rule);
        if (pk.replaceRule) rulesRemove.push(pk.replaceRule);
      }
    });
    // 作戦の枠（3つまで）
    var after = p.rules.filter(function (r) { return !has(rulesRemove, r); });
    var full = [];
    rulesAdd = rulesAdd.filter(function (r) { if (after.length >= BAL.maxRules) { full.push(r); return false; } after.push(r); return true; });
    var axes = {}; AXIS_IDS.forEach(function (k) { axes[k] = clamp(p.axes[k] + sum[k], 0, 100); });
    return { changes: sum, capped: capped, rulesAdd: rulesAdd, rulesRemove: rulesRemove, rulesFull: full, before: snapshot(p), after: { axes: axes, rules: after }, praise: praise };
  }
  function applyTeaching(p, picks, meta) {
    var pv = previewTeaching(p, picks);
    var q = applyChanges(p, pv.changes, pv.rulesAdd, pv.rulesRemove, meta);
    return { policy: q, preview: pv, changed: q.version !== p.version && (!sameAxes(p.axes, q.axes) || p.rules.join() !== q.rules.join()) };
  }

  /* ================= 最近の傾向カード ================= */
  function tendency(lessons, n) {
    var recent = (lessons || []).filter(function (e) { return e.sceneDecision && e.chosen && !e.forced; }).slice(-(n || 12));
    var cnt = { rescue: 0, search: 0, attack: 0, retreat: 0, follow: 0 };
    recent.forEach(function (e) { cnt[e.chosen.act] = (cnt[e.chosen.act] || 0) + 1; });
    var total2 = recent.length, cards = [];
    if (!total2) return { cards: [{ id: 'new', text: 'まだ修行の記録がありません' }], counts: cnt, n: 0 };
    var labels = { rescue: '救助が得意', search: '探索をよく選ぶ', attack: 'からくりに向かっていく', retreat: '危ないとよく下がる', follow: '見習いのそばにいることが多い' };
    Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).forEach(function (k) {
      if (cnt[k] > 0 && cards.length < 2 && cnt[k] / total2 >= 0.3) cards.push({ id: k, text: labels[k], rate: Math.round(cnt[k] / total2 * 100) });
    });
    if (!cards.length) cards.push({ id: 'mix', text: 'いろいろな行動をためしている' });
    return { cards: cards, counts: cnt, n: total2 };
  }

  /* ================= 言葉で教える（試験機能） ================= */
  var NG_WORDS = ['死', '殺', 'ころす', 'しね', 'ばか', 'バカ', 'あほ', 'アホ', 'うざ', 'きもい', 'ブス', 'くず', 'クズ', 'だまれ'];
  var IMPOSSIBLE = ['一撃', 'いちげき', '無敵', 'むてき', '最強', 'さいきょう', '全部倒', 'ぜんぶ倒', 'ぜんぶたお', '空を飛', 'そらをと', 'ワープ', '瞬間移動', 'レベルを上げ', 'レベルあげ', '体力を増', '体力をふや', 'お金', '札をふや', '札を増', '絶対に勝', 'ぜったいに勝', '死なない', '強くして', 'つよくして', 'スピードを上げ', '速くして', 'はやくして'];
  var KW = {
    prioritize_rescue: ['助け', 'たすけ', '救助', 'きゅうじょ', '仲間', 'なかま', '味方', 'みかた', '倒れ', 'たおれ', 'へとへと', '起こし', 'おこし', 'こまって', '困って', 'けが', 'ひとを先', '人を先'],
    prioritize_search: ['宝箱', 'たからばこ', '宝', 'たから', '調べ', 'しらべ', '探索', 'たんさく', '探し', 'さがし', '探して', '草むら', 'くさむら', '巻物', 'まきもの', '寄り道', 'よりみち', 'あける', '開け'],
    be_careful: ['慎重', 'しんちょう', '安全', 'あんぜん', '危な', 'あぶな', 'まきびし', '煙', 'けむり', 'ゆっくり', '気をつけ', 'きをつけ', '無理しない', 'むりしない', '無理をしない', '下がって', 'さがって', 'よけ', 'ケガしない', '戦わない', 'たたかわない', '攻撃しない', 'こうげきしない'],
    be_bold: ['攻撃', 'こうげき', 'からくりを先', '敵を先', 'てきを先', '止めて', 'とめて', 'やっつけ', '戦っ', 'たたかっ', '突っこ', 'つっこ', 'どんどん', '強気', 'せめて', '攻めて', '下がらない', 'さがらない'],
    stay_close: ['そば', '近く', 'ちかく', 'はなれない', '離れない', 'ついてきて', 'ついて来', 'いっしょに', '一緒に', 'となり'],
    guard_escort: ['護衛', 'ごえい', '守って', 'まもって', '送って', 'おくって', '届けて', 'とどけて', '運ぶ人', 'はこぶ人'],
    keep_going: ['そのまま', 'いいね', 'よかった', 'えらい', 'すごい', '続けて', 'つづけて', 'ばっちり', 'その調子', 'そのちょうし', 'かんぺき', '完璧']
  };
  // 言葉のすぐあとに否定があれば、その意図を打ち消す（「宝箱は後で」「助けなくていい」）
  var NEG = ['ないで', 'なくて', 'やめて', 'いらない', 'は後', 'はあと', 'あとで', '後で', 'しない', 'だめ', 'ダメ'];
  var NEG_SCOPE = { prioritize_rescue: 1, prioritize_search: 1, be_bold: 1, keep_going: 1 };
  function normalize(s) {
    s = String(s || '');
    if (s.normalize) s = s.normalize('NFKC');
    return s.replace(/[\s　]+/g, '').replace(/[。．、，！!？?]+$/g, '');
  }
  function scoreKw(s, intent) {
    var n = 0, list = KW[intent];
    list.forEach(function (w) {
      var from = 0, at;
      while ((at = s.indexOf(w, from)) >= 0) {
        from = at + w.length;
        // 長い言葉の一部として数えない（「宝箱」と「宝」の重なりは1つ）
        var covered = list.some(function (w2) { return w2 !== w && w2.length > w.length && w2.indexOf(w) >= 0 && s.indexOf(w2) >= 0 && s.indexOf(w2) <= at && s.indexOf(w2) + w2.length >= at + w.length; });
        if (covered) continue;
        var after = s.slice(at + w.length, at + w.length + 6);
        var neg = NEG_SCOPE[intent] && NEG.some(function (ng) { return after.indexOf(ng) >= 0; });
        n += neg ? -1 : 1;
      }
    });
    return n;
  }
  // ルールだけで意図を取り出す（端末の中だけで動く。送信しない）
  function parseWords(text, opt) {
    opt = opt || {};
    var raw = String(text == null ? '' : text);
    var s = normalize(raw);
    if (!s) return { ok: false, code: 'empty', message: '教えたいことを短く書いてね。' };
    if (s.length > 40) return { ok: false, code: 'long', message: '40文字までで書いてね。' };
    if (s.replace(/[^0-9]/g, '').length >= 7 || /@|http|www\.|\.com|\.jp/i.test(s)) return { ok: false, code: 'personal', message: '電話番号やメール・URLなどは書かないでね。' };
    for (var i = 0; i < NG_WORDS.length; i++) if (s.indexOf(NG_WORDS[i]) >= 0) return { ok: false, code: 'rude', message: '相棒には、やさしい言葉で教えてね。' };
    for (i = 0; i < IMPOSSIBLE.length; i++) if (s.indexOf(IMPOSSIBLE[i]) >= 0) {
      return { ok: false, code: 'impossible', message: '相棒の力そのものは変えられないよ。かわりに、この作戦はどう？', choices: ['be_bold', 'be_careful', 'stay_close'] };
    }
    var score = {};
    Object.keys(KW).forEach(function (k) { score[k] = 0; });
    var parts = s.split('より');
    if (parts.length === 2) {
      // 「AよりB」→ B を先に
      Object.keys(KW).forEach(function (k) { score[k] += 2 * scoreKw(parts[1], k) - Math.max(0, scoreKw(parts[0], k)); });
    } else {
      Object.keys(KW).forEach(function (k) { score[k] += scoreKw(s, k); });
    }
    // 「攻撃しないで」などは慎重に
    if (score.be_bold < 0) score.be_careful += 1;
    var keys = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
    var top = keys[0], second = keys[1];
    if (score[top] <= 0 || score[top] === score[second]) {
      return { ok: false, code: 'ambiguous', message: 'どういう作戦か、えらんでね。', choices: ['prioritize_rescue', 'be_careful', 'prioritize_search'] };
    }
    return proposal(top, 'local', opt.unlockedRules);
  }
  function proposal(intent, source, unlockedRules) {
    var it = D.INTENTS[intent];
    if (!it) return { ok: false, code: 'unknown', message: 'その作戦はまだ使えないよ。' };
    var rule = it.rule && (!unlockedRules || has(unlockedRules, it.rule)) ? it.rule : null;
    return { ok: true, intent: intent, changes: copy(it.changes), rule: rule, ruleLocked: it.rule && !rule ? it.rule : null, explanation: it.label, source: source };
  }
  // AI などから来た変更案を検査する（許可された意図・範囲・作戦・文面と変更の一致）
  var INTENT_SIGN = {
    prioritize_rescue: { support: 1, explore: -1 }, prioritize_search: { explore: 1, support: -1 }, be_careful: { caution: 1 }, be_bold: { caution: -1 },
    stay_close: { explore: -1, caution: 1 }, guard_escort: { support: 1 }, keep_going: {}
  };
  function validateProposal(p, unlockedRules) {
    var errs = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['形がちがう'] };
    if (!D.INTENTS[p.intent]) errs.push('許可されていない意図');
    var ch = p.changes || {};
    Object.keys(ch).forEach(function (k) {
      if (!has(AXIS_IDS, k)) errs.push('知らない軸 ' + k);
      else if (typeof ch[k] !== 'number' || !isFinite(ch[k]) || Math.abs(ch[k]) > BAL.teachCap) errs.push(k + ' の変化が大きすぎる');
    });
    var sign = INTENT_SIGN[p.intent] || {};
    Object.keys(ch).forEach(function (k) { if (sign[k] && ch[k] * sign[k] < 0) errs.push(k + ' の向きが意図と合わない'); });
    if (p.intent && D.INTENTS[p.intent] && D.INTENTS[p.intent].label && p.explanation && p.explanation !== D.INTENTS[p.intent].label) {
      // 文面は定型に置きかえる（AIの言い回しをそのまま保存しない）
      p.explanation = D.INTENTS[p.intent].label;
    }
    if (p.rule != null) {
      if (!D.RULES[p.rule]) errs.push('知らない作戦');
      else if (unlockedRules && !has(unlockedRules, p.rule)) errs.push('まだ使えない作戦');
      else if (D.INTENTS[p.intent] && D.INTENTS[p.intent].rule !== p.rule) errs.push('作戦が意図と合わない');
    }
    return { ok: errs.length === 0, errors: errs };
  }

  /* ================= 日記（承認済みの出来事だけ） ================= */
  // events: 修行で実際に起きた出来事 [{id,type,who,name,...}]
  function diaryFor(result, companion, voice) {
    var I = (voice && voice.I) || 'ぼく';
    var ev = result.events || [], lines = [], ids = [];
    function add(e, txt) { lines.push(txt); ids.push(e.id); }
    var master = result.masterName || '師匠';
    var first = ev.filter(function (e) { return e.type === 'rescue' && e.who === 'partner'; })[0];
    var mine = ev.filter(function (e) { return e.type === 'rescue' && e.who === 'player'; })[0];
    var saved = ev.filter(function (e) { return e.type === 'revive' && e.who === 'player'; })[0];
    var savedMe = ev.filter(function (e) { return e.type === 'revive' && e.who === 'partner'; })[0];
    var scroll = ev.filter(function (e) { return e.type === 'scroll' && e.who === 'partner'; })[0];
    var chest = ev.filter(function (e) { return e.type === 'chest' && e.who === 'partner'; })[0];
    var boss = ev.filter(function (e) { return e.type === 'boss'; })[0];
    var arrive = ev.filter(function (e) { return e.type === 'arrive'; })[0];
    var teach = ev.filter(function (e) { return e.type === 'teach'; })[0];
    var gave = ev.filter(function (e) { return e.type === 'gaveup'; })[0];
    lines.push('今日は' + (result.kindName || '修行') + '。' + master + 'の課題だった。');
    if (first) add(first, first.name + 'さんを、' + I + 'が助け起こした。');
    if (mine) add(mine, first ? mine.name + 'さんは、見習いが助けてくれた。' : mine.name + 'さんを、見習いが助け起こした。');
    if (scroll) add(scroll, I + 'が草むらで巻物を見つけた！');
    else if (chest) add(chest, I + 'が宝箱を開けた。');
    if (saved) add(saved, 'へとへとになった' + I + 'を、見習いが助けてくれた。ありがとう。');
    if (savedMe) add(savedMe, 'へとへとの見習いを、' + I + 'が助け起こした。');
    if (gave) add(gave, gave.name + 'さんを待たせすぎてしまった。次は早く行きたい。');
    if (arrive) add(arrive, arrive.name + 'さんを門まで送りとどけた。');
    if (boss) add(boss, 'さいごに' + boss.name + 'を、ふたりで止めた。');
    if (teach) add(teach, '見習いに「' + teach.label + '」と教わった。');
    if (lines.length === 1) lines.push(result.success ? '見習いといっしょに、最後までがんばった。' : 'うまくいかなかったけど、次の作戦を考えよう。');
    return { text: lines.slice(0, 5).join(''), eventIds: ids };
  }
  // AIの日記の検査：出来事IDが承認済みの文だけ残す
  function validateAiDiary(out, approvedIds) {
    if (!out || !Array.isArray(out.sentences)) return { ok: false, text: '', eventIds: [] };
    var keep = [], ids = [];
    out.sentences.forEach(function (s) {
      if (!s || typeof s.text !== 'string' || !s.event_id) return;
      if (!has(approvedIds, s.event_id)) return;
      var t = s.text.replace(/[<>]/g, '').slice(0, 60);
      for (var i = 0; i < NG_WORDS.length; i++) if (t.indexOf(NG_WORDS[i]) >= 0) return;
      keep.push(t); ids.push(s.event_id);
    });
    return { ok: keep.length > 0, text: keep.join(''), eventIds: ids };
  }

  /* ================= 経験・Lv・道場札・絆 ================= */
  function levelOf(exp) { var lv = 1; for (var i = 0; i < BAL.levels.length; i++) if (exp >= BAL.levels[i]) lv = i + 1; return Math.min(10, lv); }
  function nextLevelExp(exp) { var lv = levelOf(exp); return lv >= 10 ? null : BAL.levels[lv]; }
  function starsOf(r) { return (r.star1 ? 1 : 0) + (r.star1 && r.star2 ? 1 : 0) + (r.star1 && r.star3 ? 1 : 0); }
  function rewardsFor(r, kind) {
    var exp = kind === 'tutorial' ? BAL.exp.tutorial : (r.success ? BAL.exp.success : BAL.exp.fail);
    var st = r.success ? starsOf(r) : 0;
    var tokens = r.success ? BAL.tokens[Math.max(1, st)] : 0;
    return { exp: exp, tokens: tokens, stars: st };
  }

  /* ================= 保存（Companion・PolicyState・LessonEvent・MemorySummary・ChapterProgress・Entitlement） ================= */
  var SAVE_KEY = 'nad_save_v1', ENT_KEY = 'nad_ent_v1', BACKUP_KEY = 'nad_backup_v1';
  function newSave(now, deviceId) {
    return {
      v: 1, createdAt: now || 0, updatedAt: now || 0, rev: 0, deviceId: deviceId || ('d' + Math.floor(Math.random() * 1e9).toString(36)),
      companion: null,                                   // { name, voice, look, costume, weapon, pose, exp, bond }
      presets: { active: 'main', slots: [{ id: 'main', name: D.PRESET_TEMPLATES.main.name, policy: makePolicy(D.INITIAL_AXES, []) }] },
      rulesUnlocked: [],
      kindsUnlocked: [],
      lessons: [],                                       // LessonEvent（判断の記録）
      memory: { approved: [], summaries: [], diary: [] },// 承認済みの出来事と、その要約・日記
      chapters: { current: 'ch1', done: [], flags: {} }, // ChapterProgress
      trainings: 0, successes: 0, byKind: {}, tokens: 0,
      dojo: { wall: null, floor: null, deco: null },
      photos: [],
      settings: { practice: false, advanced: false, aiEndpoint: '', words: true },
      usage: { day: '', words: 0, diary: 0 },
      metrics: []
    };
  }
  function newEntitlements() { return { owned: [], updatedAt: 0 }; }
  function activeSlot(save) { var id = save.presets.active; for (var i = 0; i < save.presets.slots.length; i++) if (save.presets.slots[i].id === id) return save.presets.slots[i]; return save.presets.slots[0]; }
  function unlockSlot(save, tpl) {
    if (save.presets.slots.length >= BAL.maxSlots) return false;
    if (save.presets.slots.some(function (s) { return s.id === tpl; })) return false;
    var t = D.PRESET_TEMPLATES[tpl];
    save.presets.slots.push({ id: tpl, name: t.name, policy: makePolicy(t.axes, t.rules.filter(function (r) { return has(save.rulesUnlocked, r); })) });
    return true;
  }
  function migrate(s) {
    if (!s || typeof s !== 'object' || s.v !== 1) return null;
    var base = newSave(s.createdAt, s.deviceId);
    Object.keys(base).forEach(function (k) { if (s[k] === undefined) s[k] = base[k]; });
    if (!s.settings) s.settings = base.settings;
    Object.keys(base.settings).forEach(function (k) { if (s.settings[k] === undefined) s.settings[k] = base.settings[k]; });
    if (!s.presets || !s.presets.slots || !s.presets.slots.length) s.presets = base.presets;
    return s;
  }
  // 引き継ぎコード（端末の中だけ。外に送らない）
  function b64encode(str) {
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
    return Buffer.from(str, 'utf8').toString('base64');
  }
  function b64decode(b) {
    if (typeof atob === 'function') return decodeURIComponent(escape(atob(b)));
    return Buffer.from(b, 'base64').toString('utf8');
  }
  function exportCode(save, ent) {
    var body = JSON.stringify({ s: save, e: ent });
    return 'NAD1.' + b64encode(body) + '.' + (hashStr(body) % 1679616).toString(36);
  }
  function importCode(code) {
    try {
      var m = String(code || '').trim().split('.');
      if (m.length !== 3 || m[0] !== 'NAD1') return { ok: false, message: '引き継ぎコードの形がちがいます。' };
      var body = b64decode(m[1]);
      if ((hashStr(body) % 1679616).toString(36) !== m[2]) return { ok: false, message: 'コードの一部が欠けています。' };
      var o = JSON.parse(body);
      var s = migrate(o.s);
      if (!s) return { ok: false, message: '読みこめない記録です。' };
      return { ok: true, save: s, ent: o.e && Array.isArray(o.e.owned) ? o.e : newEntitlements() };
    } catch (e) { return { ok: false, message: '読みこめませんでした。' }; }
  }
  // 二つの記録がぶつかったとき、比べて選ぶための要約（数値を黙って混ぜない）
  function summarize(save) {
    var c = save.companion || {};
    return {
      name: c.name || '（まだ相棒がいない）', level: levelOf(c.exp || 0), exp: c.exp || 0,
      chapters: (save.chapters.done || []).length, trainings: save.trainings || 0, updatedAt: save.updatedAt || 0, rev: save.rev || 0, deviceId: save.deviceId
    };
  }
  function conflict(local, incoming) {
    if (!local || !local.companion) return { conflict: false, pick: 'incoming' };
    if (!incoming || !incoming.companion) return { conflict: false, pick: 'local' };
    var a = summarize(local), b = summarize(incoming);
    var same = a.deviceId === b.deviceId && a.rev === b.rev;
    if (same) return { conflict: false, pick: 'local', a: a, b: b };
    var newer = (b.updatedAt > a.updatedAt) ? 'incoming' : 'local';
    return { conflict: true, a: a, b: b, suggest: newer };
  }
  // 見た目の権利は進行と別に守る（どちらを選んでも、持っている物は消えない）
  function mergeEntitlements(a, b) {
    var owned = (a && a.owned || []).slice();
    (b && b.owned || []).forEach(function (id) { if (!has(owned, id)) owned.push(id); });
    return { owned: owned, updatedAt: Math.max(a && a.updatedAt || 0, b && b.updatedAt || 0) };
  }

  /* ================= 1日の上限（AIを使うときだけ） ================= */
  function dayKey(now) { var d = new Date(now); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function useQuota(save, kind, now) {
    var k = dayKey(now);
    if (save.usage.day !== k) save.usage = { day: k, words: 0, diary: 0 };
    var lim = kind === 'words' ? BAL.wordsPerDay : BAL.diaryAiPerDay;
    if (save.usage[kind] >= lim) return false;
    save.usage[kind]++;
    return true;
  }
  function quotaLeft(save, kind, now) {
    var k = dayKey(now);
    var used = save.usage.day === k ? save.usage[kind] : 0;
    return (kind === 'words' ? BAL.wordsPerDay : BAL.diaryAiPerDay) - used;
  }

  var api = {
    clamp: clamp, dist: dist, copy: copy, rng: rng, hashStr: hashStr, axisName: axisName, ruleName: ruleName, signed: signed,
    makePolicy: makePolicy, applyChanges: applyChanges, undo: undo, canUndo: canUndo, reset: reset, snapshot: snapshot, sameAxes: sameAxes,
    candidates: candidates, decide: decide, explain: explain, actPhrase: actPhrase,
    pickRepresentative: pickRepresentative, teachOptions: teachOptions, previewTeaching: previewTeaching, applyTeaching: applyTeaching,
    tendency: tendency, parseWords: parseWords, proposal: proposal, validateProposal: validateProposal,
    diaryFor: diaryFor, validateAiDiary: validateAiDiary,
    levelOf: levelOf, nextLevelExp: nextLevelExp, rewardsFor: rewardsFor, starsOf: starsOf,
    SAVE_KEY: SAVE_KEY, ENT_KEY: ENT_KEY, BACKUP_KEY: BACKUP_KEY, newSave: newSave, newEntitlements: newEntitlements, activeSlot: activeSlot, unlockSlot: unlockSlot,
    migrate: migrate, exportCode: exportCode, importCode: importCode, summarize: summarize, conflict: conflict, mergeEntitlements: mergeEntitlements,
    useQuota: useQuota, quotaLeft: quotaLeft, dayKey: dayKey, WEIGHT: WEIGHT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NAD_POLICY = api;
})(typeof window !== 'undefined' ? window : globalThis);
