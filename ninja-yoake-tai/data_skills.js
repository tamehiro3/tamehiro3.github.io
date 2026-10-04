/* ニンジャ夜明け隊（RPG） — 忍術と絆技
 * k: atk（攻撃）/ heal（回復）/ sup（強化・弱体・ほか）
 * st: p（攻撃×守り）/ m（忍術×術守り）  ty: 攻撃の型  pw: 威力（100 = ふつうの攻撃）
 * tg: e1 敵ひとり / ea 敵全体 / er 敵ランダム（hits 回）/ a1 味方ひとり / aa 味方全体 / me 自分 / ko 倒れた味方
 * fx: 追加の効果（battle.js の applyFx を見る）
 * 技の名前と効果はゲームの創作（公式の忍術・武器を手がかりにした）。
 */
(function (root) {
  'use strict';
  var S = {};
  function sk(id, o) { o.id = id; S[id] = o; }

  // ===== 主人公（見習い）=====
  sk('h_hi', { n: '火遁・火の粉', d: '火の型。敵ひとりに', sp: 3, k: 'atk', st: 'm', ty: 'hi', pw: 110, tg: 'e1', an: 'fire' });
  sk('h_mizu', { n: '水遁・水しぶき', d: '水の型。敵ひとりに', sp: 3, k: 'atk', st: 'm', ty: 'mizu', pw: 110, tg: 'e1', an: 'water' });
  sk('h_kaze', { n: '風遁・つむじ風', d: '風の型。敵全体に', sp: 6, k: 'atk', st: 'm', ty: 'kaze', pw: 70, tg: 'ea', an: 'wind' });
  sk('h_rai', { n: '雷遁・稲妻', d: '雷の型。敵ひとりに', sp: 5, k: 'atk', st: 'm', ty: 'rai', pw: 120, tg: 'e1', an: 'thunder' });
  sk('h_ak1', { n: '暁の一閃', d: '光の型の強い一太刀', sp: 7, k: 'atk', st: 'p', ty: 'hikari', pw: 175, tg: 'e1', an: 'light_slash' });
  sk('h_ak2', { n: '暁の加護', d: '味方全員を回復し、しばらく再生', sp: 12, k: 'heal', pw: 60, tg: 'aa', fx: [{ regen: 0.06, t: 3, to: 'tg' }], an: 'dawn_heal' });
  sk('h_ak3', { n: '暁の大閃光', d: '光の型。敵全体に', sp: 15, k: 'atk', st: 'm', ty: 'hikari', pw: 130, tg: 'ea', an: 'light_all' });
  sk('h_ak4', { n: '夜明けの誓い', d: '味方全員の攻撃と守りを上げ、印+1', sp: 14, k: 'sup', tg: 'aa', fx: [{ buff: 'atk', v: 1, to: 'tg' }, { buff: 'def', v: 1, to: 'tg' }, { bp: 1, to: 'tg' }], an: 'buff' });
  sk('h_ak5', { n: '夜明け', d: '暁の鐘の光。敵全体に光の型の大技', sp: 30, k: 'atk', st: 'm', ty: 'hikari', pw: 270, tg: 'ea', ult: 1, an: 'dawn' });

  // ===== 甲賀 =====
  sk('sa_tori', { n: '口寄せ・小鳥', d: '風の型。小鳥がランダムに3回', sp: 5, k: 'atk', st: 'm', ty: 'kaze', pw: 45, tg: 'er', hits: 3, an: 'summon_bird' });
  sk('sa_ouen', { n: '応援', d: '味方ひとりの攻撃を上げ、印+1', sp: 4, k: 'sup', tg: 'a1', fx: [{ buff: 'atk', v: 1, to: 'tg' }, { bp: 1, to: 'tg' }], an: 'buff' });
  sk('sa_inu', { n: '口寄せ・山犬', d: '打の型。敵ひとりに', sp: 6, k: 'atk', st: 'p', ty: 'da', pw: 140, tg: 'e1', an: 'summon_dog' });
  sk('sa_mure', { n: '口寄せ・鳥の群れ', d: '風の型。ランダムに6回', sp: 12, k: 'atk', st: 'm', ty: 'kaze', pw: 40, tg: 'er', hits: 6, an: 'summon_bird' });
  sk('sa_ult', { n: '口寄せ・大鷲', d: '風の型の大技。味方のすばやさも上がる', sp: 28, k: 'atk', st: 'm', ty: 'kaze', pw: 210, tg: 'ea', fx: [{ buff: 'spd', v: 1, to: 'aa' }], ult: 1, an: 'summon_eagle' });

  sk('oe_shimyaku', { n: '糸脈', d: '味方ひとりを回復し、状態も治す', sp: 4, k: 'heal', pw: 140, tg: 'a1', fx: [{ cure: 1 }], an: 'heal' });
  sk('oe_yakusou', { n: '薬草調合', d: '味方全員を回復', sp: 8, k: 'heal', pw: 70, tg: 'aa', an: 'heal_all' });
  sk('oe_kitsuke', { n: '気付けの香', d: '倒れた仲間を起こす', sp: 10, k: 'heal', pw: 0, tg: 'ko', fx: [{ revive: 0.45 }], an: 'revive' });
  sk('oe_hako', { n: '薬箱の底力', d: '味方全員の守りを上げ、再生', sp: 12, k: 'sup', tg: 'aa', fx: [{ buff: 'def', v: 1, to: 'tg' }, { regen: 0.05, t: 3, to: 'tg' }], an: 'buff' });
  sk('oe_ult', { n: '秘伝・万能薬', d: '全員を大きく回復し、状態を治し、倒れた仲間も起こす', sp: 30, k: 'heal', pw: 200, tg: 'aa', fx: [{ cure: 1 }, { reviveAll: 0.3 }], ult: 1, an: 'heal_all' });

  sk('xl_panda', { n: '口寄せ・リーリー', d: '打の型。敵全体に。敵の攻撃を引きつける', sp: 6, k: 'atk', st: 'p', ty: 'da', pw: 80, tg: 'ea', fx: [{ taunt: 2 }], an: 'panda' });
  sk('xl_taikyoku', { n: '太極の構え', d: '守りを上げ、攻撃されたら反撃', sp: 4, k: 'sup', tg: 'me', fx: [{ counter: 3 }, { buff: 'def', v: 1, to: 'me' }], an: 'stance' });
  sk('xl_kikou', { n: '気功', d: '味方ひとりを回復', sp: 5, k: 'heal', pw: 120, tg: 'a1', an: 'heal' });
  sk('xl_kyodai', { n: '巨大リーリー', d: '打の型。敵ひとりに強く。怯ませることも', sp: 10, k: 'atk', st: 'p', ty: 'da', pw: 175, tg: 'e1', fx: [{ st: 'stun', ch: 0.3 }], an: 'panda_big' });
  sk('xl_ult', { n: '双掌・大熊猫', d: '打の型の大技。敵の攻撃を引きつけ、守りも上がる', sp: 26, k: 'atk', st: 'p', ty: 'da', pw: 165, tg: 'ea', fx: [{ taunt: 3 }, { buff: 'def', v: 1, to: 'me' }], ult: 1, an: 'panda_big' });

  sk('oto_usagi', { n: '口寄せ・兎の群れ', d: '打の型。兎がランダムに4回', sp: 6, k: 'atk', st: 'p', ty: 'da', pw: 40, tg: 'er', hits: 4, an: 'summon_rabbit' });
  sk('oto_hane', { n: '跳ね兎', d: '味方全員のすばやさを上げる', sp: 6, k: 'sup', tg: 'aa', fx: [{ buff: 'spd', v: 1, to: 'tg' }], an: 'buff' });
  sk('oto_mochi', { n: '月の餅', d: '味方ひとりを回復し、印+1', sp: 6, k: 'heal', pw: 120, tg: 'a1', fx: [{ bp: 1, to: 'tg' }], an: 'heal' });
  sk('oto_tora', { n: '虎の勇気', d: '味方全員の攻撃を上げる', sp: 10, k: 'sup', tg: 'aa', fx: [{ buff: 'atk', v: 1, to: 'tg' }], an: 'buff' });
  sk('oto_ult', { n: '兎の大行進', d: '打の型。兎がランダムに10回', sp: 26, k: 'atk', st: 'p', ty: 'da', pw: 42, tg: 'er', hits: 10, ult: 1, an: 'summon_rabbit' });

  sk('uka_kitsunebi', { n: '狐火', d: '火の型。敵ひとりに', sp: 4, k: 'atk', st: 'm', ty: 'hi', pw: 120, tg: 'e1', an: 'fire' });
  sk('uka_gofu', { n: '護符', d: '味方ひとりの守りを上げる', sp: 4, k: 'sup', tg: 'a1', fx: [{ buff: 'def', v: 1, to: 'tg' }], an: 'buff' });
  sk('uka_kyubi', { n: '九尾の焔', d: '火の型。敵全体に', sp: 9, k: 'atk', st: 'm', ty: 'hi', pw: 90, tg: 'ea', an: 'fire_all' });
  sk('uka_inari', { n: '稲荷の加護', d: '味方全員を回復', sp: 10, k: 'heal', pw: 65, tg: 'aa', an: 'heal_all' });
  sk('uka_ult', { n: '九尾・大炎舞', d: '火の型の大技。敵全体に', sp: 28, k: 'atk', st: 'm', ty: 'hi', pw: 205, tg: 'ea', ult: 1, an: 'fire_all' });

  sk('iz_izuna', { n: '飯綱の法', d: '風の型。怯ませることも', sp: 5, k: 'atk', st: 'm', ty: 'kaze', pw: 110, tg: 'e1', fx: [{ st: 'stun', ch: 0.25 }], an: 'wind' });
  sk('iz_uranai', { n: '占い', d: '敵ひとりの弱点をすべて見破る', sp: 3, k: 'sup', tg: 'e1', fx: [{ reveal: 'tg' }], an: 'reveal' });
  sk('iz_kuda', { n: '管狐', d: '風の型。ランダムに5回', sp: 9, k: 'atk', st: 'm', ty: 'kaze', pw: 36, tg: 'er', hits: 5, an: 'wind' });
  sk('iz_kago', { n: '狐の加護', d: '味方全員の印+1', sp: 14, k: 'sup', tg: 'aa', fx: [{ bp: 1, to: 'tg' }], an: 'buff' });
  sk('iz_ult', { n: '飯綱大権現', d: '風の型の大技。怯ませることも', sp: 28, k: 'atk', st: 'm', ty: 'kaze', pw: 205, tg: 'ea', fx: [{ st: 'stun', ch: 0.3 }], ult: 1, an: 'wind_all' });

  sk('nemu_ega', { n: '動植綵絵', d: '描いた生き物が出てくる。型は毎回ちがう', sp: 4, k: 'atk', st: 'm', ty: 'rand', pw: 105, tg: 'e1', an: 'paint' });
  sk('nemu_piyo', { n: 'ピヨチ', d: '味方ひとりを回復', sp: 4, k: 'heal', pw: 105, tg: 'a1', an: 'heal' });
  sk('nemu_usapi', { n: 'ウサピ', d: '味方ひとりのすばやさを上げ、印+1', sp: 5, k: 'sup', tg: 'a1', fx: [{ buff: 'spd', v: 1, to: 'tg' }, { bp: 1, to: 'tg' }], an: 'buff' });
  sk('nemu_emaki', { n: '動く絵巻', d: '型がちがう絵がランダムに5回', sp: 12, k: 'atk', st: 'm', ty: 'rand', pw: 42, tg: 'er', hits: 5, an: 'paint' });
  sk('nemu_ult', { n: '百花繚乱絵巻', d: '型がちがう絵がランダムに9回', sp: 28, k: 'atk', st: 'm', ty: 'rand', pw: 48, tg: 'er', hits: 9, ult: 1, an: 'paint' });

  sk('kg_hyaku', { n: '影分身・百烈拳', d: '打の型。敵ひとりに5回', sp: 7, k: 'atk', st: 'p', ty: 'da', pw: 32, tg: 'e1', hits: 5, an: 'punches' });
  sk('kg_tokkun', { n: '特訓', d: '味方ひとりの攻撃を上げ、印+1', sp: 5, k: 'sup', tg: 'a1', fx: [{ buff: 'atk', v: 1, to: 'tg' }, { bp: 1, to: 'tg' }], an: 'buff' });
  sk('kg_gu', { n: '親指グッ', d: '味方全員の守りを上げる', sp: 8, k: 'sup', tg: 'aa', fx: [{ buff: 'def', v: 1, to: 'tg' }], an: 'buff' });
  sk('kg_gouken', { n: '剛拳', d: '打の型。敵ひとりに強く', sp: 10, k: 'atk', st: 'p', ty: 'da', pw: 200, tg: 'e1', an: 'punch_big' });
  sk('kg_ult', { n: '影分身・千烈拳', d: '打の型。ランダムに14回', sp: 28, k: 'atk', st: 'p', ty: 'da', pw: 30, tg: 'er', hits: 14, ult: 1, an: 'punches' });

  sk('gz_shikkoku', { n: '幻術・漆黒', d: '敵全体を眠らせることがある', sp: 8, k: 'sup', tg: 'ea', fx: [{ st: 'sleep', ch: 0.5 }], an: 'dark_mist' });
  sk('gz_katsu', { n: '喝', d: '味方全員の悪い状態を治し、印+1', sp: 8, k: 'sup', tg: 'aa', fx: [{ cure: 1 }, { bp: 1, to: 'tg' }], an: 'buff' });
  sk('gz_juzu', { n: '数珠の光', d: '光の型。敵ひとりに', sp: 6, k: 'atk', st: 'm', ty: 'hikari', pw: 135, tg: 'e1', an: 'light' });
  sk('gz_chie', { n: '長老の知恵', d: '敵全体の弱点を見破り、味方の守りを上げる', sp: 10, k: 'sup', tg: 'ea', fx: [{ reveal: 'ea' }, { buff: 'def', v: 1, to: 'aa' }], an: 'reveal' });
  sk('gz_ult', { n: '幻術・常闇返し', d: '光の型の大技。眠らせることも', sp: 30, k: 'atk', st: 'm', ty: 'hikari', pw: 205, tg: 'ea', fx: [{ st: 'sleep', ch: 0.3 }], ult: 1, an: 'light_all' });

  // ===== 伊賀 =====
  sk('hy_takanome', { n: '鷹の目', d: '敵全体の弱点をすべて見破る', sp: 4, k: 'sup', tg: 'ea', fx: [{ reveal: 'ea' }], an: 'reveal' });
  sk('hy_kyuko', { n: 'ナルカミ急降下', d: '風の型。鷹が敵ひとりに', sp: 6, k: 'atk', st: 'p', ty: 'kaze', pw: 160, tg: 'e1', an: 'hawk' });
  sk('hy_shinan', { n: '指南', d: '味方ひとりの印+2', sp: 8, k: 'sup', tg: 'a1', fx: [{ bp: 2, to: 'tg' }], an: 'buff' });
  sk('hy_tsubasa', { n: '嵐の翼', d: '風の型。敵全体に', sp: 10, k: 'atk', st: 'm', ty: 'kaze', pw: 95, tg: 'ea', an: 'wind_all' });
  sk('hy_ult', { n: '鷹の目・天翔', d: '風の型。必ず当たる5回', sp: 28, k: 'atk', st: 'p', ty: 'kaze', pw: 70, tg: 'er', hits: 5, fx: [{ sure: 1 }], ult: 1, an: 'hawk' });

  sk('yui_sakura', { n: '桜吹雪', d: '味方全員を回復', sp: 8, k: 'heal', pw: 80, tg: 'aa', an: 'sakura' });
  sk('yui_hanaarashi', { n: '遠術・花嵐', d: '風の型。敵全体に', sp: 7, k: 'atk', st: 'm', ty: 'kaze', pw: 85, tg: 'ea', an: 'sakura_atk' });
  sk('yui_kekkai', { n: '桜の結界', d: '味方全員の守りを上げる', sp: 8, k: 'sup', tg: 'aa', fx: [{ buff: 'def', v: 1, to: 'tg' }], an: 'buff' });
  sk('yui_hanami', { n: '花見の宴', d: '倒れた仲間を起こし、元気にする', sp: 14, k: 'heal', pw: 0, tg: 'ko', fx: [{ revive: 0.6 }], an: 'revive' });
  sk('yui_ult', { n: '千本桜', d: '全員を大きく回復し、しばらく再生', sp: 30, k: 'heal', pw: 180, tg: 'aa', fx: [{ regen: 0.08, t: 3, to: 'tg' }], ult: 1, an: 'sakura' });

  sk('rei_migawari', { n: '身代わり', d: 'しばらく仲間への攻撃をかばう', sp: 5, k: 'sup', tg: 'me', fx: [{ cover: 3 }, { buff: 'def', v: 1, to: 'me' }], an: 'stance' });
  sk('rei_hitomi', { n: '人身御供', d: '倒れた仲間を全快で起こす。自分のHPは1になる', sp: 10, k: 'heal', pw: 0, tg: 'ko', fx: [{ sacrifice: 1 }], an: 'revive' });
  sk('rei_tsukikage', { n: '匕首・月影', d: '斬の型。会心が出やすい', sp: 6, k: 'atk', st: 'p', ty: 'zan', pw: 150, tg: 'e1', fx: [{ crit: 0.3 }], an: 'slash' });
  sk('rei_chikai', { n: '里守の誓い', d: '味方全員の守りを上げ、再生', sp: 12, k: 'sup', tg: 'aa', fx: [{ buff: 'def', v: 1, to: 'tg' }, { regen: 0.05, t: 3, to: 'tg' }], an: 'buff' });
  sk('rei_ult', { n: '母の守り', d: '全員を回復し、状態を治し、守りを上げる', sp: 30, k: 'heal', pw: 150, tg: 'aa', fx: [{ cure: 1 }, { buff: 'def', v: 1, to: 'tg' }], ult: 1, an: 'heal_all' });

  sk('an_kagenui', { n: '影縫い', d: '射の型。団子の串で影を縫い、怯ませる', sp: 5, k: 'atk', st: 'p', ty: 'sha', pw: 90, tg: 'e1', fx: [{ st: 'stun', ch: 0.6 }], an: 'needle' });
  sk('an_dango', { n: '三色団子', d: '味方全員を少し回復', sp: 6, k: 'heal', pw: 55, tg: 'aa', an: 'dango' });
  sk('an_kushi', { n: '串投げ乱れ打ち', d: '射の型。ランダムに4回', sp: 7, k: 'atk', st: 'p', ty: 'sha', pw: 40, tg: 'er', hits: 4, an: 'needle' });
  sk('an_okawari', { n: 'おかわり！', d: '味方全員を少し回復し、印+1', sp: 12, k: 'heal', pw: 30, tg: 'aa', fx: [{ bp: 1, to: 'tg' }], an: 'dango' });
  sk('an_ult', { n: '影縫い・千本串', d: '射の型。ランダムに6回。怯ませることも', sp: 28, k: 'atk', st: 'p', ty: 'sha', pw: 60, tg: 'er', hits: 6, fx: [{ st: 'stun', ch: 0.25 }], ult: 1, an: 'needle' });

  sk('sh_azami', { n: '野アザミ', d: '斬の型。そのあと反撃の構え', sp: 5, k: 'atk', st: 'p', ty: 'zan', pw: 120, tg: 'e1', fx: [{ counter: 2 }], an: 'claw' });
  sk('sh_ranbu', { n: '鉤爪乱舞', d: '斬の型。敵ひとりに3回', sp: 6, k: 'atk', st: 'p', ty: 'zan', pw: 45, tg: 'e1', hits: 3, an: 'claw' });
  sk('sh_hitomishiri', { n: '人見知り', d: '次の攻撃をかわし、すばやさを上げる', sp: 4, k: 'sup', tg: 'me', fx: [{ evade: 1 }, { buff: 'spd', v: 1, to: 'me' }], an: 'stance' });
  sk('sh_toge', { n: '茨の牙', d: '斬の型。敵全体に。毒にすることも', sp: 10, k: 'atk', st: 'p', ty: 'zan', pw: 72, tg: 'ea', fx: [{ st: 'poison', ch: 0.3 }], an: 'claw' });
  sk('sh_ult', { n: '野アザミ・紅蓮', d: '斬の型。敵ひとりに6回', sp: 26, k: 'atk', st: 'p', ty: 'zan', pw: 50, tg: 'e1', hits: 6, ult: 1, an: 'claw' });

  sk('tk_doku', { n: '毒手裏剣', d: '射の型。毒にすることも', sp: 4, k: 'atk', st: 'p', ty: 'sha', pw: 100, tg: 'e1', fx: [{ st: 'poison', ch: 0.6 }], an: 'shuriken' });
  sk('tk_oogoe', { n: '大声', d: '味方全員の眠りなどを治し、攻撃を上げる', sp: 7, k: 'sup', tg: 'aa', fx: [{ cure: 1 }, { buff: 'atk', v: 1, to: 'tg' }], an: 'shout' });
  sk('tk_hana', { n: '花の手裏剣', d: '射の型。ランダムに4回', sp: 7, k: 'atk', st: 'p', ty: 'sha', pw: 44, tg: 'er', hits: 4, an: 'shuriken' });
  sk('tk_mizuyari', { n: '水やり', d: '味方全員を回復し、しばらく再生', sp: 10, k: 'heal', pw: 60, tg: 'aa', fx: [{ regen: 0.05, t: 3, to: 'tg' }], an: 'heal_all' });
  sk('tk_ult', { n: '毒花繚乱', d: '射の型の大技。毒にすることも', sp: 26, k: 'atk', st: 'p', ty: 'sha', pw: 150, tg: 'ea', fx: [{ st: 'poison', ch: 0.5 }], ult: 1, an: 'shuriken' });

  sk('kr_rakurai', { n: '雷遁・落雷', d: '雷の型。敵ひとりに', sp: 5, k: 'atk', st: 'm', ty: 'rai', pw: 130, tg: 'e1', an: 'thunder' });
  sk('kr_raiun', { n: '雷遁・雷雲', d: '雷の型。敵全体に', sp: 9, k: 'atk', st: 'm', ty: 'rai', pw: 85, tg: 'ea', an: 'thunder_all' });
  sk('kr_kurobane', { n: '黒羽の舞', d: '味方全員のすばやさを上げる', sp: 8, k: 'sup', tg: 'aa', fx: [{ buff: 'spd', v: 1, to: 'tg' }], an: 'buff' });
  sk('kr_inazuma', { n: '稲妻落とし', d: '雷の型。ランダムに5回', sp: 12, k: 'atk', st: 'm', ty: 'rai', pw: 40, tg: 'er', hits: 5, an: 'thunder' });
  sk('kr_ult', { n: '雷遁・天鼓', d: '雷の型の大技。敵全体に', sp: 30, k: 'atk', st: 'm', ty: 'rai', pw: 225, tg: 'ea', ult: 1, an: 'thunder_all' });

  sk('kn_teppeki', { n: '金遁・鉄壁', d: '味方全員の守りを上げる', sp: 6, k: 'sup', tg: 'aa', fx: [{ buff: 'def', v: 1, to: 'tg' }], an: 'buff' });
  sk('kn_hagane', { n: '金遁・鋼の雨', d: '斬の型。敵全体に', sp: 8, k: 'atk', st: 'p', ty: 'zan', pw: 85, tg: 'ea', an: 'blades' });
  sk('kn_gyuto', { n: '牛刀・大断ち', d: '斬の型。敵ひとりに強く', sp: 8, k: 'atk', st: 'p', ty: 'zan', pw: 180, tg: 'e1', an: 'slash_big' });
  sk('kn_kitae', { n: '鍛え直し', d: '味方全員の攻撃を上げる', sp: 10, k: 'sup', tg: 'aa', fx: [{ buff: 'atk', v: 1, to: 'tg' }], an: 'buff' });
  sk('kn_ult', { n: '金遁・千本刃', d: '斬の型。ランダムに8回', sp: 28, k: 'atk', st: 'p', ty: 'zan', pw: 55, tg: 'er', hits: 8, ult: 1, an: 'blades' });

  sk('ss_mutou', { n: '無刀取り', d: '守りを上げ、攻撃されたら反撃', sp: 5, k: 'sup', tg: 'me', fx: [{ counter: 3 }, { buff: 'def', v: 1, to: 'me' }], an: 'stance' });
  sk('ss_ootenta', { n: '大典太・一閃', d: '斬の型。敵ひとりに強く', sp: 7, k: 'atk', st: 'p', ty: 'zan', pw: 170, tg: 'e1', an: 'slash_big' });
  sk('ss_kamae', { n: '新陰の構え', d: '自分の攻撃と守りを上げる', sp: 6, k: 'sup', tg: 'me', fx: [{ buff: 'atk', v: 1, to: 'me' }, { buff: 'def', v: 1, to: 'me' }], an: 'stance' });
  sk('ss_rantou', { n: '乱刀', d: '斬の型。敵全体に', sp: 10, k: 'atk', st: 'p', ty: 'zan', pw: 90, tg: 'ea', an: 'blades' });
  sk('ss_ult', { n: '無刀・極意', d: '斬の型。必ず当たる特大の一撃', sp: 28, k: 'atk', st: 'p', ty: 'zan', pw: 300, tg: 'e1', fx: [{ sure: 1 }, { crit: 0.3 }], ult: 1, an: 'slash_big' });

  sk('jin_goka', { n: '火遁・業火', d: '火の型。敵ひとりに強く', sp: 7, k: 'atk', st: 'm', ty: 'hi', pw: 170, tg: 'e1', an: 'fire' });
  sk('jin_rekka', { n: '火遁・烈火', d: '火の型。敵全体に', sp: 10, k: 'atk', st: 'm', ty: 'hi', pw: 110, tg: 'ea', an: 'fire_all' });
  sk('jin_kagebashiri', { n: '影走り', d: '自分のすばやさを上げ、印+1', sp: 4, k: 'sup', tg: 'me', fx: [{ buff: 'spd', v: 2, to: 'me' }, { bp: 1, to: 'me' }], an: 'stance' });
  sk('jin_samidare', { n: '手裏剣・五月雨', d: '射の型。ランダムに5回', sp: 8, k: 'atk', st: 'p', ty: 'sha', pw: 45, tg: 'er', hits: 5, an: 'shuriken' });
  sk('jin_ult', { n: '火遁・暁', d: '火の型の大技。敵全体に', sp: 30, k: 'atk', st: 'm', ty: 'hi', pw: 275, tg: 'ea', ult: 1, an: 'fire_all' });

  // ===== 雑賀 =====
  sk('sb_mizudeppou', { n: '水遁・水鉄砲', d: '水の型。敵ひとりに', sp: 4, k: 'atk', st: 'm', ty: 'mizu', pw: 115, tg: 'e1', an: 'water' });
  sk('sb_banken', { n: '番犬', d: 'しばらく仲間への攻撃をかばう', sp: 5, k: 'sup', tg: 'me', fx: [{ cover: 3 }, { buff: 'def', v: 1, to: 'me' }], an: 'stance' });
  sk('sb_seiken', { n: '空手・正拳突き', d: '打の型。敵ひとりに強く', sp: 7, k: 'atk', st: 'p', ty: 'da', pw: 170, tg: 'e1', an: 'punch_big' });
  sk('sb_tooboe', { n: '遠吠え', d: '味方全員の攻撃を上げる', sp: 9, k: 'sup', tg: 'aa', fx: [{ buff: 'atk', v: 1, to: 'tg' }], an: 'shout' });
  sk('sb_ult', { n: '水遁・大瀑布', d: '水の型の大技。敵全体に', sp: 28, k: 'atk', st: 'm', ty: 'mizu', pw: 210, tg: 'ea', ult: 1, an: 'water_all' });

  sk('hn_horoku', { n: '焙烙玉', d: '火の型。敵全体に', sp: 6, k: 'atk', st: 'm', ty: 'hi', pw: 85, tg: 'ea', an: 'bomb' });
  sk('hn_hibana', { n: '火花', d: '火の型。ランダムに3回', sp: 5, k: 'atk', st: 'm', ty: 'hi', pw: 42, tg: 'er', hits: 3, an: 'fire' });
  sk('hn_takibi', { n: '焚き火', d: '味方全員を回復し、しばらく再生', sp: 9, k: 'heal', pw: 55, tg: 'aa', fx: [{ regen: 0.05, t: 3, to: 'tg' }], an: 'heal_all' });
  sk('hn_hanabi', { n: '大花火', d: '火の型。敵全体に強く', sp: 14, k: 'atk', st: 'm', ty: 'hi', pw: 140, tg: 'ea', an: 'fireworks' });
  sk('hn_ult', { n: '雛之丞・百連発', d: '火の型。ランダムに10回', sp: 28, k: 'atk', st: 'm', ty: 'hi', pw: 45, tg: 'er', hits: 10, ult: 1, an: 'fireworks' });

  sk('ft_senpu', { n: '風遁・旋風', d: '風の型。敵全体に', sp: 7, k: 'atk', st: 'm', ty: 'kaze', pw: 85, tg: 'ea', an: 'wind_all' });
  sk('ft_nigeashi', { n: '逃げ足', d: 'かならず逃げる（ボス戦では使えない）', sp: 2, k: 'sup', tg: 'me', fx: [{ escape: 1 }], an: 'wind' });
  sk('ft_honki', { n: '本気の一太刀', d: '斬の型。自分のHPが少ないほど強い', sp: 7, k: 'atk', st: 'p', ty: 'zan', pw: 150, tg: 'e1', fx: [{ lowhp: 1 }], an: 'slash_big' });
  sk('ft_hitoyasumi', { n: 'ひと休み', d: '味方全員を少し回復', sp: 8, k: 'heal', pw: 50, tg: 'aa', an: 'heal_all' });
  sk('ft_ult', { n: '風遁・神風', d: '風の型の大技。敵全体に', sp: 28, k: 'atk', st: 'p', ty: 'kaze', pw: 215, tg: 'ea', ult: 1, an: 'wind_all' });

  sk('ng_bunshin', { n: '影分身', d: '次の攻撃が2倍の回数になる。印+1', sp: 4, k: 'sup', tg: 'me', fx: [{ clone: 1 }, { bp: 1, to: 'me' }], an: 'clone' });
  sk('ng_tsuki', { n: '分身突き', d: '斬の型。敵ひとりに3回', sp: 6, k: 'atk', st: 'p', ty: 'zan', pw: 42, tg: 'e1', hits: 3, an: 'claw' });
  sk('ng_souji', { n: 'お掃除', d: '味方全員の状態を治し、少し回復', sp: 8, k: 'heal', pw: 40, tg: 'aa', fx: [{ cure: 1 }], an: 'heal_all' });
  sk('ng_kage', { n: '影の群れ', d: '打の型。ランダムに5回', sp: 10, k: 'atk', st: 'p', ty: 'da', pw: 45, tg: 'er', hits: 5, an: 'clone' });
  sk('ng_ult', { n: '影分身・百人掃き', d: '打の型。ランダムに10回', sp: 28, k: 'atk', st: 'p', ty: 'da', pw: 40, tg: 'er', hits: 10, ult: 1, an: 'clone' });

  sk('nk_muramasa', { n: '妖刀村正', d: '斬の型。会心が出やすい', sp: 5, k: 'atk', st: 'p', ty: 'zan', pw: 140, tg: 'e1', fx: [{ crit: 0.4 }], an: 'slash' });
  sk('nk_bunshin', { n: '分身の術', d: '斬の型。敵ひとりに2回', sp: 5, k: 'atk', st: 'p', ty: 'zan', pw: 70, tg: 'e1', hits: 2, an: 'clone' });
  sk('nk_sakana', { n: '魚の力', d: '自分を大きく回復し、攻撃を上げる', sp: 6, k: 'heal', pw: 150, tg: 'me', fx: [{ buff: 'atk', v: 1, to: 'me' }], an: 'heal' });
  sk('nk_tsume', { n: '猫の爪', d: '斬の型。ランダムに4回', sp: 9, k: 'atk', st: 'p', ty: 'zan', pw: 55, tg: 'er', hits: 4, an: 'claw' });
  sk('nk_ult', { n: '村正・百鬼斬り', d: '斬の型の大技。会心が出やすい', sp: 28, k: 'atk', st: 'p', ty: 'zan', pw: 150, tg: 'ea', fx: [{ crit: 0.3 }], ult: 1, an: 'slash_big' });

  sk('bt_norito', { n: '祝詞', d: '味方全員の攻撃と守りを上げる', sp: 10, k: 'sup', tg: 'aa', fx: [{ buff: 'atk', v: 1, to: 'tg' }, { buff: 'def', v: 1, to: 'tg' }], an: 'music' });
  sk('bt_shirabe', { n: '三味線の調べ', d: '味方全員を回復し、状態を治す', sp: 9, k: 'heal', pw: 85, tg: 'aa', fx: [{ cure: 1 }], an: 'music' });
  sk('bt_komori', { n: '子守唄', d: '敵全体を眠らせることがある', sp: 8, k: 'sup', tg: 'ea', fx: [{ st: 'sleep', ch: 0.45 }], an: 'music' });
  sk('bt_bachi', { n: '撥さばき', d: '光の型。敵全体に', sp: 10, k: 'atk', st: 'm', ty: 'hikari', pw: 110, tg: 'ea', an: 'light_all' });
  sk('bt_ult', { n: '雑賀祭囃子', d: '全員を回復し、印+1、攻撃も上がる', sp: 32, k: 'heal', pw: 150, tg: 'aa', fx: [{ bp: 1, to: 'tg' }, { buff: 'atk', v: 1, to: 'tg' }], ult: 1, an: 'music' });

  sk('ic_iroha', { n: '忍びいろは', d: '味方全員のすばやさを上げる', sp: 7, k: 'sup', tg: 'aa', fx: [{ buff: 'spd', v: 1, to: 'tg' }], an: 'rainbow' });
  sk('ic_niji', { n: '虹文字', d: '光の型。ランダムに3回', sp: 5, k: 'atk', st: 'm', ty: 'hikari', pw: 45, tg: 'er', hits: 3, an: 'rainbow' });
  sk('ic_denrei', { n: '伝令', d: '味方ひとりの印+2', sp: 7, k: 'sup', tg: 'a1', fx: [{ bp: 2, to: 'tg' }], an: 'buff' });
  sk('ic_fumi', { n: '文の結界', d: '味方全員の守りを上げる', sp: 8, k: 'sup', tg: 'aa', fx: [{ buff: 'def', v: 1, to: 'tg' }], an: 'buff' });
  sk('ic_ult', { n: '天翔ける虹文字', d: '光の型。ランダムに8回。絆ゲージもたまる', sp: 28, k: 'atk', st: 'm', ty: 'hikari', pw: 50, tg: 'er', hits: 8, fx: [{ kz: 15 }], ult: 1, an: 'rainbow' });

  sk('so_ushi', { n: '丑の刻参り', d: '敵ひとりを呪う。毎ターンダメージ', sp: 6, k: 'sup', tg: 'e1', fx: [{ curse: 45, t: 4 }], an: 'curse' });
  sk('so_mitama', { n: 'ミタマ', d: '水の型。与えたダメージの半分を回復', sp: 6, k: 'atk', st: 'm', ty: 'mizu', pw: 110, tg: 'e1', fx: [{ drain: 0.5 }], an: 'ghost' });
  sk('so_harae', { n: '祓え', d: '味方全員の状態を治し、少し回復', sp: 8, k: 'heal', pw: 50, tg: 'aa', fx: [{ cure: 1 }], an: 'heal_all' });
  sk('so_kizuchi', { n: '木槌・五寸釘', d: '打の型。敵の守りを下げる', sp: 8, k: 'atk', st: 'p', ty: 'da', pw: 160, tg: 'e1', fx: [{ buff: 'def', v: -1, to: 'tg' }], an: 'hammer' });
  sk('so_ult', { n: '瀬織津の大祓', d: '水の型の大技。敵全体に', sp: 28, k: 'atk', st: 'm', ty: 'mizu', pw: 205, tg: 'ea', ult: 1, an: 'water_all' });

  sk('qn_nekonome', { n: '猫の目の選択', d: 'いい未来をえらぶ。何が起きるかは、その時しだい', sp: 12, k: 'sup', tg: 'me', fx: [{ fortune: 1 }], an: 'fortune' });
  sk('qn_onibi', { n: '鬼火', d: '火の型。ランダムに3回', sp: 5, k: 'atk', st: 'm', ty: 'hi', pw: 42, tg: 'er', hits: 3, an: 'onibi' });
  sk('qn_sakiyomi', { n: '先読み', d: '味方全員が次の攻撃を1回かわす', sp: 10, k: 'sup', tg: 'aa', fx: [{ evade: 1, to: 'tg' }], an: 'buff' });
  sk('qn_fuku', { n: '福招き', d: '絆ゲージが大きくたまる', sp: 10, k: 'sup', tg: 'me', fx: [{ kz: 30 }], an: 'fortune' });
  sk('qn_ult', { n: '量子の選択', d: 'いい未来を2回えらぶ', sp: 30, k: 'sup', tg: 'me', fx: [{ fortune: 2 }], ult: 1, an: 'fortune' });

  sk('mg_ippatsu', { n: '一発必中', d: '射の型。必ず当たり、会心が出やすい', sp: 6, k: 'atk', st: 'p', ty: 'sha', pw: 150, tg: 'e1', fx: [{ sure: 1 }, { crit: 0.5 }], an: 'gun' });
  sk('mg_gourei', { n: '号令', d: '味方全員のすばやさを上げる', sp: 7, k: 'sup', tg: 'aa', fx: [{ buff: 'spd', v: 1, to: 'tg' }], an: 'shout' });
  sk('mg_nerai', { n: '狙い撃ち', d: '射の型。必ず当たる強い一発', sp: 9, k: 'atk', st: 'p', ty: 'sha', pw: 220, tg: 'e1', fx: [{ sure: 1 }], an: 'gun' });
  sk('mg_rensha', { n: '二丁連射', d: '射の型。ランダムに4回', sp: 9, k: 'atk', st: 'p', ty: 'sha', pw: 50, tg: 'er', hits: 4, an: 'gun' });
  sk('mg_ult', { n: '雑賀・大砲撃', d: '射の型の大技。必ず当たる', sp: 30, k: 'atk', st: 'p', ty: 'sha', pw: 200, tg: 'ea', fx: [{ sure: 1 }], ult: 1, an: 'cannon' });

  // ===== 風魔 =====
  sk('kh_kawarimi', { n: '変わり身', d: '次の攻撃をかわして反撃する', sp: 4, k: 'sup', tg: 'me', fx: [{ evade: 1 }, { counter: 1 }], an: 'clone' });
  sk('kh_issen', { n: '狐一閃', d: '斬の型。会心が出やすい', sp: 6, k: 'atk', st: 'p', ty: 'zan', pw: 150, tg: 'e1', fx: [{ crit: 0.3 }], an: 'slash' });
  sk('kh_kagenoha', { n: '影の刃', d: '斬の型。敵全体に', sp: 9, k: 'atk', st: 'p', ty: 'zan', pw: 85, tg: 'ea', an: 'blades' });
  sk('kh_kitsunebi', { n: '狐火返し', d: '火の型。敵ひとりに', sp: 6, k: 'atk', st: 'm', ty: 'hi', pw: 120, tg: 'e1', an: 'fire' });
  sk('kh_ult', { n: '白狐・千影', d: '斬の型。ランダムに7回', sp: 28, k: 'atk', st: 'p', ty: 'zan', pw: 55, tg: 'er', hits: 7, ult: 1, an: 'blades' });

  sk('at_oumagatoki', { n: '逢魔刻', d: '打の型。自分のHPが少ないほど強い', sp: 6, k: 'atk', st: 'p', ty: 'da', pw: 120, tg: 'e1', fx: [{ lowhp: 1 }], an: 'club' });
  sk('at_randa', { n: '金棒乱打', d: '打の型。ランダムに3回', sp: 7, k: 'atk', st: 'p', ty: 'da', pw: 52, tg: 'er', hits: 3, an: 'club' });
  sk('at_ninjo', { n: '人情', d: 'しばらく仲間への攻撃をかばう', sp: 5, k: 'sup', tg: 'me', fx: [{ cover: 3 }, { buff: 'def', v: 1, to: 'me' }], an: 'stance' });
  sk('at_houkou', { n: '風魔の咆哮', d: '敵全体の守りを下げる', sp: 10, k: 'sup', tg: 'ea', fx: [{ buff: 'def', v: -1, to: 'tg' }], an: 'shout' });
  sk('at_ult', { n: '逢魔刻・大禍', d: '打の型の大技。HPが少ないほど強い', sp: 30, k: 'atk', st: 'p', ty: 'da', pw: 160, tg: 'ea', fx: [{ lowhp: 1 }], ult: 1, an: 'club' });

  sk('au_kyojin', { n: '巨人の一撃', d: '打の型。敵ひとりにとても強く', sp: 9, k: 'atk', st: 'p', ty: 'da', pw: 230, tg: 'e1', an: 'giant' });
  sk('au_kyodaika', { n: '巨大化', d: '自分の攻撃を大きく上げる', sp: 6, k: 'sup', tg: 'me', fx: [{ buff: 'atk', v: 2, to: 'me' }], an: 'giant' });
  sk('au_jinarashi', { n: '地ならし', d: '打の型。敵全体に。怯ませることも', sp: 10, k: 'atk', st: 'p', ty: 'da', pw: 90, tg: 'ea', fx: [{ st: 'stun', ch: 0.15 }], an: 'quake' });
  sk('au_niou', { n: '仁王立ち', d: '敵の攻撃を引きつけ、守りを上げる', sp: 5, k: 'sup', tg: 'me', fx: [{ taunt: 3 }, { buff: 'def', v: 1, to: 'me' }], an: 'stance' });
  sk('au_ult', { n: '巨人の大鉄槌', d: '打の型の特大の一撃', sp: 28, k: 'atk', st: 'p', ty: 'da', pw: 330, tg: 'e1', ult: 1, an: 'giant' });

  sk('rt_dokugiri', { n: '毒霧', d: '敵全体を毒にすることがある', sp: 7, k: 'sup', tg: 'ea', fx: [{ st: 'poison', ch: 0.7 }], an: 'poison_mist' });
  sk('rt_dokuya', { n: '毒矢', d: '射の型。毒にすることも', sp: 4, k: 'atk', st: 'p', ty: 'sha', pw: 110, tg: 'e1', fx: [{ st: 'poison', ch: 0.6 }], an: 'arrow' });
  sk('rt_hirune', { n: '昼寝', d: '自分を大きく回復し、しばらく再生', sp: 5, k: 'heal', pw: 200, tg: 'me', fx: [{ regen: 0.08, t: 3, to: 'me' }], an: 'heal' });
  sk('rt_kusare', { n: '腐れの霧', d: '敵全体の攻撃と守りを下げる', sp: 10, k: 'sup', tg: 'ea', fx: [{ buff: 'atk', v: -1, to: 'tg' }, { buff: 'def', v: -1, to: 'tg' }], an: 'poison_mist' });
  sk('rt_ult', { n: '大毒霧', d: '風の型の大技。毒にすることも', sp: 26, k: 'atk', st: 'm', ty: 'kaze', pw: 150, tg: 'ea', fx: [{ st: 'poison', ch: 0.8 }], ult: 1, an: 'poison_mist' });

  sk('dn_senko', { n: '閃光', d: '光の型。敵全体に。怯ませることも', sp: 8, k: 'atk', st: 'm', ty: 'hikari', pw: 80, tg: 'ea', fx: [{ st: 'stun', ch: 0.15 }], an: 'flash' });
  sk('dn_senkozan', { n: '閃光斬', d: '光の型。敵ひとりに強く', sp: 6, k: 'atk', st: 'p', ty: 'hikari', pw: 160, tg: 'e1', an: 'light_slash' });
  sk('dn_kasoku', { n: '起動・加速', d: '自分のすばやさを大きく上げ、印+1', sp: 4, k: 'sup', tg: 'me', fx: [{ buff: 'spd', v: 2, to: 'me' }, { bp: 1, to: 'me' }], an: 'stance' });
  sk('dn_homura', { n: '閃光刀・焔', d: '火の型。敵ひとりに', sp: 6, k: 'atk', st: 'p', ty: 'hi', pw: 140, tg: 'e1', an: 'fire' });
  sk('dn_ult', { n: '閃光・千光斬', d: '光の型。ランダムに6回', sp: 28, k: 'atk', st: 'p', ty: 'hikari', pw: 60, tg: 'er', hits: 6, ult: 1, an: 'light_slash' });

  sk('km_doujutsu', { n: '瞳術', d: '赤い目で敵ひとりを怯ませる', sp: 5, k: 'sup', tg: 'e1', fx: [{ st: 'stun', ch: 0.75 }], an: 'eye' });
  sk('km_ryouiki', { n: '領域・罪業', d: '敵全体の守りを下げる', sp: 8, k: 'sup', tg: 'ea', fx: [{ buff: 'def', v: -1, to: 'tg' }], an: 'domain' });
  sk('km_kusarigama', { n: '鎖鎌・旋回', d: '斬の型。敵全体に', sp: 8, k: 'atk', st: 'p', ty: 'zan', pw: 85, tg: 'ea', an: 'chain' });
  sk('km_akame', { n: '赤い目', d: '敵全体の攻撃を下げる', sp: 8, k: 'sup', tg: 'ea', fx: [{ buff: 'atk', v: -1, to: 'tg' }], an: 'eye' });
  sk('km_ult', { n: '領域・罪業の檻', d: '斬の型の大技。敵の守りも下げる', sp: 28, k: 'atk', st: 'p', ty: 'zan', pw: 145, tg: 'ea', fx: [{ buff: 'def', v: -1, to: 'tg' }], ult: 1, an: 'domain' });

  sk('jn_orochi', { n: '口寄せ・大蛇', d: '水の型。敵全体に', sp: 8, k: 'atk', st: 'm', ty: 'mizu', pw: 85, tg: 'ea', an: 'snake' });
  sk('jn_dokushuriken', { n: '毒手裏剣', d: '射の型。毒にすることも', sp: 4, k: 'atk', st: 'p', ty: 'sha', pw: 100, tg: 'e1', fx: [{ st: 'poison', ch: 0.5 }], an: 'shuriken' });
  sk('jn_shime', { n: 'オロチの締めつけ', d: '打の型。怯ませることも', sp: 7, k: 'atk', st: 'p', ty: 'da', pw: 130, tg: 'e1', fx: [{ st: 'stun', ch: 0.4 }], an: 'snake' });
  sk('jn_dappi', { n: '脱皮', d: '自分を大きく回復し、状態を治す', sp: 5, k: 'heal', pw: 150, tg: 'me', fx: [{ cure: 1 }], an: 'heal' });
  sk('jn_ult', { n: '八岐の大蛇', d: '水の型。ランダムに8回', sp: 28, k: 'atk', st: 'm', ty: 'mizu', pw: 50, tg: 'er', hits: 8, ult: 1, an: 'snake' });

  sk('ib_taizan', { n: '泰山府君祭', d: '倒れた仲間を起こし、しばらく再生', sp: 12, k: 'heal', pw: 0, tg: 'ko', fx: [{ revive: 0.6 }, { regen: 0.06, t: 3, to: 'tg' }], an: 'revive' });
  sk('ib_yama', { n: '式神ヤーマ', d: '光の型。敵ひとりに', sp: 5, k: 'atk', st: 'm', ty: 'hikari', pw: 125, tg: 'e1', an: 'imp' });
  sk('ib_fuin', { n: '呪符・封', d: '敵ひとりの術を封じることがある', sp: 5, k: 'sup', tg: 'e1', fx: [{ st: 'seal', ch: 0.7 }], an: 'talisman' });
  sk('ib_gohou', { n: '護法', d: '味方全員を回復', sp: 9, k: 'heal', pw: 85, tg: 'aa', an: 'heal_all' });
  sk('ib_ult', { n: '閻魔の裁き', d: '光の型の大技。敵全体に', sp: 28, k: 'atk', st: 'm', ty: 'hikari', pw: 210, tg: 'ea', ult: 1, an: 'imp' });

  // ===== 天界・根の国 =====
  sk('st_nehan', { n: '涅槃', d: '全員を全回復し、倒れた仲間も起こす', sp: 40, k: 'heal', pw: 999, tg: 'aa', fx: [{ reviveAll: 1 }, { cure: 1 }], an: 'nirvana' });
  sk('st_enkou', { n: '円光', d: '光の型。敵全体に', sp: 10, k: 'atk', st: 'm', ty: 'hikari', pw: 120, tg: 'ea', an: 'light_all' });
  sk('st_jihi', { n: '慈悲', d: '味方全員がしばらく再生', sp: 10, k: 'sup', tg: 'aa', fx: [{ regen: 0.1, t: 3, to: 'tg' }], an: 'heal_all' });
  sk('st_kago', { n: '天の加護', d: '味方全員の状態を治し、守りを上げる', sp: 10, k: 'sup', tg: 'aa', fx: [{ cure: 1 }, { buff: 'def', v: 1, to: 'tg' }], an: 'buff' });
  sk('st_ult', { n: '天界の光', d: '光の型の大技。敵全体に', sp: 32, k: 'atk', st: 'm', ty: 'hikari', pw: 255, tg: 'ea', ult: 1, an: 'light_all' });

  sk('sg_ito', { n: '縁の糸', d: '敵全体のすばやさを下げる。怯ませることも', sp: 7, k: 'sup', tg: 'ea', fx: [{ buff: 'spd', v: -1, to: 'tg' }, { st: 'stun', ch: 0.2 }], an: 'thread' });
  sk('sg_tourou', { n: '灯籠流し', d: '光の型。敵全体に', sp: 9, k: 'atk', st: 'm', ty: 'hikari', pw: 90, tg: 'ea', an: 'lanterns' });
  sk('sg_kanzashi', { n: '簪の舞', d: '射の型。ランダムに4回', sp: 7, k: 'atk', st: 'p', ty: 'sha', pw: 42, tg: 'er', hits: 4, an: 'needle' });
  sk('sg_douchu', { n: '花魁道中', d: '敵全体の攻撃を下げる', sp: 8, k: 'sup', tg: 'ea', fx: [{ buff: 'atk', v: -1, to: 'tg' }], an: 'thread' });
  sk('sg_ult', { n: '根の国の灯', d: '光の型の大技。味方も少し回復', sp: 30, k: 'atk', st: 'm', ty: 'hikari', pw: 215, tg: 'ea', fx: [{ healAll: 60 }], ult: 1, an: 'lanterns' });

  // ===== 絆技（2人そろうと使える。絆ゲージ100）=====
  var KIZUNA = [
    { id: 'kz_twins', a: 'sakuya', b: 'kohaku', n: '双子口寄せ・紅白狐', d: '風と斬の型で敵全体に。構えを大きく削る', st: 'm', tys: ['kaze', 'zan'], pw: 120, tg: 'ea', fx: [{ shield: 1 }] },
    { id: 'kz_brothers', a: 'atoza', b: 'aum', n: '兄弟豪打', d: '打の型の特大の一撃', st: 'p', tys: ['da'], pw: 520, tg: 'e1', fx: [{ shield: 2 }] },
    { id: 'kz_oyako', a: 'yui', b: 'rei', n: '親子結界', d: '全員を大きく回復し、守りを上げる', k: 'heal', pw: 220, tg: 'aa', fx: [{ cure: 1 }, { reviveAll: 0.5 }, { buff: 'def', v: 1, to: 'tg' }] },
    { id: 'kz_rainbow', a: 'ichiya', b: 'nemu', n: '虹の絵巻', d: '光の型で敵全体に。全員の印+1', st: 'm', tys: ['hikari', 'rand'], pw: 115, tg: 'ea', fx: [{ bp: 1, to: 'aa' }] },
    { id: 'kz_rivals', a: 'oto', b: 'uka', n: '兎と狐の大合戦', d: '打と火の型。ランダムに8回', st: 'm', tys: ['da', 'hi'], pw: 70, tg: 'er', hits: 8 },
    { id: 'kz_sisters', a: 'uka', b: 'izuna', n: '狐姉妹・九尾飯綱', d: '火と風の型で敵全体に', st: 'm', tys: ['hi', 'kaze'], pw: 125, tg: 'ea' },
    { id: 'kz_nekome', a: 'nekomata', b: 'quon', n: '猫の目・妖刀', d: '斬の型。必ず会心', st: 'p', tys: ['zan'], pw: 360, tg: 'e1', fx: [{ crit: 1 }, { sure: 1 }] },
    { id: 'kz_dango', a: 'anne', b: 'shion', n: '団子と野アザミ', d: '敵全体を怯ませ、斬の型で3回', st: 'p', tys: ['zan'], pw: 80, tg: 'er', hits: 3, fx: [{ stunAll: 0.8 }] },
    { id: 'kz_fuma', a: 'rotten', b: 'dan', n: '風魔の毒閃', d: '光の型で敵全体に。毒にもする', st: 'm', tys: ['hikari'], pw: 190, tg: 'ea', fx: [{ st: 'poison', ch: 0.9 }] },
    { id: 'kz_saika', a: 'benten', b: 'magoichi', n: '雑賀の大号砲', d: '射の型で敵全体に。必ず当たる', st: 'p', tys: ['sha'], pw: 230, tg: 'ea', fx: [{ sure: 1 }] },
    { id: 'kz_wings', a: 'hayate', b: 'karura', n: '空の双翼', d: '雷と風の型で敵全体に', st: 'm', tys: ['rai', 'kaze'], pw: 125, tg: 'ea' },
    { id: 'kz_shitei', a: 'konga', b: 'xiaolan', n: '師弟の剛拳', d: '打の型。ランダムに6回', st: 'p', tys: ['da'], pw: 85, tg: 'er', hits: 6 },
    { id: 'kz_meitou', a: 'kanaoni', b: 'sekishusai', n: '名刀・大典太', d: '斬の型の特大の一撃', st: 'p', tys: ['zan'], pw: 520, tg: 'e1', fx: [{ shield: 2 }] },
    { id: 'kz_hanabi', a: 'hinanojoh', b: 'fuuta', n: '風火の大花火', d: '火と風の型で敵全体に', st: 'm', tys: ['hi', 'kaze'], pw: 125, tg: 'ea' },
    { id: 'kz_tenne', a: 'sattva', b: 'sasagane', n: '天と根の灯', d: '全員全回復。倒れた仲間も起きる', k: 'heal', pw: 999, tg: 'aa', fx: [{ cure: 1 }, { reviveAll: 1 }, { bp: 1, to: 'tg' }] },
    { id: 'kz_akatsuki', a: 'hero', b: 'jin', n: '暁の継承', d: '光と火の型の特大の全体攻撃', st: 'm', tys: ['hikari', 'hi'], pw: 190, tg: 'ea', fx: [{ shield: 1 }] }
  ];
  var KIZUNA_BY = {}; KIZUNA.forEach(function (z) { z.k = z.k || 'atk'; KIZUNA_BY[z.id] = z; });
  var SOUGAKARI = { id: 'sougakari', n: '総がかり', d: '前列の全員が、自分の型で1回ずつ攻撃する', pw: 120 };

  var api = { SKILLS: S, KIZUNA: KIZUNA, KIZUNA_BY: KIZUNA_BY, SOUGAKARI: SOUGAKARI };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_SKILLS = api;
})(typeof window !== 'undefined' ? window : globalThis);
