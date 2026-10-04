/* ニンジャ夜明け隊（RPG） — 主人公と39人の仲間
 * arch: 能力の伸び方（data_base.js の ARCH）  mods: その人らしさ（能力の倍率）
 * wt: こうげきの型  wn: 武器の名前（公式の武器）  wmag: こうげきが忍術の力で当たる（護符・羽など）
 * sk: [忍術, 覚えるレベル]  join: 仲間になるときの最低レベル  field: 探索の術
 * 見た目と公式データ（名前・クラン・忍術・誕生日・紹介文）は ../ninja-sato-life/chars.js（NSL_CHARS）を使う。
 */
(function (root) {
  'use strict';
  var C = {};
  function ch(id, o) { o.id = id; C[id] = o; }

  ch('hero', { arch: 'all', roles: ['all'], wt: 'zan', wn: '忍刀', join: 1, story: 1,
    sk: [['h_hi', 1], ['h_mizu', 3], ['h_kaze', 6], ['h_rai', 12]] });

  // ---- 甲賀 ----
  ch('sakuya', { arch: 'sup', roles: ['sup', 'atk'], wt: 'sha', wn: '手裏剣', mods: { spd: 1.05, atk: 1.05 }, join: 1, story: 1,
    sk: [['sa_tori', 1], ['sa_ouen', 1], ['sa_inu', 7], ['sa_mure', 14], ['sa_ult', 24]] });
  ch('oen', { arch: 'heal', roles: ['heal'], wt: 'da', wn: '笈（薬箱）', mods: { hp: 1.05 }, join: 3, story: 1,
    sk: [['oe_shimyaku', 1], ['oe_yakusou', 3], ['oe_kitsuke', 7], ['oe_hako', 15], ['oe_ult', 24]] });
  ch('xiaolan', { arch: 'tank', roles: ['tank'], wt: 'da', wn: '太極拳', mods: { atk: 1.05 }, join: 4, story: 1, field: 'push',
    sk: [['xl_panda', 1], ['xl_taikyoku', 1], ['xl_kikou', 9], ['xl_kyodai', 16], ['xl_ult', 25]] });
  ch('oto', { arch: 'sup', roles: ['sup'], wt: 'da', wn: '巻物', mods: { spd: 1.1, hp: 0.95 }, join: 4,
    sk: [['oto_usagi', 1], ['oto_hane', 1], ['oto_mochi', 10], ['oto_tora', 18], ['oto_ult', 26]],
    hint: '甲賀の里の広場で、兎を呼ぶ練習をしている子がいる。狐火の森には、その子のライバルがいるらしい' });
  ch('uka', { arch: 'mag', roles: ['mag'], wt: 'hi', wn: '護符', wmag: 1, mods: { mag: 1.05 }, join: 4,
    sk: [['uka_kitsunebi', 1], ['uka_gofu', 1], ['uka_kyubi', 9], ['uka_inari', 17], ['uka_ult', 25]],
    hint: '狐火の森の稲荷の祠に、狐を連れた巫女がいる。兎を呼ぶ子と張り合っているらしい' });
  ch('izuna', { arch: 'mag', roles: ['sup', 'mag'], wt: 'kaze', wn: '飯綱の狐', wmag: 1, mods: { spd: 1.05 }, join: 5,
    sk: [['iz_izuna', 1], ['iz_uranai', 1], ['iz_kuda', 11], ['iz_kago', 19], ['iz_ult', 26]],
    hint: '稲荷の祠のおくに、宇迦のお姉さんがいる。妹が仲間になったら会いに行こう' });
  ch('nemu', { arch: 'mag', roles: ['mag'], wt: 'sha', wn: '絵筆', mods: { luk: 1.2 }, join: 4,
    sk: [['nemu_ega', 1], ['nemu_piyo', 1], ['nemu_usapi', 10], ['nemu_emaki', 18], ['nemu_ult', 26]],
    hint: '甲賀の里の絵描きが、狐火の森に絵を3枚なくしたらしい' });
  ch('konga', { arch: 'atk', roles: ['atk'], wt: 'da', wn: '拳', mods: { hp: 1.1, spd: 0.92 }, join: 5,
    sk: [['kg_hyaku', 1], ['kg_tokkun', 1], ['kg_gu', 10], ['kg_gouken', 18], ['kg_ult', 25]],
    hint: '甲賀の里の修行場に、組手の相手をさがしている大きな先生がいる' });
  ch('ganzi', { arch: 'mag', roles: ['mag', 'sup'], wt: 'hikari', wn: '数珠', wmag: 1, mods: { mdf: 1.15, spd: 0.9 }, join: 24,
    sk: [['gz_shikkoku', 1], ['gz_katsu', 1], ['gz_juzu', 1], ['gz_chie', 1], ['gz_ult', 27]],
    hint: '風魔の砦の戦いのあと、甲賀の里の岩爺に会いに行こう' });

  // ---- 伊賀 ----
  ch('hayate', { arch: 'sup', roles: ['sup', 'atk'], wt: 'kaze', wn: '鷹（ナルカミ）', mods: { atk: 1.1 }, join: 9, story: 1, field: 'hawk',
    sk: [['hy_takanome', 1], ['hy_kyuko', 1], ['hy_shinan', 14], ['hy_tsubasa', 20], ['hy_ult', 27]] });
  ch('yui', { arch: 'heal', roles: ['heal'], wt: 'kaze', wn: '巻物', wmag: 1, mods: { mag: 1.05 }, join: 10, story: 1,
    sk: [['yui_sakura', 1], ['yui_hanaarashi', 1], ['yui_kekkai', 12], ['yui_hanami', 18], ['yui_ult', 26]] });
  ch('rei', { arch: 'tank', roles: ['tank', 'heal'], wt: 'zan', wn: '匕首', mods: { mag: 1.15 }, join: 11,
    sk: [['rei_migawari', 1], ['rei_hitomi', 1], ['rei_tsukikage', 14], ['rei_chikai', 20], ['rei_ult', 27]],
    hint: '娘の結が仲間になったら、伊賀の里の令に会いに行こう' });
  ch('anne', { arch: 'sup', roles: ['sup'], wt: 'sha', wn: '団子の串', mods: { luk: 1.2 }, join: 10,
    sk: [['an_kagenui', 1], ['an_dango', 1], ['an_kushi', 14], ['an_okawari', 20], ['an_ult', 27]],
    hint: '伊賀の里の団子屋さんが、いなくなった友だちをさがしている' });
  ch('shion', { arch: 'atk', roles: ['atk'], wt: 'zan', wn: '鉤爪', mods: { spd: 1.12, hp: 0.92 }, join: 10,
    sk: [['sh_azami', 1], ['sh_ranbu', 1], ['sh_hitomishiri', 16], ['sh_toge', 21], ['sh_ult', 27]],
    hint: '霧の山道のどこかに、ひとりで隠れている子がいる。鷹の目なら見つけられるかも' });
  ch('torika', { arch: 'atk', roles: ['atk'], wt: 'sha', wn: '手裏剣', mods: { luk: 1.1 }, join: 9,
    sk: [['tk_doku', 1], ['tk_oogoe', 1], ['tk_hana', 14], ['tk_mizuyari', 20], ['tk_ult', 27]],
    hint: '伊賀の里の花壇の子が、霧の山にしか咲かない花の種をほしがっている' });
  ch('karura', { arch: 'mag', roles: ['mag'], wt: 'rai', wn: '羽', wmag: 1, mods: { spd: 1.08 }, join: 11,
    sk: [['kr_rakurai', 1], ['kr_raiun', 1], ['kr_kurobane', 15], ['kr_inazuma', 21], ['kr_ult', 28]],
    hint: '霧の山のいちばん上で、黒い羽の忍が里を見守っている' });
  ch('kanaoni', { arch: 'tank', roles: ['tank'], wt: 'zan', wn: '牛刀', mods: { atk: 1.08 }, join: 11,
    sk: [['kn_teppeki', 1], ['kn_hagane', 1], ['kn_gyuto', 15], ['kn_kitae', 21], ['kn_ult', 28]],
    hint: '伊賀の里の鍛冶場の主が、大蜘蛛の岩屋の「名工の玉鋼」を待っている' });
  ch('sekishusai', { arch: 'atk', roles: ['atk', 'tank'], wt: 'zan', wn: '大典太', mods: { def: 1.15, spd: 0.92 }, join: 12,
    sk: [['ss_mutou', 1], ['ss_ootenta', 1], ['ss_kamae', 18], ['ss_rantou', 22], ['ss_ult', 28]],
    hint: '伊賀の里の道場で、剣の達人が腕試しの相手を待っている' });
  ch('jin', { arch: 'atk', roles: ['atk', 'mag'], wt: 'sha', wn: '手裏剣', mods: { mag: 1.4, spd: 1.08 }, join: 28, story: 1,
    sk: [['jin_goka', 1], ['jin_rekka', 1], ['jin_kagebashiri', 1], ['jin_samidare', 1], ['jin_ult', 30]] });

  // ---- 雑賀 ----
  ch('shiba', { arch: 'tank', roles: ['tank'], wt: 'da', wn: '空手', mods: { spd: 1.05 }, join: 14,
    sk: [['sb_mizudeppou', 1], ['sb_banken', 1], ['sb_seiken', 18], ['sb_tooboe', 22], ['sb_ult', 28]],
    hint: '雑賀の港の桟橋で、見張りの犬が困っている' });
  ch('hinanojoh', { arch: 'mag', roles: ['mag'], wt: 'hi', wn: '焙烙玉', wmag: 1, mods: { hp: 0.95, luk: 1.1 }, join: 15, story: 1, field: 'bomb',
    sk: [['hn_horoku', 1], ['hn_hibana', 1], ['hn_takibi', 18], ['hn_hanabi', 22], ['hn_ult', 28]] });
  ch('fuuta', { arch: 'atk', roles: ['atk'], wt: 'zan', wn: '正宗', mods: { luk: 1.15 }, join: 15, story: 1, field: 'wind',
    sk: [['ft_senpu', 1], ['ft_nigeashi', 1], ['ft_honki', 18], ['ft_hitoyasumi', 22], ['ft_ult', 28]] });
  ch('nagisa', { arch: 'atk', roles: ['atk'], wt: 'da', wn: '巻物', mods: { spd: 1.1 }, join: 15,
    sk: [['ng_bunshin', 1], ['ng_tsuki', 1], ['ng_souji', 18], ['ng_kage', 22], ['ng_ult', 28]],
    hint: '雑賀の港の蔵で、分身たちと掃除をしている忍がいる。蔵に妖怪が出て困っているらしい' });
  ch('nekomata', { arch: 'atk', roles: ['atk'], wt: 'zan', wn: '妖刀村正', mods: { luk: 1.25 }, join: 15,
    sk: [['nk_muramasa', 1], ['nk_bunshin', 1], ['nk_sakana', 18], ['nk_tsume', 22], ['nk_ult', 28]],
    hint: '雑賀の港の魚市場で、おなかをすかせた猫の剣士がいる。焼き魚がほしいらしい' });
  ch('benten', { arch: 'heal', roles: ['sup', 'heal'], wt: 'hikari', wn: '三味線', wmag: 1, mods: { mag: 1.05 }, join: 18, story: 1,
    sk: [['bt_norito', 1], ['bt_shirabe', 1], ['bt_komori', 20], ['bt_bachi', 24], ['bt_ult', 29]] });
  ch('ichiya', { arch: 'sup', roles: ['sup'], wt: 'hikari', wn: '筆', wmag: 1, mods: { spd: 1.12 }, join: 15,
    sk: [['ic_iroha', 1], ['ic_niji', 1], ['ic_denrei', 18], ['ic_fumi', 22], ['ic_ult', 28]],
    hint: '雑賀の港の伝令が、手紙を3通とどけてくれる人をさがしている' });
  ch('seori', { arch: 'mag', roles: ['mag'], wt: 'da', wn: '木槌', mods: { mdf: 1.1 }, join: 16,
    sk: [['so_ushi', 1], ['so_mitama', 1], ['so_harae', 18], ['so_kizuchi', 22], ['so_ult', 28]],
    hint: '潮風の浜の池の祠に、ゆうれいのミタマを連れた子がいる' });
  ch('quon', { arch: 'sup', roles: ['sup'], wt: 'hi', wn: '鬼火', wmag: 1, mods: { luk: 1.4 }, join: 16,
    sk: [['qn_nekonome', 1], ['qn_onibi', 1], ['qn_sakiyomi', 20], ['qn_fuku', 24], ['qn_ult', 29]],
    hint: '雑賀のあちこちに、猫の耳の不思議な人があらわれる。3か所で会えたら…' });
  ch('magoichi', { arch: 'atk', roles: ['atk'], wt: 'sha', wn: '銃', mods: { atk: 1.08, spd: 0.95 }, join: 18, story: 1,
    sk: [['mg_ippatsu', 1], ['mg_gourei', 1], ['mg_nerai', 20], ['mg_rensha', 24], ['mg_ult', 29]] });

  // ---- 風魔 ----
  ch('kohaku', { arch: 'atk', roles: ['atk'], wt: 'zan', wn: '刀', mods: { spd: 1.1 }, join: 21, story: 1,
    sk: [['kh_kawarimi', 1], ['kh_issen', 1], ['kh_kagenoha', 1], ['kh_kitsunebi', 23], ['kh_ult', 27]] });
  ch('atoza', { arch: 'tank', roles: ['atk', 'tank'], wt: 'da', wn: '棍棒', mods: { atk: 1.15 }, join: 23, story: 1,
    sk: [['at_oumagatoki', 1], ['at_randa', 1], ['at_ninjo', 1], ['at_houkou', 25], ['at_ult', 28]] });
  ch('aum', { arch: 'atk', roles: ['atk'], wt: 'da', wn: '棍棒', mods: { atk: 1.15, spd: 0.85, hp: 1.1 }, join: 23, story: 1,
    sk: [['au_kyojin', 1], ['au_kyodaika', 1], ['au_jinarashi', 1], ['au_niou', 25], ['au_ult', 28]] });
  ch('rotten', { arch: 'sup', roles: ['sup'], wt: 'sha', wn: '毒矢', mods: { hp: 1.1 }, join: 23, story: 1,
    sk: [['rt_dokugiri', 1], ['rt_dokuya', 1], ['rt_hirune', 1], ['rt_kusare', 25], ['rt_ult', 28]] });
  ch('dan', { arch: 'atk', roles: ['atk'], wt: 'hikari', wn: '閃光刀', mods: { spd: 1.08 }, join: 23, story: 1,
    sk: [['dn_senko', 1], ['dn_senkozan', 1], ['dn_kasoku', 1], ['dn_homura', 25], ['dn_ult', 28]] });
  ch('karma', { arch: 'sup', roles: ['sup'], wt: 'zan', wn: '鎖鎌', mods: { atk: 1.1 }, join: 21,
    sk: [['km_doujutsu', 1], ['km_ryouiki', 1], ['km_kusarigama', 1], ['km_akame', 24], ['km_ult', 28]],
    hint: '黒嶺の山道の岩場で、赤い目の忍が勝負の相手を待っている' });
  ch('janome', { arch: 'mag', roles: ['mag'], wt: 'sha', wn: '毒手裏剣', mods: { hp: 1.05 }, join: 21,
    sk: [['jn_orochi', 1], ['jn_dokushuriken', 1], ['jn_shime', 1], ['jn_dappi', 24], ['jn_ult', 28]],
    hint: '黒嶺の山道で、白蛇のオロチがはぐれて、飼い主がさがしている' });
  ch('ibuki', { arch: 'heal', roles: ['heal'], wt: 'hikari', wn: '呪符', wmag: 1, mods: { mag: 1.08 }, join: 22,
    sk: [['ib_taizan', 1], ['ib_yama', 1], ['ib_fuin', 1], ['ib_gohou', 24], ['ib_ult', 28]],
    hint: '風魔の砦のどこかで、式神のヤーマがまいごになっている' });

  // ---- 天界・根の国 ----
  ch('sattva', { arch: 'heal', roles: ['heal'], wt: 'hikari', wn: '円光', wmag: 1, mods: { mag: 1.1, mdf: 1.1 }, join: 28, story: 1,
    sk: [['st_nehan', 1], ['st_enkou', 1], ['st_jihi', 1], ['st_kago', 1], ['st_ult', 31]] });
  ch('sasagane', { arch: 'mag', roles: ['mag'], wt: 'hikari', wn: '提灯の灯り', wmag: 1, mods: { spd: 1.05, mdf: 1.1 }, join: 29, story: 1,
    sk: [['sg_ito', 1], ['sg_tourou', 1], ['sg_kanzashi', 1], ['sg_douchu', 1], ['sg_ult', 31]] });

  // 仲間帳・図鑑の並び（公式の番号順）
  var ORDER = ['jin', 'sakuya', 'kohaku', 'shiba', 'kanaoni', 'oto', 'rotten', 'nagisa', 'anne', 'dan', 'hinanojoh', 'torika', 'atoza', 'hayate', 'uka', 'ganzi', 'yui', 'fuuta', 'rei', 'sattva',
    'nekomata', 'janome', 'benten', 'karma', 'ichiya', 'nemu', 'karura', 'xiaolan', 'aum', 'konga', 'shion', 'seori', 'quon', 'magoichi', 'ibuki', 'oen', 'izuna', 'sekishusai', 'sasagane'];

  // 見た目（主人公）
  var LOOK_SETS = [{ id: 'ai', name: '藍の装束' }, { id: 'wakakusa', name: '若草の装束' }, { id: 'kurenai', name: '紅の装束' }];
  var LOOK_HAIR = [{ id: 'short', name: 'みじかい髪' }, { id: 'pony', name: 'ポニーテール' }, { id: 'bob', name: 'おかっぱ' }];

  var api = { CHARS: C, ORDER: ORDER, LOOK_SETS: LOOK_SETS, LOOK_HAIR: LOOK_HAIR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_CHARS = api;
})(typeof window !== 'undefined' ? window : globalThis);
