/* ニンジャ夜明け隊（RPG） — 物語と加入のイベント
 * 命令は script.js：say（話す。'hero'=主人公 / 仲間のid / 'e:妖怪id' / 'npc:名前' / null=語り）・ask（えらぶ）・if/go（分かれ道）・set（旗）・
 * join（仲間になる）・give/take/gold・battle・frag（暁のかけら）・title（章の見出し）・npc（人を動かす）など。
 * セリフと物語はゲームの創作で、公式の設定ではない（夜鴉・影法師もゲームの創作の妖怪）。
 */
(function (root) {
  'use strict';
  var EV = {};

  // ======================= 序章：甲賀の里 =======================
  EV.op_start = [
    { set: 'op_started' },
    { title: '序章　明けない夜', sub: '夜が明けなくなって、3日がたった' },
    { say: 'ganzi', t: 'おお、来たか見習い。……空を見てみい。もう3日も、夜が明けんのじゃ。' },
    { say: 'ganzi', t: '天の社にある「暁の鐘」が、黒い大鴉に割られたらしい。鐘のかけらは5つ、ばらばらに散ってしもうた。' },
    { say: 'ganzi', t: '鐘が鳴らねば、朝は来ん。夜が続けば、妖怪どもは元気になる一方じゃ。' },
    { say: 'ganzi', t: '見習いよ。かけらを取り戻す旅に、出てくれんか。' },
    { set: 'op_talked' },
    { npc: 'sakuya', move: [[13, 8], [14, 8], [14, 7]] },
    { say: 'sakuya', t: 'じいちゃん！ 咲耶も行く！ 口寄せの小鳥たちも、朝が来なくて元気がないんだもん！' },
    { say: 'ganzi', t: '咲耶……。ふむ、ふたりなら心強い。' },
    { join: 'sakuya' },
    { sfx: 'warn' }, { shake: 0.4 },
    { say: null, t: 'そのとき、社の裏で物音がした！' },
    { say: 'sakuya', t: '妖怪だ！ いくよ、{name}！' },
    { battle: ['koro_s', 'koro_s'], tut: 1, bbg: 'village' },
    { say: 'sakuya', t: 'やったね！ 弱点で当てると構えがくずれて、「崩し」になるんだよ。' },
    { say: 'ganzi', t: 'まずは狐火の森へ行くがよい。光るものが落ちるのを見た者がおる。' },
    { say: 'ganzi', t: '里の南から出れば、旅の地図が開ける。店で傷薬もそろえておくのじゃぞ。' },
    { set: 'op_done' }, { save: 1 }
  ];
  EV.op_sakuya = [{ say: 'sakuya', t: 'いっしょに行こう！' }];
  EV.koka_nogo = [{ say: null, t: '岩爺の話を聞こう。' }, { walk: [[14, 18]] }];
  EV.koka_ganzi = [
    { if: 'ch4_clear', go: 'join' },
    { if: 'ch3_clear', go: 'c4' }, { if: 'ch2_clear', go: 'c3' }, { if: 'ch1_clear', go: 'c2' },
    { say: 'ganzi', t: '狐火の森の奥、稲荷の洞に光が落ちたそうじゃ。森の大岩は、力持ちでもないと動かせんぞ。' }, { end: 1 },
    { lbl: 'c2' }, { say: 'ganzi', t: '次は伊賀じゃ。霧の山道の奥に、ふたつめのかけらがあるらしい。' }, { end: 1 },
    { lbl: 'c3' }, { say: 'ganzi', t: '雑賀の港で、海坊主が暴れておるそうな。弁天どのを訪ねるがよい。' }, { end: 1 },
    { lbl: 'c4' }, { say: 'ganzi', t: '孫市の船なら、風魔の黒嶺へ渡れよう。風魔の者も、話せば分かる。' }, { end: 1 },
    { lbl: 'join' },
    { say: 'ganzi', t: '4つめのかけらも取り戻したか。……見習い、よう育ったのう。' },
    { say: 'ganzi', t: '最後の戦いじゃ。わしも行こう。年寄りの幻術も、たまには役に立つじゃろう。' },
    { join: 'ganzi' }
  ];

  // ---- 於兎と宇迦（ライバル）----
  EV.oto_talk = [
    { if: 'oto_asked', go: 'again' },
    { say: 'oto', t: '於兎だよ！ うさぎみたいにかわいくて、虎みたいに強いんだから！' },
    { say: 'oto', t: '狐火の森に、宇迦っていう狐使いがいるの。ライバルなんだ。どっちが強いか、決着をつけたいの！' },
    { say: 'oto', t: 'あなたたちも森へ行くの？ じゃあ、宇迦のところで待ち合わせね！' },
    { set: 'oto_asked' }, { end: 1 },
    { lbl: 'again' }, { say: 'oto', t: '宇迦は狐火の森の、稲荷の祠にいるよ！ 先に行って待ってて！' }
  ];
  EV.uka_talk = [
    { say: 'uka', t: '宇迦です♪ 狐たちがね、夜が明けなくて困ってるの。' },
    { if: '!oto_asked', go: 'nooto' },
    { say: 'oto', t: 'みつけた、宇迦！ 今日こそ勝負だよ！' },
    { say: 'uka', t: '於兎？ ……いいよ。でも、ふたりで戦っても決着がつかないから……' },
    { say: 'uka', t: 'この人たちと勝負して、どっちが活躍できるかで決めよう♪' },
    { say: 'sakuya', t: 'えっ、咲耶たちと!?' },
    { battle: ['d_oto', 'd_uka'], bbg: 'forest' },
    { say: 'oto', t: 'つ、強い……！ 宇迦、今日は引き分けってことにしてあげる。' },
    { say: 'uka', t: 'ふふ、引き分けね。ねえ、わたしたちも旅についていっていい？ 決着は、旅のあいだにつけるから♪' },
    { join: 'oto' }, { join: 'uka' }, { end: 1 },
    { lbl: 'nooto' },
    { say: 'uka', t: '甲賀の里に、於兎っていう子がいるでしょ？ あの子、わたしのライバルなの。' },
    { say: 'uka', t: 'あの子が来たら、いっしょに勝負してあげる♪' }
  ];
  EV.izuna_talk = [
    { if: 'has:uka', go: 'ok' },
    { say: 'izuna', t: 'イズナです☆ 妹の宇迦を見なかった？ あの子が旅に出るなら、わたしもついていこうかな♪' }, { end: 1 },
    { lbl: 'ok' },
    { say: 'izuna', t: '宇迦がお世話になってます♪ 飯綱の法で、ちょっとした占いもできるよ。' },
    { say: 'izuna', t: '占いの結果は……「いっしょに行くと吉」☆ よろしくね！' },
    { join: 'izuna' }
  ];
  // ---- ネム（絵をさがす）----
  EV.nemu_talk = [
    { if: 'item:nemu_e1&item:nemu_e2&item:nemu_e3', go: 'done' },
    { if: 'nemu_asked', go: 'again' },
    { say: 'nemu', t: 'ネムだよ〜！ 聞いて聞いて、描いた絵に命がふきこまれて、森へ逃げちゃったの。' },
    { say: 'nemu', t: '小鳥と、兎と、ひよこの3枚！ 狐火の森で見つけたら、つれてきて〜' },
    { set: 'nemu_asked' }, { end: 1 },
    { lbl: 'again' }, { say: 'nemu', t: '絵は3枚だよ〜。森のすみっこが好きな子たちなの。' }, { end: 1 },
    { lbl: 'done' },
    { take: 'nemu_e1' }, { take: 'nemu_e2' }, { take: 'nemu_e3' },
    { say: 'nemu', t: 'みんな帰ってきた〜！ ありがとう！ お礼に、ネムも旅についていって、旅の絵を描くね！' },
    { join: 'nemu' }
  ];
  // ---- コンガ（組手）----
  EV.konga_talk = [
    { say: 'konga', t: 'ウホッ、コンガだ！ 甲賀のくのいちたちの先生をしてる。' },
    { ask: '組手の相手をしてくれるか？', who: 'konga', opts: ['組手をする', 'またこんど'], go: ['fight', 'no'] },
    { lbl: 'fight' },
    { battle: ['d_konga'], bbg: 'village', lose: 'continue', loseGo: 'lost' },
    { say: 'konga', t: 'ウホホ！ いい組手だった！ 決めた、オレもお前たちの旅を手伝うぞ！' },
    { join: 'konga' }, { end: 1 },
    { lbl: 'lost' }, { say: 'konga', t: 'まだまだだな！ レベルを上げて、また来い！' }, { end: 1 },
    { lbl: 'no' }, { say: 'konga', t: 'いつでも来い！ 修行場はここだ。' }
  ];

  // ======================= 第1章：狐火の森 =======================
  EV.forest_enter = [
    { set: 'forest_entered' },
    { title: '第1章　狐火の森', sub: '甲賀の森の奥へ' },
    { say: 'sakuya', t: '妖怪がうろうろしてる……。ぶつかると戦いになるよ。こっちから「調べる」で斬りかかれば、先制できるんだって！' }
  ];
  EV.oen_rescue = [
    { say: 'npc:？？？', t: 'きゃあっ！ だ、だれか〜！' },
    { say: 'oen', t: '薬草をつんでいたら、狸たちが……！' },
    { battle: ['kotanuki', 'kotanuki', 'koro'], bbg: 'forest' },
    { say: 'oen', t: 'た、助かりました〜！ おえんです！ 旅の薬売り……の修行中です。' },
    { say: 'oen', t: '夜が明けないと、薬草も育たなくて……。わたしも旅に連れていってください！ ケガの手当てなら、まかせて！' },
    { join: 'oen' },
    { say: 'oen', t: 'そういえば、北の洞の前で、パンダを連れた子が困ってましたよ。' }
  ];
  EV.oen_talk = EV.oen_rescue;
  // ---- シャオランと大岩 ----
  EV.xl_talk = [
    { if: 'item:sasa', go: 'eat' },
    { if: 'xl_asked', go: 'again' },
    { say: 'xiaolan', t: 'シャオランだよ！ こっちはパンダのリーリー。大きくもなれるんだ！' },
    { say: 'xiaolan', t: 'この大岩をどかしたいんだけど、リーリーがおなかすいて動かないの……。' },
    { say: 'xiaolan', t: '西の竹林に、おいしい笹があるはずなんだ。とってきてくれる？' },
    { set: 'xl_asked' }, { end: 1 },
    { lbl: 'again' }, { say: 'xiaolan', t: '笹は、西の竹林の奥だよ！' }, { end: 1 },
    { lbl: 'eat' },
    { take: 'sasa' },
    { say: 'xiaolan', t: 'わあ、笹だ！ リーリー、ごはんだよ〜！' },
    { say: null, t: 'リーリーは笹をおいしそうに食べると、むくりと立ち上がった。' },
    { sfx: 'stone' }, { shake: 0.5 },
    { clear: 'kitsunebi:boulder1' }, { clear: 'kitsunebi:boulder2' }, { set: 'ch1_boulder' },
    { say: 'xiaolan', t: 'すごいでしょ！ リーリー、大岩を押せるんだ。ねえ、わたしたちも連れてって！' },
    { join: 'xiaolan' },
    { msg: '探索の術「リーリー」が使えるようになった！ 大岩の前で「調べる」と、むこう側へ押して動かせる。' }
  ];
  EV.boss_ponpoko = [
    { say: null, t: '洞の奥に、大きな狸がどっかり座っている。そばで光っているのは……暁のかけら！' },
    { say: 'e:ponpoko', t: 'ぽんぽこ！ この光る石は、わしの宝じゃ。わたさんぞ！' },
    { say: 'sakuya', t: 'それは暁の鐘のかけらなの！ 返して！' },
    { battle: ['ponpoko'], boss: 1, bbg: 'cave', bgm: 'boss' },
    { say: 'e:ponpoko', t: 'ぽ、ぽんぽこ……まいった。夜が明けんと、わしらも眠れんでのう……' },
    { npc: 'boss', hide: 1 },
    { frag: 1 },
    { say: 'sakuya', t: 'かけらが光ってる……！ 見て、空がちょっとだけ明るくなったよ！' },
    { set: 'ch1_clear' },
    { msg: '旅の地図に「伊賀の里」と「霧の山道」がふえた。' },
    { save: 1 }
  ];

  // ======================= 第2章：伊賀・霧の山 =======================
  EV.iga_enter = [
    { set: 'iga_entered' },
    { title: '第2章　霧の山', sub: '伊賀の里' },
    { say: 'sakuya', t: 'ここが伊賀の里……。なんだか、みんな元気がないね。' },
    { say: 'npc:伊賀の人', t: '霧の山道に妖怪が出るようになって、令さまの娘の結さまが、ひとりで退治に行ってしまったんだ……' }
  ];
  EV.rei_talk = [
    { if: 'has:yui', go: 'join' },
    { say: 'rei', t: '令と申します。娘の結が、霧の山へ行ったきり戻らないのです。' },
    { say: 'rei', t: '霧の山道には、見えない道があります。鷹匠のハヤテどのなら、鷹の目で見つけられるはず。' },
    { set: 'rei_asked' }, { end: 1 },
    { lbl: 'join' },
    { say: 'rei', t: '結を助けてくださったのですね。……ありがとうございます。' },
    { say: 'yui', t: '母さん、わたし、この人たちと夜明けを取り戻しに行くの。' },
    { say: 'rei', t: '……ならば、わたしも力を貸しましょう。守る場所があるのは、幸せなことですから。' },
    { join: 'rei' }
  ];
  EV.hayate_talk = [
    { say: 'hayate', t: 'ハヤテだ。こっちは相棒の鷹、ナルカミ。' },
    { say: 'hayate', t: '霧の山には見えない道がある。結どのを探しているのだろう？ ナルカミ、見せてやれ。' },
    { say: null, t: 'ナルカミが高く舞い上がり、岩肌の一か所をするどく鳴いて知らせた。' },
    { join: 'hayate' },
    { msg: '探索の術「鷹の目」が使えるようになった！ きらきら光る場所で「調べる」と、隠し道や隠し宝が見つかる。' }
  ];
  EV.yui_rescue = [
    { say: 'yui', t: 'はあっ……！ 子蜘蛛が、こんなに……！' },
    { say: 'sakuya', t: 'あの子が結さんだよ！ 助けよう！' },
    { battle: ['kogumo', 'kogumo', 'kiriwarashi'], bbg: 'mountain' },
    { say: 'yui', t: 'ありがとうございます……。結です。遠くからの術なら、得意なのですが……' },
    { say: 'yui', t: 'この奥の岩屋に、霧蜘蛛がいます。暁のかけらを抱えて……。わたしも一緒に行かせてください。' },
    { join: 'yui' },
    { say: 'yui', t: 'あとで、伊賀の里の母にも顔を見せてあげたいです。' }
  ];
  EV.yui_talk = EV.yui_rescue;
  EV.boss_kirigumo = [
    { say: null, t: '岩屋の天井から、白い糸がたれている。霧の奥で、大きな影が動いた。' },
    { say: 'e:kirigumo', t: 'シュル……光る石は、霧の衣にくるんで、ずっと夜にしておくの……' },
    { say: 'hayate', t: '霧の衣をまとうと、攻撃が当たりにくくなる。風の型で吹き飛ばせ！' },
    { battle: ['kirigumo'], boss: 1, bbg: 'cave', bgm: 'boss' },
    { say: 'e:kirigumo', t: 'シュル……まぶしい……' },
    { npc: 'boss', hide: 1 },
    { frag: 1 },
    { say: 'sakuya', t: 'ふたつめのかけら！ 霧が晴れていくよ！' },
    { set: 'ch2_clear' },
    { msg: '旅の地図に「雑賀の港」と「潮風の浜」がふえた。' },
    { save: 1 }
  ];
  // ---- 餡音と紫苑 ----
  EV.anne_talk = [
    { if: 'shion_back', go: 'join' },
    { if: 'anne_asked', go: 'again' },
    { say: 'anne', t: '餡音だよ〜！ 団子、ひとついかが？ ……って、それどころじゃないの。' },
    { say: 'anne', t: '紫苑がいなくなっちゃった。霧の山道で見かけた人がいるんだけど、あの子、人見知りで隠れちゃうから……' },
    { say: 'anne', t: '見つけたら、「餡音が団子を用意して待ってる」って伝えて！' },
    { set: 'anne_asked' }, { end: 1 },
    { lbl: 'again' }, { say: 'anne', t: '紫苑は、霧の山道の西のほうにいるらしいの。見えない道の先かも……' }, { end: 1 },
    { lbl: 'join' },
    { say: 'shion', t: '……ただいま。べつに、迷子だったわけじゃないし。' },
    { say: 'anne', t: 'おかえり〜！ はい、三色団子。半分こしよ！' },
    { say: 'anne', t: 'ねえ、紫苑。この人たちの旅、いっしょに行かない？ 団子の串で影縫い、見せてあげる！' },
    { say: 'shion', t: '……餡音が行くなら。……べつに、楽しみとかじゃないし。' },
    { join: 'anne' }, { join: 'shion' }
  ];
  EV.shion_village = EV.anne_talk;
  EV.shion_talk = [
    { say: 'shion', t: '……紫苑。……なに。' },
    { say: 'hero', t: '餡音が、団子を用意して待ってるよ。' },
    { say: 'shion', t: '……餡音が？ ……べつに、帰りたくなかったわけじゃないし。霧で道が分からなかっただけ。' },
    { say: 'shion', t: '……先に里へ戻ってる。' },
    { set: 'shion_back' }
  ];
  // ---- 酉花（花の種）----
  EV.torika_talk = [
    { if: 'item:hanatane', go: 'done' },
    { if: 'torika_asked', go: 'again' },
    { say: 'torika', t: '酉花だよっ！ 花、ちゃんと育ててる？ 夜が明けないと、花がしおれちゃうんだから！' },
    { say: 'torika', t: '霧の山にしか咲かない「霧花」の種がほしいの！ 北西の岩棚にあるはず！' },
    { set: 'torika_asked' }, { end: 1 },
    { lbl: 'again' }, { say: 'torika', t: '霧花の種は、霧の山道の北西だよっ！ 見えない道の先かも！' }, { end: 1 },
    { lbl: 'done' }, { take: 'hanatane' },
    { say: 'torika', t: 'これこれ！ ありがとっ！ 夜明けが来たら、いちばんに咲かせるんだから！' },
    { say: 'torika', t: '決めた、あたしも行く！ 毒手裏剣？ 花には使わないってば！' },
    { join: 'torika' }
  ];
  // ---- カルラ ----
  EV.karura_talk = [
    { if: 'ch2_clear', go: 'join' },
    { say: 'karura', t: '……カルラ。伊賀の山から、里を見張ってる。' },
    { say: 'karura', t: '霧蜘蛛がいるかぎり、この山の霧は晴れない。……倒せたら、考える。' }, { end: 1 },
    { lbl: 'join' },
    { say: 'karura', t: '……霧が晴れた。あなたたちのおかげ。' },
    { say: 'karura', t: '人の多いところは苦手だけど……空からなら、手伝える。' },
    { join: 'karura' }
  ];
  // ---- 金鬼（名工の玉鋼）----
  EV.kanaoni_talk = [
    { if: 'item:meikou', go: 'done' },
    { if: 'kanaoni_asked', go: 'again' },
    { say: 'kanaoni', t: '……鍛冶の音がしねぇだろ。いい鋼がねぇんだ。' },
    { say: 'kanaoni', t: '大蜘蛛の岩屋の奥に「名工の玉鋼」が眠ってるって話だ。持ってきたら、お前らの武器を鍛えてやる。' },
    { set: 'kanaoni_asked' }, { end: 1 },
    { lbl: 'again' }, { say: 'kanaoni', t: '名工の玉鋼は、大蜘蛛の岩屋の西の奥だ。' }, { end: 1 },
    { lbl: 'done' }, { take: 'meikou' },
    { say: 'kanaoni', t: 'こいつは……本物だ。いい鉄が打てりゃ、クランなんざ関係ねぇ。' },
    { say: 'kanaoni', t: '決めた。お前らの旅についていって、道中で武器を鍛えてやる。' },
    { join: 'kanaoni' },
    { msg: 'メニューの「鍛冶」で、玉鋼と両を使って武器を強くできるようになった！' }
  ];
  // ---- 石舟斎（腕試し）----
  EV.ss_talk = [
    { say: 'sekishusai', t: '石舟斎だ！ 剣の道も、里づくりも、基本が大事だ！' },
    { ask: '腕試しをしていくか？', who: 'sekishusai', opts: ['腕試しをする', 'またこんど'], go: ['fight', 'no'] },
    { lbl: 'fight' },
    { battle: ['d_sekishusai'], bbg: 'village', lose: 'continue', loseGo: 'lost' },
    { say: 'sekishusai', t: '見事！ 刀を持たずとも、争いは止められる。だが今は、夜を止めねばならん！' },
    { say: 'sekishusai', t: 'この石舟斎も、力を貸そう！' },
    { join: 'sekishusai' }, { end: 1 },
    { lbl: 'lost' }, { say: 'sekishusai', t: 'まだ構えが甘い！ 鍛えてまた来い！' }, { end: 1 },
    { lbl: 'no' }, { say: 'sekishusai', t: 'いつでも来い！' }
  ];

  // ======================= 第3章：雑賀・潮風の港 =======================
  EV.saika_enter = [
    { set: 'saika_entered' },
    { title: '第3章　潮風の港', sub: '雑賀の港' },
    { say: 'sakuya', t: '海のにおい！ ……でも、船がぜんぜん出てないね。' }
  ];
  EV.benten_talk = [
    { if: 'ch3_clear', go: 'after' },
    { say: 'benten', t: '弁天どす。雑賀の里を預かっとります。' },
    { say: 'benten', t: '海鳴りの洞に海坊主が出るようになって、船が出せませんのや。孫市はんの船も、沖で足止めどす。' },
    { say: 'benten', t: '洞は潮風の浜の東。せやけど、浜は濃い霧、洞の入口は大岩でふさがっとります。' },
    { say: 'benten', t: '浜で寝てばかりの風太と、花火好きの雛之丞……あの子らなら、なんとかしてくれるかもしれまへん。' },
    { set: 'benten_asked' }, { end: 1 },
    { lbl: 'after' },
    { if: 'has:benten', end: 1 },
    { say: 'benten', t: '海坊主を退治してくれはったんやね。ほんに、おおきに。' },
    { say: 'benten', t: '孫市はんが船を出すなら、うちも行きます。祝詞と三味線で、みなさんを支えますえ。' },
    { join: 'benten' }
  ];
  EV.fuuta_talk = [
    { say: null, t: '松の木の下で、男がのんびり寝ている。' },
    { ask: '起こす？', opts: ['起こす', 'そっとしておく'], go: ['wake', 'no'] },
    { lbl: 'wake' },
    { say: 'fuuta', t: 'ふあ〜あ……おう、風太だ。いい風が吹く浜だろ？ ……霧？ ああ、あれは邪魔だなぁ。' },
    { say: 'fuuta', t: '戦い？ いやいや、風遁で逃げるのがいちばんよ。……でもまあ、霧くらいなら吹き飛ばしてやるか。' },
    { say: 'fuuta', t: 'やるときは、やる男だぜ。ついていってやるよ。' },
    { join: 'fuuta' },
    { msg: '探索の術「風遁」が使えるようになった！ 霧の前で「調べる」と、吹き飛ばせる。' }, { end: 1 },
    { lbl: 'no' }, { say: null, t: '……すやすや。' }
  ];
  EV.hina_talk = [
    { say: 'hinanojoh', t: 'ピヨッ！ 雛之丞でござる！ 夜でも、拙者の花火なら空が明るくなるでござる！' },
    { if: 'benten_asked', go: 'ask' },
    { say: 'hinanojoh', t: '火のあつかいなら、任されよ！' }, { end: 1 },
    { lbl: 'ask' },
    { say: 'hinanojoh', t: '海鳴りの洞の大岩？ 焙烙玉なら、ひび割れた岩くらい、こっぱみじんでござる！' },
    { say: 'hinanojoh', t: '拙者もお供するでござる！' },
    { join: 'hinanojoh' },
    { msg: '探索の術「焙烙玉」が使えるようになった！ ひび割れた岩の前で「調べる」と、こわせる。' }
  ];
  EV.boss_umibozu = [
    { say: null, t: '洞の奥の海から、大きな黒い頭がぬうっと現れた。' },
    { say: 'e:umibozu', t: 'ざぶん……光る石は、海の底に沈めておく……夜の海は、しずかでよい……' },
    { say: 'fuuta', t: '大波が来るときは、ためが入る。崩して止めちまおうぜ！' },
    { battle: ['umibozu'], boss: 1, bbg: 'seacave', bgm: 'boss' },
    { say: 'e:umibozu', t: 'ざぶん……まぶしい……朝の海も、わるくないのかもしれん……' },
    { npc: 'boss', hide: 1 },
    { frag: 1 },
    { say: 'sakuya', t: '3つめ！ 空の色が、群青になってきたよ！' },
    { set: 'ch3_clear' },
    { msg: '港へ戻ろう。孫市の船が帰ってくるはずだ。' },
    { save: 1 }
  ];
  EV.magoichi_talk = [
    { say: 'magoichi', t: 'よう。孫市だ。海坊主を追っぱらったのは、お前たちか。' },
    { say: 'magoichi', t: '次は風魔の黒嶺へ行くんだろ？ 船なら出せる。……一発必中、狙ったものは外さねぇ。ついでに手も貸すさ。' },
    { join: 'magoichi' },
    { msg: '旅の地図に「黒嶺の山道」がふえた（孫市の船で渡れる）。' },
    { save: 1 }
  ];
  // ---- 柴（桟橋の見張り）----
  EV.shiba_talk = [
    { say: 'shiba', t: 'ワン！ 柴だワン。桟橋の見張りをしてるんだワン。' },
    { say: 'shiba', t: 'でも、夜になると河童が桟橋に上がってきて、困ってるんだワン……' },
    { ask: '河童を追いはらう？', opts: ['追いはらう', 'あとで'], go: ['fight', 'no'] },
    { lbl: 'fight' },
    { battle: ['kappa', 'kappa'], bbg: 'beach' },
    { say: 'shiba', t: 'やったワン！ いざとなったら人の姿で空手だワン。お礼に、ボクも旅のお供をするワン！' },
    { join: 'shiba' }, { end: 1 },
    { lbl: 'no' }, { say: 'shiba', t: 'ワン……いつでも待ってるワン。' }
  ];
  // ---- 凪紗（蔵の妖怪）----
  EV.nagisa_talk = [
    { say: 'nagisa', t: '凪紗です。……分身と、どっちが本物か当ててみて。' },
    { say: 'nagisa', t: '蔵に提灯お化けが住みついてしまって、掃除ができないの。手伝ってくれる？' },
    { ask: '蔵の妖怪を退治する？', opts: ['退治する', 'あとで'], go: ['fight', 'no'] },
    { lbl: 'fight' },
    { battle: ['chochin', 'chochin', 'kappa'], bbg: 'village' },
    { say: 'nagisa', t: '助かったわ。影分身は掃除にも便利だけど、戦いにはもっと便利よ。' },
    { say: 'nagisa', t: '雑賀の海の話は……また今度、旅のあいだにゆっくりね。' },
    { join: 'nagisa' }, { end: 1 },
    { lbl: 'no' }, { say: 'nagisa', t: '……分身たちと、待ってるわ。' }
  ];
  // ---- 猫又（焼き魚）----
  EV.nekomata_talk = [
    { if: 'item:yakizakana', go: 'done' },
    { if: 'nekomata_asked', go: 'again' },
    { say: 'nekomata', t: '猫又だにゃ。……おなかがすいて、刀がにぎれないにゃ。' },
    { say: 'nekomata', t: '焼き魚が食べたいにゃ。潮風の浜の漁師が、魚を持ってるって聞いたにゃ。' },
    { set: 'nekomata_asked' }, { end: 1 },
    { lbl: 'again' }, { say: 'nekomata', t: '焼き魚……こんがり……にゃ……' }, { end: 1 },
    { lbl: 'done' }, { take: 'yakizakana' },
    { say: 'nekomata', t: 'にゃ〜！ こんがりだにゃ！ ……ごちそうさまにゃ。' },
    { say: 'nekomata', t: '恩は返すにゃ。妖刀村正、お前たちのために振るうにゃ。' },
    { join: 'nekomata' }
  ];
  EV.fisher_talk = [
    { if: 'item:yakizakana', go: 'have' },
    { if: 'nekomata_asked&has:hinanojoh', go: 'cook' },
    { say: 'npc:漁師', t: '海坊主のせいで、沖に出られねぇ。浜でとれた小魚ならあるけどよ。' },
    { if: 'nekomata_asked', go: 'nofire' }, { end: 1 },
    { lbl: 'nofire' }, { say: 'npc:漁師', t: '焼き魚？ 焚き火の火種が湿っちまって、焼けねぇんだ。火が得意なやつでもいればなぁ。' }, { end: 1 },
    { lbl: 'cook' },
    { say: 'npc:漁師', t: '焼き魚？ 焚き火の火種が湿っちまって……' },
    { say: 'hinanojoh', t: 'ピヨッ！ 火なら拙者にお任せでござる！' },
    { say: null, t: '雛之丞の火で、魚がこんがり焼けた。' },
    { give: 'yakizakana' }, { end: 1 },
    { lbl: 'have' }, { say: 'npc:漁師', t: 'うまそうに焼けたな。だれかにあげるのか？' }
  ];
  // ---- イチヤ（手紙）----
  EV.ichiya_talk = [
    { if: 'letter_1&letter_2&letter_3', go: 'done' },
    { if: 'item:tegami', go: 'again' },
    { say: 'ichiya', t: '……イチヤ。伝令だよ。でも、手紙がたまって、運びきれない。' },
    { say: 'ichiya', t: '港の魚屋さんと、桟橋の船乗りさんと、東の灯台守のおばあさん。3通、届けてくれる？' },
    { give: 'tegami' }, { end: 1 },
    { lbl: 'again' }, { say: 'ichiya', t: '魚屋さん、船乗りさん、灯台守のおばあさん。よろしく。' }, { end: 1 },
    { lbl: 'done' }, { take: 'tegami' },
    { say: 'ichiya', t: '……ぜんぶ届いたんだ。ありがとう。' },
    { say: 'ichiya', t: '虹色の文字は、空を飛んで届く。旅のあいだ、みんなの知らせを運ぶよ。' },
    { join: 'ichiya' }
  ];
  function letter(n, who, line) {
    return [
      { if: 'letter_' + n, go: 'done' },
      { if: '!item:tegami', go: 'none' },
      { say: 'npc:' + who, t: line }, { set: 'letter_' + n },
      { if: 'letter_1&letter_2&letter_3', go: 'all' }, { end: 1 },
      { lbl: 'all' }, { msg: '手紙を3通、ぜんぶ届けた。イチヤに知らせよう。' }, { end: 1 },
      { lbl: 'done' }, { say: 'npc:' + who, t: '手紙をありがとうね。' }, { end: 1 },
      { lbl: 'none' }, { say: 'npc:' + who, t: n === 1 ? 'いらっしゃい！ 夜でも魚は売ってるよ。……ほとんど小魚だけどね。' : n === 2 ? '船が出せなくて、ひまでしかたねぇや。' : '灯台の火だけは、消さずにおるよ。' }
    ];
  }
  EV.letter_1 = letter(1, '魚屋', '伝令からの手紙？ ……娘からだ！ ありがとうよ！');
  EV.letter_2 = letter(2, '船乗り', '手紙？ おふくろからだ。……へへ、早く船を出して、帰ってやらねぇとな。');
  EV.letter_3 = letter(3, '灯台守のおばあさん', 'まあ、孫からの手紙。灯台の火を見て、元気をもらってるって。うれしいねぇ。');
  // ---- 瀬織 ----
  EV.seori_talk = [
    { say: 'seori', t: '瀬織だよ〜。こっちは相棒のミタマ。こわくないよ、ふふ。' },
    { say: 'seori', t: 'ミタマがね、あなたたちのこと気に入ったって。丑の刻参り？ 今は……ずっと夜だから、お仕事しほうだいだね〜' },
    { say: 'seori', t: '朝が来たら、ミタマとお昼寝したいな。だから、いっしょに行く〜' },
    { join: 'seori' }
  ];
  // ---- 久遠（3か所）----
  EV.quon_1 = [
    { say: 'quon', t: 'ほう、ここが噂の旅の者か。わしは久遠。……会うのは、はじめてじゃったかの？' },
    { say: 'quon', t: 'わしは「幸福な未来」をえらぶ。……また会えるかどうかも、未来しだいじゃ。' },
    { set: 'quon_1' }, { npc: 'quon', hide: 1 }
  ];
  EV.quon_2 = [
    { say: 'quon', t: 'また会ったの。浜の風は気持ちがよい。……ほれ、次は洞で会う未来が見えるぞ。' },
    { set: 'quon_2' }, { npc: 'quon', hide: 1 }
  ];
  EV.quon_3 = [
    { say: 'quon', t: 'ほっほ、3度目じゃ。3度会えたなら、これはもう縁というものじゃな。' },
    { say: 'quon', t: '猫又よりは年上じゃよ。いくつかは、ないしょじゃ。……わしも、よい方の未来へついていこう。' },
    { join: 'quon' }
  ];

  // ======================= 第4章：風魔・黒嶺の砦 =======================
  EV.kuromine_enter = [
    { set: 'kuromine_entered' },
    { title: '第4章　黒嶺の砦', sub: '風魔の山' },
    { say: 'sakuya', t: '風魔の山……。咲耶、ちょっとだけ、さがしてる人がいるんだ。' }
  ];
  EV.duel1 = [
    { say: 'rotten', t: 'うう〜……よそ者……帰れ……。風魔のかけらは……わたさない……' },
    { say: 'dan', t: 'ピピッ。侵入者、確認。排除スル。' },
    { say: 'sakuya', t: 'ちがうの、話を聞いて！' },
    { battle: ['d_rotten', 'd_dan'], bbg: 'darkmount' },
    { say: 'dan', t: 'ピ……想定以上ノ強サ。' },
    { say: 'rotten', t: 'つよい……。……アトザさまに、知らせなきゃ……砦で、待ってる……' },
    { npc: 'rotten', hide: 1 }, { npc: 'dan', hide: 1 },
    { set: 'ch4_duel1' }
  ];
  EV.karma_talk = [
    { say: 'karma', t: 'カルマだ。……その目、ちょっと見せてみな。' },
    { ask: '勝負する？', who: 'karma', opts: ['勝負する', 'やめておく'], go: ['fight', 'no'] },
    { lbl: 'fight' },
    { battle: ['d_karma'], bbg: 'darkmount', lose: 'continue', loseGo: 'lost' },
    { say: 'karma', t: '……悪くない腕だ。約束どおり、ひとつ言うこと聞いてやるよ。' },
    { say: 'karma', t: '仲間になれ？ ……ちっ。まあ、オレの瞳術、夜鴉にも見せてやるか。' },
    { join: 'karma' }, { end: 1 },
    { lbl: 'lost' }, { say: 'karma', t: 'ふん、まだまだだな。' }, { end: 1 },
    { lbl: 'no' }, { say: 'karma', t: '逃げるのか？ ……ま、いつでも来な。' }
  ];
  EV.janome_talk = [
    { if: 'orochi_found', go: 'done' },
    { say: 'janome', t: '蛇ノ目だ！ ……オロチ、白蛇のオロチを見なかったか？ 夜の山で、はぐれちまったんだ！' },
    { set: 'janome_asked' }, { end: 1 },
    { lbl: 'done' },
    { say: 'janome', t: 'オロチ！ よかった〜！ ……え、お前たちが見つけてくれたのか？' },
    { say: 'janome', t: 'かまないから安心しな！ よし、オレとオロチも一緒に行くぜ！' },
    { join: 'janome' }
  ];
  EV.orochi_found = [
    { say: null, t: '岩かげで、白い蛇が丸くなって震えている。' },
    { say: null, t: '近づくと、白蛇はするりと肩にのぼってきた。蛇ノ目のところへ連れていこう。' },
    { set: 'orochi_found' }, { npc: 'orochi', hide: 1 }
  ];
  EV.kohaku_duel = [
    { if: 'has:kohaku', end: 1 },
    { say: null, t: '狐の面をつけた忍が、行く手をさえぎった！' },
    { say: 'kohaku', t: '……ここから先は、通さない。' },
    { battle: ['d_kohaku'], bbg: 'fortress' },
    { say: null, t: '面のひもが切れて、狐面が落ちた。' },
    { say: 'sakuya', t: '……狐白……？ やっぱり、狐白だ！' },
    { say: 'kohaku', t: '……咲耶。……大きくなったな。' },
    { say: 'sakuya', t: 'ずっと会いたかったんだよ！ どうして風魔に……ううん、今はいいや。' },
    { say: 'kohaku', t: '……アトザ様が、かけらを守っている。でも、かけらから声がするんだ。「夜のままでいろ」と。' },
    { say: 'kohaku', t: '……あれは、ふつうのかけらじゃない。咲耶、一緒に行く。' },
    { join: 'kohaku' },
    { set: 'kohaku_ok' }
  ];
  EV.aum_talk = [
    { say: 'aum', t: 'アウンだ！ 兄貴に会いに来たのか？ 兄貴はこわく見えるけど、やさしいんだぜ！' }
  ];
  EV.ibuki_talk = [
    { if: 'yama_found', go: 'done' },
    { say: 'ibuki', t: 'イブキです。……式神のヤーマが、いなくなってしまって。小さいけど、閻魔さまなんですよ。' },
    { say: 'ibuki', t: '砦のどこかで、迷子になっていると思うんです。' },
    { set: 'ibuki_asked' }, { end: 1 },
    { lbl: 'done' },
    { say: 'ibuki', t: 'ヤーマ！ ……見つけてくださって、ありがとうございます。' },
    { say: 'ibuki', t: 'ぼくがまだ未熟だから、ヤーマもかわいい姿なんです。……旅で、もっと強くなりたい。一緒に行かせてください。' },
    { join: 'ibuki' }
  ];
  EV.yama_found = [
    { say: null, t: '小さな式神が、すみっこで丸くなっている。' },
    { say: 'e:yama', t: 'ヤ、ヤーマ……！（イブキのところへ帰りたいらしい）' },
    { set: 'yama_found' }, { npc: 'yama', hide: 1 }
  ];
  EV.boss_atoza = [
    { say: 'atoza', t: '……アトザだ。甲賀と伊賀の忍が、かけらを奪いに来たか。' },
    { say: 'kohaku', t: 'アトザ様、ちがいます！ この人たちは、夜明けを取り戻すために……！' },
    { say: 'atoza', t: '……ならば、腕で見せてみろ。かけらを託せる者かどうかをな。' },
    { battle: ['d_atoza'], boss: 1, bbg: 'fortress', bgm: 'boss' },
    { say: 'atoza', t: '……いい腕だ。お前たちなら、かけらを悪いことには使わんだろう。' },
    { say: null, t: 'そのとき、アトザが守っていたかけらが、黒くにごった。' },
    { shake: 0.6 }, { sfx: 'bossWarn' },
    { say: 'e:yogarasu_kage', t: 'カァ……カァ……。夜を返せ……。このかけらは、夜のもの……' },
    { say: 'atoza', t: '……こいつが、かけらにひそんでいた声の主か。……手を貸すぞ！' },
    { battle: ['yogarasu_kage'], boss: 1, guests: ['atoza'], guestLv: 26, bbg: 'fortress', bgm: 'boss' },
    { say: 'e:yogarasu_kage', t: 'カァ……おぼえておけ……根の国で、待つ……' },
    { npc: 'atoza', hide: 1 }, { npc: 'aum', hide: 1 },
    { frag: 1 },
    { say: 'atoza', t: '……風魔は、夜鴉にだまされていたわけだ。わびに、この腕を貸そう。' },
    { join: 'atoza' },
    { say: 'aum', t: '兄貴が行くなら、オレも行くぜ！ 巨人の一撃、見せてやる！' },
    { join: 'aum' },
    { say: 'rotten', t: 'うう〜……アトザさまが行くなら……ぼくも……' },
    { say: 'dan', t: 'ピピッ。同行ヲ、希望スル。' },
    { join: 'rotten' }, { join: 'dan' },
    { set: 'ch4_clear' },
    { msg: '旅の地図に「天の社」がふえた。' },
    { save: 1 }
  ];

  // ======================= 終章：天の社・根の国 =======================
  EV.ten_enter = [
    { set: 'ten_entered' },
    { title: '終章　夜明けへ', sub: '天の社' },
    { say: 'sakuya', t: '雲の上だ……！ あれが、割れた暁の鐘……' }
  ];
  EV.sattva_talk = [
    { say: 'sattva', t: '……よく来ましたね。わたしはサットヴァ。この社で、鐘を見守っていました。' },
    { say: 'sattva', t: 'かけらは4つ。最後のひとつは、夜鴉が根の国へ持ち去りました。' },
    { say: 'sattva', t: '急がなくていいのです。……けれど、夜が長すぎると、みなの心も冷えてしまう。わたしも参りましょう。' },
    { join: 'sattva' },
    { set: 'sattva_met' },
    { say: null, t: '鐘のうしろから、手裏剣をもてあそぶ音がした。' }
  ];
  EV.jin_talk = [
    { say: 'jin', t: '……気配を消していたのに、よく気づいたな。名乗るほどの者ではない。刃、とだけ覚えておけ。' },
    { say: 'jin', t: '夜鴉は、おれが昔、取り逃がした妖怪だ。……決着をつけに来た。' },
    { say: 'jin', t: '根の国への階段を開こう。おれも行く。' },
    { join: 'jin' },
    { set: 'ne_open' },
    { msg: '社の西に、根の国への階段が開いた。' }, { save: 1 }
  ];
  EV.sasagane_talk = [
    { say: 'sasagane', t: 'ふふ……ササガネと申します。根の国から、灯りに誘われて。' },
    { say: 'sasagane', t: 'あなたたちの灯り、ほんにきれいやわぁ。夜鴉の巣まで、道案内をいたしましょ。' },
    { say: 'sasagane', t: '奥の扉は、左右の封印の石を解かないと開きません。……糸をたぐれば、縁もつながるもの。' },
    { join: 'sasagane' }
  ];
  EV.ne_seal_l = [
    { say: null, t: '封印の石だ。影の大将が守っている！' },
    { battle: ['kagetaisho', 'yamikoro'], bbg: 'under' },
    { say: null, t: '封印の石の光が消えた。' },
    { set: 'ne_seal_l' }, { npc: 'sealL', hide: 1 },
    { if: 'ne_seal_r', go: 'both' }, { end: 1 },
    { lbl: 'both' }, { msg: '奥の扉が開いた！' }
  ];
  EV.ne_seal_r = [
    { say: null, t: '封印の石だ。妖怪たちが集まってくる！' },
    { battle: ['yomichochin', 'karasu_ko', 'honegasa'], bbg: 'under' },
    { say: null, t: '封印の石の光が消えた。' },
    { set: 'ne_seal_r' }, { npc: 'sealR', hide: 1 },
    { if: 'ne_seal_l', go: 'both' }, { end: 1 },
    { lbl: 'both' }, { msg: '奥の扉が開いた！' }
  ];
  EV.boss_final = [
    { say: 'e:yogarasu', t: 'カァ……来たか、暁の子ら。' },
    { say: 'e:yogarasu', t: '夜はよい。妖怪も、さびしい者も、だれも見とがめられぬ。……なぜ、朝を呼ぶ？' },
    { say: 'sakuya', t: '朝が来たら、みんなで団子を食べて、昼寝して、また夜を待つの！ 夜も朝も、どっちも大事なんだよ！' },
    { say: 'jin', t: '……長い夜は、もう終わりだ。' },
    { battle: ['yogarasu'], boss: 1, bbg: 'under', bgm: 'final' },
    { say: 'e:yogarasu2', t: 'カ……ァ……。まぶしい……。……朝の空も、たまには……見てみるか……' },
    { npc: 'boss', hide: 1 },
    { frag: 1 },
    { set: 'ch5_clear' },
    { fade: 'out' },
    { warp: 'ten', x: 14, y: 8, dir: 'up' },
    { set: 'dawn' },
    { fade: 'in' },
    { say: 'sattva', t: '5つのかけらが、そろいましたね。' },
    { say: null, t: '割れていた暁の鐘が、光につつまれて、ひとつになっていく――' },
    { sfx: 'bell' }, { flash: '#fff4c8' },
    { say: null, t: 'ゴーン……ゴーン……。鐘の音が、雲の下まで響いていく。' },
    { say: 'sakuya', t: '見て！ 空が……朝だ！' },
    { say: 'kohaku', t: '……ああ。きれいだな、咲耶。' },
    { say: 'jin', t: '……悪くない夜明けだ。' },
    { ending: 1 },
    { set: 'ending' },
    { warp: 'koka', x: 14, y: 10, dir: 'down' },
    { save: 1 }
  ];
  EV.ending_village = [
    { set: 'ending_seen' },
    { say: 'npc:里の人', t: '朝だ！ 朝が来たぞ！ ありがとう、夜明け隊！' },
    { say: null, t: '物語はここでおしまい。まだ会っていない仲間をさがしたり、妖怪図鑑をうめたりして、続きを遊べます。' }
  ];

  // ======================= 店・宿 =======================
  ['koka', 'iga', 'saika', 'fuma', 'ten'].forEach(function (t) {
    EV['shop_' + t] = [{ shop: t }];
    EV['inn_' + t] = [{ inn: t }];
  });

  // 仲間帳のヒント（data_chars.js の hint を使う。物語で加わる仲間はここ）
  var STORY_HINT = {
    sakuya: '序章で仲間になる', oen: '狐火の森で、妖怪に追われている子を助ける', xiaolan: '狐火の森の大岩の前で、パンダを連れた子が困っている',
    hayate: '霧の山道の入口で、鷹匠が待っている', yui: '霧の山道で、ひとりで妖怪と戦っている', fuuta: '潮風の浜の松の下で、だれかが寝ている',
    hinanojoh: '潮風の浜で、花火の練習をしている', magoichi: '海坊主を退治すると、港に船が帰ってくる', benten: '海坊主を退治したあと、雑賀の港の館で',
    kohaku: '風魔の砦で、狐の面の忍が待ちかまえている', atoza: '風魔の砦の奥で', aum: '風魔の砦の奥で', rotten: '黒嶺の山道で道をふさいでいる', dan: '黒嶺の山道で道をふさいでいる',
    sattva: '天の社で、鐘を見守っている', jin: '天の社のどこかに、気配を消した忍がいる', sasagane: '根の国の入口で'
  };
  var CHAPTERS = [
    { flag: null, name: '序章　明けない夜' }, { flag: 'forest_entered', name: '第1章　狐火の森' }, { flag: 'iga_entered', name: '第2章　霧の山' },
    { flag: 'saika_entered', name: '第3章　潮風の港' }, { flag: 'kuromine_entered', name: '第4章　黒嶺の砦' }, { flag: 'ten_entered', name: '終章　夜明けへ' }, { flag: 'ending', name: 'クリア後' }
  ];

  var api = { EVENTS: EV, STORY_HINT: STORY_HINT, CHAPTERS: CHAPTERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_STORY = api;
})(typeof window !== 'undefined' ? window : globalThis);
