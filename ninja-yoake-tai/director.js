/* ニンジャ夜明け隊 — 任務監督（§8：次の任務を構成する）
 *
 * ライブ戦闘には関わらない。試合が終わったあと（結果・広場）に、次の協力任務の構成を1つ提案するだけ。
 *  入力：役割の構成・救助／罠／被弾などの集計（おおまかな段階）・過去の任務・選んだ難易度
 *        課金額・広告の記録・チャットは渡さない（このゲームにはそもそも無い）
 *  出力：{ mission_template_id, enemy_set_id, support_event_id, objective_variant_id, briefing }
 *        敵の予算・報酬・置ける地点は data.js の表で決まっていて、ここでは ID を選ぶだけ。
 *  例：救助が多かったチーム → 護衛任務（里人の避難）／罠が活躍したチーム → 分かれ道の守り
 *  上手く遊ぶほど勝手に難しくなる仕組みにはしない（難易度はプレイヤーが選ぶ。敵は同じ予算の中から）。
 *  1チームの次の任務につき1回だけ。新しい提案は1人1日3回まで。個人情報を含まない構成単位でキャッシュする。
 *  既定は「ルールで選ぶ」。設定で https の接続先を入れたときだけ生成AIに問い合わせ、8秒で打ち切る。
 *  検証に通らない・時間切れ・通信失敗のときはルールの提案に戻る。出撃までに用意できなければ通常任務。
 *  効果の比べ方（§8 の最後）：同じ難易度・報酬の「固定ローテーション」モードも選べ、記録でモード別に比べられる。
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA || require('./data.js');
  var L = root.NYT_LINES || (typeof require !== 'undefined' ? require('./lines.js') : { LINES: {} });
  var NG = /(https?:|www\.|<|>|殺|死|血|課金|ガチャ|購入|お金|住所|電話)/;
  var PER_DAY = 3, TIMEOUT = 8000;
  var REASON = {
    escort: '救助が多かったチームなので、里人を守る任務を',
    branch: '罠がよく効いたので、罠の置き場が多い任務を',
    pillars: '守りが固かったので、結界柱も守る任務を',
    standard: 'いつもの守りを、目標つきで',
    variety: '前とちがう任務を'
  };
  var CLIENT_ORDER = ['hayate', 'ganzi', 'sakuya', 'benten', 'uka', 'rei', 'shiba', 'yui', 'fuuta', 'oto', 'kohaku', 'hinanojoh', 'nagisa', 'anne', 'torika', 'jin', 'kanaoni', 'atoza', 'rotten', 'dan', 'nekomata', 'quon', 'janome', 'karma', 'ichiya', 'nemu', 'karura', 'xiaolan', 'aum', 'konga', 'shion', 'seori', 'magoichi', 'ibuki', 'oen', 'izuna', 'sekishusai', 'sattva', 'sasagane'];

  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function band(n, a, b) { return n < a ? 0 : n < b ? 1 : 2; }

  // 任務監督に渡す文脈（最小限・段階だけ）
  function context(last, difficulty) {
    var r = last || null;
    var roles = r ? r.members.map(function (m) { return m.role; }) : [];
    var sum = function (k) { return r ? r.members.reduce(function (a, m) { return a + (m.stats[k] || 0); }, 0) : 0; };
    return {
      roles: roles.slice().sort(),
      stats: r ? {
        rescues: band(r.team.rescues, 1, 3), trapKills: band(r.team.trapKills, 5, 10), combos: band(r.team.combos, 3, 8),
        blocked: band(sum('blocked'), 80, 200), downs: band(sum('downs'), 1, 3), barrier: band(r.barrier.hp / r.barrier.max, 0.4, 0.75), outcome: r.outcome
      } : null,
      past: r ? [r.mission.mission_template_id] : [],
      difficulty: difficulty || 'normal'
    };
  }
  function cacheKey(ctx) { return ctx.roles.join('+') + '|' + JSON.stringify(ctx.stats) + '|' + ctx.past.join(',') + '|' + ctx.difficulty; }

  function setsFor(mid, difficulty) { var m = D.MISSIONS[mid]; return m ? m.enemySets.filter(function (id) { return D.setCost(id) <= D.DIFF[difficulty].budget; }) : []; }
  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  function nextClient(P) { var id = CLIENT_ORDER[(P.director.rot || 0) % CLIENT_ORDER.length]; return id; }
  function askLine(id, rnd) { var e = L.LINES && L.LINES[id]; return e && e.ask ? pick(e.ask, rnd) : '今夜も妖怪が来る。里の結界を頼む。'; }

  // ルールで選ぶ（AI なしでも同じ形式）
  function ruleProposal(ctx, rnd, client) {
    rnd = rnd || Math.random;
    var s = ctx.stats, last = ctx.past[0] || null, why = 'variety', mid = null;
    if (s) {
      if (s.rescues >= 1 && last !== 'escort') { mid = 'escort'; why = 'escort'; }
      else if (s.trapKills >= 1 && last !== 'branch') { mid = 'branch'; why = 'branch'; }
      else if ((s.blocked >= 1 || ctx.roles.filter(function (r) { return r === 'guard'; }).length >= 2) && last !== 'pillars') { mid = 'pillars'; why = 'pillars'; }
    }
    if (!mid) { var cands = D.MISSION_IDS.filter(function (id) { return id !== last; }); mid = pick(cands, rnd); why = mid === 'standard' ? 'standard' : 'variety'; }
    var M = D.MISSIONS[mid];
    var sets = setsFor(mid, ctx.difficulty);
    var sup = s && s.downs >= 2 && M.supports.indexOf('rain') >= 0 ? 'rain' : s && s.barrier === 0 && M.supports.indexOf('mend') >= 0 ? 'mend' : pick(M.supports, rnd);
    var objs = M.objectives.filter(function (o) { return o !== 'none'; });
    var obj = why === 'escort' && objs.indexOf('escortAll') >= 0 ? 'escortAll' : why === 'branch' ? (s && s.trapKills >= 2 && objs.indexOf('trap25') >= 0 ? 'trap25' : 'trap15') : why === 'pillars' ? 'pillarsBoth' : pick(objs, rnd);
    var brief = askLine(client, rnd) + '（' + M.name + '・' + REASON[why] + '）';
    return { mission_template_id: mid, enemy_set_id: pick(sets, rnd), support_event_id: sup, objective_variant_id: obj, briefing: brief, client_id: client, reason: why };
  }
  // 固定ローテーション（AI の効果を比べるための基準。いつも同じ順番）
  function rotationProposal(P, ctx) {
    var i = P.director.rot || 0, mid = D.MISSION_IDS[i % D.MISSION_IDS.length], M = D.MISSIONS[mid];
    var sets = setsFor(mid, ctx.difficulty), client = nextClient(P);
    return { mission_template_id: mid, enemy_set_id: sets[0], support_event_id: M.supports[0], objective_variant_id: M.objectives[1] || 'none', briefing: askLine(client, function () { return 0; }) + '（' + M.name + '）', client_id: client, reason: 'rotation' };
  }
  // 通常任務（提案を使わないとき・用意が間に合わないとき）
  function normalMission(P, rnd) {
    rnd = rnd || Math.random;
    var M = D.MISSIONS.standard, client = CLIENT_ORDER[((P.director.rot || 0) + 5) % CLIENT_ORDER.length]; // 提案とは別の依頼人
    var sets = setsFor('standard', P.loadout.difficulty);
    return { mission_template_id: 'standard', enemy_set_id: sets[(P.stats.matches || 0) % sets.length], support_event_id: M.supports[(P.stats.matches || 0) % M.supports.length], objective_variant_id: 'none', briefing: askLine(client, rnd) + '（' + M.name + '）', client_id: client, reason: 'normal' };
  }

  // 検証：承認済みの構成か・敵予算の中か・置き場や支援が任務に合っているか・文面が範囲内か
  function validate(p, difficulty) {
    if (!p || typeof p !== 'object') return { ok: false, reason: '形式が違う' };
    var M = D.MISSIONS[p.mission_template_id];
    if (!M) return { ok: false, reason: '承認されていない任務' };
    if (!D.ENEMY_SETS[p.enemy_set_id] || M.enemySets.indexOf(p.enemy_set_id) < 0) return { ok: false, reason: 'この任務で使えない敵の組み合わせ' };
    var diff = D.DIFF[difficulty] || D.DIFF.normal;
    if (D.setCost(p.enemy_set_id) > diff.budget) return { ok: false, reason: '難易度の敵予算をこえている' };
    if (!D.SUPPORTS[p.support_event_id] || M.supports.indexOf(p.support_event_id) < 0) return { ok: false, reason: 'この任務で使えない支援' };
    if (!D.OBJECTIVES[p.objective_variant_id] || M.objectives.indexOf(p.objective_variant_id) < 0) return { ok: false, reason: 'この任務で使えない目標' };
    if (p.briefing != null && (typeof p.briefing !== 'string' || p.briefing.length > 100 || NG.test(p.briefing))) return { ok: false, reason: '文面が承認済みの範囲外' };
    if (p.place != null) return { ok: false, reason: '配置は表で決める（指定できない）' };
    return { ok: true };
  }

  function aiProposal(ctx, endpoint, timeoutMs) {
    if (!endpoint || !/^https:\/\//.test(endpoint) || typeof fetch === 'undefined') return Promise.reject(new Error('接続先なし'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);
    var body = {
      context: ctx,
      approved: D.MISSION_IDS.map(function (id) { var M = D.MISSIONS[id]; return { id: id, enemy_sets: setsFor(id, ctx.difficulty), supports: M.supports, objectives: M.objectives }; }),
      output: ['mission_template_id', 'enemy_set_id', 'support_event_id', 'objective_variant_id', 'briefing']
    };
    return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { clearTimeout(timer); });
  }

  // 次の任務の提案（Promise）。結果の画面・広場で呼ぶ。試合中には呼ばない
  function generate(P, last, opt) {
    opt = opt || {};
    var now = opt.now || Date.now(), rnd = opt.rnd || Math.random;
    var dir = P.director, mode = dir.mode || 'rule';
    var ctx = context(last, P.loadout.difficulty);
    // 1チームの次の任務につき1回（同じ試合の結果から何度呼んでも同じ提案）
    var sid = last ? last.session_id : 'start';
    if (dir.pending && dir.pending.for === sid) return Promise.resolve({ proposal: dir.pending.p, gen: dir.pending.gen, note: dir.pending.note || null, same: true });
    var today = dayKey(now);
    if (dir.day !== today) { dir.day = today; dir.gens = 0; }
    var key = mode + '|' + cacheKey(ctx);
    var finish = function (p, gen, note) {
      var v = validate(p, ctx.difficulty);
      if (!v.ok) { p = ruleProposal(ctx, rnd, nextClient(P)); gen = 'rule'; note = (note ? note + '／' : '') + '検証で差し戻し（' + v.reason + '）'; }
      if (!p.client_id) p.client_id = nextClient(P);
      if (!p.briefing) p.briefing = askLine(p.client_id, rnd) + '（' + D.MISSIONS[p.mission_template_id].name + '）';
      dir.pending = { for: sid, p: p, gen: gen, note: note || null, at: now };
      dir.cache[key] = { p: p, at: now };
      var ks = Object.keys(dir.cache); if (ks.length > 30) delete dir.cache[ks[0]];
      return { proposal: p, gen: gen, note: note || null };
    };
    // 同じ構成ならキャッシュを使う（回数に数えない）。固定ローテーションは順番どおりなので使わない
    if (mode !== 'rotation' && dir.cache[key] && validate(dir.cache[key].p, ctx.difficulty).ok) return Promise.resolve(finish(JSON.parse(JSON.stringify(dir.cache[key].p)), 'cache', '同じ構成の提案を再利用'));
    if (dir.gens >= PER_DAY) return Promise.resolve({ proposal: null, gen: 'none', note: '今日の新しい提案は' + PER_DAY + '回まで。通常任務で出撃できます' });
    dir.gens++;
    if (mode === 'rotation') return Promise.resolve(finish(rotationProposal(P, ctx), 'rotation'));
    if (mode === 'ai' && dir.endpoint) {
      return aiProposal(ctx, dir.endpoint, opt.timeoutMs || TIMEOUT)
        .then(function (p) { return finish(p, 'ai'); })
        .catch(function (e) { return finish(ruleProposal(ctx, rnd, nextClient(P)), 'rule', 'AIの提案を使えなかったのでルールで作成（' + (e && e.name === 'AbortError' ? '8秒をこえた' : (e && e.message) || '失敗') + '）'); });
    }
    return Promise.resolve(finish(ruleProposal(ctx, rnd, nextClient(P)), 'rule'));
  }
  // 出撃するとき：提案を使ったら、次の依頼人へ進める
  function consume(P, used) {
    P.director.pending = null;
    P.director.rot = (P.director.rot || 0) + 1;
    return used;
  }

  var api = { context: context, cacheKey: cacheKey, ruleProposal: ruleProposal, rotationProposal: rotationProposal, normalMission: normalMission, validate: validate, generate: generate, consume: consume, nextClient: nextClient, PER_DAY: PER_DAY, CLIENT_ORDER: CLIENT_ORDER, REASON: REASON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_DIRECTOR = api;
})(typeof window !== 'undefined' ? window : globalThis);
