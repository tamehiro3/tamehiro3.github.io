/* 忍び足（しのびあし）— 各画面 SA.Screens（docs/SPEC.md 3.1〜3.12）
 * ui.js（SA.UI）の部品を使って画面を組む。ui.js より前に読み込む（呼ばれるのは起動のあと）。
 * ほかの担当の部品（SA.Rules / Steps / Store / Notify / Share / Fig / FX / TEXT）は「あれば使う」。
 * 無いときは小さく「準備中」を出して落ちない。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var doc = root.document;
  function U() { return SA.UI; }
  function D() { return SA.DATA || {}; }
  function CFG() { return D().CONFIG || {}; }
  function T() { return SA.TEXT || {}; }
  function R() { return SA.Rules || null; }
  function CH() { return root.NSL_CHARS || { CHARS: [], BY_ID: {} }; }
  function A() { return U().App; }
  function S() { return A().state || A().viewState || null; }   // ながめるモードでは読み込んだ記録
  function pick(arr, k) { return arr && arr.length ? arr[((k % arr.length) + arr.length) % arr.length] : null; }
  function dayNum(date) { var p = String(date).split('-'); return (+p[0]) * 400 + (+p[1]) * 32 + (+p[2]); }

  /* ================= 名前・言葉（chars.js の公式データにふりがなを付ける） ================= */
  var NAME_KANA = {
    jin: 'じん', sakuya: 'さくや', kohaku: 'こはく', shiba: 'しば', kanaoni: 'かなおに', oto: 'おと', rotten: 'ろとん', nagisa: 'なぎさ',
    anne: 'あんね', dan: 'だん', hinanojoh: 'ひなのじょう', torika: 'とりか', uka: 'うか', ganzi: 'がんじ', yui: 'ゆい', fuuta: 'ふうた',
    rei: 'れい', nekomata: 'ねこまた', benten: 'べんてん', shion: 'しおん', seori: 'せおり', quon: 'くおん', magoichi: 'まごいち', sekishusai: 'せきしゅうさい'
  };
  var NAME_FURI = { janome: '{蛇|じゃ}ノ{目|め}' };
  var WORD = {
    '火遁': 'かとん', '口寄せ': '{口寄|くちよ}せ', '変わり身': '{変|か}わり{身|み}', '水遁': 'すいとん', '金遁': 'きんとん', '毒霧': 'どくぎり',
    '影分身': 'かげぶんしん', '影縫い': '{影縫|かげぬ}い', '閃光': 'せんこう', '毒手裏剣': 'どくしゅりけん', '逢魔刻': 'おうまがとき', '鷹の目': '{鷹|たか}の{目|め}',
    '九尾の焔': '{九尾|きゅうび}の{焔|ほむら}', '幻術・漆黒': '{幻術|げんじゅつ}・{漆黒|しっこく}', '桜吹雪': 'さくらふぶき', '風遁': 'ふうとん', '人身御供': 'ひとみごくう',
    '涅槃': 'ねはん', '影分身の術': '{影分身|かげぶんしん}の{術|じゅつ}', '祝詞': 'のりと', '領域・罪業': '{領域|りょういき}・{罪業|ざいごう}', '忍びいろは': '{忍|しの}びいろは',
    '動植綵絵': 'どうしょくさいえ', '雷遁': 'らいとん', '巨人の一撃': '{巨人|きょじん}の{一撃|いちげき}', '野アザミ': '{野|の}アザミ', '丑の刻参り': '{丑|うし}の{刻参|こくまい}り',
    '猫の目の選択': '{猫|ねこ}の{目|め}の{選択|せんたく}', '一発必中': 'いっぱつひっちゅう', '泰山府君祭': 'たいざんふくんさい', '糸脈': 'いとみゃく', '飯綱の法': '{飯綱|いづな}の{法|ほう}',
    '無刀取り': '{無刀取|むとうど}り',
    '手裏剣': 'しゅりけん', '刀': 'かたな', '空手': 'からて', '牛刀': 'ぎゅうとう', '巻物': 'まきもの', '毒矢': 'どくや', '団子': 'だんご', '閃光刀': 'せんこうとう',
    '焙烙玉': 'ほうろくだま', '棍棒': 'こんぼう', '鷹': 'たか', '護符': 'ごふ', '数珠': 'じゅず', '正宗': 'まさむね', '匕首': 'あいくち', '円光': 'えんこう',
    '妖刀村正': 'ようとうむらまさ', '三味線': 'しゃみせん', '鎖鎌': 'くさりがま', '筆': 'ふで', '絵筆': 'えふで', '羽': 'はね', '太極拳': 'たいきょくけん', '拳': 'こぶし',
    '鉤爪': 'かぎづめ', '木槌': 'きづち', '鬼火': 'おにび', '銃': 'じゅう', '呪符': 'じゅふ', '笈': 'おい', '大典太': 'おおでんた', 'なし': 'なし', '—': '—', '不明': 'ふめい'
  };
  var BIO = {
    jin: '{忍者|にんじゃ}の{祖|そ}。{謎|なぞ}{多|おお}き{伝説|でんせつ}の{忍者|にんじゃ}。{風魔|ふうま}の{初代|しょだい}{首領|しゅりょう}と{戦|たたか}って{命|いのち}を{落|お}としたと{見|み}られている。',
    sakuya: '{岩爺|がんじ}の{孫|まご}。{多様|たよう}な{召喚術|しょうかんじゅつ}を{持|も}つ。{狐白|こはく}と{双子|ふたご}。{繁栄|はんえい}の{女神|めがみ}コノハナサクヤヒメがネーミングのもと。',
    shiba: '{普段|ふだん}は{犬|いぬ}の{姿|すがた}だが、{戦闘時|せんとうじ}には{忍術|にんじゅつ}を{使|つか}って{人間化|にんげんか}して{体術|たいじゅつ}を{使|つか}う。',
    kanaoni: '{奥地|おくち}に{住|す}む{伝説|でんせつ}の{鍛冶師|かじし}。クランに{縛|しば}られない{存在|そんざい}。',
    oto: '{宇迦|うか}のライバル。{兎|うさぎ}を{召喚|しょうかん}する。{於菟|おと}は{本来|ほんらい}トラを{意味|いみ}し、トラのような{勇敢|ゆうかん}さを{示唆|しさ}。',
    rotten: '{風魔|ふうま}の{幹部|かんぶ}。アトザの{部下|ぶか}。Rotten＝{腐|くさ}る。',
    anne: 'お{調子者|ちょうしもの}。{団子|だんご}の{串|くし}で{影縫|かげぬ}い。',
    dan: '{風魔|ふうま}の{幹部|かんぶ}。アトザの{部下|ぶか}。',
    torika: '{花|はな}を{育|そだ}てるのが{好|す}き。',
    atoza: '{風魔|ふうま}の{首領級|しゅりょうきゅう}。{実|じつ}は{人情派|にんじょうは}。',
    hayate: '{伊賀|いが}の{師匠的|ししょうてき}{存在|そんざい}。{鷹|たか}の{名前|なまえ}は「ナルカミ」。',
    uka: '{於兎|おと}のライバル。{狐|きつね}を{使役|しえき}する。お{稲荷様|いなりさま}（ウカノミタマ）からヒントを{得|え}た{名前|なまえ}。',
    ganzi: '{娘|むすめ}は{令|れい}、{孫|まご}は{結|ゆい}。クランが{違|ちが}うのは{過去|かこ}の{事件|じけん}から。',
    yui: '{後方|こうほう}{支援|しえん}{特化|とっか}。{遠方|えんぽう}から{忍術|にんじゅつ}を{仕掛|しか}ける。',
    fuuta: '{酒飲|さけの}みでお{調子者|ちょうしもの}。{戦|たたか}いを{好|この}まず{風遁|ふうとん}で{逃|に}げがち。やるときはやる。',
    rei: '{里|さと}を{守|まも}る{存在|そんざい}。{結|ゆい}の{母|はは}。{忍術|にんじゅつ}・{人身御供|ひとみごくう}は{最終|さいしゅう}{手段|しゅだん}。',
    nekomata: 'とにかく{魚|さかな}が{好|す}き。',
    janome: '{白蛇|しろへび}の{名前|なまえ}は「オロチ」。{口寄|くちよ}せで{大蛇|だいじゃ}を{召喚|しょうかん}できる。',
    karma: '{赤|あか}い{目|め}で{瞳術|どうじゅつ}を{掛|か}ける。',
    ichiya: '{伝令|でんれい}のスペシャリスト。{彼|かれ}が{書|か}く{虹色|にじいろ}の{文字|もじ}は{空|そら}を{舞|ま}い、{世界|せかい}にメッセージを{届|とど}ける。',
    nemu: 'イチヤの{姉|あね}。{自由奔放|じゆうほんぽう}。パートナーの{名前|なまえ}はピヨチ（ひよこ）とウサピ（うさぎ）。',
    karura: '{伊賀|いが}の{山奥|やまおく}でひっそりと{里|さと}を{守|まも}っている。',
    xiaolan: '{口寄|くちよ}せでパンダを{呼|よ}ぶ。パンダの{名前|なまえ}は「リーリー（{力力|リーリー}）」。パンダは{巨大化|きょだいか}できる。',
    aum: 'アトザの{弟|おとうと}。{巨大化|きょだいか}できる。',
    konga: '{甲賀|こうか}のくのいちに{修行|しゅぎょう}をつけるコーチ{的|てき}{存在|そんざい}。',
    shion: '{幼|おさな}い{頃|ころ}に{集落|しゅうらく}が{鬼|おに}に{襲|おそ}われ、{令|れい}が{面倒|めんどう}を{見|み}ている。{人見知|ひとみし}りだが、{餡音|あんね}にはなついている。',
    seori: '{名称|めいしょう}は{瀬織津姫|せおりつひめ}から。パートナーの{名前|なまえ}は「ミタマ」。',
    quon: '「{幸福|こうふく}な{未来|みらい}」を{選択|せんたく}する{能力|のうりょく}を{持|も}つ。{年齢|ねんれい}{不詳|ふしょう}。{猫又|ねこまた}と{同|おな}じ{里|さと}の{出身|しゅっしん}で{猫又|ねこまた}より{年上|としうえ}。{神出鬼没|しんしゅつきぼつ}。{一人称|いちにんしょう}は「わし」。{名称|めいしょう}は{量子|りょうし}（Quantum）から。',
    magoichi: '{雑賀|さいか}クランの{首領|しゅりょう}。{雑賀|さいか}の{里|さと}に{帰|かえ}るのは{稀|まれ}で、{里|さと}のことは{弁天|べんてん}に{任|まか}せている。{今|いま}は{海|うみ}に{出|で}て{海賊|かいぞく}のように{動|うご}いているらしい。',
    ibuki: 'ヤーマはイブキの{能力|のうりょく}に{応|おう}じた{姿|すがた}になる。イブキが{未熟|みじゅく}であるためかわいい{姿|すがた}で{現界|げんかい}している。イブキは「{気吹戸主|いぶきどぬし}」から、ヤーマは「{閻魔大王|えんまだいおう}」に{由来|ゆらい}。',
    oen: '{実家|じっか}は{雑賀|さいか}クラン。{里|さと}を{離|はな}れて{甲賀|こうか}クランに{忍術|にんじゅつ}の{修行|しゅぎょう}に{来|き}ている。',
    izuna: '{宇迦|うか}の{姉|あね}。'
  };
  // こどもモードで出す、やわらげた紹介文（data.js の KIDS_BIO に無いときだけ使う。文章担当が KIDS_BIO に移す）
  var KIDS_BIO_UI = {
    jin: '{忍者|にんじゃ}の{祖|そ}。{謎|なぞ}{多|おお}き{伝説|でんせつ}の{忍者|にんじゃ}。',
    shion: '{小|ちい}さいころから{令|れい}が{面倒|めんどう}を{見|み}ている。{人見知|ひとみし}りだが、{餡音|あんね}にはなついている。',
    fuuta: 'お{調子者|ちょうしもの}。けんかを{好|この}まず、{風遁|ふうとん}でさっと{逃|に}げがち。やるときはやる。',
    rotten: '{風魔|ふうま}の{幹部|かんぶ}。アトザの{部下|ぶか}。',
    shiba: '{普段|ふだん}は{犬|いぬ}の{姿|すがた}だが、いざというときは{忍術|にんじゅつ}で{人|ひと}の{姿|すがた}になって{体術|たいじゅつ}を{使|つか}う。'
  };
  function hasKanji(s) { return /[一-鿿々]/.test(s); }
  function word(w) {
    if (w == null) return '';
    var o = T().official && T().official.words && T().official.words[w];
    if (o) return o;
    var k = WORD[w];
    if (k == null) return w;
    if (k.indexOf('{') >= 0 || !hasKanji(w)) return k.indexOf('{') >= 0 ? k : w;
    return '{' + w + '|' + k + '}';
  }
  function isShadow(id) { var s = S(); return id === 'jin' && s && s.jin && s.jin.shadow && !s.jin.revealed; }
  /** 名前（ふりがな書式）。刃がなぞの影のあいだは「？？？」 */
  function nameF(id, raw) {
    if (!raw && isShadow(id)) return (T().jin && T().jin.shadowName) || '？？？';
    var o = T().official && T().official.names && T().official.names[id];
    if (o) return o;
    var c = CH().BY_ID[id];
    if (!c) return id;
    if (NAME_FURI[id]) return NAME_FURI[id];
    return NAME_KANA[id] && hasKanji(c.name) ? '{' + c.name + '|' + NAME_KANA[id] + '}' : c.name;
  }
  function clanF(clan) { var c = (D().CLANS || {})[clan]; return c ? '{' + clan + '|' + c.kana + '}' : (clan || ''); }
  function rankF(r) { var x = (D().RANKS || [])[r || 0]; return x ? x.name : ''; }
  function dyeOf(id) { return (D().DYES || []).filter(function (d) { return d.id === id; })[0] || null; }
  function dyeF(id) { var d = dyeOf(id); return d ? d.name : ''; }
  function stationF(idx) { var s = (D().STATIONS || [])[idx]; return s ? (hasKanji(s.name) ? '{' + s.name + '|' + s.kana + '}' : s.name) : ''; }
  /** 'YYYY-MM-DD' → '11/11' */
  function mdF(date) { var p = String(date || '').split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) : U().esc(date || ''); }
  function isSecret(id) { return (D().SECRET_JUTSU || []).indexOf(id) >= 0; }
  /** 秘密の術の名を見せてよいか（おとなモードで保護者が「見る」にしたときだけ） */
  // ながめるモード（関門なしで入れる）では、開いたファイルの設定にかかわらず、こども向けの守りで見せる
  // （ひみつの術の名を伏せる・やさしく書き直した紹介文）。保護者が関門を通したときだけ、ファイルのとおりに見せる
  function viewGuard() { return !!(A().view && !A().viewUnlocked); }
  function secretOpen() { if (viewGuard()) return false; var s = S(); return !!(s && s.mode === 'otona' && s.settings && s.settings.showSecretNames); }
  function jutsuF(id) {
    var c = CH().BY_ID[id];
    if (!c) return '';
    if (isSecret(id) && !secretOpen()) return 'ひみつの{術|じゅつ}';
    return word(c.jutsu);
  }
  function kidsNow() { if (viewGuard()) return true; var s = S(); return !s || s.mode !== 'otona'; }
  /** こども向けにやわらげた紹介文を出すときはその文、出さないときは null */
  function kidsBio(id) {
    var KB = D().KIDS_BIO || {};
    // こどもモードでは、やわらげた紹介文があればいつもそれを出す（ひみつの術の体は、名前を見せない間も）
    if (kidsNow() || (isSecret(id) && !secretOpen())) {
      if (KB[id]) return KB[id];
      if (kidsNow() && KIDS_BIO_UI[id]) return KIDS_BIO_UI[id];
    }
    return null;
  }
  function bioF(id) {
    var kb = kidsBio(id);
    if (kb) return kb;
    var o = T().official && T().official.bio && T().official.bio[id];
    return o || BIO[id] || '';
  }
  function birthdayF(b) {
    if (!b) return '';
    if (b === '不明') return '{不明|ふめい}';
    if (b === '—') return '—';
    return String(b).replace(/(\d+)月(\d+)日/, '$1{月|がつ}$2{日|にち}');
  }
  function weaponShown(id, rank) {
    if (id === 'magoichi' && !CFG().SHOW_GUN) return false;
    return (rank || 0) >= (D().WEAPON_FROM_RANK || 3);
  }
  function weaponF(id, rank) {
    var c = CH().BY_ID[id];
    if (!c) return '';
    if (id === 'magoichi' && !CFG().SHOW_GUN) return 'ひみつ';
    if (!weaponShown(id, rank)) return '{中忍|ちゅうにん}になるとわかるよ';
    return word(c.weapon);
  }
  function charRec(id) { var s = S(); return s && s.chars && s.chars[id] || null; }
  function visited(id) { return !!charRec(id); }
  /** 絵（SA.Fig があれば）。st=状態、size=幅(px)。武器は中忍以上のときだけ */
  function fig(id, st, size, more) {
    var c = charRec(id);
    var o = Object.assign({ state: st || 'normal', dye: c ? c.dye : 'none', weapon: c ? weaponShown(id, c.rank) : false }, more || {});
    if (SA.Fig && typeof SA.Fig.el === 'function') {
      try {
        if (o.silhouette || (id === 'jin' && isShadow(id) && !o.real)) return SA.Fig.el(id, { silhouette: true, state: o.state === 'hide' ? 'normal' : o.state, view: o.view }, size);
        return SA.Fig.el(id, o, size);
      } catch (e) { console.warn('Fig', id, e); }
    }
    var ph = U().h('div.fig-ph', { style: { width: size + 'px' } }, [U().soon('{絵|え}')]);
    return ph;
  }
  function hourNow() { return new Date().getHours(); }
  function nightNow() { var h = hourNow(); var c = CFG().REJECT || {}; return h >= (c.kidsNightFrom || 0) && h < (c.kidsNightTo || 5); }

  /* ================= 小さな部品 ================= */
  function bar(p, label, cls) {
    var h = U().h;
    var pct = Math.max(0, Math.min(1, p || 0)) * 100;
    return h('div.bar-w', { cls: cls || '' }, [
      label ? h('div.bar-l', { text: label }) : null,
      h('div.bar', { attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)) } }, [h('i', { style: { width: pct.toFixed(1) + '%' } })])
    ]);
  }
  function ring(value, goal, size) {
    var p = goal > 0 ? Math.min(1, value / goal) : 0, r = 52, c = 2 * Math.PI * r;
    return '<svg viewBox="0 0 120 120" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="10"/>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + (p >= 1 ? 'var(--gold)' : 'var(--green)') + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>';
  }
  function section(title, kids, cls) {
    var h = U().h;
    return h('section.card', { cls: cls || '' }, [title ? h('h2.card-t', { text: title }) : null].concat(kids || []));
  }
  function screenWrap(title, kids, cls) {
    var h = U().h;
    return h('div.scr', { cls: cls || '' }, [title ? h('h1.scr-t', { text: title }) : null].concat(kids || []));
  }
  function notReady(what) { return section(null, [U().h('p', { text: 'この{部分|ぶぶん}は' }), U().soon(what)]); }
  function readFileText(file) {
    if (!file) return Promise.resolve(null);
    if (file.text) return file.text();
    return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result)); }; fr.onerror = function () { res(null); }; fr.readAsText(file); });
  }
  function fileButton(label, accept, onFile, extra) {
    var h = U().h;
    var inp = h('input', { attrs: { type: 'file', accept: accept, hidden: true, 'data-file': (extra && extra.id) || '' }, on: { change: function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onFile(f); } } });
    var b = U().btn(label, function () { inp.click(); }, (extra && extra.cls) || '', { attrs: { type: 'button', 'data-act': (extra && extra.id) || 'file' } });
    return h('span.filebtn', [b, inp]);
  }

  /* ================= 3.1 はじめて ================= */
  var ob = { mainId: null, mode: 'kodomo', panel: 0, permMsg: null };
  /** はじめての画面を最初から始めるときに呼ぶ（前回の相棒・おとなモードを残さない） */
  function resetOnboard() { ob = { mainId: null, mode: 'kodomo', panel: 0, permMsg: null }; }
  function onboard(p) {
    var h = U().h, btn = U().btn, step = p.step || 0;
    var P = T().parent || {};
    var info = A().info || { route: 'none' };
    var dots = h('div.ob-dots', [0, 1, 2, 3, 4, 5, 6].map(function (i) { return h('i', { cls: i === step ? 'on' : '' }); }));
    function next(st) { U().go('onboard', { step: st }); }
    // 前の手順にもどる（選んだ相棒・おとな／こどもは残す）
    function prevB(st, before) { return btn('もどる', function () { if (before) before(); next(st); }, 'ghost', { attrs: { type: 'button', 'data-act': 'prev' } }); }
    var body = [];
    if (step === 0) {
      body = [
        h('h1.scr-t', { text: 'おうちの{方|かた}へ' }),
        section(null, [
          h('p', { text: P.short || 'このアプリは、{端末|たんまつ}が{数|かぞ}えた{毎日|まいにち}の{歩数|ほすう}で、{忍|しのび}たちを{育|そだ}てる{家族|かぞく}{向|む}けのゲームです。' }),
          P.unofficial ? h('p.unofficial', { text: P.unofficial }) : null,
          btn('くわしく{読|よ}む', function () { parentText(); }, 'ghost', { attrs: { type: 'button', 'data-act': 'parent-more' } })
        ]),
        h('div.ob-foot', [btn('つぎへ', function () { next(1); }, 'primary big', { attrs: { type: 'button', 'data-act': 'next' } })])
      ];
    } else if (step === 1) {
      var native = U().isNative();
      var canPlay = info.route !== 'none';
      body = [
        h('div.title', [
          h('div.title-figs', ['anne', 'sakuya', 'kohaku', 'shiba'].map(function (id) { return fig(id, 'walk', 64, { view: 'walkR' }); })),
          h('h1.title-t', { text: '{忍|しの}び{足|あし}' }),
          h('p.title-sub', { text: '{家族|かぞく}で{歩|ある}く{三十九|さんじゅうく}の{里|さと}' }),
          h('p.unofficial', { text: P.unofficial || 'CryptoNinja（CC0・Ninja DAO）のキャラクターを{使|つか}った{個人|こじん}{制作|せいさく}の{非公式|ひこうしき}ファンゲームです。' })
        ]),
        h('div.ob-foot.col', [
          canPlay ? btn(native ? 'はじめる' : 'ためし{歩|ある}きで{遊|あそ}ぶ（{試遊|しゆう}）', function () { next(2); }, 'primary big', { attrs: { type: 'button', 'data-act': 'play' } }) : null,
          btn('ながめる（{図鑑|ずかん}と{忍|しの}びの{道|みち}）', function () {
            if (U().has('Store', 'setPref')) SA.Store.setPref('viewMode', true);
            U().enterView();
          }, canPlay ? '' : 'primary big', { attrs: { type: 'button', 'data-act': 'view' } }),
          !canPlay ? h('p.muted', { text: 'この{端末|たんまつ}では{歩数|ほすう}を{数|かぞ}えられないので、ながめるモードで{遊|あそ}べます。' }) : null,
          prevB(0)
        ])
      ];
    } else if (step === 2) {
      var reps = D().REPS || [];
      body = [
        h('h1.scr-t', { text: '{相棒|あいぼう}を{選|えら}ぼう' }),
        h('p.lead', { text: 'いっしょに{歩|ある}く、さいしょの{相棒|あいぼう}を1{人|にん}{選|えら}んでね。' }),
        h('div.rep-list', reps.map(function (r) {
          var on = ob.mainId === r.id;
          return h('button', { cls: 'rep' + (on ? ' on' : ''), attrs: { type: 'button', 'data-rep': r.id, 'aria-pressed': on ? 'true' : 'false' }, on: { click: function () { ob.mainId = r.id; U().render(); } } }, [
            fig(r.id, on ? 'happy' : 'normal', 92),
            h('div.rep-x', [h('b.rep-n', { text: nameF(r.id, true) }), h('span.clan-tag', { text: clanF(r.clan) + 'の{里|さと}', style: { '--c': ((D().CLANS || {})[r.clan] || {}).color || '#666' } }), h('p', { text: r.pitch })])
          ]);
        })),
        h('div.ob-foot.sticky', [prevB(1), btn('この{相棒|あいぼう}にする', function () { if (ob.mainId) next(3); }, 'primary big', { attrs: { type: 'button', 'data-act': 'next' }, disabled: !ob.mainId })])
      ];
    } else if (step === 3) {
      var G = CFG().GOAL || { kodomo: { def: 10000 }, otona: { def: 8000 } };
      body = [
        h('h1.scr-t', { text: 'だれが{遊|あそ}ぶ？' }),
        h('div.mode-list', [
          h('button', { cls: 'mode' + (ob.mode === 'kodomo' ? ' on' : ''), attrs: { type: 'button', 'data-mode': 'kodomo', 'aria-pressed': ob.mode === 'kodomo' ? 'true' : 'false' }, on: { click: function () { ob.mode = 'kodomo'; U().render(); } } },
            [h('b', { text: 'こども' }), h('span', { text: '{目標|もくひょう} ' + U().n(G.kodomo.def) + '{歩|ほ}。{夜|よる}おそくの{歩数|ほすう}は{修行|しゅぎょう}に{入|はい}らないよ。' })]),
          h('button', { cls: 'mode' + (ob.mode === 'otona' ? ' on' : ''), attrs: { type: 'button', 'data-mode': 'otona', 'aria-pressed': ob.mode === 'otona' ? 'true' : 'false' }, on: { click: function () {
            if (ob.mode === 'otona') return;
            U().gate(function (ok) { if (ok) { ob.mode = 'otona'; U().render(); } });
          } } }, [h('b', { text: 'おとな' }), h('span', { text: '{目標|もくひょう} ' + U().n(G.otona.def) + '{歩|ほ}。おとなに{変|か}えるときは、{保護者|ほごしゃ}の{確|たし}かめがあります。' })])
        ]),
        h('p.muted', { text: '{年齢|ねんれい}や{名前|なまえ}は{聞|き}きません。あとから{保護者|ほごしゃ}{設定|せってい}で{変|か}えられます。' }),
        h('div.ob-foot', [prevB(2), btn('つぎへ', function () { ob.panel = 0; next(4); }, 'primary big', { attrs: { type: 'button', 'data-act': 'next' } })])
      ];
    } else if (step === 4) {
      var panels = [
        { t: '{修行枠|しゅぎょうわく}', p: '{相棒|あいぼう}は3{人|にん}まで{修行枠|しゅぎょうわく}に{入|い}れられるよ。{歩|ある}いた{分|ぶん}が、{割合|わりあい}に{合|あ}わせて{修行|しゅぎょう}になる。', f: [ob.mainId || 'anne', 'serious'] },
        { t: '{道|みち}か、{里|さと}か', p: '{毎日|まいにち}「{道|みち}を{進|すす}める」か「{里|さと}に{納|おさ}める（{我|わ}が{家|や}）」を{選|えら}べるよ。{道|みち}は{宿場|しゅくば}へ、{里|さと}は{隠|かく}れ{里|ざと}の{探|さが}しものへ。', f: [ob.mainId || 'anne', 'walk'] },
        { t: '{取|と}り{込|こ}む', p: '{家|いえ}に{帰|かえ}ったら{開|ひら}いて「{取|と}り{込|こ}む」。{歩|ある}きながらは{見|み}ないでね。{休|やす}むのも{修行|しゅぎょう}だよ。', f: [ob.mainId || 'anne', 'happy'] }
      ];
      var pn = ob.panel % 3, pp = panels[pn];
      body = [
        h('h1.scr-t', { text: '{遊|あそ}び{方|かた}（' + (pn + 1) + '/3）' }),
        section(pp.t, [h('div.center', [fig(pp.f[0], pp.f[1], 120, pp.f[1] === 'walk' ? { view: 'walkR' } : null)]), h('p', { text: pp.p })], 'panel-koma'),
        h('div.ob-foot', [
          pn > 0 ? btn('もどる', function () { ob.panel = pn - 1; U().render(); }, 'ghost', { attrs: { type: 'button', 'data-act': 'prev' } }) : prevB(3),
          btn(pn < 2 ? 'つぎ' : 'わかった', function () { if (pn < 2) { ob.panel = pn + 1; U().render(); } else { ob.panel = 0; next(5); } }, 'primary big', { attrs: { type: 'button', 'data-act': 'next' } })
        ])
      ];
    } else if (step === 5) {
      body = [
        h('h1.scr-t', { text: '{歩数|ほすう}を{使|つか}うよ' }),
        section(null, [
          h('p.big-p', { text: P.permission || '{毎日|まいにち}{歩|ある}く{習慣|しゅうかん}づくりのために、{端末|たんまつ}が{数|かぞ}えた{歩数|ほすう}を{相棒|あいぼう}の{修行|しゅぎょう}に{使|つか}います。{歩数|ほすう}はインターネットには{送|おく}りません。' }),
          btn('おうちの{方|かた}へ', function () { parentText(); }, 'ghost', { attrs: { type: 'button', 'data-act': 'parent-more' } }),
          ob.permMsg ? h('p.ng', { text: ob.permMsg }) : null
        ]),
        h('div.ob-foot.col', [
          btn('{許可|きょか}して{進|すす}む', function () {
            if (!U().has('Steps', 'request')) { next(6); return; }
            Promise.resolve(SA.Steps.request()).then(function (r) {
              // 許可のあとに経路が変わることがある（Android の (b)→(c)）。新しい情報に入れ替えてから進む
              if (r === 'granted') { ob.permMsg = null; return refreshInfo().then(function () { next(6); }); }
              else { ob.permMsg = '{許可|きょか}されませんでした。{端末|たんまつ}の「{設定|せってい}」から{許可|きょか}するか、ながめるモードで{遊|あそ}べます。'; U().render(); }
            }, function () { next(6); });
          }, 'primary big', { attrs: { type: 'button', 'data-act': 'permit' } }),
          ob.permMsg ? btn('ながめるモードにする', function () { U().enterView(); }, '', { attrs: { type: 'button', 'data-act': 'view' } }) : null,
          prevB(4, function () { ob.panel = 2; })
        ])
      ];
    } else {
      body = [
        h('h1.scr-t', { text: 'さいしょの{取|と}り{込|こ}み' }),
        section(null, [
          h('div.center', [fig(ob.mainId || 'anne', 'walk', 130, { view: 'walkR' })]),
          h('p', { text: info.route === 'ios' ? 'iPhone は7{日|にち}{前|まえ}までの{歩数|ほすう}を{読|よ}めるよ。' : '{今日|きょう}の{歩数|ほすう}から{数|かぞ}えはじめるよ。' })
        ]),
        h('div.ob-foot', [prevB(5), btn('{取|と}り{込|こ}んではじめる', function (e) { var b = e.currentTarget || e.target; if (b) b.disabled = true; firstStart(); }, 'primary big', { attrs: { type: 'button', 'data-act': 'start' } })])
      ];
    }
    if (!U().has('Rules', 'newState') && step >= 2) body.unshift(notReady('ルール'));
    return screenWrap(null, [dots].concat(body), 'ob');
  }
  /** SA.Steps の最新の情報（許可のあとに detect し直したもの）を画面側にも入れる */
  function refreshInfo() {
    if (!SA.Steps) return Promise.resolve(A().info);
    if (SA.Steps.info) { A().info = SA.Steps.info; return Promise.resolve(A().info); }
    if (typeof SA.Steps.detect !== 'function') return Promise.resolve(A().info);
    return Promise.resolve(SA.Steps.detect()).then(function (i) { if (i) A().info = i; return A().info; }, function () { return A().info; });
  }
  function firstStart() {
    var Rr = R();
    if (!Rr || !Rr.newState) { U().toast('ルールの{部品|ぶひん}が{準備中|じゅんびちゅう}です'); return; }
    if (SA.Steps && SA.Steps.info) A().info = SA.Steps.info;
    var info = A().info || { route: 'none' };
    var t = U().today();
    var s;
    try { s = Rr.newState({ mainId: ob.mainId || 'anne', mode: ob.mode, today: t, route: info.route }); } catch (e) { console.warn(e); U().toast('うまくいきませんでした'); return; }
    A().state = s;
    if (U().has('Store', 'setPref')) { SA.Store.setPref('viewMode', false); SA.Store.setPref('mode', ob.mode); }
    A().screen = 'home';
    U().save().then(function () {
      U().render();
      return U().onOpen('first');
    });
  }
  function parentText() {
    var h = U().h, P = T().parent || {};
    var kids = [];
    if (P.short) kids.push(h('p', { text: P.short }));
    (P.claims || []).forEach(function (c) { kids.push(h('h3', { text: c.title })); kids.push(h('p', { text: c.text })); });
    (P.detail || []).forEach(function (t) { kids.push(h('p', { text: t })); });
    [P.gate, P.exportNote, P.erase, P.medical].forEach(function (t) { if (t) kids.push(h('p', { text: t })); });
    if (P.unofficial) kids.push(h('p.unofficial', { text: P.unofficial }));
    if (!kids.length) kids.push(U().soon('{文章|ぶんしょう}'));
    // 同じフォルダのページ（外部リンクではない）。遊び方とおうちの方へを1ページで読める
    var a = h('a.btn.ghost.small', { attrs: { href: 'about.html', 'data-act': 'about-page' } });
    a.innerHTML = '<span class="bl">' + U().furi('{別|べつ}のページで{開|ひら}く') + '</span>';
    kids.push(h('div.center', [a]));
    U().modal(kids, { title: 'おうちの{方|かた}へ', cls: 'long' });
  }

  /* ================= 3.2 ホーム ================= */
  function speech(sm) {
    var s = S(), id = s.mainId, nm = nameF(id), TX = T(), sp = TX.special || {};
    if (nightNow()) return U().fill(sp.sleeping || '{name}は、かくれて{眠|ねむ}っているよ。', { name: nm });
    if (sm && sm.capped) return U().fill(sp.cap || '{今日|きょう}はここまで。あとは{休|やす}むのも{修行|しゅぎょう}。', { name: nm });
    if (sm && sm.solarTerm && TX.sekki && TX.sekki[sm.solarTerm.name]) return TX.sekki[sm.solarTerm.name];
    if (sm && sm.fullMoon) return '{満月|まんげつ}のころだね。{夜|よる}は、おうちの{窓|まど}から{月|つき}を{見|み}よう。';
    if (sm && sm.goalReached) return U().fill(sp.goal || '{目標|もくひょう}に{届|とど}いた！', { name: nm });
    var c = s.chars[id] || {}, k = dayNum(U().today());
    var bl = TX.bond && TX.bond[id];
    if (bl && bl.length) {
      var at = D().BOND_LINES_AT || [], open = at.filter(function (x) { return (c.bond || 0) >= x; }).length;
      if (open > 0) return pick(bl.slice(0, open), k);
    }
    var il = TX.idle && TX.idle[id];
    if (il && il.length) return pick(il, k);
    if (TX.greet && TX.greet[id]) return TX.greet[id];
    return '{今日|きょう}も、いっしょに{歩|ある}こう。';
  }
  function home() {
    var h = U().h, btn = U().btn, n = U().n;
    var s = A().state;
    if (!s) return screenWrap(null, [notReady('{記録|きろく}')]);
    var sm = U().summary();
    if (!sm) return screenWrap(null, [notReady('ルール')]);
    var t = U().today();
    var wd = ['{日|にち}', '{月|げつ}', '{火|か}', '{水|すい}', '{木|もく}', '{金|きん}', '{土|ど}'][sm.weekday || 0];
    var p = t.split('-');
    var dateLine = (+p[1]) + '{月|がつ}' + (+p[2]) + '{日|にち}（' + wd + '）' + (sm.holiday ? ' ' + (hasKanji(sm.holiday.name) ? '{' + sm.holiday.name + '|' + sm.holiday.kana + '}' : sm.holiday.name) : '');
    var night = nightNow();
    // 深夜はかくれて眠る（hide＋sleep）。上限に届いた日は「ひと休み」なので、跳ねて喜ばずにふつうの形
    var mainSt = night ? 'hide' : (sm.capped ? 'normal' : (sm.goalReached ? 'happy' : 'normal'));
    var sleepO = night ? { sleep: true } : null;
    var others = (s.slots || []).filter(function (id) { return id && id !== s.mainId; });
    // 背の低い画面（360×640 など）では絵を小さくして、「取り込む」と手がかりを最初の画面に入れる
    var short = root.innerHeight > 0 && root.innerHeight < 720;
    var mainPx = short ? 110 : 150, sidePx = short ? 58 : 72;
    var hero = h('div.hero' + (short ? '.short' : ''), [
      h('div.hero-date', { text: dateLine + (sm.solarTerm ? '　' + (hasKanji(sm.solarTerm.name) ? '{' + sm.solarTerm.name + '|' + sm.solarTerm.kana + '}' : sm.solarTerm.name) : '') + (sm.fullMoon ? '　{満月|まんげつ}' : '') }),
      h('div.hero-figs', [
        h('div.hero-side', others.slice(0, 1).map(function (id) { return fig(id, night ? 'hide' : 'normal', sidePx, sleepO); })),
        h('div.hero-main', [fig(s.mainId, mainSt, mainPx, sleepO)]),
        h('div.hero-side', others.slice(1, 2).map(function (id) { return fig(id, night ? 'hide' : 'normal', sidePx, sleepO); }))
      ]),
      h('div.bubble', [h('b', { text: nameF(s.mainId) }), h('span', { text: speech(sm) })]),
      guestStrip(sm)
    ]);
    var ringBox = h('div.ring-box', { html: ring(sm.steps, sm.goal, 128) }, [
      h('div.ring-c', [h('small', { text: '{今日|きょう}の{歩数|ほすう}' }), h('b.steps-n', { attrs: { 'data-steps': String(sm.steps) }, html: n(sm.steps) }), h('small', { text: '{目標|もくひょう} ' + n(sm.goal) })])
    ]);
    var stat = h('div.stat', [
      h('div.stat-r', [h('span', { text: '{修行値|しゅぎょうち}' }), h('b', { html: n(sm.shugyo) })]),
      h('div.stat-r', [h('span', { text: '{上限|じょうげん}まで' }), h('b', { html: sm.capped ? '—' : n(sm.toCap) })]),
      sm.goalReached ? h('div.stat-ok', { text: '{目標|もくひょう}に{届|とど}いた！' }) : h('div.stat-r', [h('span', { text: '{目標|もくひょう}まで' }), h('b', { html: n(sm.toGoal) })]),
      btn('{巻物|まきもの} <b>' + sm.scrolls + '</b>', function () { U().go('jutsu'); }, 'scroll-b' + (sm.scrolls > 0 ? ' has' : ''), { attrs: { type: 'button', 'data-act': 'scrolls' }, html: furiInline('{巻物|まきもの}') + ' <b data-scrolls="' + sm.scrolls + '">' + sm.scrolls + '</b>' })
    ]);
    var today2 = h('div.today-box', [ringBox, stat]);
    // 輪は端末の歩数、修行値は採用した歩数。入らなかった分があれば、そのわけを小さく出す
    var rejNote = sm.rejected > 0 ? h('p.muted.rej-note', { attrs: { 'data-rejected': String(sm.rejected) }, text:
      (s.mode !== 'otona' ? '{夜|よる}おそく（0〜5{時|じ}）の{歩数|ほすう}や、{速|はや}すぎる{歩数|ほすう}は{修行|しゅぎょう}に{入|はい}らないよ。' : '{速|はや}すぎる{歩数|ほすう}は{修行|しゅぎょう}に{入|はい}らないよ。') +
      '（{入|い}れなかった{歩数|ほすう} ' + n(sm.rejected) + '）' }) : null;
    // 吹き出しが「今日はここまで…」を言うので、緑の枠は短い見出しだけ
    var capMsg = sm.capped ? h('div.cap-msg', { text: '✓ {今日|きょう}の{修行値|しゅぎょうち}は{上限|じょうげん}に{届|とど}いたよ' }) : null;
    // 試遊で、まだ1歩も足していないときの手がかり（はじめのうちだけ）。背の低い画面でも見えるように、手がかりと「取り込む」を輪より上に出す
    var simHint = U().isSim() && !sm.steps && !s.visitTotal ? h('div.sim-hint', { attrs: { 'data-hint': 'sim' } }, [h('span', { text: '{下|した}の「ためし{歩|ある}き」で、{歩数|ほすう}を{足|た}してみよう' }), h('span.sim-hint-arrow', { html: '▼', attrs: { 'aria-hidden': 'true' } })]) : null;
    var syncB = btn('{取|と}り{込|こ}む', function () { U().sync('button'); }, 'primary big sync-b', { attrs: { type: 'button', 'data-act': 'sync' } });
    var choice = null;
    if (!s.settings || s.settings.homeButton !== false) {
      choice = h('div.choice', { attrs: { role: 'group', 'aria-label': '今日の選択' } }, [
        btn('{道|みち}を{進|すす}める', function () { setChoice(false); }, 'seg-b' + (!sm.home ? ' on' : ''), { attrs: { type: 'button', 'data-choice': 'road', 'aria-pressed': !sm.home ? 'true' : 'false' } }),
        btn('{里|さと}に{納|おさ}める（{我|わ}が{家|や}）', function () { setChoice(true); }, 'seg-b' + (sm.home ? ' on' : ''), { attrs: { type: 'button', 'data-choice': 'home', 'aria-pressed': sm.home ? 'true' : 'false' } })
      ]);
    }
    var fam = null;
    if (!s.settings || s.settings.familyButton !== false) {
      fam = btn(sm.family ? '{家族|かぞく}で{歩|ある}いた{日|ひ} ✓' : '{家族|かぞく}で{歩|ある}いた{日|ひ}', function () {
        U().setState(U().apply('setFamilyDay', t, !sm.family)); U().save(); U().render();
      }, 'fam-b' + (sm.family ? ' on' : ''), { attrs: { type: 'button', 'data-act': 'family', 'aria-pressed': sm.family ? 'true' : 'false' } });
    }
    var bars = [];
    if (sm.nextVisit) {
      var prevAt = sm.nextVisit.n > 1 ? D().VISIT_AT[sm.nextVisit.n - 2] : 0;
      var pv = (sm.visitTotal - prevAt) / (sm.nextVisit.at - prevAt);
      bars.push(bar(pv, (sm.nextVisit.jin ? '{次|つぎ}は……なぞの{気配|けはい}' : '{次|つぎ}の{来訪|らいほう}') + 'まで あと ' + n(sm.nextVisit.remain) + '{歩|ほ}', 'visit'));
    } else if (sm.jin && sm.jin.shadow && !sm.jin.revealed) {
      bars.push(bar(1 - sm.jin.toReveal / ((CFG().JIN_REVEAL_AT || 1200000) - (CFG().JIN_SHADOW_AT || 1150000)), 'なぞの{影|かげ}が{名乗|なの}るまで あと ' + n(sm.jin.toReveal) + '{歩|ほ}', 'visit'));
    }
    if (sm.nextStation) {
      var step = CFG().ROAD_STEP || 20000;
      var ps = 1 - sm.nextStation.remain / step;
      bars.push(bar(ps, '{次|つぎ}の{宿場|しゅくば}「' + stationF(sm.nextStation.idx) + '」まで あと ' + n(sm.nextStation.remain) + '{歩|ほ}', 'road'));
    }
    var info = A().info || {};
    var note = info.route === 'androidC' ? h('p.muted', { text: '（この{端末|たんまつ}では、{開|ひら}かなかった{日|ひ}の{分|ぶん}は、{開|ひら}いた{日|ひ}の{修行|しゅぎょう}に{入|はい}る）' }) : null;
    return screenWrap(null, [hero, section(null, simHint ? [simHint, syncB, today2, rejNote, capMsg, choice, fam] : [today2, rejNote, capMsg, syncB, choice, fam]), section(null, bars), note], 'home');
  }
  function furiInline(t) { return U().furi(t); }
  function setChoice(home) {
    var t = U().today();
    var r = U().apply('setChoice', t, { home: home }, t);   // 4つ目の today: rules.js は今日の分だけ受け付ける
    if (r && !r.error) { U().setState(r); U().save(); }
    U().render();
  }
  var GUEST_LAP = 16;   // 里の客が帯を1回わたる秒数
  function guestStrip(sm) {
    var h = U().h;
    var g = (sm && sm.guests) || [];
    if (!g.length) return null;
    var strip = h('div.guests', { attrs: { 'aria-label': '里の客' } });
    g.slice(0, 5).forEach(function (x, i) {
      var el = null;
      if (SA.Fig && SA.Fig.el) { try { el = SA.Fig.el(x.id, { state: 'walk', view: 'walkR', dye: x.dye || 'none' }, 44); } catch (e) { el = null; } }
      if (!el) return;
      // 歩く位置は時計から決める（描き直しても外から歩き直さない）。体どうしは 1周の 1/5 ずつずらす
      var w = h('div.guest', { style: { 'animation-delay': (-((Date.now() / 1000 + i * GUEST_LAP / 5) % GUEST_LAP)).toFixed(2) + 's', 'animation-duration': GUEST_LAP + 's' } }, [el]);
      strip.appendChild(w);
    });
    return strip;
  }

  /* ================= 3.3 修行（修行枠） ================= */
  function affLabel(id) {
    var a = (D().AFFINITY || {})[id];
    if (!a) return '';
    var kidsMode = kidsNow();
    if (a.type === 'clan') {
      var c = CH().BY_ID[id], w = (D().CLAN_WINDOWS || {})[c && c.clan];
      if (w) return kidsMode ? (w.kidsLabel || w.label) : w.label;
      return '';
    }
    if (kidsMode && a.kidsLabel) return a.kidsLabel;
    return a.label || '';
  }
  function allocFor(ids) {
    var filled = ids.map(function (x) { return !!x; }), cnt = filled.filter(Boolean).length;
    var main = A().state.mainId;
    if (cnt <= 1) return ids.map(function (x) { return x ? 100 : 0; });
    if (cnt === 2) return ids.map(function (x) { return x ? 50 : 0; });
    return ids.map(function (x) { return x === main ? 34 : 33; });
  }
  function trySlots(ids, alloc) {
    var r = U().apply('setSlots', ids, alloc);
    if (!r) return false;
    if (r.error) { U().toast(slotErr(r.error), 'ng'); return false; }
    U().setState(r); U().save(); U().render();
    return true;
  }
  function slotErr(e) {
    var m = { mainMissing: '{最初|さいしょ}の{相棒|あいぼう}は{外|はず}せないよ', notVisited: 'まだ{来|き}ていない{相棒|あいぼう}は{入|い}れられないよ', duplicate: '{同|おな}じ{相棒|あいぼう}は1つの{枠|わく}だけ', allocSum: '{合計|ごうけい}を100%にしてね', allocStep: '10%きざみにしてね', nullAlloc: 'からの{枠|わく}は0%だよ' };
    return m[e] || 'うまくいきませんでした';
  }
  function adjust(i, dir) {
    var s = A().state, ids = s.slots.slice(), al = s.alloc.slice();
    if (!ids[i]) return;
    // 10%きざみにそろえる（あまりは主相棒へ）
    var mainI = ids.indexOf(s.mainId);
    if (al.some(function (a) { return a % 10; })) {
      al = al.map(function (a) { return Math.floor(a / 10) * 10; });
      al[mainI] += 100 - al.reduce(function (a, b) { return a + b; }, 0);
    }
    var others = [0, 1, 2].filter(function (j) { return j !== i && ids[j]; });
    if (!others.length) return;
    if (dir > 0) {
      if (al[i] >= 100) return;
      others.sort(function (a, b) { return al[b] - al[a]; });
      if (al[others[0]] < 10) return;
      al[others[0]] -= 10; al[i] += 10;
    } else {
      if (al[i] < 10) return;
      var to = i === mainI ? others.sort(function (a, b) { return al[a] - al[b]; })[0] : mainI;
      al[i] -= 10; al[to] += 10;
    }
    trySlots(ids, al);
  }
  function chooseFor(i) {
    var h = U().h, s = A().state;
    var ids = s.slots.slice();
    var cand = Object.keys(s.chars).filter(function (id) { return ids.indexOf(id) < 0 && !isShadow(id); });
    var CHARS = CH().CHARS.map(function (c) { return c.id; });
    cand.sort(function (a, b) { return CHARS.indexOf(a) - CHARS.indexOf(b); });
    var m;
    var list = h('div.pick-grid', cand.map(function (id) {
      var c = s.chars[id];
      return h('button.pick', { attrs: { type: 'button', 'data-pick': id }, on: { click: function () {
        m.close(); ids[i] = id; trySlots(ids, allocFor(ids));
      } } }, [fig(id, 'normal', 64), h('span', { text: nameF(id) }), h('small', { text: rankF(c.rank) })]);
    }));
    var kids = [cand.length ? list : h('p', { text: 'まだ{入|い}れられる{相棒|あいぼう}がいないよ。{歩|ある}いていると、{新|あたら}しい{忍|しのび}が{訪|たず}ねてくるよ。' })];
    if (ids[i]) kids.push(U().btn('この{枠|わく}をあける', function () { m.close(); ids[i] = null; trySlots(ids, allocFor(ids)); }, 'ghost', { attrs: { type: 'button', 'data-act': 'empty-slot' } }));
    m = U().modal(kids, { title: '{枠|わく}に{入|い}れる{相棒|あいぼう}' });
  }
  function shugyo() {
    var h = U().h, btn = U().btn, n = U().n;
    var s = A().state;
    if (!s) return screenWrap(null, [notReady('{記録|きろく}')]);
    var sm = U().summary();
    var canB = !!(A().info && A().info.canBuckets);
    var presets = (CFG().ALLOC_PRESETS || []).map(function (p) {
      return btn(p.label, function () {
        var ids = s.slots.slice(), need = p.alloc.filter(function (x) { return x > 0; }).length;
        var filled = ids.filter(Boolean).length;
        if (filled < need) { U().toast('{相棒|あいぼう}を' + need + '{人|にん}{枠|わく}に{入|い}れてね'); return; }
        // 主相棒に大きい数、ほかに順に
        var order = [ids.indexOf(s.mainId)].concat([0, 1, 2].filter(function (j) { return j !== ids.indexOf(s.mainId); }).filter(function (j) { return ids[j]; })).concat([0, 1, 2].filter(function (j) { return !ids[j]; }));
        var al = [0, 0, 0];
        order.forEach(function (j, k) { al[j] = p.alloc[k] || 0; });
        // 入っている枠が need より多いと、0% の体が出る（そのままでよい）
        trySlots(ids, al);
      }, 'small', { attrs: { type: 'button', 'data-preset': p.id } });
    });
    var cards = [0, 1, 2].map(function (i) {
      var id = s.slots[i], al = s.alloc[i] || 0;
      if (!id) {
        return h('div.slot.empty', [h('div.slot-n', { html: String(i + 1) }), h('p', { text: 'からの{枠|わく}' }), btn('{相棒|あいぼう}を{入|い}れる', function () { chooseFor(i); }, '', { attrs: { type: 'button', 'data-slot': String(i) } })]);
      }
      var c = s.chars[id] || {}, info = SA.Rules && SA.Rules.rankInfo ? SA.Rules.rankInfo(c.shugyo || 0) : { rank: c.rank || 0, progress: 0, toNext: 0 };
      var ss = sm && sm.slots && sm.slots[i] || {};
      var a = (D().AFFINITY || {})[id] || {};
      var needB = ['clan', 'win', 'cont', 'bits'].indexOf(a.type) >= 0;
      var affNote = needB && !canB ? h('small.ng', { text: (T().special && T().special.noJudge) || 'この{端末|たんまつ}では{判定|はんてい}できません' }) : (ss.affMatched ? h('small.ok', { text: '{今日|きょう}は{相性|あいしょう}が{合|あ}った！' }) : h('small.muted', { text: '{今日|きょう}はまだ{合|あ}っていない' }));
      var nextTxt = info.nextAt ? ((info.nextIsOkugi ? '{奥義|おうぎ}' : '{次|つぎ}の{位|くらい}') + 'まで ' + n(info.toNext) + '{歩|ほ}') : '{免許皆伝|めんきょかいでん}';
      return h('div.slot', { attrs: { 'data-slot-id': id } }, [
        h('div.slot-top', [
          fig(id, 'serious', 76),
          h('div.slot-x', [
            h('b.slot-name', { text: nameF(id) }),
            id === s.mainId ? h('span.tag', { text: '{最初|さいしょ}の{相棒|あいぼう}' }) : null,
            h('div', { text: rankF(c.rank) + (c.okugi ? '・{奥義|おうぎ}' + c.okugi : '') + '　{修行値|しゅぎょうち} ' + n(c.shugyo) }),
            bar(info.progress, nextTxt),
            h('div.aff', [h('span', { text: '{相性|あいしょう}：' + affLabel(id) }), affNote])
          ])
        ]),
        h('div.slot-alloc', [
          btn('−', function () { adjust(i, -1); }, 'small round', { attrs: { type: 'button', 'data-dec': String(i), 'aria-label': '減らす' } }),
          h('b.alloc', { html: al + '%' }),
          btn('+', function () { adjust(i, 1); }, 'small round', { attrs: { type: 'button', 'data-inc': String(i), 'aria-label': '増やす' } }),
          id !== s.mainId ? btn('かえる', function () { chooseFor(i); }, 'small ghost', { attrs: { type: 'button', 'data-slot': String(i) } }) : null
        ])
      ]);
    });
    return screenWrap('{修行枠|しゅぎょうわく}', [
      section(null, [h('p.lead', { text: '{歩|ある}いた{分|ぶん}を、{枠|わく}の{割合|わりあい}で{分|わ}けて{修行|しゅぎょう}するよ。{変|か}えると、まだ{取|と}り{込|こ}んでいない{歩数|ほすう}から{効|き}くよ。' }), h('div.row.presets', presets)]),
      h('div.slots', cards)
    ], 'shugyo');
  }

  /* ================= 3.4 忍術の間 ================= */
  function jutsu() {
    var h = U().h, btn = U().btn;
    var s = A().state;
    if (!s) return screenWrap(null, [notReady('{記録|きろく}')]);
    var left = s.scrolls - s.scrollsOpened;
    var ids = (s.slots || []).filter(Boolean);
    var nextId = ids.length ? ids[s.scrollsOpened % ids.length] : s.mainId;
    return screenWrap('{忍術|にんじゅつ}の{間|ま}', [
      section(null, [
        h('div.center', [fig(nextId, 'serious', 140)]),
        h('p.center', { html: U().furi('{巻物|まきもの}が ') + '<b data-scrolls="' + left + '">' + left + '</b>' + U().furi(' {本|ほん}あるよ。' + (left ? '{次|つぎ}は' + nameF(nextId) + 'の{番|ばん}。' : '')) }),
        h('p.muted.center', { text: (U().n(CFG().SCROLL_STEPS || 1000)) + '{歩|ほ}{修行|しゅぎょう}するごとに1{本|ぽん}ふえるよ。{枠|わく}の{相棒|あいぼう}が{順番|じゅんばん}に{術|じゅつ}を{見|み}せてくれる。' }),
        h('div.center', [btn('{巻物|まきもの}を{開|ひら}く', function () { openScroll(); }, 'primary big', { attrs: { type: 'button', 'data-act': 'open-scroll' }, disabled: left <= 0 })]),
        U().has('FX', 'play') ? null : U().soon('{演出|えんしゅつ}')
      ])
    ], 'jutsu-s');
  }
  function openScroll() {
    var s = A().state;
    var ids = (s.slots || []).filter(Boolean);
    var id = ids.length ? ids[s.scrollsOpened % ids.length] : s.mainId;
    var r = U().apply('openScroll', id);
    if (!r) { U().toast('{巻物|まきもの}がないよ'); return; }
    U().setState(r.state); U().save();
    playJutsu(r.jutsu, function () { U().render(); });
  }
  function playJutsu(j, done) {
    var h = U().h, box = doc.getElementById('jutsu');
    if (!box) { done(); return; }
    box.innerHTML = '';
    var cv = h('canvas#jutsu-cv', { attrs: { 'aria-label': '忍術の演出' } });
    var cap = h('div.jutsu-cap', { attrs: { 'aria-live': 'polite' } });
    var skipB = U().btn('とばす', function () { if (ctrl && ctrl.skip) ctrl.skip(); else finish(); }, 'jutsu-skip', { attrs: { type: 'button', 'data-act': 'skip' } });
    box.appendChild(cv); box.appendChild(cap); box.appendChild(skipB);
    box.hidden = false;
    var ctrl = null, ended = false;
    var title = nameF(j.charId) + 'の{忍術|にんじゅつ}「' + jutsuF(j.charId) + '」';
    function finish() {
      if (ended) return; ended = true;
      skipB.remove();
      cap.innerHTML = U().furi(title + '！');
      var s = A().state, left = s.scrolls - s.scrollsOpened;
      var row = h('div.jutsu-after', [
        left > 0 ? U().btn('もう1{本|ぽん}{開|ひら}く（のこり' + left + '）', function () { box.hidden = true; box.innerHTML = ''; openScroll(); }, 'primary', { attrs: { type: 'button', 'data-act': 'again' } }) : null,
        U().btn('もどる', function () { box.hidden = true; box.innerHTML = ''; done(); }, '', { attrs: { type: 'button', 'data-act': 'jutsu-back' } })
      ]);
      box.appendChild(row);
      U().chime();
    }
    cap.innerHTML = U().furi(title);
    if (U().has('FX', 'play')) {
      try {
        ctrl = SA.FX.play(cv, { charId: j.charId, fx: j.fx, rank: j.rank, okugi: j.okugi, secret: !!j.secret, kidsMode: U().kids(), weapon: weaponShown(j.charId, j.rank), dye: (A().state.chars[j.charId] || {}).dye, onDone: function () { finish(); } });
      } catch (e) { console.warn('FX', e); setTimeout(finish, 300); }
    } else {
      box.appendChild(h('div.jutsu-soon', [U().soon('{演出|えんしゅつ}')]));
      setTimeout(finish, 600);
    }
  }

  /* ================= 3.5 出来事のカード ================= */
  function mergeEvents(list) {
    var out = [], sc = 0, aff = [];
    list.forEach(function (e) {
      if (!e) return;
      if (e.type === 'scroll') { sc += e.n || 1; return; }
      if (e.type === 'affinity') { if (aff.indexOf(e.id) < 0) aff.push(e.id); return; }
      if (e.type === 'bond' && !e.line) return;
      out.push(e);
    });
    if (aff.length) out.unshift({ type: 'affinity', ids: aff });
    if (sc) out.push({ type: 'scroll', n: sc });
    // 喜ぶ出来事を先に、「今日はここまで」は最後（巻物の直前）。同じ順位の中は起きた順のまま（安定ソート）
    return out.map(function (e, i) { return { e: e, i: i, k: EV_ORDER[e.type] != null ? EV_ORDER[e.type] : 6 }; })
      .sort(function (a, b) { return a.k - b.k || a.i - b.i; }).map(function (x) { return x.e; });
  }
  var EV_ORDER = { affinity: 0, visit: 1, jinShadow: 1, jinReveal: 1, rank: 2, okugi: 2, station: 3, stationEvent: 3, goal: 4, bond: 5, dyeUnlock: 6, hideOpen: 6, rest: 7, week: 7, cap: 8, scroll: 9 };
  function eventTitle(e) {
    switch (e.type) {
      case 'visit': return nameF(e.id) + 'がやってきた！';
      case 'rank': return nameF(e.id) + 'の{位|くらい}が{上|あ}がった';
      case 'okugi': return nameF(e.id) + 'の{奥義|おうぎ}';
      case 'station': return '{宿場|しゅくば}「' + stationF(e.idx) + '」に{着|つ}いた';
      case 'stationEvent': return '{吉原|よしわら}で{待|ま}っていたのは……';
      case 'jinShadow': return 'なぞの{影|かげ}';
      case 'jinReveal': return 'なぞの{影|かげ}が{名乗|なの}った';
      case 'goal': return '{目標|もくひょう}に{届|とど}いた！';
      case 'cap': return '{今日|きょう}はここまで';
      case 'rest': return '{修行|しゅぎょう}お{休|やす}み';
      case 'dyeUnlock': return '{新|あたら}しい{染|そ}め{色|いろ}';
      case 'hideOpen': return 'かくれる{探|さが}しが{始|はじ}まった';
      case 'scroll': return '{巻物|まきもの}がふえた（' + e.n + '{本|ほん}）';
      case 'affinity': return '{相性|あいしょう}が{合|あ}った';
      case 'bond': return nameF(e.id) + 'との{絆|きずな}';
      case 'week': return '{先週|せんしゅう}のふりかえり';
      default: return e.type;
    }
  }
  function eventCard(e, next) {
    var h = U().h, btn = U().btn, TX = T(), sp = TX.special || {}, s = A().state, main = s.mainId;
    var art = null, lines = [], extra = [], cls = 'ev-' + e.type;
    switch (e.type) {
      case 'visit': {
        art = fig(e.id, 'surprised', 150);
        setTimeout(function () { if (art && art.parentNode) { var nf = fig(e.id, 'happy', 150); art.parentNode.replaceChild(nf, art); art = nf; } }, 900);
        lines.push((TX.greet && TX.greet[e.id]) || nameF(e.id) + 'が{里|さと}に{来|き}てくれた！');
        lines.push(e.n + '{回目|かいめ}の{来訪|らいほう}。{図鑑|ずかん}に{加|くわ}わったよ。');
        var free = s.slots.indexOf(null);
        extra.push(btn('{図鑑|ずかん}を{見|み}る', function () { zukanDetail(e.id); }, 'small', { attrs: { type: 'button', 'data-act': 'ev-zukan' } }));
        extra.push(btn(free >= 0 ? '{修行枠|しゅぎょうわく}に{入|い}れる' : '{修行枠|しゅぎょうわく}を{見|み}る', function () {
          if (free >= 0) { var ids = A().state.slots.slice(); ids[free] = e.id; if (trySlots(ids, allocFor(ids))) U().toast(nameF(e.id) + 'を{修行枠|しゅぎょうわく}に{入|い}れたよ'); }
          else { next(true); U().go('shugyo'); }
        }, 'small primary', { attrs: { type: 'button', 'data-act': 'ev-slot' } }));
        U().chime('big');
        break;
      }
      case 'rank': {
        art = fig(e.id, 'happy', 140);
        if (e.rank >= 5) { cls += ' menkyo'; lines.push(U().fill(sp.menkyo || '{name}が{免許皆伝|めんきょかいでん}になった！', { name: nameF(e.id) })); }
        else lines.push(U().fill(sp.rankUp || '{name}の{位|くらい}が「{rank}」に{上|あ}がった！', { name: nameF(e.id), rank: rankF(e.rank) }));
        lines.push('{新|あたら}しい{位|くらい}：' + rankF(e.rank));
        if (e.rank === (D().WEAPON_FROM_RANK || 3) && weaponShown(e.id, e.rank)) lines.push('{図鑑|ずかん}に{武器|ぶき}が{出|で}るようになったよ。');
        U().chime('big');
        break;
      }
      case 'okugi': art = fig(e.id, 'serious', 140); cls += ' menkyo'; lines.push(U().fill(sp.okugi || '{name}が{奥義|おうぎ}に{目覚|めざ}めた！', { name: nameF(e.id) })); break;
      case 'station': {
        var stn = (D().STATIONS || [])[e.idx] || {}, col = stn.clan ? ((D().CLANS || {})[stn.clan] || {}).color : D().ROAD_COLOR;
        art = fig(main, 'walk', 120, { view: e.round === 2 ? 'walkL' : 'walkR' }); // 帰り道は道の画面の印と同じく左向き
        cls += ' st';
        extra.push(h('div.st-name', { style: { '--c': col || '#777' }, text: stationF(e.idx) }));
        if (e.round === 2) lines.push((sp.round2 && e.idx === 49) ? sp.round2 : '{帰|かえ}り{道|みち}の{宿場|しゅくば}に{着|つ}いたよ。');
        else lines.push((TX.stations && TX.stations[e.idx] && TX.stations[e.idx].tale) || '');
        if (stn.goal && e.round === 1) lines.push('{忍|しの}びの{道|みち}のゴールに{着|つ}いた！ ここからは{帰|かえ}り{道|みち}。');
        var di = -1;
        (s.diary || []).forEach(function (d, i) { if (d.idx === e.idx && (d.round || 1) === (e.round || 1)) di = i; });
        if (di >= 0) extra.push(stampPicker(di));
        break;
      }
      case 'stationEvent': art = fig('atoza', 'normal', 140, { real: true, dye: 'none', weapon: false }); (TX.atoza || []).forEach(function (l) { lines.push(l); }); break;
      case 'jinShadow': art = fig('jin', 'normal', 140, { silhouette: true }); lines.push((TX.jin && TX.jin.shadow) || 'なぞの{影|かげ}が{立|た}っている。'); break;
      case 'jinReveal': art = fig('jin', 'normal', 140, { real: true }); lines.push(U().fill(sp.jinReveal || '', { name: nameF(main) })); ((TX.jin && TX.jin.reveal) || []).forEach(function (l) { lines.push('{刃|じん}「' + l + '」'); }); U().chime('big'); break;
      case 'goal': art = fig(main, 'happy', 140); lines.push(U().fill(sp.goal || '{目標|もくひょう}に{届|とど}いた！', { name: nameF(main) })); U().chime(); break;
      case 'cap': art = fig(main, 'normal', 140); lines.push(U().fill(sp.cap || '{今日|きょう}はここまで。あとは{休|やす}むのも{修行|しゅぎょう}。', { name: nameF(main) })); break;
      case 'rest': {
        art = fig(main, 'hide', 140);
        lines.push(U().fill(sp.restDays || '{days}{日|にち}のあいだ、{修行|しゅぎょう}お{休|やす}みだったよ。', { days: e.days }));
        if (sp.rest) lines.push(U().fill(sp.rest, { name: nameF(main) }));
        if (A().info && A().info.route === 'androidC') lines.push(sp.restC || '{開|ひら}かなかった{日|ひ}の{分|ぶん}は、{開|ひら}いた{日|ひ}の{修行|しゅぎょう}に{入|はい}る');
        break;
      }
      case 'dyeUnlock': {
        var dy = dyeOf(e.dyeId) || {};
        art = h('div.dye-big', { style: { background: dy.color || 'var(--paper)' } });
        lines.push(U().fill(sp.dyeUnlock || '{新|あたら}しい{染|そ}め{色|いろ}「{dye}」が{使|つか}えるようになった！', { dye: dyeF(e.dyeId) }));
        break;
      }
      case 'hideOpen': art = fig(main, 'hide', 140); lines.push(sp.hideOpen || '{隠|かく}れ{里|ざと}で、かくれる{探|さが}しができるようになったよ。'); extra.push(btn('{里|さと}を{見|み}る', function () { next(true); U().go('sato'); }, 'small', { attrs: { type: 'button', 'data-act': 'ev-sato' } })); break;
      case 'scroll': art = fig(main, 'surprised', 120); lines.push(sp.scroll || '{巻物|まきもの}がふえた！'); extra.push(btn('{忍術|にんじゅつ}の{間|ま}へ', function () { next(true); U().go('jutsu'); }, 'small primary', { attrs: { type: 'button', 'data-act': 'ev-jutsu' } })); break;
      case 'affinity': art = h('div.ev-figs', e.ids.slice(0, 3).map(function (id) { return fig(id, 'happy', 80); })); e.ids.forEach(function (id) { lines.push(U().fill(sp.affinity || '{name}の{相性|あいしょう}が{合|あ}った！', { name: nameF(id) })); }); break;
      case 'bond': {
        art = fig(e.id, 'happy', 120);
        var at = D().BOND_LINES_AT || [], k = at.indexOf(e.bond), bl = TX.bond && TX.bond[e.id];
        lines.push(nameF(e.id) + 'との{絆|きずな}が{深|ふか}まった（' + e.bond + '）。');
        if (bl && k >= 0 && bl[k]) lines.push(nameF(e.id) + '「' + bl[k] + '」');
        break;
      }
      case 'week': art = fig(main, 'happy', 110); lines.push('{先週|せんしゅう}の{修行|しゅぎょう}をふりかえってみよう。'); extra.push(btn('ふりかえりを{見|み}る', function () { next(true); U().go('review', { tab: 'week', monday: e.monday }); }, 'small primary', { attrs: { type: 'button', 'data-act': 'ev-week' } })); break;
      default: lines.push(eventTitle(e));
    }
    return h('div.ev', { cls: cls, attrs: { 'data-ev': e.type } }, [
      h('h2.ev-t', { text: eventTitle(e) }),
      art ? h('div.ev-art', [art]) : null,
      h('div.ev-lines', lines.filter(Boolean).map(function (l) { return h('p', { text: l }); })),
      extra.length ? h('div.ev-extra', extra) : null
    ]);
  }
  function stampPicker(di) {
    var h = U().h;
    var stamps = T().stamps || [];
    var cur = (A().state.diary[di] || {}).stamp;
    var box = h('div.stamps', [h('div.muted', { text: '{旅|たび}の{日記|にっき}のスタンプ' })]);
    var grid = h('div.stamp-grid');
    stamps.forEach(function (st, i) {
      grid.appendChild(U().btn(st, function () {
        var r = U().apply('setStamp', di, i);
        if (r && !r.error) { U().setState(r); U().save(); }
        Array.prototype.forEach.call(grid.children, function (b, j) { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      }, 'stamp' + (cur === i ? ' on' : ''), { attrs: { type: 'button', 'data-stamp': String(i), 'aria-pressed': cur === i ? 'true' : 'false' } }));
    });
    box.appendChild(grid);
    return box;
  }
  /** 出来事を順に見せる（タップで次へ、「まとめて見る」で一覧） */
  function showEvents(raw) {
    var list = mergeEvents(raw || []);
    if (!list.length) return;
    var h = U().h, i = 0, m = null;
    function show() {
      if (m) m.close();
      if (i >= list.length) { U().render(); return; }
      var e = list[i];
      var card = eventCard(e, function (stop) { if (stop) { i = list.length; if (m) m.close(); } });
      var nav = h('div.ev-nav', [
        h('span.muted.ev-count', { html: (i + 1) + ' / ' + list.length }),
        list.length - i > 2 ? U().btn('まとめて{見|み}る', function () { all(); }, 'ghost small', { attrs: { type: 'button', 'data-act': 'ev-all' } }) : null,
        U().btn(i < list.length - 1 ? 'つぎへ' : 'とじる', function () { i++; show(); }, 'primary', { attrs: { type: 'button', 'data-act': 'ev-next' } })
      ]);
      // 「つぎへ」はスクロールの外（下に固定）。カードが長くても見える
      m = U().modal([card], { cls: 'ev-modal', noClose: true, foot: [nav] });
      card.addEventListener('click', function (ev) { if (ev.target.closest('button,input,label,a')) return; i++; show(); });
    }
    function all() {
      if (m) m.close();
      var rest = list.slice(i);
      i = list.length;
      U().modal([h('ul.ev-list', rest.map(function (e) {
        var li = h('li', [h('b', { text: eventTitle(e) })]);
        if (e.type === 'station') { var di = -1; (A().state.diary || []).forEach(function (d, k) { if (d.idx === e.idx) di = k; }); if (di >= 0) li.appendChild(stampPicker(di)); }
        if (e.type === 'visit') li.appendChild(h('span.muted', { text: '　{図鑑|ずかん}で{会|あ}えるよ' }));
        return li;
      }))], { title: 'きょうの{出来事|できごと}', onClose: function () { U().render(); } });
    }
    show();
  }

  /* ================= 3.6 忍びの道 ================= */
  // 1行7つ・間を広めに（360幅でも、となりの点との間が 44px 以上になり、押し分けやすい）
  var ROW = 7, GAPX = 50, GAPY = 64, X0 = 22, Y0 = 34;
  function stXY(i) { var r = Math.floor(i / ROW), c = i % ROW; return { x: X0 + (r % 2 ? (ROW - 1 - c) : c) * GAPX, y: Y0 + r * GAPY }; }
  function reachedSet(s) {
    var set = {}, n = s ? s.stationsReached : 0, last = (D().STATIONS || []).length - 1;
    set[0] = 1;
    for (var k = 1; k <= Math.min(n, last); k++) set[k] = 1;
    var back = {};
    for (var k2 = last + 1; k2 <= n; k2++) back[Math.max(0, 2 * last - k2)] = 1;
    return { go: set, back: back };
  }
  function road() {
    var h = U().h, n = U().n;
    var s = S();
    var ST = D().STATIONS || [];
    if (!ST.length) return screenWrap('{忍|しの}びの{道|みち}', [notReady('データ')]);
    var sm = A().state ? U().summary() : null;
    var cur = sm ? sm.station : (s && SA.Rules && SA.Rules.stationOf ? Object.assign({ reached: s.stationsReached }, SA.Rules.stationOf(s.stationsReached)) : { idx: 0, round: 1, reached: 0 });
    var rs = reachedSet(s);
    var W = X0 * 2 + (ROW - 1) * GAPX, H = Y0 + Math.ceil(ST.length / ROW - 1) * GAPY + 46;
    var on = U().App.state ? U().App.state.furigana !== false : U().App.furiPref !== false;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="road-svg" role="img" aria-label="忍びの道の地図">';
    // 飾り（様式化した山と海）
    svg += '<g class="deco" opacity=".5"><path d="' + mtn(stXY(19).x + 6, stXY(19).y - 6, 30) + '" fill="#c9d4c0"/><path d="' + mtn(stXY(17).x - 8, stXY(17).y - 8, 26) + '" fill="#dde4ea"/>' +
      '<path d="M' + (stXY(38).x - 30) + ' ' + (stXY(38).y + 20) + ' q10 -6 20 0 t20 0 t20 0" stroke="#9cc0d8" fill="none" stroke-width="2"/>' +
      '<path d="M' + (stXY(50).x - 30) + ' ' + (stXY(50).y + 22) + ' q10 -6 20 0 t20 0 t20 0" stroke="#9cc0d8" fill="none" stroke-width="2"/></g>';
    for (var i = 0; i < ST.length - 1; i++) {
      var a = stXY(i), b = stXY(i + 1), dest = ST[i + 1], src = ST[i];
      var clan = dest.clan || (i === 0 ? src.clan : null);
      var col = clan ? ((D().CLANS || {})[clan] || {}).color : D().ROAD_COLOR;
      var done = rs.go[i + 1] && rs.go[i];
      svg += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + (col || '#7a7a80') + '" stroke-width="' + (done ? 6 : 4) + '" stroke-linecap="round"' + (done ? '' : ' stroke-dasharray="2 7" opacity=".55"') + '/>';
    }
    ST.forEach(function (st, i2) {
      var p = stXY(i2), got = rs.go[i2], back = rs.back[i2];
      var col = st.clan ? ((D().CLANS || {})[st.clan] || {}).color : '#7a7a80';
      svg += '<g class="st-pt' + (got ? ' got' : '') + '" data-st="' + i2 + '" tabindex="0" role="button" aria-label="' + U().esc(st.name) + '">' +
        '<circle cx="' + p.x + '" cy="' + p.y + '" r="26" fill="transparent"/>' +   // 見えない当たり判定（360幅でも 44px 以上）
        '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (st.clan || st.start || st.goal ? 8 : 6) + '" fill="' + (got ? col : '#fffaf0') + '" stroke="' + col + '" stroke-width="2.5"/>' +
        (back ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="11.5" fill="none" stroke="#d8a63a" stroke-width="2"/>' : '') + '</g>';
      // 名前は「いま」「次」「はじめ」「おわり」だけ（となり合うときは、はじめ・おわりを出さない。次は点の上に出す）
      var nx = sm && sm.nextStation ? sm.nextStation.idx : -9;
      var isEnd = i2 === 0 || i2 === ST.length - 1;
      var showL = i2 === cur.idx || i2 === nx || (isEnd && Math.abs(i2 - cur.idx) > 1 && Math.abs(i2 - nx) > 1);
      var above = i2 === nx && i2 !== cur.idx;
      if (showL) svg += '<text x="' + Math.min(W - 20, Math.max(20, p.x)) + '" y="' + (above ? p.y - 16 : p.y + 25) + '" text-anchor="middle" class="st-l' + (i2 === cur.idx ? ' cur' : '') + '">' + U().esc(on ? st.kana : st.name) + '</text>';
    });
    svg += '</svg>';
    var mapBox = h('div.road-map', { html: svg });
    var mp = stXY(cur.idx);
    if (s) {
      var mk = fig(s.mainId, 'walk', 34, { view: cur.round === 2 ? 'walkL' : 'walkR' });
      mk.classList.add('road-me');
      mk.style.left = (mp.x / W * 100) + '%';
      mk.style.top = (mp.y / H * 100) + '%';
      mapBox.appendChild(mk);
    }
    Array.prototype.forEach.call(mapBox.querySelectorAll('[data-st]'), function (g) {
      var idx = +g.getAttribute('data-st');
      var openIt = function () { stationInfo(idx, !!rs.go[idx]); };
      g.addEventListener('click', openIt);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } });
    });
    var head = [];
    if (s) {
      head.push(h('p', { text: 'いまは「' + stationF(cur.idx) + '」' + (cur.round === 2 ? '（{帰|かえ}り{道|みち}）' : '') + '。{着|つ}いた{宿場|しゅくば} ' + (s.stationsReached || 0) + '{か所|かしょ}。' }));
      if (sm && sm.nextStation) head.push(bar(1 - sm.nextStation.remain / (CFG().ROAD_STEP || 20000), '{次|つぎ}の「' + stationF(sm.nextStation.idx) + '」まで あと ' + n(sm.nextStation.remain) + '{歩|ほ}', 'road'));
      if (cur.round === 2) head.push(h('p.muted', { text: (T().special && T().special.round2) || 'ここからは{帰|かえ}り{道|みち}。' }));
    } else head.push(h('p', { text: '{伊賀上野|いがうえの}から{東海道|とうかいどう}を{通|とお}って{雑賀崎|さいかざき}まで、{五十一|ごじゅういち}の{宿場|しゅくば}をめぐる{道|みち}だよ。' }));
    var legend = h('div.legend', Object.keys(D().CLANS || {}).filter(function (k) { return ['伊賀', '甲賀', '風魔', '雑賀'].indexOf(k) >= 0; }).map(function (k) {
      return h('span.lg', { style: { '--c': D().CLANS[k].color }, text: clanF(k) });
    }).concat([h('span.lg', { style: { '--c': D().ROAD_COLOR || '#7a7a80' }, text: '{街道|かいどう}' })]));
    var diary = s && s.diary && s.diary.length ? section('{旅|たび}の{日記|にっき}', [h('ul.diary', s.diary.slice().reverse().slice(0, 60).map(function (d) {
      var di = s.diary.indexOf(d);
      var stamp = d.stamp != null && T().stamps ? T().stamps[d.stamp] : null;
      var li = h('li', [h('span.d-date', { html: mdF(d.date) }), h('b', { text: stationF(d.idx) + ((d.round || 1) === 2 ? '（{帰|かえ}り）' : '') }),
        stamp ? h('span.d-stamp', { text: stamp }) : (A().state ? U().btn('スタンプ', function () { var m = U().modal([stampPicker(di)], { title: stationF(d.idx), onClose: function () { U().render(); } }); }, 'small ghost', { attrs: { type: 'button', 'data-act': 'diary-stamp' } }) : null)]);
      return li;
    }))]) : null;
    return screenWrap('{忍|しの}びの{道|みち}', [section(null, head), section(null, [mapBox, legend, h('p.note', { text: '{距離|きょり}は{直線|ちょくせん}の{目安|めやす}です' })]), diary], 'road');
  }
  function mtn(x, y, w) { return 'M' + (x - w) + ' ' + y + ' L' + x + ' ' + (y - w * 0.8) + ' L' + (x + w) + ' ' + y + ' Z'; }
  function stationInfo(idx, got) {
    var h = U().h;
    var st = (D().STATIONS || [])[idx] || {};
    if (!got) { U().toast('「' + stationF(idx) + '」にはまだ{着|つ}いていないよ'); return; }
    var col = st.clan ? ((D().CLANS || {})[st.clan] || {}).color : D().ROAD_COLOR;
    var s = S(), stamps = [];
    if (s && s.diary) s.diary.forEach(function (d) { if (d.idx === idx) stamps.push(d); });
    U().modal([
      h('div.st-name', { style: { '--c': col || '#777' }, text: stationF(idx) }),
      st.clan ? h('p.muted', { text: clanF(st.clan) + 'の{土地|とち}' }) : null,
      h('p', { text: (T().stations && T().stations[idx] && T().stations[idx].tale) || '' }),
      stamps.length ? h('ul.diary', stamps.map(function (d) { return h('li', [h('span.d-date', { html: U().furi('{着|つ}いた{日|ひ} ') + mdF(d.date) }), d.stamp != null && T().stamps ? h('span.d-stamp', { text: T().stamps[d.stamp] }) : null]); })) : null
    ], { title: '{宿場|しゅくば}の{小話|こばなし}' });
  }

  /* ================= 3.7 図鑑 ================= */
  function zukan() {
    var h = U().h;
    var s = S();
    var list = CH().CHARS || [];
    var met = list.filter(function (c) { return s && s.chars && s.chars[c.id]; }).length;
    var grid = h('div.zk-grid', list.map(function (c) {
      var v = !!(s && s.chars && s.chars[c.id]);
      var shadow = c.id === 'jin' && v && isShadow('jin');
      return h('button', { cls: 'zk' + (v ? ' met' : ''), attrs: { type: 'button', 'data-zk': c.id, 'aria-label': v && !shadow ? c.name : '番号' + c.num }, on: { click: function () { if (v) zukanDetail(c.id); else U().toast('No.' + c.num + '　まだ{会|あ}っていないよ'); } } }, [
        v && !shadow ? fig(c.id, 'normal', 66) : fig(c.id, 'normal', 66, { silhouette: true }),
        h('span.zk-num', { html: 'No.' + c.num }),
        v ? h('span.zk-name', { text: nameF(c.id) }) : null
      ]);
    }));
    var P = T().parent || {};
    return screenWrap('{図鑑|ずかん}', [
      section(null, [h('p', { html: U().furi('{会|あ}えた{忍|しのび} ') + '<b data-met="' + met + '">' + met + '</b> / ' + list.length }), A().view && !s ? h('p.muted', { text: '{書|か}き{出|だ}しファイルを{開|ひら}くと、その{記録|きろく}の{図鑑|ずかん}を{見|み}られるよ。' }) : null]),
      grid,
      h('p.unofficial', { text: P.unofficial || 'CryptoNinja（CC0・Ninja DAO）のキャラクターを{使|つか}った{個人|こじん}{制作|せいさく}の{非公式|ひこうしき}ファンゲームです。' })
    ], 'zukan');
  }
  function zukanDetail(id) {
    var h = U().h, n = U().n;
    var c = CH().BY_ID[id], rec = charRec(id) || { rank: 0, shugyo: 0, bond: 0, dye: 'none' };
    if (!c) return;
    var shadow = isShadow(id);
    var clan = (D().CLANS || {})[c.clan] || {};
    var tabBox = h('div.zk-tab');
    var tab = 'sheet';
    function drawTab() {
      tabBox.innerHTML = '';
      Array.prototype.forEach.call(tabs.children, function (b) { var on = b.getAttribute('data-tab') === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      if (shadow) { tabBox.appendChild(h('div.center', [fig(id, 'normal', 160, { silhouette: true })])); return; }
      if (tab === 'sheet') {
        if (SA.Fig && SA.Fig.sheet6) { try { tabBox.appendChild(SA.Fig.sheet6(id, { dye: rec.dye, weapon: weaponShown(id, rec.rank) })); } catch (e) { tabBox.appendChild(U().soon('{絵|え}')); } }
        else tabBox.appendChild(U().soon('{絵|え}'));
      } else if (tab === 'views') {
        var vs = [['front', 'まえ'], ['quarter', 'ななめ'], ['side', 'よこ'], ['back', 'うしろ']];
        tabBox.appendChild(h('div.views4', vs.map(function (v) { return h('figure', [fig(id, 'normal', 90, { view: v[0] }), h('figcaption', { text: v[1] })]); })));
        if (!weaponShown(id, rec.rank)) tabBox.appendChild(h('p.muted', { text: '{武器|ぶき}は{中忍|ちゅうにん}になると{見|み}られるよ。' }));
      } else if (id === 'magoichi' && !CFG().SHOW_GUN) {
        // 公式イラストは銃を持った姿なので、SHOW_GUN が false のあいだは出さない（武器欄の「ひみつ」と同じ。ながめるモードも同じ）
        tabBox.appendChild(h('p.muted.center', { attrs: { 'data-art': 'hidden' }, text: 'この{公式|こうしき}イラストは、いまは{見|み}せていません。' }));
      } else {
        tabBox.appendChild(h('figure.official', [h('img', { attrs: { src: 'img/art/' + id + '.jpg', alt: c.name + ' 公式イラスト', loading: 'lazy', decoding: 'async' } }), h('figcaption', { text: '{公式|こうしき}イラスト（CryptoNinja・CC0）' })]));
      }
    }
    var tabs = h('div.tabs', { attrs: { role: 'tablist' } }, [['sheet', '6つの{顔|かお}'], ['views', '4つの{向|む}き'], ['art', '{公式|こうしき}イラスト']].map(function (x) {
      return U().btn(x[1], function () { tab = x[0]; drawTab(); }, 'tab-b', { attrs: { type: 'button', role: 'tab', 'data-tab': x[0] } });
    }));
    var lines = [];
    var TX = T(), at = D().BOND_LINES_AT || [];
    if (TX.bond && TX.bond[id]) { var open = at.filter(function (x) { return (rec.bond || 0) >= x; }).length; lines = TX.bond[id].slice(0, open); }
    var info = SA.Rules && SA.Rules.rankInfo ? SA.Rules.rankInfo(rec.shugyo || 0) : null;
    var dl = h('dl.zk-dl', [
      h('dt', { text: 'クラン' }), h('dd', { text: shadow ? '？？？' : clanF(c.clan) }),
      h('dt', { text: '{忍術|にんじゅつ}' }), h('dd', { text: shadow ? '？？？' : jutsuF(id) }),
      h('dt', { text: '{武器|ぶき}' }), h('dd', { text: shadow ? '？？？' : weaponF(id, rec.rank) }),
      h('dt', { text: '{誕生日|たんじょうび}' }), h('dd', { text: shadow ? '？？？' : birthdayF(c.birthday) }),
      h('dt', { text: '{位|くらい}' }), h('dd', { text: rankF(rec.rank) + (rec.okugi ? '・{奥義|おうぎ}' + rec.okugi : '') }),
      h('dt', { text: '{修行値|しゅぎょうち}' }), h('dd', { html: n(rec.shugyo) }),
      h('dt', { text: '{絆|きずな}' }), h('dd', { html: String(rec.bond || 0) }),
      h('dt', { text: '{相性|あいしょう}' }), h('dd', { text: shadow ? '？？？' : affLabel(id) })
    ]);
    var bio = shadow ? '' : bioF(id);
    var kids = [
      h('div.zk-head', { style: { '--c': clan.color || '#666' } }, [h('span.zk-num', { html: 'No.' + c.num }), h('b.zk-title', { text: nameF(id) })]),
      tabs, tabBox,
      info && info.nextAt ? bar(info.progress, ((info.nextIsOkugi ? '{奥義|おうぎ}' : '{次|つぎ}の{位|くらい}') + 'まで ' + n(info.toNext) + '{歩|ほ}')) : null,
      dl,
      // やわらげた文は公式の文そのものではないので、見出しで分ける（おとなモード・関門を通したながめるモードは公式の文と見出し）
      bio ? h('div.bio', { attrs: { 'data-bio': kidsBio(id) ? 'kids' : 'official' } }, [h('h3', { text: kidsBio(id) ? 'しょうかい（やさしいことばで）' : '{公式|こうしき}の{紹介文|しょうかいぶん}' }), h('p', { text: bio }), kidsBio(id) ? h('p.muted', { text: '{公式|こうしき}の{紹介文|しょうかいぶん}ではありません。それをもとに、やさしく{書|か}き{直|なお}した{文|ぶん}です。' }) : null]) : null,
      !shadow && TX.zukan && TX.zukan[id] ? h('div.bio', [h('h3', { text: 'ゲームでの{様子|ようす}' }), h('p', { text: TX.zukan[id] })]) : null,
      lines.length ? h('div.bio', [h('h3', { text: '{聞|き}いた{一言|ひとこと}' }), h('ul.lines', lines.map(function (l) { return h('li', { text: l }); }))]) : null,
      h('p.unofficial', { text: (TX.parent && TX.parent.unofficial) || 'CryptoNinja（CC0・Ninja DAO）のキャラクターを{使|つか}った{個人|こじん}{制作|せいさく}の{非公式|ひこうしき}ファンゲームです。' })
    ];
    U().modal(kids, { cls: 'zk-modal long' });
    drawTab();
  }

  /* ================= 3.8 里 ================= */
  function sato() {
    var h = U().h, btn = U().btn, n = U().n;
    var s = A().state;
    if (!s) return screenWrap(null, [notReady('{記録|きろく}')]);
    var sm = U().summary() || {};
    var hide = sm.hide || { open: false, toOpen: 0, candidates: [], searchesLeft: 0, toNextSearch: 0 };
    var hideSec;
    var noCand = hide.open && !(hide.candidates || []).length;
    if (noCand) {
      // 候補がいない（38体が来た／刃だけが残る／見つけた体が来るのを待っている）。探す・絵の帯・「あと〇歩」は出さない
      hideSec = section('{隠|かく}れ{里|ざと}', [h('div.center', [fig(s.mainId, 'normal', 100)]), h('p', { attrs: { 'data-hide': 'none' }, text: hideQuietText() })]);
    } else if (!hide.open) {
      hideSec = section('{隠|かく}れ{里|ざと}', [h('div.center', [fig(s.mainId, 'normal', 100)]), h('p', { text: 'まだ{静|しず}か。{最初|さいしょ}の8{人|にん}がそろうと、だれかがかくれにくるよ。' }), h('p.muted', { text: 'あと ' + n(hide.toOpen) + '{歩|ほ}' })]);
    } else {
      hideSec = section('{隠|かく}れ{里|ざと}', [
        h('div.hide-row', (hide.candidates || []).map(function (id) { return h('div.hide-c', [fig(id, 'hide', 86, { real: true, dye: 'none', weapon: false })]); })),
        h('p', { text: '{竹|たけ}の{幕|まく}のうしろに、だれかがかくれている……。「{里|さと}に{納|おさ}める」{日|ひ}の{歩数|ほすう}' + n(CFG().HIDE_SEARCH_STEPS || 5000) + '{歩|ほ}ごとに1{回|かい}{探|さが}せるよ。' }),
        h('div.center', [btn('{探|さが}す（' + hide.searchesLeft + '{回|かい}）', function () { doSearch(); }, 'primary', { attrs: { type: 'button', 'data-act': 'search' }, disabled: hide.searchesLeft <= 0 })]),
        hide.searchesLeft <= 0 ? h('p.muted.center', { text: '{次|つぎ}に{探|さが}せるまで あと ' + n(hide.toNextSearch) + '{歩|ほ}（{里|さと}に{納|おさ}める{日|ひ}の{分|ぶん}）' }) : null
      ]);
    }
    var board = (sm.board || []);
    var boardSec = section('{家族|かぞく}の{掲示板|けいじばん}', [
      h('p.muted', { text: '{目|め}の{前|まえ}の{家族|かぞく}と、QR コードで{相棒|あいぼう}を{見|み}せ{合|あ}いっこ。{文字|もじ}を{送|おく}る{仕組|しく}みはないよ。' }),
      h('div.row', [btn('{見|み}せる', function () { showQR(); }, 'primary', { attrs: { type: 'button', 'data-act': 'qr-show' } }), btn('{読|よ}む', function () { readQR(); }, '', { attrs: { type: 'button', 'data-act': 'qr-read' } })]),
      board.length ? h('div.board', board.map(function (b) {
        var st = b.stale;
        var el = null;
        if (SA.Fig && SA.Fig.el) { try { el = SA.Fig.el(b.id, { state: st ? 'hide' : 'happy', dye: b.dye || 'none', weapon: (b.rank || 0) >= 3 && !(b.id === 'magoichi' && !CFG().SHOW_GUN) }, 70); } catch (e) { el = null; } }
        return h('div.fuda' + (st ? '.stale' : ''), { attrs: { 'data-board': b.id } }, [el || U().soon('{絵|え}'), h('div.fuda-x', [
          h('b', { text: nameF(b.id, true) }),
          // 修行値などの数はならべない（ほかの人と数で比べないように）。位・奥義・宿場だけ
          h('span', { text: rankF(b.rank) + (b.okugi ? '・{奥義|おうぎ}' : '') }),
          h('span.muted', { text: 'いまいる{宿場|しゅくば}：' + stationF(b.station) + (b.round === 2 ? '（{帰|かえ}り{道|みち}）' : '') }),
          st ? h('span.muted', { text: (T().special && T().special.hiddenCard) || 'しばらく{読|よ}んでいない{札|ふだ}は、かくれてしまったよ。' }) : h('span.muted', { text: '{読|よ}んだ{日|ひ} ' + mdF(b.readAt) })
        ])]);
      })) : h('p', { text: 'まだ{札|ふだ}はないよ。' })
    ]);
    var dyeSec = dyeSection(sm);
    return screenWrap('{里|さと}', [hideSec, boardSec, dyeSec], 'sato');
  }
  /** 隠れ里に候補がいないときの一文。まだ来ていない体（刃のほか）が残っていれば「来るのを待とう」 */
  function hideQuietText() {
    var sp = T().special || {}, s = A().state, left = [];
    try { if (s && R() && R().queue) left = R().queue(s).filter(function (id) { return id !== 'jin'; }); } catch (e) { left = []; }
    if (left.length) return sp.allSpotted || 'かくれていた{忍|しのび}は、みんな{見|み}つけたよ。{里|さと}に{来|く}るのを{待|ま}っていよう。';
    return sp.allFound || 'みんな{里|さと}に{来|き}てくれたよ。{隠|かく}れ{里|ざと}はしずかになった。';
  }
  function doSearch() {
    var r = U().apply('search');
    if (!r) return;
    var sp = T().special || {};
    if (!r.found && r.reason === 'noCandidate') {
      U().modal([U().h('p', { text: hideQuietText() })], { title: '{隠|かく}れ{里|ざと}', onClose: function () { U().render(); } });
    } else if (r.found) {
      U().setState(r.state); U().save();
      U().modal([h2fig(r.found), U().h('p', { text: U().fill(sp.found || '{隠|かく}れ{里|ざと}で{name}を{見|み}つけた！', { name: nameF(r.found, true) }) })], { title: '{見|み}つけた！', onClose: function () { U().render(); } });
      U().chime();
    } else {
      U().modal([U().h('p', { text: sp.notFound || '{今日|きょう}は{見|み}つからなかった。' })], { title: '{探|さが}してみた', onClose: function () { U().render(); } });
    }
  }
  function h2fig(id) { return U().h('div.center', [fig(id, 'surprised', 130, { real: true, dye: 'none', weapon: false })]); }
  function showQR() {
    var h = U().h, s = A().state;
    if (!U().has('Share', 'encodeGuest')) { U().modal([U().soon('QR')], { title: '{見|み}せる' }); return; }
    var ids = Object.keys(s.chars).filter(function (id) { return !isShadow(id); });
    var CHARS = CH().CHARS.map(function (c) { return c.id; });
    ids.sort(function (a, b) { return CHARS.indexOf(a) - CHARS.indexOf(b); });
    var view = h('div.qr-view');
    var sel = s.mainId;
    function draw() {
      view.innerHTML = '';
      var text = null;
      try { text = SA.Share.encodeGuest(s, sel, { today: U().today() }); } catch (e) { text = null; }
      if (!text) { view.appendChild(h('p', { text: 'QR を{作|つく}れませんでした。' })); return; }
      var svg = '';
      try { svg = SA.Share.qrSvg(text, 260); } catch (e) { svg = ''; }
      view.appendChild(h('div.qr-box', { html: svg, attrs: { 'data-qr': text } }));
      view.appendChild(h('p.center', { text: nameF(sel) + '（' + rankF(s.chars[sel].rank) + '）' }));
    }
    var pickRow = h('div.qr-pick', ids.map(function (id) {
      return h('button', { cls: 'qp' + (id === sel ? ' on' : ''), attrs: { type: 'button', 'data-qr-pick': id }, on: { click: function (e) {
        sel = id; Array.prototype.forEach.call(pickRow.children, function (b) { b.classList.toggle('on', b.getAttribute('data-qr-pick') === id); }); draw();
      } } }, [fig(id, 'normal', 48)]);
    }));
    U().modal([pickRow, view, h('p.muted', { text: '{家族|かぞく}の{端末|たんまつ}で「{読|よ}む」を{押|お}して、この QR を{読|よ}んでもらってね。QR に{入|はい}るのは{相棒|あいぼう}の{番号|ばんごう}・{位|くらい}・{修行値|しゅぎょうち}・{染|そ}め{色|いろ}・{絆|きずな}・{宿場|しゅくば}だけ。{名前|なまえ}や{歩数|ほすう}は{入|はい}らないよ。' })], { title: '{相棒|あいぼう}を{見|み}せる', cls: 'qr-modal' });
    draw();
    centerOn(pickRow);
  }
  /** 横に並んだ札（.qp）の中で、選ばれている札（.on）を並びのまん中に出す（並びだけを横に動かす。画面は動かさない） */
  function centerOn(row) {
    var on = row && row.querySelector('.qp.on');
    if (!on) return;
    var a = on.getBoundingClientRect(), b = row.getBoundingClientRect();
    row.scrollLeft += (a.left - b.left) - (b.width - a.width) / 2;
  }
  function readQR() {
    var h = U().h;
    if (!U().has('Share', 'decodeGuest')) { U().modal([U().soon('QR')], { title: '{読|よ}む' }); return; }
    var msg = h('p.qr-msg', { attrs: { 'aria-live': 'polite' } });
    var video = h('video.qr-video', { attrs: { playsinline: true, muted: true, hidden: true } });
    var stop = null;
    var m;
    function got(text) {
      var dec = SA.Share.decodeGuest(text);
      if (!dec.ok) { msg.innerHTML = U().furi(SA.Share.message ? SA.Share.message(dec.reason) : '{読|よ}めませんでした'); return; }
      var r = U().apply('readGuest', dec.payload, U().today());
      if (!r || !r.entry) { msg.innerHTML = U().furi('{読|よ}めませんでした'); return; }
      U().setState(r.state); U().save();
      if (stop) try { stop(); } catch (e) { }
      m.close();
      var e2 = r.entry;
      U().modal([h('div.center', [fig(e2.id, 'happy', 120, { real: true, dye: e2.dye, weapon: false })]), h('p', { text: nameF(e2.id, true) + 'の{札|ふだ}を{掲示板|けいじばん}に{貼|は}ったよ。' + (CFG().GUEST_DAYS || 7) + '{日|にち}のあいだ「{里|さと}の{客|きゃく}」としてホームを{歩|ある}くよ。' }), h('p.muted', { text: rankF(e2.rank) + (e2.okugi ? '・{奥義|おうぎ}' : '') })], { title: '{読|よ}めた！', onClose: function () { U().render(); } });
      U().chime();
    }
    var camB = U().btn('カメラで{読|よ}む', function () {
      if (!U().has('Share', 'scanCamera')) { msg.innerHTML = U().furi('{準備中|じゅんびちゅう}'); return; }
      video.hidden = false;
      Promise.resolve(SA.Share.scanCamera(video, {
        onResult: function (text, dec) { if (dec && dec.ok) got(text); else if (dec) msg.innerHTML = U().furi(SA.Share.message(dec.reason)); },
        onError: function (reason) { video.hidden = true; msg.innerHTML = U().furi(SA.Share.message ? SA.Share.message(reason) : 'カメラが{使|つか}えません'); }
      })).then(function (st) { stop = st; });
    }, 'primary', { attrs: { type: 'button', 'data-act': 'qr-camera' } });
    var fileB = fileButton('{画像|がぞう}から{読|よ}む', 'image/*', function (f) {
      msg.innerHTML = U().furi('{読|よ}んでいます…');
      Promise.resolve(SA.Share.scanImageFile ? SA.Share.scanImageFile(f) : null).then(function (text) {
        if (!text) { msg.innerHTML = U().furi((SA.Share.message && SA.Share.message('notFound')) || 'QR が{見|み}つかりませんでした。'); return; }
        got(text);
      });
    }, { id: 'qr-file' });
    m = U().modal([h('div.row', [camB, fileB]), video, msg, h('p.muted', { text: 'カメラの{映像|えいぞう}はこの{端末|たんまつ}の{中|なか}だけで{使|つか}い、どこにも{送|おく}らないよ。' })], { title: '{家族|かぞく}の QR を{読|よ}む', onClose: function () { if (stop) try { stop(); } catch (e) { } } });
  }
  function dyeSection(sm) {
    var h = U().h, s = A().state;
    var sunday = sm.weekday === 0;
    if (!sunday) return section('{市|いち}の{染|そ}め', [h('p', { text: '{日曜日|にちようび}だけ{市|いち}が{開|ひら}くよ。{相棒|あいぼう}の{装束|しょうぞく}の{色|いろ}を{変|か}えられる（{日曜日|にちようび}に1{回|かい}）。' }), dyeChips(s.dyes)]);
    if (!sm.canDye) return section('{市|いち}の{染|そ}め', [h('p', { text: '{今日|きょう}はもう{染|そ}めたよ。また{来週|らいしゅう}の{日曜日|にちようび}に。' }), dyeChips(s.dyes)]);
    var ids = Object.keys(s.chars).filter(function (id) { return !isShadow(id); });
    var selC = s.mainId, selD = (s.chars[selC] || {}).dye || 'none';
    var prev = h('div.center.dye-prev');
    function draw() { prev.innerHTML = ''; var el = null; if (SA.Fig && SA.Fig.el) try { el = SA.Fig.el(selC, { state: 'normal', dye: selD, weapon: weaponShown(selC, s.chars[selC].rank) }, 110); } catch (e) { } if (el) prev.appendChild(el); }
    var cRow = h('div.qr-pick', ids.map(function (id) { return h('button', { cls: 'qp' + (id === selC ? ' on' : ''), attrs: { type: 'button', 'data-dye-char': id }, on: { click: function () { selC = id; Array.prototype.forEach.call(cRow.children, function (b) { b.classList.toggle('on', b.getAttribute('data-dye-char') === id); }); draw(); } } }, [fig(id, 'normal', 44)]); }));
    var dRow = h('div.dye-row', (s.dyes || []).map(function (d) {
      var dy = dyeOf(d) || {};
      return h('button', { cls: 'dye-b' + (d === selD ? ' on' : ''), attrs: { type: 'button', 'data-dye': d }, on: { click: function () { selD = d; Array.prototype.forEach.call(dRow.children, function (b) { b.classList.toggle('on', b.getAttribute('data-dye') === d); }); draw(); } } }, [h('i', { style: { background: dy.color || 'linear-gradient(135deg,#eee,#bbb)' } }), h('span', { text: dy.name || d })]);
    }));
    var doB = U().btn('この{色|いろ}に{染|そ}める', function () {
      var r = U().apply('dye', selC, selD, U().today());
      if (!r) return;
      if (!r.ok) { U().toast(r.reason === 'already' ? '{今日|きょう}はもう{染|そ}めたよ' : '{染|そ}められなかったよ', 'ng'); return; }
      U().setState(r.state); U().save(); U().toast(nameF(selC) + 'を「' + dyeF(selD) + '」に{染|そ}めたよ'); U().chime(); U().render();
    }, 'primary', { attrs: { type: 'button', 'data-act': 'dye' } });
    setTimeout(function () { draw(); centerOn(cRow); }, 0);
    return section('{市|いち}の{染|そ}め（{今日|きょう}は{日曜日|にちようび}）', [cRow, prev, dRow, h('div.center', [doB])]);
  }
  function dyeChips(dyes) {
    var h = U().h;
    // 押せない色見本の一覧（ボタンの形にしない）
    return h('div.dye-list', [h('div.dye-list-t', { text: 'つかえる{色|いろ}' }), h('ul.dye-chips', (dyes || []).map(function (d) { var dy = dyeOf(d) || {}; return h('li.dye-chip', [h('i', { style: { background: dy.color || 'linear-gradient(135deg,#eee,#bbb)' } }), h('span', { text: dy.name || d })]); }))]);
  }

  /* ================= 3.9 ふりかえり ================= */
  function review(p) {
    var h = U().h, n = U().n, Rr = R();
    var s = A().state;
    if (!s || !Rr || !Rr.dayReview) return screenWrap('ふりかえり', [notReady('ルール')]);
    var tab = p.tab || 'day';
    var t = U().today();
    var tabs = h('div.tabs', [['day', '{一日|いちにち}'], ['week', '{週|しゅう}']].map(function (x) {
      return U().btn(x[1], function () { U().go('review', { tab: x[0] }); }, 'tab-b' + (tab === x[0] ? ' on' : ''), { attrs: { type: 'button', 'data-tab': x[0], 'aria-selected': tab === x[0] ? 'true' : 'false' } });
    }));
    var body;
    if (tab === 'day') {
      var date = p.date || t;
      var dr = Rr.dayReview(s, date);
      var nav = dateNav(date, function (d) { U().go('review', { tab: 'day', date: d }); }, 1, s.createdAt, t);
      body = section(null, [nav,
        h('dl.zk-dl', [
          h('dt', { text: '{歩数|ほすう}' }), h('dd', { html: dr.steps == null ? '—' : n(dr.steps) }),
          h('dt', { text: '{修行値|しゅぎょうち}' }), h('dd', { html: n(dr.shugyo) + (dr.capped ? ' ' + U().furi('（{上限|じょうげん}）') : '') }),
          h('dt', { text: '{入|い}れなかった{歩数|ほすう}' }), h('dd', { html: n(dr.rejected) }),
          h('dt', { text: '{目標|もくひょう}' }), h('dd', { text: dr.goalReached ? '{届|とど}いた' : 'まだ' }),
          h('dt', { text: '{相性|あいしょう}' }), h('dd', { text: dr.affinity.length ? dr.affinity.map(function (id) { return nameF(id); }).join('、') : '—' }),
          h('dt', { text: '{巻物|まきもの}' }), h('dd', { html: String(dr.scrollsToday) }),
          h('dt', { text: '{来訪|らいほう}' }), h('dd', { text: dr.visitsToday.length ? dr.visitsToday.map(function (id) { return nameF(id); }).join('、') : '—' }),
          h('dt', { text: '{宿場|しゅくば}' }), h('dd', { text: dr.stationsToday.length ? dr.stationsToday.map(function (i) { return stationF(i); }).join('、') : '—' }),
          h('dt', { text: 'その{日|ひ}' }), h('dd', { text: (dr.home ? '{里|さと}に{納|おさ}めた' : '{道|みち}を{進|すす}めた') + (dr.family ? '・{家族|かぞく}で{歩|ある}いた' : '') })
        ]),
        dr.perChar.length ? h('div', dr.perChar.map(function (x) { return h('div.pc', [h('span', { text: nameF(x.id) }), h('b', { html: n(x.shugyo) })]); })) : null,
        h('p.muted', { text: '{歩数|ほすう}そのものは{直近|ちょっきん}7{日|にち}{分|ぶん}だけ{端末|たんまつ}に{残|のこ}るよ。' })
      ]);
    } else {
      var mon = p.monday || Rr.mondayOf(t);
      var wr = Rr.weekReview(s, mon);
      var max = Math.max(s.goal, 1000, Math.max.apply(null, wr.days.map(function (d) { return d.shugyo; })));
      var WD = ['{日|にち}', '{月|げつ}', '{火|か}', '{水|すい}', '{木|もく}', '{金|きん}', '{土|ど}'];
      var goalPct = (s.goal / max * 100).toFixed(1);
      // 棒の上に目標の線（点線）。数は 16,500 → 1.6万 の形（「k」は使わない）
      var bars = h('div.wk-bars', { style: { '--goal': goalPct + '%' }, attrs: { 'aria-hidden': 'true' } }, wr.days.map(function (d) {
        return h('div.wk-bar', [h('i', { cls: d.goal ? 'goal' : '', style: { height: (d.shugyo / max * 100).toFixed(1) + '%' } })]);
      }));
      var labels = h('div.wk-labels', wr.days.map(function (d) {
        return h('div.wk-col', [h('small.wk-wd', { text: WD[d.weekday] }), h('small.muted', { html: d.shugyo ? (d.shugyo >= 10000 ? (Math.floor(d.shugyo / 1000) / 10).toFixed(1) + U().furi('{万|まん}') : n(d.shugyo)) : '' })]);
      }));
      var chart = h('div.week', [bars, labels, h('p.muted.wk-note', { text: '{金色|きんいろ}の{点線|てんせん}は{目標|もくひょう}（' + n(s.goal) + '{歩|ほ}）' })]);
      var nav2 = dateNav(mon, function (d) { U().go('review', { tab: 'week', monday: d }); }, 7, Rr.mondayOf(s.createdAt), Rr.mondayOf(t));
      body = section(null, [nav2, chart,
        h('p.big-p', { html: U().furi('{目標|もくひょう}に{届|とど}いた{日|ひ}：') + '<b data-goal-days="' + wr.goalDays + '">' + wr.goalDays + '</b>' + U().furi('{日|にち}') }),
        h('p', { text: 'この{週|しゅう}の{修行値|しゅぎょうち}：' + n(wr.total) }),
        wr.perChar.length ? h('div', wr.perChar.slice(0, 5).map(function (x) { return h('div.pc', [h('span', { text: nameF(x.id) }), h('b', { html: n(x.shugyo) })]); })) : null
      ]);
    }
    return screenWrap('ふりかえり', [tabs, body], 'review');
  }
  function dateNav(date, onGo, step, min, max) {
    var h = U().h, Rr = R();
    var prev = Rr.addDays(date, -step), next = Rr.addDays(date, step);
    var p = date.split('-');
    var label = step === 7 ? (+p[1]) + '/' + (+p[2]) + 'からの{週|しゅう}' : (+p[1]) + '{月|がつ}' + (+p[2]) + '{日|にち}';
    return h('div.date-nav', [
      U().btn('◀', function () { onGo(prev); }, 'small round', { attrs: { type: 'button', 'data-act': 'prev', 'aria-label': '前へ' }, disabled: min && prev < min && step === 1 ? true : (step === 7 && min && prev < min) }),
      h('b', { text: label }),
      U().btn('▶', function () { onGo(next); }, 'small round', { attrs: { type: 'button', 'data-act': 'next', 'aria-label': '次へ' }, disabled: next > max })
    ]);
  }

  /* ================= 3.10 メニュー・保護者設定 ================= */
  function menu() {
    var h = U().h, btn = U().btn;
    var s = A().state;
    var furiOn = s ? s.furigana !== false : A().furiPref !== false;
    var soundOn = s ? !(s.settings && s.settings.sound === false) : true;
    var items = [];
    if (s) items.push(btn('ふりかえり', function () { U().go('review'); }, 'menu-b', { attrs: { type: 'button', 'data-menu': 'review' } }));
    items.push(btn('{遊|あそ}び{方|かた}', function () { helpModal(); }, 'menu-b', { attrs: { type: 'button', 'data-menu': 'help' } }));
    items.push(btn('おうちの{方|かた}へ', function () { parentText(); }, 'menu-b', { attrs: { type: 'button', 'data-menu': 'parent' } }));
    if (s) {
      var hold = U().holdButton('{保護者|ほごしゃ}{設定|せってい}（3{秒|びょう}{長押|ながお}し）', function () { U().gate(function (ok) { if (ok) { A().parentOK = true; U().go('parent'); } }); }, 'menu-b');
      hold.setAttribute('data-menu', 'parent-settings');
      items.push(hold);
    }
    var toggles = section(null, [
      toggleRow('ふりがな', furiOn, function (v) {
        if (s) { s.furigana = v; U().save(); } else { A().furiPref = v; if (U().has('Store', 'setPref')) SA.Store.setPref('furigana', v); }
        U().render();
      }, 'furigana'),
      s ? toggleRow('{音|おと}', soundOn, function (v) { s.settings = s.settings || {}; s.settings.sound = v; U().save(); U().render(); }, 'sound') : null
    ]);
    items.push(btn('このアプリについて', function () { aboutModal(); }, 'menu-b', { attrs: { type: 'button', 'data-menu': 'about' } }));
    if (A().view) {
      items.push(btn('{書|か}き{出|だ}しファイルを{開|ひら}く', function () { U().go('viewfile'); }, 'menu-b', { attrs: { type: 'button', 'data-menu': 'viewfile' } }));
      if (A().info && A().info.route !== 'none') items.push(btn('ためし{歩|ある}きで{遊|あそ}ぶ', function () { if (U().has('Store', 'setPref')) SA.Store.setPref('viewMode', false); A().view = false; A().viewState = null; U().startOnboarding(2); }, 'menu-b', { attrs: { type: 'button', 'data-menu': 'play' } }));
    }
    return screenWrap('メニュー', [section(null, items, 'menu-list'), toggles], 'menu');
  }
  function toggleRow(label, on, cb, id) {
    var h = U().h;
    return h('div.toggle-row', [h('span', { text: label }), h('div.seg', [
      U().btn('あり', function () { cb(true); }, 'seg-b' + (on ? ' on' : ''), { attrs: { type: 'button', 'data-toggle': id + ':on', 'aria-pressed': on ? 'true' : 'false' } }),
      U().btn('なし', function () { cb(false); }, 'seg-b' + (!on ? ' on' : ''), { attrs: { type: 'button', 'data-toggle': id + ':off', 'aria-pressed': !on ? 'true' : 'false' } })
    ])]);
  }
  function helpModal() {
    var h = U().h, help = T().help || [];
    U().modal(help.length ? help.map(function (x) { return h('details.qa', [h('summary', { text: x.q }), h('p', { text: x.a })]); }) : [U().soon('{文章|ぶんしょう}')], { title: '{遊|あそ}び{方|かた}', cls: 'long' });
  }
  function aboutModal() {
    var h = U().h, P = T().parent || {};
    U().modal([
      h('p.unofficial', { text: P.unofficial || 'CryptoNinja（CC0・Ninja DAO）のキャラクターを{使|つか}った{個人|こじん}{制作|せいさく}の{非公式|ひこうしき}ファンゲームです。' }),
      P.credit ? h('p', { text: P.credit }) : null,
      h('p', { text: 'キャラクターの{絵|え}と{紹介文|しょうかいぶん}のもとは CryptoNinja（CC0）。{図鑑|ずかん}の「{公式|こうしき}イラスト」は CC0 で{公開|こうかい}されている{絵|え}です。' }),
      // ブラウザ版は QR の2つだけ（P.parts）。アプリ版は P.partsApp（QR のほかの部品。MPL-2.0 の @capgo/capacitor-pedometer は改変なし）。
      // ソースの場所は文字で出すだけ（リンクにしない）
      h('p', { text: (U().isNative() && P.partsApp) || P.parts || '{使|つか}っている{部品|ぶひん}：qrcode-generator（MIT）、jsQR（Apache-2.0）。くわしくは vendor/LICENSES.md。' }),
      U().isNative() ? h('p', { text: P.creditApp || 'iPhone の{歩数|ほすう}を{読|よ}む{部品|ぶひん}：@capgo/capacitor-pedometer（MPL-2.0、{改変|かいへん}なし。ソースコードは https://github.com/Cap-go/capacitor-pedometer ）。' }) : null,
      h('p', { text: '{広告|こうこく}・{課金|かきん}・ランキング・チャットはありません。インターネットには{何|なに}も{送|おく}りません。' }),
      h('p.muted', { html: 'shinobi-ashi v1' })
    ], { title: 'このアプリについて', cls: 'long' });
  }
  function parent() {
    var h = U().h, btn = U().btn, n = U().n;
    var s = A().state;
    if (!s) return screenWrap(null, [notReady('{記録|きろく}')]);
    if (!A().parentOK) { setTimeout(function () { U().go('menu'); }, 0); return screenWrap(null, []); }
    var G = (CFG().GOAL || {})[s.mode] || { min: 3000, max: 12000 }, stp = (CFG().GOAL || {}).step || 500;
    var P = T().parent || {};
    var native = U().isNative();
    var st = s.settings || {};
    function setGoal(v) { var r = U().apply('setGoal', v); if (r && !r.error) { U().setState(r); U().save(); U().render(); } }
    var goalRow = h('div.goal-row', [
      btn('−', function () { if (s.goal - stp >= G.min) setGoal(s.goal - stp); }, 'round', { attrs: { type: 'button', 'data-act': 'goal-dec', 'aria-label': '減らす' }, disabled: s.goal - stp < G.min }),
      h('b.goal-v', { attrs: { 'data-goal': String(s.goal) }, html: n(s.goal) + furiInline('{歩|ほ}') }),
      btn('+', function () { if (s.goal + stp <= G.max) setGoal(s.goal + stp); }, 'round', { attrs: { type: 'button', 'data-act': 'goal-inc', 'aria-label': '増やす' }, disabled: s.goal + stp > G.max })
    ]);
    var modeRow = h('div.seg', [['kodomo', 'こども'], ['otona', 'おとな']].map(function (x) {
      return btn(x[1], function () {
        if (s.mode === x[0]) return;
        var r = U().apply('setMode', x[0]);
        if (!r || r.error) return;
        var def = ((CFG().GOAL || {})[x[0]] || {}).def;
        if (def) { var r2 = SA.Rules.setGoal(r, def); if (r2 && !r2.error) r = r2; }
        U().setState(r); U().save(); U().toast((x[0] === 'kodomo' ? 'こども' : 'おとな') + 'モードにしたよ（{目標|もくひょう} ' + n(r.goal) + '{歩|ほ}）'); U().render();
      }, 'seg-b' + (s.mode === x[0] ? ' on' : ''), { attrs: { type: 'button', 'data-mode-set': x[0], 'aria-pressed': s.mode === x[0] ? 'true' : 'false' } });
    }));
    var times = []; for (var hh = 17; hh <= 20; hh++) { times.push(hh + ':00'); times.push(hh + ':30'); }
    var ev = (st.notify && st.notify.evening) || '18:30';
    var notifyRow = native ? h('div', [
      toggleRow('{通知|つうち}', !(st.notify && st.notify.on === false), function (v) { s.settings.notify = Object.assign({}, s.settings.notify, { on: v }); U().save(); reNotify(); U().render(); }, 'notify'),
      h('label.sel', [h('span', { text: '「{帰|かえ}ったら{取|と}り{込|こ}もう」の{時刻|じこく}' }), h('select', { attrs: { 'data-act': 'notify-time' }, on: { change: function (e) { s.settings.notify = Object.assign({}, s.settings.notify, { evening: e.target.value }); U().save(); reNotify(); } } }, times.map(function (tm) { var o = h('option', { attrs: { value: (tm.length === 4 ? '0' : '') + tm } }); o.textContent = tm; if (ev === o.value || ev === tm) o.selected = true; return o; }))]),
      h('p.muted', { text: '21{時|じ}から{朝|あさ}7{時|じ}の{間|あいだ}は{通知|つうち}を{出|だ}しません。' })
    ]) : h('p.muted', { text: '{通知|つうち}はアプリ{版|ばん}だけの{機能|きのう}です（ブラウザでは{出|だ}しません）。' });
    var secretRow;
    if (s.mode === 'otona') secretRow = toggleRow('「ひみつの{術|じゅつ}」の{名前|なまえ}', !!st.showSecretNames, function (v) { s.settings.showSecretNames = v; U().save(); U().render(); }, 'secret');
    else secretRow = btn('「ひみつの{術|じゅつ}」の{名前|なまえ}を{一時|いちじ}{表示|ひょうじ}', function () {
      U().modal([h('ul.lines', (D().SECRET_JUTSU || []).map(function (id) { var c = CH().BY_ID[id]; return h('li', { text: nameF(id, true) + '：' + word(c.jutsu) }); })), h('p.muted', { text: 'こどもモードでは「ひみつの{術|じゅつ}」と{表示|ひょうじ}しています。' })], { title: 'ひみつの{術|じゅつ}' });
    }, 'small', { attrs: { type: 'button', 'data-act': 'secret-peek' } });
    var dataRow = h('div.row', [
      btn('{書|か}き{出|だ}し', function () {
        if (!U().has('Share', 'exportFile')) { U().toast('{準備中|じゅんびちゅう}'); return; }
        var f = SA.Share.exportFile(s);
        Promise.resolve(SA.Share.saveText(f.name, f.text)).then(function (r) {
          if (r && r.ok) { U().toast('{書|か}き{出|だ}したよ'); if (U().has('Store', 'setPref')) SA.Store.setPref('lastExport', U().today()); }
          else U().toast(SA.Share.message ? SA.Share.message(r && r.reason) : '{保存|ほぞん}できませんでした', 'ng');
        });
      }, '', { attrs: { type: 'button', 'data-act': 'export' } }),
      fileButton('{読|よ}み{込|こ}み', '.json,application/json,text/plain', function (f) {
        readFileText(f).then(function (text) {
          if (!U().has('Share', 'importFile')) { U().toast('{準備中|じゅんびちゅう}'); return; }
          var r = SA.Share.importFile(text);
          if (!r.ok) { U().toast(SA.Share.message ? SA.Share.message(r.reason) : '{読|よ}めませんでした', 'ng'); return; }
          U().confirmBox('いまの{記録|きろく}を、このファイルの{記録|きろく}に{置|お}きかえますか？', '{置|お}きかえる', 'やめる', function (ok) {
            if (!ok) return;
            var ns = r.state;
            if (A().info && A().info.route) ns.route = A().info.route;
            A().state = ns; U().save().then(function () { U().go('home'); U().toast('{読|よ}み{込|こ}んだよ'); });
          }, { danger: true });
        });
      }, { id: 'import' })
    ]);
    return screenWrap('{保護者|ほごしゃ}{設定|せってい}', [
      section('{目標|もくひょう}{歩数|ほすう}', [goalRow, h('p.muted', { text: U().n(G.min) + '〜' + U().n(G.max) + '{歩|ほ}、' + stp + '{歩|ほ}きざみ' })]),
      section('おとな・こども', [modeRow, h('p.muted', { text: 'こどもモードでは、{深夜|しんや}の{歩数|ほすう}を{修行|しゅぎょう}に{入|い}れず、{相性|あいしょう}の{時間帯|じかんたい}を{昼|ひる}に{寄|よ}せ、ひみつの{術|じゅつ}の{名前|なまえ}を{伏|ふ}せます。' })]),
      section('{通知|つうち}', [notifyRow]),
      section('ホームのボタン', [
        toggleRow('「{道|みち}を{進|すす}める／{里|さと}に{納|おさ}める」', st.homeButton !== false, function (v) { s.settings.homeButton = v; U().save(); U().render(); }, 'homeButton'),
        toggleRow('「{家族|かぞく}で{歩|ある}いた{日|ひ}」', st.familyButton !== false, function (v) { s.settings.familyButton = v; U().save(); U().render(); }, 'familyButton')
      ]),
      section('{歩数|ほすう}の{許可|きょか}の{取|と}り{消|け}し{方|かた}', [h('p', { text: P.revoke || '{端末|たんまつ}の「{設定|せってい}」アプリから、いつでも{取|と}り{消|け}せます。' })]),
      section('{書|か}き{出|だ}し・{読|よ}み{込|こ}み', [dataRow, P.exportNote ? h('p.muted', { text: P.exportNote }) : null]),
      section('ひみつの{術|じゅつ}', [secretRow]),
      section('{外部|がいぶ}へのリンク', [h('p.muted', { text: 'いまはありません（{作者|さくしゃ}のサイトができたら、ここに{置|お}きます）。' })]),
      section('{診断|しんだん}ファイル', [h('p.muted', { text: 'テストに{協力|きょうりょく}してくださる{方|かた}{向|む}け。{日付|ひづけ}ごとの{修行値|しゅぎょうち}などの9{項目|こうもく}だけで、{歩数|ほすう}そのものは{入|はい}りません。' }), btn('{診断|しんだん}ファイルを{作|つく}る', function () {
        if (!U().has('Share', 'diagnosticsFile')) { U().toast('{準備中|じゅんびちゅう}'); return; }
        var f = SA.Share.diagnosticsFile(s);
        Promise.resolve(SA.Share.saveText(f.name, f.text)).then(function (r) { U().toast(r && r.ok ? '{作|つく}ったよ' : '{保存|ほぞん}できませんでした', r && r.ok ? '' : 'ng'); });
      }, '', { attrs: { type: 'button', 'data-act': 'diag' } })]),
      section('はじめから', [h('p.muted', { text: 'この{端末|たんまつ}の{記録|きろく}をすべて{消|け}します（{確認|かくにん}が2{回|かい}あります）。' }), btn('はじめから', function () { U().resetAll(); }, 'red', { attrs: { type: 'button', 'data-act': 'reset' } })]),
      h('div.center', [btn('{保護者|ほごしゃ}{設定|せってい}をとじる', function () { A().parentOK = false; U().go('menu'); }, 'primary', { attrs: { type: 'button', 'data-act': 'parent-close' } })])
    ], 'parent');
  }
  function reNotify() {
    var s = A().state;
    if (!SA.Notify) return;
    try {
      if (s.settings.notify && s.settings.notify.on === false) Promise.resolve(SA.Notify.cancelAll()).catch(function () { });
      else Promise.resolve(SA.Notify.schedule(s, { ask: true })).catch(function () { });
    } catch (e) { }
  }

  /* ================= 3.11 ながめるモード ================= */
  function viewfile() {
    var h = U().h;
    var vs = A().viewState;
    return screenWrap('{書|か}き{出|だ}しファイルを{開|ひら}く', [section(null, [
      h('p', { text: '{書|か}き{出|だ}しファイルを{開|ひら}くと、その{記録|きろく}の{図鑑|ずかん}と{忍|しの}びの{道|みち}を{見|み}られるよ（{読|よ}むだけ。{変|か}えません）。' }),
      fileButton('ファイルを{選|えら}ぶ', '.json,application/json,text/plain', function (f) {
        readFileText(f).then(function (text) {
          if (!U().has('Share', 'importFile')) { U().toast('{準備中|じゅんびちゅう}'); return; }
          var r = SA.Share.importFile(text);
          if (!r.ok) { U().toast(SA.Share.message ? SA.Share.message(r.reason) : '{読|よ}めませんでした', 'ng'); return; }
          A().viewState = r.state; A().viewUnlocked = false; U().go('zukan'); U().toast('{開|ひら}いたよ');
        });
      }, { id: 'view-open', cls: 'primary' }),
      vs ? h('p.muted', { text: 'いま{開|ひら}いている{記録|きろく}：' + U().esc(vs.createdAt) + 'から・{会|あ}えた{忍|しのび} ' + Object.keys(vs.chars || {}).length }) : null
    ]), vs ? section('{表示|ひょうじ}の{守|まも}り', [
      h('p.muted', { text: A().viewUnlocked
        ? 'いまは、ファイルの{設定|せってい}のとおりに{見|み}せています（ひみつの{術|じゅつ}の{名前|なまえ}・{公式|こうしき}の{紹介文|しょうかいぶん}）。'
        : 'ながめるモードでは、ファイルの{設定|せってい}にかかわらず、こども{向|む}けに{見|み}せています（ひみつの{術|じゅつ}の{名前|なまえ}を{伏|ふ}せ、{紹介文|しょうかいぶん}はやさしいことばで）。' }),
      A().viewUnlocked
        ? U().btn('こども{向|む}けの{表示|ひょうじ}にもどす', function () { A().viewUnlocked = false; U().render(); }, '', { attrs: { type: 'button', 'data-act': 'view-lock' } })
        : U().btn('{保護者|ほごしゃ}：ファイルのとおりに{見|み}る', function () { U().gate(function (ok) { if (ok) { A().viewUnlocked = true; U().render(); } }); }, '', { attrs: { type: 'button', 'data-act': 'view-unlock' } })
    ]) : null], 'viewfile');
  }

  /* ================= 記録が読めなかったとき ================= */
  function broken() {
    var h = U().h;
    return screenWrap('{記録|きろく}が{読|よ}めませんでした', [section(null, [
      h('div.center', [fig('anne', 'surprised', 110)]),
      h('p', { text: 'この{端末|たんまつ}に{保存|ほぞん}した{記録|きろく}が、こわれているか、{新|あたら}しい{版|ばん}のアプリで{作|つく}られたため、{読|よ}めませんでした。' }),
      h('p.muted', { text: '{書|か}き{出|だ}しファイルがあれば、そこから{記録|きろく}をもどせます。ないときは「はじめから」で{始|はじ}め{直|なお}せます。' }),
      h('div.ob-foot.col', [
        fileButton('{書|か}き{出|だ}しファイルを{開|ひら}く', '.json,application/json,text/plain', function (f) {
          readFileText(f).then(function (text) {
            if (!U().has('Share', 'importFile')) { U().toast('{準備中|じゅんびちゅう}'); return; }
            var r = SA.Share.importFile(text);
            if (!r.ok) { U().toast(SA.Share.message ? SA.Share.message(r.reason) : '{読|よ}めませんでした', 'ng'); return; }
            var ns = r.state;
            if (A().info && A().info.route) ns.route = A().info.route;
            function take() {
              A().broken = null; A().state = ns; A().screen = 'home';
              U().save().then(function () { U().toast('{読|よ}み{込|こ}んだよ'); U().render(); return U().onOpen('boot'); });
            }
            // 保護者設定の読み込みと同じく、関門を通してから（こどもモードの守りの抜け道にしない）
            U().gate(function (ok) { if (ok) take(); });
          });
        }, { id: 'broken-import', cls: 'primary big' }),
        U().btn('はじめから（{確認|かくにん}2{回|かい}）', function () { U().resetAll(); }, 'red', { attrs: { type: 'button', 'data-act': 'broken-reset' } })
      ])
    ])], 'broken');
  }

  SA.Screens = {
    broken: broken, resetOnboard: resetOnboard,
    onboard: onboard, home: home, shugyo: shugyo, jutsu: jutsu, road: road, zukan: zukan, sato: sato, review: review,
    menu: menu, parent: parent, viewfile: viewfile,
    showEvents: showEvents, mergeEvents: mergeEvents, zukanDetail: zukanDetail, playJutsu: playJutsu, eventTitle: eventTitle,
    nameF: nameF, jutsuF: jutsuF, bioF: bioF, word: word, stationF: stationF
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.Screens;
})(typeof window !== 'undefined' ? window : globalThis);
