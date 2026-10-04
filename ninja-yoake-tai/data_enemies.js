/* ニンジャ夜明け隊（RPG） — 妖怪・ボス・腕試しの相手
 * 能力は data_base.js の enemyStd(レベル) × m（倍率）。shield: 構え  weak: 弱点  res: 効きにくい型
 * acts: 行動の候補 { s: 技, w: 重み, if: 'hp<0.5' など, once: 1（1回だけ）, charge: 1（ためてから撃つ）, every: n（n回に1回） }
 * 敵の技（ESK）の tg は「使う側から見た」向き：e1 相手ひとり / ea 相手全体 / er 相手ランダム / a1 味方ひとり / aa 味方全体 / me 自分
 * shape と col は draw_yokai.js の描き方。cn があるのは CryptoNinja の腕試し（art.js で描く）。
 * 妖怪はこのゲームの創作（夜鴉・影法師も含む）。
 */
(function (root) {
  'use strict';
  var ESK = {
    tai: { n: '体当たり', k: 'atk', st: 'p', ty: 'da', pw: 100, tg: 'e1', an: 'bump' },
    kamitsuki: { n: 'かみつき', k: 'atk', st: 'p', ty: 'zan', pw: 110, tg: 'e1', an: 'bite' },
    tsutsuki: { n: 'つつき', k: 'atk', st: 'p', ty: 'sha', pw: 105, tg: 'e1', an: 'bump' },
    happa: { n: '葉っぱ手裏剣', k: 'atk', st: 'p', ty: 'zan', pw: 42, tg: 'er', hits: 3, an: 'leaves' },
    hinotama: { n: '火の玉', k: 'atk', st: 'm', ty: 'hi', pw: 108, tg: 'e1', an: 'fire' },
    onibi_wa: { n: '鬼火の輪', k: 'atk', st: 'm', ty: 'hi', pw: 70, tg: 'ea', an: 'fire_all' },
    mizudeppo: { n: '水でっぽう', k: 'atk', st: 'm', ty: 'mizu', pw: 108, tg: 'e1', an: 'water' },
    kaminari: { n: 'かみなり', k: 'atk', st: 'm', ty: 'rai', pw: 110, tg: 'e1', an: 'thunder' },
    tsumuji: { n: 'つむじ風', k: 'atk', st: 'm', ty: 'kaze', pw: 70, tg: 'ea', an: 'wind_all' },
    kasaharai: { n: '傘はらい', k: 'atk', st: 'p', ty: 'da', pw: 75, tg: 'ea', an: 'sweep' },
    odoshi: { n: 'おどかし', k: 'sup', tg: 'e1', fx: [{ st: 'stun', ch: 0.4 }], an: 'scare' },
    komoriuta: { n: 'ねむりの霧', k: 'sup', tg: 'ea', fx: [{ st: 'sleep', ch: 0.28 }], an: 'mist' },
    dokunoiki: { n: '毒の息', k: 'sup', tg: 'ea', fx: [{ st: 'poison', ch: 0.4 }], an: 'poison_mist' },
    dokukiba: { n: '毒のキバ', k: 'atk', st: 'p', ty: 'zan', pw: 90, tg: 'e1', fx: [{ st: 'poison', ch: 0.5 }], an: 'bite' },
    itoshibari: { n: '糸しばり', k: 'sup', tg: 'e1', fx: [{ st: 'stun', ch: 0.7 }], an: 'web' },
    kiri_koromo: { n: '霧の衣', k: 'sup', tg: 'me', fx: [{ mist: 3 }], an: 'mist' },
    kodama_uta: { n: '木霊の歌', k: 'heal', pw: 70, tg: 'aa', an: 'heal_all' },
    iwaotoshi: { n: '岩落とし', k: 'atk', st: 'p', ty: 'da', pw: 140, tg: 'e1', an: 'rock' },
    uchiwa: { n: '天狗のうちわ', k: 'atk', st: 'm', ty: 'kaze', pw: 85, tg: 'ea', an: 'wind_all' },
    hanegaeshi: { n: 'やまびこ返し', k: 'sup', tg: 'me', fx: [{ counter: 2 }], an: 'stance' },
    sumo: { n: 'すもう', k: 'atk', st: 'p', ty: 'da', pw: 125, tg: 'e1', an: 'bump' },
    hasami: { n: 'はさみ', k: 'atk', st: 'p', ty: 'zan', pw: 120, tg: 'e1', an: 'claw' },
    awa: { n: '泡ぶく', k: 'atk', st: 'm', ty: 'mizu', pw: 60, tg: 'ea', fx: [{ buff: 'spd', v: -1, to: 'tg' }], an: 'bubbles' },
    chochinbi: { n: '提灯の火', k: 'atk', st: 'm', ty: 'hi', pw: 115, tg: 'e1', an: 'fire' },
    shibire: { n: 'しびれ', k: 'atk', st: 'm', ty: 'rai', pw: 90, tg: 'e1', fx: [{ st: 'stun', ch: 0.3 }], an: 'thunder' },
    hikarinoko: { n: '光の粉', k: 'atk', st: 'm', ty: 'hikari', pw: 65, tg: 'ea', fx: [{ st: 'sleep', ch: 0.2 }], an: 'sparkle' },
    kageshuriken: { n: '影手裏剣', k: 'atk', st: 'p', ty: 'sha', pw: 45, tg: 'er', hits: 3, an: 'shuriken' },
    kamaitachi: { n: 'かまいたち', k: 'atk', st: 'p', ty: 'zan', pw: 62, tg: 'er', hits: 2, an: 'claw' },
    makitsuki: { n: '巻きつき', k: 'atk', st: 'p', ty: 'da', pw: 95, tg: 'e1', fx: [{ st: 'stun', ch: 0.3 }], an: 'wrap' },
    korogaru: { n: 'ごろごろ転がる', k: 'atk', st: 'p', ty: 'da', pw: 150, tg: 'e1', an: 'roll' },
    yaminoiki: { n: '闇の息', k: 'atk', st: 'm', ty: 'hikari', pw: 80, tg: 'ea', an: 'dark' },
    nigeru: { n: 'にげだす', k: 'sup', tg: 'me', fx: [{ flee: 1 }], an: 'flee' },
    // ボスの技
    bunshin_tanuki: { n: '分身の術', k: 'sup', tg: 'me', fx: [{ summon: 'kotanuki', n: 2 }], an: 'smoke' },
    haradaiko: { n: '腹太鼓', k: 'atk', st: 'p', ty: 'da', pw: 135, tg: 'ea', an: 'drum' },
    dokunoame: { n: '毒の雨', k: 'atk', st: 'm', ty: 'mizu', pw: 105, tg: 'ea', fx: [{ st: 'poison', ch: 0.5 }], an: 'poison_rain' },
    oonami: { n: '大波', k: 'atk', st: 'm', ty: 'mizu', pw: 150, tg: 'ea', an: 'wave' },
    yobu_kurage: { n: 'くらげ呼び', k: 'sup', tg: 'me', fx: [{ summon: 'kurage', n: 2 }], an: 'smoke' },
    umi_tai: { n: 'のしかかり', k: 'atk', st: 'p', ty: 'da', pw: 160, tg: 'e1', an: 'bump' },
    kagenui_gaeshi: { n: '影縫い返し', k: 'sup', tg: 'ea', fx: [{ st: 'seal', ch: 0.5 }], an: 'dark' },
    yaminotsubasa: { n: '闇の翼', k: 'atk', st: 'm', ty: 'hikari', pw: 130, tg: 'ea', an: 'dark_wing' },
    yobu_kage: { n: '影呼び', k: 'sup', tg: 'me', fx: [{ summon: 'kageboshi', n: 2 }], an: 'smoke' },
    tokoyami: { n: '常闇', k: 'atk', st: 'm', ty: 'hikari', pw: 140, tg: 'ea', fx: [{ buff: 'atk', v: -1, to: 'tg' }], an: 'dark_wing' },
    karasu_kuchi: { n: '大鴉のくちばし', k: 'atk', st: 'p', ty: 'sha', pw: 170, tg: 'e1', an: 'bite' },
    yoru_no_hane: { n: '夜の羽', k: 'atk', st: 'p', ty: 'zan', pw: 55, tg: 'er', hits: 4, an: 'feathers' },
    yami_kaifuku: { n: '闇をすう', k: 'heal', pw: 250, tg: 'me', an: 'dark' }
  };

  var E = {};
  function en(id, o) { o.id = id; E[id] = o; }

  // ---- 甲賀の森・稲荷の洞（Lv2〜9）----
  en('koro_s', { n: 'ちびころ', shape: 'blob', col: 'purple', lv: 1, m: { hp: 0.6, atk: 0.55 }, shield: 2, weak: ['sha', 'hikari'], acts: [{ s: 'tai', w: 1 }], desc: '生まれたばかりの小さなころ玉。' });
  en('koro', { n: 'ころ玉', shape: 'blob', col: 'purple', lv: 2, m: { hp: 0.72 }, shield: 2, weak: ['sha', 'hikari'], acts: [{ s: 'tai', w: 1 }], drops: [{ i: 'kizugusuri', ch: 0.15 }], desc: '夜になると転がりだす、ふわふわの妖怪。' });
  en('kotanuki', { n: '子だぬき', shape: 'tanuki', col: 'brown', lv: 3, m: { hp: 0.85 }, shield: 3, weak: ['hi', 'zan'], acts: [{ s: 'tai', w: 2 }, { s: 'happa', w: 2 }], drops: [{ i: 'kizugusuri', ch: 0.1 }, { i: 'kunai', ch: 0.06 }], desc: '葉っぱをのせると化けられる…と思っている子だぬき。' });
  en('kitsunebi', { n: '狐火', shape: 'wisp', col: 'blue', lv: 4, m: { hp: 0.8, mag: 1.1 }, shield: 2, weak: ['mizu'], res: ['hi'], acts: [{ s: 'hinotama', w: 3 }, { s: 'onibi_wa', w: 1 }], drops: [{ i: 'hyorogan', ch: 0.08 }], desc: '森の小道に浮かぶ青い火。水がにがて。' });
  en('kodama', { n: '木霊', shape: 'kodama', col: 'green', lv: 5, m: { hp: 0.9 }, shield: 3, weak: ['hi', 'zan'], res: ['mizu'], acts: [{ s: 'happa', w: 2 }, { s: 'kodama_uta', w: 1, if: 'allyHurt' }], drops: [{ i: 'hyorogan', ch: 0.1 }], desc: '古い木に宿る精。仲間をはげます歌をうたう。' });
  en('karakasa', { n: 'からかさ', shape: 'kasa', col: 'red', lv: 6, shield: 4, weak: ['kaze', 'hi'], acts: [{ s: 'kasaharai', w: 2 }, { s: 'tai', w: 2 }], drops: [{ i: 'kemuri', ch: 0.1 }], desc: '一本足で跳ねる古い傘。風にあおられるとよろける。' });
  en('kinkoro', { n: '金ころ', shape: 'blob', col: 'gold', lv: 5, m: { hp: 0.25, def: 6, mdf: 6, spd: 1.8, exp: 10, gold: 12 }, shield: 4, weak: ['rai'], acts: [{ s: 'nigeru', w: 2 }, { s: 'tai', w: 1 }], rare: 1, desc: 'ぴかぴかの、めったに会えないころ玉。すぐ逃げる。雷に弱い。' });
  en('yoikoro', { n: '宵ころ', shape: 'blob', col: 'navy', lv: 7, m: { hp: 0.9, mag: 1.1 }, shield: 3, weak: ['sha', 'hikari'], acts: [{ s: 'tai', w: 2 }, { s: 'komoriuta', w: 1 }], drops: [{ i: 'kiyome', ch: 0.12 }], desc: '洞の暗がりで育ったころ玉。眠くなる霧をはく。' });
  en('bakekitsune', { n: '化け狐', shape: 'fox', col: 'orange', lv: 8, shield: 4, weak: ['mizu', 'sha'], acts: [{ s: 'hinotama', w: 2 }, { s: 'kamitsuki', w: 2 }, { s: 'odoshi', w: 1 }], drops: [{ i: 'hyorogan', ch: 0.12 }, { m: 'tamahagane', ch: 0.04 }], desc: '狸に化け方を教わった狐。いたずら好き。' });
  en('ponpoko', { n: 'ぽんぽこ大将', shape: 'tanuki', col: 'boss_brown', lv: 9, boss: 1, size: 2.1, m: { hp: 10, atk: 1, exp: 12, gold: 14 }, shield: 10, weak: ['hi', 'zan', 'sha'],
    acts: [{ s: 'tai', w: 2 }, { s: 'happa', w: 2 }, { s: 'bunshin_tanuki', once: 1, if: 'hp<0.7' }, { s: 'haradaiko', charge: 1, every: 3 }],
    drops: [{ m: 'tamahagane', ch: 1 }, { c: 'chikara', ch: 1 }], desc: '化け狸の親分。お腹の太鼓で森じゅうをゆらす。' });

  // ---- 伊賀・霧の山・大蜘蛛の岩屋（Lv9〜15）----
  en('kiriwarashi', { n: '霧わらし', shape: 'mist', col: 'white', lv: 9, shield: 3, weak: ['kaze', 'hi'], acts: [{ s: 'tai', w: 2 }, { s: 'komoriuta', w: 1 }], drops: [{ i: 'kiyome', ch: 0.1 }], desc: '霧から生まれた子ども。風で吹き飛ぶ。' });
  en('iwakozo', { n: '岩小僧', shape: 'rock', col: 'gray', lv: 10, m: { hp: 1.25, def: 1.6, spd: 0.7 }, shield: 5, weak: ['da', 'mizu'], res: ['zan', 'sha'], acts: [{ s: 'iwaotoshi', w: 2 }, { s: 'tai', w: 2 }], drops: [{ m: 'tamahagane', ch: 0.08 }], desc: '山道に転がっている石…ではなく、小僧。かたい。' });
  en('kotengu', { n: '子天狗', shape: 'tengu', col: 'red', lv: 11, m: { spd: 1.2 }, shield: 3, weak: ['sha', 'rai'], acts: [{ s: 'tsutsuki', w: 2 }, { s: 'uchiwa', w: 1 }], drops: [{ i: 'kazakiri', ch: 0.1 }], desc: '修行中の天狗。うちわで風を起こす。' });
  en('kogumo', { n: '子蜘蛛', shape: 'spider', col: 'purple', lv: 12, shield: 3, weak: ['hi', 'zan'], acts: [{ s: 'dokukiba', w: 2 }, { s: 'itoshibari', w: 1 }], drops: [{ i: 'kiyome', ch: 0.12 }], desc: '霧蜘蛛の子ども。糸でしばってくる。' });
  en('yamabiko', { n: '山彦', shape: 'echo', col: 'tan', lv: 13, m: { hp: 1.1 }, shield: 4, weak: ['hikari'], res: ['kaze'], acts: [{ s: 'tai', w: 2 }, { s: 'odoshi', w: 1 }, { s: 'hanegaeshi', w: 1 }], drops: [{ i: 'hyorogan', ch: 0.12 }], desc: '声をまねする山の妖怪。攻撃をはね返す構えをとる。' });
  en('kiniwa', { n: '金岩', shape: 'rock', col: 'gold', lv: 12, m: { hp: 0.3, def: 6, mdf: 6, spd: 1.6, exp: 10, gold: 12 }, shield: 4, weak: ['mizu'], acts: [{ s: 'nigeru', w: 2 }, { s: 'tai', w: 1 }], rare: 1, desc: '金色にかがやく岩小僧。すぐ逃げる。水に弱い。' });
  en('dokugumo', { n: '毒蜘蛛', shape: 'spider', col: 'green', lv: 14, m: { hp: 1.1 }, shield: 4, weak: ['hi', 'hikari'], acts: [{ s: 'dokukiba', w: 2 }, { s: 'dokunoiki', w: 1 }], drops: [{ i: 'kiyome', ch: 0.15 }, { m: 'tamahagane', ch: 0.06 }], desc: '岩屋の奥にすむ蜘蛛。毒の息をはく。' });
  en('iwaoni', { n: '岩鬼', shape: 'rock', col: 'dark', lv: 14, m: { hp: 1.4, def: 1.5, spd: 0.75, atk: 1.15 }, shield: 6, weak: ['da', 'rai'], res: ['zan'], acts: [{ s: 'iwaotoshi', w: 3 }, { s: 'tai', w: 1 }], drops: [{ m: 'tamahagane', ch: 0.1 }], desc: '岩小僧が大きくなったもの。とてもかたい。' });
  en('kirigumo', { n: '霧蜘蛛', shape: 'spider', col: 'boss_white', lv: 15, boss: 1, size: 2.2, m: { hp: 11, exp: 12, gold: 14 }, shield: 12, weak: ['hi', 'kaze', 'rai'],
    acts: [{ s: 'dokukiba', w: 2 }, { s: 'itoshibari', w: 1 }, { s: 'kiri_koromo', w: 1, if: 'noMist' }, { s: 'dokunoame', charge: 1, every: 3 }],
    drops: [{ m: 'tamahagane', ch: 1 }, { c: 'dokuyoke', ch: 1 }], desc: '霧の山をおおう大蜘蛛。霧の衣をまとうと攻撃が当たりにくい（風で吹き飛ぶ）。' });

  // ---- 雑賀・潮風の浜・海鳴りの洞（Lv15〜21）----
  en('kappa', { n: '河童', shape: 'kappa', col: 'green', lv: 15, shield: 4, weak: ['rai', 'zan'], res: ['mizu'], acts: [{ s: 'mizudeppo', w: 2 }, { s: 'sumo', w: 2 }], drops: [{ i: 'jokizu', ch: 0.08 }], desc: 'すもうが大好き。頭のお皿が乾くと元気がなくなる。' });
  en('bakegani', { n: '化け蟹', shape: 'crab', col: 'red', lv: 16, m: { def: 1.5, spd: 0.8 }, shield: 5, weak: ['da', 'rai'], res: ['zan'], acts: [{ s: 'hasami', w: 3 }, { s: 'awa', w: 1 }], drops: [{ m: 'tamahagane', ch: 0.08 }], desc: '大きなはさみの蟹。こうらがかたい。' });
  en('chochin', { n: '提灯お化け', shape: 'chochin', col: 'orange', lv: 17, shield: 3, weak: ['mizu', 'kaze'], res: ['hi'], acts: [{ s: 'chochinbi', w: 3 }, { s: 'odoshi', w: 1 }], drops: [{ i: 'kayaku', ch: 0.12 }], desc: '古い提灯の妖怪。べろを出しておどかす。' });
  en('kurage', { n: 'くらげ火', shape: 'jelly', col: 'cyan', lv: 18, m: { hp: 0.9 }, shield: 4, weak: ['rai', 'sha'], acts: [{ s: 'shibire', w: 2 }, { s: 'awa', w: 1 }], drops: [{ i: 'reisui', ch: 0.05 }], desc: '夜の海に光るくらげ。さわるとしびれる。' });
  en('umibotaru', { n: '海ぼたる', shape: 'firefly', col: 'teal', lv: 19, shield: 3, weak: ['zan', 'hikari'], acts: [{ s: 'hikarinoko', w: 2 }, { s: 'tai', w: 2 }], drops: [{ i: 'hikarifuda', ch: 0.12 }], desc: '青く光る小さな虫の妖怪。眠くなる粉をまく。' });
  en('kinkani', { n: '金蟹', shape: 'crab', col: 'gold', lv: 18, m: { hp: 0.3, def: 6, mdf: 6, spd: 1.6, exp: 10, gold: 12 }, shield: 4, weak: ['da'], acts: [{ s: 'nigeru', w: 2 }, { s: 'hasami', w: 1 }], rare: 1, desc: '金色の蟹。すぐ逃げる。打に弱い。' });
  en('isokappa', { n: '磯河童', shape: 'kappa', col: 'teal', lv: 20, m: { hp: 1.15, atk: 1.1 }, shield: 5, weak: ['rai', 'hi'], res: ['mizu'], acts: [{ s: 'sumo', w: 2 }, { s: 'mizudeppo', w: 2 }], drops: [{ i: 'jokizu', ch: 0.12 }, { m: 'tamahagane', ch: 0.06 }], desc: '洞にすむ河童の兄貴分。' });
  en('umibozu', { n: '海坊主', shape: 'umibozu', col: 'boss_navy', lv: 21, boss: 1, size: 2.4, m: { hp: 10, exp: 12, gold: 14 }, shield: 14, weak: ['rai', 'da', 'hikari'],
    acts: [{ s: 'umi_tai', w: 2 }, { s: 'mizudeppo', w: 2 }, { s: 'yobu_kurage', once: 1, if: 'hp<0.6' }, { s: 'oonami', charge: 1, every: 3 }],
    drops: [{ m: 'tamahagane', ch: 1 }, { c: 'fudou', ch: 1 }], desc: '海鳴りの洞にすむ大きな海の妖怪。大波で船を止めていた。' });

  // ---- 風魔・黒嶺の山道・風魔の砦（Lv21〜28）----
  en('kageboshi', { n: '影法師', shape: 'shadow', col: 'violet', lv: 21, shield: 4, weak: ['hikari', 'hi'], acts: [{ s: 'kageshuriken', w: 2 }, { s: 'odoshi', w: 1 }], drops: [{ i: 'hikarifuda', ch: 0.1 }], desc: '夜鴉が生んだ影の手下。光に弱い。' });
  en('kamaitachi', { n: '鎌鼬', shape: 'weasel', col: 'tan', lv: 22, m: { spd: 1.4 }, shield: 4, weak: ['da', 'sha'], acts: [{ s: 'kamaitachi', w: 3 }, { s: 'tsumuji', w: 1 }], drops: [{ i: 'kazakiri', ch: 0.12 }], desc: 'つむじ風にのってやってくる、すばやい鼬。' });
  en('ittan', { n: '一反木綿', shape: 'cloth', col: 'white', lv: 23, shield: 4, weak: ['hi', 'zan'], res: ['da'], acts: [{ s: 'makitsuki', w: 2 }, { s: 'tsumuji', w: 1 }], drops: [{ i: 'kiyome', ch: 0.15 }], desc: 'ひらひら飛ぶ布の妖怪。巻きついてくる。' });
  en('kurodaruma', { n: '黒だるま', shape: 'daruma', col: 'black', lv: 24, m: { hp: 1.4, def: 1.3, spd: 0.8 }, shield: 6, weak: ['da', 'hikari'], acts: [{ s: 'korogaru', w: 3 }, { s: 'hanegaeshi', w: 1 }], drops: [{ m: 'tamahagane', ch: 0.12 }], desc: '夜の色にそまっただるま。転がってくる。' });
  en('onibi', { n: '鬼火', shape: 'wisp', col: 'green', lv: 25, m: { mag: 1.15 }, shield: 3, weak: ['mizu', 'kaze'], res: ['hi'], acts: [{ s: 'onibi_wa', w: 2 }, { s: 'hinotama', w: 2 }], drops: [{ i: 'reisui', ch: 0.06 }], desc: '砦をただよう緑の火。' });
  en('kindaruma', { n: '金だるま', shape: 'daruma', col: 'gold', lv: 24, m: { hp: 0.3, def: 6, mdf: 6, spd: 1.6, exp: 10, gold: 12 }, shield: 4, weak: ['hikari'], acts: [{ s: 'nigeru', w: 2 }, { s: 'korogaru', w: 1 }], rare: 1, desc: '金色のだるま。すぐ逃げる。光に弱い。' });
  en('kagezamurai', { n: '影侍', shape: 'shadow', col: 'red', lv: 26, m: { hp: 1.3, atk: 1.15 }, shield: 5, weak: ['hikari', 'rai'], acts: [{ s: 'kamaitachi', w: 2 }, { s: 'kageshuriken', w: 2 }], drops: [{ m: 'tamahagane', ch: 0.1 }, { i: 'tokukizu', ch: 0.05 }], desc: '刀を持った影法師。' });
  en('yogarasu_kage', { n: '夜鴉の影', shape: 'crow', col: 'boss_shadow', lv: 27, boss: 1, size: 2.3, m: { hp: 10, atk: 0.9, exp: 12, gold: 14 }, shield: 14, weak: ['hikari', 'hi', 'rai'],
    acts: [{ s: 'kageshuriken', w: 2 }, { s: 'karasu_kuchi', w: 2 }, { s: 'kagenui_gaeshi', w: 1 }, { s: 'yobu_kage', once: 1, if: 'hp<0.5' }, { s: 'yaminotsubasa', charge: 1, every: 3 }],
    drops: [{ c: 'in_mamori', ch: 1 }], desc: '暁のかけらにひそんでいた、夜鴉の影。' });

  // ---- 根の国（Lv28〜35）----
  en('yamikoro', { n: '闇ころ', shape: 'blob', col: 'dark', lv: 28, shield: 4, weak: ['hikari', 'sha'], acts: [{ s: 'tai', w: 2 }, { s: 'yaminoiki', w: 1 }], drops: [{ i: 'tokukizu', ch: 0.06 }], desc: '根の国の闇を吸ったころ玉。' });
  en('honegasa', { n: '骨傘', shape: 'kasa', col: 'bone', lv: 29, m: { hp: 1.1 }, shield: 5, weak: ['da', 'hi'], acts: [{ s: 'kasaharai', w: 2 }, { s: 'tai', w: 1 }, { s: 'odoshi', w: 1 }], drops: [{ i: 'kemuri', ch: 0.15 }], desc: '骨だけになった古い傘。カタカタ鳴る。' });
  en('karasu_ko', { n: '夜鴉の子', shape: 'crow', col: 'black', lv: 30, m: { spd: 1.25 }, shield: 4, weak: ['rai', 'hikari'], acts: [{ s: 'yoru_no_hane', w: 2 }, { s: 'tsutsuki', w: 2 }], drops: [{ i: 'reisui', ch: 0.08 }], desc: '夜鴉の羽から生まれた子鴉。' });
  en('yomichochin', { n: '黄泉提灯', shape: 'chochin', col: 'purple', lv: 31, shield: 4, weak: ['mizu', 'kaze'], res: ['hi', 'hikari'], acts: [{ s: 'chochinbi', w: 2 }, { s: 'komoriuta', w: 1 }], drops: [{ i: 'manno', ch: 0.03 }], desc: '根の国の道を照らす、紫の提灯。' });
  en('kagetaisho', { n: '影の大将', shape: 'shadow', col: 'gold', lv: 32, m: { hp: 1.7, atk: 1.2 }, shield: 7, weak: ['hikari', 'zan'], acts: [{ s: 'kamaitachi', w: 2 }, { s: 'kageshuriken', w: 1 }, { s: 'yobu_kage', once: 1 }], drops: [{ m: 'tamahagane', ch: 0.2 }], desc: '影法師をたばねる大将。' });
  en('yogarasu', { n: '夜鴉', shape: 'crow', col: 'boss_black', lv: 34, boss: 1, size: 2.6, m: { hp: 8, atk: 0.9, exp: 10, gold: 10 }, shield: 16, weak: ['hikari', 'rai', 'kaze'], next: 'yogarasu2', nextFx: { heal: 0.6, bpMax: 1, learn: ['hero', 'h_ak5'], msg: '暁のかけらが光り、仲間たちに力が満ちる！' },
    acts: [{ s: 'karasu_kuchi', w: 2 }, { s: 'yoru_no_hane', w: 2 }, { s: 'kagenui_gaeshi', w: 1 }, { s: 'yaminotsubasa', charge: 1, every: 3 }],
    desc: '暁の鐘を割った大鴉の妖怪。夜が明けないことを望んでいる。' });
  en('yogarasu2', { n: '常闇の夜鴉', shape: 'crow', col: 'boss_final', lv: 35, boss: 1, size: 2.9, m: { hp: 9, atk: 0.95, exp: 20, gold: 20 }, shield: 18, weak: ['hikari', 'hi'],
    acts: [{ s: 'karasu_kuchi', w: 2 }, { s: 'yoru_no_hane', w: 2 }, { s: 'yami_kaifuku', once: 1, if: 'hp<0.4' }, { s: 'tokoyami', charge: 1, every: 3 }],
    drops: [{ c: 'akatsuki', ch: 1 }], desc: '最後のかけらの力で、夜そのものになろうとした夜鴉。' });

  // ---- CryptoNinja の腕試し（倒れずに勝負がつく）----
  // cn: 見た目と技は data_chars.js / art.js の本人。duel: HPがこの割合になったら勝負あり
  en('d_konga', { n: 'コンガ', cn: 'konga', lv: 6, m: { hp: 4, atk: 0.9 }, shield: 6, weak: ['zan', 'hi'], duel: 0.3, skills: ['kg_hyaku', 'kg_tokkun'], desc: '組手の相手。' });
  en('d_oto', { n: '於兎', cn: 'oto', lv: 5, m: { hp: 2.4, atk: 0.85 }, shield: 4, weak: ['hi', 'kaze'], duel: 0.3, skills: ['oto_usagi', 'oto_hane'], desc: '' });
  en('d_uka', { n: '宇迦', cn: 'uka', lv: 5, m: { hp: 2.4, mag: 0.85 }, shield: 4, weak: ['mizu', 'sha'], duel: 0.3, skills: ['uka_kitsunebi', 'uka_gofu'], desc: '' });
  en('d_sekishusai', { n: '石舟斎', cn: 'sekishusai', lv: 13, m: { hp: 5, def: 1.2 }, shield: 8, weak: ['hikari', 'rai'], duel: 0.3, skills: ['ss_ootenta', 'ss_mutou'], desc: '' });
  en('d_rotten', { n: '呂屯', cn: 'rotten', lv: 22, m: { hp: 3.2 }, shield: 6, weak: ['hi', 'hikari'], duel: 0.3, skills: ['rt_dokuya', 'rt_dokugiri'], desc: '' });
  en('d_dan', { n: '断', cn: 'dan', lv: 22, m: { hp: 3.2, atk: 1.05 }, shield: 6, weak: ['mizu', 'rai'], duel: 0.3, skills: ['dn_senkozan', 'dn_senko'], desc: '' });
  en('d_karma', { n: 'カルマ', cn: 'karma', lv: 23, m: { hp: 5 }, shield: 8, weak: ['hikari', 'da'], duel: 0.3, skills: ['km_kusarigama', 'km_doujutsu', 'km_ryouiki'], desc: '' });
  en('d_kohaku', { n: '狐白', cn: 'kohaku', lv: 23, m: { hp: 4.5, spd: 1.1 }, shield: 7, weak: ['da', 'hikari'], duel: 0.3, skills: ['kh_issen', 'kh_kawarimi', 'kh_kagenoha'], desc: '' });
  en('d_atoza', { n: 'アトザ', cn: 'atoza', lv: 26, boss: 1, m: { hp: 9, atk: 1.1, exp: 6, gold: 6 }, shield: 12, weak: ['hikari', 'sha'], duel: 0.3, skills: ['at_oumagatoki', 'at_randa', 'at_houkou'], desc: '' });

  // ---- 群れ（地図の妖怪シンボルが使う）----
  var POOLS = {
    village: [['koro', 'koro']],
    forest: [['koro', 'koro'], ['kotanuki'], ['kotanuki', 'koro'], ['kitsunebi', 'koro'], ['kodama', 'kotanuki'], ['karakasa'], ['kitsunebi', 'kitsunebi'], ['kodama', 'koro', 'koro']],
    inari: [['kotanuki', 'kotanuki', 'koro'], ['karakasa', 'kitsunebi'], ['yoikoro', 'yoikoro'], ['bakekitsune'], ['bakekitsune', 'yoikoro'], ['kodama', 'karakasa'], ['yoikoro', 'kotanuki', 'kitsunebi']],
    kirimichi: [['kiriwarashi', 'kiriwarashi'], ['iwakozo'], ['kotengu', 'kiriwarashi'], ['kogumo', 'kogumo'], ['yamabiko'], ['kotengu', 'kotengu'], ['iwakozo', 'kogumo']],
    iwaya: [['kogumo', 'dokugumo'], ['iwaoni'], ['dokugumo', 'dokugumo'], ['yamabiko', 'kogumo'], ['iwaoni', 'kiriwarashi'], ['kotengu', 'dokugumo', 'kogumo']],
    hama: [['kappa', 'kappa'], ['bakegani'], ['chochin', 'kappa'], ['kurage', 'kurage'], ['umibotaru', 'bakegani'], ['chochin', 'chochin']],
    umidou: [['isokappa'], ['isokappa', 'kurage'], ['umibotaru', 'umibotaru', 'kurage'], ['bakegani', 'chochin'], ['isokappa', 'umibotaru']],
    kuromine: [['kageboshi', 'kageboshi'], ['kamaitachi'], ['ittan', 'kageboshi'], ['kurodaruma'], ['kamaitachi', 'kamaitachi'], ['onibi', 'ittan']],
    toride: [['kagezamurai'], ['kagezamurai', 'kageboshi'], ['onibi', 'onibi', 'kageboshi'], ['kurodaruma', 'kamaitachi'], ['ittan', 'kagezamurai']],
    nenokuni: [['yamikoro', 'yamikoro'], ['honegasa', 'yamikoro'], ['karasu_ko'], ['yomichochin', 'honegasa'], ['kagetaisho'], ['karasu_ko', 'karasu_ko'], ['yomichochin', 'yamikoro', 'karasu_ko']]
  };
  var RARE = { forest: 'kinkoro', inari: 'kinkoro', kirimichi: 'kiniwa', iwaya: 'kiniwa', hama: 'kinkani', umidou: 'kinkani', kuromine: 'kindaruma', toride: 'kindaruma', nenokuni: 'kindaruma' };

  var api = { ESK: ESK, ENEMIES: E, POOLS: POOLS, RARE: RARE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_ENEMIES = api;
})(typeof window !== 'undefined' ? window : globalThis);
