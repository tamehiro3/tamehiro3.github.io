/* 忍び足（しのびあし）— 数値と構造のデータ
 * 設計図（家族版・2026-10-25）の数値をここに集める。画面にもルールにも依存しない。
 * 文章（一言・小話・図鑑文）は content.js、ルールは rules.js、39体の公式データと絵の定義は chars.js。
 * 「（仮）」の数値は設計図でも仮の値。変えるときはここだけを直す。
 * 表記: 画面に出す文字は {漢字|かな} の形でふりがなを書く（ui.js が <ruby> にする）。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  /* ---------------- 数値（設計図 第4章・第5章・第7章） ---------------- */
  var CONFIG = {
    APP_ID: 'shinobi-ashi',
    DATA_VERSION: 1,           // 進行データと書き出しファイルの版
    QR_VERSION: 1,             // 見せ合い QR の版（先頭1バイト）
    DAY_CAP: 16500,            // 1日の修行値の上限（仮）。超えた分は修行値にならない。「今日はここまで」
    SCROLL_STEPS: 1000,        // 巻物1本＝1,000歩（来訪累計の1,000歩ごと）
    JUTSU_MS: 3000,            // 忍術の間の演出の長さ
    GOAL: {                    // 1日の目標歩数（保護者設定で変更）
      kodomo: { min: 3000, max: 12000, def: 10000 },
      otona: { min: 3000, max: 12000, def: 8000 },
      step: 500
    },
    REJECT: {                  // 不採用にする区間（乗り物・振り）
      perHour: 12000,          // 1時間あたり12,000歩を超える区間
      perMinute: 200,          // 区間の平均が毎分200歩を超える（持続ケイデンス）
      kidsNightFrom: 0,        // こどもモード: 0〜5時の歩数は修行値に入れない
      kidsNightTo: 5
    },
    WALKING_CHECK_MS: 3000,    // 起動時の歩行中判定の長さ
    WALKING_CADENCE: 1.2,      // iOS: 1.2歩/秒以上で歩行中
    WALKING_EVENTS: 4,         // Android: 歩数検出イベント4回以上で歩行中
    HISTORY_DAYS: { ios: 7, androidB: 10, androidC: 0 },   // さかのぼって読める日数。超えた分は「修行お休み」
    RECENT_DAYS: 7,            // 1日の実歩数を端末内に持つ日数（8日目に消す）
    AFFINITY_MULT: 1.2,        // 修行の相性が合った日の倍率（仮）
    AFFINITY_MIN_STEPS: 1000,  // 時間帯の相性: その時間帯に1,000歩以上
    CONT_STEPS_PER_HOUR: 3000, // 続けて歩く: 1時間に3,000歩以上の区間がある
    BITS_BUCKETS: 6, BITS_MIN: 100, // 細切れ歩き: 100歩以上の時間（1時間区切り）が6つ以上
    REST_BELOW: 3000,          // 「休んだ翌日」: 前の日の修行値が3,000歩未満
    STEADY_RATIO: 0.25, STEADY_MIN: 2000, // こつこつ: 前の日との差が25%以内で2,000歩以上
    ALLOC_STEP: 10,            // 修行枠の割り当ては10%きざみ
    ALLOC_PRESETS: [           // 割り当ての見本（合計100）
      { id: 'even', label: '{三人|さんにん}で{分|わ}ける', alloc: [34, 33, 33] },
      { id: 'main7', label: '{一人|ひとり}に{七割|ななわり}', alloc: [70, 15, 15] },
      { id: 'two', label: '{二人|ふたり}で{分|わ}ける', alloc: [50, 50, 0] }
    ],
    BOARD_MAX: 5,              // 家族の掲示板に貼れる相棒の数（仮）
    BOARD_STALE_DAYS: 14,      // 14日 QR を読み直さないと「かくれる」
    GUEST_DAYS: 7,             // 読み取った相棒が「里の客」としてホームを歩く日数
    HIDE_SEARCH_FROM: 140000,  // かくれる探しが効き始める来訪累計（最初の8体がそろう14万歩。仮）
    HIDE_CANDIDATES: 3,        // 隠れ里にかくれている候補の数（仮）
    HIDE_SEARCH_STEPS: 5000,   // 隠れ里の累計5,000歩ごとに1回「探す」ができる（仮）
    ROAD_STEP: 20000,          // 忍びの道: 宿場の間隔2万歩
    OKUGI: [1200000, 1500000], // 免許皆伝のあとの「奥義」（その相棒の累計修行値。仮）
    JIN_SHADOW_AT: 1150000,    // 刃は 115万歩で「なぞの影」として来て、
    JIN_REVEAL_AT: 1200000,    //       120万歩で名乗る
    SHOW_GUN: false,           // 孫市の銃を装備表示に出すか（設計図 第15章: 年齢区分の試算で本人が決める）
    WEB_TRIAL: true,           // ブラウザで「ためし歩き」を出すか（false ならブラウザは「ながめる」だけ）
    NOTIFY: { eveningDefault: '18:30', quietFrom: 21, quietTo: 7, staleDays: 6 } // ローカル通知（アプリだけ）
  };

  /* 位（くらい）5段。need＝その位までに要る修行値、total＝累計（設計図 5.2 の表） */
  var RANKS = [
    { id: 0, name: '{入門|にゅうもん}', plain: '入門', total: 0 },
    { id: 1, name: '{見習|みなら}い', plain: '見習い', need: 10000, total: 10000 },
    { id: 2, name: '{下忍|げにん}', plain: '下忍', need: 30000, total: 40000 },
    { id: 3, name: '{中忍|ちゅうにん}', plain: '中忍', need: 60000, total: 100000 },
    { id: 4, name: '{上忍|じょうにん}', plain: '上忍', need: 150000, total: 250000 },
    { id: 5, name: '{免許皆伝|めんきょかいでん}', plain: '免許皆伝', need: 650000, total: 900000 }
  ];
  var WEAPON_FROM_RANK = 3;    // 中忍から4面図に武器が出る（使う演出はない）

  /* 来訪の節目（来訪累計）。2万×12（24万まで）→3万×13（63万まで）→4万×13（115万まで）＝38回 */
  var VISIT_AT = (function () {
    var a = [], t = 0, i;
    for (i = 0; i < 12; i++) { t += 20000; a.push(t); }
    for (i = 0; i < 13; i++) { t += 30000; a.push(t); }
    for (i = 0; i < 13; i++) { t += 40000; a.push(t); }
    return a; // a[37] === 1150000
  })();

  /* 最初に選べる主相棒＝4クランの代表（設計図 5.1。仮・本人が決める） */
  var REPS = [
    { id: 'anne', clan: '伊賀', pitch: '{影|かげ}の{術|じゅつ}が{得意|とくい}な{里|さと}。{餡音|あんね}は{明|あか}るいお{調子者|ちょうしもの}。' },
    { id: 'sakuya', clan: '甲賀', pitch: '{呼|よ}び{出|だ}しの{術|じゅつ}と{朝|あさ}の{修行|しゅぎょう}の{里|さと}。{咲耶|さくや}は{元気|げんき}いっぱい。' },
    { id: 'kohaku', clan: '風魔', pitch: '{夕暮|ゆうぐ}れに{強|つよ}い{里|さと}。{狐白|こはく}はお{面|めん}の{下|した}がひみつの{忍|しのび}。' },
    { id: 'shiba', clan: '雑賀', pitch: '{海|うみ}と{昼|ひる}の{里|さと}。{柴|しば}はふだんは{犬|いぬ}の{姿|すがた}で、{朝|あさ}のお{散歩|さんぽ}が{好|す}き。' }
  ];

  /* 来訪の順（全員共通の固定順）。主相棒は抜いて詰める。刃はいつも最後（38回目＝115万歩、「なぞの影」として） */
  var FIRST8 = ['anne', 'sakuya', 'kohaku', 'shiba', 'karma', 'hayate', 'nemu', 'hinanojoh'];
  var VISIT_ORDER = [
    // 代表4体（図鑑番号順。主相棒を除いた3体が 2万・4万・6万歩）
    'sakuya', 'kohaku', 'shiba', 'anne',
    // 最初の8体の残り（4〜7回目、14万歩で8体がそろう）
    'karma', 'hayate', 'nemu', 'hinanojoh',
    // 8回目から（16万歩〜）
    'ichiya', 'oto', 'uka', 'fuuta', 'yui', 'rei', 'shion', 'torika', 'konga', 'atoza',
    'aum', 'xiaolan', 'nagisa', 'nekomata', 'quon', 'janome', 'rotten', 'dan', 'karura', 'benten',
    'magoichi', 'oen', 'izuna', 'ganzi', 'kanaoni', 'seori', 'ibuki', 'sekishusai', 'sattva', 'sasagane',
    // 38回目
    'jin'
  ];

  /* クラン（里）。base＝基準色、road＝その里に着くと「市の染め」で使えるようになる色 */
  var CLANS = {
    '伊賀': { id: 'iga', kana: 'いが', color: '#1F3A5F', dye: '藍', dyeKana: 'あい' },
    '甲賀': { id: 'koka', kana: 'こうか', color: '#B0342B', dye: '朱', dyeKana: 'しゅ' },
    '風魔': { id: 'fuma', kana: 'ふうま', color: '#3E5E3A', dye: '松葉', dyeKana: 'まつば' },
    '雑賀': { id: 'saika', kana: 'さいか', color: '#2E6E8E', dye: '潮色', dyeKana: 'しおいろ' },
    '天界': { id: 'tenkai', kana: 'てんかい', color: '#C9A43A' },
    '根の国': { id: 'nenokuni', kana: 'ねのくに', color: '#4A3A55' }
  };
  var ROAD_COLOR = '#7A7A80';  // 街道色（灰）。どのクランの土地でもない区間

  /* 染め色（装束の色）。unlock＝どこで使えるようになるか */
  var DYES = [
    { id: 'none', name: 'もとの{色|いろ}', color: null, unlock: { start: true } },
    { id: 'ai', name: '{藍|あい}', color: '#1F3A5F', unlock: { start: true } },
    { id: 'hai', name: '{灰|はい}（{街道|かいどう}）', color: '#7A7A80', unlock: { station: 2 } },
    { id: 'shu', name: '{朱|しゅ}', color: '#B0342B', unlock: { station: 1 } },
    { id: 'matsuba', name: '{松葉|まつば}', color: '#3E5E3A', unlock: { station: 21 } },
    { id: 'shio', name: '{潮色|しおいろ}', color: '#2E6E8E', unlock: { station: 50 } },
    { id: 'kin', name: '{金|きん}', color: '#C9A43A', unlock: { rank: 5 } }
  ];

  /* 忍びの道（案A: 伊賀上野→甲賀→東海道19宿→小田原→東海道を西へ（二巡目の逆走）→伊勢・大和→和歌山城→雑賀崎）
   * 宿場 k は道の累計 k×2万歩。50宿＝100万歩。距離は直線の概算（設計図 6.2、画面に注記を出す）。
   * clan＝その宿場の差し色（null は街道色）。arrive＝着いたときに起きること。 */
  function st(name, kana, clan, extra) { var o = { name: name, kana: kana, clan: clan || null }; for (var k in extra || {}) o[k] = extra[k]; return o; }
  var STATIONS = [
    st('伊賀上野', 'いがうえの', '伊賀', { start: true }),
    st('甲賀', 'こうか', '甲賀', { dye: 'shu' }),
    st('土山', 'つちやま', null, { dye: 'hai' }), st('坂下', 'さかのした'), st('関', 'せき'), st('亀山', 'かめやま'),
    st('四日市', 'よっかいち'), st('桑名', 'くわな'), st('宮', 'みや'), st('岡崎', 'おかざき'), st('吉田', 'よしだ'),
    st('浜松', 'はままつ'), st('見付', 'みつけ'), st('掛川', 'かけがわ'), st('島田', 'しまだ'), st('府中', 'ふちゅう'),
    st('興津', 'おきつ'), st('吉原', 'よしわら', null, { event: 'atoza' }), st('沼津', 'ぬまづ'), st('三島', 'みしま'), st('箱根', 'はこね'),
    st('小田原', 'おだわら', '風魔', { dye: 'matsuba' }),
    st('原', 'はら'), st('蒲原', 'かんばら'), st('由比', 'ゆい'), st('江尻', 'えじり'), st('丸子', 'まりこ'),
    st('藤枝', 'ふじえだ'), st('金谷', 'かなや'), st('日坂', 'にっさか'), st('袋井', 'ふくろい'), st('舞阪', 'まいさか'),
    st('新居', 'あらい'), st('二川', 'ふたがわ'), st('御油', 'ごゆ'), st('藤川', 'ふじかわ'), st('池鯉鮒', 'ちりゅう'),
    st('鳴海', 'なるみ'), st('七里の渡し', 'しちりのわたし'), st('白子', 'しろこ'), st('津', 'つ'), st('松阪', 'まつさか'),
    st('伊勢', 'いせ'), st('名張', 'なばり', '伊賀'), st('長谷', 'はせ'), st('奈良', 'なら'), st('五條', 'ごじょう'),
    st('橋本', 'はしもと'), st('粉河', 'こかわ'), st('和歌山城', 'わかやまじょう', '雑賀'),
    st('雑賀崎', 'さいかざき', '雑賀', { dye: 'shio', goal: true })
  ];
  // STATIONS.length === 51（宿場0〜50）。51番目以降は「二巡目」（雑賀崎から伊賀上野へ逆にたどる）

  /* クラン共通の相性（時間帯）。kids＝こどもモードの時間帯（7〜18時の中に寄せる） */
  var CLAN_WINDOWS = {
    '伊賀': { from: 18, to: 23, kids: { from: 15, to: 18 }, label: '{夕暮|ゆうぐ}れから{夜|よる}の{歩|ある}き', kidsLabel: '{夕方|ゆうがた}の{歩|ある}き' },
    '甲賀': { from: 5, to: 9, kids: { from: 7, to: 9 }, label: '{朝|あさ}の{歩|ある}き', kidsLabel: '{朝|あさ}の{歩|ある}き' },
    '風魔': { from: 16, to: 19, kids: { from: 16, to: 18 }, label: '{逢魔|おうま}が{時|とき}（{夕方|ゆうがた}）の{歩|ある}き', kidsLabel: '{夕方|ゆうがた}の{歩|ある}き' },
    '雑賀': { from: 10, to: 14, kids: { from: 10, to: 14 }, label: '{昼|ひる}の{歩|ある}き', kidsLabel: '{昼|ひる}の{歩|ある}き' }
  };

  /* 修行の相性（39体）。その日に条件が合うと、その相棒の分の修行値が AFFINITY_MULT 倍。
   * type: clan / win{from,to,kids} / cont / bits / holiday / weekday / restAfter / home / road / family /
   *       goal / with{ids} / withRank{rank} / fullmoon / sekki / steady
   * 区間（1時間ごとの歩数）が取れない経路（Android の (c) など）では win / cont / bits / clan は「判定なし（1.0倍）」。 */
  var AFFINITY = {
    jin: { type: 'cont', label: '{長|なが}く{続|つづ}けて{歩|ある}いた{日|ひ}' },
    sakuya: { type: 'clan' },
    kohaku: { type: 'with', ids: ['sakuya'], label: '{咲耶|さくや}と{同|おな}じ{日|ひ}に{修行枠|しゅぎょうわく}にいる{日|ひ}' },
    shiba: { type: 'win', from: 5, to: 7, kids: { from: 7, to: 8 }, label: '{朝|あさ}7{時|じ}までのお{散歩|さんぽ}', kidsLabel: '{朝|あさ}7{時|じ}から8{時|じ}のお{散歩|さんぽ}' },
    kanaoni: { type: 'withRank', rank: 3, label: '{中忍|ちゅうにん}{以上|いじょう}の{相棒|あいぼう}と{同|おな}じ{日|ひ}に{修行枠|しゅぎょうわく}にいる{日|ひ}' },
    oto: { type: 'clan' },
    rotten: { type: 'restAfter', label: 'ひと{休|やす}みした{次|つぎ}の{日|ひ}' },
    nagisa: { type: 'bits', label: 'こまめに{歩|ある}いた{日|ひ}' },
    anne: { type: 'win', from: 14, to: 16, kids: { from: 14, to: 16 }, label: 'おやつの{時間|じかん}（2{時|じ}〜4{時|じ}）の{歩|ある}き' },
    dan: { type: 'win', from: 12, to: 14, kids: { from: 12, to: 14 }, label: 'お{昼|ひる}（12{時|じ}〜2{時|じ}）の{歩|ある}き' },
    hinanojoh: { type: 'goal', label: '{目標|もくひょう}に{届|とど}いた{日|ひ}' },
    torika: { type: 'sekki', label: '{二十四節気|にじゅうしせっき}の{日|ひ}（{季節|きせつ}の{変|か}わり{目|め}）' },
    atoza: { type: 'win', from: 17, to: 19, kids: { from: 16, to: 18 }, label: '{日|ひ}の{入|い}りのころの{歩|ある}き', kidsLabel: '{夕方|ゆうがた}（4{時|じ}〜6{時|じ}）の{歩|ある}き' },
    hayate: { type: 'cont', label: '{長|なが}く{続|つづ}けて{歩|ある}いた{日|ひ}' },
    uka: { type: 'win', from: 7, to: 10, kids: { from: 7, to: 9 }, label: '{朝|あさ}のお{参|まい}りの{時間|じかん}の{歩|ある}き' },
    ganzi: { type: 'with', ids: ['rei', 'yui', 'sakuya'], label: '{家族|かぞく}（{令|れい}・{結|ゆい}・{咲耶|さくや}）と{同|おな}じ{日|ひ}に{修行枠|しゅぎょうわく}にいる{日|ひ}' },
    yui: { type: 'win', from: 12, to: 15, kids: { from: 12, to: 15 }, label: '{昼|ひる}の{歩|ある}き' },
    fuuta: { type: 'holiday', label: 'お{休|やす}みの{日|ひ}（{土日|どにち}・{祝日|しゅくじつ}）' },
    rei: { type: 'with', ids: ['yui', 'shion'], label: '{結|ゆい}か{紫苑|しおん}と{同|おな}じ{日|ひ}に{修行枠|しゅぎょうわく}にいる{日|ひ}' },
    sattva: { type: 'fullmoon', label: '{満月|まんげつ}のころ' },
    nekomata: { type: 'win', from: 20, to: 23, kids: { from: 16, to: 18 }, label: '{夜|よる}（8{時|じ}〜11{時|じ}）の{歩|ある}き', kidsLabel: '{夕方|ゆうがた}（4{時|じ}〜6{時|じ}）の{歩|ある}き' },
    janome: { type: 'steady', label: 'きのうと{同|おな}じくらい{歩|ある}いた{日|ひ}' },
    benten: { type: 'weekday', label: '{平日|へいじつ}' },
    karma: { type: 'clan' },
    ichiya: { type: 'road', label: '{道|みち}を{進|すす}めた{日|ひ}' },
    nemu: { type: 'home', label: '{我|わ}が{家|や}の{日|ひ}' },
    karura: { type: 'clan' },
    xiaolan: { type: 'win', from: 6, to: 9, kids: { from: 7, to: 9 }, label: '{朝|あさ}の{歩|ある}き（{太極拳|たいきょくけん}の{時間|じかん}）' },
    aum: { type: 'with', ids: ['atoza'], label: '{兄|あに}アトザと{同|おな}じ{日|ひ}に{修行枠|しゅぎょうわく}にいる{日|ひ}' },
    konga: { type: 'goal', label: '{目標|もくひょう}に{届|とど}いた{日|ひ}' },
    shion: { type: 'with', ids: ['anne', 'rei'], label: '{餡音|あんね}か{令|れい}と{同|おな}じ{日|ひ}に{修行枠|しゅぎょうわく}にいる{日|ひ}' },
    seori: { type: 'clan' },
    quon: { type: 'bits', label: 'こまめに{歩|ある}いた{日|ひ}' },
    magoichi: { type: 'road', label: '{道|みち}を{進|すす}めた{日|ひ}' },
    ibuki: { type: 'clan' },
    oen: { type: 'home', label: '{我|わ}が{家|や}の{日|ひ}' },
    izuna: { type: 'with', ids: ['uka'], label: '{妹|いもうと}の{宇迦|うか}と{同|おな}じ{日|ひ}に{修行枠|しゅぎょうわく}にいる{日|ひ}' },
    sekishusai: { type: 'steady', label: 'きのうと{同|おな}じくらい{歩|ある}いた{日|ひ}' },
    sasagane: { type: 'restAfter', label: 'ひと{休|やす}みした{次|つぎ}の{日|ひ}' }
  };

  /* 忍術の間の演出（fx.js の種類）。secret＝こどもモードでは「ひみつの術」、どのモードでも説明文と専用の演出は作らない */
  var JUTSU_FX = {
    jin: 'fire', sakuya: 'summon-birds', kohaku: 'swap', shiba: 'water', kanaoni: 'metal', oto: 'summon-bunny',
    rotten: 'mist', nagisa: 'clone', anne: 'shadowstitch', dan: 'flash', hinanojoh: 'fire', torika: 'shuriken-flower',
    atoza: 'dusk', hayate: 'hawk', uka: 'foxfire', ganzi: 'illusion', yui: 'sakura', fuuta: 'wind', rei: 'secret',
    sattva: 'halo', nekomata: 'clone', janome: 'summon-snake', benten: 'notes', karma: 'domain', ichiya: 'rainbow-letters',
    nemu: 'paint', karura: 'thunder', xiaolan: 'summon-panda', aum: 'giant', konga: 'clone', shion: 'thistle',
    seori: 'secret', quon: 'cateye', magoichi: 'secret', ibuki: 'secret', oen: 'threads', izuna: 'foxfire',
    sekishusai: 'catch', sasagane: 'roots'
  };
  var SECRET_JUTSU = ['rei', 'seori', 'ibuki', 'magoichi']; // こどもモードでは忍術欄を「ひみつの術」と出す
  // こどもモードで公式紹介文の一部を伏せる（技の説明に当たる文）
  var KIDS_BIO = { rei: '{里|さと}を{守|まも}る{存在|そんざい}。{結|ゆい}の{母|はは}。' };

  /* 絆（きずな）: 修行枠に入り、その日の修行値が1,000以上だと +1。一言はこの絆で開く（最初の8体は12本） */
  var BOND_LINES_AT = [1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 40, 50];

  /* ふりかえりで使う見出し。連続日数（ストリーク）は出さない。累計と週の「目標に届いた日の数」だけ */
  var WEEK_START = 1; // 月曜はじまり

  SA.DATA = {
    CONFIG: CONFIG, RANKS: RANKS, WEAPON_FROM_RANK: WEAPON_FROM_RANK, VISIT_AT: VISIT_AT,
    REPS: REPS, FIRST8: FIRST8, VISIT_ORDER: VISIT_ORDER, CLANS: CLANS, ROAD_COLOR: ROAD_COLOR, DYES: DYES,
    STATIONS: STATIONS, CLAN_WINDOWS: CLAN_WINDOWS, AFFINITY: AFFINITY, JUTSU_FX: JUTSU_FX,
    SECRET_JUTSU: SECRET_JUTSU, KIDS_BIO: KIDS_BIO, BOND_LINES_AT: BOND_LINES_AT, WEEK_START: WEEK_START
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.DATA;
})(typeof window !== 'undefined' ? window : globalThis);
