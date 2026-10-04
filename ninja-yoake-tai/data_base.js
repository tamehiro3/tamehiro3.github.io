/* ニンジャ夜明け隊（RPG） — 共通の決まりごと
 * 攻撃の型・状態・役割・能力の伸び方・経験値の表・妖怪の基準の強さ・乱数。
 * 画面に依存しない（Node のテストでも読みこむ）。
 * CryptoNinja（CC0・Ninja DAO）の非公式ファンゲーム。技・物語はゲームの創作で、公式の設定ではない。
 */
(function (root) {
  'use strict';

  // ---- 攻撃の型（8つ）----
  var TYPE_IDS = ['zan', 'da', 'sha', 'hi', 'mizu', 'rai', 'kaze', 'hikari'];
  var TYPES = {
    zan: { name: '斬', long: '斬る', color: '#c9ced8' },
    da: { name: '打', long: '打つ', color: '#d8a25a' },
    sha: { name: '射', long: '射る', color: '#9ad06a' },
    hi: { name: '火', long: '火', color: '#ff7a3a' },
    mizu: { name: '水', long: '水', color: '#4aa8ff' },
    rai: { name: '雷', long: '雷', color: '#ffd23a' },
    kaze: { name: '風', long: '風', color: '#7fe0b8' },
    hikari: { name: '光', long: '光', color: '#fff2a8' }
  };

  // ---- 役割 ----
  var ROLES = {
    atk: { name: '攻め', color: '#e0603a' },
    mag: { name: '術', color: '#8a6ae0' },
    tank: { name: '守り', color: '#4a8ad8' },
    heal: { name: '癒し', color: '#4ab878' },
    sup: { name: '支え', color: '#d8b04a' },
    all: { name: '何でも', color: '#c8c8d8' }
  };

  // ---- 状態 ----
  var STATUS = {
    poison: { name: '毒', color: '#9a5ad8', bad: true },
    sleep: { name: '眠り', color: '#6a8ad8', bad: true },
    seal: { name: '封印', color: '#d85a7a', bad: true },
    stun: { name: '怯み', color: '#e0b030', bad: true },
    curse: { name: '呪い', color: '#7a3aa6', bad: true },
    cover: { name: 'かばう', color: '#4a8ad8' },
    counter: { name: '反撃', color: '#e0603a' },
    evade: { name: '見切り', color: '#7fe0b8' },
    regen: { name: '再生', color: '#4ab878' },
    taunt: { name: '引きつけ', color: '#e08a3a' },
    clone: { name: '分身', color: '#a0a8c8' },
    charge: { name: 'ため', color: '#ff5a3a' }
  };
  var BUFF_NAME = { atk: '攻撃', def: '守り', spd: 'すばやさ' };

  // ---- 能力の伸び方（Lv1 と Lv50 の値。あいだはなめらかにつなぐ）----
  var ARCH = {
    atk: { hp: [46, 820], sp: [10, 170], atk: [14, 300], def: [10, 190], mag: [8, 170], mdf: [8, 160], spd: [11, 190], luk: [8, 60] },
    mag: { hp: [38, 650], sp: [18, 300], atk: [8, 170], def: [8, 150], mag: [15, 310], mdf: [12, 230], spd: [10, 180], luk: [8, 60] },
    tank: { hp: [56, 1000], sp: [10, 170], atk: [12, 250], def: [14, 260], mag: [8, 160], mdf: [11, 210], spd: [8, 150], luk: [7, 50] },
    heal: { hp: [40, 700], sp: [18, 320], atk: [8, 160], def: [9, 170], mag: [13, 280], mdf: [13, 250], spd: [10, 175], luk: [9, 60] },
    sup: { hp: [42, 740], sp: [14, 250], atk: [11, 230], def: [10, 180], mag: [11, 240], mdf: [11, 210], spd: [12, 210], luk: [10, 70] },
    all: { hp: [48, 800], sp: [14, 240], atk: [12, 260], def: [11, 200], mag: [12, 250], mdf: [11, 210], spd: [11, 190], luk: [10, 70] }
  };
  var STAT_KEYS = ['hp', 'sp', 'atk', 'def', 'mag', 'mdf', 'spd', 'luk'];
  var STAT_NAME = { hp: 'HP', sp: '術力', atk: '攻撃', def: '守り', mag: '忍術', mdf: '術守り', spd: 'すばやさ', luk: '運' };
  var MAX_LV = 50;
  function curve(L) { return Math.pow(Math.max(0, Math.min(MAX_LV, L) - 1) / (MAX_LV - 1), 0.95); }
  function statAt(arch, mods, key, L) {
    var a = (ARCH[arch] || ARCH.all)[key];
    return Math.max(1, Math.round((a[0] + (a[1] - a[0]) * curve(L)) * ((mods && mods[key]) || 1)));
  }
  function expNeed(L) { return Math.round(9 * Math.pow(L, 1.75)); }   // L → L+1 に必要な経験値

  // ---- 妖怪の基準（同じレベルの仲間との釣りあいから作る）----
  // 標準の妖怪は、同じレベルの「攻め」の通常攻撃でおよそ5回で倒れ、
  // 1回の攻撃で「支え」の最大HPのおよそ15%を減らす。ボスは1ラウンドに2回動き、攻撃が強い。
  function enemyStd(L) {
    var A = statAt('atk', null, 'atk', L);
    var def = 6 + 3.2 * L;
    var hit = A * 120 / (120 + def);
    var H = statAt('sup', null, 'hp', L), D = statAt('sup', null, 'def', L), MD = statAt('sup', null, 'mdf', L);
    return {
      hp: Math.round(5.0 * hit),
      atk: Math.round(0.15 * H * (120 + D) / 120),
      mag: Math.round(0.15 * H * (120 + MD) / 120),
      def: Math.round(def), mdf: Math.round(def),
      spd: Math.round(statAt('sup', null, 'spd', L) * 0.92),
      luk: Math.round(5 + L * 0.8),
      exp: Math.max(3, Math.round(expNeed(L) / 12)),
      gold: Math.round(4 + 2.2 * L)
    };
  }

  // ---- 難しさ ----
  var DIFF = {
    normal: { name: 'ふつう', ehp: 1, eatk: 1, exp: 1 },
    easy: { name: 'やさしい', ehp: 0.7, eatk: 0.7, exp: 1.3 }
  };

  // ---- 戦いの決まり ----
  var RULE = {
    bpStart: 1, bpMax: 5, boostMax: 3,
    weakMul: 1.3, resMul: 0.5, breakMul: 1.6, critMul: 1.5,
    skillBoost: [1, 1.6, 2.2, 2.8], healBoost: [1, 1.5, 2, 2.5],
    buffMul: { 1: 1.3, 2: 1.55, '-1': 0.75, '-2': 0.6 },
    buffTurns: 3,
    poisonRate: 0.08, poisonRateBoss: 0.02, poisonTurns: 4,
    sleepTurns: 2, sealTurns: 3,
    flee: 0.75,
    kz: { weak: 5, brk: 15, kill: 8, down: 10, heal: 3, max: 100 },
    guardMul: 0.5,
    bossAtk: 1.3
  };

  // ---- 乱数（種を固定できる）----
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    var f = function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.state = function () { return a; };
    f.int = function (n) { return Math.floor(f() * n); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.range = function (lo, hi) { return lo + f() * (hi - lo); };
    return f;
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var api = {
    TYPE_IDS: TYPE_IDS, TYPES: TYPES, ROLES: ROLES, STATUS: STATUS, BUFF_NAME: BUFF_NAME,
    ARCH: ARCH, STAT_KEYS: STAT_KEYS, STAT_NAME: STAT_NAME, MAX_LV: MAX_LV,
    statAt: statAt, expNeed: expNeed, enemyStd: enemyStd, DIFF: DIFF, RULE: RULE,
    rng: rng, hashStr: hashStr, clamp: clamp
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_BASE = api;
})(typeof window !== 'undefined' ? window : globalThis);
