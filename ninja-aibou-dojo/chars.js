/* ニンジャ相棒道場 — キャラクター（39体の師匠・里の忍者と、ゲーム独自の相棒）
 * ROSTER：公式データ（番号・名前・クラン・忍術・武器・誕生日・紹介文・色）
 * ART   ：描画エンジン art.js 用の見た目（ninja-sato-life/chars.js と同じ定義を写したもの）
 * 相棒  ：プレイヤーが外見と呼び名を選ぶ、このゲーム独自のキャラクター（公式キャラクターではない）
 * セリフは lines.js（本作の創作。公式設定ではない）。
 * CryptoNinja（CC0・Ninja DAO）の非公式ファンゲーム。
 */
(function (root) {
  'use strict';
  // ---- 公式データ（ninja-dao.com/characters の39体。ninja-sato-life/chars.js と同じ）----
  var ROSTER = [
    {"id":"jin","num":"001","name":"刃","en":"Jin","clan":"伊賀","clanEn":"Iga","jutsu":"火遁","weapon":"手裏剣","birthday":"9月20日","bio":"忍者の祖。謎多き伝説の忍者。風魔の初代首領と戦って命を落としたと見られている。","color":"#26262B","palette":["#F6DCC1","#26262B","#1B1B20","#6E6E73","#232328","#1E1E22"]},
    {"id":"sakuya","num":"002","name":"咲耶","en":"Sakuya","clan":"甲賀","clanEn":"Koka","jutsu":"口寄せ","weapon":"手裏剣","birthday":"3月27日","bio":"岩爺の孫。多様な召喚術を持つ。狐白と双子。繁栄の女神コノハナサクヤヒメがネーミングのもと。","color":"#D2669E","palette":["#F8DDC3","#28222A","#1B1B20","#D2669E","#B2954A","#3B3B40","#2A2A2E"]},
    {"id":"kohaku","num":"003","name":"狐白","en":"Kohaku","clan":"風魔","clanEn":"Fuma","jutsu":"変わり身","weapon":"刀","birthday":"3月27日","bio":"","color":"#6E4F9C","palette":["#F6DBC1","#241F26","#1C1C20","#6E4F9C","#6C7CC0","#9C9CA1","#2B2B30"]},
    {"id":"shiba","num":"004","name":"柴","en":"Shiba","clan":"雑賀","clanEn":"Saika","jutsu":"水遁","weapon":"空手","birthday":"11月1日","bio":"普段は犬の姿だが、戦闘時には忍術を使って人間化して体術を使う。","color":"#46703E","palette":["#E3AA60","#F4F0E8","#16161A","#46703E","#232327","#3F6838","#EFEBE2"]},
    {"id":"kanaoni","num":"005","name":"金鬼","en":"Kana-Oni","clan":"伊賀","clanEn":"Iga","jutsu":"金遁","weapon":"牛刀","birthday":"11月8日","bio":"奥地に住む伝説の鍛冶師。クランに縛られない存在。","color":"#33505D","palette":["#F2DFC4","#33505D","#E2551F","#7A7A80","#2E4A55","#26262A","#B69B72"]},
    {"id":"oto","num":"006","name":"於兎","en":"Oto","clan":"甲賀","clanEn":"Koka","jutsu":"口寄せ","weapon":"巻物","birthday":"3月3日","bio":"宇迦のライバル。兎を召喚する。於菟は本来トラを意味し、トラのような勇敢さを示唆。","color":"#F7C9D4","palette":["#F7DCC4","#F0A2B6","#F2E7DC","#3B2A1E","#F7C9D4","#D8497C","#3A3A40"]},
    {"id":"rotten","num":"007","name":"呂屯","en":"Rotten","clan":"風魔","clanEn":"Fuma","jutsu":"毒霧","weapon":"毒矢","birthday":"10月10日","bio":"風魔の幹部。アトザの部下。Rotten＝腐る。","color":"#57402F","palette":["#8CB891","#5B4433","#EFE9DE","#57402F","#B9BCC0","#4E3A2A","#232326"]},
    {"id":"nagisa","num":"008","name":"凪紗","en":"Nagisa","clan":"雑賀","clanEn":"Saika","jutsu":"影分身","weapon":"巻物","birthday":"7月20日","bio":"","color":"#2E3138","palette":["#E9B183","#C6CAD0","#35A05A","#2E3138","#C9A03A","#3A3D42","#2B2B2E"]},
    {"id":"anne","num":"009","name":"餡音","en":"Anne","clan":"伊賀","clanEn":"Iga","jutsu":"影縫い","weapon":"団子","birthday":"3月16日","bio":"お調子者。団子の串で影縫い。","color":"#4F7A3D","palette":["#F5DCC0","#63402E","#5C4566","#4F7A3D","#B7913C","#4A4C50","#232326","#C4282B"]},
    {"id":"dan","num":"010","name":"断","en":"Dan","clan":"風魔","clanEn":"Fuma","jutsu":"閃光","weapon":"閃光刀","birthday":"6月10日","bio":"風魔の幹部。アトザの部下。","color":"#26262B","palette":["#3C3F45","#26262B","#FF2E00","#D3202A","#1E1E22"]},
    {"id":"hinanojoh","num":"011","name":"雛之丞","en":"Hinanojoh","clan":"雑賀","clanEn":"Saika","jutsu":"火遁","weapon":"焙烙玉","birthday":"2月8日","bio":"","color":"#F0EDE8","palette":["#F5CE1C","#1C1C22","#F0EDE8","#CE3A2E","#F2941F"]},
    {"id":"torika","num":"012","name":"酉花","en":"Torika","clan":"伊賀","clanEn":"Iga","jutsu":"毒手裏剣","weapon":"手裏剣","birthday":"8月9日","bio":"花を育てるのが好き。","color":"#26262B","palette":["#F7D9C4","#C4586F","#C2185B","#26262B","#E0B32A","#4B4B52","#1E1E22"]},
    {"id":"atoza","num":"013","name":"アトザ","en":"Atoza","clan":"風魔","clanEn":"Fuma","jutsu":"逢魔刻","weapon":"棍棒","birthday":"11月2日","bio":"風魔の首領級。実は人情派。","color":"#2A2A30","palette":["#C68A5C","#6D7076","#D42630","#2A2A30","#1E7C84","#26262B","#1E1E22","#A72730"]},
    {"id":"hayate","num":"014","name":"ハヤテ","en":"Hayate","clan":"伊賀","clanEn":"Iga","jutsu":"鷹の目","weapon":"鷹","birthday":"1月25日","bio":"伊賀の師匠的存在。鷹の名前は「ナルカミ」。","color":"#26386B","palette":["#F0C6A0","#55595F","#F5C518","#26386B","#A8ADB5","#1E1E22"]},
    {"id":"uka","num":"015","name":"宇迦","en":"Uka","clan":"甲賀","clanEn":"Koka","jutsu":"九尾の焔","weapon":"護符","birthday":"2月11日","bio":"於兎のライバル。狐を使役する。お稲荷様（ウカノミタマ）からヒントを得た名前。","color":"#F0EDE8","palette":["#F7DAC0","#D9A45C","#F2EDE3","#6B3FA8","#F0EDE8","#C8202C","#2E2A28"]},
    {"id":"ganzi","num":"016","name":"岩爺","en":"Ganzi","clan":"甲賀","clanEn":"Koka","jutsu":"幻術・漆黒","weapon":"数珠","birthday":"9月15日","bio":"娘は令、孫は結。クランが違うのは過去の事件から。","color":"#2A2A2C","palette":["#EBBE95","#8E8E90","#D5D5D3","#2B2B2B","#2A2A2C","#B8492A","#6E5D48"]},
    {"id":"yui","num":"017","name":"結","en":"Yui","clan":"伊賀","clanEn":"Iga","jutsu":"桜吹雪","weapon":"巻物","birthday":"10月15日","bio":"後方支援特化。遠方から忍術を仕掛ける。","color":"#2B2B2E","palette":["#F4D8C0","#B71C24","#1A1A1A","#2B2B2E","#C0392B"]},
    {"id":"fuuta","num":"018","name":"風太","en":"Fuuta","clan":"雑賀","clanEn":"Saika","jutsu":"風遁","weapon":"正宗","birthday":"10月1日","bio":"酒飲みでお調子者。戦いを好まず風遁で逃げがち。やるときはやる。","color":"#22304F","palette":["#F0CBA0","#7E2E2C","#1A1A1A","#22304F","#A32B29","#2A2E3A"]},
    {"id":"rei","num":"019","name":"令","en":"Rei","clan":"伊賀","clanEn":"Iga","jutsu":"人身御供","weapon":"匕首","birthday":"4月22日","bio":"里を守る存在。結の母。忍術・人身御供は最終手段。","color":"#A5A5A8","palette":["#F5DCC4","#1E1E22","#1A1A1A","#A5A5A8","#5B3A7E","#26262B"]},
    {"id":"sattva","num":"020","name":"サットヴァ","en":"Sattva","clan":"天界","clanEn":"Heavenly Realm","jutsu":"涅槃","weapon":"円光","birthday":"不明","bio":"","color":"#F0EDE8","palette":["#F6DCC2","#1A1A1E","#1A1A1A","#F0EDE8","#C9A227","#8A6A44"]},
    {"id":"nekomata","num":"021","name":"猫又","en":"Nekomata","clan":"雑賀","clanEn":"Saika","jutsu":"影分身の術","weapon":"妖刀村正","birthday":"8月8日","bio":"とにかく魚が好き。","color":"#26262B","palette":["#EFE0C4","#6B4A38","#B5673A","#F2A517","#26262B","#C0972F","#2C3550","#1F1F23"]},
    {"id":"janome","num":"022","name":"蛇ノ目","en":"Janome","clan":"風魔","clanEn":"Fuma","jutsu":"口寄せ","weapon":"毒手裏剣","birthday":"7月16日","bio":"白蛇の名前は「オロチ」。口寄せで大蛇を召喚できる。","color":"#3F6B39","palette":["#F6D6B8","#4E8A55","#C42A21","#3F6B39","#7A4FA6","#3B3B41","#1D1D21"]},
    {"id":"benten","num":"023","name":"弁天","en":"Benten","clan":"雑賀","clanEn":"Saika","jutsu":"祝詞","weapon":"三味線","birthday":"3月4日","bio":"","color":"#262428","palette":["#F2DCC4","#1C1A1D","#2B2328","#262428","#C42A24","#2A282C","#EDE7DD"]},
    {"id":"karma","num":"024","name":"カルマ","en":"Karma","clan":"風魔","clanEn":"Fuma","jutsu":"領域・罪業","weapon":"鎖鎌","birthday":"1月3日","bio":"赤い目で瞳術を掛ける。","color":"#2B2B31","palette":["#F5D6B6","#D5D3D2","#C8202B","#2B2B31","#B4222C","#232329","#1E1E22","#2C3550"]},
    {"id":"ichiya","num":"025","name":"イチヤ","en":"Ichiya","clan":"雑賀","clanEn":"Saika","jutsu":"忍びいろは","weapon":"筆","birthday":"11月2日","bio":"伝令のスペシャリスト。彼が書く虹色の文字は空を舞い、世界にメッセージを届ける。","color":"#2A272C","palette":["#F6D9BC","#52396B","#7B3FC4","#2A272C","#4C3766","#23222A","#D2822F"]},
    {"id":"nemu","num":"026","name":"ネム","en":"Nemu","clan":"甲賀","clanEn":"Koka","jutsu":"動植綵絵","weapon":"絵筆","birthday":"2月3日","bio":"イチヤの姉。自由奔放。パートナーの名前はピヨチ（ひよこ）とウサピ（うさぎ）。","color":"#7B3FBF","palette":["#F7D3B2","#4A3348","#E8B62C","#8B2FC9","#7B3FBF","#26262B"]},
    {"id":"karura","num":"027","name":"カルラ","en":"Karura","clan":"伊賀","clanEn":"Iga","jutsu":"雷遁","weapon":"羽","birthday":"9月6日","bio":"伊賀の山奥でひっそりと里を守っている。","color":"#26262B","palette":["#F5CFAB","#33344B","#2FBFB2","#26262B","#6E52B8","#1E1E22"]},
    {"id":"xiaolan","num":"028","name":"シャオラン","en":"Xiaolan","clan":"甲賀","clanEn":"Koka","jutsu":"口寄せ","weapon":"太極拳","birthday":"10月28日","bio":"口寄せでパンダを呼ぶ。パンダの名前は「リーリー（力力）」。パンダは巨大化できる。","color":"#E0A81E","palette":["#FBDABE","#E8703A","#6B4A8C","#E0A81E","#F0EDE8","#6E6E70","#26262B"]},
    {"id":"aum","num":"029","name":"アウン","en":"Aum","clan":"風魔","clanEn":"Fuma","jutsu":"巨人の一撃","weapon":"棍棒","birthday":"5月9日","bio":"アトザの弟。巨大化できる。","color":"#26262B","palette":["#6FA8D8","#4A4266","#E01B1B","#26262B","#A3252C"]},
    {"id":"konga","num":"030","name":"コンガ","en":"Konga","clan":"甲賀","clanEn":"Koka","jutsu":"影分身","weapon":"拳","birthday":"9月24日","bio":"甲賀のくのいちに修行をつけるコーチ的存在。","color":"#7B3F9E","palette":["#8C8C90","#3A3A3F","#1E1E22","#7B3F9E","#B8B8BC","#2E3040"]},
    {"id":"shion","num":"031","name":"紫苑","en":"Shion","clan":"伊賀","clanEn":"Iga","jutsu":"野アザミ","weapon":"鉤爪","birthday":"9月28日","bio":"幼い頃に集落が鬼に襲われ、令が面倒を見ている。人見知りだが、餡音にはなついている。","color":"#34424E","palette":["#F6D9BC","#8A2A33","#DC2148","#34424E","#DE8B2E","#3B3B40","#2B2B2D","#26262B"]},
    {"id":"seori","num":"032","name":"瀬織","en":"Seori","clan":"雑賀","clanEn":"Saika","jutsu":"丑の刻参り","weapon":"木槌","birthday":"3月3日","bio":"名称は瀬織津姫から。パートナーの名前は「ミタマ」。","color":"#F1EEE9","palette":["#F8DDC3","#A8C0D6","#D8324F","#F1EEE9","#7E63C6","#26262B","#F0EDE8","#EE8FAB"]},
    {"id":"quon","num":"033","name":"久遠","en":"Quon","clan":"雑賀","clanEn":"Saika","jutsu":"猫の目の選択","weapon":"鬼火","birthday":"10月8日","bio":"「幸福な未来」を選択する能力を持つ。年齢不詳。猫又と同じ里の出身で猫又より年上。神出鬼没。一人称は「わし」。名称は量子（Quantum）から。","color":"#2E5C9E","palette":["#F7DCC0","#2C63D6","#2E8BD8","#2E5C9E","#EFEDE6","#26262B","#E07A22"]},
    {"id":"magoichi","num":"034","name":"孫市","en":"Magoichi","clan":"雑賀","clanEn":"Saika","jutsu":"一発必中","weapon":"銃","birthday":"5月1日","bio":"雑賀クランの首領。雑賀の里に帰るのは稀で、里のことは弁天に任せている。今は海に出て海賊のように動いているらしい。","color":"#26262B","palette":["#F5D3B0","#2C7A4A","#7CC242","#26262B","#EFEDE6","#3F8C50"]},
    {"id":"ibuki","num":"035","name":"イブキ","en":"Ibuki","clan":"風魔","clanEn":"Fuma","jutsu":"泰山府君祭","weapon":"呪符","birthday":"12月31日","bio":"ヤーマはイブキの能力に応じた姿になる。イブキが未熟であるためかわいい姿で現界している。イブキは「気吹戸主」から、ヤーマは「閻魔大王」に由来。","color":"#26262B","palette":["#F7DDC0","#4B4570","#35C04A","#26262B","#C0232C","#6B4B9C"]},
    {"id":"oen","num":"036","name":"おえん","en":"Oen","clan":"甲賀","clanEn":"Koka","jutsu":"糸脈","weapon":"笈","birthday":"4月2日","bio":"実家は雑賀クラン。里を離れて甲賀クランに忍術の修行に来ている。","color":"#CE5A1D","palette":["#F7DDC2","#6F9A52","#F0EDE8","#E8901F","#CE5A1D","#EFEAE0","#6D9950","#3E4247"]},
    {"id":"izuna","num":"037","name":"イズナ","en":"Izuna","clan":"甲賀","clanEn":"Koka","jutsu":"飯綱の法","weapon":"なし","birthday":"7月21日","bio":"宇迦の姉。","color":"#F0EDE8","palette":["#F8DFC6","#221F1E","#2F97D6","#6D42B0","#F0EDE8","#D9A62A","#A32530"]},
    {"id":"sekishusai","num":"038","name":"石舟斎","en":"Sekishusai","clan":"伊賀","clanEn":"Iga","jutsu":"無刀取り","weapon":"大典太","birthday":"4月19日","bio":"","color":"#26262B","palette":["#EFC9A2","#2A2A2E","#D9D9D6","#C75B18","#26262B","#8E2432"]},
    {"id":"sasagane","num":"039","name":"ササガネ","en":"Sasagane","clan":"根の国","clanEn":"Ne-no-Kuni","jutsu":"—","weapon":"—","birthday":"—","bio":"","color":"#241F27","palette":["#F3EDEE","#211D22","#7A3EA6","#E23A6E","#241F27","#D8A63A","#1F1B22"]}
  ];


  // ---- 見た目（art.js の定義。ninja-sato-life/chars.js と同じ）----
  var KT = { katana: {} };
  var ART = {
    jin: {
      hood: { color: '#26262b' }, mask: { kind: 'cloth', color: '#26262b' }, eyes: { style: 'sharp', color: '#2a2a30' }, brows: 'none', cheek: false,
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#26262b', trim: '#1b1b20', inner: '#44444a', mesh: true, tasuki: '#1b1b20' }, obi: { color: '#6e6e73', knot: 'buckle', knotColor: '#9a9ca3' },
      sleeves: { kind: 'short' }, arms: { guard: '#4c4c54' }, bottom: { kind: 'pants', color: '#26262b', wrap: '#55555c' }, feet: { kind: 'sandal', color: '#1e1e22' },
      back: KT, prop: { kind: 'shuriken' }
    },
    sakuya: {
      skin: '#f8ddc3', hair: { color: '#28222a', bangs: 'straight', front: 2, side: -42, back: -50, vol: 5, parts: [{ kind: 'pony', sway: -1, tie: '#d8302c' }] },
      eyes: { style: 'iris', color: '#3a2a2a', lash: true }, band: { color: '#d45ba0', plate: 0 },
      top: { color: '#d2669e', trim: '#28222a', inner: '#28222a', tasuki: '#28222a' }, obi: { color: '#b2954a', knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#2a2a2e' }, bottom: { kind: 'skirt', color: '#d2669e' }, legs: { color: '#2a2a2e', top: 0.3 }, feet: { kind: 'sandal', color: '#2a2a2e' },
      back: KT, prop: { kind: 'shuriken' }
    },
    kohaku: {
      skin: '#f6dbc1', hair: { color: '#241f26', bangs: 'straight', front: 2, side: -42, back: -50, vol: 5, parts: [{ kind: 'pony', sway: -1, tie: '#3fc1c9' }] }, mask: { kind: 'fox' },
      band: { color: '#6e4f9c', plate: 0 },
      top: { color: '#6e4f9c', trim: '#241f26', inner: '#241f26', tasuki: '#241f26' }, obi: { color: '#6c7cc0', knot: 'knot' },
      sleeves: { kind: 'short' }, arms: { guard: '#2a2a2e' }, bottom: { kind: 'skirt', color: '#6e4f9c' }, legs: { color: '#9c9ca1', top: 0.3 }, feet: { kind: 'sandal', color: '#2a2a2e', toe: '#6e4f9c' },
      prop: { kind: 'katana' }
    },
    shiba: {
      skin: '#e3aa60', head: { kind: 'dog', fur: '#e3aa60', fur2: '#f4f0e8' }, ears: { kind: 'dog', color: '#e3aa60', inner: '#f4f0e8', th: 46, ph: 44, len: 24, w: 15 },
      eyes: { style: 'dot' }, brows: 'none', cheek: false, band: { color: '#46703e', plate: 3 },
      top: { color: '#46703e', trim: '#232327', inner: '#2f4f2a', tasuki: '#232327' }, obi: { color: '#232327', knot: 'buckle' },
      sleeves: { kind: 'short' }, arms: { color: '#e3aa60', hand: '#f4f0e8' }, bottom: { kind: 'pants', color: '#46703e', wrap: '#2a2a2e' },
      feet: { kind: 'sandal', color: '#f4f0e8', strap: '#232327' }, back: KT, tail: { kind: 'dog', color: '#e3aa60', tip: '#f4f0e8' }
    },
    kanaoni: {
      skin: '#f2dfc4', hood: { color: '#33505d', front: -3 }, mask: { kind: 'oni', color: '#c8392a' }, horns: { color: '#efe3c4', list: [[-26, 30, 26, 8], [26, 30, 26, 8]] },
      band: { color: '#d8452c', plate: 0, hi: 40, lo: 28 }, fur: { color: '#b69b72' },
      top: { color: '#33505d', trim: '#22363f', inner: '#26262a', mesh: true, tasuki: '#26262a', cord: '#efe3c4' }, obi: { color: '#7a7a80', knot: 'buckle' },
      sleeves: { kind: 'short' }, arms: { guard: '#aeb2b8' }, bottom: { kind: 'pants', color: '#2e4a55', wrap: '#26262a' }, feet: { kind: 'sandal', color: '#26262a', strap: '#b69b72' },
      prop: { kind: 'gyuto' }
    },
    oto: {
      build: 'small', skin: '#f7dcc4', hair: { color: '#f0a2b6', bangs: 'straight', front: 3, side: -50, back: -52, fw: 54, vol: 5 }, ears: { kind: 'rabbit', color: '#f5b3c6', inner: '#f7e6d8' },
      eyes: { style: 'iris', color: '#3b2a1e', pupil: 'star', pupilColor: '#f5c542', lash: true }, mouth: 'open',
      band: { color: '#4f9a4a', plate: 0, hi: 36, lo: 25 },
      top: { color: '#f7c9d4', trim: '#e7a6b8', inner: '#f2e7dc', tasuki: '#3a3a40', emblem: { kind: 'rabbit', color: '#d8497c', th: 18, y: 76 } }, obi: { color: '#d8497c', knot: 'bow' },
      sleeves: { kind: 'short' }, bottom: { kind: 'skirt', color: '#f7c9d4' }, legs: { color: '#3a3a40', top: 0.12 }, feet: { kind: 'boot', color: '#3a3a40' },
      back: { katana: {}, tube: '#4f9a4a' }, prop: { kind: 'scroll', color: '#4d8a4a' }
    },
    rotten: {
      skin: '#8cb891', hood: { color: '#4e3a2a', front: 16 }, arrow: true, eyepatch: { side: 1 }, eyes: { style: 'wide' }, brows: 'none', mouth: 'openFang', cheek: false,
      marks: [{ kind: 'drool' }, { kind: 'blood', th: 26, ph: 60 }],
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#57402f', trim: '#3e2e22', inner: '#3e2e22', tasuki: '#232326', pattern: { kind: 'blood', color: '#7a1f1f', r: 3.2 } }, obi: { color: '#2a2a2e', studs: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { color: '#8cb891' }, bottom: { kind: 'shorts', color: '#57402f' }, legs: { color: '#8cb891' }, feet: { kind: 'boot', color: '#232326', toe: '#efe9de' }
    },
    nagisa: {
      skin: '#e9b183', hair: { color: '#c6cad0', bangs: 'messy', front: 8, side: -30, back: -44, amp: 10, per: 15, vol: 7, parts: [{ kind: 'spikes', list: [[-66, 36, 16, 14, -10], [66, 36, 16, 14, 10], [-150, 30, 14, 16], [150, 30, 14, 16], [180, 12, 12, 16]] }] },
      eyes: { style: 'sharp', color: '#35a05a' }, marks: [{ kind: 'freckles', color: '#a0603a' }], mask: { kind: 'cloth', color: '#2e3138' }, cheek: false,
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#2e3138', trim: '#1e1f24', inner: '#1e1f24', tasuki: '#1e1f24' }, obi: { color: '#c9a03a', knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#7a7d84' }, bottom: { kind: 'skirt', color: '#2e3138' }, legs: { color: '#2b2b2e', top: 0.2 }, feet: { kind: 'boot', color: '#2b2b2e' },
      back: KT, prop: { kind: 'scroll', color: '#c8392a', cap: '#f4f1ea' }
    },
    anne: {
      skin: '#f5dcc0', hair: { color: '#63402e', bangs: 'straight', front: 1, side: -54, back: -56, fw: 56, vol: 5, parts: [{ kind: 'top', h: 1.08, w: [16, 12, 9, 3], x2: -6, x3: -14, ring: '#c4282b' }, { kind: 'top', h: 1.02, w: [16, 12, 9, 3], x2: 6, x3: 14 }] },
      eyes: { style: 'iris', color: '#5c4566', lash: true }, scarf: { color: '#c4282b', dir: -1 },
      top: { color: '#4f7a3d', trim: '#2a3a22', inner: '#2a3a22', tasuki: '#232326' }, obi: { color: '#b7913c', knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#7a7d84' }, bottom: { kind: 'skirt', color: '#4f7a3d' }, legs: { color: '#4a4c50', top: 0.3 }, feet: { kind: 'boot', color: '#232326' },
      back: KT, prop: { kind: 'dango' }
    },
    dan: {
      hood: { color: '#26262b', front: -3 }, mask: { kind: 'robot' }, band: { color: '#1e1e22', plate: 3, plateColor: '#a8acb4' },
      top: { color: '#26262b', trim: '#d3202a', inner: '#3a3d44', mesh: true, lines: '#d3202a', trimW: 3 }, obi: { color: '#3c3f45', studs: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'tight', color: '#26262b' }, arms: { guard: '#6a6d75', color: '#26262b', hand: '#5a5d65' }, bottom: { kind: 'pants', color: '#26262b', wrap: '#3c3f45' }, feet: { kind: 'boot', color: '#1e1e22', toe: '#d3202a' },
      back: KT, prop: { kind: 'katana', glow: true }
    },
    hinanojoh: {
      build: 'chick', skin: '#f5ce1c', head: { kind: 'chick', fur: '#f5ce1c' }, crest: { color: '#f5ce1c' }, cheek: false, brows: 'none', eyes: { style: 'dot' }, mouth: 'beak',
      band: { color: '#1c1c22', plate: 3 },
      top: { color: '#f0ede8', trim: '#d8d2c6', inner: '#f5ce1c', tasuki: '#1c1c22' }, obi: { color: '#ce3a2e', knot: 'bow' },
      sleeves: { kind: 'none' }, arms: { color: '#f5ce1c' }, bottom: { kind: 'none' }, legs: { w: 8 }, feet: { kind: 'bird' }, prop: { kind: 'bomb' }
    },
    torika: {
      skin: '#f7d9c4', hair: { color: '#c4586f', bangs: 'side', slope: -0.25, front: 6, side: -40, back: -48, vol: 6 },
      eyes: { style: 'iris', color: '#c2185b', lash: true }, mouth: 'shout', marks: [{ kind: 'freckles' }],
      band: { color: '#1e1e22', plate: 2, plateColor: '#6e7078' },
      top: { color: '#26262b', trim: '#e0b32a', inner: '#1e1e22', tasuki: '#1e1e22', emblem: { kind: 'cross', color: '#e0b32a', th: 16, y: 82 }, hemTrim: '#e0b32a' }, obi: { color: '#e0b32a', knot: 'bow' },
      sleeves: { kind: 'short', trim: '#e0b32a' }, bottom: { kind: 'skirt', color: '#26262b' }, legs: { color: '#4b4b52', top: 0.25 }, feet: { kind: 'boot', color: '#1e1e22' },
      back: { katana: { guard: '#e0b32a' } }, prop: { kind: 'shuriken' }
    },
    atoza: {
      skin: '#c68a5c', hair: { color: '#6d7076', bangs: 'messy', front: 4, side: -34, back: -46, amp: 12, vol: 7, cover: [-62, -2, -40] }, horns: { color: '#c9a24a', list: [[-42, 36, 22, 7], [42, 36, 22, 7]] },
      eyes: { style: 'iris', color: '#d42630', pupil: 'diamond' }, brows: 'angry', mouth: 'flat', cheek: false,
      scarf: { color: '#d42630', dir: -1, len: 100 },
      top: { color: '#2a2a30', trim: '#1e1e22', inner: '#1e1e22', tasuki: '#1e1e22', flameChest: '#1e7c84' }, obi: { color: '#3a3a40', plates: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { guard: '#aeb2b8', spikes: true }, bottom: { kind: 'pants', color: '#26262b', wrap: '#1e1e22' }, feet: { kind: 'boot', color: '#1e1e22' },
      back: KT, prop: { kind: 'kanabo' }
    },
    hayate: {
      skin: '#f0c6a0', hair: { color: '#55595f', bangs: 'jag', front: 8, side: -26, back: -40, amp: 12, per: 14, vol: 6, parts: [{ kind: 'spikes', list: [[0, 64, 22, 16, 0], [-40, 52, 20, 14, -12], [40, 52, 20, 14, 12], [-120, 40, 18, 16], [120, 40, 18, 16], [180, 40, 18, 16], [-84, 28, 16, 14], [84, 28, 16, 14]] }] },
      eyes: { style: 'sharp', color: '#f5c518' }, brows: 'thick', mask: { kind: 'cloth', color: '#26386b' }, cheek: false,
      top: { color: '#26386b', trim: '#1a2a52', inner: '#2a2a30', mesh: true, tasuki: '#1e1e22', emblem: { kind: 'star', color: '#c9ccd3', th: 18, y: 82, r: 6 } }, obi: { color: '#3a3a40', plates: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { guard: '#2a2a30', guardSide: 1, glove: { side: -1, color: '#8a5a36', tassel: '#3a7ad8' } },
      arm: { '-1': { E: [-36, -20, 10], H: [-38, -8, 18], hand: 'fist' } },
      bottom: { kind: 'pants', color: '#26386b', wrap: '#1e1e22' }, feet: { kind: 'boot', color: '#1e1e22', toe: '#a8adb5' },
      back: KT, companions: [{ kind: 'hawk', hand: -1 }]
    },
    uka: {
      skin: '#f7dac0', hair: { color: '#d9a45c', bangs: 'messy', front: 4, side: -50, back: -56, amp: 10, vol: 8, tipColor: '#f6f1e6' }, ears: { kind: 'fox', color: '#d9a45c', inner: '#f6f1e6', tuft: '#ffffff' },
      eyes: { style: 'iris', color: '#6b3fa8', lash: true }, mouth: 'fang', marks: [{ kind: 'whiskers', color: '#b0703a' }],
      top: { color: '#f0ede8', trim: '#c8202c', inner: '#c8202c', tasuki: '#c8202c', lower: '#c8202c' }, obi: { color: '#c8202c', knot: 'bow' },
      sleeves: { kind: 'short', trim: '#c8202c', cross: '#c8202c' },
      arm: { '-1': { E: [-32, -18, 12], H: [-14, 2, 24], hand: 'peace' } },
      bottom: { kind: 'skirt', color: '#c8202c' }, legs: { color: '#f4f1ea', dash: '#c8202c', top: 0.25 }, feet: { kind: 'sandal', color: '#2a2226', strap: '#c8202c' },
      tail: { kind: 'fox', color: '#d9a45c', tip: '#f6f1e6', side: -1 }, prop: { kind: 'fuda', hand: 1 }
    },
    ganzi: {
      skin: '#ebbe95', hair: { color: '#8e8e90', bangs: 'swept', front: 20, side: -24, back: -40, vol: 6, slope: 0.2, parts: [{ kind: 'top', h: 0.98, w: [34, 26, 16, 4] }, { kind: 'spikes', list: [[-24, 72, 18, 14, -16], [24, 72, 18, 14, 16], [0, 80, 22, 14, 0], [-160, 50, 16, 16], [160, 50, 16, 16]] }, { kind: 'beard', color: '#9a9a9c' }] },
      streaks: [{ th: -14, w: 10, color: '#ececea', len: 40 }],
      eyes: { style: 'sharp', color: '#5a7a90' }, eyepatch: { side: 1 }, brows: 'thick', browColor: '#6e6e70', cheek: false,
      top: { color: '#6e5d48', trim: '#4a3e30', inner: '#4a3e30' }, obi: { color: '#3a3a3c', knot: 'buckle' },
      over: { kind: 'haori', color: '#2a2a2c', lining: '#b8492a', open: 26 }, sleeves: { kind: 'wide' }, arms: { beads: '#9a4a2a' },
      bottom: { kind: 'hakama', color: '#4a3e30' }, feet: { kind: 'boot', color: '#26262b', toe: '#9a9ca3' }, pose: 'seal'
    },
    yui: {
      skin: '#f4d8c0', hair: { color: '#b71c24', bangs: 'straight', front: 1, side: -52, back: -56, fw: 56, vol: 5 }, ribbon: { th: 66, ph: 44, color: '#1a1a1a', size: 2.2 }, flower: { th: 56, ph: 22, color: '#f7b8cc', size: 8 },
      eyes: { style: 'iris', color: '#2a1a1a', lash: true },
      top: { color: '#2b2b2e', len: 'long', trim: '#f4f1ea', inner: '#f4f1ea' }, obi: { color: '#c0392b', knot: 'knot' },
      sleeves: { kind: 'long', pattern: 'sakura', patternColor: '#f4b6c8' }, bottom: { kind: 'none' }, feet: { kind: 'geta', color: '#f4f1ea', sole: '#1a1a1a', strap: '#f4f1ea' },
      pose: 'hold', prop: { kind: 'scroll', color: '#6b3fa8', cap: '#8a5a36' }
    },
    fuuta: {
      skin: '#f0cba0', hair: { color: '#7e2e2c', bangs: 'jag', front: 8, side: -26, back: -40, amp: 12, per: 13, vol: 6 }, hat: { color: '#9a6a3a', crest: '#a32b29', r: 72 },
      eyes: { style: 'sharp', color: '#3a1a18' }, mouth: 'grin', leaf: true, brows: 'thick', cheek: false,
      top: { color: '#22304f', trim: '#16203a', inner: '#16203a', tasuki: '#1a1a1a' }, obi: { color: '#5a5c63', knot: 'buckle' },
      over: { kind: 'cape', color: '#22304f', lining: '#a32b29', pattern: { kind: 'stripes', color: '#e8e4da', step: 22, w: 3.5 }, open: 30 },
      sleeves: { kind: 'short', color: '#22304f' }, arm: { '1': { E: [34, -22, 12], H: [12, -6, 24], hand: 'twofinger' } },
      bottom: { kind: 'pants', color: '#22304f', wrap: '#1a1a1a' }, feet: { kind: 'boot', color: '#1a1a1a', toe: '#5a5c63' },
      back: { katana: { hip: true, side: -1 } }
    },
    rei: {
      skin: '#f5dcc4', hair: { color: '#1e1e22', bangs: 'part', front: 6, side: -40, back: -50, partH: 14, partW: 24, vol: 4, parts: [{ kind: 'bun', th: 180, ph: 74, r: 18 }], locks: { th: 78, w: [10, 10, 8, 3], ph1: -80 } },
      pins: { color: '#e0b23c', list: [[36, 62, 26, 12, 16]] }, flower: { th: 40, ph: 64, color: '#d8303a', size: 6 },
      band: { color: '#1e7c74', plate: 3 },
      eyes: { style: 'sharp', color: '#2a1a1a' }, liner: '#d8303a', mouth: 'flat',
      top: { color: '#a5a5a8', len: 'long', trim: '#f4f1ea', inner: '#f4f1ea', tasuki: '#1a1a1a', pattern: { kind: 'dots', color: '#d8b04a', r: 2 } }, obi: { color: '#5b3a7e', knot: 'knot' },
      sleeves: { kind: 'wide' }, bottom: { kind: 'none' }, feet: { kind: 'boot', color: '#1a1a1a', toe: '#f4f1ea' }, prop: { kind: 'dagger' }
    },
    sattva: {
      skin: '#f6dcc2', hair: { color: '#1a1a1e', bangs: 'part', front: 14, side: -30, back: -40, partH: 10, vol: 3, parts: [{ kind: 'bun', th: 180, ph: 80, r: 22 }] },
      crown: { color: '#e2b93b' }, veil: { color: '#f4f1ea', front: 10 },
      eyes: { style: 'closed', lash: true }, marks: [{ kind: 'urna', ph: 12, color: '#d8303a' }],
      top: { color: '#f0ede8', len: 'long', trim: '#e2dccf', inner: '#e2dccf', necklace: '#e2b93b', collar: 'round' }, obi: { color: '#c9a227', knot: 'knot' },
      sleeves: { kind: 'wide' }, arm: { '-1': { E: [-32, -22, 12], H: [-12, -10, 24], hand: 'twofinger' } },
      bottom: { kind: 'none' }, feet: { kind: 'sandal', color: '#f6dcc2', sole: '#8a6a44', strap: '#8a6a44' }, halo: true
    },
    nekomata: {
      skin: '#efe0c4', head: { kind: 'cat', fur: '#efe0c4', fur2: '#f7efdc', patches: [{ poly: [[-110, 92], [-8, 92], [-4, 40], [-30, 22], [-64, 12], [-110, 24]], color: '#6b4a38' }, { poly: [[12, 92], [110, 92], [110, 12], [62, 20], [30, 34], [14, 50]], color: '#b5673a' }] },
      ears: { kind: 'cat', color: '#6b4a38', inner: '#e8b8a8', th: 44, ph: 46 },
      eyes: { style: 'iris', color: '#f2a517', scar: 1 }, brows: 'none', cheek: false,
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#2c3550', trim: '#1e2438', inner: '#1e2438' }, obi: { color: '#5a5c63', knot: 'buckle' },
      over: { kind: 'haori', color: '#26262b', lining: '#26262b', trim: '#c0972f', open: 24 }, sleeves: { kind: 'wide', trim: '#c0972f' }, arms: { color: '#efe0c4' },
      bottom: { kind: 'hakama', color: '#2c3550' }, feet: { kind: 'sandal', color: '#1f1f23' },
      back: KT, tail: { kind: 'cat', color: '#efe0c4', side: 1, patches: [[0.3, 8, '#6b4a38'], [0.65, 8, '#b5673a']] }, pose: 'seal'
    },
    janome: {
      skin: '#f6d6b8', hair: { color: '#4e8a55', bangs: 'jag', front: 8, side: -30, back: -42, amp: 13, per: 13, vol: 6, parts: [{ kind: 'tuft', th: 10, ph: 84, lean: 1 }, { kind: 'spikes', list: [[-130, 40, 16, 14], [130, 40, 16, 14], [180, 30, 16, 16], [-72, 40, 14, 12, -8], [72, 40, 14, 12, 8]] }] },
      band: { color: '#1e1e22', plate: 3 },
      eyes: { style: 'iris', color: '#c42a21', pupil: 'star', pupilColor: '#ffffff' }, mouth: 'openFang',
      top: { color: '#3f6b39', trim: '#2a4a26', inner: '#2a4a26', tasuki: '#1d1d21', pattern: { kind: 'squares', color: '#8cc07a', spots: [[-50, 0.9], [-15, 0.9], [20, 0.9], [55, 0.9]] } }, obi: { color: '#7a4fa6', knot: 'bow' },
      sleeves: { kind: 'short' }, bottom: { kind: 'skirt', color: '#3f6b39' }, legs: { color: '#3b3b41', top: 0.3 }, feet: { kind: 'sandal', color: '#f4f1ea', sole: '#1d1d21', strap: '#1d1d21' },
      back: KT, prop: { kind: 'shuriken' }, companions: [{ kind: 'snake', color: '#f1efe9' }]
    },
    benten: {
      skin: '#f2dcc4', hair: { color: '#1c1a1d', bangs: 'straight', front: 1, side: -50, back: -56, fw: 56, vol: 5, parts: [{ kind: 'loops' }] },
      pins: { color: '#e0b23c', list: [], comb: '#e0b23c', tassel: '#c42a24' },
      eyes: { style: 'iris', color: '#1c1a1d', lash: true }, liner: '#c42a24', marks: [{ kind: 'brows_red', color: '#c42a24' }],
      top: { color: '#262428', len: 'long', trim: '#c42a24', inner: '#ede7dd', pattern: { kind: 'maple', color: '#c42a24', r: 6 }, emblem: { kind: 'circle', color: '#ede7dd', th: 20, y: 84, r: 5 } }, obi: { color: '#c42a24', knot: 'knot' },
      sleeves: { kind: 'long', pattern: 'maple', patternColor: '#c42a24' }, bottom: { kind: 'none' }, feet: { kind: 'geta', color: '#f4f1ea', sole: '#2a2226', strap: '#c42a24' },
      prop: { kind: 'shamisen' }
    },
    karma: {
      skin: '#f5d6b6', hair: { color: '#d5d3d2', bangs: 'jag', front: 6, side: -30, back: -42, amp: 13, per: 13, vol: 7, parts: [{ kind: 'spikes', list: [[-40, 56, 20, 14, -14], [40, 56, 20, 14, 14], [0, 70, 18, 14], [-120, 40, 18, 16], [120, 40, 18, 16], [180, 30, 18, 16]] }] },
      eyes: { style: 'sharp', color: '#c8202b' }, mouth: 'smirk', earring: { side: 1 }, cheek: false,
      scarf: { color: '#4b3f9a', dir: -1, len: 104 },
      top: { color: '#2b2b31', trim: '#1e1e22', inner: '#1e1e22', tasuki: '#b4222c' }, obi: { color: '#2b2b31', chain: '#8a8d94', knot: 'none' },
      sleeves: { kind: 'short', one: -1, color: '#2c3550', shoulder: '#2a2a2e' }, arms: { guard: '#1e1e22', spikes: true },
      bottom: { kind: 'pants', color: '#1e1e22', wrap: '#1e1e22' }, feet: { kind: 'sandal', color: '#f4f1ea', sole: '#1e1e22', strap: '#1e1e22' }, prop: { kind: 'kama' }
    },
    ichiya: {
      skin: '#f6d9bc', hair: { color: '#52396b', bangs: 'messy', front: 2, side: -36, back: -46, amp: 13, vol: 9 }, ears: { kind: 'cat', color: '#52396b', inner: '#f0c0c8', th: 46, ph: 44 },
      eyes: { style: 'half', color: '#7b3fc4' }, marks: [{ kind: 'lines', color: '#e0823a' }], cheek: false,
      mask: { kind: 'scarf', color: '#d2822f', color2: '#8a4a1e', pattern: 'check', top: -24, eyes: true },
      top: { color: '#4c3766', trim: '#2a272c', inner: '#2a272c' }, obi: { color: '#9a9ca3', knot: 'none', plates: '#c9ccd3' },
      over: { kind: 'haori', color: '#2a272c', lining: '#2a272c', hem: 24, open: 22 }, sleeves: { kind: 'wide' },
      bottom: { kind: 'hakama', color: '#4c3766' }, feet: { kind: 'sandal', color: '#23222a' },
      prop: { kind: 'brush' }, companions: [{ kind: 'rainbow', side: -1 }, { kind: 'rainbow', side: 1 }]
    },
    nemu: {
      skin: '#f7d3b2', hair: { color: '#4a3348', bangs: 'messy', front: 3, side: -40, back: -48, amp: 13, vol: 9 },
      streaks: [{ th: -34, w: 8, color: '#e8423a' }, { th: -18, w: 7, color: '#f5d02a' }, { th: 0, w: 7, color: '#4fb34a' }, { th: 18, w: 7, color: '#3ab0b0' }, { th: 34, w: 8, color: '#f59a2a' }],
      ears: { kind: 'cat', color: '#4a3348', inner: '#f4f0e8', th: 46, ph: 44 },
      eyes: { style: 'iris', color: '#8b2fc9', pupil: 'star', pupilColor: '#e8b62c' }, mouth: 'tongue',
      top: { color: '#7b3fbf', trim: '#4a2a7a', inner: '#26262b', tasuki: '#26262b', pattern: { kind: 'diamonds', color: '#c9a8ec', spots: [[-50, 0.9], [-15, 0.9], [20, 0.9], [55, 0.9]] } }, obi: { color: '#26262b', knot: 'knot' },
      sleeves: { kind: 'short' }, bottom: { kind: 'skirt', color: '#7b3fbf' }, legs: { color: '#3a3a40', top: 0.3 }, feet: { kind: 'boot', color: '#26262b', sole: '#7b3fbf' },
      tail: { kind: 'cat', color: '#4a3348', side: 1 },
      prop: { kind: 'brush' }, companions: [{ kind: 'splash' }, { kind: 'chick', at: [-66, 148, 12] }, { kind: 'bunny', at: [66, 148, 12] }]
    },
    karura: {
      skin: '#f5cfab', hair: { color: '#33344b', bangs: 'side', slope: 0.3, front: 2, side: -50, back: -56, vol: 7, cover: [-58, -4, -42], parts: [{ kind: 'long', len: 0.8 }] },
      eyes: { style: 'sharp', color: '#2fbfb2' }, mask: { kind: 'cloth', color: '#26262b' }, cheek: false,
      top: { color: '#26262b', trim: '#1e1e22', inner: '#1e1e22', suspenders: '#6e52b8' }, obi: { color: '#6e52b8', knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { beads: '#3a8ad8' }, arm: { '-1': { E: [-32, -20, 12], H: [-12, -4, 24], hand: 'twofinger' } },
      bottom: { kind: 'skirt', color: '#26262b' }, legs: { color: '#26262b', top: 0.2, band: '#6e52b8' }, feet: { kind: 'boot', color: '#1e1e22' },
      wings: { color: '#26262b', sheen: '#6a5a9a' }
    },
    xiaolan: {
      skin: '#fbdabe', hair: { color: '#e8703a', bangs: 'side', slope: -0.25, front: 4, side: -40, back: -46, vol: 5, parts: [{ kind: 'bun', th: -52, ph: 58, r: 22 }, { kind: 'bun', th: 52, ph: 58, r: 22 }] },
      eyes: { style: 'iris', color: '#6b4a8c', lash: true }, mouth: 'open', marks: [{ kind: 'freckles', color: '#c07050' }],
      top: { color: '#e0a81e', trim: '#26262b', inner: '#26262b', emblem: { kind: 'diamond', color: '#26262b', th: 18, y: 82, r: 4 } }, obi: { color: '#f0ede8', knot: 'bow' },
      sleeves: { kind: 'short', trim: '#26262b' }, arms: { bandage: true }, arm: { '1': { E: [34, -18, 12], H: [16, 2, 24], hand: 'peace' } },
      bottom: { kind: 'skirt', color: '#e0a81e' }, legs: { color: '#6e6e70', top: 0.3 }, feet: { kind: 'boot', color: '#26262b' },
      back: { katana: {}, panda: { cloth: '#c8302c' } }
    },
    aum: {
      skin: '#6fa8d8', hair: { color: '#4a4266', bangs: 'jag', front: 8, side: -30, back: -42, amp: 14, per: 12, vol: 8, parts: [{ kind: 'spikes', list: [[0, 70, 30, 18, 0], [-30, 62, 28, 16, -10], [30, 62, 28, 16, 10], [-62, 50, 22, 14, -14], [62, 50, 22, 14, 14], [-150, 40, 22, 18], [150, 40, 22, 18]] }, { kind: 'pony', sway: 1, tie: '#4fb34a', w: [14, 26, 30, 24, 6], up: 1.1 }] },
      horns: { color: '#e8d8b0', list: [[18, 40, 26, 8]] }, band: { color: '#26262b', plate: 3 },
      eyes: { style: 'iris', color: '#e01b1b' }, mouth: 'openFang', brows: 'angry', cheek: false,
      top: { color: '#26262b', trim: '#1e1e22', inner: '#1e1e22', tasuki: '#1e1e22', chest: '#a3252c', flameChest: '#26262b' }, obi: { color: '#2a2a2e', studs: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { guard: '#8a8d94', spikes: true }, bottom: { kind: 'pants', color: '#26262b', wrap: '#1e1e22' }, feet: { kind: 'boot', color: '#1e1e22' },
      back: KT, prop: { kind: 'kanabo', long: true }
    },
    konga: {
      build: 'big', skin: '#8c8c90', head: { kind: 'gorilla', fur: '#3a3a3f', face: '#9a9a9e' }, ears: { kind: 'round', color: '#3a3a3f', inner: '#6a6a6e' },
      band: { color: '#7b3f9e', plate: 3 }, cheek: false,
      top: { color: '#8c8c90', collar: 'none', tasuki: '#7b3f9e', tasukiW: 8 }, obi: { color: '#2a2a2e', studs: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'none' }, arms: { color: '#3a3a3f', hand: '#8c8c90' },
      arm: { '1': { E: [46, -14, 8], H: [30, 4, 20], hand: 'thumb' }, '-1': { E: [-44, -24, 10], H: [-20, -24, 22], hand: 'fist' } },
      bottom: { kind: 'pants', color: '#2e3040' }, feet: { kind: 'bare', color: '#8c8c90' }, back: KT
    },
    shion: {
      skin: '#f6d9bc', hair: { color: '#8a2a33', bangs: 'side', slope: 0.28, front: 4, side: -44, back: -50, vol: 6, parts: [{ kind: 'pony', sway: -1, tie: '#6b3fa8', w: [14, 24, 26, 20, 4] }] },
      eyes: { style: 'iris', color: '#dc2148' }, brows: 'angry', mouth: 'frown', cheek: '#f08a8a',
      fur: { color: '#26262b' },
      top: { color: '#34424e', trim: '#26262b', inner: '#26262b' }, obi: { color: '#de8b2e', stripe: '#26262b', cord: '#6b3fa8', knot: 'bow', knotColor: '#6b3fa8' },
      sleeves: { kind: 'short' }, claws: { color: '#5a5c63' }, bottom: { kind: 'skirt', color: '#34424e' }, legs: { color: '#3b3b40', top: 0.2 }, feet: { kind: 'boot', color: '#26262b' }
    },
    seori: {
      skin: '#f8ddc3', hair: { color: '#a8c0d6', bangs: 'straight', front: 2, side: -54, back: -58, fw: 56, vol: 5, parts: [{ kind: 'long', len: 0.9 }] }, candles: {},
      eyes: { style: 'iris', color: '#d8324f', lash: true }, mouth: 'fang',
      top: { color: '#f1eee9', trim: '#26262b', inner: '#26262b' }, obi: { color: '#7e63c6', knot: 'knot' },
      sleeves: { kind: 'short', trim: '#ee8fab' }, bottom: { kind: 'shorts', color: '#26262b' }, legs: { color: '#f4f1ea' }, feet: { kind: 'sandal', color: '#f4f1ea', strap: '#7e63c6' },
      prop: { kind: 'mallet' }, companions: [{ kind: 'ghost', at: [-66, 150, 10] }]
    },
    quon: {
      skin: '#f7dcc0', hair: { color: '#2c63d6', bangs: 'messy', front: 3, side: -40, back: -48, amp: 12, vol: 8, parts: [{ kind: 'ahoge', lean: -1 }] }, ears: { kind: 'cat', color: '#2c63d6', inner: '#f0c0c8', th: 46, ph: 44, tuft: '#ffffff' },
      eyes: { style: 'iris', color: '#e0b020', color2: '#2e8bd8' }, mouth: 'fang', marks: [{ kind: 'whiskers' }],
      scarf: { color: '#e07a22', dir: -1, len: 96 },
      top: { color: '#2e5c9e', trim: '#1e3a6a', inner: '#1e3a6a' }, obi: { color: '#efede6', knot: 'knot' },
      over: { kind: 'haori', color: '#26262b', lining: '#26262b', open: 24, hem: 40 }, sleeves: { kind: 'wide' }, pose: 'fists',
      bottom: { kind: 'skirt', color: '#2e5c9e' }, legs: { color: '#26262b', top: 0.2 }, feet: { kind: 'boot', color: '#26262b', toe: '#efede6' },
      back: KT, tail: { kind: 'cat', color: '#2c63d6', tip: '#efede6', side: -1 }, companions: [{ kind: 'wisps' }]
    },
    magoichi: {
      skin: '#f5d3b0', hair: { color: '#2c7a4a', bangs: 'jag', front: 8, side: -28, back: -40, amp: 13, per: 13, vol: 7, parts: [{ kind: 'spikes', list: [[-40, 56, 20, 14, -12], [40, 56, 20, 14, 12], [0, 68, 20, 14], [-120, 40, 18, 16], [120, 40, 18, 16], [180, 30, 18, 16]] }] },
      band: { color: '#1a1a1a', plate: 0, hi: 29, lo: 23, tails: false },
      eyepatch: { side: 1, crest: '#d8a63a' }, eyes: { style: 'sharp', color: '#7cc242' }, mouth: 'smirk', pipe: '#c9a24a', cheek: false,
      fur: { color: '#3f8c50' },
      top: { color: '#f5d3b0', collar: 'none', pattern: { kind: 'tattoo', color: '#2c5a3a', spots: [[-34, 0.22], [28, 0.28], [-8, 0.45], [40, 0.55]] } }, obi: { color: '#efede6', cord: '#efede6', knot: 'none' },
      over: { kind: 'coat', color: '#26262b', lining: '#c8302c', open: 34, stitch: '#efede6' }, sleeves: { kind: 'short', color: '#26262b' },
      bottom: { kind: 'pants', color: '#26262b' }, feet: { kind: 'boot', color: '#1e1e22', toe: '#efede6' }, prop: { kind: 'pistol' }
    },
    ibuki: {
      skin: '#f7ddc0', hair: { color: '#4b4570', bangs: 'straight', front: 4, side: -46, back: -50, fw: 56, vol: 4, parts: [{ kind: 'top', h: 1.1, w: [18, 16, 14, 5], ring: '#e0b23c' }] },
      eyes: { style: 'sharp', color: '#35c04a' }, shadowLid: '#8a5ab8', mouth: 'smirk',
      top: { color: '#26262b', trim: '#1e1e22', inner: '#1e1e22', necklace: '#e0b23c', beads: true }, obi: { color: '#1e1e22', knot: 'none' },
      over: { kind: 'haori', color: '#26262b', lining: '#6b4b9c', trim: '#c0232c', open: 24 }, sleeves: { kind: 'wide' },
      arm: { '-1': { E: [-32, -20, 12], H: [-12, -4, 24], hand: 'twofinger' } },
      bottom: { kind: 'hakama', color: '#6b4b9c' }, feet: { kind: 'sandal', color: '#26262b', sole: '#e0b23c' },
      prop: { kind: 'fuda1', hand: 1 }, companions: [{ kind: 'imp' }]
    },
    oen: {
      build: 'small', skin: '#f7ddc2', hair: { color: '#6f9a52', bangs: 'messy', front: 4, side: -40, back: -48, amp: 11, vol: 7 }, streaks: [{ th: 12, w: 8, color: '#f4f1ea', len: 32 }],
      ears: { kind: 'cat', color: '#6f9a52', inner: '#f0c0c8', tuft: '#ffffff', th: 46, ph: 44 },
      glasses: { color: '#1d1a1c' }, eyes: { style: 'iris', color: '#e8901f' }, mouth: 'openFang',
      top: { color: '#6d9950', trim: '#26262b', inner: '#26262b', cord: '#e8901f' }, obi: { color: '#f0ede8', knot: 'bow' },
      over: { kind: 'haori', color: '#ce5a1d', lining: '#a8481a', pattern: { kind: 'flower4', color: '#f7efe0', r: 5 }, open: 26, hem: 46 }, sleeves: { kind: 'wide' }, pose: 'fists',
      bottom: { kind: 'skirt', color: '#6d9950' }, legs: { color: '#3e4247', top: 0.25, band: '#f0ede8' }, feet: { kind: 'geta', color: '#f4f1ea', sole: '#8a5a36', strap: '#4f8a3a' },
      back: { box: { color: '#7a4a26', strap: '#f1efe8' } }, tail: { kind: 'cat', color: '#6f9a52', tip: '#f4f1ea', side: 1 }
    },
    izuna: {
      skin: '#f8dfc6', hair: { color: '#221f1e', bangs: 'part', front: 4, side: -54, back: -58, partH: 12, vol: 5, parts: [{ kind: 'long', len: 1.1 }], locks: { th: 70, w: [14, 14, 12, 4], inner: '#2f97d6', ph1: -86 } },
      ears: { kind: 'fox', color: '#221f1e', inner: '#f4f1ea', tuft: '#ffffff' },
      eyes: { style: 'iris', color: '#6d42b0', lash: true, wink: 1 }, mouth: 'open', marks: [{ kind: 'mole', side: -1 }],
      top: { color: '#f0ede8', trim: '#26262b', inner: '#26262b' }, obi: { color: '#d9a62a', knot: 'none' },
      sleeves: { kind: 'wide', trim: '#26262b' }, arm: { '-1': { E: [-32, -16, 12], H: [-16, 4, 22], hand: 'point' } },
      bottom: { kind: 'hakama', color: '#a32530', bow: '#c8302c' }, feet: { kind: 'sandal', color: '#f4f1ea', strap: '#c8302c' },
      tail: { kind: 'fox', color: '#221f1e', tip: '#f4f1ea', side: 1 }
    },
    sekishusai: {
      skin: '#efc9a2', hair: { color: '#2a2a2e', bangs: 'jag', front: 8, side: -26, back: -40, amp: 13, per: 12, vol: 6, parts: [{ kind: 'spikes', list: [[0, 74, 34, 16, 0], [-24, 66, 30, 14, -10], [24, 66, 30, 14, 10], [-60, 52, 22, 14, -16], [60, 52, 22, 14, 16], [-150, 40, 22, 16], [150, 40, 22, 16]] }, { kind: 'top', h: 0.95, w: [22, 16, 8, 2], ring: '#c75b18' }, { kind: 'goatee' }] },
      streaks: [{ th: 4, w: 12, color: '#e8e8e6', kind: 'bolt' }],
      eyes: { style: 'sharp', color: '#c75b18' }, brows: 'thick', mouth: 'grinFang', cheek: false,
      top: { color: '#26262b', collar: 'high', trim: '#d9d9d6' }, obi: { color: '#8e2432', knot: 'knot' },
      over: { kind: 'haori', color: '#26262b', lining: '#26262b', trim: '#d9d9d6', open: 22, hem: 44 }, sleeves: { kind: 'wide', pattern: 'flame', patternColor: '#c8302c' },
      arm: { '1': { E: [34, -26, 10], H: [30, -34, 20], hand: 'fist' } },
      bottom: { kind: 'hakama', color: '#26262b' }, feet: { kind: 'sandal', color: '#26262b', strap: '#f4f1ea' },
      back: { katana: { hip: true, side: 1, second: true } }
    },
    sasagane: {
      skin: '#f3edee', hair: { color: '#211d22', bangs: 'part', front: 6, side: -44, back: -52, partH: 10, vol: 5, parts: [{ kind: 'oiran', stripe: '#7a3ea6' }] },
      pins: { color: '#d8a63a', tip: '#d8303a', comb: '#d8a63a', list: [[-30, 60, 30, -14, 14], [-15, 70, 32, -6, 18], [15, 70, 32, 6, 18], [30, 60, 30, 14, 14], [-52, 48, 26, -20, 8], [52, 48, 26, 20, 8]] },
      eyes: { style: 'iris', color: '#e23a6e', pupil: 'heart', pupilColor: '#ff8ac0', lash: true }, shadowLid: '#7a3ea6', mouth: 'fang', marks: [{ kind: 'diamond', color: '#d8263f' }],
      top: { color: '#7a3ea6', len: 'long', trim: '#f4f1ea', inner: '#7a3ea6', pattern: { kind: 'butterfly', color: '#d8a63a', r: 6 } }, obi: { color: '#d8a63a', knot: 'spider' },
      over: { kind: 'uchikake', color: '#241f27', lining: '#8e2432', pattern: { kind: 'swirl', color: '#f4f1ea' }, open: 26, flareOpen: 14 }, sleeves: { kind: 'long', color: '#241f27', pattern: 'flame', patternColor: '#8e2432' },
      bottom: { kind: 'none' }, feet: { kind: 'geta', color: '#f4f1ea', sole: '#1a1618', strap: '#d8303a', tall: true, trim: '#d8a63a' }, prop: { kind: 'pipe' }
    }
  };


  // ---- まとめる ----
  var CHARS = ROSTER.map(function (r) {
    var o = {}, k;
    for (k in r) o[k] = r[k];
    o.art = ART[r.id];
    return o;
  });
  var BY_ID = {};
  CHARS.forEach(function (c) { BY_ID[c.id] = c; });

  // ---- 相棒（ゲーム独自）の外見 ----
  // 公式の39体と見分けがつくよう、見習いの装束（たすき・鉢巻き・背中の木刀）でそろえる
  var PARTNER_OUTFITS = [
    { id: 'ai', name: '藍', top: '#2f4a7a', trim: '#1c2c4c', band: '#c8302c', obi: '#d8b04a' },
    { id: 'wakakusa', name: '若草', top: '#5a8a3a', trim: '#2f4a22', band: '#e0b23c', obi: '#8a5a36' },
    { id: 'kurenai', name: '紅', top: '#b8413a', trim: '#6a1e1a', band: '#2f4a7a', obi: '#f0e6d2' },
    { id: 'yamabuki', name: '山吹', top: '#e0a526', trim: '#7a4e12', band: '#2f6a5a', obi: '#6a3a8a' },
    { id: 'fuji', name: '藤', top: '#8a6ab8', trim: '#3e2a5e', band: '#f0e6d2', obi: '#e07a9a' },
    { id: 'sumi', name: '墨', top: '#3a3a42', trim: '#1e1e22', band: '#e8e4da', obi: '#c8302c' }
  ];
  var PARTNER_HAIRS = [
    { id: 'short', name: 'はねっ毛', hair: { bangs: 'jag', front: 8, side: -28, back: -42, amp: 10, per: 15, vol: 6 } },
    { id: 'pony', name: 'ポニーテール', hair: { bangs: 'straight', front: 3, side: -44, back: -50, vol: 5, parts: [{ kind: 'pony', sway: -1 }] } },
    { id: 'bob', name: 'おかっぱ', hair: { bangs: 'straight', front: 2, side: -54, back: -56, fw: 56, vol: 5 } },
    { id: 'buns', name: 'おだんご', hair: { bangs: 'straight', front: 3, side: -46, back: -52, vol: 5, parts: [{ kind: 'bun', th: -56, ph: 60, r: 17 }, { kind: 'bun', th: 56, ph: 60, r: 17 }] } },
    { id: 'spiky', name: 'つんつん', hair: { bangs: 'messy', front: 6, side: -30, back: -44, amp: 12, vol: 7, parts: [{ kind: 'spikes', list: [[0, 62, 18, 14, 0], [-40, 50, 16, 12, -12], [40, 50, 16, 12, 12], [180, 36, 14, 14]] }] } }
  ];
  var PARTNER_HAIR_COLORS = [
    { id: 'kuro', name: '黒', color: '#2a2226' },
    { id: 'cha', name: '茶', color: '#6a4228' },
    { id: 'kuri', name: '栗', color: '#9a5a2e' },
    { id: 'gin', name: '銀', color: '#b9b6b0' }
  ];
  var PARTNER_ACCS = [
    { id: 'none', name: 'なし' },
    { id: 'scarf', name: '襟巻き' },
    { id: 'mask', name: '口当て' },
    { id: 'plate', name: '鉢金' }
  ];
  // 呼び名（選ぶだけ。自由に文字を打つ場面は作らない）。公式の39体と同じ名前は入れない
  var PARTNER_NAMES = ['コタロウ', 'スズ', 'マル', 'ハナ', 'ヒナタ', 'ソラ', 'カエデ', 'ユキ', 'ツムギ', 'ゲンタ', 'モモ', 'コムギ', 'アオ', 'キキ', 'ジロウ', 'ミツバ'];
  // end：名詞のあとの語尾（{E}）  vend：動詞・形容詞のあとの語尾（{V}）
  var PARTNER_VOICES = [
    { id: 'boku', name: 'ぼく', I: 'ぼく', end: 'だよ', vend: 'よ' },
    { id: 'watashi', name: 'わたし', I: 'わたし', end: 'だよ', vend: 'よ' },
    { id: 'oira', name: 'おいら', I: 'おいら', end: 'だぜ', vend: 'ぜ' },
    { id: 'sessha', name: '拙者', I: '拙者', end: 'でござる', vend: 'でござる' }
  ];

  function pick(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }

  // look: { outfit, hair, hairColor, acc, costume }  costume は道場札で交換した衣装（色・柄の上書き）
  function partnerArt(look, costume) {
    look = look || {};
    var st = pick(PARTNER_OUTFITS, look.outfit), hs = pick(PARTNER_HAIRS, look.hair), hc = pick(PARTNER_HAIR_COLORS, look.hairColor);
    var cs = costume || {};
    var hair = JSON.parse(JSON.stringify(hs.hair));
    hair.color = hc.color;
    if (hair.parts) hair.parts.forEach(function (p) { if (p.kind === 'pony') p.tie = cs.band || st.band; });
    var top = cs.top || st.top, trim = cs.trim || st.trim;
    var def = {
      skin: '#f7dcc2', hair: hair,
      eyes: { style: 'iris', color: '#3a2a22', lash: look.hair === 'pony' || look.hair === 'buns' || look.hair === 'bob' }, mouth: 'smile',
      band: { color: cs.band || st.band, plate: look.acc === 'plate' ? 3 : 0 },
      top: { color: top, trim: trim, inner: trim, tasuki: '#f4efe4', pattern: cs.pattern || null }, obi: { color: cs.obi || st.obi, knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#4a3a30' },
      bottom: { kind: 'pants', color: top, wrap: '#4a3a30' }, feet: { kind: 'sandal', color: '#2a2226', strap: '#f4efe4' },
      back: { katana: { saya: '#b98a57', hilt: '#7a4a2a', guard: '#5a3a20', tip: '#9a6a3a', wrap: '#f1e6cf' } } // 背中の木刀
    };
    if (look.acc === 'scarf') def.scarf = { color: cs.scarf || '#e8e4da', dir: -1 };
    if (look.acc === 'mask') { def.mask = { kind: 'cloth', color: trim }; def.cheek = false; }
    return def;
  }
  // プレイヤー（見習い）：いつも同じ姿。相棒と見分けやすいよう白い鉢巻きと鼠色の装束
  function playerArt() {
    return {
      skin: '#f5d6b8', hair: { color: '#2a2226', bangs: 'jag', front: 6, side: -30, back: -44, amp: 9, per: 15, vol: 6 },
      eyes: { style: 'iris', color: '#2a2226' }, mouth: 'smile', band: { color: '#f4efe4', plate: 0 },
      top: { color: '#5a6478', trim: '#2e3444', inner: '#2e3444', tasuki: '#c8302c' }, obi: { color: '#2e3444', knot: 'knot' },
      sleeves: { kind: 'short' }, arms: { guard: '#3a3a40' },
      bottom: { kind: 'pants', color: '#5a6478', wrap: '#3a3a40' }, feet: { kind: 'sandal', color: '#2a2226' },
      back: { katana: {} }
    };
  }

  var api = {
    CHARS: CHARS, BY_ID: BY_ID, ART: ART,
    PARTNER_OUTFITS: PARTNER_OUTFITS, PARTNER_HAIRS: PARTNER_HAIRS, PARTNER_HAIR_COLORS: PARTNER_HAIR_COLORS, PARTNER_ACCS: PARTNER_ACCS,
    PARTNER_NAMES: PARTNER_NAMES, PARTNER_VOICES: PARTNER_VOICES, partnerArt: partnerArt, playerArt: playerArt, pick: pick
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NAD_CHARS = api;
})(typeof window !== 'undefined' ? window : globalThis);
