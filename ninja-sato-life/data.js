/* ニンジャ里ライフ — データの正本（数値は設計書 v1.0 の試作用の仮設定）
 * 施設・家具・依頼テンプレート・里レベル・店・見本の里。
 * ゲームの判定（rules.js）と画面（game.js）の両方がここを読む。
 */
(function (root) {
  'use strict';

  // ---- 数値（設計書 §4）----
  var BAL = {
    startCoin: 50,                 // 初期所持 50
    caps: { wood: 200, herb: 100 },// 初期倉庫の上限（倉庫を建てると上がる）
    field: {                       // 通常の薬草は10分で5個、畑は最大3回分を保持
      cycleMin: 10,
      byLevel: [null, { yield: 5, keep: 3 }, { yield: 6, keep: 4 }, { yield: 7, keep: 5 }]
    },
    offlineMaxH: 8,                // オフライン生産は最大8時間
    gather: { cycleMin: 8, yield: 6 },   // 竹やぶ（里の外）での採集
    debris: [                      // 最初の10分：荒れた場所を3か所片付ける → 木材30、コイン50
      { id: 'd1', x: 6, y: 8, kind: 'weeds', gain: { wood: 8, coin: 10 } },
      { id: 'd2', x: 9, y: 5, kind: 'logs', gain: { wood: 14, coin: 15 } },
      { id: 'd3', x: 4, y: 4, kind: 'rocks', gain: { wood: 8, coin: 25 } }
    ],
    visitBonus: { perDay: 3, coin: 10 },   // 訪問ボーナスは1日3回までの小額
    clerkPerDay: 2,                // AI依頼係：1人1日最大2回
    clerkTimeoutMs: 8000,          // 8秒を超えたら通常依頼へ
    trainingRewardPerDay: 5,
    maxObjects: 180,               // 家具数の上限（端末負荷の対策）
    questSlots: 3,
    sell: { wood: { per: 10, coin: 6 }, herb: { per: 5, coin: 8 } },
    expand: [
      null,
      { size: 16, level: 2, cost: { coin: 300, wood: 120 } },
      { size: 20, level: 3, cost: { coin: 800, wood: 300 } }
    ],
    map: 24,                       // 里の外も含めたマップの一辺
    plotOrigin: 2,                 // 敷地の左上
    gate: { x: 2, y: 13 }          // 里の入口（敷地の左下の辺）
  };

  // ---- 物のカタログ ----
  // cat: facility（施設・レベルあり）/ furniture（家具）/ garden（庭）
  // w,h: マス数（回転で入れかわる）  tags: 住民の好み・依頼係が読むタグ
  // cost: 作るのに必要な素材（倉庫に持っていれば無料で置ける）  unlock: 里レベル
  var ITEMS = [
    { id: 'koya', name: '小屋', cat: 'facility', w: 2, h: 2, tags: ['home'], cost: { wood: 40, coin: 30 }, unlock: 1, max: 1, door: true, desc: '見習いの住まい。入口の前は1マスあけておく。', levels: [null, {}, { cost: { coin: 120, wood: 60 }, note: '住民の定員+1' }, { cost: { coin: 240, wood: 120 }, note: '住民の定員+1' }] },
    { id: 'hatake', name: '畑', cat: 'facility', w: 2, h: 2, tags: ['farm'], cost: { wood: 20, coin: 20 }, unlock: 1, max: 4, prod: 'herb', desc: '薬草が10分で5個とれる。最大3回分までためておける。', levels: [null, {}, { cost: { coin: 80, wood: 40 }, note: '10分で6個・4回分' }, { cost: { coin: 160, wood: 80 }, note: '10分で7個・5回分' }] },
    { id: 'chaya', name: '茶屋', cat: 'facility', w: 2, h: 2, tags: ['tea', 'rest'], cost: { wood: 50, coin: 60 }, unlock: 1, max: 1, door: true, desc: '余った素材を売れる。住民が集まる場所。', levels: [null, {}, { cost: { coin: 100, wood: 50 }, note: '売値が1割よくなる' }, { cost: { coin: 200, wood: 100 }, note: '売値が2割よくなる' }] },
    { id: 'souko', name: '倉庫', cat: 'facility', w: 2, h: 2, tags: ['storage'], cost: { wood: 40, coin: 40 }, unlock: 1, max: 1, door: true, desc: '木材と薬草の上限が上がる。', levels: [null, { caps: { wood: 300, herb: 150 } }, { cost: { coin: 120, wood: 80 }, caps: { wood: 400, herb: 200 }, note: '木材400・薬草200' }, { cost: { coin: 240, wood: 160 }, caps: { wood: 500, herb: 250 }, note: '木材500・薬草250' }] },
    { id: 'shugyoba', name: '修行場', cat: 'facility', w: 3, h: 3, tags: ['training'], cost: { wood: 60, coin: 80 }, unlock: 2, max: 1, desc: 'かんたんな修行ができる。里Lv2で解放。', levels: [null, {}, { cost: { coin: 150, wood: 80 }, note: '修行のごほうび+2' }, { cost: { coin: 300, wood: 160 }, note: '修行のごほうび+4' }] },

    { id: 'chochin', name: '提灯', cat: 'furniture', w: 1, h: 1, tags: ['light', 'night'], cost: { wood: 5, coin: 10 }, unlock: 1, desc: 'やさしく光る赤い提灯。' },
    { id: 'ishidoro', name: '石灯籠', cat: 'garden', w: 1, h: 1, tags: ['light', 'rock'], cost: { coin: 40 }, unlock: 1, desc: '夜の庭を照らす石の灯り。' },
    { id: 'endai', name: '縁台', cat: 'furniture', w: 2, h: 1, tags: ['rest', 'tea'], cost: { wood: 20, coin: 10 }, unlock: 1, desc: '赤い布をかけた長いす。休憩所に。' },
    { id: 'takegaki', name: '竹垣', cat: 'garden', w: 1, h: 1, tags: ['fence', 'farm'], cost: { wood: 6 }, unlock: 1, desc: '竹で組んだ低い垣根。' },
    { id: 'matsu', name: '松', cat: 'garden', w: 1, h: 1, tags: ['tree'], cost: { coin: 25 }, unlock: 1, desc: '枝ぶりのいい松の木。' },
    { id: 'sakura', name: '桜', cat: 'garden', w: 1, h: 1, tags: ['flower', 'tree'], cost: { coin: 40 }, unlock: 1, desc: '花見にぴったりの桜の木。' },
    { id: 'kadan', name: '花壇', cat: 'garden', w: 1, h: 1, tags: ['flower'], cost: { wood: 8, herb: 5, coin: 10 }, unlock: 1, desc: '色とりどりの花が咲く小さな花壇。' },
    { id: 'niwaishi', name: '庭石', cat: 'garden', w: 1, h: 1, tags: ['rock'], cost: { coin: 15 }, unlock: 1, desc: '苔むした大きな石。' },
    { id: 'koike', name: '小池', cat: 'garden', w: 2, h: 2, tags: ['water', 'fish'], cost: { wood: 10, coin: 60 }, unlock: 1, desc: '水辺をつくる小さな池。鯉がいる。' },
    { id: 'shishiodoshi', name: '鹿威し', cat: 'garden', w: 1, h: 1, tags: ['water', 'sound'], cost: { wood: 15, coin: 20 }, unlock: 1, desc: 'カコーンと鳴る竹の仕掛け。' },
    { id: 'ido', name: '井戸', cat: 'furniture', w: 1, h: 1, tags: ['water'], cost: { wood: 20, coin: 30 }, unlock: 1, desc: 'つめたい水がくめる井戸。' },
    { id: 'kobashi', name: '小橋', cat: 'garden', w: 2, h: 1, tags: ['water', 'path'], cost: { wood: 40, coin: 60 }, unlock: 1, rule: 'nearWater', desc: '赤い太鼓橋。水辺のとなりに置く。' },
    { id: 'kakashi', name: '案山子', cat: 'furniture', w: 1, h: 1, tags: ['farm'], cost: { wood: 10, herb: 5 }, unlock: 1, desc: '畑を見守るかかし。' },
    { id: 'mato', name: '的', cat: 'furniture', w: 1, h: 1, tags: ['training'], cost: { wood: 12, coin: 10 }, unlock: 1, desc: '手裏剣の練習用の的。' },
    { id: 'takibi', name: '焚き火', cat: 'furniture', w: 1, h: 1, tags: ['fire', 'light'], cost: { wood: 15 }, unlock: 1, desc: 'ぱちぱち燃える焚き火。' },
    { id: 'furin', name: '風鈴棚', cat: 'furniture', w: 1, h: 1, tags: ['sound'], cost: { wood: 10, coin: 25 }, unlock: 1, desc: '風が吹くと涼しい音が鳴る。' },
    { id: 'makimono', name: '巻物棚', cat: 'furniture', w: 1, h: 1, tags: ['books'], cost: { wood: 25, coin: 20 }, unlock: 1, desc: '術の巻物をしまう棚。' },
    { id: 'himono', name: '魚干し台', cat: 'furniture', w: 1, h: 1, tags: ['fish'], cost: { wood: 12, coin: 20 }, unlock: 1, desc: '干物がならぶ台。いい匂い。' },
    { id: 'chikurin', name: '竹やぶ', cat: 'garden', w: 1, h: 1, tags: ['tree'], cost: { coin: 20 }, unlock: 1, desc: 'さらさら鳴る竹のしげみ。' },
    { id: 'tobiishi', name: '飛び石', cat: 'garden', w: 1, h: 1, tags: ['path', 'rock'], cost: { coin: 8 }, unlock: 1, walkable: true, desc: '歩ける平たい石。道づくりに。' },
    { id: 'emakake', name: '絵馬掛け', cat: 'furniture', w: 1, h: 1, tags: ['paint', 'shrine'], cost: { wood: 15, coin: 30 }, unlock: 1, desc: '願いごとを書いた絵馬を掛ける。' },
    { id: 'torii', name: '鳥居', cat: 'garden', w: 2, h: 1, tags: ['shrine'], cost: { wood: 30, coin: 50 }, unlock: 2, walkable: true, desc: '赤い鳥居。くぐって通れる。里Lv2で解放。' },
    { id: 'dangoya', name: '団子屋台', cat: 'furniture', w: 2, h: 1, tags: ['sweets', 'tea'], cost: { wood: 30, coin: 40, herb: 10 }, unlock: 2, desc: '三色団子の屋台。里Lv2で解放。' },
    { id: 'kitsune', name: '狐の像', cat: 'garden', w: 1, h: 1, tags: ['shrine', 'fox'], cost: { coin: 50, seal: 1 }, unlock: 2, desc: '赤い前掛けの白狐。交流印が必要。' },
    { id: 'kajidai', name: '鍛冶台', cat: 'furniture', w: 1, h: 1, tags: ['craft', 'fire'], cost: { wood: 20, coin: 50 }, unlock: 2, desc: '金床と小さな炉。里Lv2で解放。' },
    { id: 'manekineko', name: '招き猫', cat: 'furniture', w: 1, h: 1, tags: ['lucky'], cost: { coin: 60, seal: 1 }, unlock: 3, desc: 'よい縁を招く猫。里Lv3で解放。' },
    { id: 'jizo', name: 'お地蔵さま', cat: 'garden', w: 1, h: 1, tags: ['shrine', 'rock'], cost: { coin: 45, seal: 1 }, unlock: 3, desc: '里を見守るお地蔵さま。里Lv3で解放。' },
    // 依頼・お題・親交のごほうび（店では作れない記念家具）
    { id: 'bonbori', name: 'ぼんぼり', cat: 'furniture', w: 1, h: 1, tags: ['light', 'flower'], cost: null, reward: true, desc: '依頼のお礼にもらった雪洞の灯り。' },
    { id: 'mosen', name: '花見の毛氈', cat: 'furniture', w: 2, h: 1, tags: ['flower', 'tea', 'rest'], cost: null, reward: true, desc: 'お題「花見の庭」のごほうび。' },
    { id: 'kinen', name: '記念の石碑', cat: 'garden', w: 1, h: 1, tags: ['rock', 'shrine'], cost: null, reward: true, desc: '住民との思い出を刻んだ石碑。' }
  ];
  var ITEM = {};
  ITEMS.forEach(function (it) { ITEM[it.id] = it; });

  var TAG_NAMES = { home: '住まい', farm: '畑', tea: 'お茶', rest: '休憩', storage: '倉庫', training: '修行', light: '灯り', night: '夜', rock: '石', fence: '垣根', tree: '木', flower: '花', water: '水辺', fish: '魚', sound: '音', path: '道', fire: '火', books: '書物', paint: '絵', shrine: 'お社', sweets: '甘味', fox: '狐', craft: '鍛冶', lucky: '縁起' };

  // ---- 依頼テンプレート（承認済み）。報酬は template_id からゲーム側が決める ----
  // need.kind: give（素材を納める）/ place（タグの物を新しく置く）/ act（行動の回数）/ near（ある物のそばに置く）
  var QUESTS = [
    { id: 'deliver_herb', title: '薬草のおすそわけ', need: { kind: 'give', res: 'herb', n: 5 }, reward: { coin: 30, seal: 1 }, req: { tags: ['farm'] }, loc: 'farm', text: '薬草を5個わけてほしいな。', weight: 5 },
    { id: 'deliver_wood', title: '木材あつめ', need: { kind: 'give', res: 'wood', n: 20 }, reward: { coin: 25 }, req: {}, loc: 'tree', text: '木材が20あると助かるんだ。', weight: 4 },
    { id: 'deliver_herb_big', title: 'たくさんの薬草', need: { kind: 'give', res: 'herb', n: 10 }, reward: { coin: 55, seal: 1 }, req: { level: 2, tags: ['farm'] }, loc: 'farm', text: '薬草を10個、たのめるかな。', weight: 3 },
    { id: 'place_light', title: '夜道の灯り', need: { kind: 'place', tag: 'light', n: 2 }, reward: { coin: 40, seal: 1 }, req: {}, loc: 'light', text: '夜の里を照らす灯りを2つ置いてほしいな。', weight: 3 },
    { id: 'place_flower', title: '花のある里', need: { kind: 'place', tag: 'flower', n: 2 }, reward: { coin: 40, herb: 5 }, req: {}, loc: 'flower', text: '花を2つ置いて、里を明るくしよう！', weight: 3 },
    { id: 'rest_spot', title: '水辺の休憩所', need: { kind: 'near', item: 'endai', tag: 'water', dist: 3 }, reward: { coin: 35, seal: 1 }, req: { tags: ['water'] }, loc: 'water', text: '水辺のそばに縁台を置いて、ひと休みしたいな。', weight: 3 },
    { id: 'water_training', title: '水辺の修行', need: { kind: 'act', act: 'train', n: 1, at: 'water' }, reward: { coin: 20, seal: 2 }, req: { tags: ['water'] }, loc: 'water', text: '水辺で修行してみたい。池のそばで修行しよう！', weight: 3 },
    { id: 'tea_party', title: '茶屋のお茶会', need: { kind: 'give', res: 'herb', n: 8 }, reward: { coin: 60, seal: 1 }, req: { tags: ['tea', 'farm'], item: 'chaya' }, loc: 'tea', text: '茶屋で薬草茶をいれたいの。薬草を8個ください。', weight: 3 },
    { id: 'training', title: '修行につきあって', need: { kind: 'act', act: 'train', n: 2 }, reward: { coin: 30, seal: 1 }, req: { item: 'shugyoba' }, loc: 'training', text: '修行場で2回、修行につきあってくれ！', weight: 3 },
    { id: 'build_bridge', title: '小橋をかける', need: { kind: 'place', item: 'kobashi', n: 1 }, reward: { coin: 80, seal: 2 }, req: { tags: ['water'] }, loc: 'water', text: '池に小橋をかけたら、きっときれいだよ。', weight: 2 },
    { id: 'photo', title: '里の記念写真', need: { kind: 'act', act: 'photo', n: 1 }, reward: { seal: 1, coin: 10 }, req: {}, loc: 'home', text: '里の写真を撮って、見せてほしいな。', weight: 2 },
    { id: 'visit_sample', title: '見本の里を見学', need: { kind: 'act', act: 'visit', n: 1 }, reward: { coin: 20 }, req: {}, loc: 'path', text: '見本の里を見てきて、話を聞かせて！', weight: 2 },
    { id: 'harvest_twice', title: '畑しごと', need: { kind: 'act', act: 'harvest', n: 2 }, reward: { coin: 30, wood: 10 }, req: { tags: ['farm'] }, loc: 'farm', text: '畑で2回、収穫してみよう。', weight: 3 },
    { id: 'gather_wood', title: '竹やぶの手入れ', need: { kind: 'act', act: 'gather', n: 3 }, reward: { coin: 25, herb: 5 }, req: {}, loc: 'tree', text: '里のまわりの竹やぶで、3回採集してきて。', weight: 3 },
    { id: 'night_path', title: '灯りの小道', need: { kind: 'place', tag: 'light', n: 3 }, reward: { coin: 50, item: 'bonbori' }, req: { level: 2 }, loc: 'light', text: '灯りを3つ置いて、灯りの小道をつくろう。', weight: 2 }
  ];
  var QUEST = {};
  QUESTS.forEach(function (q) { QUEST[q.id] = q; });

  // 依頼係が「里の変化」を理由に使う文（承認済みの言い回し）。{name} は住民名
  var REASONS = {
    new_water_area: { tags: ['water'], text: '池ができたね！', label: '水辺ができた' },
    new_light: { tags: ['light'], text: '灯りがふえて、夜の里がきれい！', label: '灯りがふえた' },
    new_flower: { tags: ['flower'], text: '花が咲いて、里が明るくなったね。', label: '花がふえた' },
    new_tea: { tags: ['tea'], text: '茶屋ができたね！', label: '茶屋ができた' },
    new_training: { tags: ['training'], text: '修行場ができた！', label: '修行場ができた' },
    new_farm: { tags: ['farm'], text: '畑がふえたね。', label: '畑がふえた' },
    new_shrine: { tags: ['shrine'], text: 'お社ができて、空気が澄んだ気がする。', label: 'お社ができた' },
    new_tree: { tags: ['tree'], text: '木がふえて、いい木陰ができたね。', label: '木がふえた' },
    new_rest: { tags: ['rest'], text: '休める場所ができたね。', label: '休憩所ができた' },
    quest_done: { tags: [], text: 'この前はありがとう！', label: '前の依頼のつづき' }
  };


  // ---- 里レベル（課題達成で上げる。所持金では上げない）----
  var LEVELS = [
    null,
    { lv: 1, name: '見習いの里', unlock: '畑', tasks: [
      { id: 'koya', label: '小屋を置く', check: 'item', item: 'koya', n: 1 },
      { id: 'hatake', label: '畑を置く', check: 'item', item: 'hatake', n: 1 },
      { id: 'quests3', label: '依頼を3件おえる', check: 'stat', stat: 'questsDone', n: 3 },
      { id: 'deco5', label: '家具や庭の物を5個置く', check: 'deco', n: 5 },
      { id: 'talk2', label: '住民と2回話す', check: 'stat', stat: 'talks', n: 2 }
    ], reward: { coin: 60, seal: 1 } },
    { lv: 2, name: '修行の里', unlock: '修行場・鳥居・屋台・狐の像・鍛冶台／敷地を16×16に広げられる', tasks: [
      { id: 'shugyoba', label: '修行場を置く', check: 'item', item: 'shugyoba', n: 1 },
      { id: 'train3', label: '修行を3回する', check: 'stat', stat: 'trainings', n: 3 },
      { id: 'quests8', label: '依頼を合計8件おえる', check: 'stat', stat: 'questsDone', n: 8 },
      { id: 'resident4', label: '住民を4人にする', check: 'residents', n: 4 },
      { id: 'photo1', label: '里の写真を撮る', check: 'stat', stat: 'photos', n: 1 },
      { id: 'deco12', label: '家具や庭の物を12個置く', check: 'deco', n: 12 }
    ], reward: { coin: 120, seal: 2 } },
    { lv: 3, name: 'にぎわいの里', unlock: '訪問（友だちの里）・招き猫・お地蔵さま／敷地を20×20に広げられる', tasks: [], reward: null },
    { lv: 4, name: '（準備中）', unlock: '派遣', tasks: [], future: true },
    { lv: 5, name: '（準備中）', unlock: 'テーマ収集帳', tasks: [], future: true }
  ];
  var MAX_LEVEL = 3; // 試作の上限は Lv3

  // 住民の定員（里レベル＋小屋のレベル）
  function residentCap(level, koyaLv) { return [0, 4, 6, 9][level] + Math.max(0, (koyaLv || 1) - 1); }

  // ---- 週のお題（手持ちの素材でも完成できるもの。季節品は再登場する）----
  var THEMES = [
    { id: 'mizube', name: '水辺の休憩所', need: [{ tag: 'water', n: 1 }, { item: 'endai', n: 1 }, { tag: 'light', n: 1 }], reward: { seal: 2, coin: 40 }, hint: '池・縁台・灯りを近くにまとめよう' },
    { id: 'hanami', name: '花見の庭', need: [{ item: 'sakura', n: 1 }, { tag: 'flower', n: 3 }, { tag: 'rest', n: 1 }], reward: { seal: 2, item: 'mosen' }, hint: '桜と花のそばに、休める場所を' },
    { id: 'akari', name: '灯りの小道', need: [{ tag: 'light', n: 4 }, { item: 'tobiishi', n: 3 }], reward: { seal: 2, coin: 50 }, hint: '飛び石の道を灯りで照らそう' },
    { id: 'shugyo', name: '修行の広場', need: [{ tag: 'training', n: 2 }, { item: 'takegaki', n: 3 }], reward: { seal: 2, coin: 50 }, hint: '的や修行場を竹垣でかこもう' }
  ];

  // ---- 店（里コインだけ。お金を使う買い物はない）----
  var SHOP = [
    { id: 'outfit_yukata', kind: 'outfit', name: '夏の浴衣', price: { coin: 150 }, outfit: { top: '#3a6ea5', trim: '#f4f1ea', band: '#f4f1ea', obi: '#e8a33a', pattern: { kind: 'dots', color: '#f4f1ea', r: 2 } }, desc: '外見だけ。能力は変わらない。' },
    { id: 'outfit_kuro', kind: 'outfit', name: '影の装束', price: { coin: 120 }, outfit: { top: '#2a2a30', trim: '#1a1a1e', band: '#6a6d75', obi: '#6a6d75' }, desc: '修行を5回するともらえる（買うこともできる）。', training: 5 },
    { id: 'outfit_sakura', kind: 'outfit', name: '桜の装束', price: { coin: 180 }, outfit: { top: '#f2a9c0', trim: '#c85a7a', band: '#c85a7a', obi: '#f7f1e5', pattern: { kind: 'sakura', color: '#ffffff', r: 4 } }, desc: '春の季節衣装（再登場あり）。' },
    { id: 'theme_kusa', kind: 'theme', name: '草屋根の外観', price: { coin: 0 }, theme: 'kusa', desc: '建物の屋根が草ぶきになる。生産性能は共通。' },
    { id: 'theme_yozakura', kind: 'theme', name: '夜桜の外観', price: { coin: 260 }, theme: 'yozakura', desc: '屋根と壁が夜桜の色に。生産性能は共通。' },
    { id: 'theme_yuki', kind: 'theme', name: '雪里の外観', price: { coin: 260 }, theme: 'yuki', desc: '屋根に雪が積もる。生産性能は共通。' },
    { id: 'set_hajime', kind: 'set', name: 'はじめての里セット', price: { coin: 220 }, items: { chochin: 2, endai: 1, kadan: 2, niwaishi: 1, matsu: 1, takegaki: 1 }, desc: '家具8点。性能は共通。' },
    { id: 'frame_sakura', kind: 'frame', name: '桜の額縁', price: { coin: 60 }, frame: 'sakura', desc: '写真の額縁。' },
    { id: 'frame_tsuki', kind: 'frame', name: '月夜の額縁', price: { coin: 60 }, frame: 'tsuki', desc: '写真の額縁。' }
  ];

  // ---- 見本の里（運営見本・閲覧のみ）----
  var SAMPLES = [
    { id: 'sample_mizube', name: '水辺の里（見本）', level: 3, size: 16, theme: 'standard', residents: ['sattva', 'seori', 'magoichi', 'benten', 'shiba', 'nekomata'],
      note: '池と小橋を中心に、休憩所をつくった見本。',
      objs: [['koya', 3, 3, 0], ['hatake', 3, 7, 0], ['hatake', 3, 10, 0], ['souko', 6, 3, 0], ['chaya', 10, 3, 1], ['koike', 9, 8, 0], ['koike', 11, 8, 0], ['kobashi', 11, 10, 0], ['endai', 8, 11, 1], ['endai', 13, 11, 1], ['shishiodoshi', 8, 7, 0], ['ido', 7, 9, 0], ['ishidoro', 13, 7, 0], ['ishidoro', 8, 12, 0], ['chochin', 10, 6, 0], ['chochin', 12, 6, 0], ['sakura', 14, 9, 0], ['matsu', 14, 13, 0], ['kadan', 6, 11, 0], ['kadan', 6, 12, 0], ['himono', 10, 12, 0], ['takegaki', 2, 13, 0], ['takegaki', 3, 13, 0], ['takegaki', 4, 13, 0], ['tobiishi', 5, 8, 0], ['tobiishi', 6, 8, 0], ['tobiishi', 7, 8, 0], ['furin', 12, 3, 0]] },
    { id: 'sample_hanami', name: '花見の里（見本）', level: 3, size: 16, theme: 'yozakura', residents: ['sakuya', 'shion', 'anne', 'oto', 'torika', 'yui'],
      note: '桜並木と団子屋台で、花見の庭をつくった見本。',
      objs: [['koya', 3, 3, 0], ['hatake', 3, 7, 0], ['chaya', 6, 3, 0], ['sakura', 9, 4, 0], ['sakura', 11, 4, 0], ['sakura', 13, 4, 0], ['sakura', 9, 8, 0], ['sakura', 13, 8, 0], ['mosen', 10, 6, 0], ['dangoya', 11, 10, 0], ['kadan', 8, 10, 0], ['kadan', 9, 10, 0], ['kadan', 10, 12, 0], ['kadan', 13, 12, 0], ['chochin', 8, 6, 0], ['chochin', 14, 6, 0], ['bonbori', 8, 12, 0], ['bonbori', 14, 12, 0], ['endai', 11, 13, 0], ['emakake', 6, 7, 0], ['torii', 5, 11, 1], ['tobiishi', 5, 13, 0], ['tobiishi', 6, 14, 0], ['niwaishi', 14, 14, 0], ['makimono', 3, 10, 0]] },
    { id: 'sample_shugyo', name: '修行の里（見本）', level: 3, size: 16, theme: 'kusa', residents: ['konga', 'sekishusai', 'karma', 'hayate', 'dan', 'jin'],
      note: '修行場を竹垣でかこみ、的をならべた見本。',
      objs: [['koya', 3, 3, 0], ['hatake', 3, 7, 0], ['souko', 6, 3, 0], ['shugyoba', 9, 7, 0], ['mato', 13, 7, 0], ['mato', 13, 9, 0], ['mato', 8, 11, 0], ['takegaki', 8, 6, 0], ['takegaki', 9, 6, 0], ['takegaki', 10, 6, 0], ['takegaki', 11, 6, 0], ['takegaki', 12, 6, 0], ['takibi', 11, 11, 0], ['matsu', 14, 4, 0], ['matsu', 14, 12, 0], ['ishidoro', 7, 12, 0], ['ishidoro', 12, 12, 0], ['kajidai', 10, 3, 0], ['niwaishi', 3, 12, 0], ['niwaishi', 4, 13, 0], ['chikurin', 13, 3, 0], ['chikurin', 12, 3, 0], ['endai', 9, 13, 0], ['ido', 6, 7, 0]] }
  ];

  var FRAMES = [{ id: 'basic', name: '基本の額縁' }, { id: 'sakura', name: '桜の額縁' }, { id: 'tsuki', name: '月夜の額縁' }];
  var THEME_NAMES = { standard: '標準和風', kusa: '草屋根', yozakura: '夜桜', yuki: '雪里' };

  var api = { BAL: BAL, ITEMS: ITEMS, ITEM: ITEM, TAG_NAMES: TAG_NAMES, QUESTS: QUESTS, QUEST: QUEST, REASONS: REASONS, LEVELS: LEVELS, MAX_LEVEL: MAX_LEVEL, residentCap: residentCap, THEMES: THEMES, SHOP: SHOP, SAMPLES: SAMPLES, FRAMES: FRAMES, THEME_NAMES: THEME_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NSL_DATA = api;
})(typeof window !== 'undefined' ? window : globalThis);
