/* ニンジャ里ライフ — 39体のキャラクター
 * ROSTER：公式データ（番号・名前・クラン・忍術・武器・誕生日・紹介文・色）
 * ART   ：描画エンジン art.js 用の見た目の定義（公式イラストを見ながら作ったゲーム用アレンジ）
 * LIFE  ：里での好み（likes＝好きな物のタグ、home＝居場所になる置物）とセリフ（本作の創作）
 * CryptoNinja（CC0・Ninja DAO）の非公式ファンゲーム。セリフと里での設定は本作の創作で、公式設定ではない。
 */
(function (root) {
  'use strict';
  // ---- 公式データ（ninja-dao.com/characters の39体。tamehiro3/ninsai-kakurenbo の chars.js から転記）----
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

  // ---- 見た目（art.js の定義）----
  var KT = { katana: {} };
  var ART = {
    jin: {
      hood: { color: '#26262b' }, mask: { kind: 'cloth', color: '#26262b' }, eyes: { style: 'sharp', color: '#2a2a30' }, brows: 'none', cheek: false,
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#26262b', trim: '#1b1b20', inner: '#44444a', mesh: true, tasuki: '#1b1b20' }, obi: { color: '#6e6e73', knot: 'buckle', knotColor: '#9a9ca3' },
      sleeves: { kind: 'short' }, arms: { guard: '#4c4c54' }, bottom: { kind: 'pants', color: '#26262b', wrap: '#55555c' }, feet: { kind: 'sandal', color: '#1e1e22' },
      back: KT, prop: { kind: 'shuriken' },
      off: { eyes: { style: 'slit' }, mask: { kind: 'cloth', color: '#26262b', top: -27 }, hood: { color: '#2b2b30', front: -3 } }
    },
    sakuya: {
      skin: '#f8ddc3', hair: { color: '#28222a', bangs: 'straight', front: 2, side: -42, back: -50, vol: 5, parts: [{ kind: 'pony', sway: -1, tie: '#d8302c' }] },
      eyes: { style: 'iris', color: '#3a2a2a', lash: true }, band: { color: '#d45ba0', plate: 0 },
      top: { color: '#d2669e', trim: '#28222a', inner: '#28222a', tasuki: '#28222a' }, obi: { color: '#b2954a', knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#2a2a2e' }, bottom: { kind: 'skirt', color: '#d2669e' }, legs: { color: '#2a2a2e', top: 0.3 }, feet: { kind: 'sandal', color: '#2a2a2e' },
      back: KT, prop: { kind: 'shuriken' },
      off: { hair: { vol: 3, side: -56, back: -56, fw: 56 }, eyes: { style: 'simple', color: '#66626a' }, blush: true, band: { under: true, hi: 27, lo: 15, knot: -100 } }
    },
    kohaku: {
      skin: '#f6dbc1', hair: { color: '#241f26', bangs: 'straight', front: 2, side: -42, back: -50, vol: 5, parts: [{ kind: 'pony', sway: -1, tie: '#3fc1c9' }] }, mask: { kind: 'fox' },
      band: { color: '#6e4f9c', plate: 0 },
      top: { color: '#6e4f9c', trim: '#241f26', inner: '#241f26', tasuki: '#241f26' }, obi: { color: '#6c7cc0', knot: 'knot' },
      sleeves: { kind: 'short' }, arms: { guard: '#2a2a2e' }, bottom: { kind: 'skirt', color: '#6e4f9c' }, legs: { color: '#9c9ca1', top: 0.3 }, feet: { kind: 'sandal', color: '#2a2a2e', toe: '#6e4f9c' },
      prop: { kind: 'katana' },
      off: { hair: { parts: [{ kind: 'pony', sway: -1, tie: '#3fc1c9', len: 0.82, up: 0.92 }] }, band: { under: true, hi: 26, lo: 14, knot: -100 } }
    },
    shiba: {
      skin: '#e3aa60', head: { kind: 'dog', fur: '#e3aa60', fur2: '#f4f0e8' }, ears: { kind: 'dog', color: '#e3aa60', inner: '#f4f0e8', th: 46, ph: 44, len: 24, w: 15 },
      eyes: { style: 'dot' }, brows: 'none', cheek: false, band: { color: '#46703e', plate: 3 },
      top: { color: '#46703e', trim: '#232327', inner: '#2f4f2a', tasuki: '#232327' }, obi: { color: '#232327', knot: 'buckle' },
      sleeves: { kind: 'short' }, arms: { color: '#e3aa60', hand: '#f4f0e8' }, bottom: { kind: 'pants', color: '#46703e', wrap: '#2a2a2e' },
      feet: { kind: 'sandal', color: '#f4f0e8', strap: '#232327' }, back: KT, tail: { kind: 'dog', color: '#e3aa60', tip: '#f4f0e8' },
      off: { skin: '#cda574', head: { kind: 'dog', fur: '#cda574', fur2: '#f8f6f0', sx: 1.04 }, ears: { kind: 'dog', color: '#cda574', inner: '#f8f6f0', th: 50, ph: 44, len: 22, w: 15, scribble: true },
        eyes: { style: 'dot', color: '#3a2620', w: 7.5, h: 8.5 }, band: { color: '#41693a', plate: 3 }, arms: { color: '#cda574', hand: '#f8f6f0' }, top: { vee: '#cda574' }, tail: { kind: 'dog', color: '#cda574', tip: '#f8f6f0' } }
    },
    kanaoni: {
      skin: '#f2dfc4', hood: { color: '#33505d', front: -3 }, mask: { kind: 'oni', color: '#c8392a' }, horns: { color: '#efe3c4', list: [[-26, 30, 26, 8], [26, 30, 26, 8]] },
      band: { color: '#d8452c', plate: 0, hi: 40, lo: 28 }, fur: { color: '#b69b72' },
      top: { color: '#33505d', trim: '#22363f', inner: '#26262a', mesh: true, tasuki: '#26262a', cord: '#efe3c4' }, obi: { color: '#7a7a80', knot: 'buckle' },
      sleeves: { kind: 'short' }, arms: { guard: '#aeb2b8' }, bottom: { kind: 'pants', color: '#2e4a55', wrap: '#26262a' }, feet: { kind: 'sandal', color: '#26262a', strap: '#b69b72' },
      prop: { kind: 'gyuto' },
      off: { horns: { color: '#d9ccae', list: [[-24, 16, 30, 9], [26, 14, 28, 9]] }, band: { color: '#c8392a', plate: 0, hi: 30, lo: 22, knot: -110 }, mask: { kind: 'oni', color: '#a8323a' }, hood: { color: '#2e4c58', front: 12 } }
    },
    oto: {
      build: 'small', skin: '#f7dcc4', hair: { color: '#f0a2b6', bangs: 'straight', front: 3, side: -50, back: -52, fw: 54, vol: 5 }, ears: { kind: 'rabbit', color: '#f5b3c6', inner: '#f7e6d8' },
      eyes: { style: 'iris', color: '#3b2a1e', pupil: 'star', pupilColor: '#f5c542', lash: true }, mouth: 'open',
      band: { color: '#4f9a4a', plate: 0, hi: 36, lo: 25 },
      top: { color: '#f7c9d4', trim: '#e7a6b8', inner: '#f2e7dc', tasuki: '#3a3a40', emblem: { kind: 'rabbit', color: '#d8497c', th: 18, y: 76 } }, obi: { color: '#d8497c', knot: 'bow' },
      sleeves: { kind: 'short' }, bottom: { kind: 'skirt', color: '#f7c9d4' }, legs: { color: '#3a3a40', top: 0.12 }, feet: { kind: 'boot', color: '#3a3a40' },
      back: { katana: {}, tube: '#4f9a4a' }, prop: { kind: 'scroll', color: '#4d8a4a' },
      off: { skin: '#f3e3dc', hair: { color: '#f0aecd', bangs: 'straight', front: -2, side: -60, back: -62, fw: 60, vol: 4, flare: 7 },
        ears: { kind: 'rabbit', color: '#f2a9cb', inner: '#f4eef0', th: 46, ph: 52, w: 16, len: 56, lean: 6, bulge: 9 },
        band: { color: '#5fb39a', plate: 0, under: true, hi: 26, lo: 16, knot: -100 }, blush: '#f4a6b8', mouth: 'openFang',
        eyes: { style: 'anime', color: '#2a221e', pupil: 'star', pupilColor: '#f5c542', lash: true },
        top: { tasuki: null, emblem: { kind: 'rabbit', color: '#ef8fb8', th: 30, y: 84, r: 6 } }, back: { katana: {} } }
    },
    rotten: {
      skin: '#8cb891', hood: { color: '#4e3a2a', front: 16 }, arrow: true, eyepatch: { side: 1 }, eyes: { style: 'wide' }, brows: 'none', mouth: 'openFang', cheek: false,
      marks: [{ kind: 'drool' }, { kind: 'blood', th: 26, ph: 60 }],
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#57402f', trim: '#3e2e22', inner: '#3e2e22', tasuki: '#232326', pattern: { kind: 'blood', color: '#7a1f1f', r: 3.2 } }, obi: { color: '#2a2a2e', studs: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { color: '#8cb891' }, bottom: { kind: 'shorts', color: '#57402f' }, legs: { color: '#8cb891' }, feet: { kind: 'boot', color: '#232326', toe: '#efe9de' },
      off: { skin: '#6a9a83', arms: { color: '#6a9a83' }, legs: { color: '#6a9a83' }, eyepatch: null, eyes: { style: 'wide', styleR: 'hollow', w: 9, h: 9 }, mouth: 'grin',
        hood: { color: '#3d3128', front: 18 }, band: { color: '#2f3a48', plate: 3, tilt: -12, hi: 20, lo: -5 }, top: { color: '#4f3c2e' } }
    },
    nagisa: {
      skin: '#e9b183', hair: { color: '#c6cad0', bangs: 'messy', front: 8, side: -30, back: -44, amp: 10, per: 15, vol: 7, parts: [{ kind: 'spikes', list: [[-66, 36, 16, 14, -10], [66, 36, 16, 14, 10], [-150, 30, 14, 16], [150, 30, 14, 16], [180, 12, 12, 16]] }] },
      eyes: { style: 'sharp', color: '#35a05a' }, marks: [{ kind: 'freckles', color: '#a0603a' }], mask: { kind: 'cloth', color: '#2e3138' }, cheek: false,
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#2e3138', trim: '#1e1f24', inner: '#1e1f24', tasuki: '#1e1f24' }, obi: { color: '#c9a03a', knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#7a7d84' }, bottom: { kind: 'skirt', color: '#2e3138' }, legs: { color: '#2b2b2e', top: 0.2 }, feet: { kind: 'boot', color: '#2b2b2e' },
      back: KT, prop: { kind: 'scroll', color: '#c8392a', cap: '#f4f1ea' },
      off: { hair: { color: '#b9c4cc', bangs: 'messy', front: 6, side: -46, back: -56, amp: 9, per: 15, vol: 5, rough: 11, roughTop: 30 },
        band: { color: '#26302a', plate: 3 }, mask: { kind: 'cloth', color: '#2d3241', top: -27 }, top: { color: '#2d3241' }, bottom: { kind: 'skirt', color: '#2d3241' } }
    },
    anne: {
      skin: '#f5dcc0', hair: { color: '#63402e', bangs: 'straight', front: 1, side: -54, back: -56, fw: 56, vol: 5, parts: [{ kind: 'top', h: 1.08, w: [16, 12, 9, 3], x2: -6, x3: -14, ring: '#c4282b' }, { kind: 'top', h: 1.02, w: [16, 12, 9, 3], x2: 6, x3: 14 }] },
      eyes: { style: 'iris', color: '#5c4566', lash: true }, scarf: { color: '#c4282b', dir: -1 },
      top: { color: '#4f7a3d', trim: '#2a3a22', inner: '#2a3a22', tasuki: '#232326' }, obi: { color: '#b7913c', knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#7a7d84' }, bottom: { kind: 'skirt', color: '#4f7a3d' }, legs: { color: '#4a4c50', top: 0.3 }, feet: { kind: 'boot', color: '#232326' },
      back: KT, prop: { kind: 'dango' },
      off: { hair: { color: '#4f4040', bangs: 'straight', front: -3, side: -60, back: -62, fw: 60, vol: 4, flare: 1, parts: [{ kind: 'top', h: 1.08, w: [16, 12, 9, 3], x2: -6, x3: -14, ring: '#c4282b' }, { kind: 'top', h: 1.02, w: [16, 12, 9, 3], x2: 6, x3: 14 }] },
        eyes: { style: 'anime', color: '#3e3040', sharp: true, browY: 17 }, brows: 'angry', browsOver: true, browColor: '#1d1416', blush: true, mouth: 'wavy', scarf: { color: '#b3282a', dir: -1, big: true, top: 5, len: 96 } }
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
      sleeves: { kind: 'none' }, arms: { color: '#f5ce1c' }, bottom: { kind: 'none' }, legs: { w: 8 }, feet: { kind: 'bird' }, prop: { kind: 'bomb' },
      off: { skin: '#e8cf38', head: { kind: 'chick', fur: '#e8cf38', cheek: '#f0a04a' }, crest: { color: '#e8cf38' }, band: { color: '#2a2a30', plate: 3, hi: 30, lo: 6 },
        eyes: { style: 'dot', w: 6, h: 7 }, arms: { color: '#e8cf38' }, legs: { w: 15, skin: '#e8cf38' }, top: { color: '#efece6', vee: '#e8cf38' }, sleeves: { kind: 'short', color: '#efece6' } }
    },
    torika: {
      skin: '#f7d9c4', hair: { color: '#c4586f', bangs: 'side', slope: -0.25, front: 6, side: -40, back: -48, vol: 6 },
      eyes: { style: 'iris', color: '#c2185b', lash: true }, mouth: 'shout', marks: [{ kind: 'freckles' }],
      band: { color: '#1e1e22', plate: 2, plateColor: '#6e7078' },
      top: { color: '#26262b', trim: '#e0b32a', inner: '#1e1e22', tasuki: '#1e1e22', emblem: { kind: 'cross', color: '#e0b32a', th: 16, y: 82 }, hemTrim: '#e0b32a' }, obi: { color: '#e0b32a', knot: 'bow' },
      sleeves: { kind: 'short', trim: '#e0b32a' }, bottom: { kind: 'skirt', color: '#26262b' }, legs: { color: '#4b4b52', top: 0.25 }, feet: { kind: 'boot', color: '#1e1e22' },
      back: { katana: { guard: '#e0b32a' } }, prop: { kind: 'shuriken' },
      off: { hair: { color: '#ad6f70', bangs: 'jag', amp: 10, per: 13, front: 3, side: -52, back: -62, fw: 54, vol: 6, rough: 0, parts: [{ kind: 'spikes', list: [[-80, -40, 16, 12, -16], [-96, -30, 16, 12, -14], [84, -40, 14, 12, 14], [140, -40, 16, 14], [-140, -40, 16, 14]] }] },
        band: { color: '#1e1e22', plate: 1, plateShape: 'tri', pw: 30, plateColor: '#a2a4ab', hi: 34, lo: 21, knot: -105 }, earsHuman: true,
        eyes: { style: 'anime', color: '#c24a82', lash: true }, blush: true,
        top: { emblem: { kind: 'cross', color: '#e0b32a', th: -30, y: 84, r: 6 }, hemTrim: null }, sleeves: { kind: 'short', stripes: '#e0b32a' } }
    },
    atoza: {
      skin: '#c68a5c', hair: { color: '#6d7076', bangs: 'messy', front: 4, side: -34, back: -46, amp: 12, vol: 7, cover: [-62, -2, -40] }, horns: { color: '#c9a24a', list: [[-42, 36, 22, 7], [42, 36, 22, 7]] },
      eyes: { style: 'iris', color: '#d42630', pupil: 'diamond' }, brows: 'angry', mouth: 'flat', cheek: false,
      scarf: { color: '#d42630', dir: -1, len: 100 },
      top: { color: '#2a2a30', trim: '#1e1e22', inner: '#1e1e22', tasuki: '#1e1e22', flameChest: '#1e7c84' }, obi: { color: '#3a3a40', plates: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { guard: '#aeb2b8', spikes: true }, bottom: { kind: 'pants', color: '#26262b', wrap: '#1e1e22' }, feet: { kind: 'boot', color: '#1e1e22' },
      back: KT, prop: { kind: 'kanabo' },
      off: { skin: '#c86a58', hair: { color: '#5d6762', bangs: 'messy', front: 2, side: -44, back: -56, amp: 10, per: 18, vol: 7, rough: 9, roughTop: 2, cover: [6, 64, -46] },
        horns: { color: '#d8ccaa', list: [[-40, 48, 22, 9, 34, 10], [40, 48, 20, 9, 34, 10]] }, eyes: { style: 'anime', color: '#d42630', pupil: 'sparkle' }, brows: 'none',
        scarf: { color: '#c42a30', dir: -1, len: 104, big: true, top: 13 } }
    },
    hayate: {
      skin: '#f0c6a0', hair: { color: '#55595f', bangs: 'jag', front: 8, side: -26, back: -40, amp: 12, per: 14, vol: 6, parts: [{ kind: 'spikes', list: [[0, 64, 22, 16, 0], [-40, 52, 20, 14, -12], [40, 52, 20, 14, 12], [-120, 40, 18, 16], [120, 40, 18, 16], [180, 40, 18, 16], [-84, 28, 16, 14], [84, 28, 16, 14]] }] },
      eyes: { style: 'sharp', color: '#f5c518' }, brows: 'thick', mask: { kind: 'cloth', color: '#26386b' }, cheek: false,
      top: { color: '#26386b', trim: '#1a2a52', inner: '#2a2a30', mesh: true, tasuki: '#1e1e22', emblem: { kind: 'star', color: '#c9ccd3', th: 18, y: 82, r: 6 } }, obi: { color: '#3a3a40', plates: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { guard: '#2a2a30', guardSide: 1, glove: { side: -1, color: '#8a5a36', tassel: '#3a7ad8' } },
      arm: { '-1': { E: [-36, -20, 10], H: [-38, -8, 18], hand: 'fist' } },
      bottom: { kind: 'pants', color: '#26386b', wrap: '#1e1e22' }, feet: { kind: 'boot', color: '#1e1e22', toe: '#a8adb5' },
      back: KT, companions: [{ kind: 'hawk', hand: -1 }],
      off: { hair: { color: '#5c5f63', bangs: 'jag', front: 0, side: -30, back: -46, amp: 13, per: 15, vol: 6, rough: 0, parts: [{ kind: 'spikes', list: [[10, 74, 34, 40, 56, 0], [48, 60, 38, 36, 50, -4], [84, 42, 34, 30, 42, -8], [118, 24, 26, 24, 32, -8], [-130, 30, 18, 16]] }] }, earsHuman: true,
        eyes: { style: 'half', color: '#e8b818', sharp: true }, brows: 'thick', browsOver: true, mask: { kind: 'cloth', color: '#252b4f', top: -27 }, top: { color: '#252b4f' }, marks: [{ kind: 'scar', th: 30, ph: -6 }] }
    },
    uka: {
      skin: '#f7dac0', hair: { color: '#d9a45c', bangs: 'messy', front: 4, side: -50, back: -56, amp: 10, vol: 8, tipColor: '#f6f1e6' }, ears: { kind: 'fox', color: '#d9a45c', inner: '#f6f1e6', tuft: '#ffffff' },
      eyes: { style: 'iris', color: '#6b3fa8', lash: true }, mouth: 'fang', marks: [{ kind: 'whiskers', color: '#b0703a' }],
      top: { color: '#f0ede8', trim: '#c8202c', inner: '#c8202c', tasuki: '#c8202c', lower: '#c8202c' }, obi: { color: '#c8202c', knot: 'bow' },
      sleeves: { kind: 'short', trim: '#c8202c', cross: '#c8202c' },
      arm: { '-1': { E: [-32, -18, 12], H: [-14, 2, 24], hand: 'peace' } },
      bottom: { kind: 'skirt', color: '#c8202c' }, legs: { color: '#f4f1ea', dash: '#c8202c', top: 0.25 }, feet: { kind: 'sandal', color: '#2a2226', strap: '#c8202c' },
      tail: { kind: 'fox', color: '#d9a45c', tip: '#f6f1e6', side: -1 }, prop: { kind: 'fuda', hand: 1 },
      off: { hair: { color: '#c09a62', bangs: 'messy', front: -4, side: -56, back: -60, amp: 11, per: 16, vol: 6, rough: 0, tipColor: null, parts: [{ kind: 'curtain', len: 1.1, w: [24, 28, 26, 14], tip: '#f6f1e6' }] },
        ears: { kind: 'fox', color: '#c09a62', inner: '#f6f1e6', tuft: '#ffffff', th: 42 }, eyes: { style: 'anime', color: '#7a68d8', sharp: true, pupil: 'sparkle', browY: 18 }, browsOver: true, mouth: 'openFang', blush: true,
        marks: [{ kind: 'whiskers', color: '#2a1e1a' }],
        tail: { kind: 'fox', color: '#c09a62', tip: '#f6f1e6', side: -1 } }
    },
    ganzi: {
      skin: '#ebbe95', hair: { color: '#8e8e90', bangs: 'swept', front: 20, side: -24, back: -40, vol: 6, slope: 0.2, parts: [{ kind: 'top', h: 0.98, w: [34, 26, 16, 4] }, { kind: 'spikes', list: [[-24, 72, 18, 14, -16], [24, 72, 18, 14, 16], [0, 80, 22, 14, 0], [-160, 50, 16, 16], [160, 50, 16, 16]] }, { kind: 'beard', color: '#9a9a9c' }] },
      streaks: [{ th: -14, w: 10, color: '#ececea', len: 40 }],
      eyes: { style: 'sharp', color: '#5a7a90' }, eyepatch: { side: 1 }, brows: 'thick', browColor: '#6e6e70', cheek: false,
      top: { color: '#6e5d48', trim: '#4a3e30', inner: '#4a3e30' }, obi: { color: '#3a3a3c', knot: 'buckle' },
      over: { kind: 'haori', color: '#2a2a2c', lining: '#b8492a', open: 26 }, sleeves: { kind: 'wide' }, arms: { beads: '#9a4a2a' },
      bottom: { kind: 'hakama', color: '#4a3e30' }, feet: { kind: 'boot', color: '#26262b', toe: '#9a9ca3' }, pose: 'seal',
      off: { hair: { color: '#7e7e7f', bangs: 'swept', front: 24, side: -20, back: -40, vol: 7, slope: 0.25, parts: [{ kind: 'top', h: 1.02, w: [26, 20, 14, 4], ring: '#a8392a' }, { kind: 'beard', color: '#7a7a7b', big: true }] },
        streaks: [{ th: -40, w: 14, color: '#e6e6e3', len: 46 }], brows: 'bushy', browColor: '#9c9c9c', browsOver: true, eyes: { style: 'half', color: '#6a8494', sharp: true, browY: 17 } }
    },
    yui: {
      skin: '#f4d8c0', hair: { color: '#b71c24', bangs: 'straight', front: 1, side: -52, back: -56, fw: 56, vol: 5 }, ribbon: { th: 66, ph: 44, color: '#1a1a1a', size: 2.2 }, flower: { th: 56, ph: 22, color: '#f7b8cc', size: 8 },
      eyes: { style: 'iris', color: '#2a1a1a', lash: true },
      top: { color: '#2b2b2e', len: 'long', trim: '#f4f1ea', inner: '#f4f1ea' }, obi: { color: '#c0392b', knot: 'knot' },
      sleeves: { kind: 'long', pattern: 'sakura', patternColor: '#f4b6c8' }, bottom: { kind: 'none' }, feet: { kind: 'geta', color: '#f4f1ea', sole: '#1a1a1a', strap: '#f4f1ea' },
      pose: 'hold', prop: { kind: 'scroll', color: '#6b3fa8', cap: '#8a5a36' },
      off: { hair: { color: '#a8191b', bangs: 'straight', front: -3, side: -66, back: -66, fw: 66, vol: 7, flare: 6, strands: [-34, -12, 10, 30] },
        ribbon: { th: 58, ph: 66, color: '#1a1a1a', size: 2.6, behind: true }, flower: { th: 60, ph: 28, color: '#f7b8cc', size: 9 },
        eyes: { style: 'narrow', color: '#1a1414' }, mouth: 'lips', blush: true,
        sleeves: { kind: 'long', pattern: 'flower4', patternColor: '#f4f1ea' }, top: { vee: '#f4f1ea' } }
    },
    fuuta: {
      skin: '#f0cba0', hair: { color: '#7e2e2c', bangs: 'jag', front: 8, side: -26, back: -40, amp: 12, per: 13, vol: 6 }, hat: { color: '#9a6a3a', crest: '#a32b29', r: 72 },
      eyes: { style: 'sharp', color: '#3a1a18' }, mouth: 'grin', leaf: true, brows: 'thick', cheek: false,
      top: { color: '#22304f', trim: '#16203a', inner: '#16203a', tasuki: '#1a1a1a' }, obi: { color: '#5a5c63', knot: 'buckle' },
      over: { kind: 'cape', color: '#22304f', lining: '#a32b29', pattern: { kind: 'stripes', color: '#e8e4da', step: 22, w: 3.5 }, open: 30 },
      sleeves: { kind: 'short', color: '#22304f' }, arm: { '1': { E: [34, -22, 12], H: [12, -6, 24], hand: 'twofinger' } },
      bottom: { kind: 'pants', color: '#22304f', wrap: '#1a1a1a' }, feet: { kind: 'boot', color: '#1a1a1a', toe: '#5a5c63' },
      back: { katana: { hip: true, side: -1 } },
      off: { hat: { color: '#8c6748', crest: '#b8322a', r: 80 }, hair: { color: '#80302c', bangs: 'jag', front: -2, side: -30, back: -42, amp: 10, per: 13, vol: 5 }, eyes: { style: 'half', color: '#2a1a18', sharp: true }, mouth: 'smirk' }
    },
    rei: {
      skin: '#f5dcc4', hair: { color: '#1e1e22', bangs: 'part', front: 6, side: -40, back: -50, partH: 14, partW: 24, vol: 4, parts: [{ kind: 'bun', th: 180, ph: 74, r: 18 }], locks: { th: 78, w: [10, 10, 8, 3], ph1: -80 } },
      pins: { color: '#e0b23c', list: [[36, 62, 26, 12, 16]] }, flower: { th: 40, ph: 64, color: '#d8303a', size: 6 },
      band: { color: '#1e7c74', plate: 3 },
      eyes: { style: 'sharp', color: '#2a1a1a' }, liner: '#d8303a', mouth: 'flat',
      top: { color: '#a5a5a8', len: 'long', trim: '#f4f1ea', inner: '#f4f1ea', tasuki: '#1a1a1a', pattern: { kind: 'dots', color: '#d8b04a', r: 2 } }, obi: { color: '#5b3a7e', knot: 'knot' },
      sleeves: { kind: 'wide' }, bottom: { kind: 'none' }, feet: { kind: 'boot', color: '#1a1a1a', toe: '#f4f1ea' }, prop: { kind: 'dagger' },
      off: { hair: { color: '#2a2a2e', bangs: 'part', front: 2, side: -46, back: -54, partH: 14, partW: 24, vol: 4, parts: [{ kind: 'bun', th: 170, ph: 78, r: 20 }], locks: { th: 74, w: [12, 12, 10, 3], ph1: -84 } },
        pins: { color: '#e0a23c', list: [[-30, 70, 28, 12, -16]] }, flower: null, band: { color: '#2f6058', plate: 3 },
        eyes: { style: 'half', color: '#2a1a1a', sharp: true }, liner: '#c8303a', mouth: 'lips', blush: true, top: { vee: '#f4f1ea' } }
    },
    sattva: {
      skin: '#f6dcc2', hair: { color: '#1a1a1e', bangs: 'part', front: 14, side: -30, back: -40, partH: 10, vol: 3, parts: [{ kind: 'bun', th: 180, ph: 80, r: 22 }] },
      crown: { color: '#e2b93b' }, veil: { color: '#f4f1ea', front: 10 },
      eyes: { style: 'closed', lash: true }, marks: [{ kind: 'urna', ph: 12, color: '#d8303a' }],
      top: { color: '#f0ede8', len: 'long', trim: '#e2dccf', inner: '#e2dccf', necklace: '#e2b93b', collar: 'round' }, obi: { color: '#c9a227', knot: 'knot' },
      sleeves: { kind: 'wide' }, arm: { '-1': { E: [-32, -22, 12], H: [-12, -10, 24], hand: 'twofinger' } },
      bottom: { kind: 'none' }, feet: { kind: 'sandal', color: '#f6dcc2', sole: '#8a6a44', strap: '#8a6a44' }, halo: true,
      off: { blush: true, eyes: { style: 'closed', lash: true }, mouth: 'smile', marks: [{ kind: 'urna', ph: 6, color: '#d8303a' }] }
    },
    nekomata: {
      skin: '#efe0c4', head: { kind: 'cat', fur: '#efe0c4', fur2: '#f7efdc', patches: [{ poly: [[-110, 92], [-8, 92], [-4, 40], [-30, 22], [-64, 12], [-110, 24]], color: '#6b4a38' }, { poly: [[12, 92], [110, 92], [110, 12], [62, 20], [30, 34], [14, 50]], color: '#b5673a' }] },
      ears: { kind: 'cat', color: '#6b4a38', inner: '#e8b8a8', th: 44, ph: 46 },
      eyes: { style: 'iris', color: '#f2a517', scar: 1 }, brows: 'none', cheek: false,
      band: { color: '#1e1e22', plate: 3 },
      top: { color: '#2c3550', trim: '#1e2438', inner: '#1e2438' }, obi: { color: '#5a5c63', knot: 'buckle' },
      over: { kind: 'haori', color: '#26262b', lining: '#26262b', trim: '#c0972f', open: 24 }, sleeves: { kind: 'wide', trim: '#c0972f' }, arms: { color: '#efe0c4' },
      bottom: { kind: 'hakama', color: '#2c3550' }, feet: { kind: 'sandal', color: '#1f1f23' },
      back: KT, tail: { kind: 'cat', color: '#efe0c4', side: 1, patches: [[0.3, 8, '#6b4a38'], [0.65, 8, '#b5673a']] }, pose: 'seal',
      off: { skin: '#e9dcc4', head: { kind: 'cat', fur: '#e9dcc4', fur2: '#f4ecdc', sx: 1.02, patches: [{ poly: [[-110, 92], [-8, 92], [-6, 50], [-30, 30], [-64, 22], [-110, 30]], color: '#6b4a38' }, { poly: [[12, 92], [110, 92], [110, 22], [62, 26], [30, 38], [14, 54]], color: '#b8703c' }] },
        eyes: { style: 'anime', color: '#f2a517', pupil: 'slit', sharp: true, scar: 1, y: -24 }, mouth: 'cat', band: { color: '#2a3048', plate: 3, hi: 33, lo: 6 } }
    },
    janome: {
      skin: '#f6d6b8', hair: { color: '#4e8a55', bangs: 'jag', front: 8, side: -30, back: -42, amp: 13, per: 13, vol: 6, parts: [{ kind: 'tuft', th: 10, ph: 84, lean: 1 }, { kind: 'spikes', list: [[-130, 40, 16, 14], [130, 40, 16, 14], [180, 30, 16, 16], [-72, 40, 14, 12, -8], [72, 40, 14, 12, 8]] }] },
      band: { color: '#1e1e22', plate: 3 },
      eyes: { style: 'iris', color: '#c42a21', pupil: 'star', pupilColor: '#ffffff' }, mouth: 'openFang',
      top: { color: '#3f6b39', trim: '#2a4a26', inner: '#2a4a26', tasuki: '#1d1d21', pattern: { kind: 'squares', color: '#8cc07a', spots: [[-50, 0.9], [-15, 0.9], [20, 0.9], [55, 0.9]] } }, obi: { color: '#7a4fa6', knot: 'bow' },
      sleeves: { kind: 'short' }, bottom: { kind: 'skirt', color: '#3f6b39' }, legs: { color: '#3b3b41', top: 0.3 }, feet: { kind: 'sandal', color: '#f4f1ea', sole: '#1d1d21', strap: '#1d1d21' },
      back: KT, prop: { kind: 'shuriken' }, companions: [{ kind: 'snake', color: '#f1efe9' }],
      off: { hair: { color: '#5f9a58', bangs: 'jag', front: -2, side: -40, back: -50, amp: 11, per: 15, vol: 6, cover: [10, 40, -18], parts: [{ kind: 'ahoge', th: 20, ph: 82, lean: 1 }] },
        band: { color: '#1e1e22', plate: 0, under: true, hi: 22, lo: 16, knot: -100 }, blush: true, eyes: { style: 'anime', color: '#c42a21', pupil: 'star', pupilColor: '#ffffff' } }
    },
    benten: {
      skin: '#f2dcc4', hair: { color: '#1c1a1d', bangs: 'straight', front: 1, side: -50, back: -56, fw: 56, vol: 5, parts: [{ kind: 'loops' }] },
      pins: { color: '#e0b23c', list: [], comb: '#e0b23c', tassel: '#c42a24' },
      eyes: { style: 'iris', color: '#1c1a1d', lash: true }, liner: '#c42a24', marks: [{ kind: 'brows_red', color: '#c42a24' }],
      top: { color: '#262428', len: 'long', trim: '#c42a24', inner: '#ede7dd', pattern: { kind: 'maple', color: '#c42a24', r: 6 }, emblem: { kind: 'circle', color: '#ede7dd', th: 20, y: 84, r: 5 } }, obi: { color: '#c42a24', knot: 'knot' },
      sleeves: { kind: 'long', pattern: 'maple', patternColor: '#c42a24' }, bottom: { kind: 'none' }, feet: { kind: 'geta', color: '#f4f1ea', sole: '#2a2226', strap: '#c42a24' },
      prop: { kind: 'shamisen' },
      off: { skin: '#f6ece6', eyes: { style: 'anime', color: '#1c1a1d', lash: true, sharp: true }, mouth: 'lips',
        armOff: { '1': { E: [33, -12, 12], H: [30, 8, 20], hand: 'fist' }, '-1': { E: [-34, -16, 10], H: [-20, -32, 22], hand: 'fist' } } }
    },
    karma: {
      skin: '#f5d6b6', hair: { color: '#d5d3d2', bangs: 'jag', front: 6, side: -30, back: -42, amp: 13, per: 13, vol: 7, parts: [{ kind: 'spikes', list: [[-40, 56, 20, 14, -14], [40, 56, 20, 14, 14], [0, 70, 18, 14], [-120, 40, 18, 16], [120, 40, 18, 16], [180, 30, 18, 16]] }] },
      eyes: { style: 'sharp', color: '#c8202b' }, mouth: 'smirk', earring: { side: 1 }, cheek: false,
      scarf: { color: '#4b3f9a', dir: -1, len: 104 },
      top: { color: '#2b2b31', trim: '#1e1e22', inner: '#1e1e22', tasuki: '#b4222c' }, obi: { color: '#2b2b31', chain: '#8a8d94', knot: 'none' },
      sleeves: { kind: 'short', one: -1, color: '#2c3550', shoulder: '#2a2a2e' }, arms: { guard: '#1e1e22', spikes: true },
      bottom: { kind: 'pants', color: '#1e1e22', wrap: '#1e1e22' }, feet: { kind: 'sandal', color: '#f4f1ea', sole: '#1e1e22', strap: '#1e1e22' }, prop: { kind: 'kama' },
      off: { hair: { color: '#c9c8cc', bangs: 'jag', front: -3, side: -42, back: -52, amp: 12, per: 14, vol: 6, rough: 0, parts: [{ kind: 'spikes', list: [[56, 34, 26, 18, 34], [84, 14, 26, 18, 30], [100, -6, 22, 16, 24], [-84, 4, 18, 14, -12], [150, 20, 18, 16], [-150, 20, 18, 16]] }] }, earsHuman: true,
        eyes: { style: 'anime', color: '#c8202b', sharp: true, lower: true }, scarf: { color: '#4b3f9a', dir: -1, len: 104, big: true, top: 1 } }
    },
    ichiya: {
      skin: '#f6d9bc', hair: { color: '#52396b', bangs: 'messy', front: 2, side: -36, back: -46, amp: 13, vol: 9 }, ears: { kind: 'cat', color: '#52396b', inner: '#f0c0c8', th: 46, ph: 44 },
      eyes: { style: 'half', color: '#7b3fc4' }, marks: [{ kind: 'lines', color: '#e0823a' }], cheek: false,
      mask: { kind: 'scarf', color: '#d2822f', color2: '#8a4a1e', pattern: 'check', top: -24, eyes: true },
      top: { color: '#4c3766', trim: '#2a272c', inner: '#2a272c' }, obi: { color: '#9a9ca3', knot: 'none', plates: '#c9ccd3' },
      over: { kind: 'haori', color: '#2a272c', lining: '#2a272c', hem: 24, open: 22 }, sleeves: { kind: 'wide' },
      bottom: { kind: 'hakama', color: '#4c3766' }, feet: { kind: 'sandal', color: '#23222a' },
      prop: { kind: 'brush' }, companions: [{ kind: 'rainbow', side: -1 }, { kind: 'rainbow', side: 1 }],
      off: { hair: { color: '#5a4258', bangs: 'messy', front: -4, side: -40, back: -50, amp: 12, per: 15, vol: 6, rough: 4 }, ears: { kind: 'cat', color: '#5a4258', inner: '#e8c4c8', th: 46, ph: 44 },
        mask: null, scarf: { color: '#d8862f', color2: '#8a4a1e', pattern: 'check', big: true, top: 14, tail: false }, eyes: { style: 'half', color: '#8a52c8' } }
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
      wings: { color: '#26262b', sheen: '#6a5a9a' },
      off: { hair: { color: '#2c2c33', bangs: 'side', slope: 0.3, front: 0, side: -54, back: -58, vol: 6, cover: [-62, -2, -46], parts: [{ kind: 'long', len: 0.8 }] }, eyes: { style: 'anime', color: '#2fbfb2', sharp: true }, mask: { kind: 'cloth', color: '#26262b', top: -27 } }
    },
    xiaolan: {
      skin: '#fbdabe', hair: { color: '#e8703a', bangs: 'side', slope: -0.25, front: 4, side: -40, back: -46, vol: 5, parts: [{ kind: 'bun', th: -52, ph: 58, r: 22 }, { kind: 'bun', th: 52, ph: 58, r: 22 }] },
      eyes: { style: 'iris', color: '#6b4a8c', lash: true }, mouth: 'open', marks: [{ kind: 'freckles', color: '#c07050' }],
      top: { color: '#e0a81e', trim: '#26262b', inner: '#26262b', emblem: { kind: 'diamond', color: '#26262b', th: 18, y: 82, r: 4 } }, obi: { color: '#f0ede8', knot: 'bow' },
      sleeves: { kind: 'short', trim: '#26262b' }, arms: { bandage: true }, arm: { '1': { E: [34, -18, 12], H: [16, 2, 24], hand: 'peace' } },
      bottom: { kind: 'skirt', color: '#e0a81e' }, legs: { color: '#6e6e70', top: 0.3 }, feet: { kind: 'boot', color: '#26262b' },
      back: { katana: {}, panda: { cloth: '#c8302c' } },
      off: { hair: { color: '#ec7a3c', bangs: 'side', slope: -0.25, front: 0, side: -44, back: -50, vol: 5, parts: [{ kind: 'bun', th: -50, ph: 60, r: 27, ring: '#d0602a' }, { kind: 'bun', th: 50, ph: 60, r: 27, ring: '#d0602a' }] },
        eyes: { style: 'anime', color: '#4a4a8c', lash: true }, mouth: 'o', blush: true }
    },
    aum: {
      skin: '#6fa8d8', hair: { color: '#4a4266', bangs: 'jag', front: 8, side: -30, back: -42, amp: 14, per: 12, vol: 8, parts: [{ kind: 'spikes', list: [[0, 70, 30, 18, 0], [-30, 62, 28, 16, -10], [30, 62, 28, 16, 10], [-62, 50, 22, 14, -14], [62, 50, 22, 14, 14], [-150, 40, 22, 18], [150, 40, 22, 18]] }, { kind: 'pony', sway: 1, tie: '#4fb34a', w: [14, 26, 30, 24, 6], up: 1.1 }] },
      horns: { color: '#e8d8b0', list: [[18, 40, 26, 8]] }, band: { color: '#26262b', plate: 3 },
      eyes: { style: 'iris', color: '#e01b1b' }, mouth: 'openFang', brows: 'angry', cheek: false,
      top: { color: '#26262b', trim: '#1e1e22', inner: '#1e1e22', tasuki: '#1e1e22', chest: '#a3252c', flameChest: '#26262b' }, obi: { color: '#2a2a2e', studs: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'short' }, arms: { guard: '#8a8d94', spikes: true }, bottom: { kind: 'pants', color: '#26262b', wrap: '#1e1e22' }, feet: { kind: 'boot', color: '#1e1e22' },
      back: KT, prop: { kind: 'kanabo', long: true },
      off: { hair: { color: '#3d3a64', bangs: 'jag', front: -4, side: -40, back: -50, amp: 14, per: 13, vol: 7, rough: 14, roughTop: 92, parts: [{ kind: 'spikes', list: [[-30, 66, 32, 18, -24], [-70, 44, 30, 18, -30], [10, 74, 26, 16, -6], [-110, 20, 26, 18, -20], [100, 30, 24, 16, 24], [80, -10, 24, 16, 20]] }] },
        band: { color: '#2b2b30', plate: 1, pw: 18, hi: 18, lo: -4 }, horns: { color: '#d8ccaa', list: [[26, 50, 26, 9, 20, 18]] },
        eyes: { style: 'anime', color: '#e01b1b', pupil: 'sparkle' }, shadowLid: '#7a4aa0', mouth: 'shark', brows: 'none' }
    },
    konga: {
      build: 'big', skin: '#8c8c90', head: { kind: 'gorilla', fur: '#3a3a3f', face: '#9a9a9e' }, ears: { kind: 'round', color: '#3a3a3f', inner: '#6a6a6e' },
      band: { color: '#7b3f9e', plate: 3 }, cheek: false,
      top: { color: '#8c8c90', collar: 'none', tasuki: '#7b3f9e', tasukiW: 8 }, obi: { color: '#2a2a2e', studs: '#b9bcc0', knot: 'none' },
      sleeves: { kind: 'none' }, arms: { color: '#3a3a3f', hand: '#8c8c90' },
      arm: { '1': { E: [46, -14, 8], H: [30, 4, 20], hand: 'thumb' }, '-1': { E: [-44, -24, 10], H: [-20, -24, 22], hand: 'fist' } },
      bottom: { kind: 'pants', color: '#2e3040' }, feet: { kind: 'bare', color: '#8c8c90' }, back: KT,
      off: { skin: '#727277', head: { kind: 'gorilla', fur: '#37373c', face: '#7a7a7f', sx: 1.04 }, band: { color: '#7b3f9e', plate: 3, hi: 24, lo: 2 },
        top: { color: '#56565c' }, arms: { color: '#37373c', hand: '#727277' }, feet: { kind: 'bare', color: '#727277' }, bottom: { color: '#2a2b36' } }
    },
    shion: {
      skin: '#f6d9bc', hair: { color: '#8a2a33', bangs: 'side', slope: 0.28, front: 4, side: -44, back: -50, vol: 6, parts: [{ kind: 'pony', sway: -1, tie: '#6b3fa8', w: [14, 24, 26, 20, 4] }] },
      eyes: { style: 'iris', color: '#dc2148' }, brows: 'angry', mouth: 'frown', cheek: '#f08a8a',
      fur: { color: '#26262b' },
      top: { color: '#34424e', trim: '#26262b', inner: '#26262b' }, obi: { color: '#de8b2e', stripe: '#26262b', cord: '#6b3fa8', knot: 'bow', knotColor: '#6b3fa8' },
      sleeves: { kind: 'short' }, claws: { color: '#5a5c63' }, bottom: { kind: 'skirt', color: '#34424e' }, legs: { color: '#3b3b40', top: 0.2 }, feet: { kind: 'boot', color: '#26262b' },
      off: { hair: { color: '#7c2a2e', bangs: 'jag', front: -2, side: -44, back: -52, amp: 11, per: 14, vol: 6, rough: 4, roughTop: 30, parts: [{ kind: 'pony', sway: -1, tie: '#6b3fa8', len: 0.95 }] }, blush: true, eyes: { style: 'anime', color: '#dc2148', sharp: true } }
    },
    seori: {
      skin: '#f8ddc3', hair: { color: '#a8c0d6', bangs: 'straight', front: 2, side: -54, back: -58, fw: 56, vol: 5, parts: [{ kind: 'long', len: 0.9 }] }, candles: {},
      eyes: { style: 'iris', color: '#d8324f', lash: true }, mouth: 'fang',
      top: { color: '#f1eee9', trim: '#26262b', inner: '#26262b' }, obi: { color: '#7e63c6', knot: 'knot' },
      sleeves: { kind: 'short', trim: '#ee8fab' }, bottom: { kind: 'shorts', color: '#26262b' }, legs: { color: '#f4f1ea' }, feet: { kind: 'sandal', color: '#f4f1ea', strap: '#7e63c6' },
      prop: { kind: 'mallet' }, companions: [{ kind: 'ghost', at: [-66, 150, 10] }],
      off: { blush: true, eyes: { style: 'anime', color: '#d8324f' }, mouth: 'openFang', marks: [{ kind: 'eyebags', color: '#7a5a7a' }] }
    },
    quon: {
      skin: '#f7dcc0', hair: { color: '#2c63d6', bangs: 'messy', front: 3, side: -40, back: -48, amp: 12, vol: 8, parts: [{ kind: 'ahoge', lean: -1 }] }, ears: { kind: 'cat', color: '#2c63d6', inner: '#f0c0c8', th: 46, ph: 44, tuft: '#ffffff' },
      eyes: { style: 'iris', color: '#e0b020', color2: '#2e8bd8' }, mouth: 'fang', marks: [{ kind: 'whiskers' }],
      scarf: { color: '#e07a22', dir: -1, len: 96 },
      top: { color: '#2e5c9e', trim: '#1e3a6a', inner: '#1e3a6a' }, obi: { color: '#efede6', knot: 'knot' },
      over: { kind: 'haori', color: '#26262b', lining: '#26262b', open: 24, hem: 40 }, sleeves: { kind: 'wide' }, pose: 'fists',
      bottom: { kind: 'skirt', color: '#2e5c9e' }, legs: { color: '#26262b', top: 0.2 }, feet: { kind: 'boot', color: '#26262b', toe: '#efede6' },
      back: KT, tail: { kind: 'cat', color: '#2c63d6', tip: '#efede6', side: -1 }, companions: [{ kind: 'wisps' }],
      off: { skin: '#f6ebe2', hair: { color: '#3a78d8', bangs: 'messy', front: -3, side: -44, back: -52, amp: 12, per: 15, vol: 6, rough: 3, roughTop: 30, parts: [{ kind: 'ahoge', lean: -1 }] }, mouth: 'openFang', marks: [{ kind: 'whiskers', color: '#2a1e1a' }], blush: true }
    },
    magoichi: {
      skin: '#f5d3b0', hair: { color: '#2c7a4a', bangs: 'jag', front: 8, side: -28, back: -40, amp: 13, per: 13, vol: 7, parts: [{ kind: 'spikes', list: [[-40, 56, 20, 14, -12], [40, 56, 20, 14, 12], [0, 68, 20, 14], [-120, 40, 18, 16], [120, 40, 18, 16], [180, 30, 18, 16]] }] },
      band: { color: '#1a1a1a', plate: 0, hi: 29, lo: 23, tails: false },
      eyepatch: { side: 1, crest: '#d8a63a' }, eyes: { style: 'sharp', color: '#7cc242' }, mouth: 'smirk', pipe: '#c9a24a', cheek: false,
      fur: { color: '#3f8c50' },
      top: { color: '#f5d3b0', collar: 'none', pattern: { kind: 'tattoo', color: '#2c5a3a', spots: [[-34, 0.22], [28, 0.28], [-8, 0.45], [40, 0.55]] } }, obi: { color: '#efede6', cord: '#efede6', knot: 'none' },
      over: { kind: 'coat', color: '#26262b', lining: '#c8302c', open: 34, stitch: '#efede6' }, sleeves: { kind: 'short', color: '#26262b' },
      bottom: { kind: 'pants', color: '#26262b' }, feet: { kind: 'boot', color: '#1e1e22', toe: '#efede6' }, prop: { kind: 'pistol' },
      off: { hair: { color: '#2f7a52', bangs: 'jag', front: 4, side: -30, back: -46, amp: 14, per: 13, vol: 7, rough: 10, roughTop: 92, parts: [{ kind: 'spikes', list: [[-20, 70, 26, 18, -20], [20, 70, 24, 18, 24], [60, 54, 24, 16, 30], [-60, 54, 22, 16, -24], [150, 40, 20, 18], [-150, 40, 20, 18]] }, { kind: 'goatee', color: '#2f7a52' }] },
        band: null, fur: null, eyes: { style: 'anime', color: '#9ac84a', sharp: true, lower: true }, skin: '#d9a77c', top: { color: '#d9a77c' } }
    },
    ibuki: {
      skin: '#f7ddc0', hair: { color: '#4b4570', bangs: 'straight', front: 4, side: -46, back: -50, fw: 56, vol: 4, parts: [{ kind: 'top', h: 1.1, w: [18, 16, 14, 5], ring: '#e0b23c' }] },
      eyes: { style: 'sharp', color: '#35c04a' }, shadowLid: '#8a5ab8', mouth: 'smirk',
      top: { color: '#26262b', trim: '#1e1e22', inner: '#1e1e22', necklace: '#e0b23c', beads: true }, obi: { color: '#1e1e22', knot: 'none' },
      over: { kind: 'haori', color: '#26262b', lining: '#6b4b9c', trim: '#c0232c', open: 24 }, sleeves: { kind: 'wide' },
      arm: { '-1': { E: [-32, -20, 12], H: [-12, -4, 24], hand: 'twofinger' } },
      bottom: { kind: 'hakama', color: '#6b4b9c' }, feet: { kind: 'sandal', color: '#26262b', sole: '#e0b23c' },
      prop: { kind: 'fuda1', hand: 1 }, companions: [{ kind: 'imp' }],
      off: { hair: { color: '#4b4878', bangs: 'part', partH: 20, partW: 34, front: -2, side: -56, back: -58, fw: 60, vol: 5, flare: 2, parts: [{ kind: 'top', h: 1.1, w: [18, 16, 14, 5], ring: '#e0b23c' }] }, brows: 'dot', browColor: '#1d1a26',
        eyes: { style: 'anime', color: '#35c04a', sharp: true, browY: 15 } }
    },
    oen: {
      build: 'small', skin: '#f7ddc2', hair: { color: '#6f9a52', bangs: 'messy', front: 4, side: -40, back: -48, amp: 11, vol: 7 }, streaks: [{ th: 12, w: 8, color: '#f4f1ea', len: 32 }],
      ears: { kind: 'cat', color: '#6f9a52', inner: '#f0c0c8', tuft: '#ffffff', th: 46, ph: 44 },
      glasses: { color: '#1d1a1c' }, eyes: { style: 'iris', color: '#e8901f' }, mouth: 'openFang',
      top: { color: '#6d9950', trim: '#26262b', inner: '#26262b', cord: '#e8901f' }, obi: { color: '#f0ede8', knot: 'bow' },
      over: { kind: 'haori', color: '#ce5a1d', lining: '#a8481a', pattern: { kind: 'flower4', color: '#f7efe0', r: 5 }, open: 26, hem: 46 }, sleeves: { kind: 'wide' }, pose: 'fists',
      bottom: { kind: 'skirt', color: '#6d9950' }, legs: { color: '#3e4247', top: 0.25, band: '#f0ede8' }, feet: { kind: 'geta', color: '#f4f1ea', sole: '#8a5a36', strap: '#4f8a3a' },
      back: { box: { color: '#7a4a26', strap: '#f1efe8' } }, tail: { kind: 'cat', color: '#6f9a52', tip: '#f4f1ea', side: 1 },
      off: { hair: { color: '#5f9a4c', bangs: 'messy', front: -2, side: -44, back: -52, amp: 10, per: 16, vol: 6, rough: 3, roughTop: 20 }, ears: { kind: 'cat', color: '#5f9a4c', inner: '#f0c0c8', tuft: '#ffffff', th: 46, ph: 44 }, blush: true }
    },
    izuna: {
      skin: '#f8dfc6', hair: { color: '#221f1e', bangs: 'part', front: 4, side: -54, back: -58, partH: 12, vol: 5, parts: [{ kind: 'long', len: 1.1 }], locks: { th: 70, w: [14, 14, 12, 4], inner: '#2f97d6', ph1: -86 } },
      ears: { kind: 'fox', color: '#221f1e', inner: '#f4f1ea', tuft: '#ffffff' },
      eyes: { style: 'iris', color: '#6d42b0', lash: true, wink: 1 }, mouth: 'open', marks: [{ kind: 'mole', side: -1 }],
      top: { color: '#f0ede8', trim: '#26262b', inner: '#26262b' }, obi: { color: '#d9a62a', knot: 'none' },
      sleeves: { kind: 'wide', trim: '#26262b' }, arm: { '-1': { E: [-32, -16, 12], H: [-16, 4, 22], hand: 'point' } },
      bottom: { kind: 'hakama', color: '#a32530', bow: '#c8302c' }, feet: { kind: 'sandal', color: '#f4f1ea', strap: '#c8302c' },
      tail: { kind: 'fox', color: '#221f1e', tip: '#f4f1ea', side: 1 },
      off: { ears: { kind: 'fox', color: '#2a2628', inner: '#c9c6c8', tuft: '#f4f1ea', th: 44 }, blush: true, eyes: { style: 'anime', color: '#7a58c8', lash: true, wink: 1 } }
    },
    sekishusai: {
      skin: '#efc9a2', hair: { color: '#2a2a2e', bangs: 'jag', front: 8, side: -26, back: -40, amp: 13, per: 12, vol: 6, parts: [{ kind: 'spikes', list: [[0, 74, 34, 16, 0], [-24, 66, 30, 14, -10], [24, 66, 30, 14, 10], [-60, 52, 22, 14, -16], [60, 52, 22, 14, 16], [-150, 40, 22, 16], [150, 40, 22, 16]] }, { kind: 'top', h: 0.95, w: [22, 16, 8, 2], ring: '#c75b18' }, { kind: 'goatee' }] },
      streaks: [{ th: 4, w: 12, color: '#e8e8e6', kind: 'bolt' }],
      eyes: { style: 'sharp', color: '#c75b18' }, brows: 'thick', mouth: 'grinFang', cheek: false,
      top: { color: '#26262b', collar: 'high', trim: '#d9d9d6' }, obi: { color: '#8e2432', knot: 'knot' },
      over: { kind: 'haori', color: '#26262b', lining: '#26262b', trim: '#d9d9d6', open: 22, hem: 44 }, sleeves: { kind: 'wide', pattern: 'flame', patternColor: '#c8302c' },
      arm: { '1': { E: [34, -26, 10], H: [30, -34, 20], hand: 'fist' } },
      bottom: { kind: 'hakama', color: '#26262b' }, feet: { kind: 'sandal', color: '#26262b', strap: '#f4f1ea' },
      back: { katana: { hip: true, side: 1, second: true } },
      off: { hair: { color: '#2e2e33', bangs: 'jag', front: 0, side: -36, back: -50, amp: 13, per: 13, vol: 6, rough: 9, roughTop: 70, parts: [{ kind: 'spikes', list: [[-40, 60, 30, 18, -30], [-80, 40, 28, 18, -26], [0, 74, 26, 16, -10], [40, 60, 22, 16, 16], [-120, 30, 22, 18]] }, { kind: 'pony', sway: -1, tie: '#c75b18', len: 0.7, up: 1.05, w: [16, 20, 18, 12, 2] }, { kind: 'goatee', color: '#3a3a3e' }] }, earsHuman: true,
        streaks: [{ th: 22, w: 12, color: '#ececea', kind: 'bolt' }], eyes: { style: 'anime', color: '#d88a28', sharp: true }, mouth: 'grinFang', brows: 'thick', browsOver: true,
        over: { kind: 'haori', color: '#26262b', lining: '#26262b', trim: '#d9d9d6', open: 22, hem: 44, pattern: { kind: 'flames', color: '#c8302c', h: 30 } } }
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

  // ---- 里での好みとセリフ（本作の創作）----
  // likes: 好きな物のタグ  home: 居場所になる置物（その置物があると住める）
  // greet: はじめての来訪  like: 好きな物を見たとき  talk: ふだんの会話  move: 住むとき  memo: 親交が深まったときの思い出（段階2・4）
  var LIFE = {
    jin: { likes: ['light', 'training'], home: 'ishidoro', note: '里の灯籠の影で、いつのまにか見張りをしている。',
      greet: '……気配を消していたのに、よく気づいたな。', like: '灯籠の影は、忍びにはちょうどいい。',
      talk: ['名乗るほどの者ではない。刃、とだけ覚えておけ。', '里が明るくなると、影もまた濃くなる。'], move: 'しばらく、この里の影を借りよう。',
      memo: ['刃が、見習いの手裏剣の持ち方を無言で直してくれた。', '夜の見回りのあと、刃が「悪くない里だ」とつぶやいた。'] },
    sakuya: { likes: ['flower', 'sweets'], home: 'sakura', note: '里いちばんの元気者。目立つ場所が大好き。',
      greet: 'やっほー！ 咲耶だよ！ 目立つもの、いっぱい置こうね！', like: '桜だー！ 咲耶の名前にぴったりでしょ？',
      talk: ['口寄せで動物を呼ぶと、里がにぎやかになるんだ〜', 'じいちゃん（岩爺）には、ないしょで修行してるの！'], move: 'ここ、咲耶の特等席に決めた！',
      memo: ['咲耶が桜の下で、呼び出した小鳥たちと歌っていた。', '咲耶が「狐白って知ってる？」と言いかけて、口をつぐんだ。'] },
    kohaku: { likes: ['shrine', 'fox'], home: 'torii', note: '変わり身の術の使い手。静かな場所を好む。',
      greet: '……風魔の者だ。怪しい者ではない。……たぶん。', like: '鳥居のそばは、静かでいい。',
      talk: ['面の下？ ……見せるほどのものじゃない。', '咲耶は元気か。……いや、なんでもない。'], move: '……この鳥居の影、借りてもいいか。',
      memo: ['狐白が、咲耶と同じ歌を小さく口ずさんでいた。', '狐白が面を少しずらして、里の夕焼けを見ていた。'] },
    shiba: { likes: ['water', 'farm'], home: 'ido', note: 'ふだんは犬の姿。畑と水まわりの見張り番。',
      greet: 'ワン！ ……おっと、しゃべれるワン。柴だワン、よろしくワン！', like: '井戸の水はつめたくて、しっぽがよろこぶワン！',
      talk: ['いつもは犬の姿だけど、いざとなったら人の姿で空手だワン！', '畑の見回りなら任せるワン。鼻がきくんだワン。'], move: 'ここがボクの見張り場だワン！',
      memo: ['柴が畑のまわりをぐるぐる回って、見回りをしてくれた。', '柴が水遁の術で、畑にこっそり水をまいていた。'] },
    kanaoni: { likes: ['craft', 'fire'], home: 'kajidai', note: '奥地に住む伝説の鍛冶師。どのクランにも属さない。',
      greet: '……鍛冶の音がしねぇ里だな。ま、見ていってやる。', like: 'いい鍛冶台だ。火の具合がわかってるじゃねぇか。',
      talk: ['刃物は、暮らしを切り開くためにある。', 'クランなんざ関係ねぇ。いい鉄が打てりゃそれでいい。'], move: 'しばらく、ここで槌をふるうとするか。',
      memo: ['金鬼が、里の鍬をていねいに研ぎ直してくれた。', '金鬼が面の奥で、小さく笑った気がした。'] },
    oto: { likes: ['flower', 'farm'], home: 'kadan', note: 'うさぎを呼ぶ口寄せの使い手。宇迦のライバル。',
      greet: '於兎だよ！ うさぎみたいにかわいくて、虎みたいに強いんだから！', like: '花壇だ！ うさぎたちがぴょんぴょんしてる！',
      talk: ['宇迦には負けないもん！ ……でも、ちょっとだけすごいと思ってる。', '巻物には、うさぎを呼ぶ術が書いてあるんだ。'], move: 'この花壇のとなり、於兎の場所ね！',
      memo: ['於兎が呼んだうさぎたちが、花壇の雑草を食べてくれた。', '於兎が「宇迦と花見をするならここかな」とつぶやいた。'] },
    rotten: { likes: ['tree', 'rock'], home: 'chikurin', note: '風魔の幹部。見た目はこわいが、日陰でのんびりするのが好き。',
      greet: 'うう〜……日差しが……まぶしい……呂屯です……', like: '竹やぶの……日陰……さいこう……',
      talk: ['毒霧……？ 今日は……出さない……安心して……', 'アトザさまには……ないしょで……昼寝……'], move: 'ここの……日陰……ぼくの……',
      memo: ['呂屯が竹やぶで、ぐっすり昼寝をしていた。', '呂屯が「ここ……こわくない……」と、うれしそうだった。'] },
    nagisa: { likes: ['books', 'water'], home: 'makimono', note: '影分身の使い手。静かに巻物を読むのが好き。',
      greet: '凪紗です。……分身と、どっちが本物か当ててみて。', like: '巻物棚……読みたいものがたくさん。',
      talk: ['影分身は、掃除にも便利なの。', '雑賀の海の話？ ……また今度、ゆっくりね。'], move: 'この棚のそば、使わせてもらうわ。',
      memo: ['凪紗の分身たちが、里の落ち葉をいっせいに掃いていた。', '凪紗が、巻物に里の地図を書き写していた。'] },
    anne: { likes: ['sweets', 'tea'], home: 'dangoya', note: 'お調子者でお団子が大好き。紫苑になつかれている。',
      greet: '餡音だよ〜！ お団子の匂いがする里って、ここ？', like: '団子屋台！ 三色団子、ひとつちょうだい！',
      talk: ['団子の串で影縫い！ ……は、食べ終わってからね。', '紫苑がね、最近ちょっと笑うようになったんだ〜'], move: '屋台の近くに住めば、毎日お団子だね！',
      memo: ['餡音が、みんなに三色団子を配っていた。', '餡音と紫苑が、団子を半分こしていた。'] },
    dan: { likes: ['training', 'craft'], home: 'mato', note: '風魔の幹部。からくりの体をもつ忍。',
      greet: 'ピピッ。断、到着。里ノ様子ヲ、確認スル。', like: '的ヲ確認。修行効率、上昇。ピピッ。',
      talk: ['閃光刀ハ、今日ハ省エネもーど。', 'アトザ様ノ命令ハ……「里デ休メ」。了解。'], move: '拠点ヲ、ココニ設定スル。ピピッ。',
      memo: ['断が、的の位置をきっちり直していた。', '断の赤い目が、夕焼けを見て少し明るくなった。'] },
    hinanojoh: { likes: ['fire', 'farm'], home: 'takibi', note: 'ひよこの姿をした忍。火の番が得意。',
      greet: 'ピヨッ！ 雛之丞でござる！ 火のあつかいなら任されよ！', like: '焚き火でござる！ あったかいピヨ〜',
      talk: ['焙烙玉は、花火にもなるでござる。', 'この羽は小さいが、心は大きいでござるピヨ！'], move: '拙者、焚き火番を仰せつかるでござる！',
      memo: ['雛之丞が焚き火で、みんなの焼きいもを焼いてくれた。', '雛之丞が夜空に小さな花火を上げてくれた。'] },
    torika: { likes: ['flower'], home: 'kadan', note: '花を育てるのが大好き。声が大きい。',
      greet: '酉花だよっ！ 花、ちゃんと育ててる？ 育ててないなら今から！', like: '花壇きたー！ ほら、この花、今日いちばん元気！',
      talk: ['毒手裏剣？ 花には使わないってば！', '水やりは朝がいちばんなんだからね！'], move: 'この花壇、あたしが毎日見るから！',
      memo: ['酉花が、花壇に新しい種をまいてくれた。', '酉花が「花が咲いたらみんなで見よう」と大声で言った。'] },
    atoza: { likes: ['rest', 'tea'], home: 'endai', note: '風魔の首領級。こわそうに見えて、実は人情派。',
      greet: '……アトザだ。部下どもが世話になってるらしいな。', like: '縁台か。……少し座らせてもらう。',
      talk: ['風魔がこわい？ ……まあ、そう言われ慣れてる。', 'アウンが迷惑かけてないか。あいつは弟でな。'], move: '……ここの縁台、たまに使わせろ。',
      memo: ['アトザが、迷子のひよこを雛之丞のところまで運んでいた。', 'アトザが縁台で、呂屯と断と三人でお茶を飲んでいた。'] },
    hayate: { likes: ['tree', 'training'], home: 'matsu', note: '伊賀の師匠的存在。鷹のナルカミと里を見守る。',
      greet: 'ハヤテだ。こっちは相棒の鷹、ナルカミ。', like: 'いい松だ。ナルカミが止まりたがっている。',
      talk: ['鷹の目の術は、遠くの小さな変化を見逃さない。', '見習い、姿勢がいい。修行は続けているか。'], move: 'この松を、ナルカミの止まり木にさせてくれ。',
      memo: ['ナルカミが、里の上をぐるりと飛んで見回ってくれた。', 'ハヤテが見習いに、遠くを見るコツを教えてくれた。'] },
    uka: { likes: ['fox', 'shrine'], home: 'kitsune', note: '狐を使う巫女の忍。於兎のライバル。',
      greet: '宇迦です♪ 狐たちがね、この里は居心地がいいって。', like: '狐の像！ お稲荷さまも見てくれてるね。',
      talk: ['於兎とは……ライバル！ でも、たまに一緒にお茶する。', '九尾の焔はね、あったかいけど熱くないの。'], move: '狐の像のそばに、住んでもいい？',
      memo: ['宇迦の狐たちが、里の実りを祈って踊っていた。', '宇迦が姉のイズナの話を、うれしそうにしてくれた。'] },
    ganzi: { likes: ['tea', 'rock'], home: 'chaya', note: '甲賀の長老。見習いに里づくりを教える。',
      greet: 'ほっほ、来たか見習い。わしは岩爺。今日からおぬしが、この里の里守じゃ。', like: '茶屋はええのう。人が集まる場所は、里の心臓じゃ。',
      talk: ['里は、急いで大きくするもんじゃない。住む者の居場所をひとつずつ、じゃ。', '咲耶と結は、わしの孫でな。どっちも言うことを聞かんわい。'], move: 'わしはずっとここにおる。困ったら声をかけい。',
      memo: ['岩爺が、昔この里がにぎやかだった頃の話をしてくれた。', '岩爺が「おぬしに任せてよかった」と、目を細めた。'] },
    yui: { likes: ['books', 'flower'], home: 'makimono', note: '後方支援が得意。遠くから術をかける。',
      greet: '結です。……遠くからの支援なら、得意です。', like: '巻物棚……術の研究がはかどります。',
      talk: ['桜吹雪の術は、見た目もきれいなんですよ。', '母さん（令）は、里を守るのが仕事なんです。'], move: 'ここで、術の巻物を整理させてください。',
      memo: ['結が、里のまわりに桜吹雪の結界を張ってくれた。', '結と令が、並んで巻物を読んでいた。'] },
    fuuta: { likes: ['sound', 'rest'], home: 'furin', note: 'のんびり屋のお調子者。やるときはやる。',
      greet: 'おう、風太だ。いい風が吹く里だなぁ。ひと休みしていいか？', like: '風鈴の音……こりゃあ昼寝にぴったりだ。',
      talk: ['戦い？ いやいや、風遁で逃げるのがいちばんよ。', 'でもな、やるときは、やる男だぜ。'], move: '風鈴の下が、おれの昼寝場所ってことで。',
      memo: ['風太が風遁で、洗濯物をあっという間に乾かしてくれた。', '風太がめずらしく真剣な顔で、里の見回りをしていた。'] },
    rei: { likes: ['light', 'shrine'], home: 'ishidoro', note: '里を守る凛とした忍。結の母。',
      greet: '令と申します。この里の守りを、少し見せていただきます。', like: '石灯籠……夜の守りに欠かせませんね。',
      talk: ['守る場所があるのは、幸せなことです。', '結は迷惑をかけていませんか。'], move: '灯籠のそばで、夜の守りにつきましょう。',
      memo: ['令が、里の見回りの道順を教えてくれた。', '令が紫苑の髪を、そっと結い直していた。'] },
    sattva: { likes: ['water', 'flower'], home: 'koike', note: '天界の者。かつて忍だったとも言われる。',
      greet: '……静かな里ですね。心がやわらぎます。', like: '池に映る空……ここは、とても穏やかです。',
      talk: ['天界からは、この里の灯りがよく見えるのですよ。', '急がなくていいのです。ひとつずつ、ていねいに。'], move: 'しばし、この池のほとりに留まりましょう。',
      memo: ['サットヴァが池のほとりで、静かに祈っていた。', 'サットヴァのまわりに、やわらかな光が集まっていた。'] },
    nekomata: { likes: ['fish', 'rest'], home: 'himono', note: 'とにかく魚が好き。',
      greet: '猫又だにゃ。……魚の匂いがしたから来たにゃ。', like: '干物台だにゃ！ ここは天国だにゃ〜',
      talk: ['影分身の術で、魚を三倍食べる作戦にゃ。', '久遠のじいさんとは、同じ里の出身だにゃ。'], move: '干物台の番は、猫又に任せるにゃ。',
      memo: ['猫又が、干物をつまみ食いして令に叱られていた。', '猫又が縁台で、しっぽをゆらして眠っていた。'] },
    janome: { likes: ['rock', 'tree'], home: 'niwaishi', note: '白蛇オロチを連れた元気な少年。',
      greet: '蛇ノ目だ！ こいつは白蛇のオロチ。かまないから安心しな！', like: 'いい庭石！ オロチが日なたぼっこしたがってる！',
      talk: ['口寄せで大蛇を呼んだら、里がびっくりするかな？', 'オロチは甘いものが好きなんだぜ。'], move: 'この石、オロチのお気に入りにしていい？',
      memo: ['オロチが庭石の上で、気持ちよさそうに丸くなっていた。', '蛇ノ目が、オロチのうろこを自慢してくれた。'] },
    benten: { likes: ['sound', 'water'], home: 'shishiodoshi', note: '雑賀の里を預かる芸達者。',
      greet: '弁天どす。雑賀の里を預かっとります。三味線、ひとついかがどす？', like: '鹿威しの音……よう響いて、ええ調べどす。',
      talk: ['祝詞は、みんなの無事を願う歌なんどす。', '孫市はんは、また海の向こうどすえ。'], move: 'ここで、ときどき三味線を弾かせておくれやす。',
      memo: ['弁天の三味線に合わせて、里のみんなが手拍子をした。', '弁天が、里の新しい祭りの歌をつくってくれた。'] },
    karma: { likes: ['training', 'rock'], home: 'mato', note: '赤い目で瞳術をかける。負けずぎらい。',
      greet: 'カルマだ。……その目、ちょっと見せてみな。', like: '的か。腕がなるぜ。',
      talk: ['瞳術？ 今日は使わない。……たぶんな。', 'オレに勝てたら、ひとつ言うこと聞いてやるよ。'], move: 'ここでオレの修行につきあえ。',
      memo: ['カルマが、見習いの的当てをこっそり手伝ってくれた。', 'カルマが「悪くない腕だ」と、そっぽを向いて言った。'] },
    ichiya: { likes: ['paint', 'books'], home: 'emakake', note: '伝令のスペシャリスト。ネムの弟。',
      greet: '……イチヤ。伝令だよ。里の噂を運んできた。', like: '絵馬掛け……願いごと、空まで届けてあげようか。',
      talk: ['虹色の文字は、空を飛んで届くんだ。', '姉さん（ネム）が、また何か描いてた……'], move: 'ここを、伝令の中継所にする。',
      memo: ['イチヤが、里の知らせを虹色の文字で空に描いてくれた。', 'イチヤがネムの落書きを、そっと消していた。'] },
    nemu: { likes: ['paint', 'flower'], home: 'emakake', note: '自由奔放な絵描き。相棒はピヨチとウサピ。',
      greet: 'ネムだよ〜！ ピヨチとウサピもいっしょ！ 里にお絵かきしていい？', like: '絵馬掛けだ！ ぜんぶの絵馬に絵を描いちゃお〜',
      talk: ['描いた絵に命がふきこまれるの！ たまに逃げちゃうけど。', 'イチヤはまじめすぎるんだよね〜'], move: 'ここ、ネムのアトリエにするね！',
      memo: ['ネムが描いた蝶が、本当に里を飛びまわった。', 'ネムが、みんなの似顔絵を描いてくれた。'] },
    karura: { likes: ['tree', 'shrine'], home: 'matsu', note: '伊賀の山奥で、ひっそりと里を守る。',
      greet: '……カルラ。伊賀の山から、様子を見に来ただけ。', like: 'この松、高くて……見晴らしがいい。',
      talk: ['雷遁は、空から落とすもの。', '人の多いところは……少し、苦手。'], move: '……この松の上なら、住んでもいい。',
      memo: ['カルラが松の上から、里の見張りをしてくれた。', 'カルラが翼で、みんなの日よけになってくれた。'] },
    xiaolan: { likes: ['tree', 'training'], home: 'chikurin', note: 'パンダのリーリーを口寄せする。',
      greet: 'シャオランだよ！ こっちはパンダのリーリー！ 大きくもなれるんだ！', like: '竹やぶ！ リーリー、ごはんだよ〜！',
      talk: ['太極拳は、ゆっくり動くのがコツなんだ。', 'リーリーは、笹があればごきげんなの！'], move: '竹やぶのそば、リーリーと住んでいい？',
      memo: ['リーリーが竹やぶで、笹をおいしそうに食べていた。', 'シャオランが、朝の太極拳にみんなを誘ってくれた。'] },
    aum: { likes: ['rock', 'training'], home: 'niwaishi', note: 'アトザの弟。大きくなれる力持ち。',
      greet: 'アウンだ！ 兄貴はどこだ？ ……あ、ここはいい里だな！', like: 'でっかい石！ 持ち上げて修行するぞ！',
      talk: ['巨人の一撃！ ……は、里ではひかえる。', '兄貴はこわく見えるけど、やさしいんだぜ。'], move: 'この石のそばで、力仕事は任せろ！',
      memo: ['アウンが大きな石を、軽々と運んでくれた。', 'アウンとアトザが、並んで夕日を見ていた。'] },
    konga: { likes: ['training'], home: 'shugyoba', note: '甲賀のくのいちを鍛えるコーチ。',
      greet: 'ウホッ、コンガだ！ 修行の相手、いるか？', like: '修行場！ いい汗かけそうだ！',
      talk: ['甲賀のくのいちたちの先生をしてるんだ。', '影分身で、ひとりで組手もできるぞ！'], move: '修行場の番人、引き受けた！',
      memo: ['コンガが、見習いの修行に最後までつきあってくれた。', 'コンガが親指を立てて「よくやった！」と言った。'] },
    shion: { likes: ['flower', 'sweets'], home: 'sakura', note: '人見知り。餡音にだけはなついている。',
      greet: '……紫苑。……べつに、来たくて来たわけじゃない。', like: '……桜。きれい……とか、思ってないし。',
      talk: ['餡音、見なかった？ ……べつに、探してない。', '令さんには、感謝してる。……言わないけど。'], move: '……ここ、いてあげてもいい。',
      memo: ['紫苑が、桜の花びらをそっと拾っていた。', '紫苑が小さな声で「ありがとう」と言った。'] },
    seori: { likes: ['water', 'light'], home: 'koike', note: '瀬織津姫が名の由来。相棒はミタマ。',
      greet: '瀬織だよ〜。こっちは相棒のミタマ。こわくないよ、ふふ。', like: '池だ〜。水の音、落ちつくね。',
      talk: ['丑の刻参り？ 今は昼だから、お休み中〜', 'ミタマはね、夜になると光るんだよ。'], move: '池のほとりに、ミタマと住んでいい？',
      memo: ['ミタマが夜の池で、ほんのり光っていた。', '瀬織が、池の水をきれいにする祝詞を唱えた。'] },
    quon: { likes: ['lucky', 'light'], home: 'manekineko', note: '年齢不詳。神出鬼没。一人称は「わし」。',
      greet: 'ほう、ここが噂の里か。わしは久遠。……会うのは、はじめてじゃったかの？', like: '招き猫か。よい未来を招く顔をしておる。',
      talk: ['わしは「幸福な未来」を選ぶ。ここは、よい方の未来じゃ。', '猫又よりは年上じゃよ。いくつかは、ないしょじゃ。'], move: 'この里の未来、しばらく見守らせてもらおう。',
      memo: ['久遠が「明日は晴れる」と言い、本当に晴れた。', '久遠の鬼火が、夜道をやさしく照らしていた。'] },
    magoichi: { likes: ['water', 'fire'], home: 'kobashi', note: '雑賀の首領。いまは海賊のように海を渡る。',
      greet: 'よう。孫市だ。海の帰りに寄っただけさ。', like: '橋か。水の上に立つと、海を思い出す。',
      talk: ['一発必中。狙ったものは外さねぇ。', '雑賀の里は弁天に任せてる。頼りになるやつさ。'], move: 'この橋のそば、たまの宿にさせてもらうぜ。',
      memo: ['孫市が、海の向こうの珍しい話を聞かせてくれた。', '孫市が弁天に、おみやげを渡していた。'] },
    ibuki: { likes: ['shrine', 'books'], home: 'torii', note: '陰陽師風の忍。相棒の式神ヤーマ。',
      greet: 'イブキです。こっちは式神のヤーマ。……小さいけど、閻魔さまなんですよ。', like: '鳥居……結界を張るのにちょうどいい。',
      talk: ['ヤーマがかわいい姿なのは、ぼくがまだ未熟だから。', '式神の紙は、いつも多めに持ってます。'], move: '鳥居のそばに、小さな結界をつくらせてください。',
      memo: ['ヤーマが、里のみんなと鬼ごっこをしていた。', 'イブキが、里の無事を願うお札を配ってくれた。'] },
    oen: { likes: ['farm', 'tea'], home: 'hatake', note: '雑賀出身。甲賀で修行中の薬売り。',
      greet: 'おえんです！ 旅の薬売り……の修行中です。薬草、ありますか？', like: '畑！ いい薬草が育ちそう〜',
      talk: ['背中の箱には、薬と道具がいっぱいなんです。', '実家は雑賀なんです。いまは甲賀で修行中！'], move: '畑のそばに、薬の調合所をつくってもいいですか？',
      memo: ['おえんが、薬草で元気の出るお茶をいれてくれた。', 'おえんが、里のみんなの健康を見てまわっていた。'] },
    izuna: { likes: ['fox', 'shrine'], home: 'kitsune', note: '宇迦の姉。明るい狐の巫女。',
      greet: 'イズナです☆ 妹の宇迦がお世話になってます♪', like: '狐の像、かわいい！ 飯綱さまも喜んでるよ。',
      talk: ['飯綱の法で、ちょっとした占いができるの。', '宇迦は、しっかりしてるように見えて甘えんぼなの。'], move: '狐の像のとなり、予約しちゃおっと♪',
      memo: ['イズナが、里の明日の天気を占ってくれた。', 'イズナと宇迦が、狐たちとお昼寝していた。'] },
    sekishusai: { likes: ['training', 'rock'], home: 'shugyoba', note: '剣の達人。無刀取りの使い手。',
      greet: '石舟斎だ！ 剣の道も、里づくりも、基本が大事だ！', like: '修行場か！ いい踏み込みができそうだ！',
      talk: ['無刀取り。刀を持たずに、争いを止める術よ。', '大典太は名刀だが、抜かずにすむのがいちばんだ。'], move: '修行場の師範、引き受けよう！',
      memo: ['石舟斎が、見習いに正しい構えを教えてくれた。', '石舟斎が「里を守るのに刀はいらん」と笑った。'] },
    sasagane: { likes: ['light', 'flower'], home: 'chochin', note: '根の国から来た、謎めいた花魁。',
      greet: 'ふふ……ササガネと申します。根の国から、灯りに誘われて。', like: '提灯の灯り……ほんに、きれいやわぁ。',
      talk: ['根の国のこと？ ……いずれ、お話ししましょ。', '糸をたぐれば、縁もつながるもの。'], move: 'この灯りのそばで、しばし夜を過ごさせてくださいな。',
      memo: ['ササガネが、提灯に糸の飾りをつけていた。', 'ササガネが「この里は、あたたかいわね」とほほえんだ。'] }
  };

  // ---- まとめる ----
  var CHARS = ROSTER.map(function (r) {
    var o = {}, k;
    for (k in r) o[k] = r[k];
    o.art = ART[r.id];
    var l = LIFE[r.id] || {};
    for (k in l) o[k] = l[k];
    return o;
  });
  var BY_ID = {};
  CHARS.forEach(function (c) { BY_ID[c.id] = c; });

  // 見習い（プレイヤー）の見た目：服と色の3セット＋髪型
  var APPRENTICE_SETS = [
    { id: 'ai', name: '藍の装束', top: '#2f4a7a', trim: '#1c2c4c', band: '#c8302c', obi: '#d8b04a', hair: '#2a2226' },
    { id: 'wakakusa', name: '若草の装束', top: '#5a8a3a', trim: '#2f4a22', band: '#e0b23c', obi: '#8a5a36', hair: '#5a3a26' },
    { id: 'kurenai', name: '紅の装束', top: '#b8413a', trim: '#6a1e1a', band: '#2f4a7a', obi: '#f0e6d2', hair: '#1e1e22' }
  ];
  var APPRENTICE_HAIR = [
    { id: 'short', name: 'みじかい髪', hair: { bangs: 'jag', front: 8, side: -28, back: -42, amp: 10, per: 15, vol: 6 } },
    { id: 'pony', name: 'ポニーテール', hair: { bangs: 'straight', front: 3, side: -44, back: -50, vol: 5, parts: [{ kind: 'pony', sway: -1 }] } },
    { id: 'bob', name: 'おかっぱ', hair: { bangs: 'straight', front: 2, side: -54, back: -56, fw: 56, vol: 5 } }
  ];
  function apprenticeArt(setId, hairId, outfit) {
    var st = APPRENTICE_SETS.filter(function (s) { return s.id === setId; })[0] || APPRENTICE_SETS[0];
    var hs = APPRENTICE_HAIR.filter(function (h) { return h.id === hairId; })[0] || APPRENTICE_HAIR[0];
    var of = outfit || {};
    var hair = JSON.parse(JSON.stringify(hs.hair));
    hair.color = of.hair || st.hair;
    if (hair.parts) hair.parts.forEach(function (p) { if (p.kind === 'pony') p.tie = of.band || st.band; });
    return {
      skin: '#f7dcc2', hair: hair,
      eyes: { style: 'iris', color: '#3a2a22', lash: hairId !== 'short' }, mouth: 'smile',
      band: { color: of.band || st.band, plate: 0 },
      top: { color: of.top || st.top, trim: of.trim || st.trim, inner: of.trim || st.trim, tasuki: '#2a2226', pattern: of.pattern || null },
      obi: { color: of.obi || st.obi, knot: 'bow' },
      sleeves: { kind: 'short' }, arms: { guard: '#3a3a40' },
      bottom: { kind: 'pants', color: of.top || st.top, wrap: '#3a3a40' }, feet: { kind: 'sandal', color: '#2a2226' },
      back: of.katana === false ? {} : { katana: {} },
      off: { band: { hi: 17, lo: -3 }, blush: true, earsHuman: hs.id === 'short' } // 公式に忠実な絵柄（約2.7頭身）では、鉢巻を細めに。短い髪なら耳を見せる
    };
  }

  var api = { CHARS: CHARS, BY_ID: BY_ID, ART: ART, APPRENTICE_SETS: APPRENTICE_SETS, APPRENTICE_HAIR: APPRENTICE_HAIR, apprenticeArt: apprenticeArt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NSL_CHARS = api;
})(typeof window !== 'undefined' ? window : globalThis);
