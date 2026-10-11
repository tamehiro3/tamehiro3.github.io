/* ニンジャからくり工房 — 保存と、公開までの状態の流れ（画面に依存しない。サーバーへ移しても同じ流れ）
 *
 *  版（LevelVersion）の状態：
 *    draft 下書き → （検証）→ invalid 修正必要 ／ testable テスト可 → （作者クリア）→ cleared クリア確認済み
 *    → （公開申請）→ review 審査待ち → published 公開中 ／ rejected 差戻し
 *    公開中 → private 非公開（枠が空く）→ 再申請 ／ suspended 停止（運営）／ archived 旧版（新版が公開されたとき）
 *  公開中の版は書き換えない。変えるときは新しい version_id の版を作り、作者クリアと審査をやり直す。
 *  記録（挑戦）は、そのときの版（content_hash）に結びつける。
 *
 *  保存先は localStorage のような「文字列の出し入れ」ができる物（テストでは MemStorage）。
 *  大事な一覧は .bak にも書いておき、読めなければそちらから戻す。下書きの中身は版ごとに別のキーに置く。
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var E = root.KK_ENGINE || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var R = root.KK_RULES || (typeof require !== 'undefined' ? require('./rules.js') : null);
  var NS = 'kk1.';

  function MemStorage() { this.m = {}; }
  MemStorage.prototype.getItem = function (k) { return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : null; };
  MemStorage.prototype.setItem = function (k, v) { this.m[k] = String(v); };
  MemStorage.prototype.removeItem = function (k) { delete this.m[k]; };

  var STATES = {
    draft: '下書き', invalid: '修正必要', testable: 'テスト可', cleared: 'クリア確認済み', review: '審査待ち',
    published: '公開中', rejected: '差戻し', 'private': '非公開', suspended: '停止', archived: '旧版'
  };
  var EDITABLE = { draft: 1, invalid: 1, testable: 1, cleared: 1, rejected: 1 };
  function today(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function weekIndex(t) { return Math.floor((t / 86400000 + 3) / 7); } // 月曜はじまり（1970-01-05 が月曜）

  function Store(storage, opt) {
    opt = opt || {};
    this.st = storage || new MemStorage();
    this.now = opt.now || function () { return Date.now(); };
    this.writable = true;
    this.cache = {};
    this.load();
  }
  var S = Store.prototype;

  /* ---------- 読み書き ---------- */
  S.read = function (key) {
    var raw = null;
    try { raw = this.st.getItem(NS + key); } catch (e) { raw = null; }
    if (raw != null) { try { return JSON.parse(raw); } catch (e) { /* こわれていたら .bak へ */ } }
    try { raw = this.st.getItem(NS + key + '.bak'); if (raw != null) return JSON.parse(raw); } catch (e) { /* なし */ }
    return null;
  };
  S.write = function (key, obj, backup) {
    var s = JSON.stringify(obj);
    try {
      this.st.setItem(NS + key, s);
      if (backup) this.st.setItem(NS + key + '.bak', s);
      this.writable = true;
      return true;
    } catch (e) { this.writable = false; return false; }
  };
  S.remove = function (key) { try { this.st.removeItem(NS + key); this.st.removeItem(NS + key + '.bak'); } catch (e) { /* なし */ } };

  S.load = function () {
    var p = this.read('profile');
    this.profile = p && p.owner_id ? p : this.newProfile();
    this.levels = this.read('levels') || {};
    this.friends = this.read('friends') || {};
    this.attempts = this.read('attempts') || [];
    this.results = this.read('results') || [];
    this.mod = this.read('mod') || [];
    this.events = this.read('events') || [];
    this.reactions = this.read('reactions') || {};
    if (!p) this.saveProfile();
  };
  S.newProfile = function () {
    var t = this.now();
    return {
      owner_id: R.rid('u', 11), created_at: t,
      sign: { a: Math.floor(Math.random() * D.SIGN_WORDS.a.length), b: Math.floor(Math.random() * D.SIGN_WORDS.b.length), c: 1, f: 0 }, // f：看板の飾り（0なし・1金ぶち・2花）
      seals: 0, owned: {}, outfit: 'ai', hair: 'short', fx: '',
      settings: { sound: true, controls: 'buttons', leftHanded: false, autoReview: true, aiEndpoint: '', operator: false, reduceMotion: false },
      tut: { step: 0, done: false, playOnly: false },
      cleared: {}, best: {}, weekly: {}, ai: { day: '', n: 0 }, blockedOwners: {}, draftBonus: 0,
      kpi: { firstEditor: 0, firstCreatorClear: 0, started: {} }
    };
  };
  S.saveProfile = function () { return this.write('profile', this.profile, true); };
  S.saveLevels = function () { return this.write('levels', this.levels, true); };
  S.saveFriends = function () { return this.write('friends', this.friends, true); };
  S.saveMod = function () { return this.write('mod', this.mod, true); };

  /* ---------- 計測（端末の中だけ。外へは送らない） ---------- */
  S.log = function (name, data) {
    this.events.push({ n: name, t: this.now(), d: data || null });
    if (this.events.length > 3000) this.events.splice(0, this.events.length - 3000);
    this.write('events', this.events);
    var k = this.profile.kpi;
    if (name === 'editor_start' && !k.firstEditor) { k.firstEditor = this.now(); this.saveProfile(); }
    if (name === 'creator_clear' && !k.firstCreatorClear) { k.firstCreatorClear = this.now(); this.saveProfile(); }
    if (name === 'level_start' && data && data.level) { k.started[data.level] = 1; this.saveProfile(); }
  };
  S.kpi = function () {
    var k = this.profile.kpi, c = {};
    this.events.forEach(function (e) { c[e.n] = (c[e.n] || 0) + 1; });
    var mins = k.firstEditor && k.firstCreatorClear ? (k.firstCreatorClear - k.firstEditor) / 60000 : null;
    return { counts: c, firstBuildMinutes: mins, within15: mins != null && mins <= 15, levelsStarted: Object.keys(k.started).length, threeOrMore: Object.keys(k.started).length >= 3 };
  };

  /* ---------- 版 ---------- */
  S.getVersion = function (vid) {
    if (!vid) return null;
    if (this.cache[vid]) return this.cache[vid];
    var v = this.read('ver.' + vid);
    if (v) this.cache[vid] = v;
    return v;
  };
  S.putVersion = function (v) { v.updated_at = this.now(); this.cache[v.version_id] = v; return this.write('ver.' + v.version_id, v, true); };
  S.mine = function (lid) { var l = this.levels[lid]; return l && l.owner_id === this.profile.owner_id ? l : null; };
  S.draftOf = function (lid) { var l = this.levels[lid]; return l ? this.getVersion(l.draft) : null; };
  S.liveOf = function (lid) { var l = this.levels[lid]; return l ? this.getVersion(l.live) : null; };
  S.stateOf = function (lid) {
    var l = this.levels[lid]; if (!l) return null;
    var d = this.getVersion(l.draft), lv = this.getVersion(l.live), pv = this.getVersion(l.priv);
    return { draft: d ? d.state : null, live: lv ? lv.state : null, priv: pv ? pv.state : null };
  };

  /* ---------- 枠 ---------- */
  S.draftLimit = function () { return D.LIMIT.drafts + Math.max(0, this.profile.draftBonus || 0); };
  S.draftCount = function () {
    var n = 0, self = this;
    Object.keys(this.levels).forEach(function (id) { var l = self.levels[id]; if (l.archived) return; var d = self.getVersion(l.draft); if (d && EDITABLE[d.state]) n++; });
    return n;
  };
  S.publishedCount = function () {
    var n = 0, self = this;
    Object.keys(this.levels).forEach(function (id) {
      var l = self.levels[id], d = self.getVersion(l.draft);
      if (l.live) n++; else if (d && d.state === 'review') n++;
    });
    return n;
  };
  S.list = function () {
    var self = this;
    return Object.keys(this.levels).map(function (id) { return self.levels[id]; }).filter(function (l) { return !l.archived; })
      .sort(function (a, b) { return b.updated_at - a.updated_at; });
  };

  /* ---------- 作る ---------- */
  // content：試験データ（theme・title・parts・connections）。from：見本の ID など
  S.create = function (content, from) {
    if (this.draftCount() >= this.draftLimit()) return { ok: false, error: '下書きがいっぱいです（' + this.draftLimit() + '本まで）。いらない下書きを消すか、公開してから作ってください。' };
    var t = this.now(), lid = R.rid('l', 10), vid = R.rid('v', 10);
    var c = R.normalize(content); delete c._dropped;
    var ver = { version_id: vid, level_id: lid, owner_id: this.profile.owner_id, n: 1, parent: null, created_at: t, state: 'draft', content: c, content_hash: R.contentHash(c), validation: null, clear: null, reject: null, from: from || '' };
    var lvl = { level_id: lid, owner_id: this.profile.owner_id, platform: 'web', created_at: t, updated_at: t, versions: [vid], draft: vid, live: null, priv: null, archived: false };
    if (!this.putVersion(ver)) return { ok: false, error: '保存できませんでした（端末の保存領域がいっぱいかもしれません）。' };
    this.levels[lid] = lvl; this.saveLevels();
    this.autosave(lid, c);
    return { ok: true, level_id: lid, version_id: vid };
  };
  // 下書きの中身を変える（自動保存から呼ぶ）。中身が変わったら、検証と作者クリアはやり直し
  S.update = function (lid, content) {
    var l = this.mine(lid);
    if (!l) return { ok: false, error: '自分の作品ではありません。' };
    var v = this.getVersion(l.draft);
    if (!v || !EDITABLE[v.state]) return { ok: false, error: 'この版は書き換えられません（' + (v ? STATES[v.state] : 'なし') + '）。新しい版を作ってください。' };
    var c = R.normalize(content); delete c._dropped;
    var h = R.contentHash(c);
    if (h !== v.content_hash) { v.state = 'draft'; v.clear = null; v.validation = null; } // 差戻しの理由（v.reject）は、直すときの参考に残す
    v.content = c; v.content_hash = h;
    if (!this.putVersion(v)) return { ok: false, error: '保存できませんでした。' };
    l.updated_at = this.now(); this.saveLevels();
    this.autosave(lid, c);
    return { ok: true, changed: true, version: v };
  };
  // 自動保存の履歴（前の版へ戻れる）
  S.autosave = function (lid, c) {
    var list = this.read('auto.' + lid) || [], h = R.contentHash(c);
    if (list.length && list[list.length - 1].h === h) return;
    list.push({ t: this.now(), h: h, c: c });
    if (list.length > D.LIMIT.saves) list.splice(0, list.length - D.LIMIT.saves);
    this.write('auto.' + lid, list);
  };
  S.autosaves = function (lid) { return this.read('auto.' + lid) || []; };
  S.restore = function (lid, idx) {
    var list = this.autosaves(lid), it = list[idx];
    if (!it) return { ok: false, error: 'その保存はありません。' };
    return this.update(lid, it.c);
  };
  // 検証：構造・経路（エラーがあれば修正必要、なければテスト可）
  S.check = function (lid) {
    var l = this.mine(lid); if (!l) return { ok: false, error: '自分の作品ではありません。' };
    var v = this.getVersion(l.draft); if (!v || !EDITABLE[v.state]) return { ok: false, error: '検証できる版がありません。' };
    var res = R.validate(v.content);
    v.validation = { ok: res.ok, errors: res.errors, warnings: res.warnings, content_hash: v.content_hash, rules: D.VERSION.rules, at: this.now() };
    if (v.state !== 'cleared' || !res.ok) v.state = res.ok ? 'testable' : 'invalid';
    this.putVersion(v);
    return { ok: true, result: res, version: v };
  };
  // 作者クリアを記録：入力の記録を再生して、本当にクリアできるかを確かめる
  S.recordClear = function (lid, runs) {
    var l = this.mine(lid); if (!l) return { ok: false, error: '自分の作品ではありません。' };
    var v = this.getVersion(l.draft); if (!v) return { ok: false, error: '下書きがありません。' };
    if (!v.validation || !v.validation.ok || v.validation.content_hash !== v.content_hash) { var c = this.check(lid); if (!c.result.ok) return { ok: false, error: '検証に通っていません。' }; v = this.getVersion(l.draft); }
    var rp = E.replay(v.content, runs);
    if (!rp.cleared) return { ok: false, error: '記録を再生してもクリアになりませんでした。' };
    v.clear = { content_hash: v.content_hash, rules: D.VERSION.rules, frames: rp.frames, runs: runs, deaths: rp.deaths.length, at: this.now(), verified: true };
    v.state = 'cleared';
    this.putVersion(v);
    this.log('creator_clear', { level: lid, frames: rp.frames });
    return { ok: true, frames: rp.frames, version: v };
  };
  // 公開申請できるか（理由つき）
  S.canSubmit = function (lid) {
    var l = this.mine(lid); if (!l) return { ok: false, error: '自分の作品ではありません。' };
    var v = this.getVersion(l.draft);
    if (!v) return { ok: false, error: '申請できる版がありません。' };
    if (v.state === 'review') return { ok: false, error: 'いま審査待ちです。' };
    if (!v.validation || !v.validation.ok || v.validation.content_hash !== v.content_hash || v.validation.rules !== D.VERSION.rules) return { ok: false, error: '検証に通っていない版は公開できません。' };
    if (!v.clear || v.clear.content_hash !== v.content_hash || v.clear.rules !== D.VERSION.rules || v.state !== 'cleared') return { ok: false, error: '作者クリアがまだです（テストで自分でクリアしてください）。' };
    if (!l.live && this.publishedCount() >= D.LIMIT.published) return { ok: false, error: '公開枠がいっぱいです（' + D.LIMIT.published + '本まで）。ほかの作品を非公開にすると空きます。' };
    return { ok: true, version: v };
  };
  S.submit = function (lid) {
    var c = this.canSubmit(lid); if (!c.ok) return c;
    var v = c.version;
    v.state = 'review'; v.reject = null; v.submitted_at = this.now();
    this.putVersion(v);
    var mc = { case_id: R.rid('c', 8), kind: 'review', level_id: lid, version_id: v.version_id, content_hash: v.content_hash, status: 'open', created_at: this.now() };
    this.mod.push(mc); this.saveMod();
    this.log('publish_submit', { level: lid, version: v.version_id });
    var out = { ok: true, case_id: mc.case_id, auto: false };
    if (this.profile.settings.autoReview) { var ar = this.autoReview(mc.case_id); out.auto = true; out.result = ar; }
    return out;
  };
  // 申請の取り消し（審査待ち → クリア確認済み）
  S.withdraw = function (lid) {
    var l = this.mine(lid), v = l && this.getVersion(l.draft);
    if (!v || v.state !== 'review') return { ok: false, error: '審査待ちの版がありません。' };
    v.state = 'cleared'; this.putVersion(v);
    this.mod.forEach(function (m) { if (m.version_id === v.version_id && m.status === 'open') m.status = 'withdrawn'; });
    this.saveMod();
    return { ok: true };
  };
  // 試作版の自動審査（人の審査の代わりに、サーバー側の検査と同じことをする）
  S.autoReview = function (caseId) {
    var mc = this.findCase(caseId); if (!mc) return { ok: false };
    var v = this.getVersion(mc.version_id), res = R.validate(v.content), rp = v.clear ? E.replay(v.content, v.clear.runs) : { cleared: false };
    if (res.ok && rp.cleared && R.contentHash(v.content) === v.content_hash) return this.approve(caseId, 'auto');
    return this.reject(caseId, rp.cleared ? 'other' : 'impossible', null, 'auto');
  };
  S.findCase = function (id) { for (var i = 0; i < this.mod.length; i++) if (this.mod[i].case_id === id) return this.mod[i]; return null; };
  S.openCases = function () { return this.mod.filter(function (m) { return m.status === 'open'; }); };
  // 承認（運営）。サーバー側の確かめ：検証・ハッシュ・作者クリアの再生
  S.approve = function (caseId, by) {
    var mc = this.findCase(caseId); if (!mc || mc.status !== 'open' || mc.kind !== 'review') return { ok: false, error: '審査中の申請ではありません。' };
    var l = this.levels[mc.level_id], v = this.getVersion(mc.version_id);
    if (!l || !v || v.state !== 'review') return { ok: false, error: '版が見つかりません。' };
    if (!R.validate(v.content).ok || R.contentHash(v.content) !== v.content_hash || !v.clear || !E.replay(v.content, v.clear.runs).cleared) return { ok: false, error: '未検証の版は公開できません。' };
    var old = this.getVersion(l.live);
    if (old && old.version_id !== v.version_id) { old.state = 'archived'; this.putVersion(old); }
    v.state = 'published'; v.published_at = this.now(); this.putVersion(v);
    l.live = v.version_id; l.draft = null; l.priv = null; l.updated_at = this.now(); this.saveLevels();
    mc.status = 'approved'; mc.decided_at = this.now(); mc.by = by || 'operator'; this.saveMod();
    this.log('publish_approve', { level: l.level_id, version: v.version_id });
    return { ok: true, approved: true };
  };
  // 差戻し（理由と直す場所をつける）
  S.reject = function (caseId, reasonId, cell, by) {
    var mc = this.findCase(caseId); if (!mc || mc.status !== 'open' || mc.kind !== 'review') return { ok: false, error: '審査中の申請ではありません。' };
    var v = this.getVersion(mc.version_id); if (!v) return { ok: false };
    var rr = D.REJECT_REASONS.filter(function (r) { return r.id === reasonId; })[0] || D.REJECT_REASONS[4];
    v.state = 'rejected'; v.reject = { reason: rr.id, text: rr.name, cell: cell || null, at: this.now() }; this.putVersion(v);
    mc.status = 'rejected'; mc.reason = rr.id; mc.cell = cell || null; mc.decided_at = this.now(); mc.by = by || 'operator'; this.saveMod();
    this.log('publish_reject', { level: mc.level_id, reason: rr.id });
    return { ok: true, approved: false, reason: rr };
  };
  // 非公開にする（公開枠が空く）
  S.unpublish = function (lid) {
    var l = this.mine(lid), v = l && this.getVersion(l.live);
    if (!v) return { ok: false, error: '公開中の版がありません。' };
    v.state = 'private'; this.putVersion(v);
    l.priv = v.version_id; l.live = null; l.updated_at = this.now(); this.saveLevels();
    return { ok: true };
  };
  // 非公開・停止の版を再申請（検証と作者クリアがいまのルールで有効なら）
  S.resubmit = function (lid) {
    var l = this.mine(lid), v = l && this.getVersion(l.priv);
    if (!v) return { ok: false, error: '再申請できる版がありません。' };
    if (l.draft) return { ok: false, error: '作りかけの新しい版があります。' };
    if (this.publishedCount() >= D.LIMIT.published) return { ok: false, error: '公開枠がいっぱいです。' };
    var res = R.validate(v.content);
    if (!res.ok || !v.clear || !E.replay(v.content, v.clear.runs).cleared) return { ok: false, error: 'いまのルールでは検証に通りません。新しい版を作ってください。' };
    v.state = 'cleared'; v.validation = { ok: true, errors: [], warnings: res.warnings, content_hash: v.content_hash, rules: D.VERSION.rules, at: this.now() }; v.clear.rules = D.VERSION.rules;
    this.putVersion(v);
    l.draft = v.version_id; l.priv = null; this.saveLevels();
    return this.submit(lid);
  };
  // 新しい版を作る（公開中・非公開の版をもとに）
  S.newVersion = function (lid) {
    var l = this.mine(lid); if (!l) return { ok: false, error: '自分の作品ではありません。' };
    if (l.draft) return { ok: false, error: 'すでに作りかけの版があります。', version_id: l.draft };
    var base = this.getVersion(l.live) || this.getVersion(l.priv);
    if (!base) return { ok: false, error: 'もとになる版がありません。' };
    if (this.draftCount() >= this.draftLimit()) return { ok: false, error: '下書きがいっぱいです。' };
    var vid = R.rid('v', 10), c = R.clone(base.content);
    var v = { version_id: vid, level_id: lid, owner_id: l.owner_id, n: (base.n || 1) + 1, parent: base.version_id, created_at: this.now(), state: 'draft', content: c, content_hash: R.contentHash(c), validation: null, clear: null, reject: null };
    this.putVersion(v);
    l.versions.push(vid); l.draft = vid; l.updated_at = this.now(); this.saveLevels();
    return { ok: true, version_id: vid };
  };
  // 下書きを消す（本人が選んだときだけ。自動では消さない）
  S.deleteDraft = function (lid) {
    var l = this.mine(lid); if (!l) return { ok: false, error: '自分の作品ではありません。' };
    var v = this.getVersion(l.draft);
    if (v && v.state === 'review') return { ok: false, error: '審査待ちの版は消せません（申請を取り消してから）。' };
    if (l.live || l.priv) { if (v) { this.remove('ver.' + v.version_id); delete this.cache[v.version_id]; l.versions = l.versions.filter(function (x) { return x !== v.version_id; }); } l.draft = null; this.saveLevels(); return { ok: true, kept: true }; }
    var self = this;
    l.versions.forEach(function (x) { self.remove('ver.' + x); delete self.cache[x]; });
    this.remove('auto.' + lid);
    delete this.levels[lid]; this.saveLevels();
    return { ok: true };
  };
  // 共有コード（公開中の版だけ）
  S.shareCode = function (lid) {
    var l = this.mine(lid), v = l && this.getVersion(l.live);
    if (!v || v.state !== 'published') return { ok: false, error: '公開中の版だけコードにできます。' };
    return { ok: true, code: R.encodeLevel(v.content, { level_id: lid, version_id: v.version_id, owner_id: l.owner_id, sign: this.profile.sign, runs: v.clear.runs }) };
  };

  /* ---------- 友だちの試験（コードで受け取る） ---------- */
  S.importLevel = function (code) {
    var d = R.decodeLevel(code);
    if (!d.ok) return d;
    var lv = R.normalize(d.level); delete lv._dropped;
    var res = R.validate(lv);
    if (!res.ok) return { ok: false, error: '試験の中身が検査に通りませんでした（' + res.errors[0].msg + '）。' };
    if (!E.replay(lv, d.meta.runs).cleared) return { ok: false, error: '作者クリアの記録が合いません（未検証の試験は読みこめません）。' };
    if (d.meta.owner_id === this.profile.owner_id) return { ok: false, error: 'これはあなたの作品です。', own: true };
    if (this.profile.blockedOwners[d.meta.owner_id]) return { ok: false, error: 'この制作者は非表示にしています。' };
    var h = R.contentHash(lv), f = this.friends[d.meta.level_id];
    var entry = { level_id: d.meta.level_id, version_id: d.meta.version_id, owner_id: d.meta.owner_id, sign: d.meta.sign, content: lv, content_hash: h, runs: d.meta.runs, imported_at: this.now(), hidden: f ? f.hidden : false, reported: f ? f.reported : null };
    this.friends[d.meta.level_id] = entry; this.saveFriends();
    return { ok: true, level: entry, updated: !!f };
  };
  S.friendList = function () {
    var self = this;
    return Object.keys(this.friends).map(function (k) { return self.friends[k]; })
      .filter(function (f) { return !f.hidden && !self.profile.blockedOwners[f.owner_id]; })
      .sort(function (a, b) { return b.imported_at - a.imported_at; });
  };
  S.report = function (lid, category) {
    var f = this.friends[lid]; if (!f) return { ok: false };
    var cat = D.REPORTS.filter(function (r) { return r.id === category; })[0];
    if (!cat) return { ok: false, error: '通報の種類を選んでください。' };
    f.hidden = true; f.reported = { category: cat.id, at: this.now() }; this.saveFriends();
    var mc = { case_id: R.rid('c', 8), kind: 'report', level_id: lid, version_id: f.version_id, content_hash: f.content_hash, owner_id: f.owner_id, category: cat.id, status: 'open', created_at: this.now() };
    this.mod.push(mc); this.saveMod();
    this.log('level_report', { level: lid, category: cat.id });
    return { ok: true, case_id: mc.case_id };
  };
  // 通報の確認（運営）：問題なければ戻す／停止のまま（通報の数だけで消さない）
  S.resolveReport = function (caseId, restore) {
    var mc = this.findCase(caseId); if (!mc || mc.kind !== 'report' || mc.status !== 'open') return { ok: false };
    var f = this.friends[mc.level_id];
    if (f && restore) { f.hidden = false; this.saveFriends(); }
    mc.status = restore ? 'restored' : 'kept'; mc.decided_at = this.now(); this.saveMod();
    return { ok: true };
  };
  S.blockOwner = function (ownerId, on) { if (on) this.profile.blockedOwners[ownerId] = 1; else delete this.profile.blockedOwners[ownerId]; this.saveProfile(); return { ok: true }; };

  /* ---------- 挑戦の記録 ---------- */
  // a: { level_id, content_hash, kind:'official'|'friend'|'mine'|'guest', result:'clear'|'fail'|'timeout'|'quit', frames, deaths:[{x,y,cause}], player }
  S.addAttempt = function (a) {
    a.at = this.now(); a.player = a.player || this.profile.owner_id;
    this.attempts.push(a);
    if (this.attempts.length > 3000) this.attempts.splice(0, this.attempts.length - 3000);
    this.write('attempts', this.attempts);
    var out = { best: false, seals: 0 };
    if (a.result === 'clear') {
      var b = this.profile.best[a.content_hash];
      if (!b || a.frames < b) { this.profile.best[a.content_hash] = a.frames; out.best = true; }
    }
    this.saveProfile();
    return out;
  };
  S.bestOf = function (hash) { return this.profile.best[hash] || 0; };
  S.attemptsFor = function (lid, hash) { return this.attempts.filter(function (a) { return a.level_id === lid && (!hash || a.content_hash === hash); }); };
  // 運営ステージの合格（修行印：はじめての合格と、目標タイム以内の合格で1つずつ）
  S.officialClear = function (stageId, frames, targetSec) {
    var c = this.profile.cleared[stageId] || { first: 0, best: 0, under: false }, got = 0;
    if (!c.first) { c.first = this.now(); got += D.SEAL.firstClear; }
    if (!c.best || frames < c.best) c.best = frames;
    if (!c.under && frames <= targetSec * 60) { c.under = true; got += D.SEAL.underTarget; }
    this.profile.cleared[stageId] = c;
    this.profile.seals += got;
    this.saveProfile();
    return { seals: got, record: c };
  };
  S.grantSeals = function (n) { this.profile.seals += n; this.saveProfile(); };

  /* ---------- 攻略メモ（友だちの結果を作者へ返す） ---------- */
  S.guestId = function () { if (!this.profile.guest) { this.profile.guest = R.rid('g', 9); this.saveProfile(); } return this.profile.guest; };
  S.makeResult = function (lid, hash) {
    var f = this.friends[lid]; if (!f) return { ok: false, error: '友だちの試験ではありません。' };
    hash = hash || f.content_hash;
    var list = this.attempts.filter(function (a) { return a.level_id === lid && a.content_hash === hash && a.kind === 'friend'; });
    if (!list.length) return { ok: false, error: 'まだ挑戦していません。' };
    var best = 0, clears = 0, deaths = [];
    list.forEach(function (a) { if (a.result === 'clear') { clears++; if (!best || a.frames < best) best = a.frames; } (a.deaths || []).forEach(function (d) { deaths.push(d); }); });
    var rc = this.reactions[lid + ':' + hash] || {};
    return { ok: true, code: R.encodeResult({ level_id: lid, content_hash: hash, player: this.profile.owner_id, attempts: list.length, clears: clears, best: best, deaths: deaths, reactions: rc }) };
  };
  S.importResult = function (code) {
    var d = R.decodeResult(code); if (!d.ok) return d;
    var r = d.result, l = this.mine(r.level_id);
    if (!l) return { ok: false, error: 'あなたの作品の攻略メモではありません。' };
    var self = this, match = l.versions.some(function (vid) { var v = self.getVersion(vid); return v && v.content_hash === r.content_hash; });
    if (!match) return { ok: false, error: 'その版はもうありません。' };
    if (r.player === this.profile.owner_id) return { ok: false, error: '自分の攻略メモは読みこめません。' };
    this.results = this.results.filter(function (x) { return !(x.level_id === r.level_id && x.content_hash === r.content_hash && x.player === r.player); });
    r.at = this.now(); this.results.push(r);
    this.write('results', this.results);
    return { ok: true, result: r };
  };
  // 分析に使う「ほかの人の挑戦」（読みこんだ攻略メモ＋この端末で友だちに遊んでもらった挑戦）
  S.othersAttempts = function (lid, hash) {
    var out = [];
    this.results.forEach(function (r) {
      if (r.level_id !== lid || r.content_hash !== hash) return;
      // 攻略メモは「挑戦の合計」なので、失敗の場所を挑戦に分けて入れる
      for (var i = 0; i < r.attempts; i++) out.push({ player: r.player, result: i < r.clears ? 'clear' : 'fail', frames: r.best, deaths: i === 0 ? r.deaths : [] });
    });
    this.attempts.forEach(function (a) { if (a.level_id === lid && a.content_hash === hash && a.kind === 'guest') out.push(a); });
    return out;
  };

  /* ---------- リアクション（定型） ---------- */
  S.react = function (lid, hash, kind) {
    var k = lid + ':' + hash, r = this.reactions[k] || {};
    r[kind] = !r[kind];
    this.reactions[k] = r; this.write('reactions', this.reactions);
    return r;
  };
  S.reactionsFor = function (lid, hash) { return this.reactions[lid + ':' + hash] || {}; };

  /* ---------- 修行印の店（見た目だけ。現実のお金では買えない） ---------- */
  S.buy = function (itemId) {
    var it = D.SHOP.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return { ok: false, error: 'その品物はありません。' };
    if (this.profile.owned[it.id]) return { ok: false, error: 'もう持っています。' };
    if (this.profile.seals < it.price) return { ok: false, error: '修行印が足りません。' };
    this.profile.seals -= it.price; this.profile.owned[it.id] = this.now(); this.saveProfile();
    return { ok: true };
  };

  /* ---------- 提案（AI）の回数：1日3回まで。失敗は数えない ---------- */
  S.aiLeft = function () { var d = today(this.now()), a = this.profile.ai; return a.day === d ? Math.max(0, D.LIMIT.aiPerDay - a.n) : D.LIMIT.aiPerDay; };
  S.aiUse = function () { var d = today(this.now()), a = this.profile.ai; if (a.day !== d) { a.day = d; a.n = 0; } a.n++; this.saveProfile(); };

  /* ---------- 週のお題 ---------- */
  S.weeklyTopic = function () { var wi = weekIndex(this.now()); return { week: wi, topic: D.WEEKLY[((wi % D.WEEKLY.length) + D.WEEKLY.length) % D.WEEKLY.length] }; };
  S.meetsTopic = function (topic, content, clearFrames) {
    var c = R.countBy(content), need = topic.need, ok = true;
    Object.keys(need).forEach(function (k) {
      if (k === 'maxClearSec') { if (!clearFrames || clearFrames > need[k] * 60) ok = false; }
      else if ((c[k] || 0) < need[k]) ok = false;
    });
    return ok;
  };
  S.claimWeekly = function (lid) {
    var l = this.mine(lid), v = l && (this.getVersion(l.draft) || this.getVersion(l.live));
    var wt = this.weeklyTopic();
    if (this.profile.weekly[wt.week]) return { ok: false, error: '今週のお題の修行印は、もう受け取りました。' };
    if (!v || !v.clear || v.clear.content_hash !== v.content_hash) return { ok: false, error: '作者クリアした試験で受け取れます。' };
    if (!this.meetsTopic(wt.topic, v.content, v.clear.frames)) return { ok: false, error: 'お題の条件に合っていません。' };
    this.profile.weekly[wt.week] = lid; this.profile.seals += D.SEAL.weekly; this.saveProfile();
    return { ok: true, seals: D.SEAL.weekly };
  };

  /* ---------- 書き出し・消去 ---------- */
  S.exportAll = function () {
    var self = this, vers = {};
    Object.keys(this.levels).forEach(function (id) { self.levels[id].versions.forEach(function (v) { vers[v] = self.getVersion(v); }); });
    return { app: 'ninja-karakuri-kobo', exported_at: this.now(), profile: this.profile, levels: this.levels, versions: vers, friends: this.friends, attempts: this.attempts, results: this.results, moderation: this.mod, events: this.events, kpi: this.kpi() };
  };

  var api = { Store: Store, MemStorage: MemStorage, STATES: STATES, EDITABLE: EDITABLE, weekIndex: weekIndex, today: today };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KK_STORE = api;
})(typeof window !== 'undefined' ? window : globalThis);
