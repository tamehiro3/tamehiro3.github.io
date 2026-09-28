/* ニンジャ相棒道場 — 数値と中身（試作用の仮設定。設計書 ③ の数値に合わせる）
 * 画面にもルールにも依存しない。policy.js / sim.js / ui.js から読む。
 */
(function (root) {
  'use strict';

  // ---- 数値 ----
  var BAL = {
    hp: { player: 100, partner: 100 },
    exp: { success: 30, fail: 15, tutorial: 60 },          // 成功30・失敗15（失敗でも一部）。最初の修行は60でLv2へ
    levels: [0, 60, 130, 210, 300, 400, 510, 630, 760, 900], // Lv1〜10 に必要な累計経験（Lv2まで60、以後ゆるやかに増える）
    tokens: [0, 20, 25, 30],                               // ★の数ごとの道場札（通常修行で20〜30）
    teachCap: 10,                                          // 1回の指導で変わる各軸は最大±10
    maxRules: 3,                                           // 明示的な作戦は3枠まで
    maxSlots: 3,                                           // 作戦プリセットは3枠まで
    rescueSec: 3,                                          // 近づいて3秒で助け起こす
    searchSec: 1.2,                                        // 宝箱・草むらを調べる時間
    revealHp: 50,                                          // 助け起こされたときの体力
    wordsPerDay: 5,                                        // 言葉で教える（AI接続先あり）の1日の上限
    diaryAiPerDay: 1,                                      // AIの日記は1日1回
    aiTimeoutMs: 8000,                                     // 8秒で定型の選択肢へ切りかえ
    lessonsKeep: 240,                                      // 保存しておく判断の記録の数
    backupDays: 7                                          // 引き継ぎで選ばなかった記録を残す日数
  };

  // ---- 方針の3軸（性格の診断ではなく、ゲーム上の方針）----
  var AXES = [
    { id: 'support', name: '支援優先', icon: '🤝', act: 'rescue', hi: '仲間が困っていると、先に助けに行きやすい', lo: '仲間のことは、見習いにまかせがち' },
    { id: 'explore', name: '探索優先', icon: '🔍', act: 'search', hi: '宝箱や草むらを見つけると、調べに行きやすい', lo: 'わき道には、あまり寄り道しない' },
    { id: 'caution', name: '慎重さ', icon: '🛡️', act: 'retreat', hi: '危ない場所をさけ、あぶないと下がる', lo: '危なくても、まっすぐ向かう' }
  ];
  var AXIS_IDS = ['support', 'explore', 'caution'];
  var INITIAL_AXES = { support: 40, explore: 55, caution: 45 };

  // ---- 行動の5候補 ----
  var ACTIONS = {
    follow: { name: '追従', verb: 'ついていく', icon: '👣' },
    attack: { name: '攻撃', verb: 'からくりを止める', icon: '👊' },
    rescue: { name: '救助', verb: '助け起こす', icon: '🤝' },
    search: { name: '調査', verb: '調べる', icon: '🔍' },
    retreat: { name: '退避', verb: '下がる', icon: '🛡️' }
  };

  // ---- 明示的な作戦（数値の学習より優先する）----
  // unlock: その作戦を選べるようになる時期
  var RULES = {
    ally_first: { name: '仲間を優先', icon: '🤝', act: 'rescue', short: '仲間が困っていたら、宝箱より先に助ける', unlock: 'ch1' },
    stay_close: { name: 'そばにいる', icon: '👣', act: 'follow', short: '見習いから5マスより遠くへは行かない', unlock: 'ch1' },
    safety_first: { name: '安全を優先', icon: '🛡️', act: 'retreat', short: 'まきびしや煙の中には入らない。体力が半分を切ったら下がる', unlock: 'ch2' },
    explore_first: { name: '探索を優先', icon: '🔍', act: 'search', short: 'からくりが近くにいなければ、先に調べる', unlock: 'ch3' },
    attack_first: { name: '敵を先に', icon: '👊', act: 'attack', short: 'からくりが来たら、先に止めにいく', unlock: 'ch3' },
    guard_escort: { name: '護衛を守る', icon: '🏮', act: 'follow', short: '護衛役のそばにいて、近づくからくりを止める', unlock: 'ch4' }
  };
  var RULE_IDS = ['ally_first', 'stay_close', 'safety_first', 'explore_first', 'attack_first', 'guard_escort'];

  // ---- 振り返りで選ぶ指導（1回で各軸は最大±10）----
  // keep: この行動を続ける（ほめる）  next_x: 次は〜  safety: 安全を優先
  var TEACH = {
    keep: { label: 'この行動を続ける', praise: true },
    next_rescue: { label: '次は救助', act: 'rescue', changes: { support: 10, explore: -10 }, rule: 'ally_first' },
    next_search: { label: '次は調べる', act: 'search', changes: { explore: 10, support: -10 }, rule: 'explore_first' },
    next_attack: { label: '次はからくりを止める', act: 'attack', changes: { caution: -10 }, rule: 'attack_first' },
    next_follow: { label: '次はそばにいる', act: 'follow', changes: { caution: 5, explore: -5 }, rule: 'stay_close' },
    safety: { label: '安全を優先', act: 'retreat', changes: { caution: 10 }, rule: 'safety_first' }
  };
  // 「この行動を続ける」で少しだけ強める軸
  var KEEP_CHANGES = { rescue: { support: 5 }, search: { explore: 5 }, retreat: { caution: 5 }, attack: { caution: -5 }, follow: {} };

  // ---- 作戦プリセット（物語で増える。最大3枠）----
  var PRESET_TEMPLATES = {
    main: { name: 'いつもの', axes: null, rules: [] },
    rescue: { name: '救助型', axes: { support: 70, explore: 30, caution: 50 }, rules: ['ally_first'] },
    explore: { name: '探索型', axes: { support: 35, explore: 75, caution: 45 }, rules: ['explore_first'] },
    escort: { name: '護衛型', axes: { support: 55, explore: 25, caution: 60 }, rules: ['guard_escort'] }
  };

  // ---- 修行（初期は3種。道場は1つを配置替えして使う）----
  var TRAININGS = {
    rescue: { name: '救助修行', icon: '🤝', goal: 'へとへとの仲間を、全員助け起こす', star2: 'どの仲間も、あきらめる前に早めに助けた', pool: ['chest_ally', 'makibishi', 'chased', 'two_allies', 'smoke'], arena: 'boss', key: 'rescue' },
    explore: { name: '探索修行', icon: '🔍', goal: 'かくされた巻物を3つ見つける', star2: 'かくされた巻物を、ぜんぶ見つけた', pool: ['guarded_grass', 'smoke', 'chest_ally', 'crowd', 'makibishi'], arena: 'wave', key: 'search', scrolls: 4, need: 3 },
    escort: { name: '護衛修行', icon: '🏮', goal: '護衛役を、門まで無事に届ける', star2: '護衛役の安心を半分以上のこして着いた', pool: ['escort_side', 'crowd', 'guarded_grass', 'escort_side'], arena: 'gate', key: 'protect' }
  };
  var STAR3 = '見習いも相棒も、いちどもへとへとにならなかった';

  // ---- 判断場面（1つの道場を配置替えして使う）----
  var SCENES = {
    intro: { name: 'はじめての道', note: '歩き方と指示をためす' },
    chest_ally: { name: '宝箱と、へとへとの仲間', note: '救助と調査のどちらを先にするか' },
    makibishi: { name: 'まきびしの向こう', note: '危ない近道か、安全な回り道か' },
    chased: { name: 'ねらわれた仲間', note: '仲間に近づくからくりを止めるか、先に助けるか' },
    two_allies: { name: 'ふたりの仲間', note: 'どちらの仲間を先に助けるか' },
    smoke: { name: 'けむりの中の宝', note: '煙の中まで調べに行くか' },
    guarded_grass: { name: 'からくりと草むら', note: 'からくりを止めるか、草むらを調べるか' },
    crowd: { name: 'からくりの群れ', note: '向かっていくか、下がるか' },
    escort_side: { name: '横から来るからくり', note: '護衛役のそばを守るか' },
    // 最後の場所
    boss: { name: 'からくり小将', note: '相棒と力を合わせて止める' },
    wave: { name: 'からくりの波', note: '2回にわけて来るからくりを止める' },
    gate: { name: '門の前', note: '護衛役を門まで送りとどける' },
    final: { name: '大からくり', note: '師匠の試験の最後' }
  };

  // ---- 敵（修行用のからくり。止まると木のパーツにもどる）----
  var ENEMIES = {
    karakuri: { name: 'からくり木人', hp: 48, speed: 1.35, reach: 1.0, dmg: 10, windup: 0.5, cool: 1.3, r: 0.38 },
    archer: { name: 'からくり弓', hp: 34, speed: 1.1, reach: 4.6, dmg: 8, windup: 0.8, cool: 2.2, r: 0.36, ranged: true, keep: 3.6 },
    shosho: { name: 'からくり小将', hp: 220, speed: 0.95, reach: 1.25, dmg: 14, windup: 0.65, cool: 1.6, r: 0.6, boss: true, slam: { every: 5.5, r: 2.1, tele: 1.0, dmg: 22 }, calls: 2 },
    mini: { name: 'からくり小将（練習）', hp: 110, speed: 0.85, reach: 1.2, dmg: 10, windup: 0.8, cool: 2.0, r: 0.58, boss: true, slam: { every: 6.5, r: 1.9, tele: 1.3, dmg: 14 }, calls: 0 },
    daikarakuri: { name: '大からくり', hp: 280, speed: 0.9, reach: 1.4, dmg: 14, windup: 0.75, cool: 1.7, r: 0.75, boss: true, slam: { every: 5.6, r: 2.4, tele: 1.1, dmg: 20 }, calls: 2 }
  };
  var HAZARDS = {
    makibishi: { name: 'まきびし', dps: 8, slow: 0.6 },
    smoke: { name: '煙玉の霧', dps: 6, slow: 0.85 }
  };

  // ---- 物語（5章）。修行の中身は sim.js、会話は story.js ----
  // need: 始められる相棒Lv  training: 章の修行  unlock: 章を終えるとできるようになること
  var CHAPTERS = [
    { id: 'ch1', num: 1, title: '出会い', master: 'hayate', need: 1, training: { kind: 'tutorial', zones: ['intro', 'chest_ally', 'chest_ally', 'boss'] }, unlock: { rules: ['ally_first', 'stay_close'], kinds: ['rescue', 'explore', 'escort'] } },
    { id: 'ch2', num: 2, title: '初めての失敗', master: 'konga', need: 2, training: { kind: 'rescue', zones: ['chest_ally', 'makibishi', 'two_allies', 'boss'] }, unlock: { rules: ['safety_first'] } },
    { id: 'ch3', num: 3, title: '方針の違い', master: 'magoichi', master2: 'benten', need: 3, training: { kind: 'explore', zones: ['guarded_grass', 'smoke', 'chest_ally', 'wave'] }, unlock: { rules: ['explore_first', 'attack_first'], slots: ['explore'] } },
    { id: 'ch4', num: 4, title: '協力', master: 'rei', guest: 'yui', need: 4, training: { kind: 'escort', zones: ['escort_side', 'crowd', 'escort_side', 'gate'] }, unlock: { rules: ['guard_escort'], slots: ['escort'] } },
    { id: 'ch5', num: 5, title: '師匠の試験', master: 'hayate', need: 5, training: { kind: 'exam', stages: [{ kind: 'rescue', zones: ['two_allies'] }, { kind: 'explore', zones: ['guarded_grass'] }, { kind: 'escort', zones: ['escort_side', 'final'] }] }, unlock: {} }
  ];

  // ---- Lv の効果（強さではなく、新しい課題と演出）----
  var LEVEL_UNLOCKS = {
    2: '第2章「初めての失敗」',
    3: '第3章「方針の違い」',
    4: '第4章「協力」',
    5: '第5章「師匠の試験」',
    6: '上級の修行（からくりが少し手ごわくなる）',
    7: '登場ポーズ「印を結ぶ」',
    8: '写真の額「金の縁」',
    9: '登場ポーズ「わーい」',
    10: '写真の額「免許皆伝」'
  };

  // ---- 道場札で交換できる物（見た目だけ。絆・判断の性能は変わらない）----
  // slot: costume（衣装）/ weapon（装備の外装）/ wall・floor・deco（道場）/ pose（登場ポーズ）
  var SHOP = [
    { id: 'c_sakura', slot: 'costume', name: '桜柄の装束', price: 100, patch: { pattern: { kind: 'sakura', color: '#f7b8cc' } } },
    { id: 'c_momiji', slot: 'costume', name: '紅葉柄の装束', price: 100, patch: { pattern: { kind: 'maple', color: '#e0703a' } } },
    { id: 'c_mizutama', slot: 'costume', name: '水玉の装束', price: 100, patch: { pattern: { kind: 'dots', color: '#f4efe4', r: 2.4 } } },
    { id: 'c_shima', slot: 'costume', name: 'しま柄の装束', price: 100, patch: { pattern: { kind: 'stripes', color: '#f4efe4' } } },
    { id: 'c_ougi', slot: 'costume', name: '扇柄の装束', price: 120, patch: { pattern: { kind: 'fans', color: '#e8c56b' } } },
    { id: 'c_chou', slot: 'costume', name: '蝶柄の装束', price: 120, patch: { pattern: { kind: 'butterfly', color: '#f4efe4' } } },
    { id: 'w_shiraki', slot: 'weapon', name: '白木の木刀', price: 60, patch: { saya: '#e8d8b0', hilt: '#b99a6a', guard: '#8a6a3a', tip: '#c9aa7a' } },
    { id: 'w_kuro', slot: 'weapon', name: '黒塗りの木刀', price: 80, patch: { saya: '#2a2226', hilt: '#1a1618', guard: '#c9a24a', tip: '#c9a24a' } },
    { id: 'w_shu', slot: 'weapon', name: '朱塗りの木刀', price: 80, patch: { saya: '#c8452c', hilt: '#3a2a22', guard: '#e8c56b', tip: '#e8c56b' } },
    { id: 'wall_isshin', slot: 'wall', name: '掛け軸「一心」', price: 60, text: '一心' },
    { id: 'wall_kyoryoku', slot: 'wall', name: '掛け軸「協力」', price: 60, text: '協力' },
    { id: 'wall_tankyu', slot: 'wall', name: '掛け軸「探求」', price: 60, text: '探求' },
    { id: 'floor_tatami', slot: 'floor', name: '青畳', price: 80, color: '#b9c97a' },
    { id: 'floor_ita', slot: 'floor', name: '板の間', price: 80, color: '#c99a62' },
    { id: 'deco_bonsai', slot: 'deco', name: '盆栽', price: 70 },
    { id: 'deco_taiko', slot: 'deco', name: '太鼓', price: 90 },
    { id: 'deco_mokujin', slot: 'deco', name: '稽古用の木人', price: 90 },
    { id: 'deco_chochin', slot: 'deco', name: '提灯', price: 70 },
    { id: 'pose_wave', slot: 'pose', name: '登場ポーズ「手をふる」', price: 40, pose: 'wave' },
    { id: 'pose_seal', slot: 'pose', name: '登場ポーズ「印を結ぶ」', price: 40, pose: 'seal', level: 7 },
    { id: 'pose_cheer', slot: 'pose', name: '登場ポーズ「わーい」', price: 40, pose: 'cheer', level: 9 }
  ];

  // ---- 相棒のセリフ（{I}=一人称、{E}=名詞のあとの語尾、{V}=動詞のあとの語尾）。方針の傾向で変わる ----
  var PARTNER_TALK = {
    hello: ['よろしくね！ {I}、がんばる{V}！'],
    support: ['困っている人がいたら、{I}が先に行く{V}！', 'みんなで帰るのが、いちばんの修行{E}。'],
    explore: ['あっちの草むら、気になる{V}！', '宝箱を見ると、つい調べたくなる{V}〜。'],
    caution: ['あぶないところは、よく見てから{E}。', 'まきびしは、よけて通る{V}。'],
    bold: ['からくりなんて、こわくない{V}！', 'まっすぐ行くのが近道{E}！'],
    close: ['{I}は、きみのそばをはなれない{V}。'],
    tired: ['ふう、へとへと{E}……', 'ちょっと休ませて〜'],
    saved: ['ありがとう！ 助かった{V}！', 'たすかった〜！ まだいける{V}！'],
    praised: ['えへへ、うれしい{V}！', 'よーし、次もこうする{V}！'],
    taught: ['わかった、次はそうしてみる{V}！', 'おぼえた{V}！ 次の修行で見ててね。'],
    undo: ['前のやり方にもどす{V}。', 'うん、前のほうがよかったかも。'],
    idle: ['道場のにおい、好き{E}。', '次はどの修行にする？', 'きみといると、修行が楽しい{V}！']
  };

  // ---- 言葉で教える（試験機能）で受け取れる意図 ----
  var INTENTS = {
    prioritize_rescue: { label: '仲間の救助を先にする', changes: { support: 10, explore: -10 }, rule: 'ally_first' },
    prioritize_search: { label: '宝箱や草むらを先に調べる', changes: { explore: 10, support: -10 }, rule: 'explore_first' },
    be_careful: { label: '危ない場所をさけて、慎重に進む', changes: { caution: 10 }, rule: 'safety_first' },
    be_bold: { label: 'からくりを先に止めに行く', changes: { caution: -10 }, rule: 'attack_first' },
    stay_close: { label: '見習いのそばをはなれない', changes: { caution: 5, explore: -5 }, rule: 'stay_close' },
    guard_escort: { label: '護衛役のそばを守る', changes: { support: 5 }, rule: 'guard_escort' },
    keep_going: { label: '今のやり方を続ける', changes: {}, rule: null }
  };

  var api = {
    BAL: BAL, AXES: AXES, AXIS_IDS: AXIS_IDS, INITIAL_AXES: INITIAL_AXES, ACTIONS: ACTIONS, RULES: RULES, RULE_IDS: RULE_IDS,
    TEACH: TEACH, KEEP_CHANGES: KEEP_CHANGES, PRESET_TEMPLATES: PRESET_TEMPLATES, TRAININGS: TRAININGS, STAR3: STAR3, SCENES: SCENES,
    ENEMIES: ENEMIES, HAZARDS: HAZARDS, CHAPTERS: CHAPTERS, LEVEL_UNLOCKS: LEVEL_UNLOCKS, SHOP: SHOP, PARTNER_TALK: PARTNER_TALK, INTENTS: INTENTS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NAD_DATA = api;
})(typeof window !== 'undefined' ? window : globalThis);
