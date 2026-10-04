/* ニンジャ夜明け隊（RPG） — 道具・お守り・素材・大事な物・店・鍛冶
 * 道具の k: heal（HP）/ sp（術力）/ cure（状態）/ revive（起こす）/ throw（投げ物：型つき）/ reveal（見破り）/ flee（逃げる）/ healall
 * 投げ物の威力は「30 ＋ 主人公のレベル×6」（どの章でも使える）。
 */
(function (root) {
  'use strict';
  var ITEMS = {
    kizugusuri: { n: '傷薬', d: 'HPを80回復', k: 'heal', v: 80, tg: 'a1', price: 12 },
    jokizu: { n: '上傷薬', d: 'HPを300回復', k: 'heal', v: 300, tg: 'a1', price: 50 },
    tokukizu: { n: '特上傷薬', d: 'HPを900回復', k: 'heal', v: 900, tg: 'a1', price: 150 },
    dango: { n: '三色団子', d: '仲間全員のHPを60回復', k: 'healall', v: 60, tg: 'aa', price: 40 },
    manno: { n: '万能薬', d: 'HPを全部回復し、状態も治す', k: 'heal', v: 9999, cure: 1, tg: 'a1', price: 400 },
    kiyome: { n: '清め塩', d: '毒・眠り・封印・呪いを治す', k: 'cure', tg: 'a1', price: 15 },
    kitsuke: { n: '気付け薬', d: '倒れた仲間を起こす（HP半分）', k: 'revive', v: 0.5, tg: 'ko', price: 80 },
    hyorogan: { n: '兵糧丸', d: '術力を30回復', k: 'sp', v: 30, tg: 'a1', price: 30 },
    reisui: { n: '霊水', d: '術力を120回復', k: 'sp', v: 120, tg: 'a1', price: 120 },
    kemuri: { n: '煙玉', d: 'かならず逃げる（ボス戦では使えない）', k: 'flee', tg: 'me', price: 20 },
    mikiri: { n: '見破りの巻', d: '敵ひとりの弱点をすべて見破る', k: 'reveal', tg: 'e1', price: 25 },
    kunai: { n: '苦無', d: '射の型の投げ物', k: 'throw', ty: 'sha', tg: 'e1', price: 15 },
    sorikiri: { n: '反り刃', d: '斬の型の投げ物', k: 'throw', ty: 'zan', tg: 'e1', price: 15 },
    tetsutsubute: { n: '鉄つぶて', d: '打の型の投げ物', k: 'throw', ty: 'da', tg: 'e1', price: 15 },
    kayaku: { n: '火薬玉', d: '火の型の投げ物', k: 'throw', ty: 'hi', tg: 'e1', price: 18 },
    mizudama: { n: '水風船', d: '水の型の投げ物', k: 'throw', ty: 'mizu', tg: 'e1', price: 18 },
    raifu: { n: '雷符', d: '雷の型の投げ物', k: 'throw', ty: 'rai', tg: 'e1', price: 20 },
    kazakiri: { n: '風切り羽', d: '風の型の投げ物', k: 'throw', ty: 'kaze', tg: 'e1', price: 18 },
    hikarifuda: { n: '光の札', d: '光の型の投げ物', k: 'throw', ty: 'hikari', tg: 'e1', price: 25 }
  };
  var ITEM_ORDER = Object.keys(ITEMS);

  // お守り（1人2つまで）。数値は足し算。flags は特別な効果
  var CHARMS = {
    chikara: { n: '力の守り', d: '攻撃+6', st: { atk: 6 }, price: 120 },
    kata: { n: '堅の守り', d: '守り+6', st: { def: 6 }, price: 120 },
    chie: { n: '知の守り', d: '忍術+6', st: { mag: 6 }, price: 120 },
    inochi: { n: '命の守り', d: 'HP+50', st: { hp: 50 }, price: 120 },
    jutsu: { n: '術の守り', d: '術力+15', st: { sp: 15 }, price: 120 },
    hayasa: { n: '疾の守り', d: 'すばやさ+5', st: { spd: 5 }, price: 150 },
    dokuyoke: { n: '毒よけの鈴', d: '毒にならない', fl: { noPoison: 1 }, price: 200 },
    mezame: { n: '目覚めの鈴', d: '眠らない', fl: { noSleep: 1 }, price: 200 },
    fuujiyaburi: { n: '封じ破りの札', d: '術を封じられない', fl: { noSeal: 1 }, price: 250 },
    fudou: { n: '不動の守り', d: '怯まない', fl: { noStun: 1 }, price: 300 },
    kaishin: { n: '会心の守り', d: '会心が出やすい', fl: { crit: 0.1 }, price: 500 },
    sente: { n: '先手の守り', d: 'すばやさ+3。先制しやすい', st: { spd: 3 }, fl: { first: 1 }, price: 400 },
    shugyou: { n: '修行の帯', d: '前列にいると、もらえる経験値+20%', fl: { exp: 0.2 }, price: 800 },
    maneki: { n: '招き猫の守り', d: '前列にいると、もらえる両+30%', fl: { gold: 0.3 }, price: 600 },
    kizuna_obi: { n: '絆の帯', d: '前列にいると、絆ゲージがたまりやすい', fl: { kz: 0.3 }, price: 500 },
    saisei: { n: '再生の守り', d: '毎ターン少し回復', fl: { regen: 0.04 }, price: 700 },
    in_mamori: { n: '印の守り', d: '戦いのはじめの印が2個', fl: { bp2: 1 }, price: 600 },
    migawari: { n: '身代わり人形', d: '戦いで1回だけ、倒れずにHP1で耐える', fl: { endure: 1 }, price: 800 },
    gouriki: { n: '剛力の守り', d: '攻撃+20', st: { atk: 20 }, price: 900 },
    kongou: { n: '金剛の守り', d: '守り+20', st: { def: 20 }, price: 900 },
    eichi: { n: '叡智の守り', d: '忍術+20', st: { mag: 20 }, price: 900 },
    choumei: { n: '長命の守り', d: 'HP+180', st: { hp: 180 }, price: 900 },
    shippu: { n: '疾風の守り', d: 'すばやさ+15', st: { spd: 15 }, price: 1000 },
    akatsuki: { n: '暁の守り', d: 'すべての能力+8', st: { hp: 40, sp: 10, atk: 8, def: 8, mag: 8, mdf: 8, spd: 8 }, price: 0 }
  };

  var MATS = { tamahagane: { n: '玉鋼', d: '武器を鍛える鋼。金鬼の鍛冶で使う' } };

  // 大事な物（売れない・数えない）
  var KEYS = {
    sasa: { n: '笹の葉', d: 'パンダのリーリーの大好物' },
    nemu_e1: { n: 'ネムの絵（小鳥）', d: '狐火の森で見つけた絵' },
    nemu_e2: { n: 'ネムの絵（兎）', d: '狐火の森で見つけた絵' },
    nemu_e3: { n: 'ネムの絵（ひよこ）', d: '狐火の森で見つけた絵' },
    hanatane: { n: '霧花の種', d: '霧の山にしか咲かない花の種' },
    meikou: { n: '名工の玉鋼', d: '大蜘蛛の岩屋の奥で見つけた、特別な玉鋼' },
    yakizakana: { n: '焼き魚', d: 'こんがり焼けた魚' },
    tegami: { n: '手紙の束', d: 'イチヤから預かった手紙' },
    kane: { n: '暁の鐘のかけら', d: '割れた暁の鐘のかけら' }
  };

  // 店（町ごと）
  var SHOPS = {
    koka: { items: ['kizugusuri', 'kiyome', 'hyorogan', 'kemuri', 'mikiri', 'kunai', 'kayaku', 'mizudama', 'tetsutsubute'], charms: ['chikara', 'kata', 'inochi'] },
    iga: { items: ['kizugusuri', 'jokizu', 'dango', 'kiyome', 'kitsuke', 'hyorogan', 'kemuri', 'mikiri', 'kunai', 'sorikiri', 'kayaku', 'mizudama', 'raifu', 'kazakiri'], charms: ['chie', 'jutsu', 'hayasa', 'dokuyoke', 'mezame'] },
    saika: { items: ['jokizu', 'dango', 'kiyome', 'kitsuke', 'hyorogan', 'reisui', 'kemuri', 'mikiri', 'kunai', 'sorikiri', 'tetsutsubute', 'kayaku', 'mizudama', 'raifu', 'kazakiri', 'hikarifuda'], charms: ['fuujiyaburi', 'fudou', 'kaishin', 'sente', 'maneki', 'shugyou'] },
    fuma: { items: ['jokizu', 'tokukizu', 'kiyome', 'kitsuke', 'reisui', 'kemuri', 'mikiri', 'hikarifuda', 'raifu', 'kazakiri'], charms: ['kizuna_obi', 'saisei', 'in_mamori', 'gouriki', 'kongou', 'eichi', 'choumei'] },
    ten: { items: ['tokukizu', 'manno', 'kitsuke', 'reisui', 'kiyome', 'hikarifuda'], charms: ['migawari', 'shippu', 'gouriki', 'kongou', 'eichi', 'choumei'] }
  };
  var INN = { koka: 10, iga: 25, saika: 40, fuma: 60, ten: 0 };

  // 鍛冶（武器Lv n → n+1）
  var FORGE = [null, { gold: 100, tama: 1 }, { gold: 300, tama: 2 }, { gold: 800, tama: 3 }, { gold: 2000, tama: 4 }];
  var WEAPON_MAX = 5, WEAPON_BONUS = 0.1;

  function throwDamage(heroLv) { return 30 + 6 * heroLv; }
  function sellPrice(p) { return Math.floor(p / 2); }

  var api = { ITEMS: ITEMS, ITEM_ORDER: ITEM_ORDER, CHARMS: CHARMS, MATS: MATS, KEYS: KEYS, SHOPS: SHOPS, INN: INN, FORGE: FORGE, WEAPON_MAX: WEAPON_MAX, WEAPON_BONUS: WEAPON_BONUS, throwDamage: throwDamage, sellPrice: sellPrice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_ITEMS = api;
})(typeof window !== 'undefined' ? window : globalThis);
