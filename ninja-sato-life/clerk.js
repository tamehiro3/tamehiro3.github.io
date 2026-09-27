/* ニンジャ里ライフ — 里を読み取る依頼係（設計書 §7）
 *
 * 目的：「自分の建築が依頼に影響した」と分かること。
 * 依頼係は新しいルールを作らず、承認済みテンプレートの選択・組み合わせ・短い文面だけを担当する。
 *  入力：施設タグ・解放済み要素・最近の依頼ID・在庫の範囲・関係する住民ID（購入額や自由チャットは送らない）
 *  出力：{ template_id, npc_id, location_tag, reason_tag, text }（報酬はテンプレートからゲーム側が決める）
 *  生成条件：施設の初設置／新しいタグ／前の依頼の完了。1人1日最大2回。通常依頼は生成しない。
 *  検証：未解放の場所を求めない・素材が生産できる・同じ依頼を連続しない・台詞が人物像から外れない。
 *  8秒をこえたら通常依頼へ切り替える。生成中も操作を止めない（Promise）。
 * AI案（外部の生成サービス）は、設定で接続先を入れたときだけ使う。既定はルールで選ぶ方式で、
 * どちらも同じ出力形式と同じ検証を通るので、AIが止まっても全ての依頼が進められる。
 */
(function (root) {
  'use strict';
  var D = root.NSL_DATA || require('./data.js');
  var R = root.NSL_RULES || require('./rules.js');
  var CH = root.NSL_CHARS || require('./chars.js');

  var TAG_REASON = { water: 'new_water_area', light: 'new_light', flower: 'new_flower', tea: 'new_tea', training: 'new_training', farm: 'new_farm', shrine: 'new_shrine', tree: 'new_tree', rest: 'new_rest' };
  var NG = /(https?:|www\.|<|>|殺|死ね|課金|ガチャ|購入|お金|住所|電話)/;

  function band(n, lo, hi) { return n < lo ? '少ない' : n < hi ? 'ふつう' : '多い'; }
  // 依頼係に渡す文脈（最小限）
  function context(s) {
    var tags = R.villageTags(s);
    return {
      facility_tags: Object.keys(tags),
      unlocked: { level: s.village.level, items: D.ITEMS.filter(function (it) { return (it.unlock || 1) <= s.village.level && !it.reward; }).map(function (it) { return it.id; }) },
      recent_quests: s.quests.history.slice(-4),
      inventory: { herb: band(s.res.herb, 5, 20), wood: band(s.res.wood, 10, 40) },
      residents: Object.keys(s.residents)
    };
  }

  function pickNpc(s, tag, rnd) {
    var busy = {}; s.quests.active.forEach(function (q) { if (q.npc) busy[q.npc] = 1; });
    var ids = Object.keys(s.residents);
    if (!ids.length) return null;
    var fans = ids.filter(function (id) { return !busy[id] && CH.BY_ID[id] && CH.BY_ID[id].likes.indexOf(tag) >= 0; });
    var free = ids.filter(function (id) { return !busy[id]; });
    var pool = fans.length ? fans : (free.length ? free : ids);
    return pool[Math.floor(rnd() * pool.length)];
  }

  // 検証：承認済みテンプレート・住民・場所・前提・連続・文面
  function validate(s, p) {
    if (!p || typeof p !== 'object') return { ok: false, reason: '形式が違う' };
    var t = D.QUEST[p.template_id];
    if (!t) return { ok: false, reason: '承認されていない依頼' };
    if (p.npc_id && !s.residents[p.npc_id]) return { ok: false, reason: '住民ではない人物' };
    var tags = R.villageTags(s);
    var generic = { home: 1, path: 1, tree: 1 };
    if (p.location_tag && !tags[p.location_tag] && !generic[p.location_tag]) return { ok: false, reason: '里にない場所（' + p.location_tag + '）' };
    if (!R.templateFeasible(s, t, tags)) return { ok: false, reason: '今の里では遂行できない' };
    var last = s.quests.history[s.quests.history.length - 1];
    if (last === p.template_id) return { ok: false, reason: '同じ依頼が連続する' };
    if (s.quests.active.some(function (q) { return q.template === p.template_id; })) return { ok: false, reason: 'すでに同じ依頼がある' };
    if (p.text != null) {
      if (typeof p.text !== 'string' || p.text.length > 70 || NG.test(p.text)) return { ok: false, reason: '文面が承認済みの範囲外' };
      // ほかの住民の名前を名乗らない（人物像から外れない）
      var others = CH.CHARS.filter(function (c) { return c.id !== p.npc_id; }).some(function (c) { return c.name.length >= 2 && p.text.indexOf(c.name + 'だ') >= 0; });
      if (others) return { ok: false, reason: '人物像から外れる' };
    }
    if (p.reason_tag && !D.REASONS[p.reason_tag]) return { ok: false, reason: '知らない理由' };
    return { ok: true };
  }

  // ルールで選ぶ（AIなしでも同じ形式）
  function ruleProposal(s, trig, rnd) {
    rnd = rnd || Math.random;
    var tags = R.villageTags(s), last = s.quests.history[s.quests.history.length - 1];
    var focus = trig && trig.tag ? trig.tag : null;
    var cands = D.QUESTS.filter(function (t) {
      if (t.id === last) return false;
      if (s.quests.active.some(function (q) { return q.template === t.id; })) return false;
      if (!R.templateFeasible(s, t, tags)) return false;
      if (focus) return t.loc === focus || (t.req.tags && t.req.tags.indexOf(focus) >= 0) || (t.need.tag === focus);
      return true;
    });
    if (!cands.length) return null;
    // 最近の依頼（直近3件）は、ほかに候補があれば避ける
    var recent = s.quests.history.slice(-3), fresh = cands.filter(function (t) { return recent.indexOf(t.id) < 0; });
    if (fresh.length) cands = fresh;
    var sum = 0; cands.forEach(function (t) { sum += t.weight; });
    var r = rnd() * sum, pick = cands[0];
    for (var i = 0; i < cands.length; i++) { r -= cands[i].weight; if (r <= 0) { pick = cands[i]; break; } }
    var reason = focus ? TAG_REASON[focus] || null : (trig && trig.kind === 'quest_done' ? 'quest_done' : null);
    var npc = pickNpc(s, pick.loc, rnd);
    var text = (reason ? D.REASONS[reason].text : '') + pick.text;
    return { template_id: pick.id, npc_id: npc, location_tag: pick.loc, reason_tag: reason, text: text };
  }

  // AI案（接続先があるときだけ）。8秒でタイムアウト
  function aiProposal(s, trig, endpoint, timeoutMs) {
    if (!endpoint || typeof fetch === 'undefined') return Promise.reject(new Error('接続先なし'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);
    var body = { context: context(s), trigger: trig ? { kind: trig.kind, tag: trig.tag || null } : null, templates: D.QUESTS.map(function (t) { return t.id; }) };
    return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { clearTimeout(timer); });
  }

  // 生成（トリガーつき）。結果は必ずルールの依頼に戻れる
  function generate(s, trig, opt) {
    opt = opt || {};
    var today = R.dayKey(s.clock.hwm);
    if (s.clerk.day !== today) { s.clerk.day = today; s.clerk.gens = 0; }
    var capped = s.clerk.gens >= D.BAL.clerkPerDay;
    var mode = s.settings.clerkMode || 'rule';
    var rnd = opt.rnd || Math.random;
    var fallback = function (why) {
      var p = ruleProposal(s, capped ? null : trig, rnd) || ruleProposal(s, null, rnd);
      if (p && why) p.fallback = why;
      return p;
    };
    if (capped) return Promise.resolve({ proposal: fallback('今日の生成は上限（' + D.BAL.clerkPerDay + '回）'), gen: 'rule' });
    s.clerk.gens++;
    if (mode === 'ai' && s.settings.aiEndpoint) {
      return aiProposal(s, trig, s.settings.aiEndpoint, opt.timeoutMs || D.BAL.clerkTimeoutMs)
        .then(function (p) { var v = validate(s, p); if (!v.ok) throw new Error(v.reason); return { proposal: p, gen: 'ai' }; })
        .catch(function (e) { return { proposal: fallback('AI案を使えなかったのでルールで作成（' + (e && e.name === 'AbortError' ? '8秒をこえた' : (e && e.message) || '失敗') + '）'), gen: 'rule' }; });
    }
    var p = ruleProposal(s, trig, rnd);
    var v = validate(s, p);
    if (!v.ok) return Promise.resolve({ proposal: fallback(v.reason), gen: 'rule' });
    return Promise.resolve({ proposal: p, gen: trig ? 'reason' : 'rule' });
  }

  // 提案を依頼として登録（枠がいっぱいなら、まだ受けていない通常依頼と入れかえる）
  function commit(s, res) {
    if (!res || !res.proposal) return null;
    var p = res.proposal;
    if (!validate(s, p).ok) { p = ruleProposal(s, null); if (!p || !validate(s, p).ok) return null; res.gen = 'rule'; }
    if (s.quests.active.length >= D.BAL.questSlots) {
      var j = -1;
      for (var i = 0; i < s.quests.active.length; i++) if (s.quests.active[i].state === 'open' && !s.quests.active[i].reason) { j = i; break; }
      if (j < 0) return null;
      s.quests.active.splice(j, 1);
    }
    return R.addQuest(s, { template: p.template_id, npc: p.npc_id || null, loc: p.location_tag, reason: p.reason_tag || null, text: p.text || D.QUEST[p.template_id].text, gen: res.gen, note: p.fallback || null });
  }

  // ふだんの補充（生成しない。ルールで選ぶ）
  function refill(s, rnd) {
    var added = [];
    var guard = 0;
    while (s.quests.active.length < D.BAL.questSlots && guard++ < 6) {
      var p = ruleProposal(s, null, rnd);
      if (!p || !validate(s, p).ok) break;
      added.push(R.addQuest(s, { template: p.template_id, npc: p.npc_id, loc: p.location_tag, reason: null, text: D.QUEST[p.template_id].text, gen: 'rule' }));
    }
    return added;
  }

  // 施設の撤去などで遂行できなくなった依頼を、無料で差し替える
  function replaceBroken(s, rnd) {
    var broken = s.quests.active.filter(function (q) { return q.broken || !R.templateFeasible(s, D.QUEST[q.template]); });
    var out = [];
    broken.forEach(function (q) {
      R.dropQuest(s, q.qid);
      var p = ruleProposal(s, null, rnd);
      if (p && validate(s, p).ok) { var nq = R.addQuest(s, { template: p.template_id, npc: q.npc && s.residents[q.npc] ? q.npc : p.npc_id, loc: p.location_tag, reason: null, text: D.QUEST[p.template_id].text, gen: 'rule', note: '前の依頼ができなくなったので差し替え（無料）' }); if (q.state === 'active') nq.state = 'active'; out.push({ old: q, neu: nq }); }
      else out.push({ old: q, neu: null });
    });
    return out;
  }

  var api = { context: context, validate: validate, ruleProposal: ruleProposal, generate: generate, commit: commit, refill: refill, replaceBroken: replaceBroken, TAG_REASON: TAG_REASON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NSL_CLERK = api;
})(typeof window !== 'undefined' ? window : globalThis);
