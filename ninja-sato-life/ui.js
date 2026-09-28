/* ニンジャ里ライフ — 画面（パネル・会話・来訪・最初の10分・修行・写真・訪問・店・設定・音） */
(function () {
  'use strict';
  var G = window.NSL, D = NSL_DATA, R = NSL_RULES, C = NSL_CLERK, CH = NSL_CHARS, I = NSL_ISO, A = NinjaArt;
  var $ = G.$;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  /* ================= 音（その場で合成） ================= */
  var ac = null;
  G.sfx = function (name) {
    var vol = G.S ? G.S.settings.volume : 0.6; if (!vol) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      var t = ac.currentTime;
      var tone = function (f, d, type, v, when) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(f, t + (when || 0));
        g.gain.setValueAtTime(0.0001, t + (when || 0)); g.gain.exponentialRampToValueAtTime((v || 0.2) * vol, t + (when || 0) + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (when || 0) + d);
        o.connect(g); g.connect(ac.destination); o.start(t + (when || 0)); o.stop(t + (when || 0) + d + 0.05);
      };
      if (name === 'tap') tone(880, 0.06, 'triangle', 0.08);
      else if (name === 'place') { tone(220, 0.12, 'triangle', 0.25); tone(330, 0.1, 'triangle', 0.15, 0.05); }
      else if (name === 'harvest') { tone(784, 0.1, 'sine', 0.18); tone(1047, 0.14, 'sine', 0.16, 0.08); }
      else if (name === 'coin') { tone(1319, 0.08, 'square', 0.08); tone(1760, 0.16, 'square', 0.08, 0.07); }
      else if (name === 'level') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.18, i * 0.1); }); }
      else if (name === 'ng') tone(160, 0.18, 'sawtooth', 0.08);
      else if (name === 'talk') tone(660, 0.05, 'sine', 0.1);
      else if (name === 'kakon') { tone(520, 0.05, 'square', 0.12); tone(260, 0.2, 'triangle', 0.2, 0.03); }
    } catch (e) { }
  };

  /* ================= 小物 ================= */
  var toastT = 0;
  G.toast = function (msg, ms) {
    var el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, ms || 2300);
  };
  G.modal = function (html, btns) {
    $('#modal-body').innerHTML = html;
    var box = $('#modal-btns'); box.innerHTML = '';
    (btns || [{ label: 'とじる', cls: 'primary' }]).forEach(function (b) {
      var el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
      el.addEventListener('click', function () { if (!b.keep) $('#modal').hidden = true; if (b.fn) b.fn(); });
      box.appendChild(el);
    });
    $('#modal').hidden = false;
  };
  G.closeModal = function () { $('#modal').hidden = true; };
  G.confirm = function (html, fn, okLabel) { G.modal('<p>' + html + '</p>', [{ label: 'やめる', cls: 'ghost' }, { label: okLabel || 'OK', cls: 'primary', fn: fn }]); };
  var faceCache = {};
  G.face = function (id, opt) {
    var key = id + (opt ? JSON.stringify(opt) : '');
    if (faceCache[key]) return faceCache[key];
    var def = id === 'me' ? CH.apprenticeArt(G.S.player.set, G.S.player.hair, G.S.player.outfit) : CH.BY_ID[id].art;
    var s = A.render(def, Object.assign({ yaw: -12, pose: 'stand', shadow: false, prop: false, companions: false }, opt || {}));
    if (id !== 'me') faceCache[key] = s;
    return s;
  };
  function resIcon(k) { return '<i class="ic ic-' + k + '"></i>'; }
  function costHtml(cost, have) {
    if (!cost) return '<span>ごほうびの品</span>';
    var n = { coin: 'コイン', wood: '木材', herb: '薬草', seal: '交流印' }, out = [];
    for (var k in cost) { var short = have && (have[k] || 0) < cost[k]; out.push('<span class="' + (short ? 'short' : '') + '">' + n[k] + cost[k] + '</span>'); }
    return out.join('');
  }
  function rewardHtml(rw) {
    var out = [], n = { coin: '🪙 里コイン', wood: '🪵 木材', herb: '🌿 薬草', seal: '🎴 交流印' };
    for (var k in rw) { if (k === 'item') out.push('<span>🎁 ' + D.ITEM[rw.item].name + '</span>'); else if (k === 'outfit') out.push('<span>👘 ' + D.SHOP.filter(function (s) { return s.id === rw.outfit; })[0].name + '</span>'); else if (n[k] && rw[k]) out.push('<span>' + n[k] + ' +' + rw[k] + '</span>'); }
    return '<div class="reward">' + out.join('') + '</div>';
  }
  G.rewardHtml = rewardHtml;

  /* ================= 上の表示 ================= */
  G.hud = function () {
    var S = G.S; if (!S || G.mode !== 'home') return;
    var cp = R.caps(S);
    $('#r-coin').textContent = S.res.coin; $('#r-wood').textContent = S.res.wood; $('#r-herb').textContent = S.res.herb; $('#r-seal').textContent = S.res.seal;
    $('#c-wood').textContent = '/' + cp.wood; $('#c-herb').textContent = '/' + cp.herb;
    document.querySelector('.chip[data-res=wood]').classList.toggle('full', S.res.wood >= cp.wood);
    document.querySelector('.chip[data-res=herb]').classList.toggle('full', S.res.herb >= cp.herb);
    var li = R.levelInfo(S);
    $('#lv-num').textContent = S.village.level; $('#lv-name').textContent = li.name;
    $('#lv-badge').classList.toggle('can', li.canLevel);
    $('#mail-badge').hidden = !S.mailbox.length; $('#mail-n').textContent = S.mailbox.length;
    $('#clock-note').hidden = G.synced || location.protocol === 'file:';
    var nq = S.quests.active.filter(function (q) { return q.state === 'open' || (q.state === 'active' && R.questProgress(S, q).ready); }).length;
    $('#nav-q').hidden = !nq; $('#nav-q').textContent = nq;
    questCard();
    markQuestNpcs();
  };
  G.hudLite = function () {
    var S = G.S; if (!S) return;
    $('#r-coin').textContent = S.res.coin; $('#r-wood').textContent = S.res.wood; $('#r-herb').textContent = S.res.herb; $('#r-seal').textContent = S.res.seal;
    if (panelName === 'quests') { } // パネルは開いたときに描く
  };
  function questCard() {
    var S = G.S, el = $('#quest-card');
    var q = S.quests.active.filter(function (x) { return x.qid === S.trackQ; })[0] || S.quests.active.filter(function (x) { return x.state === 'active'; })[0] || S.quests.active[0];
    if (!q || G.build.on) { el.hidden = true; return; }
    var t = D.QUEST[q.template], pr = R.questProgress(S, q);
    el.hidden = false; el.classList.toggle('ready', q.state === 'active' && pr.ready);
    var btn = q.state === 'open' ? '<button class="btn small">受ける</button>' : (pr.ready ? '<button class="btn small primary">納品</button>' : '');
    el.innerHTML = (q.npc ? '<div class="qc-face">' + G.face(q.npc) + '</div>' : '') + '<div><div class="qc-t">' + esc(t.title) + '</div><div class="qc-p">' + esc(pr.label) + '</div>' + (q.reason ? '<div class="qc-reason">里の変化：' + esc(D.REASONS[q.reason].label) + '</div>' : '') + '</div>' + btn;
    el.onclick = function (e) {
      if (e.target.tagName === 'BUTTON') { if (q.state === 'open') acceptQ(q); else deliverQ(q); e.stopPropagation(); return; }
      G.openPanel('quests');
    };
  }
  function markQuestNpcs() {
    var S = G.S, open = {};
    S.quests.active.forEach(function (q) { if (q.npc && (q.state === 'open' || R.questProgress(S, q).ready)) open[q.npc] = 1; });
    G.walkers.forEach(function (w) { w.questMark = !!open[w.id]; });
  }
  $('#lv-badge').addEventListener('click', function () { G.openPanel('quests', 'goal'); });
  $('#mail-badge').addEventListener('click', function () { G.openPanel('menu', 'mail'); });
  document.querySelectorAll('.chip').forEach(function (b) { b.addEventListener('click', function () { var k = b.dataset.res, S = G.S, cp = R.caps(S); G.toast({ coin: '里コイン：依頼や売却でふえる（課金通貨ではありません）', wood: '木材：里のまわりの竹やぶで採集。上限' + cp.wood, herb: '薬草：畑で10分に5個。上限' + cp.herb, seal: '交流印：依頼や住民との交流でもらえる' }[k], 3200); }); });

  /* ================= パネル ================= */
  var panelName = null, panelTab = null;
  G.openPanel = function (name, tab) {
    if (G.mode !== 'home') return;
    if (name === 'build') { closeTalk(); G.closePanel(); openBuildPanel(tab); return; }
    panelName = name; panelTab = tab || null;
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.panel === name); });
    closeTalk();
    renderPanel();
    $('#panel').hidden = false;
  };
  G.closePanel = function () { $('#panel').hidden = true; panelName = null; document.querySelectorAll('#nav button').forEach(function (b) { b.classList.remove('on'); }); };
  $('#panel-close').addEventListener('click', function () { G.closePanel(); G.onPanelClosed && G.onPanelClosed(); });
  document.querySelectorAll('#nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      G.sfx('tap');
      if (panelName === b.dataset.panel) { G.closePanel(); return; }
      if (G.build.on && b.dataset.panel !== 'build') G.setBuild(false);
      G.openPanel(b.dataset.panel);
    });
  });
  function tabs(list, cur, fn) {
    var box = $('#panel-tabs'); box.innerHTML = '';
    list.forEach(function (t) { var b = document.createElement('button'); b.textContent = t[1]; if (t[0] === cur) b.className = 'on'; b.addEventListener('click', function () { fn(t[0]); }); box.appendChild(b); });
  }
  function renderPanel() {
    var body = $('#panel-body'); body.innerHTML = ''; $('#panel-tabs').innerHTML = '';
    var S = G.S;
    if (panelName === 'quests') questsPanel(body);
    else if (panelName === 'people') peoplePanel(body);
    else if (panelName === 'visit') visitPanel(body);
    else if (panelName === 'shop') shopPanel(body);
    else if (panelName === 'menu') menuPanel(body);
  }
  G.refreshPanel = function () { if (panelName) renderPanel(); };

  /* ---------- 依頼 ---------- */
  function acceptQ(q) {
    var r = R.acceptQuest(G.S, q.qid); if (!r.ok) return;
    G.S.trackQ = q.qid; G.sfx('talk'); G.toast('依頼を受けました：' + D.QUEST[q.template].title);
    G.save(); G.hud(); G.refreshPanel(); G.tutHook && G.tutHook('quest_accept', q);
  }
  function deliverQ(q) {
    var S = G.S, t = D.QUEST[q.template];
    var pv = R.previewGrant(S, t.reward);
    var go = function () {
      var r = R.deliverQuest(S, q.qid, q.claimId);
      if (!r.ok) { if (!r.dup) G.toast(r.reason); return; }
      G.sfx('coin');
      var npc = q.npc ? CH.BY_ID[q.npc] : null;
      var extra = G.tutHook ? G.tutHook('quest_done', q) : null;
      var html = '<div class="big-emoji">🎉</div><h3>依頼達成！「' + esc(t.title) + '」</h3>' + (npc ? '<p>' + esc(npc.name) + '「' + esc(q.reason ? 'ありがとう！ 里が変わったおかげだね。' : 'ありがとう！ 助かったよ。') + '」</p>' : '') + rewardHtml(t.reward) + (extra && extra.html ? extra.html : '') + (r.got.hasOver ? '<div class="note">上限をこえた分（' + G.costText(r.got.over) + '）は受け取り箱に入れました。</div>' : '');
      var btns = [];
      var placeItem = t.reward.item || (extra && extra.item);
      if (placeItem) btns.push({ label: 'さっそく里に置く', cls: 'primary', fn: function () { G.closePanel(); G.startPlace(placeItem); G.tutHook && G.tutHook('place_reward', placeItem); } });
      btns.push({ label: placeItem ? 'あとで' : 'OK', cls: placeItem ? 'ghost' : 'primary', fn: function () { rateAsk(q); G.tutStart && G.tutStart(); } });
      G.modal(html, btns);
      G.save(); G.hud(); G.refreshPanel();
      afterQuestDone(q);
    };
    if (pv.hasOver) G.confirm('いま受け取ると、上限をこえる ' + G.costText(pv.over) + ' は<b>受け取り箱</b>に入ります（なくなりません）。受け取りますか？', go, '受け取る');
    else go();
  }
  // 依頼係の比較実験：「里に合っていた？」（生成した依頼だけ・ときどき）
  function rateAsk(q) {
    if (!q.gen || q.gen === 'rule' || !G.S.tutorial.done) return;
    if (Math.random() > 0.6) return;
    G.modal('<h3>ひとこと</h3><p>今の依頼は、あなたの里に合っていましたか？</p>', [
      { label: 'あまり', cls: 'ghost', fn: function () { R.rateQuest(G.S, q.template, q.gen, false); G.save(); } },
      { label: '合っていた', cls: 'primary', fn: function () { R.rateQuest(G.S, q.template, q.gen, true); G.save(); } }
    ]);
  }
  function afterQuestDone(q) {
    var S = G.S;
    if (!S.tutorial.done) return;
    C.generate(S, { kind: 'quest_done', npc: q.npc }).then(function (res) {
      var nq = C.commit(S, res);
      C.refill(S);
      if (nq) G.toast('新しい依頼が届きました');
      G.save(); G.hud(); G.refreshPanel();
    });
  }
  function questsPanel(body) {
    var S = G.S;
    $('#panel-title').textContent = '依頼';
    var tab = panelTab || 'list';
    tabs([['list', '依頼（' + S.quests.active.length + '）'], ['goal', '里の目標'], ['theme', '週のお題']], tab, function (t) { panelTab = t; renderPanel(); });
    if (tab === 'goal') return goalPanel(body);
    if (tab === 'theme') return themePanel(body);
    if (!S.quests.active.length) { body.innerHTML = '<p class="muted">いまは依頼がありません。里に物を置くと、住民から依頼が届くことがあります。</p>'; return; }
    var list = document.createElement('div'); list.className = 'list';
    S.quests.active.forEach(function (q) {
      var t = D.QUEST[q.template], pr = R.questProgress(S, q), npc = q.npc ? CH.BY_ID[q.npc] : null;
      var el = document.createElement('div'); el.className = 'item';
      el.innerHTML = (npc ? '<div class="face">' + G.face(q.npc) + '</div>' : '') +
        '<div class="grow"><div class="t">' + esc(t.title) + (q.state === 'active' ? ' <span class="tag">受注中</span>' : '') + '</div>' +
        '<div class="s">' + (npc ? esc(npc.name) + '「' + esc(q.text) + '」' : esc(q.text)) + '</div>' +
        (q.reason ? '<div class="reason">🌱 里の変化から：' + esc(D.REASONS[q.reason].label) + '</div>' : '') +
        (q.note ? '<div class="s">' + esc(q.note) + '</div>' : '') +
        '<div class="s">目的：' + esc(pr.label) + '</div><div class="bar"><i style="width:' + Math.round(pr.cur / pr.n * 100) + '%"></i></div>' +
        '<div class="rw">報酬：' + esc(rewardText(t.reward)) + '</div></div>';
      var acts = document.createElement('div'); acts.className = 'acts';
      if (q.state === 'open') { var b = document.createElement('button'); b.className = 'btn small primary'; b.textContent = '受ける'; b.onclick = function () { acceptQ(q); }; acts.appendChild(b); }
      else {
        var b2 = document.createElement('button'); b2.className = 'btn small ' + (pr.ready ? 'primary' : ''); b2.textContent = '納品'; b2.disabled = !pr.ready; b2.onclick = function () { deliverQ(q); }; acts.appendChild(b2);
        var b3 = document.createElement('button'); b3.className = 'btn small ghost'; b3.textContent = S.trackQ === q.qid ? '追跡中' : '追跡'; b3.onclick = function () { S.trackQ = q.qid; G.save(); G.hud(); G.closePanel(); trackHint(q); }; acts.appendChild(b3);
      }
      el.appendChild(acts); list.appendChild(el);
    });
    body.appendChild(list);
    body.insertAdjacentHTML('beforeend', '<p class="muted">報酬は依頼の種類ごとに決まっています。依頼係（' + (S.settings.clerkMode === 'ai' ? 'AI案・試験中' : 'ルール') + '）は、里に置いた物に合わせて依頼を選びます（1日2回まで）。</p>');
  }
  function rewardText(rw) { var o = []; if (rw.coin) o.push('コイン' + rw.coin); if (rw.wood) o.push('木材' + rw.wood); if (rw.herb) o.push('薬草' + rw.herb); if (rw.seal) o.push('交流印' + rw.seal); if (rw.item) o.push(D.ITEM[rw.item].name); return o.join('・'); }
  function trackHint(q) {
    var t = D.QUEST[q.template], nd = t.need;
    var tip = nd.kind === 'give' ? (nd.res === 'herb' ? '畑の🌿をタップして収穫しよう' : '里のまわりの竹やぶ🪵で採集しよう') : nd.kind === 'place' ? '下の「建築」から置こう' : nd.kind === 'near' ? '建築で縁台を水辺の近くに置こう' : nd.act === 'train' ? (nd.at === 'water' ? '池や鹿威しをタップして修行しよう' : '修行場をタップして修行しよう') : nd.act === 'photo' ? 'メニューの「写真を撮る」' : nd.act === 'visit' ? '下の「訪問」から見本の里へ' : nd.act === 'gather' ? '里のまわりの竹やぶ🪵をタップ' : '畑の🌿をタップ';
    G.toast('追跡：' + tip, 3200);
  }
  function goalPanel(body) {
    var S = G.S, li = R.levelInfo(S), L = D.LEVELS;
    var h = '<h3>里Lv' + S.village.level + '「' + esc(li.name) + '」</h3>';
    if (li.max) h += '<p>試作版の上限（Lv3）です。ここから先（Lv4 派遣・Lv5 テーマ収集帳）は準備中です。</p>';
    else {
      h += '<p class="muted">里レベルは課題の達成で上がります（所持金では上がりません）。</p><div class="list">';
      li.tasks.forEach(function (t) { h += '<div class="item"><div class="grow">' + (t.done ? '✅ ' : '⬜ ') + esc(t.label) + '</div></div>'; });
      h += '</div><p>次のLv' + (S.village.level + 1) + 'で解放：' + esc(li.next.unlock) + '</p>';
    }
    h += '<h3>解放の順番</h3><div class="list">' + [1, 2, 3, 4, 5].map(function (n) { return '<div class="item"><div class="grow"><b>Lv' + n + '</b> ' + esc(L[n].unlock) + (L[n].future ? '（準備中）' : '') + '</div>' + (S.village.level >= n && !L[n].future ? '✅' : '') + '</div>'; }).join('') + '</div>';
    var e = R.nextExpand(S);
    if (e) h += '<h3>敷地を広げる</h3><p>' + S.village.size + '×' + S.village.size + ' → ' + e.size + '×' + e.size + '（里Lv' + e.level + '・' + G.costText(e.cost) + '）</p>';
    body.innerHTML = h;
    if (li.canLevel) { var b = document.createElement('button'); b.className = 'btn big primary'; b.textContent = '里Lv' + (S.village.level + 1) + 'に上げる！'; b.onclick = doLevelUp; body.prepend(b); }
    if (e) { var b2 = document.createElement('button'); b2.className = 'btn'; b2.textContent = '敷地を' + e.size + '×' + e.size + 'に広げる'; b2.disabled = S.village.level < e.level; b2.onclick = function () { var r = R.expand(S); if (!r.ok) { G.toast(r.reason + (r.missing ? '（あと' + G.costText(r.missing) + '）' : '')); return; } G.sfx('level'); G.dirtyGround = true; G.outer = I.outerTrees(S); G.save(); G.hud(); G.toast('敷地が ' + r.size + '×' + r.size + ' になりました！'); renderPanel(); }; body.appendChild(b2); }
  }
  function doLevelUp() {
    var r = R.levelUp(G.S); if (!r.ok) { G.toast(r.reason); return; }
    G.sfx('level');
    G.modal('<div class="big-emoji">🏯</div><h3>里Lv' + r.level + 'になりました！</h3><p>解放：' + esc(r.unlock) + '</p>' + (r.reward ? rewardHtml(r.reward) : ''), [{ label: 'やった！', cls: 'primary' }]);
    G.save(); G.hud(); G.refreshPanel();
    C.refill(G.S);
  }
  function themePanel(body) {
    var S = G.S, c = R.currentTheme(S);
    R.event(S, 'theme_preview', { id: c.theme.id });
    var h = '<h3>今週のお題：「' + esc(c.theme.name) + '」</h3><p class="muted">' + esc(c.theme.hint) + '。手持ちの素材で完成できます。お題は毎週かわり、また巡ってきます。</p><div class="list">';
    c.prog.forEach(function (p) { h += '<div class="item"><div class="grow">' + (p.done ? '✅ ' : '⬜ ') + esc(p.label) + '</div></div>'; });
    h += '</div><p>ごほうび：' + esc(rewardText(c.theme.reward)) + '</p>';
    body.innerHTML = h;
    if (c.done) body.insertAdjacentHTML('beforeend', '<div class="note">今週のお題は完成ずみ！ 写真に撮って残しておこう。</div>');
    else if (c.ready) { var b = document.createElement('button'); b.className = 'btn big primary'; b.textContent = 'お題を完成させる'; b.onclick = function () { var r = R.completeTheme(S); if (r.ok) { G.sfx('level'); G.modal('<div class="big-emoji">🎊</div><h3>お題「' + esc(c.theme.name) + '」完成！</h3>' + rewardHtml(r.reward) + '<p>写真に撮って、記念に残そう。</p>', [{ label: '写真を撮る', cls: 'primary', fn: G.takePhoto }, { label: 'OK' }]); G.save(); G.hud(); renderPanel(); } }; body.appendChild(b); }
  }

  /* ---------- 建築 ---------- */
  var buildTab = 'facility';
  function thumb(id, rot) {
    var it = D.ITEM[id], spr = I.spriteFor(id, rot || 0, 1, G.S.village.theme, it.prod ? JSON.stringify({ ready: true, grow: 1 }) : null, 1);
    var c = document.createElement('canvas'); c.width = 176; c.height = 144;
    var x = c.getContext('2d'), sc = Math.min(176 / spr.w, 144 / spr.h);
    x.drawImage(spr.cv, (176 - spr.w * sc) / 2, (144 - spr.h * sc) / 2, spr.w * sc, spr.h * sc);
    return c;
  }
  G.thumb = thumb;
  function openBuildPanel(tab) {
    if (tab) buildTab = tab;
    panelName = 'build';
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.panel === 'build'); });
    var S = G.S;
    $('#panel-title').textContent = '建築';
    tabs([['facility', '施設'], ['furniture', '家具'], ['garden', '庭'], ['inv', '倉庫'], ['edit', '配置を直す']], buildTab, function (t) { buildTab = t; openBuildPanel(); });
    var body = $('#panel-body'); body.innerHTML = '';
    if (buildTab === 'edit') {
      body.innerHTML = '<p>里の物をタップして選び、「移動」「↻ 回す」「倉庫へ」「強化」ができます。置き直しは何度でも無料です。倉庫に戻しても、買った物や施設のレベルはなくなりません。</p>';
      var b = document.createElement('button'); b.className = 'btn big primary'; b.textContent = '配置を直す'; b.onclick = function () { G.closePanel(); G.setBuild(true); G.hud(); };
      body.appendChild(b); $('#panel').hidden = false; return;
    }
    var grid = document.createElement('div'); grid.className = 'grid';
    var items = D.ITEMS.filter(function (it) {
      if (buildTab === 'inv') return (S.inv[it.id] || 0) > 0;
      return it.cat === buildTab && !it.reward;
    });
    if (buildTab === 'inv' && !items.length) body.innerHTML = '<p class="muted">倉庫は空です。置いた物を「倉庫へ」戻したり、ごほうびでもらった物がここに入ります。</p>';
    items.forEach(function (it) {
      var el = document.createElement('div'); el.className = 'card';
      var locked = it.unlock && S.village.level < it.unlock, full = it.max && R.countItem(S, it.id) >= it.max;
      if (locked || full) el.classList.add('locked');
      el.appendChild(thumb(it.id));
      var line = locked ? '<span class="lockt">里Lv' + it.unlock + 'で解放</span>' : full ? '<span class="lockt">置けるのは' + it.max + 'つまで</span>' : S.inv[it.id] ? '倉庫から無料' : costHtml(it.cost, S.res);
      el.insertAdjacentHTML('beforeend', '<div class="nm">' + esc(it.name) + '</div><div class="cost">' + line + '</div>' + (S.inv[it.id] ? '<span class="own">×' + S.inv[it.id] + '</span>' : ''));
      el.title = it.desc;
      el.addEventListener('click', function () {
        if (locked) { G.toast(it.name + 'は里Lv' + it.unlock + 'で解放されます'); return; }
        if (full) { G.toast(it.name + 'は' + it.max + 'つまでです'); return; }
        G.closePanel(); G.startPlace(it.id); G.hud();
        G.toast(it.name + '：ドラッグで動かし「✓ 決定」', 2000);
      });
      grid.appendChild(el);
    });
    body.appendChild(grid);
    body.insertAdjacentHTML('beforeend', '<p class="muted">建物の性能は施設レベルで決まり、外観（店の外観テーマ）では変わりません。置ける数の上限は' + D.BAL.maxObjects + '個です（いま' + S.objs.length + '個）。</p>');
    $('#panel').hidden = false;
  }

  /* ---------- 住民・名鑑 ---------- */
  function peoplePanel(body) {
    var S = G.S, tab = panelTab || 'res';
    $('#panel-title').textContent = '住民';
    var met = Object.keys(S.met).length;
    tabs([['res', '住民（' + R.residentCount(S) + '/' + R.residentCap(S) + '）'], ['zukan', '忍者名鑑（' + met + '/39）']], tab, function (t) { panelTab = t; renderPanel(); });
    if (tab === 'zukan') return zukanPanel(body);
    var list = document.createElement('div'); list.className = 'list';
    Object.keys(S.residents).forEach(function (id) {
      var r = S.residents[id], ch = CH.BY_ID[id], st = R.bondStage(r.bond), home = r.home ? R.getObj(S, r.home) : null;
      var el = document.createElement('div'); el.className = 'item';
      el.innerHTML = '<div class="face">' + G.face(id) + '</div><div class="grow"><div class="t">' + esc(ch.name) + ' <span class="hearts">' + '❤'.repeat(st) + '♡'.repeat(5 - st) + '</span></div>' +
        '<div class="s">親交段階' + st + ' ／ 居場所：' + (home ? esc(D.ITEM[home.id].name) : (r.starter ? '里のどこでも' : 'なし')) + '</div>' +
        '<div class="s">' + (r.memories.length ? '最近の思い出：' + esc(r.memories[r.memories.length - 1].text) : '次の交流：話しかける・薬草をわたす') + '</div></div>';
      var b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'くわしく'; b.onclick = function () { residentDetail(id); };
      el.appendChild(b); list.appendChild(el);
    });
    body.appendChild(list);
    body.insertAdjacentHTML('beforeend', '<p class="muted">来訪した忍者は、2回目の来訪で「住まない？」と誘えます。その忍者の居場所（好きな置物）が空いていて、里の定員に余裕があることが条件です。定員は里レベルと小屋のレベルで増えます。</p>');
  }
  function residentDetail(id) {
    var S = G.S, r = S.residents[id], ch = CH.BY_ID[id], st = R.bondStage(r.bond);
    var mem = r.memories.length ? r.memories.map(function (m) { return '<li>段階' + m.stage + '：' + esc(m.text) + '</li>'; }).join('') : '<li class="muted">まだありません</li>';
    G.modal('<div style="display:flex;gap:10px;align-items:center"><div class="face" style="width:80px;height:80px;border-radius:50%;overflow:hidden;background:#efe4cf">' + G.face(id).replace('<svg', '<svg style="width:108px;height:130px;margin:-10px 0 0 -14px"') + '</div><div><h3>' + esc(ch.name) + '</h3><div class="hearts">' + '❤'.repeat(st) + '♡'.repeat(5 - st) + '</div><div class="muted">' + esc(ch.note) + '</div></div></div>' +
      '<h3>思い出</h3><ul>' + mem + '</ul><p class="muted">好きなもの：' + ch.likes.map(function (t) { return '<span class="tag">' + esc(D.TAG_NAMES[t]) + '</span>'; }).join('') + '　居場所：' + esc(D.ITEM[ch.home].name) + '</p>',
      [{ label: '名鑑を見る', fn: function () { zukanDetail(id); } }, { label: 'とじる', cls: 'primary' }]);
  }
  function zukanPanel(body) {
    var S = G.S, grid = document.createElement('div'); grid.className = 'zukan';
    CH.CHARS.forEach(function (ch) {
      var met = !!S.met[ch.id], res = !!S.residents[ch.id];
      var el = document.createElement('div'); el.className = 'zk' + (met ? '' : ' unmet') + (res ? ' res' : '');
      el.innerHTML = G.face(ch.id) + '<b>' + (met ? esc(ch.name) : '？？？') + '</b>' + ch.num;
      el.onclick = function () { if (met) zukanDetail(ch.id); else G.toast('まだ会っていません。ヒント：' + ch.likes.map(function (t) { return D.TAG_NAMES[t]; }).join('・') + 'の物が好きらしい', 3000); };
      grid.appendChild(el);
    });
    body.appendChild(grid);
    body.insertAdjacentHTML('beforeend', '<p class="muted">里に好きな物があると、その忍者が遊びに来ます。会った忍者はキャラクターシート（まえ・ななめ・よこ・うしろ・しぐさ・うごき）を見られます。</p>');
  }
  function zukanDetail(id) {
    var S = G.S, ch = CH.BY_ID[id], m = S.met[id] || {};
    var html = '<h3>#' + ch.num + ' ' + esc(ch.name) + ' <small class="muted">' + esc(ch.en) + '</small></h3>' +
      '<img class="official" src="img/art/' + id + '.jpg" alt="' + esc(ch.name) + 'の公式イラスト" loading="lazy">' +
      '<dl class="kv"><dt>クラン</dt><dd>' + esc(ch.clan) + '</dd><dt>忍術</dt><dd>' + esc(ch.jutsu) + '</dd><dt>武器</dt><dd>' + esc(ch.weapon) + '</dd><dt>誕生日</dt><dd>' + esc(ch.birthday) + '</dd><dt>来訪</dt><dd>' + (m.visits || 0) + '回' + (S.residents[id] ? '（住民）' : '') + '</dd></dl>' +
      (ch.bio ? '<p style="clear:both">' + esc(ch.bio) + '</p>' : '<p style="clear:both"></p>') +
      '<p class="muted">里での様子（ゲームの設定）：' + esc(ch.note) + '<br>好きなもの：' + ch.likes.map(function (t) { return '<span class="tag">' + esc(D.TAG_NAMES[t]) + '</span>'; }).join('') + '　居場所：' + esc(D.ITEM[ch.home].name) + '</p>' +
      '<h3>キャラクターシート</h3><a href="sheets/' + id + '.jpg" target="_blank" rel="noopener"><img class="sheet-img" src="sheets/thumb/' + id + '.jpg" alt="' + esc(ch.name) + 'のキャラクターシート" loading="lazy"></a><p class="muted">タップで大きな画像（1536×1024）。公式のイラストをもとにしたゲーム用アレンジ案です。</p>';
    G.modal(html, [{ label: 'とじる', cls: 'primary' }]);
  }
  G.zukanDetail = zukanDetail;

  /* ---------- 訪問 ---------- */
  function visitPanel(body) {
    var S = G.S;
    $('#panel-title').textContent = '訪問';
    var vb = S.visitBonus.day === R.dayKey(S.clock.hwm) ? S.visitBonus.count : 0;
    body.innerHTML = '<p class="muted">よその里は見るだけで、物を動かしたり持ち帰ったりはできません。訪問ボーナス：今日 ' + vb + '/' + D.BAL.visitBonus.perDay + '回</p><h3>見本の里（運営）</h3>';
    var list = document.createElement('div'); list.className = 'list';
    D.SAMPLES.forEach(function (sm) {
      var el = document.createElement('div'); el.className = 'item';
      el.innerHTML = '<div class="face">' + G.face(sm.residents[0]) + '</div><div class="grow"><div class="t">' + esc(sm.name) + '</div><div class="s">' + esc(sm.note) + '</div></div>';
      var b = document.createElement('button'); b.className = 'btn small primary'; b.textContent = '見に行く'; b.onclick = function () { G.closePanel(); G.visitSample(sm.id); };
      el.appendChild(b); list.appendChild(el);
    });
    body.appendChild(list);
    body.insertAdjacentHTML('beforeend', '<h3>友だちの里</h3>');
    if (S.village.level < 3) { body.insertAdjacentHTML('beforeend', '<p class="muted">里Lv3で解放されます。合言葉（見学コード）で友だちの里を見たり、自分の里を見せたりできます。</p>'); return; }
    body.insertAdjacentHTML('beforeend', '<p class="muted">見学コードは、里の配置だけを文字にしたものです（名前・持ち物・記録は入りません）。</p>');
    var mine = document.createElement('button'); mine.className = 'btn'; mine.textContent = '自分の里の見学コードをつくる'; mine.onclick = shareMine;
    var enter = document.createElement('button'); enter.className = 'btn primary'; enter.textContent = 'コードで友だちの里へ'; enter.onclick = enterCode;
    var row = document.createElement('div'); row.className = 'row'; row.appendChild(mine); row.appendChild(enter); body.appendChild(row);
  }
  // 見学コード：JSON → 圧縮（使えれば）→ base64url
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var s = atob(t), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  G.encode = function (obj) {
    var bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'undefined') return Promise.resolve('NSL0.' + b64u(bytes));
    var cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(cs).arrayBuffer().then(function (buf) { return 'NSL1.' + b64u(new Uint8Array(buf)); });
  };
  G.decode = function (code) {
    code = String(code || '').trim().replace(/^.*#visit=/, '');
    if (code.length > 60000) return Promise.reject(new Error('長すぎます'));
    var m = /^NSL([01])\.([A-Za-z0-9_-]+)$/.exec(code);
    if (!m) return Promise.reject(new Error('コードの形がちがいます'));
    var bytes = unb64u(m[2]);
    if (m[1] === '0') return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('この端末では読めません'));
    var ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(ds).text().then(function (t) { return JSON.parse(t); });
  };
  // コピーできない端末では、コードの文字を選んだ状態にする（長押しでコピー）
  function copyText(text) {
    var fallback = function () { var ta = document.querySelector('#modal textarea.code'); if (ta) { ta.focus(); ta.select(); } G.toast('コピーできませんでした。選んだ文字を長押ししてコピーしてください', 3200); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { G.toast('コピーしました'); }, fallback); return; } } catch (e) { }
    fallback();
  }
  function shareMine() {
    var S = G.S;
    G.encode(R.shareData(S)).then(function (code) {
      var url = location.origin + location.pathname + '#visit=' + code;
      G.modal('<h3>自分の里の見学コード</h3><p class="muted">相手が里Lv3なら、このリンクかコードで見学できます。</p><textarea class="code" readonly>' + esc(url) + '</textarea>', [
        { label: 'コピー', keep: true, fn: function () { copyText(url); } },
        { label: '共有', keep: true, fn: function () { if (navigator.share) navigator.share({ title: 'ニンジャ里ライフ：' + S.village.name, url: url }).catch(function () { }); else G.toast('この端末では共有ボタンが使えません'); } },
        { label: 'とじる', cls: 'primary' }]);
    });
  }
  function enterCode() {
    G.modal('<h3>見学コードを入力</h3><textarea class="code" id="code-in" placeholder="NSL1.… またはリンク"></textarea>', [
      { label: 'やめる', cls: 'ghost' },
      { label: '見に行く', cls: 'primary', fn: function () { var t = document.getElementById('code-in').value; G.visitCode(t); } }]);
  }
  G.visitCode = function (code) {
    G.decode(code).then(function (data) {
      var hid = G.S.hidden || [];
      if (hid.indexOf(code.slice(-24)) >= 0) { G.toast('この里は非表示にしています'); return; }
      var vs = R.visitState(data, Date.now());
      if (!vs) throw new Error('読めません');
      G.startVisit(vs, { name: vs.village.name, note: '友だちの里（見るだけ）', friend: true, key: code.slice(-24) });
    }).catch(function (e) { G.toast('見学コードを読めませんでした（' + e.message + '）'); });
  };
  G.visitSample = function (id) {
    var sm = D.SAMPLES.filter(function (x) { return x.id === id; })[0];
    var vs = R.visitState({ n: sm.name, l: sm.level, s: sm.size, t: sm.theme, r: sm.residents, o: sm.objs.map(function (o) { return [o[0], o[1], o[2], o[3], 2]; }) }, Date.now());
    G.startVisit(vs, { name: sm.name, note: sm.note, sample: id });
  };
  G.startVisit = function (vs, meta) {
    G.setBuild(false); closeTalk(); G.closePanel();
    G.visitMeta = meta; G.homeWalkers = G.walkers; G.walkers = [];
    G.homeCam = { x: G.cam.x, y: G.cam.y, z: G.cam.z };
    G.mode = 'visit'; G.view = vs; G.outer = I.outerTrees(vs); G.dirtyGround = true;
    Object.keys(vs.residents).forEach(function (id, i) { var P = R.plot(vs), blk = G.blocked(); for (var k = 0; k < 40; k++) { var x = P.x0 + 1 + ((i * 5 + k * 3) % (vs.village.size - 2)), y = P.y0 + 2 + ((i * 3 + k * 7) % (vs.village.size - 3)); if (!blk[x + ',' + y]) { G.spawn(id, 'resident', x, y); break; } } });
    $('#hud').classList.add('hidden'); $('#nav').classList.add('hidden'); $('#visit-bar').hidden = false;
    $('#visit-name').textContent = meta.name; $('#visit-note').textContent = meta.note + (meta.friend ? '' : '（運営の見本）');
    $('#visit-report').hidden = !meta.friend;
    G.fitPlot();
    var S = G.S; S.stats.visits++; R.bumpAct(S, 'visit', 1); R.event(S, 'village_visit', { kind: meta.friend ? 'friend' : 'sample', id: meta.sample || '' }); G.save();
    G.tutHook && G.tutHook('visit');
  };
  G.endVisit = function () {
    G.mode = 'home'; G.view = G.S; G.walkers = G.homeWalkers || []; G.outer = I.outerTrees(G.S); G.dirtyGround = true;
    if (G.homeCam) { G.cam.x = G.homeCam.x; G.cam.y = G.homeCam.y; G.cam.z = G.homeCam.z; }
    $('#visit-bar').hidden = true; $('#hud').classList.remove('hidden'); $('#nav').classList.remove('hidden');
    G.hud(); G.tutHook && G.tutHook('visit_back');
  };
  $('#visit-back').addEventListener('click', function () { G.endVisit(); });
  document.querySelectorAll('[data-react]').forEach(function (b) {
    b.addEventListener('click', function () {
      var S = G.S, today = R.dayKey(S.clock.hwm), key = (G.visitMeta.sample || G.visitMeta.key || '') + today;
      if (S.visitBonus.day !== today) S.visitBonus = { day: today, count: 0, seen: {} };
      var msg = '「' + b.dataset.react + '」を送りました';
      if (!S.visitBonus.seen[key] && S.visitBonus.count < D.BAL.visitBonus.perDay) { S.visitBonus.seen[key] = 1; S.visitBonus.count++; R.grant(S, { coin: D.BAL.visitBonus.coin }, '訪問ボーナス'); msg += '（訪問ボーナス +' + D.BAL.visitBonus.coin + 'コイン）'; G.sfx('coin'); }
      R.event(S, 'visit_reaction', { r: b.dataset.react }); G.save(); G.toast(msg);
      G.walkers.forEach(function (w) { w.emote = { text: b.dataset.react === 'すてき' ? '👏' : b.dataset.react === 'なごむ' ? '🍵' : '✨', until: G.time + 2.5 }; });
    });
  });
  $('#visit-report').addEventListener('click', function () {
    G.confirm('この里を通報して、この端末では表示しないようにします。<br><small class="muted">試作版にはサーバーがないため、通報はこの端末の記録にだけ残ります。</small>', function () {
      var S = G.S; S.hidden = S.hidden || []; S.hidden.push(G.visitMeta.key); R.event(S, 'visit_report', {}); G.save(); G.endVisit(); G.toast('非表示にしました');
    }, '通報して非表示');
  });
  G.visitTalk = function (w) { var ch = CH.BY_ID[w.id]; showTalk(w.id, ch.name, ch.talk[Math.floor(Math.random() * ch.talk.length)], [{ label: 'とじる', fn: closeTalk }]); };

  /* ---------- 店 ---------- */
  function shopPanel(body) {
    var S = G.S, tab = panelTab || 'outfit';
    $('#panel-title').textContent = '店';
    tabs([['outfit', '衣装'], ['theme', '外観'], ['set', '家具セット'], ['frame', '額縁']], tab, function (t) { panelTab = t; renderPanel(); });
    body.insertAdjacentHTML('beforeend', '<div class="note">この試作版の店は<b>里コイン</b>だけで買えます。お金を使う買い物・ガチャはありません。外見だけで、性能は変わりません。</div>');
    var list = document.createElement('div'); list.className = 'list';
    D.SHOP.filter(function (x) { return x.kind === tab; }).forEach(function (it) {
      var owned = R.shopOwned(S, it);
      var el = document.createElement('div'); el.className = 'item';
      var pv = '';
      if (it.kind === 'outfit') pv = '<div class="face">' + A.render(CH.apprenticeArt(S.player.set, S.player.hair, Object.assign({ id: it.id }, it.outfit)), { yaw: -12, shadow: false }) + '</div>';
      if (it.kind === 'set') pv = '<div class="s">含まれる品：' + Object.keys(it.items).map(function (k) { return D.ITEM[k].name + '×' + it.items[k]; }).join('・') + '</div>';
      el.innerHTML = (it.kind === 'outfit' ? pv : '') + '<div class="grow"><div class="t">' + esc(it.name) + (owned ? ' <span class="tag">購入済み</span>' : '') + '</div><div class="s">' + esc(it.desc) + '</div>' + (it.kind !== 'outfit' ? pv : '') + '<div class="rw">' + (it.price.coin ? '🪙 ' + it.price.coin + ' 里コイン' : '無料') + '</div></div>';
      var acts = document.createElement('div'); acts.className = 'acts';
      var pb = document.createElement('button'); pb.className = 'btn small'; pb.textContent = it.kind === 'outfit' ? '試着' : '見本';
      pb.onclick = function () { previewShop(it); };
      acts.appendChild(pb);
      var bb = document.createElement('button'); bb.className = 'btn small primary'; bb.textContent = owned ? (it.kind === 'set' ? '購入済み' : '使う') : '買う';
      bb.disabled = owned && it.kind === 'set';
      bb.onclick = function () {
        if (owned) { useShop(it); return; }
        G.confirm(esc(it.name) + 'を ' + (it.price.coin || 0) + ' 里コインで買いますか？', function () {
          var r = R.buy(S, it.id);
          if (!r.ok) { G.toast(r.reason); return; }
          G.sfx('coin'); G.toast(it.name + 'を手に入れました'); G.save(); G.hud(); renderPanel();
          if (it.kind === 'set') G.toast('家具は倉庫に入りました（建築 → 倉庫）', 2600);
        }, '買う');
      };
      acts.appendChild(bb); el.appendChild(acts); list.appendChild(el);
    });
    body.appendChild(list);
    var rs = document.createElement('button'); rs.className = 'btn ghost'; rs.textContent = '購入の復元'; rs.onclick = function () {
      var got = R.restorePurchases(S, S.purchases);
      G.toast(got.length ? '復元しました：' + got.join('・') : '復元するものはありません（購入の記録は引き継ぎコードにも入っています）', 3000); G.save(); renderPanel();
    };
    body.appendChild(rs);
  }
  function previewShop(it) {
    var S = G.S;
    R.event(S, 'theme_preview', { id: it.id });
    if (it.kind === 'outfit') { G.modal('<h3>試着：' + esc(it.name) + '</h3><div style="text-align:center">' + A.render(CH.apprenticeArt(S.player.set, S.player.hair, Object.assign({ id: it.id }, it.outfit)), { yaw: -20, w: 200, h: 240 }) + A.render(CH.apprenticeArt(S.player.set, S.player.hair, Object.assign({ id: it.id }, it.outfit)), { yaw: 180, w: 150, h: 180 }) + '</div><p class="muted">表示した衣装がそのまま手に入ります。</p>'); return; }
    if (it.kind === 'theme') {
      var c = document.createElement('canvas'); c.width = 360; c.height = 200;
      var x = c.getContext('2d'); x.fillStyle = '#a7d273'; x.fillRect(0, 0, 360, 200);
      ['koya', 'souko', 'chaya'].forEach(function (id, i) { var spr = I.spriteFor(id, 0, 1, it.theme, null, 1); x.drawImage(spr.cv, 10 + i * 118, 190 - spr.h * 0.95, spr.w * 0.9, spr.h * 0.9); });
      G.modal('<h3>見本：' + esc(it.name) + '</h3><div id="pv-box"></div><p class="muted">外観だけが変わります。生産性能は共通です。</p>');
      document.getElementById('pv-box').appendChild(c); c.style.width = '100%'; return;
    }
    if (it.kind === 'set') {
      var box = '<div class="grid" id="pv-grid"></div>';
      G.modal('<h3>' + esc(it.name) + '</h3><p>含まれる品</p>' + box);
      var g = document.getElementById('pv-grid');
      Object.keys(it.items).forEach(function (k) { var d = document.createElement('div'); d.className = 'card'; d.appendChild(G.thumb(k)); d.insertAdjacentHTML('beforeend', '<div class="nm">' + esc(D.ITEM[k].name) + ' ×' + it.items[k] + '</div>'); g.appendChild(d); });
      return;
    }
    if (it.kind === 'frame') { G.takePhoto(it.frame, true); }
  }
  function useShop(it) {
    var S = G.S;
    if (it.kind === 'outfit') { S.player.outfit = Object.assign({ id: it.id }, it.outfit); G.toast(it.name + 'に着がえました'); }
    if (it.kind === 'theme') { S.village.theme = it.theme; G.toast('外観を「' + D.THEME_NAMES[it.theme] + '」にしました'); }
    if (it.kind === 'frame') { S.player.frame = it.frame; G.toast('写真の額縁を「' + it.name + '」にしました'); }
    G.save(); renderPanel();
  }

  /* ---------- メニュー ---------- */
  function menuPanel(body) {
    var S = G.S, tab = panelTab || 'main';
    $('#panel-title').textContent = 'メニュー';
    tabs([['main', 'いろいろ'], ['mail', '受取箱 ' + S.mailbox.length], ['settings', '設定'], ['log', '記録'], ['move', '引継ぎ']], tab, function (t) { panelTab = t; renderPanel(); });
    if (tab === 'mail') {
      if (!S.mailbox.length) { body.innerHTML = '<p class="muted">受け取り箱は空です。上限をこえた報酬はここに入り、なくなりません。</p>'; return; }
      var list = document.createElement('div'); list.className = 'list';
      S.mailbox.forEach(function (m) {
        var el = document.createElement('div'); el.className = 'item';
        el.innerHTML = '<div class="grow"><div class="t">' + esc(G.costText(m.res)) + '</div><div class="s">' + esc(m.from) + '</div></div>';
        var b = document.createElement('button'); b.className = 'btn small primary'; b.textContent = '受け取る';
        b.onclick = function () { var r = R.claimMailbox(S, m.id); if (Object.keys(r.left || {}).length) G.toast('上限のため一部だけ受け取りました（' + G.costText(r.got) + '）'); else G.toast('受け取りました'); G.save(); G.hud(); renderPanel(); };
        el.appendChild(b); list.appendChild(el);
      });
      body.appendChild(list); return;
    }
    if (tab === 'settings') return settingsPanel(body);
    if (tab === 'log') return logPanel(body);
    if (tab === 'move') return movePanel(body);
    var acts = [
      ['📷 写真を撮る', function () { G.closePanel(); G.takePhoto(); }],
      ['👘 着がえ', dressAgain],
      ['🏯 外観を切りかえる', themePick],
      ['🍵 茶屋で素材を売る', sellMenu],
      ['🗺 里の全体を見る', function () { G.closePanel(); G.fitPlot(); }],
      ['❓ 遊び方', function () { location.href = 'about.html'; }],
      ['🏠 タイトルへ', function () { G.save(true); location.reload(); }]
    ];
    var grid = document.createElement('div'); grid.className = 'list';
    acts.forEach(function (a) { var b = document.createElement('button'); b.className = 'btn'; b.textContent = a[0]; b.onclick = a[1]; grid.appendChild(b); });
    body.appendChild(grid);
    body.insertAdjacentHTML('beforeend', '<p class="muted">記録はこの端末の中だけに保存されます（外部に送りません）。キャラクター：CryptoNinja（CC0・Ninja DAO）。本作は非公式ファンゲームです。</p>');
  }
  function themePick() {
    var S = G.S;
    G.modal('<h3>外観</h3><p class="muted">持っている外観から選べます（性能は共通）。</p>', S.owned.theme.map(function (t) { return { label: D.THEME_NAMES[t] + (S.village.theme === t ? '（使用中）' : ''), cls: S.village.theme === t ? 'primary' : '', fn: function () { S.village.theme = t; G.save(); } }; }).concat([{ label: 'とじる', cls: 'ghost' }]));
  }
  function sellMenu() {
    var S = G.S;
    if (!S.objs.some(function (o) { return o.id === 'chaya'; })) { G.toast('茶屋を建てると、余った素材を売れます'); return; }
    G.modal('<h3>茶屋で売る</h3><p>木材' + D.BAL.sell.wood.per + ' → コイン' + D.BAL.sell.wood.coin + '　薬草' + D.BAL.sell.herb.per + ' → コイン' + D.BAL.sell.herb.coin + '（茶屋のレベルで少しよくなる）</p><p class="muted">いま：木材' + S.res.wood + '・薬草' + S.res.herb + '</p>', [
      { label: '木材を売る', keep: true, fn: function () { var r = R.sell(S, 'wood', 1); G.toast(r.ok ? 'コイン+' + r.coin : r.reason); if (r.ok) { G.sfx('coin'); G.save(); G.hud(); } } },
      { label: '薬草を売る', keep: true, fn: function () { var r = R.sell(S, 'herb', 1); G.toast(r.ok ? 'コイン+' + r.coin : r.reason); if (r.ok) { G.sfx('coin'); G.save(); G.hud(); } } },
      { label: 'とじる', cls: 'primary' }]);
  }
  function settingsPanel(body) {
    var S = G.S, st = S.settings;
    body.innerHTML = '<h3>音</h3><input type="range" min="0" max="1" step="0.1" id="set-vol" value="' + st.volume + '" style="width:100%">' +
      '<h3>依頼係の方式</h3><label><input type="radio" name="clerk" value="rule"' + (st.clerkMode !== 'ai' ? ' checked' : '') + '> ルール（標準）</label><br><label><input type="radio" name="clerk" value="ai"' + (st.clerkMode === 'ai' ? ' checked' : '') + '> AI案（試験）</label>' +
      '<p class="muted">AI案は、接続先を入れたときだけ使います。接続先がない・8秒をこえた・承認外の答えのときは、自動でルールの依頼になります。里の施設タグ・レベル・最近の依頼・在庫の目安・住民IDだけを送り、自由な文章や購入の記録は送りません。</p>' +
      '<details><summary>開発者向け：AI案の接続先</summary><input type="url" id="set-ai" placeholder="https://..." value="' + esc(st.aiEndpoint || '') + '" style="width:100%;padding:8px;border:2px solid #d9cbb0;border-radius:8px"></details>' +
      '<h3>データ</h3><button class="btn red" id="set-reset">最初からやり直す</button>';
    $('#set-vol').oninput = function (e) { st.volume = +e.target.value; G.save(); };
    document.querySelectorAll('input[name=clerk]').forEach(function (r) { r.onchange = function () { st.clerkMode = r.value; G.save(); }; });
    $('#set-ai').onchange = function (e) { var v = e.target.value.trim(); st.aiEndpoint = /^https:\/\//.test(v) ? v : ''; G.save(); };
    $('#set-reset').onclick = function () { G.confirm('里のデータをすべて消して、最初からやり直します。元に戻せません。', function () { try { localStorage.removeItem('nsl_save_v1'); localStorage.removeItem('nsl_save_v1_bak'); } catch (e) { } location.reload(); }, '消してやり直す'); };
  }
  function logPanel(body) {
    var S = G.S, m = R.metrics(S);
    var yn = function (b) { return b ? '✅ はい' : '—'; };
    body.innerHTML = '<p class="muted">設計書 §11 の指標を、この端末の分だけ数えています（外部には送りません）。テストの参加者に「書き出し」を送ってもらえば集計できます。</p>' +
      '<dl class="kv"><dt>初回装飾</dt><dd>' + yn(m.firstDecoration) + '</dd><dt>同じ回に再配置</dt><dd>' + yn(m.rearrangedSameSession) + '</dd><dt>翌日も遊んだ</dt><dd>' + yn(m.d1) + '</dd><dt>遊んだ日数</dt><dd>' + m.sessions + '</dd>' +
      '<dt>置いた</dt><dd>' + m.placed + '</dd><dt>動かした</dt><dd>' + m.moved + '</dd><dt>依頼受注</dt><dd>' + m.questAccept + '</dd><dt>依頼達成</dt><dd>' + m.questComplete + '</dd><dt>訪問</dt><dd>' + m.visits + '</dd><dt>写真</dt><dd>' + m.photos + '</dd><dt>店の見本</dt><dd>' + m.themePreview + '</dd>' +
      '<dt>依頼の評価</dt><dd>ルール ' + m.clerk.rule[0] + '/' + m.clerk.rule[1] + '　里の変化 ' + m.clerk.gen[0] + '/' + m.clerk.gen[1] + '（合っていた/回答数）</dd></dl>';
    var b = document.createElement('button'); b.className = 'btn'; b.textContent = '記録を書き出す（JSON）';
    b.onclick = function () { var blob = new Blob([JSON.stringify({ metrics: m, events: S.events }, null, 1)], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ninja-sato-life-log.json'; a.click(); };
    body.appendChild(b);
  }
  function movePanel(body) {
    var S = G.S;
    body.innerHTML = '<p>別の端末に里を引っ越すための「引き継ぎコード」です。購入の記録（里コインの買い物）も入っているので、新しい端末で「購入の復元」ができます。</p>';
    var out = document.createElement('button'); out.className = 'btn'; out.textContent = '引き継ぎコードをつくる';
    out.onclick = function () { G.encode(S).then(function (code) { G.modal('<h3>引き継ぎコード</h3><p class="muted">他人には見せないでください（里のすべてが入っています）。</p><textarea class="code" readonly>' + esc(code) + '</textarea>', [{ label: 'コピー', keep: true, fn: function () { copyText(code); } }, { label: 'とじる', cls: 'primary' }]); }); };
    var inn = document.createElement('button'); inn.className = 'btn'; inn.textContent = 'コードを読みこむ';
    inn.onclick = function () {
      G.modal('<h3>引き継ぎコードを読みこむ</h3><p class="muted">いまの里は上書きされます。</p><textarea class="code" id="mv-in"></textarea>', [{ label: 'やめる', cls: 'ghost' }, { label: '読みこむ', cls: 'red', fn: function () {
        var t = document.getElementById('mv-in').value.trim();
        G.decode(t).then(function (data) {
          var s2 = R.migrate(data); if (!s2 || !s2.village) throw new Error('形がちがいます');
          s2.readOnly = false; G.S = s2; G.view = s2; G.save(true); location.reload();
        }).catch(function (e) { G.toast('読みこめませんでした（' + e.message + '）'); });
      } }]);
    };
    var row = document.createElement('div'); row.className = 'row'; row.appendChild(out); row.appendChild(inn); body.appendChild(row);
  }

  /* ================= 会話 ================= */
  function showTalk(id, name, text, btns) {
    $('#talk-face').innerHTML = G.face(id);
    $('#talk-name').textContent = name;
    $('#talk-text').textContent = text;
    var box = $('#talk-btns'); box.innerHTML = '';
    btns.forEach(function (b) { var el = document.createElement('button'); el.className = 'btn small ' + (b.cls || ''); el.textContent = b.label; el.onclick = b.fn; box.appendChild(el); });
    $('#talk').hidden = false;
    G.sfx('talk');
  }
  function closeTalk() { var was = !$('#talk').hidden; $('#talk').hidden = true; if (G.talkW) { G.talkW.busy = false; G.talkW = null; } if (was && G.tutorialActive && G.tutorialActive() && G.S.tutorial.step === 6) G.tutStart(); }
  G.closeTalk = closeTalk;
  G.openTalk = function (w) {
    var S = G.S, ch = CH.BY_ID[w.id];
    if (!ch) return;
    G.closePanel();
    w.busy = true; w.path = []; G.talkW = w; w.faceYaw = -20;
    var me = G.walker('me'); if (me) { var t = { x: Math.floor(w.x), y: Math.floor(w.y) + 1 }; G.walkTo(me, t.x, t.y); }
    if (G.tutHook && G.tutHook('talk', w)) return;
    // 住民の依頼があれば先に
    var q = S.quests.active.filter(function (x) { return x.npc === w.id && (x.state === 'open' || R.questProgress(S, x).ready); })[0];
    if (q && w.kind === 'resident') {
      var t2 = D.QUEST[q.template], pr = R.questProgress(S, q);
      if (q.state === 'open') { showTalk(w.id, ch.name, q.text + '（ごほうび：' + rewardText(t2.reward) + '）', [{ label: '受ける', cls: 'primary', fn: function () { acceptQ(q); closeTalk(); } }, { label: 'あとで', fn: closeTalk }]); return; }
      showTalk(w.id, ch.name, 'たのんでいた「' + t2.title + '」、できたんだね！', [{ label: '納品する', cls: 'primary', fn: function () { closeTalk(); deliverQ(q); } }, { label: 'あとで', fn: closeTalk }]);
      return;
    }
    if (w.kind === 'visitor') return visitorTalk(w, ch);
    residentTalk(w, ch);
  };
  function residentTalk(w, ch) {
    var S = G.S, r = S.residents[w.id];
    var near = S.objs.some(function (o) { return o.id === ch.home && Math.abs(o.x - w.x) + Math.abs(o.y - w.y) < 3; });
    var lines = ch.talk.concat(near ? [ch.like] : []);
    var text = lines[Math.floor(Math.random() * lines.length)];
    var res = R.talk(S, w.id);
    if (res.first) text += '（親交+1）';
    if (res.bond && res.bond.memo) text += '\n📖 思い出：' + res.bond.memo.text;
    G.save(); G.hud();
    var btns = [{ label: 'もっと話す', fn: function () { showTalk(w.id, ch.name, ch.talk[Math.floor(Math.random() * ch.talk.length)], btns); } },
      { label: '薬草をわたす（5）', fn: function () { var g = R.giftHerb(S, w.id); if (!g.ok) { G.toast(g.reason); return; } G.sfx('coin'); G.save(); G.hud(); showTalk(w.id, ch.name, 'わあ、ありがとう！（親交+2）' + (g.bond && g.bond.memo ? '\n📖 ' + g.bond.memo.text : ''), btns); } },
      { label: 'くわしく', fn: function () { closeTalk(); residentDetail(w.id); } },
      { label: 'とじる', cls: 'primary', fn: closeTalk }];
    showTalk(w.id, ch.name, text, btns);
    w.emote = { text: '♪', until: G.time + 2 };
  }
  function visitorTalk(w, ch) {
    var S = G.S;
    if (!w.greeted) {
      w.greeted = true;
      var m = R.meet(S, w.id);
      var gift = m.first ? { coin: 15 } : { coin: 5 };
      if (m.first && Math.random() < 0.5) gift.seal = 1;
      R.grant(S, gift, ch.name + 'のおみやげ');
      G.save(); G.hud(); G.sfx('coin');
      var text = (m.first ? ch.greet : ch.talk[0]) + (w.why ? '\n（' + D.TAG_NAMES[w.why] + 'の物が気になって来たみたい）' : '') + '\n🎁 おみやげ：' + G.costText(gift) + (m.first ? '\n📘 忍者名鑑に登録！' : '');
      var btns = [];
      var mv = R.canMoveIn(S, w.id);
      if (mv.ok) btns.push({ label: 'この里に住まない？', cls: 'primary', fn: function () { invite(w, ch, mv.home); } });
      btns.push({ label: '名鑑を見る', fn: function () { closeTalk(); zukanDetail(w.id); } });
      btns.push({ label: 'ゆっくりしていってね', fn: closeTalk });
      showTalk(w.id, ch.name, text, btns);
      if (!mv.ok && m.visits >= 2 && !S.residents[w.id]) G.toast(ch.name + 'を誘うには：' + mv.reason, 3600);
      return;
    }
    var mv2 = R.canMoveIn(S, w.id);
    var btns2 = [{ label: 'とじる', cls: 'primary', fn: closeTalk }];
    if (mv2.ok) btns2.unshift({ label: 'この里に住まない？', fn: function () { invite(w, ch, mv2.home); } });
    showTalk(w.id, ch.name, ch.talk[Math.floor(Math.random() * ch.talk.length)], btns2);
  }
  function invite(w, ch, home) {
    var S = G.S, r = R.addResident(S, w.id, home.uid);
    if (!r.ok) { G.toast(r.reason); return; }
    w.kind = 'resident'; w.leaveAt = null;
    G.sfx('level'); G.save(); G.hud();
    showTalk(w.id, ch.name, ch.move + '\n🏡 ' + ch.name + 'が住民になりました！（居場所：' + D.ITEM[home.id].name + '）', [{ label: 'ようこそ！', cls: 'primary', fn: closeTalk }]);
    var t = G.nearTile(home); if (t) G.walkTo(w, t.x, t.y);
  }

  /* ================= 来訪（好きな物に反応して来る） ================= */
  G.nextVisit = 0;
  G.visitorTick = function () {
    var S = G.S;
    if (G.mode !== 'home' || !S.tutorial.done || document.hidden) return;
    // 帰る時間
    G.walkers.forEach(function (w) {
      if (w.kind === 'visitor' && w.leaveAt && G.time > w.leaveAt && !w.busy && !w.leaving) {
        w.leaving = true; var gt = I.gateOf(S);
        if (!G.walkTo(w, gt.x, gt.y + 1, function () { w.gone = true; })) w.gone = true;
      }
    });
    var visitors = G.walkers.filter(function (w) { return w.kind === 'visitor'; }).length;
    if (visitors >= 2 || G.time < G.nextVisit) return;
    G.nextVisit = G.time + 40 + Math.random() * 50;
    spawnVisitor();
  };
  function spawnVisitor(prefer) {
    var S = G.S, ex = G.walkers.map(function (w) { return w.id; });
    var ws = R.visitorWeights(S, ex);
    if (!ws.length) return null;
    var pick = null;
    if (prefer) pick = ws.filter(function (x) { return x.id === prefer; })[0];
    if (!pick) { var sum = 0; ws.forEach(function (x) { sum += x.w; }); var r = Math.random() * sum; for (var i = 0; i < ws.length; i++) { r -= ws[i].w; if (r <= 0) { pick = ws[i]; break; } } pick = pick || ws[0]; }
    var gt = I.gateOf(S), w = G.spawn(pick.id, 'visitor', gt.x, gt.y + 1);
    w.why = pick.why; w.leaveAt = G.time + 110 + Math.random() * 60;
    var ch = CH.BY_ID[pick.id];
    var tgt = S.objs.filter(function (o) { return o.id === ch.home; })[0] || S.objs.filter(function (o) { return D.ITEM[o.id].tags.indexOf(pick.why) >= 0; })[0];
    var t = tgt ? G.nearTile(tgt, gt) : null;
    if (t) G.walkTo(w, t.x, t.y, function () { w.emote = { text: '！', until: G.time + 4 }; });
    G.toast((S.met[pick.id] ? '' : 'だれか来たよ！ ') + ch.name + 'が遊びに来ました', 2600);
    R.event(S, 'visitor_arrive', { id: pick.id, why: pick.why });
    return w;
  }
  G.spawnVisitor = spawnVisitor;

  /* ================= 物をタップしたとき ================= */
  G.onObjTap = function (o) {
    var S = G.S, it = D.ITEM[o.id];
    if (o.id === 'shugyoba') { G.openTraining(''); return; }
    var waterQ = S.quests.active.some(function (q) { var t = D.QUEST[q.template]; return q.state === 'active' && t.need.kind === 'act' && t.need.act === 'train' && t.need.at === 'water'; });
    if (it.tags.indexOf('water') >= 0 && waterQ) { G.openTraining('water'); return; }
    if (o.id === 'chaya') { sellMenu(); return; }
    if (o.id === 'shishiodoshi') G.sfx('kakon');
    if (it.prod) { var fi = R.fieldInfo(S, o); G.toast('畑 Lv' + (o.lv || 1) + '：' + (fi.full ? 'いっぱい（' + fi.stored + '回分）' : '次の収穫まで ' + Math.ceil(fi.nextMs / 60000) + '分・たまっている ' + fi.stored + '/' + fi.keep + '回分') + (G.synced ? '' : '（時刻は仮）'), 2600); return; }
    var who = o.home ? CH.BY_ID[o.home].name + 'の居場所。' : '';
    G.toast(it.name + (it.levels ? ' Lv' + (o.lv || 1) : '') + '：' + who + (o.origin ? '（由来：' + o.origin + '）' : it.desc), 2600);
  };

  /* ================= 置いたあと（依頼係・来訪・お題） ================= */
  G.afterPlace = function (res, rotated) {
    var S = G.S, it = D.ITEM[res.obj.id];
    G.tutHook && G.tutHook('placed', res, rotated);
    if (!S.tutorial.done) return;
    var trig = null;
    if (res.firstOfItem && it.cat === 'facility') trig = { kind: 'first_facility', tag: it.tags[0], item: it.id };
    else if (res.newTags && res.newTags.length) trig = { kind: 'new_tag', tag: res.newTags[0] };
    if (trig && C.TAG_REASON[trig.tag]) {
      C.generate(S, trig).then(function (r) {
        var q = C.commit(S, r);
        if (q) { G.toast((q.npc ? CH.BY_ID[q.npc].name + 'から' : '') + '新しい依頼：「' + D.QUEST[q.template].title + '」' + (q.reason ? '（' + D.REASONS[q.reason].label + '）' : ''), 3200); }
        G.save(); G.hud();
      });
    }
    // 好きな物を置いたら、その忍者が来やすくなる
    var fans = CH.CHARS.filter(function (c) { return !S.residents[c.id] && (c.home === it.id || c.likes.some(function (t) { return it.tags.indexOf(t) >= 0; })); });
    if (fans.length) G.nextVisit = Math.min(G.nextVisit, G.time + 10);
    // 住民が反応
    G.walkers.forEach(function (w) {
      if (w.kind !== 'resident') return;
      var ch = CH.BY_ID[w.id];
      if (ch && (ch.home === it.id || ch.likes.some(function (t) { return it.tags.indexOf(t) >= 0; }))) { w.emote = { text: '❤', until: G.time + 3.5 }; w.until = 0; }
    });
    var th = R.currentTheme(S); if (th.ready) G.toast('週のお題「' + th.theme.name + '」が完成できます！（依頼 → 週のお題）', 3000);
  };
  G.afterLayoutChange = function (info) {
    var S = G.S;
    if (info && info.replaced && info.replaced.length) {
      var rep = C.replaceBroken(S);
      if (rep.length) G.toast('遂行できなくなった依頼を、無料で差し替えました', 3000);
    }
    G.save(); G.hud();
  };
  G.afterAction = function (kind, obj, r) { G.tutHook && G.tutHook(kind, obj, r); G.hud(); };

  /* ================= 修行 ================= */
  var tr = null;
  G.openTraining = function (at) {
    var S = G.S;
    if (!at && !S.objs.some(function (o) { return o.id === 'shugyoba'; })) return;
    tr = { at: at, round: 0, hits: 0, pos: 0, dir: 1, speed: 0.9, zone: [0.38, 0.62], raf: 0, last: performance.now() };
    $('#train-title').textContent = at === 'water' ? '修行：水辺の足さばき' : '修行：手裏剣の間合い';
    $('#train-score').textContent = '○ ○ ○';
    setZone(); $('#train').hidden = false;
    var step = function (now) {
      if (!tr) return;
      var dt = (now - tr.last) / 1000; tr.last = now;
      tr.pos += tr.dir * tr.speed * dt; if (tr.pos > 1) { tr.pos = 1; tr.dir = -1; } if (tr.pos < 0) { tr.pos = 0; tr.dir = 1; }
      $('#train-mark').style.left = (tr.pos * 100) + '%';
      tr.raf = requestAnimationFrame(step);
    };
    tr.raf = requestAnimationFrame(step);
  };
  function setZone() { var w = [0.26, 0.2, 0.14][tr.round] || 0.14, c = 0.25 + Math.random() * 0.5; tr.zone = [c - w / 2, c + w / 2]; var z = $('#train-zone'); z.style.left = (tr.zone[0] * 100) + '%'; z.style.width = (w * 100) + '%'; tr.speed = 0.9 + tr.round * 0.35; }
  $('#train-hit').addEventListener('click', function () {
    if (!tr) return;
    var hit = tr.pos >= tr.zone[0] && tr.pos <= tr.zone[1];
    if (hit) { tr.hits++; G.sfx('harvest'); } else G.sfx('ng');
    tr.round++;
    var marks = ''; for (var i = 0; i < 3; i++) marks += i < tr.round ? (i < tr.hits ? '◎ ' : '× ') : '○ ';
    // 当たり外れの順番を正しく表示
    var seq = (tr.seq = (tr.seq || []).concat([hit]));
    $('#train-score').textContent = [0, 1, 2].map(function (i) { return i < seq.length ? (seq[i] ? '◎' : '×') : '○'; }).join(' ');
    if (tr.round >= 3) {
      cancelAnimationFrame(tr.raf);
      var score = tr.hits, at = tr.at; tr = null;
      setTimeout(function () {
        $('#train').hidden = true;
        var S = G.S, r = R.train(S, score, at || 'any');
        var html = '<div class="big-emoji">' + ['🌱', '👍', '✨', '🏆'][score] + '</div><h3>修行おわり！ ' + ['もう一歩', 'いい調子', 'おみごと', '免許皆伝'][score] + '（' + score + '/3）</h3>' + (r.reward ? rewardHtml(r.reward) : '<p class="muted">今日の修行のごほうびはここまで（修行はいつでもできます）。</p>');
        var coach = G.walkers.filter(function (w) { return w.kind === 'resident' && CH.BY_ID[w.id].likes.indexOf('training') >= 0; })[0];
        if (coach) { var b = R.addBond(S, coach.id, 1); html += '<p>' + esc(CH.BY_ID[coach.id].name) + 'が修行につきあってくれた（親交+1）</p>' + (b && b.memo ? '<p>📖 ' + esc(b.memo.text) + '</p>' : ''); }
        G.modal(html); G.save(); G.hud();
      }, 350);
    } else setZone();
  });

  /* ================= 写真 ================= */
  G.takePhoto = function (frameId, previewOnly) {
    var S = G.S, v = G.view;
    var size = 1080, cvs = document.createElement('canvas'); cvs.width = size; cvs.height = size;
    var inner = document.createElement('canvas'); inner.width = size - 120; inner.height = size - 220;
    var P = R.plot(v), cx = (P.x0 + P.x1 + 1) / 2, cy = (P.y0 + P.y1 + 1) / 2, p = I.iso(cx, cy);
    var z = Math.min(inner.width / (v.village.size * 2 * I.HW + 60), inner.height / (v.village.size * 2 * I.HH + 140));
    var fit = { x: p.x, y: p.y - 30, z: z };
    G.renderTo(inner, fit); // 1回目：写真の大きさの人物の絵を用意させる
    var t0 = Date.now();
    (function wait() {
      if (I.charPending() > 0 && Date.now() - t0 < 2500) { setTimeout(wait, 120); return; }
      G.renderTo(inner, fit); finishPhoto();
    })();
    function finishPhoto() {
    var c = cvs.getContext('2d'), fr = frameId || S.player.frame || 'basic';
    var bg = { basic: '#f7f1e5', sakura: '#fbe3ec', tsuki: '#1f2a44' }[fr], ink = fr === 'tsuki' ? '#f7f1e5' : '#3b2a20';
    c.fillStyle = bg; c.fillRect(0, 0, size, size);
    c.drawImage(inner, 60, 110);
    c.strokeStyle = ink; c.lineWidth = 6; c.strokeRect(60, 110, inner.width, inner.height);
    if (fr === 'sakura') { for (var i = 0; i < 40; i++) { c.fillStyle = 'rgba(242,150,180,.8)'; c.beginPath(); c.ellipse(I.hash(i) * size, I.hash(i + 99) < 0.5 ? I.hash(i + 7) * 100 : size - I.hash(i + 7) * 100, 7, 4, I.hash(i + 3) * 3, 0, 7); c.fill(); } }
    if (fr === 'tsuki') { c.fillStyle = '#f3d56a'; c.beginPath(); c.arc(size - 110, 60, 34, 0, 7); c.fill(); c.fillStyle = '#1f2a44'; c.beginPath(); c.arc(size - 96, 50, 30, 0, 7); c.fill(); }
    c.fillStyle = ink; c.font = 'bold 44px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'left'; c.fillText(v.village.name, 60, 78);
    c.font = '26px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'right';
    var d = new Date(); c.fillText(d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + '　里Lv' + v.village.level, size - 60, size - 64);
    c.textAlign = 'left'; c.font = '22px ' + getComputedStyle(document.body).fontFamily; c.fillText('ニンジャ里ライフ（CryptoNinja 非公式ファンゲーム）', 60, size - 64);
    var url = cvs.toDataURL('image/png');
    if (!previewOnly) { S.stats.photos++; R.bumpAct(S, 'photo', 1); R.event(S, 'photo_created', { frame: fr }); G.save(); G.hud(); G.tutHook && G.tutHook('photo'); }
    G.modal('<h3>' + (previewOnly ? '額縁の見本' : '里の写真') + '</h3><img class="photo-prev" src="' + url + '" alt="里の写真">', previewOnly ? [{ label: 'とじる', cls: 'primary' }] : [
      { label: '保存', fn: function () { var a = document.createElement('a'); a.href = url; a.download = 'ninja-sato-' + Date.now() + '.png'; a.click(); } },
      { label: '共有', keep: true, fn: function () { cvs.toBlob(function (b) { var f = new File([b], 'ninja-sato.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'ニンジャ里ライフ' }).catch(function () { }); else G.toast('この端末では画像の共有ができません。「保存」をどうぞ'); }); } },
      { label: 'とじる', cls: 'primary' }]);
    }
  };

  /* ================= タイトル・着がえ ================= */
  function titleScreen() {
    $('#title-chars').innerHTML = ['sakuya', 'shiba', 'kohaku'].map(function (id, i) { return A.render(CH.BY_ID[id].art, { yaw: [-24, 0, 24][i], pose: i === 1 ? 'happy' : 'stand', prop: false }); }).join('');
    var has = !!G.load();
    $('#btn-continue').hidden = !has;
    $('#btn-start').textContent = has ? '最初からはじめる' : 'はじめる';
    if (has) { $('#btn-continue').classList.add('primary'); $('#btn-start').classList.remove('primary'); }
  }
  $('#btn-continue').addEventListener('click', function () { G.S = G.load(); startGame(); });
  $('#btn-start').addEventListener('click', function () {
    var go = function () { G.S = R.newState(Date.now()); openDress(true); };
    if (G.load()) G.confirm('いまの里を消して、最初からはじめますか？', go, '最初から'); else go();
  });
  var dressFirst = false;
  function openDress(first) {
    dressFirst = first;
    $('#title').hidden = true; $('#dress').hidden = false;
    var S = G.S;
    var sets = $('#dress-sets'); sets.innerHTML = '';
    CH.APPRENTICE_SETS.forEach(function (st) { var b = document.createElement('button'); b.innerHTML = '<span class="sw" style="background:' + st.top + '"></span>' + st.name; if (S.player.set === st.id && !S.player.outfit) b.className = 'on'; b.onclick = function () { S.player.set = st.id; S.player.outfit = null; openDress(dressFirst); }; sets.appendChild(b); });
    (S.owned.outfit || []).forEach(function (oid) { var it = D.SHOP.filter(function (x) { return x.id === oid; })[0]; if (!it) return; var b = document.createElement('button'); b.innerHTML = '<span class="sw" style="background:' + it.outfit.top + '"></span>' + it.name; if (S.player.outfit && S.player.outfit.id === oid) b.className = 'on'; b.onclick = function () { S.player.outfit = Object.assign({ id: oid }, it.outfit); openDress(dressFirst); }; sets.appendChild(b); });
    var hair = $('#dress-hair'); hair.innerHTML = '';
    CH.APPRENTICE_HAIR.forEach(function (h) { var b = document.createElement('button'); b.textContent = h.name; if (S.player.hair === h.id) b.className = 'on'; b.onclick = function () { S.player.hair = h.id; openDress(dressFirst); }; hair.appendChild(b); });
    $('#dress-preview').innerHTML = A.render(CH.apprenticeArt(S.player.set, S.player.hair, S.player.outfit), { yaw: -20, pose: 'wave' }) + A.render(CH.apprenticeArt(S.player.set, S.player.hair, S.player.outfit), { yaw: 180, w: 120, h: 144 });
    $('#btn-dress-ok').textContent = first ? 'この姿で里へ行く' : 'これにする';
  }
  function dressAgain() { G.closePanel(); openDress(false); }
  $('#btn-dress-ok').addEventListener('click', function () {
    $('#dress').hidden = true;
    I.clearChar('me:');
    if (dressFirst) { G.S.tutorial.step = 1; R.event(G.S, 'tutorial_step', { step: 1 }); startGame(); }
    else { G.save(); G.hud(); }
  });

  function startGame() {
    var S = G.S;
    $('#title').hidden = true; $('#dress').hidden = true;
    G.mode = 'home'; G.view = S;
    R.startSession(S, Date.now());
    G.tick();
    $('#hud').classList.remove('hidden'); $('#nav').classList.remove('hidden');
    G.outer = I.outerTrees(S);
    G.fitPlot();
    // 最初の住民（岩爺）
    if (!S.residents.ganzi) R.addResident(S, 'ganzi', null, true);
    G.syncResidents();
    if (S.tutorial.done) { C.replaceBroken(S); C.refill(S); }
    G.save(); G.hud();
    G.syncTime();
    if (G.tutStart) G.tutStart();
    // 見学リンクで開かれた
    var m = /#visit=(NSL[01]\.[A-Za-z0-9_-]+)/.exec(location.hash);
    if (m && S.tutorial.done) {
      history.replaceState(null, '', location.pathname);
      if (S.village.level >= 3) G.confirm('友だちの里の見学リンクです。見に行きますか？', function () { G.visitCode(m[1]); }, '見に行く');
      else G.toast('友だちの里の見学は里Lv3で解放されます', 3000);
    }
  }
  G.startGame = startGame;

  // 起動
  titleScreen();
  G.startLoop();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
})();
