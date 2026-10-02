/* ニンジャからくり工房 — 数値と中身（試作用の仮設定。設計書 §4・§5・§8・§9 の値）
 * 画面に依存しない。ブラウザでも Node（テスト・解答機）でも読める。
 */
(function (root) {
  'use strict';

  var VERSION = {
    schema: 1,          // 試験データの形（LevelVersion.schema_version）
    rules: 'k1'         // 物理と判定のルールの版（rules_version）。数値を変えたら上げる（記録は版ごとに分ける）
  };

  // ---- ステージの大きさと上限（§4） ----
  var GRID = { W: 32, H: 12 };
  var LIMIT = {
    parts: 80,          // 部品総数（スタート・ゴール・装飾もふくむ）
    active: 10,         // 動作する仕掛け（移動足場・予告付き罠・扉・スイッチ）
    checkpoints: 2,
    timeFrames: 120 * 60, // 制限時間 120秒
    drafts: 10,         // 下書き（§8）
    published: 3,       // 公開枠（§8）
    jsonBytes: 16000,   // 1本の試験データの大きさの上限
    aiPerDay: 3,        // 新規の生成（提案）は1日3回まで（§7）
    aiTimeoutMs: 12000, // 12秒で終わらなければ承認済みの見本を出す
    history: 100,       // 取り消しの段数
    saves: 12           // 自動保存の履歴（前の版へ戻れる）
  };

  // ---- 物理（1マス＝見習いの体の基準。60コマ/秒の固定ステップ） ----
  var PHYS = {
    dt: 1 / 60,
    w: 0.62, h: 1.3,     // 見習いの当たり判定（幅・高さ。マス単位）
    run: 6.0,            // 最高速度（マス/秒）
    accG: 55, decG: 60,  // 地上の加速・減速
    accA: 36, decA: 16,  // 空中の加速・減速
    grav: 40,            // 重力
    jump: 16.6,          // 跳ぶ初速 → 最高 約3.3マス、全力で約5マス先まで
    cut: 7,              // ボタンを早く離したときの上昇速度の上限（小さく跳ぶ）
    fall: 18,            // 落ちる速さの上限
    coyote: 6,           // 足場から出たあとでも跳べるコマ数
    buffer: 7,           // 着地の少し前に押したジャンプを覚えておくコマ数
    deadFrames: 30,      // 失敗したときの止まる時間（0.5秒）→ 直近のチェックポイントへ
    jutsuFrames: 240,    // 水渡りの術の長さ（4秒）
    chargeMax: 3,
    moverW: 3,           // 移動足場の幅（マス）
    moverSpeed: [0, 1.5, 2.5, 3.5], // 速度3段階（マス/秒）
    moverDwell: 30,      // 端で止まるコマ数
    trapCycle: [0, 216, 168, 132],  // 予告付き罠の間隔3段階（コマ）：ゆっくり3.6秒・ふつう2.8秒・はやい2.2秒
    trapWarn: 45,        // 警告の長さ（0.75秒・下限で固定）
    trapActive: 60,      // トゲが出ている長さ（1秒）
    jumpDx: 5, jumpDy: 3 // 経路の近似検査で「跳んで届く」とみなす横のマス数と高さ（体の幅があるので4マスの谷は楽に跳べる）
  };

  // ---- 扉とスイッチの色（色だけに頼らず、形でも見分けられるようにする） ----
  var COLORS = [
    { id: 0, name: '赤', col: '#d8402c', dk: '#8a2418', shape: 'circle', mark: '●' },
    { id: 1, name: '青', col: '#2f6fd0', dk: '#1a3f80', shape: 'tri', mark: '▲' },
    { id: 2, name: '黄', col: '#e2ae1c', dk: '#8a6a0e', shape: 'square', mark: '■' },
    { id: 3, name: '緑', col: '#3a9a4a', dk: '#1f5a2a', shape: 'star', mark: '★' }
  ];

  // ---- 装飾（当たり判定なし。危険に見える形は使わない） ----
  var DECOS = [
    { id: 0, name: '灯籠', ch: 'l' }, { id: 1, name: '竹', ch: 't' }, { id: 2, name: '松', ch: 'p' }, { id: 3, name: '岩', ch: 'o' },
    { id: 4, name: '花', ch: 'f' }, { id: 5, name: 'のぼり', ch: 'n' }, { id: 6, name: '風鈴', ch: 'w' }, { id: 7, name: '狛狐', ch: 'k' }
  ];

  // ---- 部品（§5）。params の値はすべて数か決まった文字だけ（任意の文字列・スクリプトは入れない） ----
  // active：動作する仕掛けの数に入る／solid：体がぶつかる
  var PARTS = {
    start:  { name: 'スタート', icon: '出', need: true, params: {}, desc: '見習いが立つ場所。1つだけ。下に足場が必要です。' },
    goal:   { name: 'ゴール', icon: '鳥', need: true, params: {}, desc: '触れると合格。1つだけ。' },
    floor:  { name: '足場', icon: '▬', solid: true, params: { len: [1, 16, 3], dir: ['h', 'v'], skin: [0, 2, 0] }, desc: '乗れる足場。長さと外観を変えられます。回転で縦（かべ）にもなります。' },
    mover:  { name: '移動足場', icon: '⇆', active: true, solid: true, params: { x2: [0, 31, 0], y2: [0, 11, 0], speed: [1, 3, 2] }, desc: '2つの地点のあいだを行き来します（幅3マス）。速さは3段階。' },
    pit:    { name: '落とし穴', icon: '◣', params: { len: [1, 8, 2] }, desc: '落ちると直近のチェックポイントに戻ります。' },
    trap:   { name: '予告付き罠', icon: '▲', active: true, params: { rate: [1, 3, 2], dir: ['up', 'down'] }, desc: '光って知らせてからトゲが出ます。間隔は3段階。' },
    door:   { name: '扉', icon: '門', active: true, solid: true, params: { color: [0, 3, 0] }, desc: '同じ色と形のスイッチで開きます（高さ2マス）。' },
    'switch': { name: 'スイッチ', icon: '◉', active: true, params: {}, desc: '触れると、つないだ扉が開きます。つなぐ扉を1つ選びます。' },
    water:  { name: '水路', icon: '〜', params: { len: [2, 10, 3] }, desc: 'ふつうは通れません。水渡りの術を使うと上を走れます。' },
    refill: { name: '忍術補給', icon: '巻', params: { count: [1, 3, 1] }, desc: '水渡りの術の回数がたまります（何度でも取れます）。' },
    check:  { name: 'チェックポイント', icon: '旗', params: {}, desc: '触れると、失敗したときにここから再開します（2つまで）。' },
    deco:   { name: '装飾', icon: '✿', params: { kind: [0, 7, 0], dir: ['r', 'l'] }, desc: '見た目だけの飾り。当たり判定はありません。' }
  };
  var PART_ORDER = ['floor', 'mover', 'pit', 'trap', 'door', 'switch', 'water', 'refill', 'check', 'deco', 'start', 'goal'];
  var JUTSU = { mizu: { name: '水渡りの術', short: '水渡り' } };

  // ---- 外見テーマ（§9）。形・当たり判定・危険の見た目は同じで、外観だけ変わる ----
  var THEMES = {
    chikurin: { name: '竹林', skins: ['土の足場', '岩の足場', '竹の足場'], sky: ['#cfe8d0', '#f2f0d8'], far: '#8fb88a', near: '#5f8f58', floor: ['#8a6a44', '#8a8a86', '#9ab25a'], top: ['#6f9a4a', '#a6a6a0', '#c8d67a'], edge: '#3e2c1c' },
    yashiki:  { name: '屋敷', skins: ['板張り', '石垣', '瓦'], sky: ['#f3e3c8', '#fbf3e4'], far: '#c9a57a', near: '#8a5a3a', floor: ['#a8723e', '#9c968c', '#56606e'], top: ['#c8925a', '#b8b2a6', '#707c8c'], edge: '#3a2418' },
    tenku:    { name: '天空道場', skins: ['雲', '石畳', '朱塗り'], sky: ['#8cc8f0', '#e8f4fb'], far: '#ffffff', near: '#d8ecf8', floor: ['#eef4f8', '#a8b0b8', '#c8452c'], top: ['#ffffff', '#c8d0d8', '#e2664a'], edge: '#40506a' }
  };
  var THEME_ORDER = ['chikurin', 'yashiki', 'tenku'];

  // ---- 作品名と制作者の看板は、決まった言葉の組み合わせ（§8。自由入力なし） ----
  var TITLE_WORDS = {
    a: ['はじめての', 'ひらめきの', 'すばやい', 'しずかな', 'ふしぎな', 'きらめく', 'いにしえの', 'とびきりの', 'のんびり', 'ぎりぎりの', 'わくわく', 'ひみつの'],
    b: ['竹林', '屋敷', '天空', '水路', '裏庭', '蔵', '橋', '屋根', '道場', '雲', '川', '門'],
    c: ['試験', '修行', 'からくり', '抜け道', '迷い道', '関所', '小径', '大冒険', '腕だめし', '散歩道', '難所', '稽古']
  };
  var SIGN_WORDS = {
    a: ['あおい', 'あかい', 'きいろい', 'みどりの', 'しろい', 'くろい', 'むらさきの', 'きんいろの'],
    b: ['きつね', 'たぬき', 'うさぎ', 'ねこ', 'いぬ', 'たか', 'かえる', 'つばめ'],
    c: ['職人', '見習い', '名人', '工房']
  };

  // ---- 定型リアクション（§8。自由コメントなし）と通報のカテゴリ ----
  var REACTIONS = [
    { id: 'fun', name: '楽しい', icon: '😊' },
    { id: 'aha', name: 'ひらめいた', icon: '💡' },
    { id: 'hard', name: '難しい', icon: '💦' }
  ];
  var REPORTS = [
    { id: 'bad', name: '不適切' },
    { id: 'impossible', name: '攻略不能' },
    { id: 'bug', name: '表示・操作の不具合' }
  ];
  var REJECT_REASONS = [
    { id: 'shape', name: '部品で不適切な形や文字を作っている' },
    { id: 'unfair', name: '見えない所に罠があり、初見で避けられない' },
    { id: 'impossible', name: 'クリアできない（作者クリアと違う）' },
    { id: 'confusing', name: '運営の試験とまぎらわしい' },
    { id: 'other', name: 'そのほか（直す場所を見てください）' }
  ];

  // ---- 修行印で買える見た目（§9。運営の試験のクリアでだけ増える。現実のお金では買えない） ----
  var SHOP = [
    { id: 'fx_sakura', kind: 'fx', name: '合格の花吹雪', price: 3, desc: 'クリアしたときに桜が舞います。' },
    { id: 'fx_kitsunebi', kind: 'fx', name: '合格の狐火', price: 5, desc: 'クリアしたときに青い狐火が舞います。' },
    { id: 'fx_kami', kind: 'fx', name: '合格の紙ふぶき', price: 4, desc: 'クリアしたときに紙ふぶきが舞います。' },
    { id: 'sign_kin', kind: 'sign', name: '金ぶちの看板', price: 4, desc: '制作者の看板を金色のふちにします。' },
    { id: 'sign_hana', kind: 'sign', name: '花の看板', price: 3, desc: '制作者の看板に花の飾りをつけます。' },
    { id: 'outfit_fuji', kind: 'outfit', ref: 'fuji', name: '藤の装束', price: 3 },
    { id: 'outfit_sumi', kind: 'outfit', ref: 'sumi', name: '墨の装束', price: 3 },
    { id: 'outfit_sakura', kind: 'outfit', ref: 'sakura', name: '桜の装束', price: 5 },
    { id: 'outfit_kogane', kind: 'outfit', ref: 'kogane', name: '黄金の装束', price: 8 }
  ];
  // 修行印のもらい方（運営の試験だけ。作品を大量に作る・自分の作品を周回するだけでは増えない）
  var SEAL = { firstClear: 1, underTarget: 1, weekly: 3, tutorial: 2 };

  // ---- 週のお題（§14。日付から決まる） ----
  var WEEKLY = [
    { id: 'water2', name: '水渡りを2回使う試験', need: { water: 2 } },
    { id: 'door1', name: '扉とスイッチを使う試験', need: { door: 1, 'switch': 1 } },
    { id: 'mover2', name: '動く足場を2つ使う試験', need: { mover: 2 } },
    { id: 'trap3', name: '予告付き罠を3つ使う試験', need: { trap: 3 } },
    { id: 'short', name: '30秒でクリアできる短い試験', need: { maxClearSec: 30 } },
    { id: 'check2', name: 'チェックポイントを2つ使う長い試験', need: { check: 2 } }
  ];

  // ---- 提案（AI／定型）の選択肢（§7 MVP：テーマ・難易度・主な仕掛け） ----
  var SUGGEST = {
    themes: THEME_ORDER,
    levels: [{ id: 'easy', name: 'やさしい' }, { id: 'normal', name: 'ふつう' }, { id: 'hard', name: 'むずかしい' }],
    gimmicks: [
      { id: 'water', name: '水渡り' }, { id: 'mover', name: '動く足場' }, { id: 'trap', name: '予告付き罠' },
      { id: 'door', name: '扉とスイッチ' }, { id: 'pit', name: '落とし穴' }, { id: 'jump', name: '足場わたり' }
    ]
  };

  var api = {
    VERSION: VERSION, GRID: GRID, LIMIT: LIMIT, PHYS: PHYS, COLORS: COLORS, DECOS: DECOS, PARTS: PARTS, PART_ORDER: PART_ORDER, JUTSU: JUTSU,
    THEMES: THEMES, THEME_ORDER: THEME_ORDER, TITLE_WORDS: TITLE_WORDS, SIGN_WORDS: SIGN_WORDS, REACTIONS: REACTIONS, REPORTS: REPORTS,
    REJECT_REASONS: REJECT_REASONS, SHOP: SHOP, SEAL: SEAL, WEEKLY: WEEKLY, SUGGEST: SUGGEST
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KK_DATA = api;
})(typeof window !== 'undefined' ? window : globalThis);
