/* ニンジャ夜明け隊 — 画面（タイトル・広場・編成・結果・パネル）と戦闘中の表示
 * 流れ：広場 → 編成 → 出撃 → 戦闘 → 結果 → 再出撃（§7）
 * 結果では与ダメージだけでなく、結界防衛・救助・回復・連携・準備をそれぞれ見せ、ひとつの順位にはしない。
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA, A = root.NinjaArt, CH = root.NSL_CHARS, LN = (root.NYT_LINES || {}).LINES || {};
  var PR = root.NYT_PROGRESS, DIR = root.NYT_DIRECTOR, IN = root.NYT_INPUT, AU = root.NYT_AUDIO;
  var ART_DIR = '../ninja-sato-life/img/art/', SHEET_DIR = '../ninja-sato-life/sheets/';
  var G = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function charOf(id) { return CH && CH.BY_ID[id] ? CH.BY_ID[id] : null; }
  function artUrl(id) { return ART_DIR + id + '.jpg'; }
  function fig(def, o) { o = o || {}; if (!A || !def) return ''; return A.render(def, { yaw: o.yaw || 0, pose: o.pose || 'stand', expr: o.expr, fx: o.fx, w: 200, h: 240, companions: o.companions !== false }); }
  function cnFig(id, o) { var c = charOf(id); return c ? fig(c.art, o) : ''; }
  function meFig(o) { return fig(D.apprenticeDef(G.P.look, CH), o); }
  function buddyFig(i, o) { return fig(D.apprenticeDef(D.BUDDIES[i].look, CH), o); }
  function show(id) {
    ['scr-title', 'scr-plaza', 'scr-loadout', 'scr-result'].forEach(function (s) { $(s).hidden = s !== id; });
    $('hud').hidden = id !== 'hud';
  }
  var toastT = 0;
  function toast(s, ms) { var t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2200); }
  var bannerT = 0;
  function banner(s, sub, ms) { var b = $('banner'); b.innerHTML = esc(s) + (sub ? '<small>' + esc(sub) + '</small>' : ''); b.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(function () { b.classList.remove('on'); }, ms || 2600); }
  function lineOf(id, key, i) { var e = LN[id]; if (!e) return ''; var v = e[key]; return Array.isArray(v) ? v[(i || 0) % v.length] : v; }

  /* ---------- 紋章 ---------- */
  function crestSvg(glyph, col) {
    col = col || '#e8c56b';
    var g = '';
    if (glyph === 'sun') g = '<path d="M8 30h32" stroke="' + col + '" stroke-width="3"/><path d="M13 30a11 11 0 0 1 22 0Z" fill="' + col + '"/>' + [0, 30, 60, 90, 120, 150, 180].map(function (a) { var r = a * Math.PI / 180; return '<path d="M' + (24 - Math.cos(r) * 15).toFixed(1) + ' ' + (30 - Math.sin(r) * 15).toFixed(1) + 'L' + (24 - Math.cos(r) * 19).toFixed(1) + ' ' + (30 - Math.sin(r) * 19).toFixed(1) + '" stroke="' + col + '" stroke-width="2.4" stroke-linecap="round"/>'; }).join('');
    else if (glyph === 'moon') g = '<path d="M30 8a16 16 0 1 0 0 32a12 12 0 1 1 0-32Z" fill="' + col + '"/>';
    else if (glyph === 'mount') g = '<path d="M6 38L19 16L26 27L31 20L42 38Z" fill="' + col + '"/><path d="M16 21L19 16L22 21Z" fill="#fff"/>';
    else if (glyph === 'wave') g = '<path d="M6 30q6-10 12 0t12 0t12 0" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round"/><path d="M6 20q6-10 12 0t12 0t12 0" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round" opacity=".7"/>';
    else if (glyph === 'sakura') g = [0, 72, 144, 216, 288].map(function (a) { return '<ellipse cx="24" cy="14" rx="6" ry="9" fill="' + col + '" transform="rotate(' + a + ' 24 24)"/>'; }).join('') + '<circle cx="24" cy="24" r="3.5" fill="#fff"/>';
    else g = '<path d="M24 6l4.6 12.4H42l-10.8 8l4 13L24 31.6l-11.2 7.8l4-13L6 18.4h13.4Z" fill="' + col + '"/>';
    return '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="22" fill="#1c2344" stroke="' + col + '" stroke-width="2"/>' + g + '</svg>';
  }
  function myCrest() { var c = D.lookItem('crest', G.P.look.crest); return crestSvg(c.glyph); }

  /* ================= タイトル ================= */
  function title() {
    show('scr-title');
    $('btn-continue').hidden = !G.P.stats.tutorial && !G.P.stats.tutorialSkipped;
    $('btn-start').textContent = G.P.stats.tutorial || G.P.stats.tutorialSkipped ? '最初の任務をもう一度' : 'はじめる';
  }

  /* ================= 広場 ================= */
  var tipI = 0;
  function plaza() {
    show('scr-plaza');
    var P = G.P, mid = P.mentor, c = charOf(mid);
    $('pl-tokens').textContent = P.tokens;
    $('pl-crest').innerHTML = myCrest();
    $('pl-mentor-fig').innerHTML = cnFig(mid, { pose: 'wave' });
    $('pl-mentor-name').textContent = '師匠：' + (c ? c.name : '');
    $('pl-mentor-line').textContent = G.mentorFresh ? lineOf(mid, 'intro') : lineOf(mid, 'tips', tipI);
    G.mentorFresh = false;
    $('pl-mentor-next').onclick = function () { tipI++; $('pl-mentor-line').textContent = lineOf(mid, 'tips', tipI); AU.play('click'); };
    $('pl-team').innerHTML = '<div class="tf"><div class="fig">' + meFig({ pose: 'stand' }) + '</div>あなた</div>' +
      D.BUDDIES.map(function (b, i) { return '<div class="tf"><div class="fig">' + buddyFig(i, { yaw: -20 }) + '</div>' + esc(b.name) + '</div>'; }).join('');
    missions();
  }
  function missionCard(kind, m, extra) {
    var M = D.MISSIONS[m.mission_template_id], set = D.ENEMY_SETS[m.enemy_set_id], sup = D.SUPPORTS[m.support_event_id], obj = D.OBJECTIVES[m.objective_variant_id];
    var cid = m.client_id || DIR.nextClient(G.P), c = charOf(cid);
    var tag = kind === 'weekly' ? '<span class="tag w">今週の固定任務</span>' : kind === 'proposal' ? '<span class="tag ai">任務監督の提案</span>' : '<span class="tag n">通常任務</span>';
    return '<button class="mcard' + (G.choice === kind ? ' sel' : '') + '" data-kind="' + kind + '">' +
      (c ? '<img src="' + artUrl(cid) + '" alt="' + esc(c.name) + '" loading="lazy">' : '') +
      '<div>' + tag + '<h4>' + esc(M.name) + '</h4>' +
      '<p>' + esc(m.briefing || M.desc) + '</p>' +
      '<small>敵：' + esc(set.name) + '／目標：' + esc(obj.name) + '／節目の支援：' + esc(sup.name) + (extra ? '<br>' + extra : '') + '</small></div></button>';
  }
  function missions() {
    var P = G.P, out = '';
    G.normal = G.normal || DIR.normalMission(P);
    out += missionCard('normal', G.normal);
    var W = D.weeklyMission(Date.now());
    var wk = P.weekly.week === W.week ? P.weekly : { best: 0, cleared: false };
    W.mission.client_id = 'hayate';
    W.mission.briefing = '全員が同じ地図・敵・難易度（ふつう）で挑む、今週の任務。';
    G.weekly = W;
    out += missionCard('weekly', W.mission, W.week + '　今週の最高：' + (wk.cleared ? '夜明けまで守った' : '襲撃 ' + wk.best + ' まで'));
    var pd = P.director.pending;
    if (pd && pd.p) out += missionCard('proposal', pd.p, pd.gen === 'ai' ? 'AIの提案（検証ずみ）' : pd.gen === 'rotation' ? '固定ローテーション' : 'ルールで作った提案' + (pd.note ? '・' + esc(pd.note) : ''));
    else out += '<div class="mcard" style="cursor:default;opacity:.85"><div><span class="tag ai">任務監督</span><h4>次の任務の提案</h4><p>出撃のあと、チームの働き（救助・罠・守り）に合わせて、次の任務を1つ提案します。</p><small>1日' + DIR.PER_DAY + '回まで。難易度は変えません。</small></div></div>';
    $('pl-missions').innerHTML = out;
    Array.prototype.forEach.call($('pl-missions').querySelectorAll('.mcard[data-kind]'), function (b) {
      b.onclick = function () { G.choice = b.getAttribute('data-kind'); AU.play('click'); missions(); };
    });
  }

  /* ================= 編成 ================= */
  var tab = '攻撃';
  function loadout() {
    show('scr-loadout');
    var P = G.P, L = P.loadout, m = G.pendingMission();
    var M = D.MISSIONS[m.mission_template_id], c = charOf(m.client_id);
    var weekly = G.choice === 'weekly';
    $('lo-mission').innerHTML = (c ? '<img src="' + artUrl(m.client_id) + '" alt="">' : '') +
      '<div><h4>' + esc(M.name) + (weekly ? '（今週の固定任務）' : '') + '</h4><p>' + (c ? '依頼人：<b>' + esc(c.name) + '</b>「' + esc(lineOf(m.client_id, 'ask')) + '」' : '') + '</p>' +
      '<p>' + esc(M.desc) + '</p><p><small>敵：' + esc(D.ENEMY_SETS[m.enemy_set_id].name) + '／目標：' + esc(D.OBJECTIVES[m.objective_variant_id].name) + '（' + esc(D.OBJECTIVES[m.objective_variant_id].desc) + '）／節目の支援：' + esc(D.SUPPORTS[m.support_event_id].name) + '（師匠が来てくれる）</small></p></div>';
    // 役割
    $('lo-roles').innerHTML = D.ROLE_IDS.map(function (id) {
      var R = D.ROLES[id];
      return '<button class="role' + (L.role === id ? ' sel' : '') + '" data-role="' + id + '"><span class="rn" style="color:' + R.color + '">' + R.name + '</span>' +
        '<span><span class="pp" style="background:' + R.color + '">' + R.purpose + '</span> 得意：' + esc(R.good) + '</span>' +
        '<small>役割技「' + esc(R.special.name) + '」' + esc(R.special.desc) + '<br>' + esc(R.passive) + '／弱点：' + esc(R.weak) + '</small></button>';
    }).join('');
    Array.prototype.forEach.call($('lo-roles').children, function (b) { b.onclick = function () { L.role = b.getAttribute('data-role'); AU.play('click'); loadout(); }; });
    // 忍術（目的で分ける。強い順には並べない）
    $('lo-tabs').innerHTML = D.PURPOSES.map(function (p) { return '<button class="' + (tab === p ? 'sel' : '') + '" data-tab="' + p + '">' + p + '</button>'; }).join('');
    Array.prototype.forEach.call($('lo-tabs').children, function (b) { b.onclick = function () { tab = b.getAttribute('data-tab'); loadout(); }; });
    var list = Object.keys(D.JUTSU).filter(function (id) { return D.JUTSU[id].purpose === tab; });
    $('lo-jutsu').innerHTML = list.map(function (id) {
      var J = D.JUTSU[id], own = PR.jutsuOwned(P, id), slot = L.jutsu.indexOf(id);
      return '<button class="jcard' + (slot >= 0 ? ' sel' : '') + (own ? '' : ' lock') + '" data-j="' + id + '"' + (own ? '' : ' disabled') + '>' + (slot >= 0 ? '<span class="badge">' + (slot + 1) + '</span>' : '') +
        '<b>' + esc(J.name) + '</b>' + (J.base ? '<small>（' + esc(D.JUTSU[J.base].name) + 'の別の型）</small>' : '') + '<br>' + esc(J.desc) + '<br><span class="cdt">再使用 ' + J.cd + '秒' + (own ? '' : '／修行で解放（修行札' + D.UNLOCK_COST + '）') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('lo-jutsu').children, function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-j'), i = L.jutsu.indexOf(id);
        if (i >= 0) return;
        L.jutsu = [L.jutsu[1], id]; AU.play('click'); loadout();
      };
    });
    $('lo-slots').innerHTML = L.jutsu.map(function (id, i) { return '<span>枠' + (i + 1) + '：<b>' + esc(D.JUTSU[id].name) + '</b></span>'; }).join('') + '<span style="background:none;color:#c8cce0;font-size:12px">新しくえらぶと、古い方と入れかわります</span>';
    // 仲間（おまかせ＝足りない役割をおぎなう）
    $('lo-buddies').innerHTML = D.BUDDIES.map(function (b, i) {
      var cur = L.buddies[i] || 'auto';
      return '<div class="buddy"><div class="fig">' + buddyFig(i) + '</div><b>' + esc(b.name) + '</b><select data-b="' + i + '"><option value="auto"' + (cur === 'auto' ? ' selected' : '') + '>おまかせ（' + D.ROLES[D.COMPLEMENT[L.role][i]].name + '）</option>' +
        D.ROLE_IDS.map(function (r) { return '<option value="' + r + '"' + (cur === r ? ' selected' : '') + '>' + D.ROLES[r].name + '</option>'; }).join('') + '</select></div>';
    }).join('');
    Array.prototype.forEach.call($('lo-buddies').querySelectorAll('select'), function (s) { s.onchange = function () { L.buddies[+s.getAttribute('data-b')] = s.value; G.touchLoadout(); }; });
    $('lo-diff').innerHTML = weekly ? '<span style="font-size:13px;color:#c8cce0">今週の固定任務は、全員「ふつう」です。</span>' : D.DIFF_IDS.map(function (d) { return '<button class="' + (L.difficulty === d ? 'sel' : '') + '" data-d="' + d + '">' + D.DIFF[d].name + '</button>'; }).join('');
    Array.prototype.forEach.call($('lo-diff').querySelectorAll('button'), function (b) { b.onclick = function () { L.difficulty = b.getAttribute('data-d'); G.difficultyChanged(); AU.play('click'); loadout(); }; });
    G.touchLoadout();
  }

  /* ================= 結果 ================= */
  var CAT = [
    { k: '撃退', rows: [['しずめた数', 'kills'], ['ダメージ', 'dmg']] },
    { k: '結界防衛', rows: [['防いだ', 'blocked'], ['罠でしずめた', 'trapKills']] },
    { k: '救助', rows: [['救助', 'rescues'], ['里人', 'villagers']] },
    { k: '回復・修理', rows: [['回復', 'healed'], ['結界の修理', 'repaired']] },
    { k: '連携', rows: [['連携', 'combos']] },
    { k: '準備', rows: [['採集', 'gathered'], ['罠を置いた', 'trapsPlaced']] }
  ];
  function result(res, claim, rec) {
    show('scr-result');
    var P = G.P, win = res.outcome === 'win', mid = P.mentor, mc = charOf(mid);
    var why = { dawn: '夜が明けた！ 里を守りきった', boss: '大だるまをしずめた！ 夜明けが早まった', barrier: '結界が破れてしまった…', allDown: '全員ダウンしてしまった…', quit: '出撃を途中でやめた' }[res.reason] || '';
    $('rs-head').className = 'rs-head ' + (win ? 'win' : 'lose');
    $('rs-head').innerHTML = '<h2>' + (win ? '夜明け！' : 'まだ夜の中…') + '</h2><p>' + esc(why) + '</p><p><small>' + esc(D.MISSIONS[res.mission.mission_template_id].name) + '／' + esc(D.DIFF[res.difficulty].name) + (res.weekly ? '／今週の固定任務' : '') + '／' + Math.floor(res.duration / 60) + '分' + (res.duration % 60) + '秒</small></p>';
    var pose = D.lookItem('pose', P.look.pose).pose;
    $('rs-figs').innerHTML = '<div class="fig">' + meFig({ pose: win ? pose : 'stand', fx: win ? 'joy' : null }) + '</div>' +
      D.BUDDIES.map(function (b, i) { return '<div class="fig">' + buddyFig(i, { pose: win ? 'happy' : 'stand', yaw: i ? 20 : -20 }) + '</div>'; }).join('') +
      '<div class="quote"><b>師匠 ' + esc(mc ? mc.name : '') + '</b>' + esc(lineOf(mid, win ? 'win' : 'lose')) + '</div>';
    var rw = '';
    if (claim.already) rw = '<p>この出撃の報酬は、もう受け取っています（1回の出撃につき1回）。</p>';
    else if (claim.invalid) rw = '<p>この出撃の結果は確認できませんでした。</p>';
    else rw = '<div class="total">修行札 +' + claim.tokens + '　<small style="font-size:13px;color:#6b6555">（手持ち ' + P.tokens + '）</small></div><ul>' + claim.parts.map(function (p) { return '<li>' + esc(p.name) + (p.n ? '　+' + p.n : '') + '</li>'; }).join('') + '</ul>' +
      (res.objective.id !== 'none' ? '<p>目標「' + esc(D.OBJECTIVES[res.objective.id].name) + '」… ' + (res.objective.done ? (win ? '達成！' : '達成（勝利したときだけ報酬）') : 'あと一歩') + '</p>' : '');
    $('rs-reward').innerHTML = rw;
    // 働き（カテゴリごと。いちばんの人に★）
    $('rs-contrib').innerHTML = CAT.map(function (cat) {
      var body = res.members.map(function (m) {
        var v = cat.rows.map(function (r) { return Math.round(m.stats[r[1]] || 0); });
        return { m: m, v: v, s: v[0] };
      });
      var top = Math.max.apply(null, body.map(function (b) { return b.s; }));
      return '<div class="cbox"><h4>' + cat.k + '</h4>' + body.map(function (b) {
        return '<div class="row' + (top > 0 && b.s === top ? ' top' : '') + '"><b>' + esc(b.m.kind === 'human' ? 'あなた' : b.m.name) + '</b><span>' + cat.rows.map(function (r, i) { return r[0] + ' ' + b.v[i]; }).join('・') + '</span></div>';
      }).join('') + '</div>';
    }).join('');
    // 修行課題・絆・贈り物
    var ex = '';
    if (rec.tasksDone.length) ex += '<p>修行課題を達成：' + rec.tasksDone.map(function (t) { return '<span class="gift">' + esc(t.name) + '（修行札+' + t.tokens + '）</span>'; }).join('') + '</p>';
    if (rec.bondUp) ex += '<p>師匠 ' + esc(charOf(rec.bondUp.id).name) + ' との絆が深まった（' + '♥'.repeat(rec.bondUp.level) + '）。新しい話が聞けます。</p>';
    if (rec.gifts.length) ex += '<p>外見が増えた：' + rec.gifts.map(function (g) { return '<span class="gift">' + esc(giftName(g)) + '</span>'; }).join('') + '</p>';
    var myTasks = D.TASKS.filter(function (t) { var me = res.members.filter(function (m) { return m.kind === 'human'; })[0]; return me && t.role === me.role; });
    ex += '<p style="color:#c8cce0">' + esc(D.ROLES[myTasks[0] ? myTasks[0].role : 'vanguard'].name) + 'の修行課題：' + myTasks.map(function (t) { var s = G.P.tasks[t.id] || { n: 0, done: false }; return esc(t.name) + (s.done ? ' ✓' : '（' + s.n + '/' + t.goal + '）'); }).join('　') + '</p>';
    $('rs-extra').innerHTML = ex;
    nextBox();
  }
  function giftName(id) {
    if (id.indexOf('outfit_cn_') === 0) { var c = charOf(id.slice(10)); return (c ? c.name : '') + '色の装束'; }
    var kinds = ['outfit', 'band', 'weapon', 'trail', 'pose', 'crest'];
    for (var i = 0; i < kinds.length; i++) { var it = D.LOOKS[kinds[i]].filter(function (x) { return x.id === id; })[0]; if (it) return it.name; }
    return id;
  }
  // 次の任務（任務監督の提案は非同期で届く）
  function nextBox() {
    var P = G.P, out = '';
    var st = G.proposalState;
    if (st === 'wait') out += '<div class="mcard" style="cursor:default"><div><span class="tag ai">任務監督</span><h4>次の任務を考えています…</h4><p>間に合わなければ、通常任務で出撃できます。</p></div></div>';
    else if (st && st.proposal) out += missionCard('proposal', st.proposal, (st.gen === 'ai' ? 'AIの提案（検証ずみ）' : st.gen === 'rotation' ? '固定ローテーション' : st.gen === 'cache' ? '同じ構成の提案' : 'ルールで作った提案') + (st.note ? '・' + esc(st.note) : '') + '<br>' + esc(DIR.REASON[st.proposal.reason] ? '理由：' + DIR.REASON[st.proposal.reason] + '提案' : ''));
    else if (st && st.note) out += '<div class="mcard" style="cursor:default"><div><span class="tag ai">任務監督</span><h4>提案はお休み</h4><p>' + esc(st.note) + '</p></div></div>';
    G.normal = G.normal || DIR.normalMission(P);
    out += missionCard('normal', G.normal);
    $('rs-next').innerHTML = out;
    Array.prototype.forEach.call($('rs-next').querySelectorAll('.mcard[data-kind]'), function (b) { b.onclick = function () { G.choice = b.getAttribute('data-kind'); AU.play('click'); nextBox(); }; });
  }

  /* ================= パネル ================= */
  function panel(kind, arg) {
    var t = { mentor: '師匠をえらぶ', train: '修行', looks: '外見', roster: '忍者名鑑', records: '記録・設定', pause: '一時停止', help: '遊び方' }[kind] || '';
    $('panel-title').textContent = t;
    $('panel').hidden = false;
    var body = $('panel-body');
    body.innerHTML = '';
    ({ mentor: pMentor, train: pTrain, looks: pLooks, roster: pRoster, records: pRecords, pause: pPause, help: pHelp }[kind] || function () {})(body, arg);
    G.panelOpen = kind;
  }
  function closePanel() { $('panel').hidden = true; var k = G.panelOpen; G.panelOpen = null; if (G.onPanelClose) G.onPanelClose(k); }
  function hearts(n) { return '♥'.repeat(n) + '♡'.repeat(Math.max(0, 3 - n)); }
  function pMentor(body, sel) {
    var P = G.P;
    sel = sel || P.mentor;
    var c = charOf(sel), lv = PR.bondLevel(P, sel);
    var bonds = (LN[sel] && LN[sel].bond) || [];
    body.innerHTML = '<div class="detail"><img class="art" src="' + artUrl(sel) + '" alt=""><div class="dt"><h3>' + esc(c.name) + '（' + esc(c.clan) + '）</h3>' +
      '<p>「' + esc(lineOf(sel, 'intro')) + '」</p><p>絆 <span style="color:#d8506a">' + hearts(lv) + '</span>（いっしょに出撃すると深まる。セリフと装束の色が増えるだけで、強さは変わりません）</p>' +
      bonds.map(function (b, i) { return '<p>' + (lv >= i + 2 ? '「' + esc(b) + '」' : '<span style="color:#9a9080">（絆 ' + hearts(i + 2) + ' で聞ける話）</span>') + '</p>'; }).join('') +
      (P.mentor === sel ? '<p><b>いまの師匠です</b></p>' : '<button class="btn primary" id="mt-set">この忍者を師匠にする</button>') + '</div></div>' +
      '<h3>39人から師匠をえらぶ <small style="font-weight:500;color:#6b6555">（出撃前の助言と、任務の節目の支援で来てくれます）</small></h3>' +
      '<div class="grid-chars">' + CH.CHARS.map(function (ch) { return '<button class="cc' + (ch.id === sel ? ' sel' : '') + '" data-id="' + ch.id + '"><img src="' + artUrl(ch.id) + '" alt="" loading="lazy">' + esc(ch.name) + '<div class="hearts">' + hearts(PR.bondLevel(P, ch.id)) + '</div></button>'; }).join('') + '</div>';
    var setb = $('mt-set'); if (setb) setb.onclick = function () { P.mentor = sel; G.mentorFresh = true; G.save(); AU.play('click'); toast(c.name + ' が師匠になった'); panel('mentor', sel); };
    Array.prototype.forEach.call(body.querySelectorAll('.cc'), function (b) { b.onclick = function () { panel('mentor', b.getAttribute('data-id')); body.scrollTop = 0; }; });
  }
  function pTrain(body) {
    var P = G.P;
    var h = '<p>修行札：<b>' + P.tokens + '</b>枚（勝つと100枚、負けても突破した襲撃ごとに20枚・最大60枚）</p>';
    h += '<h3>忍術の別の型を解放（修行札' + D.UNLOCK_COST + '）</h3><p style="font-size:12.5px;color:#6b6555">強さを上げるのではなく、えらべる型を増やします。同じ枠に、もとの型か別の型のどちらかを入れます。</p>';
    D.JUTSU_VARIANTS.forEach(function (id) {
      var J = D.JUTSU[id], own = !!P.unlocked[id];
      h += '<div class="unl"><div><b>' + esc(J.name) + '</b>（' + esc(D.JUTSU[J.base].name) + 'の別の型）<br><small>' + esc(J.desc) + '</small></div>' + (own ? '<span>解放ずみ</span>' : '<button class="btn primary" data-u="' + id + '"' + (P.tokens < D.UNLOCK_COST ? ' disabled' : '') + '>解放</button>') + '</div>';
    });
    h += '<h3>役割別の修行課題</h3><p style="font-size:12.5px;color:#6b6555">その役割で出撃したときだけ数えます。達成すると修行札と外見がもらえます。</p>';
    D.ROLE_IDS.forEach(function (r) {
      h += '<p><b style="color:' + D.ROLES[r].color + '">' + D.ROLES[r].name + '</b></p>';
      D.TASKS.filter(function (t) { return t.role === r; }).forEach(function (t) {
        var s = P.tasks[t.id] || { n: 0, done: false };
        h += '<div class="task' + (s.done ? ' done' : '') + '">' + esc(t.name) + '　<small>' + (s.done ? '達成！' : s.n + ' / ' + t.goal) + '　ごほうび：修行札' + t.tokens + '・' + esc(giftName(t.gift)) + '</small><div class="bar"><i style="width:' + Math.round(s.n / t.goal * 100) + '%"></i></div></div>';
      });
    });
    body.innerHTML = h;
    Array.prototype.forEach.call(body.querySelectorAll('[data-u]'), function (b) {
      b.onclick = function () { var r = PR.unlockJutsu(P, b.getAttribute('data-u')); if (r.ok) { G.save(); AU.play('combo'); toast('解放しました。編成でえらべます'); pTrain(body); } else toast(r.reason); };
    });
  }
  function pLooks(body) {
    var P = G.P, L = P.look;
    var kinds = [['outfit', '装束'], ['band', '鉢巻'], ['hair', '髪型'], ['hairColor', '髪の色'], ['weapon', '刀の光'], ['trail', '回避の軌跡'], ['pose', '勝利のポーズ'], ['crest', '隊の紋章']];
    var outfits = D.LOOKS.outfit.filter(function (o) { return o.id.indexOf('outfit_cn_') < 0; }).concat(CH.CHARS.filter(function (c) { return P.owned['outfit_cn_' + c.id]; }).map(function (c) { return { id: 'outfit_cn_' + c.id, name: c.name + '色', top: c.color, bottom: c.color }; }));
    var h = '<div class="looks-wrap"><div class="looks-prev"><div class="fig" id="lk-prev">' + meFig({ pose: D.lookItem('pose', L.pose).pose }) + '</div><div class="crest-mini" style="width:44px;height:44px;margin-top:6px">' + myCrest() + '</div><p style="font-size:12px;color:#6b6555">外見は強さに関係しません。試作版では、課金での購入はありません。</p></div><div class="looks-opts">';
    kinds.forEach(function (k) {
      var list = k[0] === 'outfit' ? outfits : k[0] === 'hairColor' ? D.LOOKS.hairColor.map(function (c) { return { id: c, name: '', color: c }; }) : D.LOOKS[k[0]];
      h += '<h3>' + k[1] + '</h3><div class="chips">' + list.map(function (it) {
        var cur = L[k[0]] === it.id, own = k[0] === 'hair' || k[0] === 'hairColor' || PR.owns(P, it.id);
        var sw = it.top || it.color || it.slash;
        var how = it.lock === 'task' ? '修行課題で' : it.lock === 'weekly' ? '週の任務で' : it.id.indexOf('outfit_cn_') === 0 ? '' : '';
        return '<button class="chip' + (cur ? ' sel' : '') + (own ? '' : ' lock') + '" data-k="' + k[0] + '" data-id="' + it.id + '"' + (own ? '' : ' title="' + how + '手に入る"') + '>' + (sw ? '<span class="sw" style="background:' + sw + '"></span>' : '') + esc(it.name) + (own ? '' : '（' + how + '）') + '</button>';
      }).join('') + '</div>';
    });
    h += '</div></div>';
    body.innerHTML = h;
    Array.prototype.forEach.call(body.querySelectorAll('.chip'), function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-k'), id = b.getAttribute('data-id');
        if (k === 'outfit' && id.indexOf('outfit_cn_') === 0) { if (!P.owned[id]) return; var c = charOf(id.slice(10)); ensureCnOutfit(id, c); }
        if (!PR.setLook(P, k, id)) { toast('まだ手に入れていません'); return; }
        G.save(); AU.play('click'); pLooks(body);
      };
    });
  }
  // 師匠の色の装束（絆 ♥♥♥）を外見の表に足す
  function ensureCnOutfit(id, c) {
    if (!D.LOOKS.outfit.some(function (o) { return o.id === id; }) && c) D.LOOKS.outfit.push({ id: id, name: c.name + '色', top: c.color, bottom: c.color, lock: 'bond' });
  }
  function pRoster(body, sel) {
    var h = '';
    if (sel) {
      var c = charOf(sel);
      h += '<div class="detail"><img class="art" src="' + artUrl(sel) + '" alt=""><div class="dt"><h3>#' + c.num + ' ' + esc(c.name) + '（' + esc(c.en) + '）</h3>' +
        '<dl class="kv"><dt>クラン</dt><dd>' + esc(c.clan) + '</dd><dt>忍術</dt><dd>' + esc(c.jutsu) + '</dd><dt>武器</dt><dd>' + esc(c.weapon) + '</dd><dt>誕生日</dt><dd>' + esc(c.birthday) + '</dd></dl>' +
        (c.bio ? '<p>' + esc(c.bio) + '</p>' : '') + '<p style="font-size:12px;color:#6b6555">公式データ（ninja-dao.com）より。ゲームでの役割・忍術・セリフは本作の創作です。</p>' +
        '<p>「' + esc(lineOf(sel, 'intro')) + '」</p></div></div>' +
        '<a href="' + SHEET_DIR + sel + '.jpg" target="_blank" rel="noopener"><img class="sheet-img" src="' + SHEET_DIR + 'thumb/' + sel + '.jpg" alt="' + esc(c.name) + 'のキャラクターシート" loading="lazy"></a><p style="font-size:12px">キャラクターシート（ゲーム用アレンジ案）をタップすると大きく開きます。</p><h3>ほかの忍者</h3>';
    } else h += '<p>CryptoNinja の39人。夜明け隊では、師匠・依頼人・節目の支援役として登場します。<a href="' + SHEET_DIR + '" target="_blank" rel="noopener">キャラクターシートの一覧</a></p>';
    h += '<div class="grid-chars">' + CH.CHARS.map(function (ch) { return '<button class="cc' + (ch.id === sel ? ' sel' : '') + '" data-id="' + ch.id + '"><img src="' + artUrl(ch.id) + '" alt="" loading="lazy">' + esc(ch.name) + '</button>'; }).join('') + '</div>';
    body.innerHTML = h;
    Array.prototype.forEach.call(body.querySelectorAll('.cc'), function (b) { b.onclick = function () { pRoster(body, b.getAttribute('data-id')); body.scrollTop = 0; }; });
  }
  function pRecords(body) {
    var P = G.P, mt = PR.metrics(P), st = P.stats;
    var pct = function (v) { return v == null ? '—' : v + '%'; };
    var h = '<h3>これまで</h3><dl class="kv"><dt>出撃</dt><dd>' + st.matches + '回（夜明け ' + st.wins + '）</dd><dt>勝率</dt><dd>' + pct(mt.winRate) + '</dd>' +
      '<dt>難易度別</dt><dd>' + D.DIFF_IDS.map(function (d) { var b = st.byDiff[d]; return D.DIFF[d].name + ' ' + (b ? b.w + '/' + b.n : '0/0'); }).join('　') + '</dd>' +
      '<dt>役割別</dt><dd>' + D.ROLE_IDS.map(function (r) { var b = st.byRole[r]; return D.ROLES[r].name + ' ' + (b ? b.w + '/' + b.n : '0/0'); }).join('　') + '</dd>' +
      '<dt>連携・救助</dt><dd>' + st.combos + '回・' + st.rescues + '回</dd><dt>再出撃</dt><dd>' + st.rematches + '回（' + pct(mt.rematchRate) + '）</dd>' +
      '<dt>提案の採用</dt><dd>' + st.proposalsPicked + ' / ' + st.proposalsShown + '（' + pct(mt.proposalPickRate) + '）</dd></dl>';
    var modes = Object.keys(st.byMode);
    if (modes.length) h += '<p style="font-size:12.5px">任務の出し方ごと（' + modes.map(function (k) { var b = st.byMode[k]; return esc(modeName(k)) + '：' + b.w + '/' + b.n + '勝・再出撃' + b.rematch; }).join('／') + '）</p>';
    h += '<h3>最近の出撃</h3><ul class="hist">' + P.history.slice(-8).reverse().map(function (x) { return '<li>' + (x.outcome === 'win' ? '夜明け' : '失敗') + '　' + esc(D.MISSIONS[x.mission] ? D.MISSIONS[x.mission].name : x.mission) + '・' + esc(D.DIFF[x.difficulty] ? D.DIFF[x.difficulty].name : '') + '・' + esc(x.role ? D.ROLES[x.role].name : '') + (x.weekly ? '・週' : '') + (x.proposal ? '・提案' : '') + '</li>'; }).join('') + '</ul>';
    h += '<h3>設定</h3>' +
      row('音', 'sound') + row('画面のゆれ', 'shake') + row('通常攻撃を自動にする（オフ：J キー／クリックで攻撃）', 'autoAtk');
    h += '<h3>任務監督（次の任務の提案）</h3><div class="set-row"><span>提案の作り方</span><select id="dir-mode"><option value="rule">ルールで選ぶ（標準）</option><option value="rotation">固定ローテーション（比べる用）</option><option value="ai">生成AIに問い合わせる（試験）</option></select></div>' +
      '<div class="set-row"><span>AIの接続先（https）</span><input type="url" id="dir-ep" placeholder="https://..." value="' + esc(P.director.endpoint || '') + '"></div>' +
      '<p style="font-size:12px;color:#6b6555">AIに送るのは、役割の組み合わせと、救助・罠・守りなどのおおまかな段階だけです（名前・端末の情報・チャットは送りません）。答えは承認ずみの4任務・敵の予算の中かを確かめ、合わなければルールの提案に戻ります。試合中には問い合わせません。</p>';
    h += '<h3>記録の書き出し</h3><p style="font-size:12.5px">計測のためのできごと（出撃・終了・救助・連携・再出撃・提案の採用など）は、この端末の中だけに残ります。</p><button class="btn" id="rec-export" style="background:var(--night)">JSONで書き出す</button> <button class="btn" id="rec-reset" style="background:#8a2a2a">記録をすべて消す</button>';
    body.innerHTML = h;
    Array.prototype.forEach.call(body.querySelectorAll('input[data-set]'), function (i) { i.onchange = function () { P.settings[i.getAttribute('data-set')] = i.checked; G.applySettings(); G.save(); }; });
    var sel = $('dir-mode'); sel.value = P.director.mode || 'rule'; sel.onchange = function () { P.director.mode = sel.value; P.director.pending = null; G.save(); toast('次の提案から切りかわります'); };
    var ep = $('dir-ep'); ep.onchange = function () { var v = ep.value.trim(); if (v && !/^https:\/\//.test(v)) { toast('https で始まる接続先だけ使えます'); return; } P.director.endpoint = v; G.save(); };
    $('rec-export').onclick = function () {
      var data = JSON.stringify({ app: 'ninja-yoake-tai', rules_version: D.RULES_VERSION, exported: new Date().toISOString(), stats: P.stats, metrics: PR.metrics(P), history: P.history, log: P.log }, null, 1);
      try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'yoake-tai-log.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
      catch (e) { toast('書き出しできませんでした'); }
    };
    $('rec-reset').onclick = function () { ask(body, '記録・修行札・外見をすべて消して、はじめからにしますか？', 'すべて消す', function () { G.resetAll(); }, function () { pRecords(body); }); };
    function row(label, key) { return '<div class="set-row"><span>' + label + '</span><input type="checkbox" data-set="' + key + '"' + (P.settings[key] ? ' checked' : '') + '></div>'; }
  }
  // 確かめる（ブラウザの confirm は、アプリ内の表示や一部の端末で出ないので、パネルの中で聞く）
  function ask(body, msg, okLabel, onOk, onBack) {
    body.innerHTML = '<p style="font-size:16px;font-weight:700">' + esc(msg) + '</p><div class="pause-btns"><button class="btn" id="ask-no" style="background:var(--night)">もどる</button><button class="btn" id="ask-ok" style="background:#8a2a2a">' + esc(okLabel) + '</button></div>';
    $('ask-no').onclick = onBack; $('ask-ok').onclick = onOk;
  }
  function modeName(k) { return { rule: 'ルールの提案', rotation: '固定ローテーション', ai: 'AIの提案', normal: '通常任務', weekly: '週の任務', tutorial: '最初の任務' }[k] || k; }
  function pPause(body) {
    var P = G.P;
    body.innerHTML = '<div class="pause-btns"><button class="btn primary big" id="ps-resume">つづける</button>' +
      '<div class="set-row"><span>音</span><input type="checkbox" data-set="sound"' + (P.settings.sound ? ' checked' : '') + '></div>' +
      '<div class="set-row"><span>画面のゆれ</span><input type="checkbox" data-set="shake"' + (P.settings.shake ? ' checked' : '') + '></div>' +
      '<div class="set-row"><span>通常攻撃を自動にする</span><input type="checkbox" data-set="autoAtk"' + (P.settings.autoAtk ? ' checked' : '') + '></div>' +
      '<button class="btn" id="ps-help" style="background:var(--night)">操作と遊び方</button>' +
      (G.M && G.M.tutorial ? '<button class="btn" id="ps-skip" style="background:#6a4a2a">最初の任務をとばす</button>' : '<button class="btn" id="ps-quit" style="background:#6a2a2a">出撃をやめる（負けとして記録）</button>') + '</div>';
    Array.prototype.forEach.call(body.querySelectorAll('input[data-set]'), function (i) { i.onchange = function () { P.settings[i.getAttribute('data-set')] = i.checked; G.applySettings(); G.save(); }; });
    $('ps-resume').onclick = closePanel;
    $('ps-help').onclick = function () { panel('help', 'pause'); };
    var q = $('ps-quit'); if (q) q.onclick = function () { ask(body, '出撃をやめますか？（負けとして記録されます）', 'やめる', function () { closePanel(); G.quitMatch(); }, function () { pPause(body); }); };
    var sk = $('ps-skip'); if (sk) sk.onclick = function () { closePanel(); G.skipTutorial(); };
  }
  function pHelp(body, from) {
    body.innerHTML = '<h3>目的</h3><p>夜明けまで、里の結界（まんなかの要石）を守ります。準備 → 襲撃 → 準備 → 襲撃 → 最終準備 → 夜明け前（大だるま）の順に進みます。</p>' +
      '<h3>操作</h3><p><b>スマホ：</b>左側をなぞって移動。通常攻撃は近くの妖怪へ自動。右下のボタンで忍術・役割技・回避（タップで自動でねらう／引っぱると自分でねらう）。</p>' +
      '<p><b>PC：</b>WASD／矢印で移動、マウスでねらう。Q・E＝忍術、R／右クリック＝役割技、スペース＝回避、F・G＝罠や補給、B＝焙烙玉、T＝準備完了、1・2・3＝合図、Esc＝一時停止。</p>' +
      '<h3>準備</h3><p>採集場所（竹林・薬草畑・霊石の泉）の輪に立つと素材がたまります。罠の置き場で「まきびし」「爆竹」を置き、結界のそばでは素材で修理できます。</p>' +
      '<h3>連携</h3><p>黄色い「連」マークの付いた妖怪は、連携のチャンス。足止めしてから範囲攻撃／風で誘導して罠へ／結界の中で救助、でふつうより強い効果が出ます。</p>' +
      '<h3>救助</h3><p>ダウンした仲間のそばに3秒いると救助できます（攻撃を受けると止まります）。自分がダウンしたら、画面をタップすると「安全」ピンを立てて、仲間に安全な方向を知らせられます。全員ダウンしても、5秒の間に結界へ這って行けば、1回だけ起き上がれます。</p>' +
      '<h3>合図</h3><p>「集合」「守る」「助けて」で、仲間の動きを変えられます。</p>' +
      (from === 'pause' ? '<button class="btn primary" id="hp-back">もどる</button>' : '');
    var b = $('hp-back'); if (b) b.onclick = function () { panel('pause'); };
  }

  /* ================= 戦闘中の表示 ================= */
  var last = {};
  function set(id, key, v, fn) { if (last[key] === v) return; last[key] = v; fn($(id), v); }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function hudReset() { last = {}; $('team').innerHTML = ''; $('ctx').innerHTML = ''; $('picks').hidden = true; $('downed').hidden = true; $('boss-bar').hidden = true; $('cutin').hidden = true; }
  function totalLen(M) { return M.phases.reduce(function (a, p) { return a + (isFinite(p.dur) ? p.dur : 0); }, 0); }
  function hud(M, me) {
    if (!M || !me) return;
    var inPrep = M.state === 'Preparation' || M.state === 'Intermission';
    set('ph-name', 'ph', M.phase ? M.phase.name : '', function (el, v) { el.textContent = v; });
    set('ph-time', 'pt', isFinite(M.phaseT) ? fmt(M.phaseT) : '', function (el, v) { el.textContent = v; });
    if (!M.tutorial) {
      var done = 0; for (var i = 0; i < M.pi; i++) done += M.phases[i].dur; done += M.phaseLen - Math.max(0, M.phaseT);
      set('dawn-bar', 'dawn', Math.round(done / totalLen(M) * 100), function (el, v) { el.style.width = v + '%'; });
    }
    var bh = Math.max(0, Math.round(M.barrier.hp));
    set('barrier-num', 'bh', bh, function (el, v) { el.textContent = v; });
    set('bar-barrier', 'bw', Math.round(bh / M.barrier.max * 1000) / 10, function (el, v) { el.style.width = v + '%'; el.style.background = v < 30 ? 'linear-gradient(90deg,#ff6a5a,#ffb0a0)' : ''; });
    set('mat-num', 'mat', M.materials, function (el, v) { el.textContent = v; });
    // チーム
    var tm = $('team');
    if (!tm.children.length) tm.innerHTML = M.members.map(function (m) { return '<div class="tm" data-id="' + m.id + '" style="border-left-color:' + D.ROLES[m.role].color + '"><span class="tm-n">' + esc(m.kind === 'human' ? 'あなた' : m.name) + '</span><div class="bar"><i></i></div></div>'; }).join('');
    M.members.forEach(function (m, i) {
      var row = tm.children[i]; if (!row) return;
      var w = m.down ? 0 : Math.round(m.hp / m.maxHp * 100);
      set(null, 'tm' + i, w + (m.down ? 'd' : ''), function () { row.querySelector('i').style.width = w + '%'; row.classList.toggle('down', m.down); });
    });
    // ボス
    var boss = null; M.enemies.forEach(function (e) { if (e.boss) boss = e; });
    set('boss-bar', 'boss', boss ? Math.round(boss.hp / boss.maxHp * 100) : -1, function (el, v) { el.hidden = v < 0; if (v >= 0) { el.querySelector('i').style.width = v + '%'; el.querySelector('span').textContent = D.ENEMY[boss.type].name; } });
    // 目標
    set('objective', 'obj', objText(M), function (el, v) { el.textContent = v; });
    // 技のボタン
    skill('sk-j0', 'j0', me, D.JUTSU[me.jutsu[0]], me.cd.j0, D.JUTSU[me.jutsu[0]].cd * me.mods.cd);
    skill('sk-j1', 'j1', me, D.JUTSU[me.jutsu[1]], me.cd.j1, D.JUTSU[me.jutsu[1]].cd * me.mods.cd);
    skill('sk-sp', 'sp', me, D.ROLES[me.role].special, me.cd.sp, D.ROLES[me.role].special.cd * me.mods.cd);
    skill('sk-dodge', 'dg', me, { name: '回避' }, me.cd.dodge, Math.max(1, D.BAL.dodgeCd + me.mods.dodgeCd));
    // 状況に応じたボタン
    ctxButtons(M, me, inPrep);
    // 強化をえらぶ
    var of = M.offers[me.id];
    var pk = inPrep && of && of.picked == null && of.list.length ? of.list.join(',') : '';
    set('picks', 'picks', pk, function (el, v) {
      el.hidden = !v; if (!v) return;
      el.innerHTML = '<div class="pk-t">強化を1つえらぶ（この夜だけ）</div>' + of.list.map(function (u, i) { return '<button class="pick" data-i="' + i + '"><b>' + esc(D.UPGRADES[u].name) + '</b>' + esc(D.UPGRADES[u].desc) + '</button>'; }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('.pick'), function (b) { b.onclick = function () { IN.setAct('pick:' + b.getAttribute('data-i')); AU.play('combo'); }; });
    });
    set('btn-ready', 'ready', inPrep && !me.ready && !M.tutorial ? 1 : 0, function (el, v) { el.hidden = !v; });
    // ダウン中
    var dtext = '';
    if (me.down) dtext = M.grace > 0 ? '<span class="grace">救済時間 ' + M.grace.toFixed(1) + '</span><br>結界まで這えば、1回だけ起き上がれる！' + (me.graceUsed ? '（もう使った）' : '')
      : 'ダウン中…仲間が助けに来ます' + (me.rescueP > 0 ? '（救助 ' + Math.round(me.rescueP * 100) + '%）' : '') + '<small>画面をタップすると「安全」ピン。移動でゆっくり這えます</small>';
    set('downed', 'down', dtext, function (el, v) { el.hidden = !v; el.innerHTML = v; });
  }
  function objText(M) {
    var o = M.objective; if (o === 'none') return '';
    var t = M.team, O = D.OBJECTIVES[o];
    var p = o === 'trap15' ? '（' + Math.min(15, t.trapKills) + '/15）' : o === 'trap25' ? '（' + Math.min(25, t.trapKills) + '/25）' : o === 'rescue3' ? '（' + Math.min(3, t.rescues) + '/3）'
      : o === 'escortAll' ? '（避難 ' + t.villagersSaved + '・もどった ' + t.villagersLost + '）' : o === 'pillarsBoth' ? '（残り ' + (2 - M.pillarsBroken) + '本）' : o === 'barrier70' ? '（今 ' + Math.round(M.barrier.hp / M.barrier.max * 100) + '%）' : '';
    return '目標：' + O.name + p;
  }
  function skill(id, key, me, S, cd, max) {
    var f = cd > 0 ? Math.min(1, cd / max) : 0;
    var v = S.name + '|' + (cd > 0 ? Math.ceil(cd) : '') + '|' + Math.round(f * 40);
    set(id, 'sk' + key, v, function (el) {
      el.querySelector('.nm').textContent = S.name;
      el.querySelector('.cd').textContent = cd > 0 ? Math.ceil(cd) : '';
      el.style.setProperty('--cd', f.toFixed(3));
      el.classList.toggle('ready', cd <= 0 && !me.down);
    });
  }
  function ctxButtons(M, me, inPrep) {
    var list = [];
    if (!me.down) {
      var spot = null, bd = D.BAL.trapRange;
      M.spots.forEach(function (s) { var d = Math.hypot(s.x - me.x, s.y - me.y); if (d <= bd) { bd = d; spot = s; } });
      G.nearSpot = spot;
      if (spot && inPrep) {
        ['makibishi', 'bakuchiku'].forEach(function (k, i) {
          var T = D.TRAPS[k], cost = Math.max(1, T.cost - (me.role === 'guard' ? 1 : 0) + me.mods.trapCost);
          var cur = M.traps[spot.id];
          if (cur && cur.kind === k) return;
          list.push({ act: 'trap:' + k, label: (cur ? T.name + 'に置きかえ' : T.name + 'を置く'), sub: '素材' + cost, dim: M.materials < cost, key: i ? 'G' : 'F' });
        });
      } else if (spot && !inPrep) G.nearSpot = null;
      var nearB = Math.hypot(M.barrier.x - me.x, M.barrier.y - me.y) <= D.BAL.repairRange;
      if (nearB && inPrep && M.barrier.hp < M.barrier.max) list.push({ hold: 'repair', label: '結界を修理（長押し）', sub: '素材1で+' + D.BAL.repairPer, dim: M.materials < 1, key: 'F' });
      var nearS = Math.hypot(D.MAP.supply.x - me.x, D.MAP.supply.y - me.y) <= D.BAL.supplyRange;
      if (nearS) {
        list.push({ act: 'potion', label: '薬湯', sub: '素材3・40回復', dim: M.materials < 3 || me.hp >= me.maxHp, key: 'F' });
        list.push({ act: 'charm', label: '護り札', sub: '素材3・守り40', dim: M.materials < 3, key: 'G' });
        list.push({ act: 'getbomb', label: '焙烙玉をもらう', sub: '素材3・' + (me.bombs || 0) + '/2', dim: M.materials < 3 || (me.bombs || 0) >= 2 });
      }
      if (me.bombs > 0) list.push({ act: 'bomb', label: '焙烙玉を投げる ×' + me.bombs, sub: '範囲' + D.SUPPLY.bomb.dmg, key: 'B' });
    }
    G.ctxKeys = { ctx1: null, ctx2: null };
    list.forEach(function (b) { if (b.key === 'F' && !G.ctxKeys.ctx1) G.ctxKeys.ctx1 = b.act || b.hold; if (b.key === 'G' && !G.ctxKeys.ctx2) G.ctxKeys.ctx2 = b.act || b.hold; });
    var key = list.map(function (b) { return (b.act || b.hold) + b.label + b.sub + (b.dim ? 1 : 0); }).join('|');
    set('ctx', 'ctx', key, function (el) {
      el.innerHTML = list.map(function (b, i) { return '<button class="cbtn' + (b.dim ? ' dim' : '') + '" data-i="' + i + '">' + esc(b.label) + '<small>' + esc(b.sub) + '</small>' + (b.key ? '<kbd>' + b.key + '</kbd>' : '') + '</button>'; }).join('');
      Array.prototype.forEach.call(el.children, function (btn) {
        var b = list[+btn.getAttribute('data-i')];
        if (b.hold) {
          var on = function (e) { e.preventDefault(); IN.setHold(b.hold); }, off = function () { IN.setHold(null); };
          btn.addEventListener('touchstart', on, { passive: false }); btn.addEventListener('mousedown', on);
          btn.addEventListener('touchend', off); btn.addEventListener('touchcancel', off); btn.addEventListener('mouseup', off); btn.addEventListener('mouseleave', off);
        } else btn.onclick = function () { if (b.dim) { toast(b.act === 'potion' && me.hp >= me.maxHp ? 'HPはまんたんです' : '素材が足りません'); return; } IN.setAct(b.act); AU.play('click'); };
      });
    });
    if (!list.some(function (b) { return b.hold; })) IN.setHold(null);
  }
  function cutin(mentorId, sup) {
    var el = $('cutin'), c = charOf(mentorId);
    el.querySelector('img').src = artUrl(mentorId);
    el.querySelector('b').textContent = (c ? c.name : '') + '（師匠）';
    el.querySelector('span').textContent = lineOf(mentorId, 'support') || '助けに来たぞ！';
    el.querySelector('em').textContent = '節目の支援：' + D.SUPPORTS[sup].name + '（' + D.SUPPORTS[sup].desc + '）';
    el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(function () { el.hidden = true; }, 3200);
  }
  function tut(html) { var el = $('tut'); if (!html) { el.hidden = true; return; } el.innerHTML = html; el.hidden = false; }

  function init(g) {
    G = g;
    $('panel-close').onclick = closePanel;
    $('panel').addEventListener('click', function (e) { if (e.target === $('panel')) closePanel(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'), function (b) { b.onclick = function () { AU.play('click'); panel(b.getAttribute('data-panel')); }; });
    Array.prototype.forEach.call(document.querySelectorAll('.pings button'), function (b) {
      b.addEventListener('click', function () { IN.setPing(b.getAttribute('data-ping')); AU.play('ping'); });
      b.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
    });
  }

  var api = { init: init, show: show, toast: toast, banner: banner, title: title, plaza: plaza, loadout: loadout, result: result, nextBox: nextBox, missions: missions, panel: panel, closePanel: closePanel, hud: hud, hudReset: hudReset, cutin: cutin, tut: tut, crestSvg: crestSvg, lineOf: lineOf, charOf: charOf, artUrl: artUrl, ensureCnOutfit: ensureCnOutfit, fmt: fmt, esc: esc };
  root.NYT_UI = api;
})(typeof window !== 'undefined' ? window : globalThis);
