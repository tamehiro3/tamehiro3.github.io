/* ニンジャ夜明け隊 — 数値と中身（設計書 v1.0 の試作値）
 * 設計書の「ゲーム側の表で確定する」値（敵予算・報酬・配置できる地点など）は、すべてこのファイルにある。
 * 任務監督（director.js）は、ここにある ID を選ぶだけで、新しい数値やルールは作らない。
 * CryptoNinja（CC0・Ninja DAO）の非公式ファンゲーム。役割・忍術・敵はゲーム独自の設定で、公式キャラクターの能力ではない。
 */
(function (root) {
  'use strict';

  var RULES_VERSION = 'nyt-1';

  // ---- 基本値（§4.1 の試作値）----
  var BAL = {
    hp: 100, barrierHp: 1000,
    atk: 10, atkInterval: 0.7, atkRange: 64, atkArc: 110,
    dodgeCd: 4, dodgeTime: 0.2, dodgeDist: 130, dodgeInv: 0.32,
    speed: 170, crawl: 42, radius: 15,
    regenDelay: 5, regenRate: 3,               // 5秒被弾しないと、1秒に3ずつ回復
    rescueTime: 3, rescueRange: 46, rescuePause: 0.6, reviveRate: 0.4,
    allDownGrace: 5, graceReviveRate: 0.3,     // 全員ダウン → 5秒の救済時間（結界にたどり着けば起き上がれる。1人1回）
    materialsStart: 6, gatherInterval: 1.0, gatherStock: 6, gatherRadius: 58,
    repairPer: 30, repairInterval: 0.3, repairRange: 104,
    supplyRange: 62, supplyCd: 3,
    trapRange: 44,
    lowBarrierSupport: 0.35,                   // 結界がこの割合を下回ったら、節目の支援が早めに来る（1試合1回）
    scaleHp: 0.45, scaleCount: 0.20,           // 敵HP＝基準×(1+0.45×(n−1))、敵数＝基準×(1+0.20×(n−1))
    slotHold: 60,                              // 切断者の枠を保つ秒数
    comboMul: 2,
    idleMove: 400, idleActions: 5              // 報酬の放置判定（1試合を通して、移動・行動がこれ未満なら放置）
  };

  // ---- 1試合の流れ（スマホ初期版：1人＋NPC2人・約6分）。MatchState は Lobby→Preparation→Wave→Intermission→Boss→Result ----
  var PHASES = [
    { id: 'prep1', state: 'Preparation', name: '準備', dur: 60, hint: '素材を集めて、罠を置こう。赤い矢印が妖怪の来る道' },
    { id: 'wave1', state: 'Wave', name: '襲撃 1', dur: 75, wave: 'w1', hint: '2本の道から、ころ玉が来る' },
    { id: 'prep2', state: 'Intermission', name: '準備', dur: 40, pick: true, hint: '結界の修理と、忍術の強化を選ぼう' },
    { id: 'wave2', state: 'Wave', name: '襲撃 2', dur: 80, wave: 'w2', hint: 'からかさは背中が弱点。ふだ狸は音と赤い予告に注意' },
    { id: 'prep3', state: 'Intermission', name: '最終準備', dur: 30, pick: true, hint: '補給と罠の置き直し。夜明けは近い' },
    { id: 'boss', state: 'Boss', name: '夜明け前', dur: 90, wave: 'boss', hint: '大だるまの予告には安全地帯がある。夜明けまで守りきれば勝ち' }
  ];
  var LOADOUT_SEC = 45, RESULT_SEC = 30;
  // Roblox 版の時間（参考。ブラウザ版では使わない）
  var ROBLOX_PHASES = { loadout: 45, prep1: 90, wave1: 120, prep2: 60, wave2: 120, prep3: 45, boss: 120, result: 30 };

  // ---- 役割（§4.2）----
  var ROLES = {
    vanguard: {
      id: 'vanguard', name: '先陣', purpose: '攻撃', color: '#d8553a', good: '近〜中距離の攻撃', weak: 'ひとりだと囲まれやすい',
      special: { id: 'issen', name: '一閃', cd: 8, dmg: 30, len: 210, width: 26, time: 0.18, desc: '前へ駆けぬけ、線の上の敵に30' },
      passive: '移動が少し速い', speedMul: 1.08
    },
    guard: {
      id: 'guard', name: '結界', purpose: '防衛', color: '#4a7fd0', good: '通路の防衛', weak: '火力が低い',
      special: { id: 'dome', name: '護りの結界', cd: 20, hp: 120, dur: 8, r: 72, range: 170, desc: '盾HP120の結界を8秒。中の味方は外からの攻撃を受けない' },
      passive: '罠の素材が1少ない', trapDiscount: 1
    },
    medic: {
      id: 'medic', name: '救援', purpose: '支援', color: '#3fa56a', good: '回復・救助', weak: '回復中にねらわれやすい',
      special: { id: 'ring', name: '癒しの輪', cd: 15, heal: 25, r: 120, cast: 0.45, mend: 40, mendRange: 170, desc: 'まわりの味方を25回復（0.45秒その場で集中）。結界の近くなら結界も40直す' },
      passive: '救助が2秒で終わる', rescueTime: 2
    }
  };
  var ROLE_IDS = ['vanguard', 'guard', 'medic'];

  // ---- 忍術（§4.3）。名前はゲーム独自の技。variant は修行札で解放する「別の選択肢」（強さは同じくらい）----
  var JUTSU = {
    fire: { id: 'fire', name: '炎の輪', purpose: '攻撃', tag: 'aoe', cd: 9, range: 200, r: 78, dmg: 22, delay: 0.35, color: '#ff7a2a', desc: 'ねらった場所で炎がはじける（範囲攻撃）', variant: 'fireline' },
    fireline: { id: 'fireline', base: 'fire', name: '炎の道', purpose: '攻撃', tag: 'aoe', cd: 9, len: 230, width: 50, dmg: 16, burn: 2, burnDps: 6, delay: 0.25, color: '#ff7a2a', desc: 'まっすぐ炎の道。当たった敵は2秒燃える（範囲攻撃）' },
    water: { id: 'water', name: '水の檻', purpose: '防衛', tag: 'bind', cd: 12, range: 210, r: 84, bind: 2.6, color: '#3aa8e8', desc: '泡で敵を2.6秒足止め（大だるまは遅くなる）', variant: 'mist' },
    mist: { id: 'mist', base: 'water', name: '霧の檻', purpose: '防衛', tag: 'bind', cd: 12, range: 210, r: 125, slow: 0.55, dur: 4, color: '#8fc8e8', desc: '広い霧で4秒、敵をとても遅くする（足止め）' },
    wind: { id: 'wind', name: 'つむじ風', purpose: '支援', tag: 'lure', cd: 10, len: 170, arc: 80, push: 150, dmg: 6, lure: 1.5, color: '#9fe0c0', desc: '前の敵をふき飛ばす。罠へ誘導すると連携', variant: 'pull' },
    pull: { id: 'pull', base: 'wind', name: '呼び寄せ風', purpose: '支援', tag: 'lure', cd: 10, range: 200, r: 150, dmg: 6, lure: 1.5, color: '#9fe0c0', desc: 'ねらった場所へ敵を集める（誘導）' },
    stone: { id: 'stone', name: '石の壁', purpose: '防衛', tag: 'wall', cd: 16, range: 160, len: 130, hp: 160, dur: 7, color: '#b8a58a', desc: '道をふさぐ壁（HP160・7秒）。敵は壁をこわそうとする', variant: 'decoy' },
    decoy: { id: 'decoy', base: 'stone', name: 'おとり地蔵', purpose: '防衛', tag: 'wall', cd: 16, range: 160, hp: 130, dur: 6, r: 170, color: '#b8a58a', desc: 'まわりの敵が6秒間、地蔵をねらう（HP130）' },
    thunder: { id: 'thunder', name: '稲妻', purpose: '攻撃', tag: 'chain', cd: 8, range: 230, dmg: 15, chain: 3, jump: 130, stun: 0.6, color: '#ffe066', desc: '3体につながる雷。少しだけ足止め', variant: 'thundertrap' },
    thundertrap: { id: 'thundertrap', base: 'thunder', name: '雷の罠', purpose: '攻撃', tag: 'chain', cd: 12, range: 200, r: 62, dmg: 30, stun: 1.4, dur: 10, color: '#ffe066', desc: 'ふんだ敵に雷（30・1.4秒足止め）。10秒まで待つ' },
    leaf: { id: 'leaf', name: '癒しの葉', purpose: '支援', tag: 'heal', cd: 14, r: 110, heal: 15, regen: 10, regenTime: 4, color: '#7ed36a', desc: '自分とまわりを15回復＋4秒で10回復' },
    guardleaf: { id: 'guardleaf', base: 'leaf', name: '守りの葉', purpose: '支援', tag: 'heal', cd: 14, r: 110, shield: 30, dur: 5, color: '#c8e86a', desc: '自分とまわりに5秒の守り（30まで防ぐ）' }
  };
  var JUTSU_BASE = ['fire', 'water', 'wind', 'stone', 'thunder', 'leaf'];
  var JUTSU_VARIANTS = ['fireline', 'mist', 'pull', 'decoy', 'thundertrap', 'guardleaf'];
  var UNLOCK_COST = 150;
  var PURPOSES = ['攻撃', '防衛', '支援'];

  // 連携（§4.3）。画面では、連携できる状態の敵・味方に共通のアイコン「連」を出す
  var COMBOS = {
    bind_aoe: { name: '足止め → 範囲攻撃', short: '足止め＋範囲' },
    lure_trap: { name: '風で誘導 → 罠', short: '誘導＋罠' },
    safe_rescue: { name: '結界の中で救助', short: '安全な救助' }
  };

  // ---- 罠（決まった置き場だけに置く。自由建築はしない）----
  var TRAPS = {
    makibishi: { id: 'makibishi', name: 'まきびし', cost: 2, r: 38, slow: 0.5, slowTime: 2, dmg: 4, per: 1.2, uses: 16, desc: '通った敵を遅くする（2素材）' },
    bakuchiku: { id: 'bakuchiku', name: '爆竹', cost: 4, r: 34, blast: 74, dmg: 32, rearm: 5, charges: 4, desc: 'ふんだ敵のまわりに32（4素材・4回）' }
  };

  // ---- 補給所（足りない役割の機能を、共有の設備でおぎなう）----
  var SUPPLY = {
    potion: { id: 'potion', name: '薬湯', cost: 3, heal: 40, desc: '40回復（救援役がいないときに）' },
    charm: { id: 'charm', name: '護り札', cost: 3, shield: 40, dur: 10, desc: '10秒、40まで防ぐ守り（結界役がいないときに）' },
    bomb: { id: 'bomb', name: '焙烙玉', cost: 3, dmg: 34, r: 72, range: 220, desc: '投げると範囲に34（先陣役がいないときに）' }
  };

  // ---- 襲撃の合間に選ぶ強化（その試合の中だけ。3つから1つ）----
  var UPGRADES = {
    cd: { name: '早い印', desc: '忍術と役割技の再使用 −15%' },
    area: { name: '広い術', desc: '忍術の範囲 +20%' },
    atk: { name: '鋭い刃', desc: '通常攻撃 +30%' },
    swift: { name: '身軽', desc: '移動 +10%・回避の再使用 −1秒' },
    tough: { name: '丈夫', desc: '最大HP +25（すぐ回復）' },
    rescue: { name: '手当て上手', desc: '救助が30%はやい' },
    trap: { name: '罠名人', desc: '罠の素材 −1・罠の威力 +25%' },
    bind: { name: '長い足止め', desc: '足止めと誘導の時間 +40%' },
    combo: { name: '連携の心得', desc: '連携の威力 ×2 → ×2.5' },
    special: { name: '役割技・改', desc: '一閃+12／護りの結界HP+50／癒しの輪+12' }
  };

  // ---- 敵（§5）。かわいい妖怪で、倒すと光になって消える（しずまる）----
  var ENEMY = {
    koro: { id: 'koro', cat: '小型妖怪', name: 'ころ玉', hp: 38, speed: 80, r: 14, dmg: 9, rate: 1.0, bdmg: 7, cost: 1, aggro: 52, how: '道にそって、まっすぐ来る' },
    kasa: { id: 'kasa', cat: '盾持ち', name: 'からかさ', hp: 120, speed: 54, r: 18, dmg: 13, rate: 1.2, bdmg: 14, front: 0.3, back: 1.5, turn: 100, cost: 3, aggro: 60, how: '正面の攻撃は3割しか通らない。背中が弱点' },
    fuda: { id: 'fuda', cat: '呪符使い', name: 'ふだ狸', hp: 45, speed: 62, r: 15, range: 230, windup: 0.9, dmg: 16, blast: 44, bdmg: 22, rate: 3.2, cost: 3, aggro: 260, how: '音が鳴って、赤い予告のあとに札が落ちる' },
    daruma: { id: 'daruma', cat: '大型妖怪', name: '大だるま', hp: 2000, speed: 34, r: 46, bdmg: 34, rate: 2.0, cost: 0, boss: true, how: '予告には安全地帯がある。夜明けまで守りきれば勝ち' },
    chudaruma: { id: 'chudaruma', cat: '大型妖怪', name: '中だるま', hp: 420, speed: 40, r: 34, bdmg: 20, rate: 2.0, cost: 0, boss: true, how: '最初の任務の小ボス' },
    dummy: { id: 'dummy', cat: '練習', name: 'わら人形', hp: 30, speed: 0, r: 16, cost: 0 }
  };
  var BOSS_ATTACKS = {
    slam: { name: '地ならし', tele: 1.3, r: 150, dmg: 34 },
    roll: { name: '転がり', tele: 1.1, len: 360, width: 72, dmg: 30, time: 0.6 },
    ring: { name: '波紋', tele: 1.4, r0: 70, r1: 320, gaps: 3, gapDeg: 44, dmg: 24 },
    summon: { name: '呼び出し', tele: 0.8, n: 4 }
  };

  // ---- 地図（MVP：中央の結界・進入路2本・採集3か所・罠6か所）----
  var MAP = {
    w: 1600, h: 1250,
    barrier: { x: 800, y: 600, r: 52, aura: 100 },
    supply: { x: 800, y: 790 },
    lanes: {
      west: [[80, 150], [220, 215], [330, 330], [420, 440], [540, 510], [660, 560], [738, 590]],
      east: [[1520, 150], [1380, 215], [1270, 330], [1180, 440], [1060, 510], [940, 560], [862, 590]]
    },
    // 分かれ道（分かれ道の守り）：3つめの点から分かれて、結界の手前で合流
    branches: {
      west: [[80, 150], [220, 215], [330, 330], [300, 450], [390, 560], [540, 630], [690, 640], [742, 616]],
      east: [[1520, 150], [1380, 215], [1270, 330], [1300, 450], [1210, 560], [1060, 630], [910, 640], [858, 616]]
    },
    gather: [
      { id: 'bamboo', name: '竹林', x: 250, y: 800 },
      { id: 'herb', name: '薬草畑', x: 1350, y: 800 },
      { id: 'spring', name: '霊石の泉', x: 800, y: 1075 }
    ],
    trapSpots: [
      { id: 'w1', lane: 'west', x: 225, y: 222 }, { id: 'w2', lane: 'west', x: 425, y: 445 }, { id: 'w3', lane: 'west', x: 600, y: 538 },
      { id: 'e1', lane: 'east', x: 1375, y: 222 }, { id: 'e2', lane: 'east', x: 1175, y: 445 }, { id: 'e3', lane: 'east', x: 1000, y: 538 }
    ],
    extraSpots: [{ id: 'wb', lane: 'west', x: 380, y: 555 }, { id: 'eb', lane: 'east', x: 1220, y: 555 }],
    pillars: [{ id: 'pw', name: '西の結界柱', x: 505, y: 455, hp: 320 }, { id: 'pe', name: '東の結界柱', x: 1095, y: 455, hp: 320 }],
    homes: { west: [[110, 660], [300, 700], [520, 690], [700, 640]], east: [[1490, 660], [1300, 700], [1080, 690], [900, 640]] },
    houses: [[430, 930], [620, 1000], [980, 1000], [1170, 930], [330, 1110], [1270, 1110], [110, 640], [1490, 640]],
    start: { x: 800, y: 700 }
  };

  // ---- 承認済みの任務（AI試作：4構成）----
  var MISSIONS = {
    standard: { id: 'standard', name: '里の守り', desc: '2本の道から来る妖怪から、夜明けまで結界を守る。',
      enemySets: ['basic', 'shield', 'talisman', 'mixed', 'swarm'], supports: ['mend', 'rain', 'bell', 'supply', 'lamp'], objectives: ['none', 'barrier70', 'trap15', 'rescue3'] },
    escort: { id: 'escort', name: '里人の避難', desc: '外の家に残った里人が、襲撃のあいだに結界まで歩いてくる。ねらわれたら守り、ダウンしたら助ける。',
      enemySets: ['basic', 'mixed', 'swarm'], supports: ['rain', 'bell', 'lamp'], objectives: ['none', 'escortAll', 'rescue3'], villagers: 2 },
    branch: { id: 'branch', name: '分かれ道の守り', desc: '道が途中で分かれる。罠の置き場が2つ増えるので、罠で守る夜。',
      enemySets: ['basic', 'swarm', 'shield'], supports: ['supply', 'bell', 'mend'], objectives: ['none', 'trap15', 'trap25'], branch: true },
    pillars: { id: 'pillars', name: '結界柱の守り', desc: '道の途中にある結界柱2本も守る。柱がこわれると結界が傷み、妖怪の攻撃が強くなる。',
      enemySets: ['basic', 'talisman', 'mixed'], supports: ['mend', 'lamp', 'rain'], objectives: ['none', 'pillarsBoth', 'barrier70'], pillars: true }
  };
  var MISSION_IDS = ['standard', 'escort', 'branch', 'pillars'];

  // 敵の組み合わせ（ふつうの数）。cost＝小型1・盾持ち3・呪符使い3 の合計（大型は数えない）
  var ENEMY_SETS = {
    basic: { name: 'ころ玉の群れ', w1: { koro: 28 }, w2: { koro: 18, kasa: 4, fuda: 4 }, boss: { koro: 12, fuda: 2 } },
    shield: { name: 'からかさ隊', w1: { koro: 24, kasa: 2 }, w2: { koro: 14, kasa: 7, fuda: 3 }, boss: { koro: 10, kasa: 2 } },
    talisman: { name: 'ふだ狸の夜', w1: { koro: 24, fuda: 2 }, w2: { koro: 14, kasa: 3, fuda: 7 }, boss: { koro: 10, fuda: 3 } },
    mixed: { name: 'いろいろ混ざり', w1: { koro: 26, kasa: 1, fuda: 1 }, w2: { koro: 16, kasa: 5, fuda: 5 }, boss: { koro: 10, kasa: 1, fuda: 2 } },
    swarm: { name: 'ころ玉の大群', w1: { koro: 34 }, w2: { koro: 28, kasa: 2, fuda: 2 }, boss: { koro: 18 } }
  };

  // 節目の支援（依頼人・師匠が一度だけ手を貸す）。効果はゲームの設定で、公式の能力ではない
  var SUPPORTS = {
    mend: { name: '結界の修復', desc: '結界を250回復' },
    rain: { name: '癒しの雨', desc: '味方全員を60回復。ダウン中の仲間も起き上がる' },
    bell: { name: '足止めの鈴', desc: 'すべての敵を3秒足止め（大だるまは遅くなる）' },
    supply: { name: '素材の差し入れ', desc: '最終準備のはじめに素材+12', at: 'prep3' },
    lamp: { name: '見張りの灯', desc: '12秒間、与えるダメージ+25%' }
  };

  // 任務の目標（達成すると勝利時に修行札+20。表で固定）
  var OBJECTIVES = {
    none: { name: 'なし', desc: '夜明けまで結界を守る' },
    barrier70: { name: '結界を7割残す', desc: '夜明けに結界HPが7割以上' },
    trap15: { name: '罠で15体', desc: '罠で妖怪を15体しずめる' },
    trap25: { name: '罠で25体', desc: '罠で妖怪を25体しずめる' },
    rescue3: { name: '救助3回', desc: '仲間や里人を3回助ける' },
    escortAll: { name: '全員避難', desc: '里人を全員、結界まで送りとどける' },
    pillarsBoth: { name: '柱を守る', desc: '結界柱を2本とも守りきる' }
  };

  // 難易度（プレイヤーが選ぶ。上手く遊ぶほど勝手に難しくなる仕組みにはしない）
  var DIFF = {
    easy: { id: 'easy', name: 'やさしい', hpMul: 0.8, countMul: 0.78, dmgMul: 0.75, budget: 92 },
    normal: { id: 'normal', name: 'ふつう', hpMul: 1, countMul: 1, dmgMul: 1, budget: 99 },
    hard: { id: 'hard', name: 'むずかしい', hpMul: 1.3, countMul: 1.25, dmgMul: 1.25, budget: 120 }
  };
  var DIFF_IDS = ['easy', 'normal', 'hard'];

  // ---- 報酬（§5）。同じ任務を周回しても基本報酬は同じ ----
  var REWARD = { win: 100, perWave: 20, loseCap: 60, objective: 20, weeklyFirst: 50 };

  // ---- 役割別の修行課題（その役割で出撃したときだけ数える）----
  var TASKS = [
    { id: 'v1', role: 'vanguard', name: '一閃で妖怪を20体しずめる', stat: 'issenKills', goal: 20, tokens: 50, gift: 'trail_gold' },
    { id: 'v2', role: 'vanguard', name: '連携を15回', stat: 'combos', goal: 15, tokens: 50, gift: 'weapon_crimson' },
    { id: 'v3', role: 'vanguard', name: '大だるまに800ダメージ', stat: 'bossDmg', goal: 800, tokens: 50, gift: 'pose_fists' },
    { id: 'g1', role: 'guard', name: '護りの結界・壁で300ダメージ防ぐ', stat: 'blocked', goal: 300, tokens: 50, gift: 'outfit_fuji' },
    { id: 'g2', role: 'guard', name: '罠で30体しずめる', stat: 'trapKills', goal: 30, tokens: 50, gift: 'crest_wave' },
    { id: 'g3', role: 'guard', name: '結界の中で救助を3回', stat: 'safeRescues', goal: 3, tokens: 50, gift: 'band_gold' },
    { id: 'm1', role: 'medic', name: '仲間や里人を8回助ける', stat: 'rescues', goal: 8, tokens: 50, gift: 'trail_sakura' },
    { id: 'm2', role: 'medic', name: '回復を合計600', stat: 'healed', goal: 600, tokens: 50, gift: 'outfit_wakaba' },
    { id: 'm3', role: 'medic', name: 'ダウンから10秒以内の救助を5回', stat: 'quickRescues', goal: 5, tokens: 50, gift: 'crest_sakura' }
  ];

  // ---- 外見（強さには関係しない。エフェクトの大きさは共通の範囲に収める）----
  var LOOKS = {
    outfit: [
      { id: 'outfit_ai', name: '藍', top: '#2f4577', bottom: '#27385f' },
      { id: 'outfit_akane', name: '茜', top: '#b8433a', bottom: '#7e2d27' },
      { id: 'outfit_moegi', name: '萌黄', top: '#5f8f3a', bottom: '#3f6526' },
      { id: 'outfit_sumi', name: '墨', top: '#2c2c33', bottom: '#212127' },
      { id: 'outfit_fuji', name: '藤', top: '#7b5ea8', bottom: '#57407c', lock: 'task' },
      { id: 'outfit_wakaba', name: '若葉', top: '#8cc06a', bottom: '#4f7f3a', lock: 'task' },
      { id: 'outfit_akatsuki', name: '暁', top: '#e0823a', bottom: '#8e4a2a', lock: 'weekly' }
    ],
    band: [
      { id: 'band_white', name: '白', color: '#f2eee6' }, { id: 'band_red', name: '赤', color: '#d23b3b' },
      { id: 'band_navy', name: '紺', color: '#27335a' }, { id: 'band_gold', name: '金', color: '#d8a93a', lock: 'task' }
    ],
    weapon: [
      { id: 'weapon_steel', name: '鋼の刀', slash: '#e8f0ff' }, { id: 'weapon_wood', name: '木刀', slash: '#f1d9a8' },
      { id: 'weapon_crimson', name: '紅の刀', slash: '#ffb0b0', lock: 'task' }
    ],
    trail: [
      { id: 'trail_white', name: '白い軌跡', color: '#ffffff' }, { id: 'trail_sky', name: '空色の軌跡', color: '#8fd8ff' },
      { id: 'trail_gold', name: '金の軌跡', color: '#ffd65a', lock: 'task' }, { id: 'trail_sakura', name: '桜の軌跡', color: '#ffb6d2', lock: 'task' }
    ],
    pose: [
      { id: 'pose_happy', name: 'ばんざい', pose: 'happy' }, { id: 'pose_wave', name: '手をふる', pose: 'wave' },
      { id: 'pose_seal', name: '印を結ぶ', pose: 'seal' }, { id: 'pose_fists', name: '気合い', pose: 'fists', lock: 'task' }
    ],
    crest: [
      { id: 'crest_sun', name: '日の出', glyph: 'sun' }, { id: 'crest_moon', name: '三日月', glyph: 'moon' },
      { id: 'crest_mount', name: '山', glyph: 'mount' }, { id: 'crest_wave', name: '波', glyph: 'wave', lock: 'task' },
      { id: 'crest_sakura', name: '桜', glyph: 'sakura', lock: 'task' }, { id: 'crest_dawn', name: '暁星', glyph: 'star', lock: 'weekly' }
    ],
    hair: [
      { id: 'pony', name: 'ポニーテール' }, { id: 'short', name: 'みじかい髪' }, { id: 'bob', name: 'おかっぱ' }
    ],
    hairColor: ['#2a2228', '#5a3a2a', '#8a5a30', '#3a3f5a']
  };
  var DEFAULT_LOOK = { outfit: 'outfit_akane', band: 'band_white', weapon: 'weapon_steel', trail: 'trail_white', pose: 'pose_happy', crest: 'crest_sun', hair: 'pony', hairColor: '#2a2228' };

  // ---- 仲間の見習い（NPC）----
  var BUDDIES = [
    { id: 'ao', name: 'アオ', look: { outfit: 'outfit_ai', band: 'band_red', hair: 'short', hairColor: '#2c3550' },
      lines: { hi: 'アオだよ。いっしょに朝まで守ろう！', down: 'ごめん、ダウンした…！', thanks: 'たすかった、ありがとう！', rescue: '今、助けるから！', gather: '集合だね、行くよ！', defend: '結界のそばを守る！', help: 'すぐ行く！' } },
    { id: 'momo', name: 'モモ', look: { outfit: 'outfit_moegi', band: 'band_white', hair: 'bob', hairColor: '#6a3a2a' },
      lines: { hi: 'モモです。回りをよく見ていくね。', down: 'う…ダウンしちゃった…', thanks: 'ありがとう、もう大丈夫！', rescue: 'つかまって、今助ける！', gather: 'はーい、そっちへ行く！', defend: '結界はまかせて！', help: '待ってて！' } }
  ];
  // NPC の忍術（役割ごとに固定）
  var NPC_JUTSU = { vanguard: ['fire', 'thunder'], guard: ['water', 'stone'], medic: ['leaf', 'wind'] };
  // 同じ役割の NPC が2人目のとき（役割の重複は許可。忍術を変えて足りない所をおぎなう）
  var NPC_JUTSU_ALT = { vanguard: ['thunder', 'wind'], guard: ['stone', 'fire'], medic: ['leaf', 'fire'] };
  // 役割「おまかせ」のときの仲間（プレイヤーの役割をおぎなう）
  var COMPLEMENT = { vanguard: ['guard', 'medic'], guard: ['vanguard', 'medic'], medic: ['vanguard', 'guard'] };

  // ---- 師匠：はじめから全員えらべる。出撃のたびに絆がたまる（絆はセリフと外見色だけ。強さは変わらない）----
  var BOND_STEPS = [1, 3, 6];
  var FIRST_MENTOR = 'hayate';

  // ---- 週の固定任務（全員が同じ地図・敵・難易度。AI の提案とは分ける）----
  function isoWeek(ms) {
    var d = new Date(ms);
    var t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    var day = (new Date(t).getUTCDay() + 6) % 7;
    var th = t - day * 864e5 + 3 * 864e5;
    var y = new Date(th).getUTCFullYear();
    var jan4 = Date.UTC(y, 0, 4), jday = (new Date(jan4).getUTCDay() + 6) % 7;
    var w1 = jan4 - jday * 864e5;
    return y + '-W' + (1 + Math.floor((th - w1) / (7 * 864e5)));
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function weeklyMission(ms) {
    var wk = isoWeek(ms), h = hashStr('nyt-weekly-' + wk);
    var mid = MISSION_IDS[h % MISSION_IDS.length], m = MISSIONS[mid];
    var sets = m.enemySets.filter(function (id) { return setCost(id) <= DIFF.normal.budget; });
    var obj = m.objectives.filter(function (o) { return o !== 'none'; });
    return {
      week: wk, seed: h,
      mission: { mission_template_id: mid, enemy_set_id: sets[(h >>> 4) % sets.length], support_event_id: m.supports[(h >>> 8) % m.supports.length], objective_variant_id: obj[(h >>> 12) % obj.length], briefing: null },
      difficulty: 'normal'
    };
  }
  function setCost(id) {
    var s = ENEMY_SETS[id]; if (!s) return Infinity;
    var c = 0;
    ['w1', 'w2', 'boss'].forEach(function (w) { for (var k in s[w]) c += (ENEMY[k] ? ENEMY[k].cost : 99) * s[w][k]; });
    return c;
  }
  // 人数による補正（n＝人の参加者の数。NPC は数えない）
  function scaleHp(n) { return 1 + BAL.scaleHp * (Math.max(1, n) - 1); }
  function scaleCount(n) { return 1 + BAL.scaleCount * (Math.max(1, n) - 1); }

  // 見習いの見た目 → 描画エンジンの定義（ninja-sato-life/chars.js の apprenticeArt を使う）
  function lookItem(kind, id) { var L = LOOKS[kind] || []; for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return L[0]; }
  function apprenticeDef(look, CH) {
    look = look || DEFAULT_LOOK;
    var of = lookItem('outfit', look.outfit), bd = lookItem('band', look.band);
    return CH.apprenticeArt(null, look.hair || 'pony', { top: of.top, trim: of.bottom, band: bd.color, obi: '#d8b04a', hair: look.hairColor || '#2a2228' });
  }

  var api = {
    RULES_VERSION: RULES_VERSION, BAL: BAL, PHASES: PHASES, LOADOUT_SEC: LOADOUT_SEC, RESULT_SEC: RESULT_SEC, ROBLOX_PHASES: ROBLOX_PHASES,
    ROLES: ROLES, ROLE_IDS: ROLE_IDS, JUTSU: JUTSU, JUTSU_BASE: JUTSU_BASE, JUTSU_VARIANTS: JUTSU_VARIANTS, UNLOCK_COST: UNLOCK_COST, PURPOSES: PURPOSES,
    COMBOS: COMBOS, TRAPS: TRAPS, SUPPLY: SUPPLY, UPGRADES: UPGRADES, ENEMY: ENEMY, BOSS_ATTACKS: BOSS_ATTACKS, MAP: MAP,
    MISSIONS: MISSIONS, MISSION_IDS: MISSION_IDS, ENEMY_SETS: ENEMY_SETS, SUPPORTS: SUPPORTS, OBJECTIVES: OBJECTIVES, DIFF: DIFF, DIFF_IDS: DIFF_IDS,
    REWARD: REWARD, TASKS: TASKS, LOOKS: LOOKS, DEFAULT_LOOK: DEFAULT_LOOK, BUDDIES: BUDDIES, NPC_JUTSU: NPC_JUTSU, NPC_JUTSU_ALT: NPC_JUTSU_ALT, COMPLEMENT: COMPLEMENT,
    BOND_STEPS: BOND_STEPS, FIRST_MENTOR: FIRST_MENTOR,
    lookItem: lookItem, apprenticeDef: apprenticeDef, isoWeek: isoWeek, hashStr: hashStr, weeklyMission: weeklyMission, setCost: setCost, scaleHp: scaleHp, scaleCount: scaleCount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_DATA = api;
})(typeof window !== 'undefined' ? window : globalThis);
